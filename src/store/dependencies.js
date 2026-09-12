import { buildHeaders } from '@conduction/nextcloud-vue'
import { generateUrl } from '@nextcloud/router'
/**
 * Dependencies Pinia store.
 *
 * Reads dependency edges straight from the OpenRegister object API (ADR-022),
 * and routes create/delete through the Planninq endpoints so the server-side
 * cycle/self/duplicate/cross-project validation runs. The blocked-state
 * derivation itself lives in the pure helpers in utils/taskHelpers.js.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
import { defineStore } from 'pinia'

// The OpenRegister register SLUG, not the app id. It moved from `planix` to
// `planninq` together with the MigrateRegisterSlug repair step, which renames
// the register ROW: OR resolves a register by slug and by nothing else, so the
// literal and the row move in the same release or neither resolves.
const REGISTER = 'planninq'
const DEPENDENCY_SCHEMA = 'dependency'

export const useDependenciesStore = defineStore('dependencies', {
	state: () => ({
		/** @type {Array<object>} Dependency edges currently loaded. */
		edges: [],
		/** @type {boolean} */ loading: false,
		/** @type {string|null} Last validation/error message surfaced to the UI. */
		error: null,
	}),

	actions: {
		/**
		 * Fetch all dependency edges from OpenRegister and store them.
		 *
		 * Reads use the OR API directly per ADR-022. Each edge is normalised to
		 * a flat `{ id, blocker, blocked }` shape regardless of OR envelope.
		 *
		 * @return {Promise<Array<object>>} The loaded edges.
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		async fetchEdges() {
			this.loading = true
			this.error = null
			try {
				const url = generateUrl(`/apps/openregister/api/objects/${REGISTER}/${DEPENDENCY_SCHEMA}`)
				const response = await fetch(url, { headers: buildHeaders() })
				if (!response.ok) {
					this.edges = []
					return []
				}
				const data = await response.json()
				const rows = data.results || data
				this.edges = (Array.isArray(rows) ? rows : []).map((row) => ({
					id: row.id || row['@self']?.id,
					blocker: row.blocker,
					blocked: row.blocked,
				}))
				return this.edges
			} catch {
				this.edges = []
				return []
			} finally {
				this.loading = false
			}
		},

		/**
		 * Create a dependency edge through the Planninq validation endpoint.
		 *
		 * On a 4xx the server's explanatory message (cycle path, duplicate,
		 * cross-project, self) is stored in `error` and re-thrown so the caller
		 * can show it inline.
		 *
		 * @param {string} blocker UUID of the blocking task.
		 * @param {string} blocked UUID of the blocked task.
		 * @return {Promise<object>} The created edge.
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		async createEdge(blocker, blocked) {
			this.error = null
			const url = generateUrl('/apps/planninq/api/dependencies')
			const response = await fetch(url, {
				method: 'POST',
				headers: buildHeaders(),
				body: JSON.stringify({ blocker, blocked }),
			})
			if (!response.ok) {
				const body = await response.json().catch(() => ({}))
				this.error = body?.error || 'Failed to create dependency.'
				throw new Error(this.error)
			}
			const edge = await response.json()
			const normalised = {
				id: edge.id || edge['@self']?.id,
				blocker: edge.blocker ?? blocker,
				blocked: edge.blocked ?? blocked,
			}
			this.edges = [...this.edges, normalised]
			return normalised
		},

		/**
		 * Delete a dependency edge through the Planninq endpoint.
		 *
		 * @param {string} id UUID of the edge to remove.
		 * @return {Promise<void>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		async deleteEdge(id) {
			this.error = null
			const url = generateUrl(`/apps/planninq/api/dependencies/${id}`)
			const response = await fetch(url, {
				method: 'DELETE',
				headers: buildHeaders(),
			})
			if (!response.ok) {
				const body = await response.json().catch(() => ({}))
				this.error = body?.error || 'Failed to delete dependency.'
				throw new Error(this.error)
			}
			this.edges = this.edges.filter((edge) => edge.id !== id)
		},
	},
})
