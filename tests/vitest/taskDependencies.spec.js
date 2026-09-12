/**
 * Vitest unit tests for the task-dependency derived-state helpers.
 *
 * Covers the isBlocked / deriveBlockedTaskIds / openBlockerIds derivation
 * (open blocker → blocked, done/cancelled blocker → not blocked, dangling edge
 * ignored, cyclic artifact terminates) and the picker candidate exclusion.
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
import { describe, expect, it } from 'vitest'
import {
	dependencyPickerCandidates,
	deriveBlockedTaskIds,
	isBlocked,
	openBlockerIds,
	statusMapFromTasks,
} from '../../src/utils/taskHelpers.js'

const statusById = {
	A: 'open',
	B: 'in_progress',
	C: 'done',
	D: 'cancelled',
	E: 'open',
}

describe('isBlocked', () => {
	it('is true when a blocker is open', () => {
		const edges = [{ blocker: 'A', blocked: 'B' }]
		expect(isBlocked('B', edges, statusById)).toBe(true)
	})

	it('is false when the only blocker is done', () => {
		const edges = [{ blocker: 'C', blocked: 'B' }]
		expect(isBlocked('B', edges, statusById)).toBe(false)
	})

	it('is false when the only blocker is cancelled', () => {
		const edges = [{ blocker: 'D', blocked: 'B' }]
		expect(isBlocked('B', edges, statusById)).toBe(false)
	})

	it('is true when at least one of several blockers is open', () => {
		const edges = [
			{ blocker: 'C', blocked: 'B' },
			{ blocker: 'A', blocked: 'B' },
		]
		expect(isBlocked('B', edges, statusById)).toBe(true)
	})

	it('ignores a dangling edge whose blocker no longer resolves', () => {
		const edges = [{ blocker: 'GHOST', blocked: 'B' }]
		expect(isBlocked('B', edges, statusById)).toBe(false)
	})

	it('is false for a task with no incoming edges', () => {
		const edges = [{ blocker: 'A', blocked: 'B' }]
		expect(isBlocked('A', edges, statusById)).toBe(false)
	})

	it('terminates on a cyclic artifact (does not loop)', () => {
		// A pathological cycle A→B, B→A that should never have been stored.
		const edges = [
			{ blocker: 'A', blocked: 'B' },
			{ blocker: 'B', blocked: 'A' },
		]
		// Each call inspects each edge once; both resolve to a boolean.
		expect(isBlocked('A', edges, statusById)).toBe(true)
		expect(isBlocked('B', edges, statusById)).toBe(true)
	})

	it('returns false for an empty task id', () => {
		expect(isBlocked('', [{ blocker: 'A', blocked: 'B' }], statusById)).toBe(false)
	})
})

describe('deriveBlockedTaskIds', () => {
	it('returns the sorted set of blocked tasks across the board', () => {
		const edges = [
			{ blocker: 'A', blocked: 'B' }, // A open → B blocked
			{ blocker: 'C', blocked: 'E' }, // C done → E not blocked by this
			{ blocker: 'B', blocked: 'A' }, // B in_progress → A blocked
		]
		expect(deriveBlockedTaskIds(edges, statusById)).toEqual(['A', 'B'])
	})

	it('ignores dangling edges and resolved blockers', () => {
		const edges = [
			{ blocker: 'GHOST', blocked: 'B' },
			{ blocker: 'C', blocked: 'A' },
			{ blocker: 'D', blocked: 'E' },
		]
		expect(deriveBlockedTaskIds(edges, statusById)).toEqual([])
	})

	it('de-duplicates a task blocked by two open blockers', () => {
		const edges = [
			{ blocker: 'A', blocked: 'E' },
			{ blocker: 'B', blocked: 'E' },
		]
		expect(deriveBlockedTaskIds(edges, statusById)).toEqual(['E'])
	})
})

describe('openBlockerIds', () => {
	it('lists only the open blockers of a task', () => {
		const edges = [
			{ blocker: 'A', blocked: 'E' },
			{ blocker: 'C', blocked: 'E' }, // done — excluded
		]
		expect(openBlockerIds('E', edges, statusById)).toEqual(['A'])
	})
})

describe('statusMapFromTasks', () => {
	it('maps both flat and OR-enveloped task shapes', () => {
		const tasks = [
			{ id: 'A', status: 'open' },
			{ '@self': { id: 'B' }, status: 'done' },
			null,
		]
		expect(statusMapFromTasks(tasks)).toEqual({ A: 'open', B: 'done' })
	})
})

describe('dependencyPickerCandidates', () => {
	const current = { id: 'A', project: 'P1' }
	const tasks = [
		{ id: 'A', project: 'P1' }, // self — excluded
		{ id: 'B', project: 'P1' }, // same project — included
		{ id: 'C', project: 'P2' }, // other project — excluded
		{ '@self': { id: 'D' }, project: 'P1' }, // OR-shaped same project — included
	]

	it('excludes self and other-project tasks', () => {
		const ids = dependencyPickerCandidates(current, tasks).map((t) => t.id || t['@self']?.id)
		expect(ids).toEqual(['B', 'D'])
	})

	it('returns empty for a null current task', () => {
		expect(dependencyPickerCandidates(null, tasks)).toEqual([])
	})
})
