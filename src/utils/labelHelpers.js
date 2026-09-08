/**
 * Pure helpers for app-wide label management.
 *
 * Kept side-effect free (no DOM, no store, no fetch) so they can be unit tested
 * under the node vitest environment and reused by the LabelEditDialog. The hex
 * pattern mirrors the OpenRegister `label` schema's authoritative
 * `^#[0-9A-Fa-f]{6}$` colour constraint.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */

/** Default label colour, matching the schema default. */
export const DEFAULT_LABEL_COLOR = '#4376FC'

/** Six-digit hex colour pattern (schema contract). */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/**
 * Whether a value is a valid 6-digit hex colour (e.g. #4376FC).
 *
 * @param {string} color The candidate colour string.
 * @return {boolean} True when the value matches the schema hex pattern.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
export function isValidHexColor(color) {
	return typeof color === 'string' && HEX_COLOR_PATTERN.test(color)
}

/**
 * Whether a label title is present (non-empty after trimming).
 *
 * @param {string} title The candidate title.
 * @return {boolean} True when the title is non-empty.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
export function isValidLabelTitle(title) {
	return typeof title === 'string' && title.trim() !== ''
}

/**
 * Validate a label draft, returning a map of field → error key (empty when valid).
 *
 * @param {object} draft The label draft ({ title, color }).
 * @return {{title?: string, color?: string}} Validation errors keyed by field.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
export function validateLabelDraft(draft) {
	const errors = {}
	if (!isValidLabelTitle(draft?.title)) {
		errors.title = 'Title is required'
	}
	if (!isValidHexColor(draft?.color)) {
		errors.color = 'Color must be a 6-digit hex code (e.g. #4376FC)'
	}
	return errors
}

/**
 * Normalise a label draft into the payload sent to OpenRegister: title and
 * description trimmed, colour defaulted when blank.
 *
 * @param {object} draft The raw form draft ({ title, color, description }).
 * @return {{title: string, color: string, description: string}} The normalised payload.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
export function normaliseLabelPayload(draft) {
	return {
		title: (draft?.title || '').trim(),
		color: draft?.color || DEFAULT_LABEL_COLOR,
		description: (draft?.description || '').trim(),
	}
}

/**
 * The canonical id of a label object.
 *
 * OpenRegister hands the same object back under three different id shapes
 * depending on the read path (`id`, `uuid`, or `@self.id`), and a task's
 * `labels` array holds whichever one the writer stored. Resolving all three
 * here keeps every caller from having to know that.
 *
 * @param {object} label The label object.
 * @return {string} The label id, or an empty string when none is resolvable.
 *
 * @spec openspec/specs/admin-user-settings.md
 */
export function labelId(label) {
	return String(label?.id ?? label?.uuid ?? label?.['@self']?.id ?? '')
}

/**
 * Labels sorted by title, case-insensitively, so the board filter and the
 * admin list present the same order.
 *
 * @param {Array<object>} labels The labels to sort.
 * @return {Array<object>} A new, sorted array.
 *
 * @spec openspec/specs/admin-user-settings.md
 */
export function sortLabelsByTitle(labels) {
	if (!Array.isArray(labels)) {
		return []
	}
	return [...labels].sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' }))
}

/**
 * Resolve a task's label UUIDs into the label objects the board knows about.
 *
 * A task stores references, never copies, which is what makes a rename or a
 * recolor propagate without a single task write. It also means a UUID can
 * outlive the label it points at: a label deleted while the board is open
 * leaves a dangling id, and rendering a chip for it would produce a nameless,
 * colourless card. Unknown ids are dropped rather than rendered.
 *
 * @param {object}        task   The task whose `labels` array is resolved.
 * @param {Array<object>} labels The labels currently known to the board.
 * @return {Array<object>} The label objects this task carries, in title order.
 *
 * @spec openspec/specs/kanban-board.md
 */
export function resolveTaskLabels(task, labels) {
	const ids = Array.isArray(task?.labels) ? task.labels : []
	if (ids.length === 0 || !Array.isArray(labels) || labels.length === 0) {
		return []
	}
	const known = new Map(labels.map((label) => [labelId(label), label]))
	const seen = new Set()
	const resolved = []
	for (const id of ids) {
		const key = String(id ?? '')
		const label = known.get(key)
		if (label !== undefined && !seen.has(key)) {
			seen.add(key)
			resolved.push(label)
		}
	}
	return sortLabelsByTitle(resolved)
}

/**
 * Whether a task carries a given label.
 *
 * @param {object} task The task to test.
 * @param {string} id   The label id to look for.
 * @return {boolean} True when the task's `labels` array holds the id.
 *
 * @spec openspec/specs/kanban-board.md
 */
export function taskHasLabel(task, id) {
	if (!id || !Array.isArray(task?.labels)) {
		return false
	}
	return task.labels.some((entry) => String(entry ?? '') === String(id))
}

/**
 * Apply the board's label filter to a task collection.
 *
 * An empty filter (`null`, `undefined` or an empty string) means "all labels"
 * and returns the collection unchanged, so the caller needs no branch of its
 * own for the unfiltered board.
 *
 * @param {Array<object>} tasks The tasks to filter.
 * @param {string|null}   id    The active label id, or a falsy value for all.
 * @return {Array<object>} The tasks carrying the label.
 *
 * @spec openspec/specs/kanban-board.md
 */
export function filterTasksByLabel(tasks, id) {
	const list = Array.isArray(tasks) ? tasks : []
	if (!id) {
		return list
	}
	return list.filter((task) => taskHasLabel(task, id))
}
