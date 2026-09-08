import { buildHeaders } from '@conduction/nextcloud-vue'
import { getCurrentUser } from '@nextcloud/auth'
import { showError, showWarning } from '@nextcloud/dialogs'
import { loadState } from '@nextcloud/initial-state'
import { translate as t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
/**
 * Projects Pinia store.
 *
 * Uses the shared @conduction/nextcloud-vue objectStore for all OpenRegister
 * CRUD operations. Provides project-specific helpers on top.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-6
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-7
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-8
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-9
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
 */
import { defineStore } from 'pinia'
import { useObjectStore } from './objectStore.js'

// The OpenRegister register SLUG, not the app id. It moved from `planix` to
// `planninq` together with the MigrateRegisterSlug repair step, which renames
// the register ROW: OR resolves a register by slug and by nothing else, so the
// literal and the row move in the same release or neither resolves.
const REGISTER = 'planninq'
const PROJECT_SCHEMA = 'project'
const COLUMN_SCHEMA = 'column'
const TASK_SCHEMA = 'task'
const TIME_ENTRY_SCHEMA = 'plannedTimeEntry'
const LABEL_SCHEMA = 'label'

/**
 * Largest page OpenRegister will return. Asking for more is silently capped.
 *
 * The underscore prefix is required: OpenRegister reads an unprefixed `limit`
 * as a property filter, which matches nothing and returns an empty collection.
 */
const MAX_PAGE = 1000

/**
 * Read an ENTIRE collection, following pages until it is exhausted.
 *
 * OpenRegister pages at 20 by default and caps a page at 1000, and this store
 * reads whole collections for three purposes that are all wrong when truncated:
 * rendering a board, COUNTING, and cascade-DELETING. A 21-task project rendered
 * 20 tasks and reported "20" as its total; worse, deleting it removed one page
 * of tasks and left the rest as orphans, while every call reported success.
 *
 * Raising the page size alone does not fix it — the largest project on our own
 * instance holds 2,015 tasks, so a single `_limit=1000` read still silently
 * dropped half of it. Only following `_page` to exhaustion is correct.
 *
 * @param {object} objectStore the shared OpenRegister object store
 * @param {string} schema      schema slug to read
 * @param {object} filters     property filters (no control params)
 * @return {Promise<Array>} every row in the collection
 */
async function fetchEvery(objectStore, schema, filters = {}) {
	const out = []
	const seen = new Set()
	for (let page = 1; ; page++) {
		const batch = await objectStore.fetchCollection(schema, { ...filters, _limit: MAX_PAGE, _page: page })
		const rows = Array.isArray(batch) ? batch : []

		// Keep only rows we have not already collected. This is also the
		// termination guard: a server that ignored `_page` would hand back the
		// same full batch forever, and a `rows.length < MAX_PAGE` check alone
		// would loop until the tab died. Zero NEW rows means there is no more
		// collection to read, whatever the server thinks it is doing.
		let added = 0
		for (const row of rows) {
			const id = row?.id ?? row?.uuid ?? row?.['@self']?.id
			if (id !== undefined && seen.has(id)) {
				continue
			}
			if (id !== undefined) {
				seen.add(id)
			}
			out.push(row)
			added++
		}

		if (added === 0 || rows.length < MAX_PAGE) {
			break
		}
	}
	return out
}

/**
 * Default columns created for every new project.
 *
 * @return {Array} Column definitions
 */
function getDefaultColumns() {
	try {
		const state = loadState('planninq', 'default_columns', null)
		if (Array.isArray(state) && state.length > 0) {
			return state
		}
	} catch {
		// fall through to hardcoded defaults
	}
	return [
		{ title: 'To Do', order: 0, wipLimit: null, type: 'active' },
		{ title: 'In Progress', order: 1, wipLimit: 3, type: 'active' },
		{ title: 'Review', order: 2, wipLimit: 2, type: 'active' },
		{ title: 'Done', order: 3, wipLimit: null, type: 'done' },
	]
}

export const useProjectsStore = defineStore('projects', {
	state: () => ({
		/** @type {Array} */ projects: [],
		/** @type {object|null} */ activeProject: null,
		/** @type {object|null} */ activeTask: null,
		/** @type {boolean} */ loading: false,
		/** @type {string|null} */ error: null,
	}),

	actions: {
		// ── Internal helpers ──────────────────────────────────────────────

		/**
		 * @spec exclude Internal helper — lazily registers Planninq schemas on the shared object store and returns it.
		 */
		_objectStore() {
			const store = useObjectStore()
			// Register types if not yet registered. The schema constants ARE the
			// canonical OR slugs (lib/Settings/planninq_register.json), so they are
			// passed as slug hints too — liveUpdatesPlugin then derives the
			// or-collection-{registerSlug}-{schemaSlug} event key without a lazy
			// register/schema fetch on first subscribe().
			if (!store.objectTypeRegistry?.[PROJECT_SCHEMA]) {
				store.registerObjectType(PROJECT_SCHEMA, PROJECT_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: PROJECT_SCHEMA })
			}
			if (!store.objectTypeRegistry?.[COLUMN_SCHEMA]) {
				store.registerObjectType(COLUMN_SCHEMA, COLUMN_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: COLUMN_SCHEMA })
			}
			if (!store.objectTypeRegistry?.[TASK_SCHEMA]) {
				store.registerObjectType(TASK_SCHEMA, TASK_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: TASK_SCHEMA })
			}
			if (!store.objectTypeRegistry?.[TIME_ENTRY_SCHEMA]) {
				store.registerObjectType(TIME_ENTRY_SCHEMA, TIME_ENTRY_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: TIME_ENTRY_SCHEMA })
			}
			if (!store.objectTypeRegistry?.[LABEL_SCHEMA]) {
				store.registerObjectType(LABEL_SCHEMA, LABEL_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: LABEL_SCHEMA })
			}
			return store
		},

		/**
		 * @spec exclude Auth passthrough — returns the current user's UID.
		 */
		_currentUid() {
			return getCurrentUser()?.uid || ''
		},

		// ── 2.2 fetchProjects ─────────────────────────────────────────────

		/**
		 * Fetch projects the current user is a member of.
		 *
		 * @param {object} filters Additional filters (e.g. { status: 'active' })
		 * @return {Promise<Array>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-6
		 */
		async fetchProjects(filters = {}) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				const uid = this._currentUid()

				// Fetch all projects; client-side filter below keeps only member projects.
				// Note: server-side `members[]` array filter uses PostgreSQL jsonb syntax
				// which is incompatible with MariaDB — do not pass it as a query param.
				//
				// `_limit` is what makes "fetch all" true. OpenRegister pages at 20 by
				// default, and filtering for membership CLIENT-SIDE over a SERVER-PAGED
				// result is only correct when the page holds everything: on an instance
				// with 31 projects the user's own board simply stopped appearing in the
				// list, with no error and no empty state — it was on page two, and page
				// two was never requested. The bug scales with the instance, so it shows
				// up first for whoever has the most data.
				//
				// The underscore is not cosmetic: OpenRegister treats an unprefixed
				// `limit` as a PROPERTY filter, which matches nothing and returns an
				// empty collection — the same silent disappearance, one layer down.
				const results = await fetchEvery(objectStore, PROJECT_SCHEMA, filters)

				// Client-side guard: ensure only member projects are shown.
				this.projects = uid
					? results.filter((p) => Array.isArray(p.members) && p.members.includes(uid))
					: results

				return this.projects
			} catch (err) {
				const status = err.response?.status ?? err.status
				const message = err.response?.data?.message ?? err.message ?? 'fetch-error'
				this.error = message
				console.error('fetchProjects error:', { status, message, err })
				return []
			} finally {
				this.loading = false
			}
		},

		/**
		 * Apply a live-refetched project collection to store state, re-applying
		 * the same member filter `fetchProjects` uses. Called by the ProjectList
		 * live-update bridge when liveUpdatesPlugin refreshes the 'project'
		 * collection after an or-collection event.
		 *
		 * @param {Array} results Fresh collection results from the object store
		 * @return {Array} The filtered project list now in state
		 *
		 * @spec openspec/specs/realtime-updates.md
		 */
		applyLiveProjects(results) {
			const uid = this._currentUid()
			const list = Array.isArray(results) ? results : []
			this.projects = uid
				? list.filter((p) => Array.isArray(p.members) && p.members.includes(uid))
				: list
			return this.projects
		},

		// ── 2.3 fetchProject ──────────────────────────────────────────────

		/**
		 * Fetch a single project by ID.
		 * Sets error='forbidden' and redirects on 403.
		 *
		 * @param {string} id Project ID
		 * @return {Promise<object|null>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-6
		 */
		async fetchProject(id) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				const project = await objectStore.fetchObject(PROJECT_SCHEMA, id)
				if (!project) {
					// Check for a 403 error stored by the objectStore.
					const storeError = objectStore.getError(PROJECT_SCHEMA)
					if (storeError?.status === 403 || storeError?.statusCode === 403) {
						this.error = 'forbidden'
					} else {
						this.error = 'not-found'
					}
					this.activeProject = null
					return null
				}
				this.activeProject = project
				return project
			} catch (err) {
				this.error = err.message || 'fetch-error'
				console.error('fetchProject error:', err)
				return null
			} finally {
				this.loading = false
			}
		},

		// ── 2.3b fetchTask ────────────────────────────────────────────────

		/**
		 * Fetch a single task by ID and store it on `activeTask`.
		 *
		 * Used by the task detail view (TaskDetail.vue) to render the task and
		 * mount the collaboration sidebar (comments / files / audit trail). Reads
		 * directly from OpenRegister via the shared object store (ADR-022) — no
		 * Planninq pass-through controller.
		 *
		 * @param {string} id Task UUID
		 * @return {Promise<object|null>} The task, or null on error / not found.
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		async fetchTask(id) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				const task = await objectStore.fetchObject(TASK_SCHEMA, id)
				if (!task) {
					const storeError = objectStore.getError(TASK_SCHEMA)
					this.error = (storeError?.status === 403 || storeError?.statusCode === 403)
						? 'forbidden'
						: 'not-found'
					this.activeTask = null
					return null
				}
				this.activeTask = task
				return task
			} catch (err) {
				this.error = err.message || 'fetch-error'
				console.error('fetchTask error:', err)
				return null
			} finally {
				this.loading = false
			}
		},

		// ── 2.4 createProject ─────────────────────────────────────────────

		/**
		 * Create a new project via the Planninq server-side proxy endpoint.
		 *
		 * Posts to `/api/projects` (ProjectController::create) which enforces
		 * the `allow_project_creation` policy server-side BEFORE writing to OR,
		 * closing the TOCTOU gap where a caller could bypass the policy by
		 * posting directly to OR's generic object API (C1 fix).
		 *
		 * Owner and initial membership are set server-side; any values passed
		 * here for those fields are overridden by the controller.
		 *
		 * @param {object} data Project fields (title required)
		 * @return {Promise<object>} Created project
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-6
		 */
		async createProject(data) {
			this.loading = true
			this.error = null
			try {
				const url = generateUrl('/apps/planninq/api/projects')
				const response = await fetch(url, {
					method: 'POST',
					headers: buildHeaders(),
					body: JSON.stringify({
						...data,
						status: data.status || 'active',
					}),
				})

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}))
					const message = errorData?.error || 'create-error'
					this.error = message
					throw new Error(message)
				}

				const project = await response.json()

				this.projects = [...this.projects, project]

				// Create default columns (non-blocking).
				await this.createDefaultColumns(project.id)

				return project
			} catch (err) {
				this.error = err.message || 'create-error'
				throw err
			} finally {
				this.loading = false
			}
		},

		// ── 2.5 updateProject ─────────────────────────────────────────────

		/**
		 * Update an existing project (full PUT via OR object store).
		 *
		 * Used for owner-initiated updates where ALL fields are provided.
		 * For partial/single-field updates (e.g. members-only changes) use
		 * patchProject() instead to avoid OR's PUT fill-missing-with-null
		 * semantics wiping fields like `owner` (C2 fix).
		 *
		 * @param {string} id Project ID
		 * @param {object} data Updated fields
		 * @return {Promise<object|null>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-7
		 */
		async updateProject(id, data) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				const updated = await objectStore.saveObject(PROJECT_SCHEMA, { id, ...data })
				if (!updated) {
					const err = objectStore.getError(PROJECT_SCHEMA)
					this.error = err?.message || 'update-error'
					return null
				}

				// Update in local arrays.
				this.projects = this.projects.map((p) => (p.id === id ? { ...p, ...updated } : p))
				if (this.activeProject?.id === id) {
					this.activeProject = { ...this.activeProject, ...updated }
				}

				return updated
			} catch (err) {
				this.error = err.message || 'update-error'
				return null
			} finally {
				this.loading = false
			}
		},

		// ── 2.5b patchProject ────────────────────────────────────────────

		/**
		 * Partially update a project via OR's PATCH endpoint.
		 *
		 * OR PATCH merges the supplied fields with the existing object rather
		 * than replacing it (unlike PUT which fills missing schema properties
		 * with null). Use this for member-only or other single-field changes
		 * to avoid silently wiping `owner` and other required fields (C2 fix).
		 *
		 * @param {string} id Project ID
		 * @param {object} partial Only the fields to change
		 * @return {Promise<object|null>}
		 *
		 * @spec openspec/specs/projects.md
		 */
		async patchProject(id, partial) {
			this.loading = true
			this.error = null
			try {
				const url = generateUrl(`/apps/openregister/api/objects/planninq/project/${id}`)
				const response = await fetch(url, {
					method: 'PATCH',
					headers: buildHeaders(),
					body: JSON.stringify(partial),
				})

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}))
					this.error = errorData?.message || 'patch-error'
					return null
				}

				const updated = await response.json()

				// Update local arrays.
				this.projects = this.projects.map((p) => (p.id === id ? { ...p, ...updated } : p))
				if (this.activeProject?.id === id) {
					this.activeProject = { ...this.activeProject, ...updated }
				}

				return updated
			} catch (err) {
				this.error = err.message || 'patch-error'
				return null
			} finally {
				this.loading = false
			}
		},

		// ── 2.6 createDefaultColumns ──────────────────────────────────────

		/**
		 * Create default columns for a newly-created project.
		 * Partial failures show a warning toast but do not throw.
		 *
		 * @param {string} projectId Parent project ID
		 * @return {Promise<{created: number, failed: number}>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-8
		 */
		async createDefaultColumns(projectId) {
			const objectStore = this._objectStore()
			const columns = getDefaultColumns()
			let created = 0
			const failedTitles = []

			for (const col of columns) {
				const result = await objectStore.saveObject(COLUMN_SCHEMA, {
					...col,
					project: projectId,
				})
				if (result) {
					created++
				} else {
					failedTitles.push(col.title)
				}
			}

			if (failedTitles.length > 0) {
				showWarning(t('planninq', 'Some columns could not be created: {columns}', {
					columns: failedTitles.join(', '),
				}))
			}

			return { created, failed: failedTitles.length }
		},

		// ── 2.7 archiveProject ────────────────────────────────────────────

		/**
		 * Archive a project by setting status to 'archived'.
		 *
		 * @param {string} id Project ID
		 * @return {Promise<object|null>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-6
		 */
		async archiveProject(id) {
			// Use PATCH (not PUT) so only `status` is changed server-side.
			// OR's PUT semantics fill every missing schema property with null,
			// which would wipe `owner` and make the project permanently
			// uneditable by the owner (H1 / same root cause as C2).
			const updated = await this.patchProject(id, { status: 'archived' })
			if (updated) {
				// Remove from the active list (default filter excludes archived).
				this.projects = this.projects.filter((p) => p.id !== id)
			}
			return updated
		},

		// ── 2.8 deleteProject ─────────────────────────────────────────────

		/**
		 * Cascade-delete a project and all dependent objects.
		 * Order: timeEntries → tasks → columns → project.
		 *
		 * @param {string} id Project ID
		 * @return {Promise<boolean>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-9
		 */
		async deleteProject(id) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()

				// 1. Fetch tasks for this project.
				const tasks = await fetchEvery(objectStore, TASK_SCHEMA, { project: id })

				// 2. Fetch and delete time entries for each task.
				// NOTE: deletion is sequential and non-transactional. A mid-flight failure
				// (network drop, server error) will leave orphaned objects. The error messages
				// below prompt the user to retry, which will pick up where deletion failed.
				for (const task of tasks) {
					const entries = await fetchEvery(objectStore, TIME_ENTRY_SCHEMA, { task: task.id })
					for (const entry of entries) {
						const ok = await objectStore.deleteObject(TIME_ENTRY_SCHEMA, entry.id)
						if (!ok) {
							showError(t('planninq', 'Failed to delete a time entry. Some data may remain — please retry deleting the project.'))
							return false
						}
					}
				}

				// 3. Delete tasks.
				for (const task of tasks) {
					const ok = await objectStore.deleteObject(TASK_SCHEMA, task.id)
					if (!ok) {
						showError(t('planninq', 'Failed to delete a task. Some data may remain — please retry deleting the project.'))
						return false
					}
				}

				// 4. Fetch and delete columns.
				const columns = await fetchEvery(objectStore, COLUMN_SCHEMA, { project: id })
				for (const col of columns) {
					const ok = await objectStore.deleteObject(COLUMN_SCHEMA, col.id)
					if (!ok) {
						showError(t('planninq', 'Failed to delete a column. Some data may remain — please retry deleting the project.'))
						return false
					}
				}

				// 5. Delete the project itself.
				const ok = await objectStore.deleteObject(PROJECT_SCHEMA, id)
				if (!ok) {
					showError(t('planninq', 'Failed to delete project. Please retry.'))
					return false
				}

				this.projects = this.projects.filter((p) => p.id !== id)
				if (this.activeProject?.id === id) {
					this.activeProject = null
				}

				return true
			} catch (err) {
				this.error = err.message || 'delete-error'
				showError(t('planninq', 'An error occurred during project deletion'))
				return false
			} finally {
				this.loading = false
			}
		},

		// ── 2.9 addMember ─────────────────────────────────────────────────

		/**
		 * Add a Nextcloud user as a project member.
		 *
		 * Uses PATCH (not PUT) so that only `members` is changed server-side.
		 * OR's PUT semantics fill every missing schema property with null,
		 * which would wipe `owner` and make the project uneditable (C2 fix).
		 *
		 * @param {string} projectId Project ID
		 * @param {string} userUid Nextcloud UID to add
		 * @return {Promise<object|null>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async addMember(projectId, userUid) {
			const project = await this.fetchProject(projectId)
			if (!project) {
				return null
			}

			const members = Array.isArray(project.members) ? [...project.members] : []
			if (members.includes(userUid)) { // Guard against duplicates.
				return project
			}

			members.push(userUid)
			return this.patchProject(projectId, { members })
		},

		// ── 2.10 getMemberTaskCount ───────────────────────────────────────

		/**
		 * Return the number of tasks currently assigned to a member in a project.
		 * Pure read — no side effects.
		 *
		 * @param {string} projectId Project ID
		 * @param {string} userUid Nextcloud UID to query
		 * @return {Promise<number>} Count of tasks assigned to that member
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async getMemberTaskCount(projectId, userUid) {
			try {
				const objectStore = this._objectStore()
				const tasks = await fetchEvery(objectStore, TASK_SCHEMA, {
					project: projectId,
					assignedTo: userUid,
				})
				return tasks.length
			} catch {
				return 0
			}
		},

		// ── 2.11 removeMember ─────────────────────────────────────────────

		/**
		 * Remove a member from a project (owner removing another member).
		 *
		 * Pure write — does NOT query or return task counts.
		 * Call getMemberTaskCount first if a warning is needed.
		 *
		 * Uses PATCH (not PUT) so that only `members` is changed server-side,
		 * avoiding OR's PUT fill-missing-with-null behaviour that would wipe
		 * `owner` and make the project permanently uneditable (C2 fix).
		 *
		 * For the current user removing themselves, use leaveProject() instead,
		 * which routes through a server-side proxy that bypasses the owner-match
		 * RBAC rule (C3 fix).
		 *
		 * @param {string} projectId Project ID
		 * @param {string} userUid Nextcloud UID to remove
		 * @return {Promise<object|null>} Updated project or null on failure
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async removeMember(projectId, userUid) {
			const project = await this.fetchProject(projectId)
			if (!project) {
				return null
			}

			const members = (Array.isArray(project.members) ? project.members : []).filter((uid) => uid !== userUid)

			// Refuse to leave a project with no remaining members — an orphaned
			// project is inaccessible and unrecoverable without admin intervention.
			if (members.length === 0) {
				throw new Error('Cannot remove the last member from a project')
			}

			return this.patchProject(projectId, { members })
		},

		// ── 2.12 leaveProject ────────────────────────────────────────────

		/**
		 * Current user leaves a project via the Planninq server-side proxy (C3 fix).
		 *
		 * Non-owner members cannot update a project through OR's normal write
		 * path because OR RBAC requires `match: { owner: "$userId" }` for updates.
		 * The `/api/projects/{id}/leave` endpoint validates membership and performs
		 * the update with `_rbac: false` (OR's server-trust escape hatch), so only
		 * the `members` array is changed and no other fields are affected.
		 *
		 * The caller is responsible for confirming last-member situations before
		 * calling this action (the server will also reject it with 422).
		 *
		 * @param {string} projectId Project ID
		 * @return {Promise<object|null>} Updated project or null on failure
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async leaveProject(projectId) {
			this.loading = true
			this.error = null
			try {
				const url = generateUrl(`/apps/planninq/api/projects/${projectId}/leave`)
				const response = await fetch(url, {
					method: 'POST',
					headers: buildHeaders(),
				})

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}))
					this.error = errorData?.error || 'leave-error'
					return null
				}

				const updated = await response.json()

				// Remove from local project list (user is no longer a member).
				this.projects = this.projects.filter((p) => p.id !== projectId)
				if (this.activeProject?.id === projectId) {
					this.activeProject = null
				}

				return updated
			} catch (err) {
				this.error = err.message || 'leave-error'
				return null
			} finally {
				this.loading = false
			}
		},

		/**
		 * Get task count for a project (used by delete dialog).
		 *
		 * @param {string} projectId Project ID
		 * @return {Promise<number>}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-9
		 */
		async getTaskCount(projectId) {
			try {
				const objectStore = this._objectStore()
				const tasks = await fetchEvery(objectStore, TASK_SCHEMA, { project: projectId })
				return tasks.length
			} catch {
				return 0
			}
		},

		// ── 2.13 fetchTasks ───────────────────────────────────────────────

		/**
		 * Fetch all tasks of a project for the kanban board.
		 *
		 * Reads directly from OpenRegister via the shared object store (ADR-022) —
		 * there is no Planninq pass-through controller. OpenRegister scopes the read
		 * to objects the current user may see, so the board only ever shows tasks
		 * of a project the user is a member of (the board view additionally guards
		 * non-member access via `accessDenied`).
		 *
		 * @param {string} projectId Parent project UUID
		 * @return {Promise<Array>} The project's tasks (empty array on error)
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async fetchTasks(projectId) {
			try {
				const objectStore = this._objectStore()
				const tasks = await fetchEvery(objectStore, TASK_SCHEMA, { project: projectId })
				return Array.isArray(tasks) ? tasks : []
			} catch (err) {
				console.error('fetchTasks error:', err)
				return []
			}
		},

		// ── 2.13b fetchLabels ─────────────────────────────────────────────

		/**
		 * Fetch every app-wide label, for the board's card chips and its label
		 * filter.
		 *
		 * Reads the `label` schema straight from OpenRegister (ADR-022), NOT the
		 * `/apps/planninq/api/labels` admin endpoint the labels store uses: that
		 * one aggregates usage counts and answers 403 to anyone who is not an
		 * admin, so a board built on it would show no chips at all to the
		 * ordinary project members the board exists for. The schema's own
		 * authorization grants `read` to every authenticated user.
		 *
		 * Labels are app-wide, not per project, so this takes no filter — a task
		 * may reference any of them.
		 *
		 * @return {Promise<Array>} Every label object (empty array on error)
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async fetchLabels() {
			try {
				const objectStore = this._objectStore()
				const labels = await fetchEvery(objectStore, LABEL_SCHEMA)
				return Array.isArray(labels) ? labels : []
			} catch (err) {
				console.error('fetchLabels error:', err)
				return []
			}
		},

		// ── 2.14 updateTaskStatus ─────────────────────────────────────────

		/**
		 * Move a task to a new status column on the board.
		 *
		 * Uses PATCH (not PUT) so only `status` is changed: OpenRegister's PUT
		 * fills every missing schema property with null, which would wipe
		 * `title`, `project`, and other required fields (same root cause as the
		 * project C2 fix). OpenRegister enforces per-object RBAC on the write, so
		 * a user can only move tasks of a project they are a member of — there is
		 * no app-level `@NoAdminRequired` endpoint to bypass (ADR-005).
		 *
		 * @param {string} taskId Task UUID
		 * @param {string} status New status (one of the task schema's status enum)
		 * @return {Promise<object|null>} The updated task, or null on failure
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async updateTaskStatus(taskId, status) {
			try {
				const url = generateUrl(`/apps/openregister/api/objects/planninq/task/${taskId}`)
				const response = await fetch(url, {
					method: 'PATCH',
					headers: buildHeaders(),
					body: JSON.stringify({ status }),
				})
				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}))
					this.error = errorData?.message || 'task-status-error'
					return null
				}
				return await response.json()
			} catch (err) {
				this.error = err.message || 'task-status-error'
				console.error('updateTaskStatus error:', err)
				return null
			}
		},

		// ── 2.15 updateTask ────────────────────────────────────────────────

		/**
		 * Patch arbitrary task fields (e.g. `estimatedDuration`).
		 *
		 * Uses PATCH (not PUT) for the same reason as `updateTaskStatus`:
		 * OpenRegister's PUT nulls every unsupplied schema property, wiping
		 * required fields. OR enforces per-object RBAC on the write.
		 *
		 * @param {string} taskId Task UUID
		 * @param {object} patch  Fields to change
		 * @return {Promise<object|null>} The updated task, or null on failure
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async updateTask(taskId, patch) {
			try {
				const url = generateUrl(`/apps/openregister/api/objects/planninq/task/${taskId}`)
				const response = await fetch(url, {
					method: 'PATCH',
					headers: buildHeaders(),
					body: JSON.stringify(patch),
				})
				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}))
					this.error = errorData?.message || 'task-update-error'
					return null
				}
				return await response.json()
			} catch (err) {
				this.error = err.message || 'task-update-error'
				console.error('updateTask error:', err)
				return null
			}
		},
	},
})
