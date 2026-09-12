<template>
	<div class="project-board">
		<!-- Access denied state (403 or non-member) -->
		<NcEmptyContent
			v-if="accessDenied"
			:name="t('planninq', 'You do not have access to this project')"
			:description="t('planninq', 'You are not a member of this project.')">
			<template #icon>
				<LockOutline :size="20" />
			</template>
			<template #action>
				<NcButton variant="primary" @click="$router.push({ name: 'Projects' })">
					{{ t('planninq', 'Back to projects') }}
				</NcButton>
			</template>
		</NcEmptyContent>

		<!-- Loading state -->
		<div v-else-if="loading" class="project-board__loading">
			<NcLoadingIcon :size="32" />
		</div>

		<!-- Board content -->
		<template v-else-if="project">
			<!-- Page header -->
			<div class="project-board__header">
				<!-- Color accent bar -->
				<span
					v-if="project.color"
					class="project-board__color-accent"
					:style="{ backgroundColor: project.color }"
					aria-hidden="true" />

				<span class="project-board__icon" aria-hidden="true">
					{{ project.icon || '📁' }}
				</span>

				<h2 class="project-board__title">
					{{ project.title }}
				</h2>

				<div class="project-board__header-actions">
					<NcButton
						:aria-label="t('planninq', 'View backlog')"
						variant="tertiary"
						@click="$router.push({ name: 'ProjectBacklog', params: { id: project.id } })">
						{{ t('planninq', 'Backlog') }}
					</NcButton>
					<NcButton
						:aria-label="t('planninq', 'View timeline')"
						variant="tertiary"
						@click="$router.push({ name: 'ProjectTimeline', params: { id: project.id } })">
						{{ t('planninq', 'Timeline') }}
					</NcButton>
					<NcButton
						:aria-label="t('planninq', 'Project settings')"
						variant="tertiary"
						@click="openSettings">
						<template #icon>
							<CogIcon :size="20" />
						</template>
					</NcButton>
				</div>
			</div>

			<!-- Label filter chips. Same idiom as the project list's status
			     filter: one chip per value, the active one primary, pressed
			     state exposed through aria-pressed. -->
			<div
				v-if="labels.length"
				class="project-board__filters"
				role="group"
				:aria-label="t('planninq', 'Filter tasks by label')">
				<NcChip
					v-for="chip in labelFilterChips"
					:key="chip.key"
					:text="chip.title"
					:variant="activeLabelId === chip.value ? 'primary' : 'secondary'"
					:noClose="true"
					class="project-board__filter-chip"
					data-testid="label-filter-chip"
					role="button"
					tabindex="0"
					:aria-pressed="activeLabelId === chip.value"
					@click="setLabelFilter(chip.value)"
					@keydown.enter="setLabelFilter(chip.value)"
					@keydown.space.prevent="setLabelFilter(chip.value)">
					<template v-if="chip.color" #icon>
						<span
							class="project-board__filter-swatch"
							:style="{ backgroundColor: chip.color }"
							aria-hidden="true" />
					</template>
				</NcChip>
			</div>

			<!-- Board loading overlay (tasks fetch) -->
			<div v-if="tasksLoading" class="project-board__loading">
				<NcLoadingIcon :size="32" />
			</div>

			<!-- Kanban columns -->
			<div v-else class="project-board__columns" data-cy="kanban-board">
				<section
					v-for="column in columns"
					:key="column.status"
					class="kanban-column"
					:data-status="column.status"
					:aria-label="column.label"
					:class="{ 'kanban-column--drop-target': dropTargetStatus === column.status }"
					@dragover.prevent="onDragOver(column.status)"
					@dragleave="onDragLeave(column.status)"
					@drop="onDrop(column.status)">
					<header class="kanban-column__header">
						<h3 class="kanban-column__title">
							{{ column.label }}
						</h3>
						<span class="kanban-column__count" aria-hidden="true">
							{{ tasksByStatus[column.status].length }}
						</span>
					</header>

					<div class="kanban-column__body">
						<!-- Task cards -->
						<div
							v-for="task in tasksByStatus[column.status]"
							:key="task.id"
							class="kanban-column__card"
							:class="{ 'kanban-column__card--highlight': isHighlighted(task) }"
							role="button"
							tabindex="0"
							:aria-label="task.title"
							data-testid="task-card"
							draggable="true"
							@click="navigateToTask(task)"
							@keydown.enter="navigateToTask(task)"
							@keydown.space.prevent="navigateToTask(task)"
							@dragstart="onDragStart(task)"
							@dragend="onDragEnd">
							<TaskCard :task="task" :labels="labelsForTask(task)" />

							<!-- Keyboard-operable status change: accessible equivalent
							     of drag-and-drop. Not itself draggable, and stops click
							     propagation so activating it never navigates to detail. -->
							<div
								class="kanban-column__card-actions"
								draggable="false"
								@click.stop
								@keydown.enter.stop
								@keydown.space.stop
								@dragstart.stop>
								<NcActions
									:aria-label="t('planninq', 'Move task to another column')"
									:forceMenu="true">
									<NcActionButton
										v-for="target in otherColumns(column.status)"
										:key="target.status"
										:closeAfterClick="true"
										@click="moveTask(task, target.status)">
										<template #icon>
											<ArrowRightIcon :size="20" />
										</template>
										{{ target.label }}
									</NcActionButton>
								</NcActions>
							</div>
						</div>

						<!-- Empty column placeholder -->
						<p v-if="tasksByStatus[column.status].length === 0" class="kanban-column__empty">
							{{ t('planninq', 'No tasks') }}
						</p>
					</div>
				</section>
			</div>
		</template>

		<!-- Settings sidebar (rendered via App.vue outlet, passed via provide) -->
	</div>
</template>

<script>
import { getCurrentUser } from '@nextcloud/auth'
import { showError } from '@nextcloud/dialogs'
/**
 * ProjectBoard view — the Kanban board.
 *
 * Renders the project's tasks as cards grouped into columns by task `status`
 * (the task schema's status enum: open / in_progress / blocked / done /
 * cancelled). Cards are dragged between columns to change a task's status,
 * persisted to OpenRegister via the projects store (`updateTaskStatus`, a
 * RBAC-scoped PATCH — ADR-005/ADR-022). The move is optimistic and reverts on
 * a failed write. Each card is a {@link TaskCard}, which surfaces the due-date
 * warning badge and one chip per label the task carries. A chip row above the
 * columns filters the board down to a single label. Empty columns render a
 * graceful placeholder.
 *
 * @spec openspec/specs/kanban-board.md
 * @spec openspec/specs/admin-user-settings.md
 */
import { NcActionButton, NcActions, NcButton, NcChip, NcEmptyContent, NcLoadingIcon } from '@nextcloud/vue'
import ArrowRightIcon from 'vue-material-design-icons/ArrowRight.vue'
import CogIcon from 'vue-material-design-icons/Cog.vue'
import LockOutline from 'vue-material-design-icons/LockOutline.vue'
import ProjectSettingsSidebar from '../components/ProjectSettingsSidebar.vue'
import TaskCard from '../components/TaskCard.vue'
import { useProjectsStore } from '../store/projects.js'
import { filterTasksByLabel, labelId, resolveTaskLabels, sortLabelsByTitle } from '../utils/labelHelpers.js'
import { BOARD_STATUSES, groupTasksByStatus } from '../utils/taskHelpers.js'

export default {
	name: 'ProjectBoard',

	components: {
		NcActions,
		NcActionButton,
		NcButton,
		NcChip,
		NcEmptyContent,
		NcLoadingIcon,
		ArrowRightIcon,
		CogIcon,
		LockOutline,
		TaskCard,
	},

	inject: {
		setSidebar: { default: null },
		closeSidebar: { default: null },
	},

	data() {
		return {
			/**
			 * UUID of the task to highlight/scroll to from the ?task= deep-link query param.
			 */
			highlightTaskId: null,
			/** @type {Array} Tasks of the active project. */
			tasks: [],
			/** @type {boolean} Whether the task collection is being fetched. */
			tasksLoading: false,
			/** @type {object|null} The task currently being dragged. */
			draggingTask: null,
			/** @type {string|null} The status column currently hovered during a drag. */
			dropTargetStatus: null,
			/** @type {Array} Every app-wide label, for the card chips and the filter. */
			labels: [],
			/** @type {string|null} Id of the label the board is filtered by, null for all. */
			activeLabelId: null,
		}
	},

	computed: {
		/**
		 * @spec exclude Store passthrough — returns the projects Pinia store.
		 */
		projectsStore() {
			return useProjectsStore()
		},

		/**
		 * @spec exclude Store passthrough — proxies projectsStore.activeProject.
		 */
		project() {
			return this.projectsStore.activeProject
		},

		/**
		 * @spec exclude Store passthrough — proxies projectsStore.loading.
		 */
		loading() {
			return this.projectsStore.loading
		},

		/**
		 * The board's columns, in display order. One column per task status —
		 * the status enum is the single source of truth for the board lanes.
		 *
		 * @return {Array<{status: string, label: string}>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		columns() {
			const labels = {
				open: this.t('planninq', 'Open'),
				in_progress: this.t('planninq', 'In Progress'),
				blocked: this.t('planninq', 'Blocked'),
				done: this.t('planninq', 'Done'),
				cancelled: this.t('planninq', 'Cancelled'),
			}
			return BOARD_STATUSES.map((status) => ({ status, label: labels[status] }))
		},

		/**
		 * Tasks grouped by their status. Every column key is always present so
		 * empty columns render gracefully; a task with an unknown status falls
		 * back to the "open" lane.
		 *
		 * @return {{[status: string]: Array}}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		tasksByStatus() {
			return groupTasksByStatus(this.visibleTasks, BOARD_STATUSES)
		},

		/**
		 * The tasks the board currently shows: every task when no label filter
		 * is active, otherwise only the tasks carrying the selected label.
		 *
		 * Filtering is client-side on the collection already fetched, so it costs
		 * no request and the column counts follow it — the point of the filter is
		 * to narrow what is on screen, and a count that ignored it would say the
		 * opposite of what the board shows.
		 *
		 * @return {Array}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		visibleTasks() {
			return filterTasksByLabel(this.tasks, this.activeLabelId)
		},

		/**
		 * The label filter's chips: an "All labels" reset first, then one chip
		 * per label in title order, each carrying its own colour.
		 *
		 * Every label is offered, not only the ones this board's tasks happen to
		 * use, so a freshly created label is selectable here straight away.
		 *
		 * @return {Array<{key: string, value: string|null, title: string, color: string}>}
		 *
		 * @spec openspec/specs/admin-user-settings.md
		 */
		labelFilterChips() {
			return [
				{ key: 'all', value: null, title: this.t('planninq', 'All labels'), color: '' },
				...sortLabelsByTitle(this.labels).map((label) => ({
					key: labelId(label),
					value: labelId(label),
					title: label.title,
					color: label.color,
				})),
			]
		},

		/**
		 * Whether the current user is denied access to the project — true on a
		 * stored 403 (`forbidden`) or when the loaded project's members array
		 * does not include the current user's UID.
		 *
		 * @return {boolean}
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		accessDenied() {
			const store = this.projectsStore
			if (store.error === 'forbidden') {
				return true
			}
			if (!store.loading && store.activeProject) {
				const uid = getCurrentUser()?.uid
				return !!uid && !store.activeProject.members?.includes(uid)
			}
			return false
		},
	},

	/**
	 * @spec exclude Lifecycle glue — fetches the route's project + tasks on mount.
	 */
	async mounted() {
		const id = this.$route.params.id
		await this.projectsStore.fetchProject(id)

		// Deep-link support: when the route contains ?task=<uuid>, highlight the
		// matching card once the board has rendered.
		const taskId = this.$route.query.task
		if (taskId) {
			this.highlightTaskId = taskId
		}

		await this.loadTasks(id)
		await this.loadLabels()
	},

	beforeUnmount() {
		this.closeSidebar?.()
	},

	methods: {
		/**
		 * Load the project's tasks into the board.
		 *
		 * @param {string} projectId Parent project UUID
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async loadTasks(projectId) {
			if (!projectId || this.accessDenied) {
				return
			}
			this.tasksLoading = true
			try {
				this.tasks = await this.projectsStore.fetchTasks(projectId)
			} finally {
				this.tasksLoading = false
			}
		},

		/**
		 * Load every app-wide label, so cards can render their chips and the
		 * filter can offer them.
		 *
		 * A board with no labels simply renders no filter row: the labels are a
		 * decoration on the tasks, so a failed or empty read must never keep the
		 * board itself from rendering.
		 *
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async loadLabels() {
			if (this.accessDenied) {
				return
			}
			this.labels = await this.projectsStore.fetchLabels()
		},

		/**
		 * The label objects a task carries, resolved from its `labels` UUIDs.
		 *
		 * @param {object} task The task whose labels are resolved.
		 * @return {Array} The label objects, in title order.
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		labelsForTask(task) {
			return resolveTaskLabels(task, this.labels)
		},

		/**
		 * Set the board's label filter, or clear it when the active chip is
		 * pressed again.
		 *
		 * @param {string|null} id The label id to filter by, null for all labels.
		 *
		 * @spec openspec/specs/admin-user-settings.md
		 */
		setLabelFilter(id) {
			this.activeLabelId = (id !== null && id === this.activeLabelId) ? null : id
		},

		/**
		 * @param {object} task The task to test.
		 * @return {boolean}
		 * @spec exclude Display predicate — whether a task is the deep-link highlighted card.
		 */
		isHighlighted(task) {
			return !!this.highlightTaskId && task.id === this.highlightTaskId
		},

		/**
		 * @param {object} task The task being dragged.
		 * @spec exclude Drag glue — records the task being dragged.
		 */
		onDragStart(task) {
			this.draggingTask = task
		},

		/**
		 * @spec exclude Drag glue — clears drag state when the drag ends.
		 */
		onDragEnd() {
			this.draggingTask = null
			this.dropTargetStatus = null
		},

		/**
		 * @param {string} status The hovered column's status.
		 * @spec exclude Drag glue — marks the hovered column as the drop target.
		 */
		onDragOver(status) {
			this.dropTargetStatus = status
		},

		/**
		 * @param {string} status The column being left.
		 * @spec exclude Drag glue — clears the drop-target highlight on leave.
		 */
		onDragLeave(status) {
			if (this.dropTargetStatus === status) {
				this.dropTargetStatus = null
			}
		},

		/**
		 * Drop a dragged task into a column, changing its status.
		 *
		 * Applies the move optimistically (the card jumps to the new column
		 * immediately) and persists it via the RBAC-scoped store action; on a
		 * failed write the task reverts to its original status and an error toast
		 * is shown.
		 *
		 * @param {string} newStatus The target column's status
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async onDrop(newStatus) {
			const task = this.draggingTask
			this.dropTargetStatus = null
			this.draggingTask = null
			await this.applyStatusMove(task, newStatus)
		},

		/**
		 * Navigate to a task's detail page. The click/keyboard-activated
		 * equivalent of the (URL-only) TaskDetail route — mirrors
		 * `ProjectList.navigateToProject`.
		 *
		 * @param {object} task The task to open
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		navigateToTask(task) {
			if (!task) {
				return
			}
			this.$router.push({
				name: 'TaskDetail',
				params: { id: this.project?.id ?? this.$route.params.id, taskId: task.id },
			})
		},

		/**
		 * The board columns other than `currentStatus` — the valid keyboard
		 * "Move to…" targets for a card in that column.
		 *
		 * @param {string} currentStatus The card's current status
		 * @return {Array<{status: string, label: string}>}
		 *
		 * @spec exclude Display helper — filters the column list for the move menu.
		 */
		otherColumns(currentStatus) {
			return this.columns.filter((column) => column.status !== currentStatus)
		},

		/**
		 * Keyboard-operable status change: the accessible equivalent of a
		 * drag-and-drop move. Delegates to the exact same optimistic-update +
		 * rollback path the drag handler uses, so behaviour and RBAC are
		 * identical between the two.
		 *
		 * @param {object} task      The task to move
		 * @param {string} newStatus The target column's status
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async moveTask(task, newStatus) {
			await this.applyStatusMove(task, newStatus)
		},

		/**
		 * Optimistically move a task to `newStatus` and persist it via the
		 * RBAC-scoped store action; revert + toast on a failed write. Shared by
		 * both the drag-and-drop drop handler and the keyboard "Move to…" menu.
		 *
		 * @param {object} task      The task to move (no-op when null/same status)
		 * @param {string} newStatus The target column's status
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/kanban-board.md
		 */
		async applyStatusMove(task, newStatus) {
			if (!task || task.status === newStatus) {
				return
			}

			const previousStatus = task.status

			// Optimistic update.
			this.tasks = this.tasks.map((existing) => existing.id === task.id ? { ...existing, status: newStatus } : existing)

			const updated = await this.projectsStore.updateTaskStatus(task.id, newStatus)
			if (!updated) {
				// Revert on failure.
				this.tasks = this.tasks.map((existing) => existing.id === task.id ? { ...existing, status: previousStatus } : existing)
				showError(this.t('planninq', 'Could not move the task. Please try again.'))
			}
		},

		/**
		 * Open the project settings sidebar via the App.vue outlet.
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-7
		 */
		openSettings() {
			if (!this.setSidebar) {
				return
			}
			this.setSidebar({
				...ProjectSettingsSidebar,
				propsData: { project: this.project },
				on: {
					close: () => this.closeSidebar?.(),
					archived: () => this.$router.push({ name: 'Projects' }),
					deleted: () => this.$router.push({ name: 'Projects' }),
				},
			})
		},
	},
}
</script>

<style scoped>
.project-board {
	padding: 8px 4px 24px;
	max-width: 1400px;
}

.project-board__header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 24px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--color-border);
}

.project-board__color-accent {
	flex-shrink: 0;
	width: 6px;
	height: 32px;
	border-radius: 3px;
}

.project-board__icon {
	font-size: 24px;
	line-height: 1;
}

.project-board__title {
	flex: 1;
	margin: 0;
	font-size: 20px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.project-board__header-actions {
	display: flex;
	gap: 4px;
}

.project-board__loading {
	display: flex;
	justify-content: center;
	padding: 60px;
}

.project-board__filters {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-bottom: 16px;
}

.project-board__filter-chip {
	cursor: pointer;
}

/* Perceivable keyboard focus (WCAG 2.4.7) — the chip is role="button". */
.project-board__filter-chip:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

/* The label's own colour is DATA, so it arrives inline on the swatch, exactly
   like the project accent bar above. The surrounding chip stays on the theme
   tokens, and the chip text carries the name so colour is never the sole
   signal (WCAG 1.4.1). */
.project-board__filter-swatch {
	display: block;
	width: 12px;
	height: 12px;
	margin-inline-start: 4px;
	border-radius: 50%;
	border: 1px solid var(--color-border);
	background: var(--color-background-dark);
}

.project-board__columns {
	display: flex;
	gap: 16px;
	align-items: flex-start;
	overflow-x: auto;
	padding-bottom: 8px;
}

.kanban-column {
	flex: 1 0 240px;
	min-width: 240px;
	max-width: 320px;
	display: flex;
	flex-direction: column;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	padding: 8px;
}

.kanban-column--drop-target {
	border-color: var(--color-primary-element);
	box-shadow: 0 0 0 2px var(--color-primary-element-light);
}

.kanban-column__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px 8px;
}

.kanban-column__title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.kanban-column__count {
	font-size: 12px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	background: var(--color-background-hover);
	border-radius: 12px;
	padding: 1px 8px;
}

.kanban-column__body {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 40px;
}

.kanban-column__card {
	position: relative;
	cursor: grab;
	border-radius: 8px;
}

.kanban-column__card:active {
	cursor: grabbing;
}

/* Perceivable keyboard focus (WCAG 2.4.7) — the card is role="button". */
.kanban-column__card:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

/* Keyboard "Move to…" affordance, top-right of the card. Revealed on
   hover/focus-within so it does not clutter the card at rest, but is always
   reachable by keyboard. */
.kanban-column__card-actions {
	position: absolute;
	top: 6px;
	inset-inline-end: 6px;
	opacity: 0;
	transition: opacity 0.1s ease-in-out;
}

.kanban-column__card:hover .kanban-column__card-actions,
.kanban-column__card:focus-within .kanban-column__card-actions {
	opacity: 1;
}

/* Honour a reduced-motion preference: the fade is decorative, so drop the
   transition rather than the visibility change — the actions must still
   appear on hover and focus. */
@media (prefers-reduced-motion: reduce) {
	.kanban-column__card-actions {
		transition: none;
	}
}

.kanban-column__card--highlight {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
	border-radius: 8px;
}

.kanban-column__empty {
	margin: 0;
	padding: 12px 8px;
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	text-align: center;
}
</style>
