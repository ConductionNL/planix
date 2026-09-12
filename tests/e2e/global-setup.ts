/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Playwright globalSetup — logs into Nextcloud once and persists the
 * resulting cookie jar / localStorage to `tests/e2e/.auth/admin.json`.
 * Every spec then reuses that storage state via the `use.storageState`
 * setting in playwright.config.ts, so individual tests start from an
 * authenticated session without each one paying the login cost.
 *
 * Why a real browser login (instead of POSTing to /login directly):
 * Nextcloud's login form ships a CSRF token (`requesttoken`) plus a
 * `oc_session_passphrase` cookie that must be set in the same browser
 * context. Driving the form via Playwright sidesteps having to
 * reverse-engineer the token-rotation contract, which has shifted
 * across NC 28 / 29 / 30.
 *
 * Pattern reference: ADR-030 (hydra/openspec/architecture/), mirrored
 * from launchpad's journeydoc setup (the longest-running journeydoc
 * adopter).
 */

import type { FullConfig } from '@playwright/test'

import { chromium, request } from '@playwright/test'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { BASE_URL } from './base-url.ts'
import { seedFixtures } from './fixtures/seed.ts'

const AUTH_DIR = path.resolve(__dirname, '.auth')
const STORAGE_STATE = path.join(AUTH_DIR, 'admin.json')
const APP_ROOT = path.resolve(__dirname, '..', '..')
const BUNDLE_PATH = path.join(APP_ROOT, 'js', 'planninq-main.js')

/**
 * Ensure the webpack bundle exists before specs hit `/apps/planninq/`.
 *
 * Without `js/planninq-main.js` the rendered page loads a 404 script tag,
 * the Vue app never mounts, and every selector wait times out with a
 * misleading "element not found".
 *
 * Correction to the comment this replaces: it asserted that the shared
 * `Conduction/.github` quality.yml Playwright job "never runs
 * `npm run build`". It does — the job log carries a
 * "Building app frontend with 'npm run build'…" step immediately before
 * `npx playwright test`. So this guard is a local convenience for a
 * checkout that has never been built, not a CI workaround.
 */
function ensureBundleBuilt(): void {
	if (fs.existsSync(BUNDLE_PATH)) {
		return
	}
	// On CI this is a hard error, not something to repair.
	//
	// The shared workflow has already run its own "Build app frontend" step by
	// the time we get here, so a missing bundle means that step did not produce
	// one — and silently rebuilding turns a broken build into a green run with
	// nothing to show for it. It also makes the bundle genuinely untestable: a
	// positive control that removes the bundle to prove the specs depend on it
	// gets healed right back before the first spec runs, and the suite passes.
	// (Observed on opencatalogi: run 30791459241 passed 82/82 with the bundle
	// DELETED, because this function rebuilt it — the control proved nothing
	// until it was changed to truncate the file instead, which `fs.existsSync`
	// cannot detect.)
	//
	// Locally the rebuild stays, because there it is a genuine convenience: a
	// fresh checkout has no `js/` and nothing else is going to build it.
	if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
		throw new Error(`[playwright globalSetup] bundle missing at ${BUNDLE_PATH} on CI. `
			+ 'The workflow\'s "Build app frontend" step should already have produced it — '
			+ 'check that step rather than rebuilding here, because a rebuild would hide it.')
	}

	console.log(`[playwright globalSetup] bundle missing at ${BUNDLE_PATH}; running 'npm run build' once…`)
	execSync('npm run build', { cwd: APP_ROOT, stdio: 'inherit' })
}

async function ensureNextcloudReachable(baseURL: string): Promise<void> {
	const ctx = await request.newContext()
	try {
		const res = await ctx.get(`${baseURL}/status.php`, {
			failOnStatusCode: false,
		})
		if (!res.ok()) {
			throw new Error(`Nextcloud status.php returned ${res.status()} at ${baseURL}. `
				+ 'Make sure the docker container is running and reachable.')
		}
		const body = await res.json().catch(() => ({}))
		if (!body || body.installed !== true) {
			throw new Error(`Nextcloud at ${baseURL} is not installed (status.php = ${JSON.stringify(body)}).`)
		}
	} finally {
		await ctx.dispose()
	}
}

/**
 * Permanently dismiss Nextcloud's first-run wizard for the test account.
 *
 * The wizard renders as a modal `<dialog>` over the whole viewport and eats
 * pointer events. It lands on whichever spec happens to run first, so a
 * best-effort "click Skip if it's there" helper cannot win the race — the
 * regression suite failed 13/15 on a fresh container purely because of it,
 * with failures that look like missing UI ("expected 1, received 0" on the
 * board) rather than an overlay.
 *
 * `DELETE /apps/firstrunwizard/wizard` (Wizard#disable) sets the per-user
 * `firstrunwizard.show` setting, which is durable for the whole run. HTTP Basic
 * bypasses the session CSRF check, so no `requesttoken` is needed. Best-effort:
 * the app is optional and absent on some instances.
 *
 * @param baseURL  the target Nextcloud
 * @param username admin user
 * @param password admin password
 * @return void
 */
async function dismissFirstRunWizard(
	baseURL: string,
	username: string,
	password: string,
): Promise<void> {
	const ctx = await request.newContext({
		baseURL,
		httpCredentials: { username, password, send: 'always' },
		extraHTTPHeaders: { 'OCS-APIRequest': 'true' },
	})
	try {
		const res = await ctx.delete('/index.php/apps/firstrunwizard/wizard', {
			failOnStatusCode: false,
		})

		console.log(`[playwright globalSetup] first-run wizard dismissal returned ${res.status()}`)
	} catch (err) {
		console.warn(`[playwright globalSetup] could not dismiss the first-run wizard: ${(err as Error).message}`)
	} finally {
		await ctx.dispose()
	}
}

/**
 * Set the acting user's language to English for the duration of the run.
 *
 * Uses the OCS provisioning API rather than `occ`, because the e2e runs against
 * a URL and may not share a filesystem with the instance.
 *
 * A failure here is logged, not thrown: it makes English-string assertions
 * unreliable, but it is not itself the thing under test, and a suite that
 * refuses to start because a preference could not be set is worse than one that
 * runs and reports honestly.
 *
 * @param baseURL  the instance under test
 * @param username admin user
 * @param password admin password
 * @return void
 */
async function pinUserLanguageToEnglish(
	baseURL: string,
	username: string,
	password: string,
): Promise<void> {
	const ctx = await request.newContext({
		baseURL,
		httpCredentials: { username, password, send: 'always' },
		extraHTTPHeaders: {
			'OCS-APIRequest': 'true',
			Accept: 'application/json',
		},
	})
	try {
		const res = await ctx.put(
			`/ocs/v2.php/cloud/users/${encodeURIComponent(username)}`,
			{ form: { key: 'language', value: 'en' }, failOnStatusCode: false },
		)
		if (!res.ok()) {
			console.log(`[setup] could not pin language to en (status ${res.status()}) — `
				+ 'specs asserting English strings may fail on a non-English instance')
		}
	} catch (err) {
		console.log(`[setup] could not pin language to en: ${(err as Error).message}`)
	} finally {
		await ctx.dispose()
	}
}

export default async function globalSetup(config: FullConfig): Promise<void> {
	// One resolver for the whole suite — see tests/e2e/base-url.ts. The old
	// chain re-derived the target here and ended in a silent
	// `?? 'http://localhost:8080'`, i.e. the SHARED dev container.
	const baseURL
		= (config.projects[0]?.use?.baseURL as string | undefined) ?? BASE_URL
	// ADMIN_USER / ADMIN_PASSWORD are what the shared Conduction/.github quality
	// workflow exports; NC_ADMIN_* is the local convention.
	const username
		= process.env.NC_ADMIN_USER ?? process.env.ADMIN_USER ?? 'admin'
	const password
		= process.env.NC_ADMIN_PASS ?? process.env.ADMIN_PASSWORD ?? 'admin'

	ensureBundleBuilt()
	await ensureNextcloudReachable(baseURL)
	// Before the browser opens, so the storage state below is captured on a
	// session that will never see the wizard.
	await dismissFirstRunWizard(baseURL, username, password)
	fs.mkdirSync(AUTH_DIR, { recursive: true })

	const browser = await chromium.launch()
	const context = await browser.newContext({ baseURL })
	const page = await context.newPage()

	// Hit the login form so the CSRF token + session passphrase land in
	// the browser jar.
	await page.goto('/index.php/login')
	await page.locator('input[name="user"]').fill(username)
	await page.locator('input[name="password"]').fill(password)
	await page.locator('button[type="submit"]').first().click()
	// Nextcloud bounces to /apps/dashboard/ (or another default app) on
	// success. Wait for the global header that only renders on
	// authenticated pages — the URL-based wait races with the in-flight
	// click navigation and is unreliable on slower test rigs.
	await page.waitForSelector('#header, header.header', { timeout: 20_000 })
	// Catch wrong-credentials early so the failure message is clear.
	const currentUrl = page.url()
	if (/\/login(\?|$|\/)/.test(currentUrl)) {
		throw new Error(`Login appears to have failed — still on ${currentUrl}. `
			+ 'Check NC_ADMIN_USER / NC_ADMIN_PASS (defaults admin/admin).')
	}

	// Pin the acting user's language to English BEFORE anything asserts on a
	// visible string.
	//
	// Almost every spec selects on English text — `a[title="Projects"]`,
	// `getByRole('button', { name: /Create label/i })`, `getByText(/Label
	// management/i)`. On a fresh CI container the admin defaults to English and
	// they all match, so CI is green and stays green. On this development
	// instance `admin` has `core lang = nl`, the navigation renders "Projecten"
	// / "Instellingen" / "Documentatie", and 24 of 37 specs failed on a
	// selector that could never match — every one of them reported as a click
	// timeout, which reads like a broken app.
	//
	// The suite was therefore ENVIRONMENT-DEPENDENT in a way CI structurally
	// cannot catch: the one place it runs is the one place it passes. Pinning
	// the language here makes a local run and a CI run assert the same strings.
	//
	// Not a substitute for locale-independent selectors — an href or a
	// data-testid would be better and is worth doing — but this fixes every
	// affected spec at once instead of chasing them one string at a time.
	await pinUserLanguageToEnglish(baseURL, username, password)

	// Seed the fixture project/columns/tasks/label the board, collaboration,
	// label and reminder specs assert against — so their tightened
	// `expect(...).not.toHaveCount(0)` guards resolve on a fresh container
	// instead of self-skipping. Idempotent; a false return means planninq isn't
	// installed here and specs take their legitimate "app not installed" skip.
	try {
		await seedFixtures(baseURL, { username, password })
	} catch (err) {
		// Never let a seeding hiccup abort the whole suite — specs still guard
		// on the environment-absence path.

		console.warn(`[playwright globalSetup] fixture seeding failed: ${(err as Error).message}`)
	}

	// DISMISS THE CONDUCTION SETUP WIZARD, WHICH IS NOT NEXTCLOUD'S.
	//
	// `dismissFirstRunWizard` above disables Nextcloud's own `firstrunwizard`
	// app. The dialog that actually blocks this suite is a different component:
	// CnSetupWizard from @conduction/nextcloud-vue, rendered as
	// `[data-testid-modal="cn-wizard-dialog"]`. Nothing dismissed it.
	//
	// It masks the whole viewport, so a click lands on the mask instead of the
	// control and the failure reads as a timeout on a locator that resolved,
	// was visible, enabled and stable, and could not be clicked:
	//
	//   waiting for … [data-testid="cn-nav-settings"] … button
	//     - element is visible, enabled and stable
	//     - <div class="modal-wrapper"> … subtree intercepts pointer events
	//
	// WHY IT ONLY BITES SOMETIMES. The wizard keys on the manifest's
	// `setup.version`, not on whether it has ever been seen:
	// `cn-setup-wizard-dismissed:<appId>:<setup.version>`. So a suite can be
	// green for weeks and go red the moment the app is upgraded or that
	// version is bumped, in specs that never touched setup. Observed here on
	// 2026-09-08 immediately after an `occ upgrade` moved planninq to
	// 0.2.20 — the admin-settings specs stayed green, because they never load
	// the app root where the wizard mounts.
	//
	// Seeded for every version up to a number no manifest will reach, so a
	// future bump cannot re-arm it.
	const page2 = await context.newPage()
	try {
		await page2.goto(`${baseURL}/index.php/apps/planninq/`, {
			waitUntil: 'domcontentloaded',
		})
		await page2.evaluate(() => {
			for (let v = 0; v <= 50; v++) {
				try {
					window.localStorage.setItem(
						`cn-setup-wizard-dismissed:planninq:${v}`,
						'1',
					)
					window.localStorage.setItem(
						`cn-walkthrough-seen:planninq:${v}`,
						'999.0.0',
					)
				} catch {
					// A browser with site data blocked has nothing to seed and
					// nothing to lose; the wizard will simply show.
				}
			}
			try {
				window.localStorage.setItem('cn-walkthrough-seen:planninq', '999.0.0')
			} catch {
				// as above
			}
		})
		console.log('[playwright globalSetup] Conduction setup wizard dismissed for planninq')
	} catch (err) {
		console.warn(`[playwright globalSetup] could not dismiss the Conduction setup wizard: ${(err as Error).message}`)
	} finally {
		await page2.close()
	}

	// Persist the storage state so individual specs reuse the session.
	await context.storageState({ path: STORAGE_STATE })
	await browser.close()
}
