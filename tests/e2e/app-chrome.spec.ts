/*
 * SPDX-FileCopyrightText: 2026 Conduction B.V.
 * SPDX-License-Identifier: EUPL-1.2
 *
 * The bottom-left app chrome, in a browser (ADR-114).
 *
 * gate-107 reads the manifest and can prove the entries are DECLARED. It
 * cannot prove they RENDER, and this programme has already produced three
 * defects of exactly that shape: an icon name that is not registered renders
 * NO glyph (not a fallback, not a console error), an entry whose `route` names
 * a page the app does not host renders a row that goes nowhere, and
 * `nav.includePersonalSettings: false` silently removed the entry that reaches
 * the user's notification preferences.
 *
 * The reports here are declarative `type: "dashboard"` pages over the app's own
 * register — no bespoke component, no per-app controller. That buys a fourth
 * failure mode a manifest gate cannot see: a widget whose `source` names a
 * schema or field that does not exist renders an empty card rather than an
 * error, so the assertions below look for VALUES, not just for the card.
 *
 * ⚠️ SCOPE EVERY SELECTOR TO `[data-testid="cn-nav"]`. An unscoped selector
 * also matches Nextcloud's own user menu, which is attached-but-hidden:
 * `waitFor({state:'attached'})` passes on it and the click never becomes
 * actionable, so the spec fails with "Target page has been closed" — a timeout
 * wearing a crash's clothes.
 *
 * ⚠️ SETTINGS ENTRIES ARE ATTACHED, NOT VISIBLE, inside a collapsed foldout.
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

const APP_BASE = '/apps/planninq'

/**
 * Dismiss the first-run setup wizard if it is open.
 *
 * ⚠️ On a FRESH instance CnSetupWizard opens over the app and its modal
 * intercepts pointer events, so every nav click resolves its locator and then
 * times out after 30s — a failure that reads like the navigation is broken.
 * Tests that navigate by URL pass, which is what makes this so easy to miss:
 * only the click-through tests fail, and only on a clean install.
 *
 * @param page The page.
 */
async function dismissSetupWizard(page: Page): Promise<void> {
	const modal = page.locator('[data-testid="cn-modal"]')
	if ((await modal.count()) === 0) {
		return
	}
	await modal.first().getByRole('button', { name: 'Close' }).click()
	await expect(modal).toHaveCount(0, { timeout: 15_000 })
}

test.describe('app chrome (ADR-114)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${APP_BASE}/`, { waitUntil: 'domcontentloaded' })
		await expect(page.locator('[data-testid="cn-nav"]')).toBeVisible({
			timeout: 30_000,
		})
		await dismissSetupWizard(page)
	})

	test('the footer reads Documentation, Store, Reports, Features & roadmap, each with a glyph', async ({
		page,
	}) => {
		const footer = page.locator('[data-testid="cn-nav"] .cn-app-nav__footer-list')
		await expect(footer).toBeAttached({ timeout: 15_000 })

		const rows = footer.locator('li')
		const texts = (await rows.allInnerTexts())
			.map((t) => t.trim())
			.filter(Boolean)

		// ORDER is the rule, not the numbers: ADR-114 fixes the sequence and
		// openregister runs its footer at 1/2 while pipelinq runs 160/200/230.
		const seen = texts.filter((t) => /Documentation|Store|Reports|roadmap/i.test(t))
		expect(seen.length).toBe(4)
		expect(seen[0]).toMatch(/Documentation/i)
		expect(seen[1]).toMatch(/Store/i)
		expect(seen[2]).toMatch(/Reports/i)
		expect(seen[3]).toMatch(/roadmap/i)

		// A glyph on every row. ChartBoxOutline had to be added to src/icons.js
		// for the Reports entry; without it the row renders with a blank space
		// where the icon belongs and nothing complains.
		for (const row of await rows.all()) {
			await expect(row.locator('svg, .material-design-icon').first()).toBeAttached()
		}
	})

	test('Capacity is a card on Reports, not a main-nav entry', async ({
		page,
	}) => {
		const nav = page.locator('[data-testid="cn-nav"]')

		// Portfolio aggregates allocation per person and exposes no record
		// actions — a reading of what is, which ADR-112 Decision 2 makes a card
		// rather than an entry. It sat in the main nav at order 40.
		await expect(nav.locator('[data-testid="cn-nav-entry-Portfolio"]')).toHaveCount(0)

		// ⚠️ The testid is on the <li> WRAPPER. The clickable element is the
		// <a class="app-navigation-entry-link"> inside it: clicking the li
		// resolves the locator and then never becomes actionable, so the test
		// dies with a 30s timeout that reads like the app is broken.
		await nav
			.locator('[data-testid="cn-nav-entry-ReportsMenu"] a')
			.first()
			.click()
		await expect(page).toHaveURL(/\/apps\/planninq\/reports(\?|$)/, {
			timeout: 15_000,
		})

		for (const label of ['Task status', 'Capacity', 'Time spent']) {
			await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
		}
	})

	test('the Portfolio page is still routable at its own path', async ({
		page,
	}) => {
		// Retiring a menu entry must not take the route with it — deep links and
		// the older specs address it by path (ADR-044 Decision 5).
		await page.goto(`${APP_BASE}/portfolio`)
		await expect(page).toHaveURL(/\/portfolio(\?|$)/, { timeout: 15_000 })
		await expect(page.locator('[data-testid="cn-nav"]')).toBeVisible()
	})

	test('the task report renders real numbers, not empty cards', async ({
		page,
	}) => {
		// The point of this test. Every widget is declarative over the planninq
		// register, so a wrong schema slug or field name yields a card that
		// renders its chrome and no value, silently. A stat that resolved shows
		// a digit; one that did not stays blank.
		await page.goto(`${APP_BASE}/reports/tasks`)
		await expect(page.locator('[data-testid="cn-nav"]')).toBeVisible({
			timeout: 30_000,
		})

		const body = page.locator('main, .app-content').first()

		// ⚠️ NOT a bare getByText('Open'): that matched the SVG
		// <title>Opens in a new tab</title> on an external-link icon —
		// attached, hidden, and nothing to do with this report. Scope to the
		// body and match a string only the report can supply.
		await expect(body.getByText('In progress', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
		await expect(body).toContainText(/\d/, { timeout: 30_000 })
	})

	test('the time report is reachable and titled', async ({ page }) => {
		await page.goto(`${APP_BASE}/reports/time`)
		await expect(page).toHaveURL(/\/reports\/time(\?|$)/, {
			timeout: 15_000,
		})
		await expect(page.getByText('Minutes logged', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
	})

	test('Store opens the hosted store surface, which this app writes no backend for', async ({
		page,
	}) => {
		const footer = page.locator('[data-testid="cn-nav"] .cn-app-nav__footer-list')
		await footer
			.getByRole('link', { name: /^Store$/ })
			.first()
			.click()

		await expect(page).toHaveURL(/\/apps\/planninq\/store(\?|$)/, {
			timeout: 15_000,
		})

		// The page is declarative: openregister hosts the store plane, so this
		// app ships NO store controller (ADR-080, ADR-114 Decision 4). With no
		// registry configured it renders the app's own items and makes NO
		// network call, so this must pass on a plain instance.
		await expect(page.locator('[data-testid="cn-nav"]')).toBeVisible()
	})

	test('the settings foldout carries Personal settings, Admin settings and Flows', async ({
		page,
	}) => {
		const nav = page.locator('[data-testid="cn-nav"]')

		await expect(nav.locator('[data-testid="cn-nav-settings"]')).toBeAttached({
			timeout: 15_000,
		})
		await expect(nav.locator('[data-testid="cn-nav-personal-settings"]')).toBeAttached()
		await expect(nav.locator('[data-testid="cn-nav-entry-FlowsMenu"]')).toBeAttached()

		// Same wrapper trap: href lives on the <a>, not the <li>, so asserting
		// it on the testid element yields null.
		const admin = nav.locator('[data-testid="cn-nav-admin-settings"]')
		await expect(admin).toBeAttached()
		await expect(admin.locator('a').first()).toHaveAttribute(
			'href',
			/\/settings\/admin\/planninq$/,
		)
	})
})
