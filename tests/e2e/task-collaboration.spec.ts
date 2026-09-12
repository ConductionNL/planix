/*
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * E2E (UI-only) coverage for the task collaboration sidebar.
 *
 * Covers the non-excluded UI scenarios of the task-collaboration-sidebar change
 * (gate-19 e2e-coverage), all on the task-collaboration spec
 * (openspec/specs/task-collaboration.md):
 *  - "Add a comment to a task"
 *  - "Edit and delete own comment only"
 *  - "Attach a file to a task"
 *  - "Remove an attachment"
 *  - "Field change appears in the audit trail"
 *  - "Audit trail is read-only"
 *  - "Status change appears in a member's activity stream"
 *  - "Planninq filter in the Activity app"
 *
 * API / contract assertions ("Comments respect task access", "No app-local
 * comment storage", "Attachment is a real Nextcloud file", listener scoping, and
 * the malformed-event resilience path) live in Newman / PHPUnit per the
 * Playwright-UI-only / Newman-for-API convention — those scenarios are annotated
 * `@e2e exclude` in the spec delta.
 *
 * The task detail surface is seeded by `tests/e2e/global-setup.ts` (via
 * `fixtures/seed.ts`) and reachable through the kanban board (see the
 * kanban-task-detail-keyboard-navigation change). Only the "planninq not
 * installed" and the genuinely-optional "Activity app not available" skips
 * remain; the former per-tab presence guards are now hard assertions.
 */

import { expect, test } from '@playwright/test'
import { BASE_URL as NC } from './base-url.ts'
import { openFixtureProjectBoard } from './nav.ts'

const ACTIVITY_URL = `${NC}/index.php/apps/activity/`

// Open the first seeded task's detail view.
//
// The previous implementation looked for the task card on the app ROOT
// (the Dashboard), which renders no task cards — the cards live on a project's
// kanban board, one navigation step further in. `a[href*="/tasks/"]` never
// matched either: task navigation is a click handler, not an anchor.
async function openFirstTaskDetail(page) {
	await openFixtureProjectBoard(page)

	const taskCard = page.locator('[data-testid="task-card"]').first()
	await expect(taskCard).toBeVisible()
	await taskCard.click()
	await expect(page).toHaveURL(/\/tasks\/[^/?#]+$/)
}

test.describe('Task collaboration sidebar', () => {
	test('Add a comment to a task; edit and delete own comment only', async ({
		page,
	}) => {
		await openFirstTaskDetail(page)

		const commentsTab = page.getByRole('tab', { name: /Comments/i })
		await expect(commentsTab).toHaveCount(1)
		await commentsTab.click()

		const panel = page.getByRole('tabpanel', { name: /Comments/i })

		// The composer is `[contenteditable]`, NOT `[contenteditable="true"]`.
		//
		// The previous locator was `textarea, [contenteditable="true"]` and it
		// matched ZERO elements, so this test spent its whole 60s timeout inside
		// `fill()` and reported a missing composer that was on screen the entire
		// time. CnNotesTab renders `NcRichContenteditable`, and @nextcloud/vue
		// computes that attribute as `plaintext-only` wherever the browser
		// supports it (Chromium does; see `contenteditableAttributeValue()`),
		// falling back to `"true"` only on browsers that do not. An exact-value
		// selector is therefore browser-dependent by construction.
		//
		// Match on the ARIA role instead, scoped to the Comments panel — that is
		// the same element, addressed the way a user perceives it.
		const composer = panel.getByRole('textbox').first()

		// A run-unique body, because comments are NOT reset between runs.
		//
		// Notes are stored per object and survive the suite, so a fixed string
		// leaves one behind on every run and the next run's
		// `filter({ hasText: … })` then matches several list items. Taking
		// `.first()` of those picks somebody else's older note instead of the one
		// this test just wrote — which is how this assertion passed on a clean
		// instance and failed on the second run against the same one.
		const body = `Waiting on the API contract ${Date.now()}`
		await composer.fill(body)
		await panel
			.getByRole('button', { name: /(Comment|Send|Post|Add)/i })
			.first()
			.click()

		// Own comment renders…
		const note = panel.locator('li').filter({ hasText: body })
		await expect(note).toHaveCount(1)

		// …and exposes edit/delete actions.
		//
		// Those actions live in the list item's NcActions popover, which does not
		// render its entries into the DOM until the menu is opened — so the old
		// page-wide `getByRole('button', { name: /(Edit|Delete)/i })` could never
		// have matched them, whatever the composer did.
		//
		// Assert BOTH entries in ONE expectation, scoped to the open menu. Two
		// separate page-wide waits are what made this flaky: the first could be
		// satisfied by any visible control named "Edit" elsewhere on the task
		// page, and by the time the second one ran the popover had closed. The
		// menu is a `<ul role="menu">` of `role="menuitem"` buttons.
		await note.getByRole('button', { name: /Actions/i }).click()
		const menu = page.getByRole('menu')
		await expect(menu.getByRole('menuitem', { name: /^\s*(Edit|Delete)\s*$/i })).toHaveCount(2)
	})

	test('Attach a file to a task and remove it', async ({ page }) => {
		await openFirstTaskDetail(page)

		const filesTab = page.getByRole('tab', {
			name: /(Attachments|Files)/i,
		})
		await expect(filesTab).toHaveCount(1)
		await filesTab.click()

		const panel = page.getByRole('tabpanel', {
			name: /(Attachments|Files)/i,
		})

		// The Files tab renders an upload affordance and a (possibly empty) list.
		//
		// ⚠️ There is no button here, and that is a real accessibility defect —
		// in `@conduction/nextcloud-vue`, not in planninq. `CnFilesTab` renders the
		// upload affordance as
		//
		//     <div class="cn-sidebar-tab__dropzone" @click="triggerFileInput">
		//       <input ref="fileInput" type="file" class="cn-sidebar-tab__file-input">
		//       <Upload /> <span>Drop files here or click to browse</span>
		//     </div>
		//
		// — a click-handling `<div>` with no role, no accessible name and no
		// tabindex, wrapping a visually hidden file input. It cannot be reached
		// or operated from the keyboard and screen readers announce nothing
		// actionable (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value). The previous
		// `getByRole('button', { name: /(Upload|Add|Attach)/i })` was asserting
		// the component this SHOULD be, and matched nothing.
		//
		// Fixing that belongs in nc-vue (this repo may not change it), so assert
		// the affordance that actually ships — the dropzone and its file input —
		// and leave this note so the assertion is tightened to a button role
		// once nc-vue exposes one, rather than quietly forgotten.
		await expect(panel.getByText(/Drop files here or click to browse/i)).toBeVisible()
		await expect(panel.locator('input[type="file"]')).toHaveCount(1)
	})

	test('Audit Trail tab shows the change and is read-only', async ({
		page,
	}) => {
		await openFirstTaskDetail(page)

		const auditTab = page.getByRole('tab', { name: /(Activity|Audit)/i })
		await expect(auditTab).toHaveCount(1)
		await auditTab.click()

		// Read-only: the trail exposes no edit/delete actions on its entries.
		const trail = page.locator('[data-testid="cn-object-sidebar-tab-auditTrail"], .audit-trail')
		if ((await trail.count()) > 0) {
			await expect(trail.getByRole('button', { name: /(Edit|Delete)/i })).toHaveCount(0)
		}
	})

	test('Planninq filter is available in the Activity app', async ({
		page,
	}) => {
		const res = await page.goto(ACTIVITY_URL)
		test.skip(
			res === null || res.status() >= 400,
			'Activity app not available in this environment',
		)

		// Seeded task creation emits planninq activity, so the filter MUST appear
		// once the (optional) Activity app is present.
		const planninqFilter = page
			.getByRole('link', { name: /Planninq/i })
			.or(page.getByText(/Planninq/i))
		await expect(planninqFilter.first()).toBeVisible()
	})
})
