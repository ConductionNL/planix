<template>
	<section class="task-dependencies">
		<h3 class="task-dependencies__heading">
			{{ t('planninq', 'Dependencies') }}
		</h3>

		<!-- Blocked banner: lists the open blockers that cause the blocked state. -->
		<div v-if="openBlockers.length > 0" class="task-dependencies__banner">
			<LockOutline :size="16" />
			<span>{{ t('planninq', 'This task is blocked by {count} unfinished task(s).', { count: openBlockers.length }) }}</span>
		</div>

		<!-- Blocked by (incoming edges). -->
		<div class="task-dependencies__group">
			<h4>{{ t('planninq', 'Blocked by') }}</h4>
			<ul v-if="blockedByTasks.length > 0" class="task-dependencies__list">
				<li v-for="item in blockedByTasks" :key="item.edgeId" class="task-dependencies__item">
					<span class="task-dependencies__status" :class="`is-${item.status}`" />
					<span class="task-dependencies__title">{{ item.title }}</span>
					<NcButton
						variant="tertiary"
						:aria-label="t('planninq', 'Remove dependency')"
						@click="remove(item.edgeId)">
						<template #icon>
							<CloseIcon :size="16" />
						</template>
					</NcButton>
				</li>
			</ul>
			<p v-else class="task-dependencies__empty">
				{{ t('planninq', 'No blocking tasks.') }}
			</p>
		</div>

		<!-- Blocks (outgoing edges). -->
		<div class="task-dependencies__group">
			<h4>{{ t('planninq', 'Blocks') }}</h4>
			<ul v-if="blocksTasks.length > 0" class="task-dependencies__list">
				<li v-for="item in blocksTasks" :key="item.edgeId" class="task-dependencies__item">
					<span class="task-dependencies__status" :class="`is-${item.status}`" />
					<span class="task-dependencies__title">{{ item.title }}</span>
					<NcButton
						variant="tertiary"
						:aria-label="t('planninq', 'Remove dependency')"
						@click="remove(item.edgeId)">
						<template #icon>
							<CloseIcon :size="16" />
						</template>
					</NcButton>
				</li>
			</ul>
			<p v-else class="task-dependencies__empty">
				{{ t('planninq', 'This task blocks no other tasks.') }}
			</p>
		</div>

		<!-- Same-project task picker to add a "Blocked by" edge. -->
		<div class="task-dependencies__add">
			<NcSelect
				v-model="selected"
				:options="pickerOptions"
				:inputLabel="t('planninq', 'Add a blocking task')"
				:placeholder="t('planninq', 'Pick a task that must finish first')"
				label="title"
				:disabled="saving" />
			<NcButton variant="secondary" :disabled="!selected || saving" @click="addBlockedBy">
				{{ t('planninq', 'Add') }}
			</NcButton>
		</div>

		<!-- Inline validation error (cycle / duplicate / cross-project). -->
		<p v-if="errorMessage" class="task-dependencies__error" role="alert">
			{{ errorMessage }}
		</p>
	</section>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'
/**
 * TaskDependencies — task-detail section showing the two dependency directions
 * ("Blocked by" / "Blocks") with a same-project task picker and inline
 * validation-error display.
 *
 * Reads come from the dependencies store (OR API directly); create/delete go
 * through the Planninq endpoints, where the server enforces no-self, no-dup,
 * same-project, and acyclicity — the inline error renders the server message
 * (including the named cycle path).
 *
 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
 */
import { NcButton, NcSelect } from '@nextcloud/vue'
import CloseIcon from 'vue-material-design-icons/Close.vue'
import LockOutline from 'vue-material-design-icons/LockOutline.vue'
import { useDependenciesStore } from '../store/dependencies.js'
import { dependencyPickerCandidates, openBlockerIds, statusMapFromTasks } from '../utils/taskHelpers.js'

export default {
	name: 'TaskDependencies',

	components: {
		NcButton,
		NcSelect,
		CloseIcon,
		LockOutline,
	},

	props: {
		/**
		 * The task whose dependencies are being managed (`{ id, project }`).
		 */
		task: {
			type: Object,
			required: true,
		},

		/**
		 * All tasks of the same project — used for the picker and to resolve
		 * linked task titles/statuses.
		 */
		projectTasks: {
			type: Array,
			default: () => [],
		},
	},

	data() {
		return {
			selected: null,
			saving: false,
		}
	},

	computed: {
		/**
		 * @spec exclude Store passthrough — returns the dependencies Pinia store.
		 */
		dependenciesStore() {
			return useDependenciesStore()
		},

		/**
		 * @spec exclude Trivial getter — current task UUID with OR-envelope fallback.
		 */
		taskId() {
			return this.task.id || this.task['@self']?.id
		},

		/**
		 * @spec exclude Trivial getter — proxies the store's last error message.
		 */
		errorMessage() {
			return this.dependenciesStore.error
		},

		/**
		 * UUID → task object lookup for resolving linked titles/statuses.
		 *
		 * @return {{[uuid: string]: object}}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		taskById() {
			const map = {}
			for (const task of this.projectTasks) {
				const id = task.id || task['@self']?.id
				if (id) {
					map[id] = task
				}
			}
			return map
		},

		/**
		 * UUID → status map for the open-blocker banner derivation.
		 *
		 * @return {{[uuid: string]: string}}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		statusById() {
			return statusMapFromTasks(this.projectTasks)
		},

		/**
		 * Open blockers of this task (drives the blocked banner).
		 *
		 * @return {string[]}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		openBlockers() {
			return openBlockerIds(this.taskId, this.dependenciesStore.edges, this.statusById)
		},

		/**
		 * Incoming edges: tasks that block this one.
		 *
		 * @return {Array<object>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		blockedByTasks() {
			return this.dependenciesStore.edges
				.filter((edge) => edge.blocked === this.taskId)
				.map((edge) => this.toListItem(edge, edge.blocker))
		},

		/**
		 * Outgoing edges: tasks this one blocks.
		 *
		 * @return {Array<object>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		blocksTasks() {
			return this.dependenciesStore.edges
				.filter((edge) => edge.blocker === this.taskId)
				.map((edge) => this.toListItem(edge, edge.blocked))
		},

		/**
		 * Picker options: same-project tasks excluding self (and excluding tasks
		 * already linked as a blocker of this task).
		 *
		 * @return {Array<object>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		pickerOptions() {
			const alreadyBlocking = new Set(this.dependenciesStore.edges
				.filter((edge) => edge.blocked === this.taskId)
				.map((edge) => edge.blocker))
			return dependencyPickerCandidates(this.task, this.projectTasks)
				.filter((task) => !alreadyBlocking.has(task.id || task['@self']?.id))
				.map((task) => ({ id: task.id || task['@self']?.id, title: task.title }))
		},
	},

	methods: {
		t,

		/**
		 * @param {object} edge        The dependency edge object (carries its own id).
		 * @param {string} otherTaskId UUID of the task at the far end of the edge.
		 * @return {{edgeId: string, title: string, status: string}} Display row.
		 * @spec exclude View glue — builds a display row for a linked edge.
		 */
		toListItem(edge, otherTaskId) {
			const other = this.taskById[otherTaskId]
			return {
				edgeId: edge.id,
				title: other?.title || otherTaskId,
				status: other?.status || 'unknown',
			}
		},

		/**
		 * Add a "Blocked by" edge: the picked task becomes the blocker of this task.
		 *
		 * @return {Promise<void>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		async addBlockedBy() {
			if (!this.selected) {
				return
			}
			this.saving = true
			try {
				await this.dependenciesStore.createEdge(this.selected.id, this.taskId)
				this.selected = null
			} catch {
				// Error is surfaced via the store's `error` → errorMessage banner.
			} finally {
				this.saving = false
			}
		},

		/**
		 * Remove a dependency edge from either direction.
		 *
		 * @param {string} edgeId UUID of the edge.
		 * @return {Promise<void>}
		 *
		 * @spec openspec/changes/task-dependencies/specs/task-dependencies/spec.md
		 */
		async remove(edgeId) {
			try {
				await this.dependenciesStore.deleteEdge(edgeId)
			} catch {
				// Error surfaced via the store's `error` banner.
			}
		},
	},
}
</script>

<style scoped>
.task-dependencies {
	margin-top: 16px;
}

.task-dependencies__heading {
	margin: 0 0 8px;
	font-size: 16px;
	font-weight: 600;
}

.task-dependencies__banner {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	margin-bottom: 12px;
	border-radius: var(--border-radius);
	background-color: var(--color-error, #e9322d);
	color: var(--color-primary-text, #fff);
	font-size: 13px;
}

.task-dependencies__group {
	margin-bottom: 12px;
}

.task-dependencies__group h4 {
	margin: 0 0 4px;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.task-dependencies__list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.task-dependencies__item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 2px 0;
}

.task-dependencies__status {
	flex-shrink: 0;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background-color: var(--color-border-dark);
}

.task-dependencies__status.is-done,
.task-dependencies__status.is-cancelled {
	background-color: var(--color-success, #46ba61);
}

.task-dependencies__title {
	flex: 1;
}

.task-dependencies__empty {
	margin: 0;
	font-size: 13px;
	color: var(--color-text-maxcontrast);
}

.task-dependencies__add {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	margin-top: 8px;
}

.task-dependencies__error {
	margin-top: 8px;
	color: var(--color-error-text, #c8232c);
	font-size: 13px;
}
</style>
