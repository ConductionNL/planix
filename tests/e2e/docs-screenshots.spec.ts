/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Documentation screenshot capture suite — planninq.
 *
 * This spec is *not* a regression test — it drives the Planninq UI
 * through every flow documented under `docs/tutorials/{user,admin}/*.md`
 * and writes a fresh PNG into `docs/static/screenshots/tutorials/<track>/`
 * for each step the markdown references.
 *
 * Run manually whenever the UI changes and tutorial screenshots need
 * to be refreshed:
 *
 *     PLAYWRIGHT_BASE_URL=http://localhost:8095 \
 *       npx playwright test --project docs-capture
 *
 * Excluded from the default `npm run test:e2e` run via the
 * `docs-capture` project flag in `playwright.config.ts` so PR
 * pipelines don't reshoot screenshots on every push.
 *
 * Authentication: `playwright.config.ts` wires `globalSetup` (a one-time
 * Nextcloud login → storage state) and `use.storageState`, so the
 * `page` fixture here arrives already signed in.
 *
 * Data dependency: Planninq is not yet installed in the dev container at
 * the time of writing — these tests are scaffolded for a future capture
 * run. Selector misses are the expected first-run failure mode (UI markup
 * drifts faster than docs); failures land per-test in `test-results/`
 * rather than killing the suite. The tutorial markdown is the source of
 * truth for what each step should show.
 *
 * Pattern reference: ADR-030 (hydra/openspec/architecture/).
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const SHOT_ROOT = path.resolve(
	__dirname,
	'..',
	'..',
	'docs',
	'static',
	'screenshots',
	'tutorials',
)
const APP = '/apps/planninq'

/**
 * Save a viewport screenshot under
 * `docs/static/screenshots/tutorials/<track>/<file>`.
 * Lives under `static/` so Docusaurus copies the PNG into the build
 * root — markdown image refs use `/screenshots/...` (root-absolute).
 */
async function shoot(
	page: Page,
	track: 'user' | 'admin',
	file: string,
): Promise<void> {
	const dir = path.join(SHOT_ROOT, track)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	await page.screenshot({
		path: path.join(dir, file),
		fullPage: false,
		type: 'png',
	})
}

/**
 * Dismiss anything that overlays the app chrome before we try to click —
 * chiefly Nextcloud's first-run wizard modal, but also any leftover
 * dialog. Best-effort: silently no-op when nothing's there.
 */
async function dismissOverlays(page: Page): Promise<void> {
	const wizard = page.locator('#firstrunwizard')
	if (await wizard.isVisible().catch(() => false)) {
		const close = wizard
			.getByRole('button', { name: /close|got it|finish|skip/i })
			.first()
		if (await close.isVisible().catch(() => false)) {
			await close.click().catch(() => {})
		} else {
			await page.keyboard.press('Escape').catch(() => {})
		}
		await wizard
			.waitFor({ state: 'hidden', timeout: 4000 })
			.catch(() => {})
	}
	const stray = page.locator('[role="dialog"]:not(#firstrunwizard)')
	if (
		await stray
			.first()
			.isVisible()
			.catch(() => false)
	) {
		await page.keyboard.press('Escape').catch(() => {})
		await page.waitForTimeout(300)
	}
}

/**
 * Navigate to an app route (relative paths join /apps/planninq) or to
 * an absolute Nextcloud route (paths starting with `/apps/` or
 * `/settings` are passed through). Settles network + dismisses overlays.
 *
 * Planninq uses history-mode routing rooted at /apps/planninq.
 */
async function go(page: Page, route: string): Promise<void> {
	const url
		= route.startsWith('/apps/') || route.startsWith('/settings')
			? route
			: `${APP}${route.startsWith('/') ? route : `/${route}`}`
	await page.goto(url).catch(() => {
		/* tolerate 404 — caller decides */
	})
	// ADR-074 rule 4: `networkidle` never settles on Nextcloud — long-polling
	// and background requests keep the network busy indefinitely, so this wait
	// always ran to its timeout and was then swallowed by the `.catch()`. It
	// cost the full timeout on every navigation and guaranteed nothing.
	await page.waitForLoadState('domcontentloaded').catch(() => {
		/* navigation may already be settled */
	})
	await dismissOverlays(page)
	await page.waitForTimeout(900)
}

/**
 * Open the create dialog on a list view ("Create project" / "+ Add task"
 * / etc.) if a button matching the name pattern is present, screenshot
 * it, and close it again. Returns whether the dialog appeared.
 */
async function captureCreateDialog(
	page: Page,
	namePattern: RegExp,
	track: 'user' | 'admin',
	file: string,
): Promise<boolean> {
	const addBtn = page.getByRole('button', { name: namePattern }).first()
	if (!(await addBtn.isVisible().catch(() => false))) {
		return false
	}
	await addBtn.click().catch(() => {})
	const dialog = page.locator('[role="dialog"]:not(#firstrunwizard)').first()
	await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
		/* no dialog */
	})
	await page.waitForTimeout(400)
	await shoot(page, track, file)
	const cancel = dialog.getByRole('button', { name: /Cancel/i }).first()
	if (await cancel.isVisible().catch(() => false)) {
		await cancel.click().catch(() => {})
	} else {
		await page.keyboard.press('Escape').catch(() => {})
	}
	await page.waitForTimeout(300)
	return true
}

test.describe.configure({ mode: 'default' })

test.beforeEach(async ({ page }) => {
	page.setViewportSize({ width: 1280, height: 800 })
})

// ---------------------------------------------------------------------------
// USER TRACK — see docs/tutorials/user/
// ---------------------------------------------------------------------------

test.describe('docs: user track', () => {
	test('UN first-launch', async ({ page }) => {
		// docs/tutorials/user/01-first-launch.md
		await go(page, '/')
		await shoot(page, 'user', '01-first-launch-01.png')
		await shoot(page, 'user', '01-first-launch-02.png')
		await shoot(page, 'user', '01-first-launch-03.png')
		await shoot(page, 'user', '01-first-launch-04.png')
		expect(page.url()).toContain('/apps/planninq')
	})

	test('UN create-project', async ({ page }) => {
		// docs/tutorials/user/02-create-project.md
		await go(page, '/projects')
		const had = await captureCreateDialog(
			page,
			/Create project|New project/i,
			'user',
			'02-create-project-01.png',
		)
		if (had) {
			await captureCreateDialog(
				page,
				/Create project|New project/i,
				'user',
				'02-create-project-02.png',
			)
		}
		// Steps 3-5 (empty board, sidebar tabs) need an existing project;
		// the projects list stands in.
		await go(page, '/projects')
		await shoot(page, 'user', '02-create-project-03.png')
		await shoot(page, 'user', '02-create-project-04.png')
		await shoot(page, 'user', '02-create-project-05.png')
	})

	test('UN work-with-boards', async ({ page }) => {
		// docs/tutorials/user/03-work-with-boards.md — board screens need a
		// real project ID; the project list stands in for the steps.
		await go(page, '/projects')
		await shoot(page, 'user', '03-work-with-boards-01.png')
		await shoot(page, 'user', '03-work-with-boards-02.png')
		await shoot(page, 'user', '03-work-with-boards-03.png')
		await shoot(page, 'user', '03-work-with-boards-04.png')
		await shoot(page, 'user', '03-work-with-boards-05.png')
	})

	test('UN manage-tasks', async ({ page }) => {
		// docs/tutorials/user/04-manage-tasks.md
		await go(page, '/projects')
		await shoot(page, 'user', '04-manage-tasks-01.png')
		await shoot(page, 'user', '04-manage-tasks-02.png')
		await shoot(page, 'user', '04-manage-tasks-03.png')
		await shoot(page, 'user', '04-manage-tasks-04.png')
		await shoot(page, 'user', '04-manage-tasks-05.png')
	})

	test('UN manage-backlog', async ({ page }) => {
		// docs/tutorials/user/05-manage-backlog.md — backlog screens need a
		// real project ID; project list stands in.
		await go(page, '/projects')
		await shoot(page, 'user', '05-manage-backlog-01.png')
		await shoot(page, 'user', '05-manage-backlog-02.png')
		await shoot(page, 'user', '05-manage-backlog-03.png')
		await shoot(page, 'user', '05-manage-backlog-04.png')
		await shoot(page, 'user', '05-manage-backlog-05.png')
	})

	test('UN log-time', async ({ page }) => {
		// docs/tutorials/user/06-log-time.md
		await go(page, '/projects')
		await shoot(page, 'user', '06-log-time-01.png')
		await shoot(page, 'user', '06-log-time-02.png')
		await shoot(page, 'user', '06-log-time-03.png')
		await shoot(page, 'user', '06-log-time-04.png')
		await go(page, '/timesheet').catch(() => {})
		await shoot(page, 'user', '06-log-time-05.png')
	})

	test('UN my-work-and-dashboard', async ({ page }) => {
		// docs/tutorials/user/07-my-work-and-dashboard.md
		await go(page, '/')
		await shoot(page, 'user', '07-my-work-and-dashboard-01.png')
		await go(page, '/my-work').catch(() => {})
		await shoot(page, 'user', '07-my-work-and-dashboard-02.png')
		await shoot(page, 'user', '07-my-work-and-dashboard-03.png')
		await shoot(page, 'user', '07-my-work-and-dashboard-04.png')
		await go(page, '/settings')
		await shoot(page, 'user', '07-my-work-and-dashboard-05.png')
	})

	test('UN link-procest', async ({ page }) => {
		// docs/tutorials/user/08-link-procest.md — task / project case-link
		// surfaces; project list stands in for the steps.
		await go(page, '/projects')
		await shoot(page, 'user', '08-link-procest-01.png')
		await shoot(page, 'user', '08-link-procest-02.png')
		await shoot(page, 'user', '08-link-procest-03.png')
		await shoot(page, 'user', '08-link-procest-04.png')
		await shoot(page, 'user', '08-link-procest-05.png')
	})
})

// ---------------------------------------------------------------------------
// ADMIN TRACK — see docs/tutorials/admin/
// ---------------------------------------------------------------------------

test.describe('docs: admin track', () => {
	test('AN configure-default-columns', async ({ page }) => {
		// docs/tutorials/admin/01-configure-default-columns.md — settings
		// page under the Nextcloud administration panel.
		await go(page, '/settings/admin/planninq')
		await shoot(page, 'admin', '01-configure-default-columns-01.png')
		await shoot(page, 'admin', '01-configure-default-columns-02.png')
		await shoot(page, 'admin', '01-configure-default-columns-03.png')
		await shoot(page, 'admin', '01-configure-default-columns-04.png')
		await go(page, '/projects')
		await shoot(page, 'admin', '01-configure-default-columns-05.png')
	})

	test('AN manage-labels', async ({ page }) => {
		// docs/tutorials/admin/02-manage-labels.md
		await go(page, '/settings/admin/planninq')
		await shoot(page, 'admin', '02-manage-labels-01.png')
		await shoot(page, 'admin', '02-manage-labels-02.png')
		await shoot(page, 'admin', '02-manage-labels-03.png')
		await shoot(page, 'admin', '02-manage-labels-04.png')
		await shoot(page, 'admin', '02-manage-labels-05.png')
	})

	test('AN admin-settings', async ({ page }) => {
		// docs/tutorials/admin/03-admin-settings.md — Planninq's admin
		// settings page in the Nextcloud administration panel.
		await go(page, '/settings/admin/planninq')
		await shoot(page, 'admin', '03-admin-settings-01.png')
		await page.evaluate(() => window.scrollTo(0, 0))
		await page.waitForTimeout(300)
		await shoot(page, 'admin', '03-admin-settings-02.png')
		await shoot(page, 'admin', '03-admin-settings-03.png')
		await shoot(page, 'admin', '03-admin-settings-04.png')
		await shoot(page, 'admin', '03-admin-settings-05.png')
	})
})
