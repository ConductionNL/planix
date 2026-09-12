/**
 * Unit tests for the portfolio capacity-summary helper.
 *
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @spec openspec/specs/capacity-planning-resource.md
 */
import { describe, expect, it } from 'vitest'
import { summariseProjectTasks } from '../../src/utils/portfolioHelpers.js'

const NOW = new Date('2026-07-07T12:00:00')

describe('summariseProjectTasks', () => {
	it('counts open, overdue and total', () => {
		const tasks = [
			{ status: 'open', dueDate: '2026-07-01' }, // open + overdue
			{ status: 'in_progress', dueDate: '2026-12-01' }, // open, not overdue
			{ status: 'open' }, // open, no due date
			{ status: 'done', dueDate: '2026-01-01' }, // closed → ignored
			{ status: 'cancelled' }, // closed → ignored
		]
		expect(summariseProjectTasks(tasks, NOW)).toEqual({
			open: 3,
			overdue: 1,
			total: 5,
		})
	})

	it('does not count a closed task as overdue even if its due date passed', () => {
		const tasks = [{ status: 'done', dueDate: '2026-01-01' }]
		expect(summariseProjectTasks(tasks, NOW)).toEqual({
			open: 0,
			overdue: 0,
			total: 1,
		})
	})

	it('returns zeros for an empty list', () => {
		expect(summariseProjectTasks([], NOW)).toEqual({
			open: 0,
			overdue: 0,
			total: 0,
		})
	})
})
