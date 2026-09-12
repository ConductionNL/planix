/**
 * Timeline layout helpers — pure, side-effect-free functions that turn a
 * project's scheduled tasks and existing dependency links into positioned Gantt
 * bars and dependency arrows.
 *
 * Kept out of the ProjectTimeline.vue component so the layout maths (day-index
 * parsing, bar positioning, and — the spec-critical part — sourcing dependency
 * arrows ONLY from existing links between rendered bars) can be unit-tested in
 * the node vitest environment without mounting a component. Nothing here reads
 * the DOM, mutates input, or creates a dependency; it renders what already
 * exists.
 *
 * @spec openspec/changes/gantt-timeline-view/specs/gantt-timeline-view/spec.md
 */

/** Milliseconds in a whole UTC day. */
export const MS_PER_DAY = 86400000

/** Bar geometry (px). */
export const BAR_HEIGHT = 28
export const ROW_GAP = 8

/** Pixels per day for each zoom level. */
export const PX_PER_DAY = { day: 44, week: 18, month: 6 }

/** Task status → CSS colour (falls back to `open`). */
export const STATUS_COLORS = {
	open: 'var(--color-primary-element-light, #cfe0ff)',
	in_progress: 'var(--color-primary-element, #4376FC)',
	blocked: 'var(--color-error, #e9322d)',
	done: 'var(--color-success, #2fb344)',
	cancelled: 'var(--color-text-maxcontrast, #767676)',
}

/**
 * Resolve a status string to its bar colour.
 *
 * @param {string} status The task status.
 * @return {string} A CSS colour value.
 *
 * @spec exclude Trivial map lookup — status → CSS colour.
 */
export function statusColor(status) {
	return STATUS_COLORS[status] || STATUS_COLORS.open
}

/**
 * Parse an ISO date string to a whole-day index (days since the UNIX epoch).
 *
 * @param {string|null} value ISO date string.
 * @return {number|null} Day index, or null when unparseable/empty.
 *
 * @spec exclude Pure date-parsing helper.
 */
export function parseDay(value) {
	if (!value || typeof value !== 'string') {
		return null
	}
	const ms = Date.parse(value)
	if (Number.isNaN(ms)) {
		return null
	}
	return Math.floor(ms / MS_PER_DAY)
}

/**
 * Resolve each task's start/end to day indices, dropping any task with no
 * parseable date. Order is preserved (it becomes the bar row order).
 *
 * @param {Array<object>} tasks Scheduled task rows ({startDate, dueDate, …}).
 * @return {Array<object>} Tasks augmented with numeric startDay/endDay.
 *
 * @spec openspec/changes/gantt-timeline-view/specs/gantt-timeline-view/spec.md#requirement-a-projects-tasks-can-be-viewed-on-a-time-axis
 */
export function toScheduled(tasks = []) {
	return (Array.isArray(tasks) ? tasks : [])
		.map((task) => {
			const start = parseDay(task.startDate || task.dueDate)
			const end = parseDay(task.dueDate || task.startDate)
			if (start === null || end === null) {
				return null
			}
			return { ...task, startDay: Math.min(start, end), endDay: Math.max(start, end) }
		})
		.filter((task) => task !== null)
}

/**
 * Build the full timeline layout: positioned bars, dependency arrow lines, and
 * the chart dimensions, from scheduled tasks + the existing dependency edges.
 *
 * A dependency arrow is emitted ONLY when both its blocker and blocked tasks
 * are present as rendered bars — the timeline draws existing links, it never
 * fabricates one. Edges are keyed by their stored id.
 *
 * @param {Array<object>} scheduled Tasks from {@link toScheduled} (with startDay/endDay).
 * @param {Array<object>} dependencies Stored edges ({id, blocker, blocked}).
 * @param {number} pxPerDay Pixels per day for the active zoom.
 * @return {{bars: Array<object>, edgeLines: Array<object>, minDay: number, maxDay: number, dayCount: number, chartWidth: number, barsHeight: number}}
 *
 * @spec openspec/changes/gantt-timeline-view/specs/gantt-timeline-view/spec.md#requirement-the-timeline-renders-the-existing-dependency-links-not-a-new-copy
 */
export function buildLayout(scheduled = [], dependencies = [], pxPerDay = PX_PER_DAY.day) {
	const rows = Array.isArray(scheduled) ? scheduled : []
	const empty = rows.length === 0

	const minDay = empty ? 0 : rows.reduce((min, t) => Math.min(min, t.startDay), Infinity)
	const maxDay = empty ? 0 : rows.reduce((max, t) => Math.max(max, t.endDay), -Infinity)
	const dayCount = Math.max(1, maxDay - minDay + 1)

	const bars = rows.map((task, row) => ({
		id: task.id,
		title: task.title || '',
		status: task.status || '',
		left: (task.startDay - minDay) * pxPerDay,
		width: Math.max(pxPerDay, (task.endDay - task.startDay + 1) * pxPerDay),
		top: ROW_GAP + row * (BAR_HEIGHT + ROW_GAP),
		color: statusColor(task.status),
	}))

	const barById = {}
	bars.forEach((bar) => {
		barById[bar.id] = bar
	})

	const edgeLines = []
	;(Array.isArray(dependencies) ? dependencies : []).forEach((edge, i) => {
		const from = barById[edge.blocker]
		const to = barById[edge.blocked]
		if (!from || !to) {
			return
		}
		edgeLines.push({
			key: edge.id || `edge-${i}`,
			x1: from.left + from.width,
			y1: from.top + BAR_HEIGHT / 2,
			x2: to.left,
			y2: to.top + BAR_HEIGHT / 2,
		})
	})

	return {
		bars,
		edgeLines,
		minDay,
		maxDay,
		dayCount,
		chartWidth: dayCount * pxPerDay,
		barsHeight: Math.max(1, rows.length) * (BAR_HEIGHT + ROW_GAP) + ROW_GAP,
	}
}
