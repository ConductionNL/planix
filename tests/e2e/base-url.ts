/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * ONE place that decides which Nextcloud the e2e suite talks to.
 *
 * Why this file exists
 * --------------------
 * Every spec used to compute its own target as
 *
 *     const NC = process.env.NEXTCLOUD_URL || 'http://localhost:8080'
 *
 * and `playwright.config.ts` and `global-setup.ts` each had their own copy of
 * the same expression. Two things were wrong with that:
 *
 *  1. `PLAYWRIGHT_BASE_URL` — the variable every runbook and every sibling app
 *     in this programme uses to point a suite at a disposable instance — was
 *     ignored outright. Exporting it did nothing.
 *  2. The `|| 'http://localhost:8080'` default is the SHARED development
 *     container on this box. It bind-mounts real host checkouts, so a suite
 *     that quietly falls back to it creates fixture projects, labels and tasks
 *     in other people's environment — and the seeder's failed writes register
 *     as failed logins against it. Two apps in this programme were found doing
 *     exactly this.
 *
 * So: the target must be stated explicitly. Locally there is NO default; a
 * missing variable is a hard error naming the fix, not a silent redirect onto
 * somebody else's instance.
 *
 * The one exception is CI. A GitHub runner has no shared instance — the
 * workflow starts a throwaway Nextcloud on the runner's own localhost:8080 —
 * so falling back there is safe.
 *
 * ⚠️ `BASE_URL` is in the list on purpose. The shared
 * `Conduction/.github` quality workflow exports the target as **`BASE_URL`**,
 * not `PLAYWRIGHT_BASE_URL` and not `NEXTCLOUD_URL`. openconnector adopted a
 * `PLAYWRIGHT_BASE_URL`-only resolver during its own Vue 3 migration and its
 * "E2E Tests (Playwright)" job has hard-failed on every run since with
 * "Error: PLAYWRIGHT_BASE_URL is not set." Accepting the workflow's own
 * variable is what keeps a strict resolver compatible with CI.
 */

import { assertInstancePermitted } from './shared-instance.ts'

const CI_DEFAULT_BASE_URL = 'http://localhost:8080'

/**
 * Resolve the Nextcloud base URL for this run.
 *
 * @return the base URL, without a trailing slash
 * @throws when no target is configured outside CI, and when the target names
 *         the shared development instance without the opt-in flag that
 *         permits it (see shared-instance.ts)
 */
export function resolveBaseURL(): string {
	const explicit
		= process.env.PLAYWRIGHT_BASE_URL
			?? process.env.NEXTCLOUD_URL
			?? process.env.NC_BASE_URL
		// Exported by the shared Conduction/.github quality workflow.
			?? process.env.BASE_URL

	if (explicit) {
		return assertInstancePermitted(explicit.replace(/\/+$/, ''))
	}

	if (process.env.CI) {
		console.warn('[planninq e2e] no PLAYWRIGHT_BASE_URL / NEXTCLOUD_URL set; using the CI-local '
			+ `default ${CI_DEFAULT_BASE_URL}.`)
		return CI_DEFAULT_BASE_URL
	}

	throw new Error('[planninq e2e] No target Nextcloud configured. Set PLAYWRIGHT_BASE_URL (preferred), '
		+ 'NEXTCLOUD_URL or BASE_URL to the instance you want to test, e.g.\n\n'
		+ '    PLAYWRIGHT_BASE_URL=http://localhost:8095 npx playwright test\n\n'
		+ 'There is deliberately no default: the historic one was http://localhost:8080, '
		+ 'the SHARED development container, and writing fixtures into it corrupts other '
		+ "people's environments.")
}

/** The resolved base URL for this run. */
export const BASE_URL = resolveBaseURL()
