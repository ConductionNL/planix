/**
 * Vitest unit tests for the dueDateStatus derived-state helper.
 *
 * Covers every boundary the kanban-board badge depends on: no due date,
 * future date (>2 days), approaching date (today / 1 / 2 days out), overdue
 * (past), and date-only comparison (time component ignored). Mirrors the
 * scenarios in the task-due-date-warning change (originally authored on PR #1,
 * adapted to planninq's vitest harness with an injected clock for determinism).
 *
 * @spec openspec/specs/kanban-board.md
 */
import { describe, expect, it } from 'vitest'
import { dueDateStatus } from '../../src/utils/taskHelpers.js'

// Fixed clock so the suite is deterministic regardless of when it runs.
const NOW = new Date(2026, 5, 15, 9, 30, 0) // 2026-06-15T09:30 local

/**
 * Build an ISO date-only string offset from the fixed clock by `dayOffset` days.
 *
 * @param {number} dayOffset Number of days to add (negative for the past).
 * @return {string} An `YYYY-MM-DD` string.
 */
function dateString(dayOffset) {
	const d = new Date(NOW)
	d.setDate(d.getDate() + dayOffset)
	const yyyy = d.getFullYear()
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const dd = String(d.getDate()).padStart(2, '0')
	return `${yyyy}-${mm}-${dd}`
}

describe('dueDateStatus', () => {
	describe('task with no due date', () => {
		it('returns null when dueDate is undefined', () => {
			expect(dueDateStatus({ title: 'Test task' }, NOW)).toBe(null)
		})

		it('returns null when dueDate is null', () => {
			expect(dueDateStatus({ title: 'Test task', dueDate: null }, NOW)).toBe(null)
		})

		it('returns null when dueDate is an empty string', () => {
			expect(dueDateStatus({ title: 'Test task', dueDate: '' }, NOW)).toBe(null)
		})

		it('returns null when task is null', () => {
			expect(dueDateStatus(null, NOW)).toBe(null)
		})

		it('returns null when task is undefined', () => {
			expect(dueDateStatus(undefined, NOW)).toBe(null)
		})
	})

	describe('task with future due date', () => {
		it('returns null when due date is 3 days away', () => {
			expect(dueDateStatus({ dueDate: dateString(3) }, NOW)).toBe(null)
		})

		it('returns null when due date is 5 days away', () => {
			expect(dueDateStatus({ dueDate: dateString(5) }, NOW)).toBe(null)
		})

		it('returns null when due date is far in the future', () => {
			expect(dueDateStatus({ dueDate: dateString(100) }, NOW)).toBe(null)
		})
	})

	describe('task with approaching due date', () => {
		it('returns "approaching" when due date is today', () => {
			expect(dueDateStatus({ dueDate: dateString(0) }, NOW)).toBe('approaching')
		})

		it('returns "approaching" when due date is tomorrow', () => {
			expect(dueDateStatus({ dueDate: dateString(1) }, NOW)).toBe('approaching')
		})

		it('returns "approaching" when due date is exactly 2 days away', () => {
			expect(dueDateStatus({ dueDate: dateString(2) }, NOW)).toBe('approaching')
		})
	})

	describe('task that is overdue', () => {
		it('returns "overdue" when due date is yesterday', () => {
			expect(dueDateStatus({ dueDate: dateString(-1) }, NOW)).toBe('overdue')
		})

		it('returns "overdue" when due date is 3 days ago', () => {
			expect(dueDateStatus({ dueDate: dateString(-3) }, NOW)).toBe('overdue')
		})

		it('returns "overdue" when due date is far in the past', () => {
			expect(dueDateStatus({ dueDate: dateString(-100) }, NOW)).toBe('overdue')
		})
	})

	describe('date parsing', () => {
		it('accepts a Date instance', () => {
			const tomorrow = new Date(NOW)
			tomorrow.setDate(tomorrow.getDate() + 1)
			expect(dueDateStatus({ dueDate: tomorrow }, NOW)).toBe('approaching')
		})

		it('returns null for an unparseable due date', () => {
			expect(dueDateStatus({ dueDate: 'not-a-date' }, NOW)).toBe(null)
		})

		it('ignores the time component in the comparison', () => {
			// Same calendar day as NOW but a later wall-clock time => still "approaching".
			const todayMidday = new Date(2026, 5, 15, 23, 59, 0)
			expect(dueDateStatus({ dueDate: todayMidday }, NOW)).toBe('approaching')
		})
	})
})
