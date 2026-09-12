/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * E2E (UI-only) coverage for the kanban board due-date warning badge.
 *
 * Back-references the "Due Date Badge on Task Card" requirement scenarios of
 * the archived task-due-date-warning change, now living in
 * openspec/specs/kanban-board/spec.md (gate-19 e2e-coverage):
 *
 *   @e2e kanban-board::approaching-task-shows-yellow-badge
 *   @e2e kanban-board::overdue-task-shows-red-badge
 *   @e2e kanban-board::normal-task-shows-no-badge
 *   @e2e kanban-board::task-without-due-date-shows-no-badge
 *
 * The "Due Date Status Helper" requirement (pure function) is covered by the
 * vitest unit suite (tests/vitest/dueDateStatus.spec.js) and is annotated
 * `@e2e exclude` in the spec — no UI surface to drive.
 *
 * The board surface is seeded by `tests/e2e/global-setup.ts` (via
 * `fixtures/seed.ts`): one project the admin is a member of, its default
 * columns, and a due-date spread of tasks (one approaching, one overdue, one
 * far-future). Only the legitimate "planninq not installed" skip remains — once
 * the app answers, the board and its cards MUST be present, so those former
 * skip guards are now hard `expect(...)` assertions.
 */

import { expect, test } from '@playwright/test'
import { openFixtureProjectBoard } from './nav.ts'

// Open the kanban board of the first reachable project.
//
// The previous implementation loaded the app root and clicked
// `a[href*="/projects/"]`, guarded by `if (count > 0)`. Planninq renders project
// rows as `<li class="project-list-item">` with a router-push click handler and
// has no project anchors at all, so that locator matched nothing, the guard
// swallowed it, and the test asserted the board while still sitting on the
// Dashboard. See tests/e2e/nav.ts.
async function openFirstBoard(page) {
	await openFixtureProjectBoard(page)

	// After fixture seeding the board MUST render — a missing board here is a
	// real regression, not an environment quirk, so assert rather than skip.
	const board = page.locator('[data-cy="kanban-board"]')
	await expect(board).toHaveCount(1)
	return board
}

test.describe('Kanban board — due date warning badge', () => {
	// @e2e kanban-board::approaching-task-shows-yellow-badge
	// @e2e kanban-board::overdue-task-shows-red-badge
	test('approaching tasks show a "Due soon" badge and overdue tasks show an "Overdue" badge', async ({
		page,
	}) => {
		const board = await openFirstBoard(page)

		// The board renders one column per task status; a card surfaces its
		// due-date warning via a yellow "Due soon" / red "Overdue" NcChip.
		const dueSoon = board.getByText('Due soon', { exact: false })
		const overdue = board.getByText('Overdue', { exact: false })

		// The seed fixture creates one task due tomorrow (approaching) and one
		// due yesterday (overdue), so both badges MUST be present.
		await expect(board).toBeVisible()
		await expect(dueSoon.first()).toBeVisible()
		await expect(overdue.first()).toBeVisible()
	})

	// @e2e kanban-board::normal-task-shows-no-badge
	// @e2e kanban-board::task-without-due-date-shows-no-badge
	test('tasks with a far-future or absent due date show no warning badge', async ({
		page,
	}) => {
		const board = await openFirstBoard(page)

		// A card with no due-date status must not carry the warning badge class.
		const warningBadges = board.locator('.task-card__due-date-badge')
		const cards = board.locator('.task-card')
		// Seed fixture guarantees cards exist; absence is a real regression.
		await expect(cards).not.toHaveCount(0)

		// Every warning badge that is present must be one of the two known
		// labels — a "normal" / no-due-date card never adds a stray badge.
		const badgeCount = await warningBadges.count()
		for (let i = 0; i < badgeCount; i++) {
			const txt = (await warningBadges.nth(i).innerText()).trim()
			expect(['Due soon', 'Overdue']).toContain(txt)
		}
	})
})
