/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * E2E (UI-only) coverage for the label-management admin surfaces.
 *
 * Covers the non-excluded UI scenarios of the label-management-admin change
 * (gate-19 e2e-coverage), all on the admin-user-settings spec:
 *  - "View labels with usage counts"
 *  - "Create a label"
 *  - "Invalid color is rejected"
 *  - "Rename and recolor propagate by reference"
 *  - "Delete a used label"
 *
 * API/contract assertions (the 403 admin-only contract, the cascade idempotency
 * after a partial failure, and the register re-import not resurrecting deleted
 * labels) live in Newman / PHPUnit per the Playwright-UI-only / Newman-for-API
 * convention — those scenarios are annotated `@e2e exclude` in the spec delta.
 *
 * A fixture label ("E2E Bug") is seeded by `tests/e2e/global-setup.ts` (via
 * `fixtures/seed.ts`) and attached to a seeded task, so the admin Label
 * management section renders its list and controls unconditionally. Only the
 * legitimate "planninq not installed" skip remains; the former "section not
 * present" guards are now hard `expect(...)` assertions.
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { BASE_URL as NC } from './base-url.ts'

const SETTINGS_URL = `${NC}/index.php/settings/admin/planninq`

/**
 * The open label dialog (NcDialog renders `role="dialog"`).
 *
 * Both label dialogs share button names with controls that stay mounted behind
 * them — "Save" with four settings forms, "Delete label" with every row's own
 * delete control — so dialog interactions must be scoped or Playwright's strict
 * mode aborts on the multiple matches.
 *
 * @param page the Playwright page
 * @return a locator for the open dialog
 */
function dialog(page: Page) {
	// `.last()` because NcDialog can render a native <dialog> (implicit role
	// "dialog") inside an NcModal wrapper that also declares role="dialog";
	// the innermost one is the one holding the action buttons.
	return page.getByRole('dialog').last()
}

/**
 * THREE OF THESE SCENARIOS CANNOT BE COVERED, AND NOT FOR WANT OF A TEST.
 *
 * `create-a-label`, `rename-and-recolor-propagate-by-reference` and
 * `delete-a-used-label` each close on a clause about the LABEL CHIP ON A TASK
 * CARD and the BOARD LABEL FILTER:
 *
 *   "AND it MUST be selectable on tasks and in the board label filter"
 *   "AND the task card chip ... MUST show `Defect` in orange on next render"
 *   "AND the chip MUST disappear from board cards and the label filter"
 *
 * Neither surface exists. Measured 2026-09-08 across the whole frontend:
 * `task.labels` is read in exactly one place, `src/views/settings/Settings.vue`,
 * which is this admin list. `TaskCard.vue` renders due-date, status, priority
 * and estimate chips and has no label chip; `ProjectBoard.vue` has no label
 * filter. That is why the rename test below asserts on the settings page: the
 * board has nothing to assert against.
 *
 * So they are left UNANCHORED on purpose. Anchoring them would report three
 * MVP scenarios as covered on the strength of a test that cannot reach the
 * half of each scenario that matters, which is the exact defect gate-19 was
 * written to prevent. The gap is a missing FEATURE, not a missing test, and it
 * needs either the chip and filter built or the spec amended.
 *
 * The two anchored below are covered outright, clause for clause.
 */
test.describe('Label management — admin settings', () => {
	// @e2e admin-user-settings::view-labels-with-usage-counts
	test('View labels with usage counts', async ({ page }) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		const section = page.getByText(/Label management/i)
		await expect(section.first()).toBeVisible()

		// Seed label "E2E Bug" listed with a usage count (attached to a task).
		await expect(page.getByText(/E2E Bug/i).first()).toBeVisible()
		await expect(page.getByText(/used by \d+ tasks?/i).first()).toBeVisible()
	})

	test('Create a label with a custom color', async ({ page }) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		const createBtn = page
			.getByRole('button', { name: /Create label/i })
			.first()
		await expect(createBtn).toBeVisible()
		await createBtn.click()

		// A run-unique title, because labels are NOT reset between runs.
		//
		// Labels are app-wide OpenRegister objects that outlive the suite, so a
		// fixed "Tech debt" accumulates one row per run against a persistent
		// instance and the closing `getByText(...)` then resolves to several
		// elements, which strict mode rejects. CI always starts from a fresh
		// install so it never saw this; a developer re-running against the same
		// container hits it on the second run.
		const title = `Tech debt ${Date.now()}`
		await page.getByLabel(/Title/i).fill(title)
		await page.getByLabel(/Hex color/i).fill('#33AA55')
		// Scoped to the dialog for the same reason as the Save/Delete clicks
		// below — the list's own trigger is "+ Create label", which does not
		// collide today, but the page behind the dialog stays mounted.
		await dialog(page)
			.getByRole('button', { name: /^Create$/i })
			.click()

		await expect(page.getByText(title)).toBeVisible()
	})

	// @e2e admin-user-settings::invalid-color-is-rejected
	//
	// The scenario's second clause — a direct API write with an invalid colour
	// is rejected by schema validation with HTTP 400 — is the wire contract,
	// and belongs to Newman under the Playwright-UI-only convention this file
	// already follows. The clause asserted here is the dialog's, in full.
	test('Invalid color is rejected in the dialog', async ({ page }) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		const createBtn = page
			.getByRole('button', { name: /Create label/i })
			.first()
		await expect(createBtn).toBeVisible()
		await createBtn.click()

		await page.getByLabel(/Title/i).fill('Bad color')
		await page.getByLabel(/Hex color/i).fill('not-a-hex')
		// Validation error shown; create disabled / no save.
		await expect(page.getByText(/6-digit hex code/i)).toBeVisible()
	})

	test('Rename and recolor propagate to task chips by reference', async ({
		page,
	}) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		const editBtn = page
			.getByRole('button', { name: /Edit label/i })
			.first()
		await expect(editBtn).toBeVisible()
		await editBtn.click()

		await page.getByLabel(/Title/i).fill('Defect')
		await page.getByLabel(/Hex color/i).fill('#FF8800')
		// Scope the Save click to the DIALOG.
		//
		// The admin panel behind this dialog renders four independent settings
		// forms, each with its own "Save" button — default columns, project
		// creation, notification lead time and the legacy register
		// configuration. A page-wide `getByRole('button', { name: /^Save$/i })`
		// therefore resolves to five elements and Playwright's strict mode
		// aborts the test before it clicks anything.
		await dialog(page)
			.getByRole('button', { name: /^Save$/i })
			.click()

		// Re-render reflects the new title on the board chip (no task write).
		await expect(page.getByText(/Defect/i).first()).toBeVisible()
	})

	test('Delete a used label via the usage-warning dialog', async ({
		page,
	}) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		// WHICH label is deleted has to be known, or the outcome cannot be
		// asserted. This test used to click the first delete control and stop,
		// so it never learned the row's title and had nothing to check
		// afterwards. Read the title first, then delete THAT row.
		const firstRow = page.locator('.label-mgmt__item').first()
		await expect(firstRow).toBeVisible()
		const doomed = (
			await firstRow.locator('.label-mgmt__title').innerText()
		).trim()
		expect(doomed).not.toBe('')

		await firstRow.getByRole('button', { name: /Delete label/i }).click()

		// Confirmation dialog warns about the usage count before deleting.
		await expect(page.getByText(/will be removed from \d+ tasks?/i)).toBeVisible()
		// Scope the confirm click to the DIALOG.
		//
		// Every row in the label list carries a delete control whose accessible
		// name is its `aria-label`, "Delete label" — exactly the name the
		// dialog's confirm button also has. Once the list renders even one
		// label, a page-wide match resolves to two elements and strict mode
		// aborts. (This never surfaced before because the list was always
		// empty: see LabelService::fetchAll(), which searched with no
		// register/schema context and returned nothing on every instance.)
		await dialog(page)
			.getByRole('button', { name: /^Delete label$/i })
			.click()

		// THE ASSERTION THIS TEST WAS MISSING.
		//
		// It ended on the confirm click. A click is a request, not an outcome:
		// the label could have survived, the cascade could have failed, the
		// dialog could have stayed open, and this test would have passed on all
		// three. The row is gone, or the delete did not happen.
		await expect(page.locator('.label-mgmt__item').filter({ hasText: doomed })).toHaveCount(0, { timeout: 15_000 })
	})
})
