<template>
	<div class="timesheet">
		<div class="timesheet__header">
			<h2 class="timesheet__title">
				{{ t('planninq', 'Timesheet') }}
			</h2>
			<div class="timesheet__filter">
				<!-- `@input` is dead on @nextcloud/vue@9's NcSelect: it wraps
				     @nextcloud/vue-select@4, whose only value event is
				     `update:modelValue` (plus `option:selected` / `search`).
				     v-model's own handler is registered first, so `preset` is
				     already updated by the time onPresetChange reads it. -->
				<NcSelect
					v-model="preset"
					:options="presetOptions"
					:clearable="false"
					:inputLabel="t('planninq', 'Date range')"
					label="label"
					@update:modelValue="onPresetChange" />
				<template v-if="preset && preset.id === 'custom'">
					<input
						v-model="customFrom"
						type="date"
						class="timesheet__date"
						:aria-label="t('planninq', 'From date')"
						@change="applyCustomRange">
					<input
						v-model="customTo"
						type="date"
						class="timesheet__date"
						:aria-label="t('planninq', 'To date')"
						@change="applyCustomRange">
				</template>
				<span class="timesheet__range-total">
					{{ t('planninq', 'Total: {total}', { total: formatMinutes(rangeTotal) }) }}
				</span>
			</div>
		</div>

		<div v-if="loading" class="timesheet__loading">
			<NcLoadingIcon :size="32" />
		</div>

		<NcEmptyContent
			v-else-if="groups.length === 0"
			:name="t('planninq', 'No time logged')"
			:description="t('planninq', 'Log time on a task to see it here.')">
			<template #icon>
				<ClockOutline :size="20" />
			</template>
		</NcEmptyContent>

		<div v-else class="timesheet__groups">
			<section
				v-for="group in groups"
				:key="group.date"
				class="timesheet__group">
				<header class="timesheet__group-header">
					<h3 class="timesheet__group-date">
						{{ group.date }}
					</h3>
					<span class="timesheet__group-total">
						{{ formatMinutes(group.total) }}
					</span>
				</header>
				<ul class="timesheet__rows">
					<li v-for="entry in group.entries" :key="entry.id" class="timesheet__row">
						<span class="timesheet__row-duration">{{ formatMinutes(entry.duration) }}</span>
						<a
							href="#"
							class="timesheet__row-task"
							@click.prevent="openTask(entry)">
							{{ taskTitle(entry.task) }}
						</a>
						<span class="timesheet__row-project">{{ projectName(entry.task) }}</span>
						<span class="timesheet__row-desc">{{ entry.description }}</span>
					</li>
				</ul>
			</section>
		</div>
	</div>
</template>

<script>
/**
 * Timesheet view — the current user's time entries grouped by date.
 *
 * Reads the user's entries from the timeEntries store (owner-filtered), groups
 * them by date (newest first) with daily and range totals, and offers a
 * date-range filter (default "This week"). Clicking a task title navigates to
 * that task's detail view; the active filter is reflected in the URL query so
 * the browser back button returns to the same range.
 *
 * @spec openspec/specs/time-tracking.md
 */
import { NcEmptyContent, NcLoadingIcon, NcSelect } from '@nextcloud/vue'
import ClockOutline from 'vue-material-design-icons/ClockOutline.vue'
import { useObjectStore } from '../store/objectStore.js'
import { useTimeEntriesStore } from '../store/timeEntries.js'
import { formatDuration } from '../utils/durationParser.js'
import {
	currentWeekRange,
	filterByRange,
	groupEntriesByDate,
	sumDuration,
} from '../utils/timesheetHelpers.js'

export default {
	name: 'Timesheet',

	components: { NcEmptyContent, NcLoadingIcon, NcSelect, ClockOutline },

	data() {
		return {
			timeEntriesStore: useTimeEntriesStore(),
			/** @type {{[taskId: string]: {title: string, project: string, projectName: string}}} */
			taskInfo: {},
			preset: null,
			customFrom: '',
			customTo: '',
			from: null,
			to: null,
		}
	},

	computed: {
		/**
		 * @spec exclude Store passthrough — loading flag.
		 */
		loading() {
			return this.timeEntriesStore.loading
		},

		/**
		 * The date-range preset options.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		presetOptions() {
			return [
				{ id: 'this-week', label: this.t('planninq', 'This week') },
				{ id: 'last-week', label: this.t('planninq', 'Last week') },
				{ id: 'all', label: this.t('planninq', 'All time') },
				{ id: 'custom', label: this.t('planninq', 'Custom range') },
			]
		},

		/**
		 * Entries within the active date range.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		entriesInRange() {
			return filterByRange(this.timeEntriesStore.entries, this.from, this.to)
		},

		/**
		 * Entries grouped by date (newest first) with daily totals.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		groups() {
			return groupEntriesByDate(this.entriesInRange)
		},

		/**
		 * Total minutes across the active range.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		rangeTotal() {
			return sumDuration(this.entriesInRange)
		},
	},

	/**
	 * @spec exclude Lifecycle glue — loads entries + restores the filter from the URL.
	 */
	async mounted() {
		// Restore the filter from the URL query so the back button returns here
		// at the same range.
		const q = this.$route.query
		if (q.from || q.to) {
			this.preset = this.presetOptions.find((o) => o.id === 'custom')
			this.from = q.from || null
			this.to = q.to || null
			this.customFrom = q.from || ''
			this.customTo = q.to || ''
		} else {
			this.preset = this.presetOptions.find((o) => o.id === 'this-week')
			const wk = currentWeekRange()
			this.from = wk.from
			this.to = wk.to
		}
		await this.timeEntriesStore.fetchForCurrentUser()
		await this.resolveTasks()
	},

	methods: {
		/**
		 * Format minutes for display.
		 *
		 * @param {number} minutes Whole minutes.
		 * @return {string}
		 * @spec exclude Display glue.
		 */
		formatMinutes(minutes) {
			return formatDuration(minutes)
		},

		/**
		 * @param {string} taskId Task UUID.
		 * @return {string} The resolved task title (or the id as a fallback).
		 * @spec exclude Display glue — task-title lookup.
		 */
		taskTitle(taskId) {
			return this.taskInfo[taskId]?.title || taskId
		},

		/**
		 * @param {string} taskId Task UUID.
		 * @return {string} The resolved project name (or empty).
		 * @spec exclude Display glue — project-name lookup.
		 */
		projectName(taskId) {
			return this.taskInfo[taskId]?.projectName || ''
		},

		/**
		 * Resolve task titles + owning project for every referenced task so the
		 * timesheet rows can show them and link to the detail view.
		 *
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		async resolveTasks() {
			const objectStore = useObjectStore()
			// The third argument is the OpenRegister register SLUG, not the app
			// id. It moved from `planix` to `planninq` together with the
			// MigrateRegisterSlug repair step, which renames the register ROW:
			// OR resolves a register by slug and by nothing else, so the literal
			// and the row move in the same release or neither resolves.
			if (!objectStore.objectTypeRegistry?.task) {
				objectStore.registerObjectType('task', 'task', 'planninq')
			}
			if (!objectStore.objectTypeRegistry?.project) {
				objectStore.registerObjectType('project', 'project', 'planninq')
			}
			const ids = [...new Set(this.timeEntriesStore.entries.map((e) => e.task).filter(Boolean))]
			const info = {}
			for (const id of ids) {
				try {
					const task = await objectStore.fetchObject('task', id)
					if (task) {
						let projectName = ''
						if (task.project) {
							const project = await objectStore.fetchObject('project', task.project)
							projectName = project?.title || ''
						}
						info[id] = { title: task.title || id, project: task.project || '', projectName }
					}
				} catch {
					// Leave unresolved; the row falls back to the task id.
				}
			}
			this.taskInfo = info
		},

		/**
		 * Apply a preset date-range and reflect it in the URL.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		onPresetChange() {
			const id = this.preset?.id
			if (id === 'this-week') {
				const wk = currentWeekRange()
				this.setRange(wk.from, wk.to)
			} else if (id === 'last-week') {
				const ref = new Date()
				ref.setDate(ref.getDate() - 7)
				const wk = currentWeekRange(ref)
				this.setRange(wk.from, wk.to)
			} else if (id === 'all') {
				this.setRange(null, null)
			}
			// 'custom' waits for the date inputs.
		},

		/**
		 * Apply the custom from/to inputs.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		applyCustomRange() {
			this.setRange(this.customFrom || null, this.customTo || null)
		},

		/**
		 * Set the active range and mirror it into the URL query.
		 *
		 * @param {string|null} from Lower bound.
		 * @param {string|null} to Upper bound.
		 * @spec exclude State glue — sets range + URL query.
		 */
		setRange(from, to) {
			this.from = from
			this.to = to
			const query = {}
			if (from) {
				query.from = from
			}
			if (to) {
				query.to = to
			}
			this.$router.replace({ query }).catch(() => {})
		},

		/**
		 * Navigate to a task's detail view, preserving the timesheet filter in
		 * history so the back button returns here.
		 *
		 * @param {object} entry The time entry whose task to open.
		 *
		 * @spec openspec/specs/time-tracking.md
		 */
		openTask(entry) {
			const info = this.taskInfo[entry.task]
			if (info?.project) {
				this.$router.push({
					name: 'TaskDetail',
					params: { id: info.project, taskId: entry.task },
				})
			}
		},
	},
}
</script>

<style scoped>
.timesheet {
	padding: 24px;
	max-width: 900px;
}

.timesheet__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 24px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--color-border);
}

.timesheet__title {
	margin: 0;
}

.timesheet__filter {
	display: flex;
	align-items: center;
	gap: 12px;
}

.timesheet__date {
	min-height: 44px;
	padding: 4px 8px;
	border: 2px solid var(--color-border-maxcontrast);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	color: var(--color-main-text);
}

.timesheet__range-total {
	font-weight: 600;
}

.timesheet__loading {
	display: flex;
	justify-content: center;
	padding: 48px 0;
}

.timesheet__groups {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.timesheet__group-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.timesheet__group-date {
	margin: 0;
	font-size: 14px;
}

.timesheet__group-total {
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.timesheet__rows {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.timesheet__row {
	display: grid;
	grid-template-columns: 80px 1fr 1fr 2fr;
	gap: 12px;
	align-items: center;
	padding: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
}

.timesheet__row-duration {
	font-weight: 600;
}

.timesheet__row-project {
	color: var(--color-text-maxcontrast);
}

.timesheet__row-desc {
	color: var(--color-text-maxcontrast);
}
</style>
