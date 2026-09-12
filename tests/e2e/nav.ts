/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Shared navigation helpers for the planninq e2e suite.
 *
 * Why these exist — three navigation bugs the specs all shared, each of which
 * produced a failure (or a skip) that looked like missing UI:
 *
 *  1. `a[href*="/projects/"]` matched NOTHING. Planninq renders project rows as
 *     `<li class="project-list-item" role="option">` with a click handler that
 *     calls `router.push()`; there is not a single project anchor in the app.
 *     Every spec that "clicked the first project link" therefore stayed on the
 *     Dashboard and then failed on the board assertion — and
 *     `project-timeline.spec.ts` resolved `null` and `test.skip()`ed itself, so
 *     it has never executed at all.
 *
 *  2. `#/projects/...` hash routes. The router is `createWebHistory`, not a
 *     hash history, so a `#/…` fragment is never a route — the app just renders
 *     the Dashboard.
 *
 *  3. `/index.php/apps/planninq/<subroute>`. The router base comes from
 *     `generateUrl('/apps/planninq')`, which on this instance is `/apps/planninq`
 *     — WITHOUT `index.php`. A deep link carrying `/index.php` does not start
 *     with the base, matches no route, and the catch-all redirects to the
 *     Dashboard. (The bare app root happens to survive this, which is why only
 *     the sub-route specs broke.)
 *
 * The rule these encode: enter at the app root, then drive the UI the way a
 * user does. In-app navigation always produces URLs the router accepts.
 */

import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'
import { BASE_URL } from './base-url.ts'
import { FIXTURE } from './fixtures/seed.ts'

/** The planninq SPA entry point. Safe with or without `index.php`. */
export const PLANNINQ_ROOT = `${BASE_URL}/index.php/apps/planninq/`

/**
 * Open the project list and click the SEEDED fixture project, landing on its
 * kanban board.
 *
 * Deliberately not "the first project": the register ships demo projects, so
 * the first row is `Client Portal v2`, whose tasks carry no due dates. Every
 * assertion in these specs is about the spread `fixtures/seed.ts` creates (one
 * task due tomorrow, one overdue, one far-future, one label), so the specs must
 * open the project that actually holds it.
 *
 * @param page the Playwright page
 * @return the project UUID taken from the resulting URL
 */
export async function openFixtureProjectBoard(page: Page): Promise<string> {
	await page.goto(PLANNINQ_ROOT)

	// Use the app's own navigation entry rather than a hand-built URL.
	await page.locator('#app-navigation-vue a[title="Projects"]').click()

	const row = page.locator('.project-list-item', {
		hasText: FIXTURE.projectTitle,
	})
	await expect(row).toHaveCount(1)
	await row.click()

	await expect(page).toHaveURL(/\/projects\/[^/?#]+$/)
	const match = page.url().match(/\/projects\/([^/?#]+)/)
	if (match === null) {
		throw new Error(`Expected a /projects/:id URL after clicking a project, got ${page.url()}`)
	}
	return match[1]
}

/**
 * Open the planninq user-settings dialog from the app navigation.
 *
 * The old `getByRole('button', { name: /settings/i }).first()` matched
 * Nextcloud's own header button (`aria-label="Settings menu"`), which comes
 * first in the DOM — so the specs opened the user menu and then waited forever
 * for a planninq toggle that was never going to render.
 *
 * @param page the Playwright page
 * @return void
 */
export async function openPlanninqSettingsDialog(page: Page): Promise<void> {
	const nav = page.locator('#app-navigation-vue')

	// Target the library's OWN test ids, not label text.
	//
	// `a[title="Settings"]` matched nothing here. CnAppNav auto-prepends the
	// entry that opens the app's NcAppSettingsDialog and names it "Personal
	// settings", and that name is translated, so a title selector is a language
	// assertion this suite has no business making. Both the foldout and the
	// entry carry stable test ids for exactly this.
	const foldout = nav.locator('[data-testid="cn-nav-settings"]')
	const entry = nav.locator('[data-testid="cn-nav-personal-settings"]')

	// The foldout is collapsed until its gear button is pressed, and the entry
	// is not in the DOM until then.
	if (!(await entry.isVisible().catch(() => false))) {
		await foldout.locator('button').first().click()
	}

	// 🔴 Click the <a>, not the test id. `data-testid` lands on
	// NcAppNavigationItem's ROOT, which is an <li> — clicking that is a silent
	// no-op, and the failure then surfaces several lines later on whatever the
	// dialog was supposed to show.
	await entry.locator('a').first().click()
}
