/**
 * Unit tests for the timesheet grouping/totals/range helpers.
 *
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @spec openspec/specs/time-tracking.md
 */
import { describe, expect, it } from 'vitest'
import {
	currentWeekRange,
	filterByRange,
	groupEntriesByDate,
	sumDuration,
} from '../../src/utils/timesheetHelpers.js'

const entries = [
	{ id: 'a', date: '2026-07-06', duration: 60, task: 't1' },
	{ id: 'b', date: '2026-07-07', duration: 45, task: 't2' },
	{ id: 'c', date: '2026-07-06', duration: 30, task: 't3' },
	{ id: 'd', date: '2026-07-01', duration: 120, task: 't4' },
]

describe('groupEntriesByDate', () => {
	it('groups by date, newest first, with per-day totals', () => {
		const groups = groupEntriesByDate(entries)
		expect(groups.map((g) => g.date)).toEqual([
			'2026-07-07',
			'2026-07-06',
			'2026-07-01',
		])
		const jul6 = groups.find((g) => g.date === '2026-07-06')
		expect(jul6.entries).toHaveLength(2)
		expect(jul6.total).toBe(90)
	})
	it('returns an empty array for no entries', () => {
		expect(groupEntriesByDate([])).toEqual([])
	})
})

describe('sumDuration', () => {
	it('sums durations in minutes', () => {
		expect(sumDuration(entries)).toBe(255)
	})
	it('ignores non-numeric durations', () => {
		expect(sumDuration([{ duration: 10 }, { duration: undefined }])).toBe(10)
	})
})

describe('filterByRange', () => {
	it('keeps only entries within [from, to] inclusive', () => {
		const r = filterByRange(entries, '2026-07-06', '2026-07-07')
		expect(r.map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
	})
	it('treats null bounds as open-ended', () => {
		expect(filterByRange(entries, null, '2026-07-01')).toHaveLength(1)
	})
})

describe('currentWeekRange', () => {
	it('returns the Monday–Sunday range containing the reference date', () => {
		// 2026-07-07 is a Tuesday → week is Mon 2026-07-06 … Sun 2026-07-12
		const { from, to } = currentWeekRange(new Date('2026-07-07T12:00:00'))
		expect(from).toBe('2026-07-06')
		expect(to).toBe('2026-07-12')
	})
})
