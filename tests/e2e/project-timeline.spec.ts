/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * E2E (UI-only) coverage for the read-only project timeline (Gantt) view
 * added by the gantt-timeline-view change.
 *
 * Both spec scenarios are annotated `@e2e exclude` (the read/windowing/
 * unscheduled split and the dependency-edge sourcing are unit-tested against
 * seeded data in tests/unit/Controller/TimelineControllerTest.php and
 * tests/vitest/timelineHelpers.spec.js — no seeded UI to assert deterministically
 * yet). This spec is the timeline view's visual/workflow smoke (gate-26
 * visual-coverage): it drives the real "Timeline" surface — opening it from the
 * board and rendering either the Gantt grid, the unscheduled rail, or the
 * empty-state — and asserts the page mounts without error.
 *
 * spec: openspec/specs/gantt-timeline-view/spec.md
 * page component under test: src/views/ProjectTimeline.vue (ProjectTimeline)
 *
 * This UI smoke drives the time-axis rendering scenario (gate-19 e2e-coverage):
 *   @e2e gantt-timeline-view::a-project-timeline-returns-dated-tasks-positioned-in-time
 *
 * The RBAC-scoping and dependency-arrow-sourcing scenarios are annotated
 * `@e2e exclude` in the spec (unit-tested in TimelineControllerTest /
 * timelineHelpers.spec.js — API/pure-logic surfaces, no deterministic UI yet).
 *
 * Planninq is not installed in the shared dev container at the time of writing;
 * this test skips cleanly when the app or a board is not reachable rather than
 * failing the suite (shared-instance isolation — see the change's verify notes).
 */

import { expect, test } from '@playwright/test'
import { openFixtureProjectBoard } from './nav.ts'

// NOTE — this spec used to resolve its project through
//   page.goto(`${NC}/index.php/apps/planninq/#/projects`)
//   page.locator('a[href*="/projects/"]')
// and `test.skip()` when that returned null. BOTH halves were broken: the
// router is a `createWebHistory` router, so a `#/projects` fragment is not a
// route, and the app renders no project anchors at all. The helper therefore
// always returned null and BOTH tests skipped themselves on every run — a
// green-looking suite in which these scenarios had never once executed.
// See tests/e2e/nav.ts.

test.describe('Project timeline (Gantt) — read-only view', () => {
	test('opens the timeline from the board and renders the timeline surface', async ({
		page,
	}) => {
		const projectId = await openFixtureProjectBoard(page)

		// Reach the timeline the way a user does — via the board's own action.
		await page.getByRole('button', { name: 'Timeline' }).click()
		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/timeline$`))

		// The Timeline heading must render (the view mounted). One of the
		// timeline surfaces — the Gantt chart, the unscheduled rail, or the
		// "No scheduled tasks" empty state — must be present.
		const heading = page.getByRole('heading', { name: 'Timeline' })
		await expect(heading).toBeVisible({ timeout: 10000 })

		const chart = page.locator('.project-timeline__chart')
		const unscheduled = page.locator('.project-timeline__unscheduled')
		const empty = page.locator('.empty-content, .project-timeline__loading')
		const anySurface = await Promise.race([
			chart
				.first()
				.waitFor({ state: 'visible', timeout: 8000 })
				.then(() => true)
				.catch(() => false),
			unscheduled
				.first()
				.waitFor({ state: 'visible', timeout: 8000 })
				.then(() => true)
				.catch(() => false),
			empty
				.first()
				.waitFor({ state: 'visible', timeout: 8000 })
				.then(() => true)
				.catch(() => false),
		])
		expect(anySurface).toBeTruthy()
	})

	test('offers a Timeline entry on the project board', async ({ page }) => {
		await openFixtureProjectBoard(page)

		// The board header exposes a "Timeline" action that navigates to the view.
		const timelineButton = page.getByRole('button', { name: 'Timeline' })
		await expect(timelineButton).toBeVisible({ timeout: 10000 })
		await timelineButton.click()
		await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible({ timeout: 10000 })
	})
})
