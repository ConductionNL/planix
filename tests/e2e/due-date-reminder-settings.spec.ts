/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * E2E (UI-only) coverage for the due-date reminder settings surfaces.
 *
 * Covers the non-excluded UI scenarios of the due-date-reminder-dispatch
 * change (gate-19 e2e-coverage):
 *  - admin-user-settings spec: "Toggle due-date reminders off",
 *    "Toggle due-date reminders back on", "Lead-time field shown with
 *    default", "Saving a new lead time", "Invalid lead time rejected in
 *    the UI".
 *  - task-notifications spec: "Admin changes the lead time".
 *
 * API/contract assertions (the scheduled-job dispatch, OR override
 * persistence) live in Newman per the Playwright-UI-only / Newman-for-API
 * convention — these specs are annotated `@e2e exclude` in the deltas.
 *
 * The planninq app and its default due-date-reminder settings are present once
 * the app is installed (fixtures seeded by `tests/e2e/global-setup.ts`). Only
 * the legitimate "planninq not installed / admin not reachable" skips remain;
 * the former "settings entry / field not present" guards are now hard
 * `expect(...)` assertions.
 */

import { expect, test } from '@playwright/test'
import { BASE_URL as NC } from './base-url.ts'
import { openPlanninqSettingsDialog, PLANNINQ_ROOT } from './nav.ts'

test.describe('Due-date reminder — user settings dialog', () => {
	// @e2e admin-user-settings::toggle-due-date-reminders-off
	// @e2e admin-user-settings::toggle-due-date-reminders-back-on
	//
	// WHAT THIS TIER OWNS, AND WHAT IT DOES NOT. Both scenarios close on two
	// clauses this browser cannot see: the OpenRegister override stored for
	// (`task`, `taskDueSoon`), and whether a `task_due_soon` notification is
	// subsequently delivered. Neither is observable from a settings dialog, and
	// a test that pretended otherwise would be asserting its own optimism.
	//
	// What is asserted here is the whole of the user-facing clause: the toggle
	// starts on, goes off, SURVIVES A RELOAD off, comes back on, and survives a
	// reload on. The write-through and the delivery suppression belong to
	// PHPUnit, in the same division this file's sibling scenarios already use
	// (`@e2e exclude one-shot upgrade repair step, covered by PHPUnit`).
	test('Toggle due-date reminders off and back on persists', async ({
		page,
	}) => {
		const res = await page.goto(PLANNINQ_ROOT)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq not installed in this environment',
		)

		// Open the planninq user-settings dialog.
		//
		// The previous `getByRole('button', { name: /settings/i }).first()`
		// matched NEXTCLOUD's own header control (`aria-label="Settings menu"`),
		// which precedes the app navigation in the DOM — so this opened the user
		// menu and then waited out the timeout for a planninq toggle that was
		// never going to appear. See tests/e2e/nav.ts.
		await openPlanninqSettingsDialog(page)

		const toggle = page.getByText(/Notify me 1 day before a task's due date/i)
		await expect(toggle).toBeVisible()

		const checkbox = page.locator('input[type="checkbox"]').first()
		await expect(checkbox).toBeChecked()

		// Toggle off, reload, assert it persisted off.
		await toggle.click()
		await page.reload()
		await openPlanninqSettingsDialog(page)
		await expect(page.locator('input[type="checkbox"]').first()).not.toBeChecked()

		// Toggle back on.
		await page
			.getByText(/Notify me 1 day before a task's due date/i)
			.click()
		await page.reload()
		await openPlanninqSettingsDialog(page)
		await expect(page.locator('input[type="checkbox"]').first()).toBeChecked()
	})
})

test.describe('Due-date reminder — admin lead time', () => {
	// @e2e admin-user-settings::lead-time-field-shown-with-default
	// @e2e admin-user-settings::saving-a-new-lead-time
	// @e2e admin-user-settings::invalid-lead-time-rejected-in-the-ui
	//
	// The two persistence clauses are now RELOADED rather than inferred. The
	// test used to read a success toast and a validation message and stop, so
	// "MUST be stored via IAppConfig" and "no value MUST be persisted" were
	// both taken on the word of a banner. A toast is what the page says it did.
	//
	// The remaining clause of `saving-a-new-lead-time` — that the `taskDueSoon`
	// rule window is updated to match — belongs to the task-notifications
	// capability and is not observable from this page.
	test('Lead-time field default 24, save 48 persists, 0 shows a validation error', async ({
		page,
	}) => {
		const res = await page.goto(`${NC}/index.php/settings/admin/planninq`)
		test.skip(
			res === null || res.status() >= 400,
			'Planninq admin settings not reachable',
		)

		const field = page.locator('#due-reminder-lead-hours')
		await expect(field).toHaveCount(1)

		// Default is 24 on a fresh install.
		await expect(field).toHaveValue('24')

		// Scope the Save click to THIS form.
		//
		// The admin panel renders four independent settings forms, each with its
		// own "Save". `getByRole('button', { name: /save/i }).last()` therefore
		// submitted the LAST form on the page (the legacy register-id
		// configuration), never the lead-time form — so the success message this
		// test waits for could not appear, and the "0 is rejected" case never
		// exercised the validator either.
		const leadTimeForm = page.locator('form:has(#due-reminder-lead-hours)')
		const save = leadTimeForm.getByRole('button', { name: /save/i })

		// Save 48 → persists.
		await field.fill('48')
		await save.click()
		await expect(page.getByText(/Reminder lead time saved successfully/i)).toBeVisible()

		// "MUST be stored via IAppConfig" — read it back rather than believing
		// the toast. A success banner is what the page says it did.
		await page.reload()
		await expect(page.locator('#due-reminder-lead-hours')).toHaveValue('48')

		// 0 is rejected with an inline validation error and is not persisted.
		const field2 = page.locator('#due-reminder-lead-hours')
		await field2.fill('0')
		await page
			.locator('form:has(#due-reminder-lead-hours)')
			.getByRole('button', { name: /save/i })
			.click()
		await expect(page.getByText(/Lead time must be between 1 and 336 hours/i)).toBeVisible()

		// "AND no value MUST be persisted" — the half the validation message
		// does not prove. Without this, a page that showed the error AND wrote
		// 0 anyway would pass.
		await page.reload()
		await expect(page.locator('#due-reminder-lead-hours')).toHaveValue('48')
	})
})
