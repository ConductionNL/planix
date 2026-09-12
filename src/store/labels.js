import { buildHeaders } from '@conduction/nextcloud-vue'
import { generateUrl } from '@nextcloud/router'
/**
 * Labels Pinia store.
 *
 * App-wide label management for the admin settings page. List/create/edit go
 * straight to the OpenRegister object API (ADR-022 — labels are plain OR objects
 * on the `label` schema, validated by the schema's `^#[0-9A-Fa-f]{6}$` colour
 * pattern). The usage-count listing and the cascade delete route through the
 * Planninq admin endpoints because they add real server logic (aggregation and a
 * server-authoritative `task.labels` sweep) — see LabelService.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
import { defineStore } from 'pinia'

// The OpenRegister register SLUG, not the app id. It moved from `planix` to
// `planninq` together with the MigrateRegisterSlug repair step, which renames
// the register ROW: OR resolves a register by slug and by nothing else, so the
// literal and the row move in the same release or neither resolves.
const REGISTER = 'planninq'
const LABEL_SCHEMA = 'label'

export const useLabelsStore = defineStore('labels', {
	state: () => ({
		/** @type {Array<object>} Labels currently loaded, each with a usageCount. */
		labels: [],
		/** @type {boolean} */ loading: false,
		/** @type {string|null} Last error surfaced to the UI. */
		error: null,
	}),

	actions: {
		/**
		 * Fetch all labels with their usage counts from the Planninq admin endpoint.
		 *
		 * Uses the Planninq endpoint (not the raw OR API) because it returns the
		 * per-label task usage count alongside each label in one round-trip.
		 *
		 * @return {Promise<Array<object>>} The loaded labels (sorted by title server-side).
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async fetchLabels() {
			this.loading = true
			this.error = null
			try {
				const url = generateUrl('/apps/planninq/api/labels')
				const response = await fetch(url, { headers: buildHeaders() })
				if (!response.ok) {
					this.labels = []
					this.error = 'Failed to load labels.'
					return []
				}
				const data = await response.json()
				this.labels = Array.isArray(data.labels) ? data.labels : []
				return this.labels
			} catch {
				this.labels = []
				this.error = 'Failed to load labels.'
				return []
			} finally {
				this.loading = false
			}
		},

		/**
		 * Create a label directly via the OpenRegister object API (ADR-022).
		 *
		 * The schema enforces the colour pattern, so an invalid hex value is
		 * rejected by OR with a 4xx; the message is stored in `error`.
		 *
		 * @param {object} label The label fields ({ title, color, description }).
		 * @return {Promise<object>} The created label object.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async createLabel(label) {
			this.error = null
			const url = generateUrl(`/apps/openregister/api/objects/${REGISTER}/${LABEL_SCHEMA}`)
			const response = await fetch(url, {
				method: 'POST',
				headers: buildHeaders(),
				body: JSON.stringify(label),
			})
			if (!response.ok) {
				const body = await response.json().catch(() => ({}))
				this.error = body?.error || body?.detail || 'Failed to create label.'
				throw new Error(this.error)
			}
			await this.fetchLabels()
			return response.json().catch(() => ({}))
		},

		/**
		 * Update a label directly via the OpenRegister object API (ADR-022).
		 *
		 * Tasks reference labels by UUID, so a rename/recolor propagates to every
		 * task card chip and the board filter with no task writes.
		 *
		 * @param {string} id    UUID of the label to update.
		 * @param {object} label The label fields ({ title, color, description }).
		 * @return {Promise<object>} The updated label object.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async updateLabel(id, label) {
			this.error = null
			const url = generateUrl(`/apps/openregister/api/objects/${REGISTER}/${LABEL_SCHEMA}/${id}`)
			const response = await fetch(url, {
				method: 'PUT',
				headers: buildHeaders(),
				body: JSON.stringify(label),
			})
			if (!response.ok) {
				const body = await response.json().catch(() => ({}))
				this.error = body?.error || body?.detail || 'Failed to update label.'
				throw new Error(this.error)
			}
			await this.fetchLabels()
			return response.json().catch(() => ({}))
		},

		/**
		 * Delete a label through the Planninq cascade endpoint.
		 *
		 * The server removes the label's UUID from every referencing task before
		 * deleting the label object (idempotent), and reports how many tasks were
		 * swept so the caller can show a confirmation toast.
		 *
		 * @param {string} id UUID of the label to delete.
		 * @return {Promise<number>} Number of tasks the cascade updated.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async deleteLabel(id) {
			this.error = null
			const url = generateUrl(`/apps/planninq/api/labels/${id}`)
			const response = await fetch(url, {
				method: 'DELETE',
				headers: buildHeaders(),
			})
			if (!response.ok) {
				const body = await response.json().catch(() => ({}))
				this.error = body?.error || 'Failed to delete label.'
				throw new Error(this.error)
			}
			const data = await response.json().catch(() => ({}))
			this.labels = this.labels.filter((label) => label.id !== id)
			return data.tasksUpdated || 0
		},
	},
})
