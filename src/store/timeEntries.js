import { getCurrentUser } from '@nextcloud/auth'
/**
 * TimeEntry Pinia store.
 *
 * CRUD for the `timeEntry` schema against OpenRegister via the shared
 * Conduction nextcloud-vue objectStore (ADR-022 — consumed, not
 * reimplemented). The per-owner authorization guard already exists on the
 * schema (`planninq_register.json`: update/delete scoped to
 * `match: { user: "$userId" }` OR admin), so a direct non-owner write is
 * rejected server-side; this store only adds the read/write plumbing and an
 * `canModify` helper the UI uses to hide edit/delete controls to match.
 *
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @spec openspec/specs/time-tracking.md
 */
import { defineStore } from 'pinia'
import { useObjectStore } from './objectStore.js'

// The OpenRegister register SLUG, not the app id. It moved from `planix` to
// `planninq` together with the MigrateRegisterSlug repair step, which renames
// the register ROW: OR resolves a register by slug and by nothing else, so the
// literal and the row move in the same release or neither resolves.
const REGISTER = 'planninq'
const TIME_ENTRY_SCHEMA = 'plannedTimeEntry'

export const useTimeEntriesStore = defineStore('timeEntries', {
	state: () => ({
		/** @type {Array} Entries currently loaded (task- or user-scoped). */
		entries: [],
		/** @type {boolean} */ loading: false,
		/** @type {string|null} */ error: null,
	}),

	getters: {
		/**
		 * Total logged minutes across the currently-loaded entries.
		 *
		 * @param {object} state Store state.
		 * @return {number} Sum of durations.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		totalMinutes: (state) => state.entries.reduce((acc, e) => acc + (Number(e.duration) || 0), 0),
	},

	actions: {
		/**
		 * @spec exclude Internal helper — lazily registers the timeEntry type on the shared object store.
		 */
		_objectStore() {
			const store = useObjectStore()
			if (!store.objectTypeRegistry?.[TIME_ENTRY_SCHEMA]) {
				// Schema constant IS the canonical OR slug — pass it as a slug hint
				// so liveUpdatesPlugin can derive the collection event key without
				// a lazy register/schema fetch on first subscribe().
				store.registerObjectType(TIME_ENTRY_SCHEMA, TIME_ENTRY_SCHEMA, REGISTER, { registerSlug: REGISTER, schemaSlug: TIME_ENTRY_SCHEMA })
			}
			return store
		},

		/**
		 * @spec exclude Auth passthrough — the current user's UID.
		 */
		_currentUid() {
			return getCurrentUser()?.uid || ''
		},

		/**
		 * Whether the current user may edit/delete `entry` — the entry's owner
		 * or an admin. Mirrors the schema RBAC so the UI hides controls the API
		 * would reject (defence in depth).
		 *
		 * @param {object} entry The time entry.
		 * @return {boolean}
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		canModify(entry) {
			const uid = this._currentUid()
			const admin = getCurrentUser()?.isAdmin === true
			return admin || (!!uid && entry?.user === uid)
		},

		/**
		 * Load all time entries for a task (all users — the task's total logged
		 * time is the sum of every user's entries).
		 *
		 * @param {string} taskId Task UUID.
		 * @return {Promise<Array>}
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async fetchForTask(taskId) {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				this.entries = await objectStore.fetchCollection(TIME_ENTRY_SCHEMA, { task: taskId })
				return this.entries
			} catch (err) {
				this.error = err.message || 'fetch-error'
				console.error('fetchForTask error:', err)
				this.entries = []
				return []
			} finally {
				this.loading = false
			}
		},

		/**
		 * Load the current user's time entries (for the timesheet). Filtered
		 * client-side by owner (the schema exposes reads to project members, so
		 * the timesheet restricts to the viewing user's own rows).
		 *
		 * @return {Promise<Array>}
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async fetchForCurrentUser() {
			this.loading = true
			this.error = null
			try {
				const objectStore = this._objectStore()
				const uid = this._currentUid()
				const all = await objectStore.fetchCollection(TIME_ENTRY_SCHEMA, {})
				this.entries = uid ? all.filter((e) => e.user === uid) : all
				return this.entries
			} catch (err) {
				this.error = err.message || 'fetch-error'
				console.error('fetchForCurrentUser error:', err)
				this.entries = []
				return []
			} finally {
				this.loading = false
			}
		},

		/**
		 * Create a time entry. `user` defaults to the current user and `date`
		 * to today when omitted.
		 *
		 * @param {{task: string, duration: number, date?: string, description?: string}} data Entry fields.
		 * @return {Promise<object|null>} Created entry or null on failure.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async create(data) {
			try {
				const objectStore = this._objectStore()
				const payload = {
					user: this._currentUid(),
					date: new Date().toISOString().slice(0, 10),
					...data,
				}
				const saved = await objectStore.saveObject(TIME_ENTRY_SCHEMA, payload)
				if (saved) {
					this.entries = [...this.entries, saved]
				}
				return saved
			} catch (err) {
				this.error = err.message || 'create-error'
				console.error('timeEntry create error:', err)
				return null
			}
		},

		/**
		 * Update a time entry's mutable fields (duration/date/description).
		 *
		 * @param {string} id Entry UUID.
		 * @param {object} patch Fields to change.
		 * @return {Promise<object|null>} Updated entry or null on failure.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async update(id, patch) {
			try {
				const objectStore = this._objectStore()
				const saved = await objectStore.saveObject(TIME_ENTRY_SCHEMA, { id, ...patch })
				if (saved) {
					this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...saved } : e))
				}
				return saved
			} catch (err) {
				this.error = err.message || 'update-error'
				console.error('timeEntry update error:', err)
				return null
			}
		},

		/**
		 * Delete a time entry.
		 *
		 * @param {string} id Entry UUID.
		 * @return {Promise<boolean>} True on success.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async delete(id) {
			try {
				const objectStore = this._objectStore()
				const ok = await objectStore.deleteObject(TIME_ENTRY_SCHEMA, id)
				if (ok) {
					this.entries = this.entries.filter((e) => e.id !== id)
				}
				return !!ok
			} catch (err) {
				this.error = err.message || 'delete-error'
				console.error('timeEntry delete error:', err)
				return false
			}
		},
	},
})
