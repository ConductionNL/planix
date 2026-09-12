<template>
	<div class="task-detail">
		<!-- Loading state -->
		<div v-if="loading" class="task-detail__loading">
			<NcLoadingIcon :size="32" />
		</div>

		<!-- Not found / forbidden state -->
		<NcEmptyContent
			v-else-if="!task"
			:name="errorTitle"
			:description="errorDescription">
			<template #icon>
				<AlertCircleOutline :size="20" />
			</template>
			<template #action>
				<NcButton variant="primary" @click="goBack">
					{{ t('planninq', 'Back to board') }}
				</NcButton>
			</template>
		</NcEmptyContent>

		<!-- Task detail + collaboration sidebar -->
		<div v-else class="task-detail__layout">
			<div class="task-detail__main">
				<div class="task-detail__header">
					<NcButton variant="tertiary" @click="goBack">
						<template #icon>
							<ArrowLeft :size="20" />
						</template>
						{{ t('planninq', 'Back to board') }}
					</NcButton>
					<h2 class="task-detail__title">
						{{ taskTitle }}
					</h2>
				</div>

				<dl class="task-detail__fields">
					<!-- Vue 3 wants the key on the <template v-for> itself; the
					     Vue 2 spelling put one on each child, which the Vue 3
					     compiler rejects with "<template v-for> key should be
					     placed on the <template> tag". -->
					<template v-for="field in fields" :key="field.key">
						<dt>
							{{ field.label }}
						</dt>
						<dd>
							{{ field.value || '—' }}
						</dd>
					</template>
				</dl>

				<!-- Time tracking -->
				<section class="task-detail__time" aria-labelledby="task-detail-time-heading">
					<h3 id="task-detail-time-heading" class="task-detail__section-title">
						{{ t('planninq', 'Time tracking') }}
					</h3>

					<!-- Estimate input -->
					<div class="task-detail__estimate">
						<NcTextField
							v-model="estimateInput"
							:label="t('planninq', 'Estimate')"
							:error="!!estimateError"
							:helperText="estimateError || t('planninq', 'e.g. 2h 30m, 90m, 1.5h')"
							data-testid="estimate-input" />
						<NcButton
							variant="secondary"
							:disabled="savingEstimate || !!estimateError || estimateInput.trim() === ''"
							@click="saveEstimate">
							{{ t('planninq', 'Save estimate') }}
						</NcButton>
					</div>

					<!-- Progress: logged vs estimate -->
					<p
						v-if="estimateMinutes > 0"
						class="task-detail__progress"
						:class="{ 'task-detail__progress--over': isOverEstimate }"
						data-testid="time-progress">
						{{ progressText }}
						<span v-if="isOverEstimate" class="task-detail__overage">
							({{ t('planninq', 'over by {amount}', { amount: overageText }) }})
						</span>
					</p>
					<p v-else class="task-detail__progress" data-testid="time-progress">
						{{ t('planninq', 'Logged: {logged}', { logged: loggedText }) }}
					</p>

					<!-- Log time -->
					<NcButton variant="primary" data-testid="log-time" @click="openLogDialog()">
						<template #icon>
							<ClockPlusOutline :size="20" />
						</template>
						{{ t('planninq', 'Log time') }}
					</NcButton>

					<!-- Entries -->
					<ul v-if="timeEntries.length" class="task-detail__entries">
						<li v-for="entry in timeEntries" :key="entry.id" class="task-detail__entry">
							<span class="task-detail__entry-duration">{{ formatMinutes(entry.duration) }}</span>
							<span class="task-detail__entry-date">{{ entry.date }}</span>
							<span class="task-detail__entry-desc">{{ entry.description }}</span>
							<span class="task-detail__entry-user">{{ entry.user }}</span>
							<NcActions v-if="canModify(entry)">
								<NcActionButton :closeAfterClick="true" @click="openLogDialog(entry)">
									<template #icon>
										<PencilIcon :size="20" />
									</template>
									{{ t('planninq', 'Edit') }}
								</NcActionButton>
								<NcActionButton :closeAfterClick="true" @click="deleteEntry(entry)">
									<template #icon>
										<DeleteIcon :size="20" />
									</template>
									{{ t('planninq', 'Delete') }}
								</NcActionButton>
							</NcActions>
						</li>
					</ul>
				</section>
			</div>

			<!-- Collaboration sidebar: comments (notes), files, audit trail.
			     Legacy hardcoded-tabs mode (use-registry=false) so the three
			     built-in tabs render without requiring the integration registry;
			     generic tags/tasks tabs are hidden. All data comes from
			     OpenRegister per-object endpoints (ADR-022) — no Planninq PHP. -->
			<CnObjectSidebar
				:open="true"
				v-bind="sidebarConfig"
				:title="taskTitle"
				:subtitle="t('planninq', 'Task')"
				:filesLabel="t('planninq', 'Attachments')"
				:notesLabel="t('planninq', 'Comments')"
				:auditTrailLabel="t('planninq', 'Activity')"
				@update:open="onSidebarToggle" />
		</div>

		<!-- Log/edit time dialog -->
		<TimeEntryDialog
			v-if="dialogOpen"
			:taskId="taskId"
			:entry="editingEntry"
			@close="closeDialog"
			@saved="onEntrySaved" />
	</div>
</template>

<script>
import { CnObjectSidebar } from '@conduction/nextcloud-vue'
import { NcActionButton, NcActions, NcButton, NcEmptyContent, NcLoadingIcon, NcTextField } from '@nextcloud/vue'
import { mapState } from 'pinia'
import AlertCircleOutline from 'vue-material-design-icons/AlertCircleOutline.vue'
import ArrowLeft from 'vue-material-design-icons/ArrowLeft.vue'
import ClockPlusOutline from 'vue-material-design-icons/ClockPlusOutline.vue'
import DeleteIcon from 'vue-material-design-icons/Delete.vue'
import PencilIcon from 'vue-material-design-icons/Pencil.vue'
import TimeEntryDialog from '../dialogs/TimeEntryDialog.vue'
import { useSettingsStore } from '../store/modules/settings.js'
import { useObjectStore } from '../store/objectStore.js'
import { useProjectsStore } from '../store/projects.js'
import { useTimeEntriesStore } from '../store/timeEntries.js'
import { formatDuration, parseDuration } from '../utils/durationParser.js'
import { taskCollaborationSidebarConfig } from '../utils/taskHelpers.js'

/**
 * Task detail view.
 *
 * Renders a single task's fields and mounts the collaboration sidebar
 * (Comments / Attachments / Activity tabs) backed by OpenRegister per-object
 * APIs. Reached from the board via the `?task=<uuid>` deep-link or the
 * `/projects/:id/tasks/:taskId` route.
 *
 * @spec openspec/specs/task-collaboration.md
 */
export default {
	name: 'TaskDetail',

	components: {
		NcActions,
		NcActionButton,
		NcButton,
		NcEmptyContent,
		NcLoadingIcon,
		NcTextField,
		CnObjectSidebar,
		ArrowLeft,
		AlertCircleOutline,
		ClockPlusOutline,
		PencilIcon,
		DeleteIcon,
		TimeEntryDialog,
	},

	data() {
		return {
			projectsStore: useProjectsStore(),
			timeEntriesStore: useTimeEntriesStore(),
			settingsStore: useSettingsStore(),
			estimateInput: '',
			savingEstimate: false,
			dialogOpen: false,
			editingEntry: null,
			// Live-updates handle for the or-object-{uuid} subscription of the
			// task being viewed. livePendingKey marks an in-flight subscribe so
			// a concurrent same-key call doesn't double-subscribe; liveEpoch
			// invalidates in-flight resolutions after a release (task switch /
			// destroy). liveUnwatch tears down the cache→activeTask bridge.
			liveHandle: null,
			liveKey: '',
			livePendingKey: '',
			liveEpoch: 0,
			liveUnwatch: null,
		}
	},

	computed: {
		...mapState(useProjectsStore, ['activeTask', 'loading', 'error']),

		/**
		 * UUID of the task from the route.
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		taskId() {
			return this.$route.params.taskId
		},

		/**
		 * The loaded task object (or null).
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		task() {
			return this.activeTask
		},

		/**
		 * CnObjectSidebar props (register/schema/objectId/hidden tabs).
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		sidebarConfig() {
			return taskCollaborationSidebarConfig({ id: this.taskId })
		},

		/**
		 * Display title of the task.
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		taskTitle() {
			return this.task?.title || this.t('planninq', 'Untitled task')
		},

		/**
		 * Label/value pairs rendered in the detail body.
		 *
		 * @spec openspec/specs/task-collaboration.md
		 */
		fields() {
			const t = this.task || {}
			return [
				{ key: 'status', label: this.t('planninq', 'Status'), value: t.status },
				{ key: 'priority', label: this.t('planninq', 'Priority'), value: t.priority },
				{ key: 'assignedTo', label: this.t('planninq', 'Assigned to'), value: t.assignedTo },
				{ key: 'dueDate', label: this.t('planninq', 'Due date'), value: t.dueDate },
				{ key: 'description', label: this.t('planninq', 'Description'), value: t.description },
			]
		},

		/**
		 * Time entries for this task (all users) from the timeEntries store.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		timeEntries() {
			return this.timeEntriesStore.entries
		},

		/**
		 * The task's estimate in minutes (0 when unset).
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		estimateMinutes() {
			return Number(this.task?.estimatedDuration) || 0
		},

		/**
		 * Total logged minutes across every entry on this task.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		loggedMinutes() {
			return this.timeEntries.reduce((acc, e) => acc + (Number(e.duration) || 0), 0)
		},

		/**
		 * Inline validation error for the estimate input (empty is allowed —
		 * the Save button is simply disabled — but non-empty must parse).
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		estimateError() {
			if (this.estimateInput.trim() === '') {
				return ''
			}
			return parseDuration(this.estimateInput) === null
				? this.t('planninq', 'Enter a valid estimate (e.g. 2h 30m, 90m, 1.5h)')
				: ''
		},

		/**
		 * Human-readable total logged time.
		 *
		 * @spec exclude Display getter — formats loggedMinutes.
		 */
		loggedText() {
			return formatDuration(this.loggedMinutes)
		},

		/**
		 * Progress string "logged / estimate", e.g. "1h 30m / 3h".
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		progressText() {
			return `${formatDuration(this.loggedMinutes)} / ${formatDuration(this.estimateMinutes)}`
		},

		/**
		 * Whether logged time exceeds the estimate (progress turns red).
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		isOverEstimate() {
			return this.estimateMinutes > 0 && this.loggedMinutes > this.estimateMinutes
		},

		/**
		 * Human-readable overage (logged − estimate).
		 *
		 * @spec exclude Display getter — formats the overage amount.
		 */
		overageText() {
			return formatDuration(Math.max(0, this.loggedMinutes - this.estimateMinutes))
		},

		/**
		 * Title shown in the not-found / forbidden empty state.
		 *
		 * @spec exclude Presentational empty-state copy; no observable behaviour.
		 */
		errorTitle() {
			return this.error === 'forbidden'
				? this.t('planninq', 'You do not have access to this task')
				: this.t('planninq', 'Task not found')
		},

		/**
		 * Description shown in the not-found / forbidden empty state.
		 *
		 * @spec exclude Presentational empty-state copy; no observable behaviour.
		 */
		errorDescription() {
			return this.error === 'forbidden'
				? this.t('planninq', 'You are not a member of this task\'s project.')
				: this.t('planninq', 'The task may have been deleted.')
		},
	},

	watch: {
		taskId: {
			immediate: true,
			/**
			 * Load the task whenever the route's task id changes.
			 *
			 * @param {string} id The task UUID from the route.
			 *
			 * @spec openspec/specs/task-collaboration.md
			 */
			async handler(id) {
				if (id) {
					await this.projectsStore.fetchTask(id)
					this.estimateInput = this.estimateMinutes > 0 ? formatDuration(this.estimateMinutes) : ''
					await this.timeEntriesStore.fetchForTask(id)
					this.syncLiveSubscription()
				} else {
					this.releaseLiveSubscription()
				}
			},
		},
	},

	/**
	 * Lifecycle hook: release the live object subscription on unmount.
	 *
	 * @spec openspec/specs/realtime-updates.md
	 */
	beforeUnmount() {
		this.releaseLiveSubscription()
	},

	methods: {
		/**
		 * Subscribe to live updates for the task being viewed
		 * (or-object-{uuid}). Events are refetch hints only: the
		 * liveUpdatesPlugin re-runs fetchObject('task', uuid), which lands in
		 * the object store's objects.task cache; the watcher installed here
		 * bridges that fresh data into projectsStore.activeTask so this view
		 * re-renders. Idempotent per task uuid; releases the previous
		 * subscription when another task is opened.
		 *
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/realtime-updates.md
		 */
		async syncLiveSubscription() {
			const objectStore = useObjectStore()
			if (typeof objectStore.subscribe !== 'function') {
				return
			}
			const uuid = this.taskId
			if (!uuid) {
				this.releaseLiveSubscription()
				return
			}
			const type = 'task'
			const key = `${type}::${uuid}`
			if (this.liveHandle && this.liveKey === key) {
				return
			}
			if (this.livePendingKey === key) {
				// A subscribe for this exact task is already in flight —
				// re-subscribing here would leak the first handle + watcher.
				return
			}
			this.releaseLiveSubscription()
			try {
				// Ensure the 'task' type is registered (with slug hints).
				this.projectsStore._objectStore()
				const epoch = this.liveEpoch
				this.livePendingKey = key
				this.liveKey = key
				const handle = await objectStore.subscribe(type, uuid)
				if (this.livePendingKey === key) {
					this.livePendingKey = ''
				}
				if (this.liveEpoch !== epoch) {
					// Released while awaiting (another task opened, or the
					// component was destroyed) — drop the stale subscription.
					objectStore.unsubscribe(handle)
					return
				}
				this.liveHandle = handle
				// Bridge: event → plugin refetch → objects.task[uuid] cache →
				// projectsStore.activeTask (which this template renders).
				this.liveUnwatch = this.$watch(
					() => objectStore.getObject(type, uuid),
					(fresh) => {
						if (fresh && this.liveKey === key) {
							this.projectsStore.activeTask = fresh
						}
					},
				)
			} catch (e) {
				if (this.livePendingKey === key) {
					this.livePendingKey = ''
				}
				this.liveHandle = null
				this.liveKey = ''
				console.warn('[TaskDetail] live subscription failed:', e?.message ?? e)
			}
		},

		/**
		 * Release the current live object subscription and its cache watcher,
		 * and invalidate any in-flight subscribe (its resolution unsubscribes
		 * itself via the epoch check).
		 *
		 * @spec openspec/specs/realtime-updates.md
		 */
		releaseLiveSubscription() {
			this.liveEpoch += 1
			this.livePendingKey = ''
			if (this.liveUnwatch) {
				this.liveUnwatch()
				this.liveUnwatch = null
			}
			const objectStore = useObjectStore()
			if (this.liveHandle && typeof objectStore.unsubscribe === 'function') {
				objectStore.unsubscribe(this.liveHandle)
			}
			this.liveHandle = null
			this.liveKey = ''
		},

		/**
		 * Navigate back to the project board.
		 *
		 * @spec exclude Router navigation glue; no observable spec behaviour.
		 */
		goBack() {
			const projectId = this.$route.params.id
			if (projectId) {
				this.$router.push({ name: 'ProjectBoard', params: { id: projectId } })
			} else {
				this.$router.push({ name: 'Projects' })
			}
		},

		/**
		 * Sidebar open/close handler. The sidebar is part of the detail layout,
		 * so closing it returns to the board rather than leaving an empty page.
		 *
		 * @param {boolean} open Whether the sidebar is now open.
		 *
		 * @spec exclude UI affordance (close returns to board); no spec behaviour.
		 */
		onSidebarToggle(open) {
			if (!open) {
				this.goBack()
			}
		},

		/**
		 * Format minutes for display.
		 *
		 * @param {number} minutes Whole minutes.
		 * @return {string} Human-readable duration.
		 *
		 * @spec exclude Display glue — wraps formatDuration for the template.
		 */
		formatMinutes(minutes) {
			return formatDuration(minutes)
		},

		/**
		 * Whether the current user may edit/delete a time entry (owner/admin).
		 *
		 * @param {object} entry The time entry.
		 * @return {boolean}
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		canModify(entry) {
			return this.timeEntriesStore.canModify(entry)
		},

		/**
		 * Persist the task estimate parsed from the estimate input.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async saveEstimate() {
			const minutes = parseDuration(this.estimateInput)
			if (minutes === null) {
				return
			}
			this.savingEstimate = true
			try {
				await this.projectsStore.updateTask(this.taskId, { estimatedDuration: minutes })
				await this.projectsStore.fetchTask(this.taskId)
				this.estimateInput = formatDuration(this.estimateMinutes)
			} finally {
				this.savingEstimate = false
			}
		},

		/**
		 * Open the log-time dialog (new entry, or editing `entry`).
		 *
		 * @param {object|null} entry The entry to edit, or null to create.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		openLogDialog(entry = null) {
			this.editingEntry = entry
			this.dialogOpen = true
		},

		/**
		 * @spec exclude UI glue — closes the log-time dialog.
		 */
		closeDialog() {
			this.dialogOpen = false
			this.editingEntry = null
		},

		/**
		 * Refresh entries after a create/edit and close the dialog.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async onEntrySaved() {
			this.closeDialog()
			await this.timeEntriesStore.fetchForTask(this.taskId)
		},

		/**
		 * Delete a time entry and refresh the task's total.
		 *
		 * @param {object} entry The entry to delete.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async deleteEntry(entry) {
			await this.timeEntriesStore.delete(entry.id)
			await this.timeEntriesStore.fetchForTask(this.taskId)
		},
	},
}
</script>

<style scoped>
.task-detail {
	height: 100%;
}

.task-detail__loading {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
}

.task-detail__layout {
	display: flex;
	height: 100%;
}

.task-detail__main {
	flex: 1 1 auto;
	padding: 24px;
	overflow-y: auto;
}

.task-detail__header {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 24px;
}

.task-detail__title {
	margin: 0;
}

.task-detail__fields {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 8px 24px;
	max-width: 640px;
}

.task-detail__fields dt {
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.task-detail__fields dd {
	margin: 0;
}

.task-detail__time {
	margin-top: 32px;
	max-width: 640px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.task-detail__section-title {
	margin: 0;
	font-size: 16px;
}

.task-detail__estimate {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.task-detail__estimate > :first-child {
	flex: 1 1 auto;
}

.task-detail__progress {
	margin: 0;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.task-detail__progress--over {
	color: var(--color-error);
}

.task-detail__overage {
	font-weight: normal;
}

.task-detail__entries {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.task-detail__entry {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
}

.task-detail__entry-duration {
	font-weight: 600;
	min-width: 64px;
}

.task-detail__entry-desc {
	flex: 1 1 auto;
	color: var(--color-text-maxcontrast);
}

.task-detail__entry-user {
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}
</style>
