/**
 * Pure helpers for task derived UI state.
 *
 * @spec openspec/changes/task-due-date-warning/specs/tasks/spec.md
 */

/**
 * Task statuses that count as "resolved" — a blocker in one of these states
 * no longer blocks anything. Mirrors DependencyService::RESOLVED_STATUSES.
 *
 * @type {string[]}
 */
export const RESOLVED_BLOCKER_STATUSES = ['done', 'cancelled']

/**
 * OpenRegister register slug owning the Planninq schemas.
 *
 * The VALUE moved from `planix` to `planninq` together with the
 * MigrateRegisterSlug repair step, which renames the register ROW. OpenRegister
 * resolves a register by slug and by nothing else, so the literal and the row
 * move in the same release or neither resolves.
 *
 * @type {string}
 */
export const PLANNINQ_REGISTER = 'planninq'

/**
 * Generic CnObjectSidebar tabs that must stay hidden on the task detail
 * collaboration sidebar — Planninq has its own label and sub-task concepts, so
 * the library's generic `tags` / `tasks` tabs would confuse.
 *
 * @type {string[]}
 */
export const TASK_SIDEBAR_HIDDEN_TABS = ['tags', 'tasks']

/**
 * Build the props for the task detail collaboration sidebar (CnObjectSidebar).
 *
 * Pure derived state so the wiring (correct register/schema/objectId, hidden
 * generic tabs, legacy hardcoded-tabs mode) can be unit-tested without mounting
 * the component. The sidebar surfaces the built-in Comments (notes), Files, and
 * Audit Trail tabs over OpenRegister per-object APIs (ADR-022) — there is no
 * Planninq pass-through controller.
 *
 * @param {object} task A task object carrying at least an `id` (UUID).
 * @return {object} Props to spread onto CnObjectSidebar.
 *
 * @spec openspec/specs/task-collaboration.md
 */
export function taskCollaborationSidebarConfig(task) {
	return {
		objectId: (task && task.id) ? String(task.id) : '',
		register: PLANNINQ_REGISTER,
		schema: 'task',
		// `{registerSlug}-{schemaSlug}`, so it tracks the register slug above:
		// it becomes `planninq-task` now that the register itself is re-slugged.
		objectType: 'planninq-task',
		useRegistry: false,
		hiddenTabs: TASK_SIDEBAR_HIDDEN_TABS,
	}
}

/**
 * Build a UUID → status map from a list of task objects.
 *
 * Accepts either flat tasks (`{ id, status }`) or OR-shaped tasks
 * (`{ '@self': { id }, status }`); the first resolvable id wins.
 *
 * @param {Array<object>} tasks The loaded task collection.
 * @return {{[uuid: string]: string}} Map of task UUID → status string.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
export function statusMapFromTasks(tasks = []) {
	const map = {}
	for (const task of tasks || []) {
		if (!task) {
			continue
		}
		const id = task.id || task['@self']?.id
		if (id) {
			map[id] = task.status
		}
	}
	return map
}

/**
 * Decide whether a single task is blocked, given the project's dependency
 * edges and a UUID → status map of all tasks.
 *
 * A task is blocked when at least one edge names it as `blocked` whose
 * `blocker` task resolves in `statusById` and is NOT in a resolved
 * (`done`/`cancelled`) status. Edges whose blocker UUID does not resolve are
 * ignored (tolerant reads — covers out-of-band deletes). Derivation never
 * loops: it inspects each edge once, so any cyclic artifact terminates.
 *
 * @param {string} taskId             UUID of the task to test.
 * @param {Array<object>} edges       Dependency edges (`{ blocker, blocked }`).
 * @param {{[uuid: string]: string}} statusById Map of task UUID → status.
 * @return {boolean} True when the task has at least one open blocker.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
export function isBlocked(taskId, edges = [], statusById = {}) {
	if (!taskId) {
		return false
	}
	for (const edge of edges || []) {
		if (!edge || edge.blocked !== taskId) {
			continue
		}
		const blockerId = edge.blocker
		// Tolerant read: ignore an edge whose blocker no longer resolves.
		if (!blockerId || !Object.hasOwn(statusById, blockerId)) {
			continue
		}
		if (!RESOLVED_BLOCKER_STATUSES.includes(statusById[blockerId])) {
			return true
		}
	}
	return false
}

/**
 * Derive the set of blocked task UUIDs for a whole board in one pass.
 *
 * @param {Array<object>} edges       Dependency edges.
 * @param {{[uuid: string]: string}} statusById Map of task UUID → status.
 * @return {string[]} Sorted, de-duplicated UUIDs of blocked tasks.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
export function deriveBlockedTaskIds(edges = [], statusById = {}) {
	const blocked = new Set()
	for (const edge of edges || []) {
		if (!edge || !edge.blocker || !edge.blocked) {
			continue
		}
		if (!Object.hasOwn(statusById, edge.blocker)) {
			continue
		}
		if (!RESOLVED_BLOCKER_STATUSES.includes(statusById[edge.blocker])) {
			blocked.add(edge.blocked)
		}
	}
	return Array.from(blocked).sort()
}

/**
 * List the open blockers of a task — used by the task-detail blocked banner.
 *
 * @param {string} taskId             UUID of the blocked task.
 * @param {Array<object>} edges       Dependency edges.
 * @param {{[uuid: string]: string}} statusById Map of task UUID → status.
 * @return {string[]} UUIDs of the blockers that are still open.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
export function openBlockerIds(taskId, edges = [], statusById = {}) {
	const open = []
	for (const edge of edges || []) {
		if (!edge || edge.blocked !== taskId || !edge.blocker) {
			continue
		}
		const status = statusById[edge.blocker]
		if (status !== undefined && !RESOLVED_BLOCKER_STATUSES.includes(status)) {
			open.push(edge.blocker)
		}
	}
	return open
}

/**
 * Candidate tasks for the dependency picker: same-project tasks excluding the
 * task itself. Pure so the exclusion rule is unit-testable.
 *
 * @param {object} currentTask         The task the picker is opened from (`{ id, project }`).
 * @param {Array<object>} projectTasks All tasks of the same project.
 * @return {Array<object>} The pickable tasks.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
export function dependencyPickerCandidates(currentTask, projectTasks = []) {
	if (!currentTask) {
		return []
	}
	const selfId = currentTask.id || currentTask['@self']?.id
	const project = currentTask.project
	return (projectTasks || []).filter((task) => {
		if (!task) {
			return false
		}
		const id = task.id || task['@self']?.id
		if (id === selfId) {
			return false
		}
		return task.project === project
	})
}

/**
 * Classify a task's due date for badge rendering.
 *
 * Compares the task's `dueDate` against today (date-only — time is ignored).
 *
 * @param {object} task                The task object — must expose `dueDate`.
 * @param {string|Date|null|undefined} task.dueDate ISO-8601 string, Date, or absent.
 * @param {Date} [now]      Optional clock injection for testability.
 * @return {null|'approaching'|'overdue'}
 *         - `null`         when there is no due date.
 *         - `'approaching'` when the due date is today or within the next 2 days.
 *         - `'overdue'`    when the due date is strictly in the past.
 */
export function dueDateStatus(task, now = new Date()) {
	if (task === null || task === undefined) {
		return null
	}
	const raw = task.dueDate
	if (raw === null || raw === undefined || raw === '') {
		return null
	}

	const due = raw instanceof Date ? raw : new Date(raw)
	if (Number.isNaN(due.getTime())) {
		return null
	}

	// Date-only comparison: drop time component on both sides.
	const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

	const msPerDay = 24 * 60 * 60 * 1000
	const diffDays = Math.round((dueDay.getTime() - today.getTime()) / msPerDay)

	if (diffDays < 0) {
		return 'overdue'
	}
	if (diffDays <= 2) {
		return 'approaching'
	}
	return null
}

/**
 * The kanban board's columns, in display order. One lane per task `status`
 * value (the task schema's status enum is the single source of truth for the
 * board lanes).
 *
 * @type {string[]}
 */
export const BOARD_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled']

/**
 * Group a flat list of tasks into the board's status columns.
 *
 * Every column key in `statuses` is always present in the result so empty
 * columns render gracefully. A task whose `status` is not a known column falls
 * back to the first column (`open` by default), so an out-of-band / legacy
 * status never silently drops a card off the board.
 *
 * @param {Array<object>} tasks        The project's tasks.
 * @param {string[]} [statuses]        Ordered status column keys.
 * @return {{[status: string]: Array<object>}} Map of status → tasks in that column.
 *
 * @spec openspec/specs/kanban-board.md
 */
export function groupTasksByStatus(tasks = [], statuses = BOARD_STATUSES) {
	const fallback = statuses[0]
	const grouped = {}
	for (const status of statuses) {
		grouped[status] = []
	}
	for (const task of tasks || []) {
		if (!task) {
			continue
		}
		const status = grouped[task.status] ? task.status : fallback
		grouped[status].push(task)
	}
	return grouped
}
