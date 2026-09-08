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
 * Two fixture labels are seeded by `tests/e2e/global-setup.ts` (via
 * `fixtures/seed.ts`) and attached to seeded tasks: "E2E Bug" on the due-soon
 * task, and "E2E Doomed" on the normal task for the delete scenario to consume.
 * So the admin Label management section renders its list and controls
 * unconditionally. Only the legitimate "planninq not installed" skip remains;
 * the former "section not present" guards are now hard `expect(...)`
 * assertions.
 *
 * THREE OF THESE SCENARIOS CLOSE ON THE BOARD, NOT ON THIS PAGE:
 *
 *   "AND it MUST be selectable on tasks and in the board label filter"
 *   "AND the task card chip ... MUST show `Defect` in orange on next render"
 *   "AND the chip MUST disappear from board cards and the label filter"
 *
 * Each of those three tests therefore ends on the kanban board, on the task
 * card label chip and the board label filter. They used to end on this settings
 * page, because until the chip and the filter existed the board had nothing to
 * assert against.
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { BASE_URL as NC } from './base-url.ts'
import { FIXTURE } from './fixtures/seed.ts'
import { openFixtureProjectBoard } from './nav.ts'

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
 * The label management row for one label title.
 *
 * @param page  the Playwright page
 * @param title the exact label title
 * @return a locator for that row
 */
function labelRow(page: Page, title: string) {
	return page.locator('.label-mgmt__item').filter({ hasText: title })
}

/**
 * The board's label filter chips.
 *
 * @param page the Playwright page
 * @return a locator for every filter chip
 */
function labelFilterChips(page: Page) {
	return page.locator('[data-testid="label-filter-chip"]')
}

/**
 * The label chips rendered on the board's task cards.
 *
 * @param page the Playwright page
 * @return a locator for every task card label chip
 */
function taskLabelChips(page: Page) {
	return page.locator('[data-testid="task-label-chip"]')
}

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

	// @e2e admin-user-settings::create-a-label
	//
	// The scenario's last clause is "AND it MUST be selectable on tasks and in
	// the board label filter", so this test does not stop at the admin list: it
	// opens the board and requires the new label to be offered by the filter,
	// and to filter the board down to the nothing that carries it (usage 0).
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

		// ── The board half of the scenario ──────────────────────────────────
		await openFixtureProjectBoard(page)

		const chip = labelFilterChips(page).filter({ hasText: title })
		await expect(chip).toHaveCount(1)

		// Selectable, and it selects honestly: a brand-new label is on no task,
		// so filtering by it must empty the board. A filter that showed every
		// card here would pass a `toBeVisible` on the chip and prove nothing.
		await chip.click()
		await expect(page.locator('[data-testid="task-card"]')).toHaveCount(0)
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

	// @e2e admin-user-settings::rename-and-recolor-propagate-by-reference
	//
	// A task stores the label's UUID, never a copy of its title or colour, so
	// this scenario's "no task object may be modified" is what makes the last
	// clause reachable at all: the card re-renders from the label object.
	//
	// Nothing restores the rename afterwards on purpose — `fixtures/seed.ts`
	// re-asserts the fixture label and its attachment on every run, so the
	// precondition belongs to the harness rather than to whichever spec ran
	// last (the same rule the seeder already applies to the admin settings).
	test('Rename and recolor propagate to task chips by reference', async ({
		page,
	}) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		// Edit THE FIXTURE LABEL, not "the first row". The first row is whatever
		// sorts first on this instance — one of the register's own seed labels —
		// and renaming that leaves nothing on the board to assert against.
		const row = labelRow(page, FIXTURE.labelTitle)
		await expect(row).toHaveCount(1)
		await row.getByRole('button', { name: /Edit label/i }).click()

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

		// ── The board half of the scenario ──────────────────────────────────
		await openFixtureProjectBoard(page)

		// The card chip shows the NEW name...
		const chip = taskLabelChips(page).filter({ hasText: 'Defect' })
		await expect(chip).toHaveCount(1)

		// ...in the NEW colour. The name alone would still pass if the recolor
		// had been dropped, and colour is half of what this scenario claims.
		await expect(chip.locator('.task-card__label-swatch')).toHaveCSS(
			'background-color',
			'rgb(255, 136, 0)',
		)

		// The old name is gone from both surfaces — one label object, one name.
		await expect(taskLabelChips(page).filter({ hasText: FIXTURE.labelTitle })).toHaveCount(0)
		await expect(labelFilterChips(page).filter({ hasText: 'Defect' })).toHaveCount(1)
	})

	// @e2e admin-user-settings::delete-a-used-label
	test('Delete a used label via the usage-warning dialog', async ({
		page,
	}) => {
		const res = await page.goto(SETTINGS_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		// Delete the label seeded FOR this scenario, not "the first row".
		//
		// This test used to click the first delete control and stop, so it never
		// learned which row it had destroyed and had nothing to check afterwards.
		// The row it reached was also whichever label sorted first on the
		// instance, which on a seeded install is one of the register's own.
		// `E2E Doomed` exists for this test, is attached to the seeded normal
		// task (so the cascade has real work to do), and is re-seeded on the
		// next run.
		const doomed = FIXTURE.doomedLabelTitle
		const row = labelRow(page, doomed)
		await expect(row).toHaveCount(1)
		await row.getByRole('button', { name: /Delete label/i }).click()

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
		await expect(labelRow(page, doomed)).toHaveCount(0, { timeout: 15_000 })

		// ── The board half of the scenario ──────────────────────────────────
		//
		// "AND the chip MUST disappear from board cards and the label filter".
		// The cascade sweeps the UUID out of the task server-side, so the card
		// that carried it renders no chip for it and the filter no longer
		// offers it.
		await openFixtureProjectBoard(page)

		await expect(taskLabelChips(page).filter({ hasText: doomed })).toHaveCount(0)
		await expect(labelFilterChips(page).filter({ hasText: doomed })).toHaveCount(0)

		// The board still renders — the cascade removed one reference, not the
		// task. Without this a board that failed to load would satisfy both
		// counts above.
		await expect(page.locator('[data-testid="task-card"]')).not.toHaveCount(0)
	})
})
