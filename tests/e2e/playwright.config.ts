/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * CI regression config for the shared `E2E Tests (Playwright)` job.
 *
 * WHY A SECOND CONFIG EXISTS
 * --------------------------
 * The shared workflow (ConductionNL/.github/.github/workflows/quality.yml)
 * runs the suite as:
 *
 *     CONFIG="${{ inputs.playwright-test-path }}/playwright.config.ts"
 *     if [ ! -f "$CONFIG" ] && [ -f "playwright.config.ts" ]; then
 *       CONFIG="playwright.config.ts"
 *     fi
 *     npx playwright test --config="$CONFIG"
 *
 * Note what is missing: `--project`. Whichever config it picks, EVERY project
 * in it runs. The root `playwright.config.ts` declares two:
 *
 *   chromium     — the regression suite. This is the one CI wants.
 *   docs-capture — journeydoc screenshot capture (ADR-030). It re-shoots every
 *                  tutorial screenshot into `docs/static/screenshots/…` and is
 *                  driven deliberately by `npm run test:e2e:docs` (and by the
 *                  dedicated `Journeydoc Capture` job, which passes
 *                  `--project docs-capture` explicitly).
 *
 * Letting the root config be picked would therefore make every PR re-shoot the
 * documentation screenshots as a side effect of running the regression suite.
 * Rather than delete or weaken the docs project, `playwright-test-path:
 * tests/e2e` in the caller makes the workflow's FIRST lookup hit this file,
 * which declares only the regression project. The root config is untouched and
 * stays the entry point for local runs and `npm run test:e2e:docs`.
 *
 * ⚠️ `testIgnore` HAS TO BE REPEATED AT PROJECT LEVEL.
 * A project-level `testIgnore` REPLACES the top-level one, it does not merge
 * with it. The root config carries `testIgnore: ['**\/global-setup.ts',
 * '**\/fixtures/**']` at the top level and `['**\/docs-screenshots.spec.ts']`
 * on the chromium project, so the two only combine there because Playwright
 * applies the top-level filter to the file list before the project filter.
 * Here the same three patterns are listed on the project itself as well, so a
 * future reader cannot delete the top-level list and silently start collecting
 * `global-setup.ts` and `fixtures/seed.ts` as if they were specs (both export
 * helpers, not tests — Playwright errors with "no tests found in file").
 *
 * ARTIFACT PATHS
 * --------------
 * Unlike the opencatalogi reference this config does NOT move the report and
 * output directories to the app root. Planninq has a TRACKED `test-results/`
 * directory at the repo root (12 markdown persona-test reports, kept in git on
 * purpose — see the `test-results/**\/*.png` rules in .gitignore), and pointing
 * Playwright's `outputDir` at it would drop trace/screenshot folders into a
 * documentation directory. The shared workflow's upload steps list
 * `server/apps/<app>/tests/e2e/playwright-report/` and
 * `.../tests/e2e/test-results/` alongside the app-root paths, so keeping the
 * scaffolded `tests/e2e/…` locations still produces a downloadable report and
 * trace artifact on CI.
 */

import { defineConfig, devices } from '@playwright/test'
import * as path from 'path'
import { BASE_URL } from './base-url.ts'

export default defineConfig({
	testDir: __dirname,
	// See the header: also repeated on the project below, because a
	// project-level testIgnore replaces rather than extends this list.
	testIgnore: ['**/global-setup.ts', '**/fixtures/**'],
	globalSetup: path.resolve(__dirname, 'global-setup.ts'),
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: [
		[
			'html',
			{
				open: 'never',
				outputFolder: path.resolve(__dirname, 'playwright-report'),
			},
		],
		['list'],
	],
	outputDir: path.resolve(__dirname, 'test-results'),

	use: {
		// Single source of truth — see tests/e2e/base-url.ts.
		baseURL: BASE_URL,
		// Written by global-setup.ts after the admin login.
		storageState: path.resolve(__dirname, '.auth', 'admin.json'),
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},

	projects: [
		{
			name: 'chromium',
			testIgnore: [
				'**/global-setup.ts',
				'**/fixtures/**',
				'**/docs-screenshots.spec.ts',
			],
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
