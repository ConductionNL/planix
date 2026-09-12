<template>
	<div class="member-search">
		<NcTextField
			:modelValue="query"
			:label="t('planninq', 'Add member')"
			:placeholder="t('planninq', 'Search for a user…')"
			:disabled="loading"
			@update:modelValue="onInput" />

		<!-- Dropdown results -->
		<ul
			v-if="results.length > 0"
			class="member-search__dropdown"
			role="listbox"
			:aria-label="t('planninq', 'User search results')">
			<li
				v-for="user in results"
				:key="user.id"
				class="member-search__result"
				role="option"
				tabindex="0"
				:aria-selected="false"
				@click="selectUser(user)"
				@keydown.enter="selectUser(user)">
				<NcAvatar :user="user.id" :size="24" :aria-label="user.displayName || user.id" />
				<span>{{ user.displayName || user.id }}</span>
			</li>
		</ul>

		<!-- Empty results notice -->
		<p v-else-if="query.length >= 2 && !loading && searched" class="member-search__empty">
			{{ t('planninq', 'No users found for "{query}"', { query }) }}
		</p>
	</div>
</template>

<script>
import { showError } from '@nextcloud/dialogs'
import { generateUrl } from '@nextcloud/router'
/**
 * MemberSearch component.
 *
 * Debounced OCS /cloud/users search for adding project members.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
 */
import { NcAvatar, NcTextField } from '@nextcloud/vue'
import { useProjectsStore } from '../store/projects.js'

export default {
	name: 'MemberSearch',

	components: { NcAvatar, NcTextField },

	props: {
		projectId: {
			type: String,
			required: true,
		},

		existingMembers: {
			type: Array,
			default: () => [],
		},
	},

	emits: ['added'],

	data() {
		return {
			query: '',
			results: [],
			loading: false,
			searched: false,
			debounceTimer: null,
			/** @type {AbortController|null} */
			abortController: null,
		}
	},

	/**
	 * @spec exclude Teardown glue — cancels the pending debounce timer and
	 *   aborts the in-flight request so neither can resolve against a
	 *   destroyed component. Both paths it tears down are the ones onInput
	 *   and searchUsers set up, and those are covered by task-10; this hook
	 *   adds no behaviour of its own for a scenario to describe.
	 */
	beforeUnmount() {
		clearTimeout(this.debounceTimer)
		this.abortController?.abort()
	},

	methods: {
		/**
		 * @spec exclude Event-wiring glue — debounces input and delegates to searchUsers (covered by task-10).
		 * @param {string} value The current search input value.
		 */
		onInput(value) {
			this.query = value
			this.searched = false
			clearTimeout(this.debounceTimer)
			// Cancel any in-flight request from the previous keystroke.
			this.abortController?.abort()
			if (value.length < 2) {
				this.results = []
				return
			}
			this.debounceTimer = setTimeout(() => this.searchUsers(value), 300)
		},

		/**
		 * Search Nextcloud users via OCS endpoint with 300ms debounce.
		 * Cancels in-flight requests via AbortController to avoid stale results.
		 * Surfaces errors to the user via showError toast instead of swallowing them.
		 *
		 * @param {string} term Search term
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async searchUsers(term) {
			this.abortController = new AbortController()
			this.loading = true
			try {
				const url = generateUrl('/ocs/v2.php/cloud/users')
				const resp = await fetch(`${url}?search=${encodeURIComponent(term)}&limit=10`, {
					signal: this.abortController.signal,
					headers: {
						requesttoken: OC.requestToken,
						'OCS-APIRequest': 'true',
					},
				})
				if (!resp.ok) {
					throw new Error(`${resp.status} ${resp.statusText}`)
				}
				const data = await resp.json()
				const users = data.ocs?.data?.users || data.ocs?.data || []
				// Normalise to { id, displayName }
				this.results = (Array.isArray(users) ? users : Object.keys(users)).map((u) => typeof u === 'string' ? { id: u, displayName: u } : u).filter((u) => !this.existingMembers.includes(u.id))
			} catch (err) {
				// Ignore abort errors — they occur when a newer keystroke cancels this request.
				if (err.name === 'AbortError') {
					return
				}
				console.error('User search failed:', err)
				showError(this.t('planninq', 'Could not search for users. Please try again.'))
				this.results = []
			} finally {
				this.loading = false
				this.searched = true
			}
		},

		/**
		 * Add the selected user as a project member.
		 *
		 * @param {object} user User object with id and displayName
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async selectUser(user) {
			if (this.existingMembers.includes(user.id)) {
				return
			}
			try {
				const store = useProjectsStore()
				await store.addMember(this.projectId, user.id)
				this.query = ''
				this.results = []
				this.$emit('added', user)
			} catch {
				showError(this.t('planninq', 'Could not add member'))
			}
		},
	},
}
</script>

<style scoped>
.member-search {
	position: relative;
}

.member-search__dropdown {
	position: absolute;
	z-index: 100;
	top: 100%;
	inset-inline: 0;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	list-style: none;
	margin: 2px 0 0;
	padding: 4px;
	max-height: 200px;
	overflow-y: auto;
}

.member-search__result {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
	border-radius: var(--border-radius);
	cursor: pointer;
}

.member-search__result:hover {
	background: var(--color-background-hover);
}

.member-search__empty {
	margin: 4px 0 0;
	font-size: 13px;
	color: var(--color-text-maxcontrast);
}
</style>
