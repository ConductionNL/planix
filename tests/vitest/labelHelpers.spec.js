/**
 * Vitest unit tests for the label-management pure helpers.
 *
 * Covers the hex-colour validation (matching the schema's 6-digit pattern),
 * the required-title check, the combined draft validation (empty title, bad
 * hex), and payload normalisation (trim + colour default).
 *
 * Also covers the board-side helpers behind the task-card label chip and the
 * board label filter: resolving a task's label UUIDs into label objects (which
 * is what makes a rename or a recolor propagate with no task write), and
 * filtering the board's tasks down to one label.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
import { describe, expect, it } from 'vitest'
import {
	DEFAULT_LABEL_COLOR,
	filterTasksByLabel,
	isValidHexColor,
	isValidLabelTitle,
	labelId,
	normaliseLabelPayload,
	resolveTaskLabels,
	sortLabelsByTitle,
	taskHasLabel,
	validateLabelDraft,
} from '../../src/utils/labelHelpers.js'

describe('isValidHexColor', () => {
	it('accepts a 6-digit hex colour', () => {
		expect(isValidHexColor('#4376FC')).toBe(true)
		expect(isValidHexColor('#abcdef')).toBe(true)
	})

	it('rejects non-6-digit / malformed values', () => {
		expect(isValidHexColor('#FFF')).toBe(false)
		expect(isValidHexColor('4376FC')).toBe(false)
		expect(isValidHexColor('#GGGGGG')).toBe(false)
		expect(isValidHexColor('')).toBe(false)
		expect(isValidHexColor(null)).toBe(false)
	})
})

describe('isValidLabelTitle', () => {
	it('requires a non-empty trimmed title', () => {
		expect(isValidLabelTitle('Bug')).toBe(true)
		expect(isValidLabelTitle('   ')).toBe(false)
		expect(isValidLabelTitle('')).toBe(false)
		expect(isValidLabelTitle(undefined)).toBe(false)
	})
})

describe('validateLabelDraft', () => {
	it('returns no errors for a valid draft', () => {
		expect(validateLabelDraft({ title: 'Bug', color: '#E74C3C' })).toEqual({})
	})

	it('flags an empty title', () => {
		const errors = validateLabelDraft({ title: '', color: '#E74C3C' })
		expect(errors.title).toBeTruthy()
		expect(errors.color).toBeUndefined()
	})

	it('flags an invalid hex colour', () => {
		const errors = validateLabelDraft({ title: 'Bug', color: 'red' })
		expect(errors.color).toBeTruthy()
		expect(errors.title).toBeUndefined()
	})

	it('flags both when both are invalid', () => {
		const errors = validateLabelDraft({ title: '', color: 'nope' })
		expect(errors.title).toBeTruthy()
		expect(errors.color).toBeTruthy()
	})
})

describe('normaliseLabelPayload', () => {
	it('trims title and description and keeps the colour', () => {
		expect(normaliseLabelPayload({
			title: '  Bug  ',
			color: '#E74C3C',
			description: '  x ',
		})).toEqual({ title: 'Bug', color: '#E74C3C', description: 'x' })
	})

	it('defaults a blank colour to the schema default', () => {
		expect(normaliseLabelPayload({ title: 'Bug' }).color).toBe(DEFAULT_LABEL_COLOR)
	})

	it('handles a null draft without throwing', () => {
		expect(normaliseLabelPayload(null)).toEqual({
			title: '',
			color: DEFAULT_LABEL_COLOR,
			description: '',
		})
	})
})

describe('labelId', () => {
	it('reads the three id shapes OpenRegister returns', () => {
		expect(labelId({ id: 'a' })).toBe('a')
		expect(labelId({ uuid: 'b' })).toBe('b')
		expect(labelId({ '@self': { id: 'c' } })).toBe('c')
	})

	it('returns an empty string when no id is resolvable', () => {
		expect(labelId({})).toBe('')
		expect(labelId(null)).toBe('')
	})
})

describe('sortLabelsByTitle', () => {
	it('sorts by title, case-insensitively, without mutating the input', () => {
		const labels = [{ title: 'zeta' }, { title: 'Alpha' }, { title: 'beta' }]
		const sorted = sortLabelsByTitle(labels)
		expect(sorted.map((l) => l.title)).toEqual(['Alpha', 'beta', 'zeta'])
		expect(labels.map((l) => l.title)).toEqual(['zeta', 'Alpha', 'beta'])
	})

	it('tolerates a missing collection and missing titles', () => {
		expect(sortLabelsByTitle(null)).toEqual([])
		expect(sortLabelsByTitle([{}, { title: 'Bug' }])).toHaveLength(2)
	})
})

describe('resolveTaskLabels', () => {
	const bug = { id: 'bug-uuid', title: 'Bug', color: '#E74C3C' }
	const debt = { id: 'debt-uuid', title: 'Tech debt', color: '#33AA55' }

	it('resolves a task’s label UUIDs into the label objects', () => {
		const task = { labels: ['debt-uuid', 'bug-uuid'] }
		expect(resolveTaskLabels(task, [bug, debt])).toEqual([bug, debt])
	})

	// The whole point of storing a REFERENCE: renaming and recolouring the
	// label object changes what the card renders, with no task write at all.
	// The task below is byte-identical before and after.
	it('follows a rename and a recolor without the task changing', () => {
		const task = { labels: ['bug-uuid'] }
		expect(resolveTaskLabels(task, [bug])[0]).toMatchObject({ title: 'Bug', color: '#E74C3C' })

		const renamed = { id: 'bug-uuid', title: 'Defect', color: '#FF8800' }
		expect(resolveTaskLabels(task, [renamed])[0]).toMatchObject({ title: 'Defect', color: '#FF8800' })
		expect(task).toEqual({ labels: ['bug-uuid'] })
	})

	// A cascade delete sweeps the task rows server-side, but a board that was
	// already open still holds the old task objects. Rendering a chip for a
	// label that no longer exists would put a nameless, colourless chip on the
	// card, so the dangling id is dropped instead.
	it('drops an id no label answers to', () => {
		expect(resolveTaskLabels({ labels: ['deleted-uuid'] }, [bug])).toEqual([])
	})

	it('de-duplicates a repeated id and handles an absent labels array', () => {
		expect(resolveTaskLabels({ labels: ['bug-uuid', 'bug-uuid'] }, [bug])).toEqual([bug])
		expect(resolveTaskLabels({}, [bug])).toEqual([])
		expect(resolveTaskLabels(null, [bug])).toEqual([])
		expect(resolveTaskLabels({ labels: ['bug-uuid'] }, [])).toEqual([])
	})
})

describe('taskHasLabel', () => {
	it('is true only for a label the task carries', () => {
		const task = { labels: ['bug-uuid'] }
		expect(taskHasLabel(task, 'bug-uuid')).toBe(true)
		expect(taskHasLabel(task, 'debt-uuid')).toBe(false)
		expect(taskHasLabel(task, '')).toBe(false)
		expect(taskHasLabel({}, 'bug-uuid')).toBe(false)
	})
})

describe('filterTasksByLabel', () => {
	const tagged = { id: 't1', title: 'Fix login', labels: ['bug-uuid'] }
	const other = { id: 't2', title: 'Write docs', labels: ['debt-uuid'] }
	const bare = { id: 't3', title: 'Plan sprint' }
	const tasks = [tagged, other, bare]

	it('keeps only the tasks carrying the label', () => {
		expect(filterTasksByLabel(tasks, 'bug-uuid')).toEqual([tagged])
	})

	it('returns every task when no label is selected', () => {
		expect(filterTasksByLabel(tasks, null)).toEqual(tasks)
		expect(filterTasksByLabel(tasks, '')).toEqual(tasks)
	})

	// Guard against the filter that cannot fail: an unknown label must empty
	// the board, not fall back to showing everything.
	it('returns nothing for a label no task carries', () => {
		expect(filterTasksByLabel(tasks, 'unused-uuid')).toEqual([])
	})

	it('tolerates a missing collection', () => {
		expect(filterTasksByLabel(null, 'bug-uuid')).toEqual([])
	})
})
