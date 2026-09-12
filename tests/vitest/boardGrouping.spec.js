/**
 * Vitest unit tests for the kanban board column grouping helper.
 *
 * Covers the derivation the ProjectBoard view relies on: every status column
 * is always present (empty columns render gracefully), tasks land in their
 * status lane, and an unknown / out-of-band status falls back to the first
 * column rather than dropping the card off the board.
 *
 * @spec openspec/specs/kanban-board.md
 */
import { describe, expect, it } from 'vitest'
import {
	BOARD_STATUSES,
	groupTasksByStatus,
} from '../../src/utils/taskHelpers.js'

describe('groupTasksByStatus', () => {
	it('exposes the five board status lanes in order', () => {
		expect(BOARD_STATUSES).toEqual([
			'open',
			'in_progress',
			'blocked',
			'done',
			'cancelled',
		])
	})

	it('returns a key for every status column even with no tasks', () => {
		const grouped = groupTasksByStatus([])
		expect(Object.keys(grouped)).toEqual(BOARD_STATUSES)
		for (const status of BOARD_STATUSES) {
			expect(grouped[status]).toEqual([])
		}
	})

	it('places each task in its status lane', () => {
		const tasks = [
			{ id: 'a', status: 'open' },
			{ id: 'b', status: 'in_progress' },
			{ id: 'c', status: 'done' },
			{ id: 'd', status: 'open' },
		]
		const grouped = groupTasksByStatus(tasks)
		expect(grouped.open.map((t) => t.id)).toEqual(['a', 'd'])
		expect(grouped.in_progress.map((t) => t.id)).toEqual(['b'])
		expect(grouped.done.map((t) => t.id)).toEqual(['c'])
		expect(grouped.blocked).toEqual([])
		expect(grouped.cancelled).toEqual([])
	})

	it('falls back an unknown status to the first column', () => {
		const grouped = groupTasksByStatus([{ id: 'x', status: 'mystery' }])
		expect(grouped.open.map((t) => t.id)).toEqual(['x'])
	})

	it('falls back a task with no status to the first column', () => {
		const grouped = groupTasksByStatus([{ id: 'y' }])
		expect(grouped.open.map((t) => t.id)).toEqual(['y'])
	})

	it('ignores null / undefined entries', () => {
		const grouped = groupTasksByStatus([
			null,
			undefined,
			{ id: 'z', status: 'blocked' },
		])
		expect(grouped.blocked.map((t) => t.id)).toEqual(['z'])
	})

	it('preserves insertion order within a lane', () => {
		const tasks = [
			{ id: '1', status: 'open' },
			{ id: '2', status: 'open' },
			{ id: '3', status: 'open' },
		]
		expect(groupTasksByStatus(tasks).open.map((t) => t.id)).toEqual([
			'1',
			'2',
			'3',
		])
	})
})
