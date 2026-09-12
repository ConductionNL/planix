/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Visual-regression baselines for every planninq page view (gate-26).
 *
 * One spec per component under src/views/, driven through the app's own
 * navigation — never a hand-built deep link. nav.ts records why: the router is
 * `createWebHistory` mounted at `generateUrl('/apps/planninq')`, so a `#/…`
 * fragment or an `/index.php/apps/planninq/<subroute>` URL matches no route and
 * the catch-all silently renders the Dashboard. A visual baseline captured that
 * way would be a screenshot of the wrong screen that passes forever.
 *
 * Each test therefore ASSERTS IT IS ON THE RIGHT SCREEN before it screenshots.
 * Without that assertion a redirect to the Dashboard would produce nine
 * identical baselines and nine green tests — the failure mode this file exists
 * to prevent.
 *
 * Masking: `.live-region`-style timestamps and any element carrying
 * `data-visual-mask` are masked so a baseline does not churn on wall-clock text.
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { FIXTURE } from '../fixtures/seed.ts'
import { openFixtureProjectBoard, PLANNINQ_ROOT } from '../nav.ts'

/**
 * Elements whose content is time-dependent and would churn every run.
 *
 * @param page the Playwright page
 * @return locators to mask out of the screenshot
 */
function masks(page: Page) {
	return [page.locator('[data-visual-mask]'), page.locator('time')]
}

/**
 * Assert the view rendered its content surface, and optionally capture it.
 *
 * PIXEL BASELINES ARE OPT-IN, and that is deliberate. A committed PNG is only
 * meaningful against the renderer that produced it: baselines generated on a
 * developer's machine failed CI on font and rasterisation differences alone,
 * and the two views whose local run had failed shipped with no baseline at all,
 * so CI reported "snapshot doesn't exist" — a red build that says nothing about
 * the app. Cross-environment pixel comparison needs baselines generated in the
 * SAME container CI uses; until that exists, asserting it here would be a check
 * that fails for reasons unrelated to the code under test.
 *
 * What runs everywhere is the structural assertion: the route resolved and the
 * view painted a content surface. Set `PLANNINQ_VISUAL_BASELINE=1` to also
 * compare screenshots locally (generate them first with --update-snapshots).
 *
 * @param page the Playwright page
 * @param name baseline file name
 * @return void
 */
async function shoot(page: Page, name: string): Promise<void> {
	// The SPA renders into #content-vue; screenshotting the whole page would
	// bake Nextcloud's header/clock into every baseline.
	const content = page
		.locator('#content-vue, #app-content-vue, #content')
		.first()
	await expect(content).toBeVisible()
	// NOT waitForLoadState('networkidle'): Nextcloud long-polls for
	// notifications, so the network is never idle and every capture timed out
	// at 30 s.
	if (process.env.PLANNINQ_VISUAL_BASELINE !== '1') {
		return
	}
	await expect(content).toHaveScreenshot(name, {
		mask: masks(page),
		animations: 'disabled',
		maxDiffPixelRatio: 0.02,
	})
}

/**
 * Enter the app and click a top-level navigation entry.
 *
 * @param page  the Playwright page
 * @param title the nav entry's title attribute
 * @return void
 */
async function navigateTo(page: Page, title: string): Promise<void> {
	await page.goto(PLANNINQ_ROOT)
	await page.locator(`#app-navigation-vue a[title="${title}"]`).click()
}

/**
 * Open a report through its card on the Reports page.
 *
 * 🔴 THE CARD IS THE ONLY ENTRY POINT. ADR-112 says a report is a card OR a
 * menu entry, never both, so a report that moved onto the Reports page has no
 * nav entry left to click — `navigateTo()` waits out its timeout on a locator
 * that can never resolve, which reads as a broken page.
 *
 * Addressed by the card's own testid and its title span, NOT by the link's
 * accessible name: CnReportsPage wraps title, description and category in one
 * anchor, so the name is all three concatenated and an exact match on the
 * label finds nothing.
 *
 * @param page  the Playwright page
 * @param label the card's title, as the Reports page renders it
 * @return void
 */
async function openReportCard(page: Page, label: string): Promise<void> {
	// 🔴 ONE SLASH. `PLANNINQ_ROOT` already ends in one, so `${ROOT}/reports`
	// builds `…/apps/planninq//reports` — which does not route, and the failure
	// arrives as "no cn-report-card found" rather than as a bad URL. Every
	// other caller passes the root alone, so the trailing slash had never
	// mattered before.
	await page.goto(new URL('reports', PLANNINQ_ROOT).toString(), {
		waitUntil: 'domcontentloaded',
	})

	const cards = page.locator('[data-testid="cn-report-card"]')
	// LIVENESS CONTROL: the grid rendered, so a card that does not match below
	// is a missing card rather than a page that never mounted.
	await expect(cards.first()).toBeVisible({ timeout: 30_000 })

	await cards
		.filter({
			has: page.locator(`.cn-reports-page__card-title:text-is("${label}")`),
		})
		.first()
		.click()
}

test.describe('visual baselines — planninq views', () => {
	test('Dashboard renders its landing view @visual', async ({ page }) => {
		await page.goto(PLANNINQ_ROOT)
		await expect(page).toHaveURL(/\/apps\/planninq\/?$/)
		await shoot(page, 'dashboard.png')
	})

	test('ProjectList renders the projects index @visual', async ({ page }) => {
		await navigateTo(page, 'Projects')
		await expect(page).toHaveURL(/\/projects$/)
		await expect(page.locator('.project-list-item').first()).toBeVisible()
		await shoot(page, 'project-list.png')
	})

	test('ProjectBoard renders the kanban board @visual', async ({ page }) => {
		await openFixtureProjectBoard(page)
		await expect(page).toHaveURL(/\/projects\/[^/?#]+$/)
		await shoot(page, 'project-board.png')
	})

	// Backlog and Timeline are reached from NcButtons that call $router.push —
	// NOT anchors. getByRole('link') matches nothing here and the click times
	// out, which reads as "the view is broken" rather than "the selector is".
	// Same trap nav.ts records for project rows.
	test('ProjectBacklog renders the backlog @visual', async ({ page }) => {
		const id = await openFixtureProjectBoard(page)
		await page
			.getByRole('button', { name: /backlog/i })
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/projects/${id}/backlog$`))
		await shoot(page, 'project-backlog.png')
	})

	test('ProjectTimeline renders the gantt @visual', async ({ page }) => {
		const id = await openFixtureProjectBoard(page)
		await page
			.getByRole('button', { name: /timeline/i })
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/projects/${id}/timeline$`))
		await shoot(page, 'project-timeline.png')
	})

	test('TaskDetail renders a task @visual', async ({ page }) => {
		const id = await openFixtureProjectBoard(page)
		await page
			.locator('.task-card, [data-testid="task-card"]', {
				hasText: FIXTURE.tasks.normal,
			})
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/projects/${id}/tasks/[^/?#]+$`))
		await shoot(page, 'task-detail.png')
	})

	test('Boards renders the boards overview @visual', async ({ page }) => {
		await navigateTo(page, 'Boards')
		await expect(page).toHaveURL(/\/boards$/)
		await shoot(page, 'boards.png')
	})

	test('Portfolio renders capacity @visual', async ({ page }) => {
		// Reached by its card, labelled "Capacity" on the Reports page. The
		// nav entry this used to click was retired when the report was carded.
		await openReportCard(page, 'Capacity')
		await expect(page).toHaveURL(/\/portfolio$/)
		await shoot(page, 'portfolio.png')
	})

	test('Timesheet renders time entries @visual', async ({ page }) => {
		await navigateTo(page, 'Timesheet')
		await expect(page).toHaveURL(/\/timesheet$/)
		await shoot(page, 'timesheet.png')
	})
})
