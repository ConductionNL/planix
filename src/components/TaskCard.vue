<template>
	<div class="task-card">
		<!-- Task title -->
		<h3 class="task-card__title">
			{{ task.title }}
		</h3>

		<!-- Task description (optional) -->
		<p v-if="task.description" class="task-card__description">
			{{ task.description }}
		</p>

		<!-- Task metadata -->
		<div class="task-card__meta">
			<!-- Due date badge -->
			<NcChip
				v-if="dueDateBadgeStatus"
				:text="dueDateBadgeText"
				:variant="dueDateBadgeVariant"
				:noClose="true"
				class="task-card__due-date-badge" />

			<!-- Status -->
			<NcChip
				:text="statusLabel"
				:variant="statusVariant"
				:noClose="true"
				class="task-card__status-badge" />

			<!-- Priority -->
			<NcChip
				v-if="task.priority"
				:text="priorityLabel"
				:variant="priorityVariant"
				:noClose="true"
				class="task-card__priority-badge" />

			<!-- Estimate (time-tracking) -->
			<NcChip
				v-if="estimateLabel"
				:text="estimateLabel"
				:noClose="true"
				class="task-card__estimate-badge" />

			<!-- Label chips. The swatch carries the label's own colour, the
			     text carries its name, so colour is never the sole signal
			     (WCAG 1.4.1) and a recolor needs no task write. -->
			<NcChip
				v-for="label in labels"
				:key="labelKey(label)"
				:text="label.title"
				:noClose="true"
				class="task-card__label-badge"
				data-testid="task-label-chip">
				<template #icon>
					<span
						class="task-card__label-swatch"
						:style="{ backgroundColor: label.color }"
						aria-hidden="true" />
				</template>
			</NcChip>
		</div>

		<!-- Assignee (optional) -->
		<div v-if="task.assignedTo" class="task-card__assignee">
			{{ t('planninq', 'Assigned to: {user}', { user: task.assignedTo }) }}
		</div>
	</div>
</template>

<script>
// @nextcloud/vue@9 removed the `dist/Components/*.js` layout; the package now
// publishes only an `exports` map (root barrel + `./components/<Name>`).
import { NcChip } from '@nextcloud/vue'
import { formatDuration } from '../utils/durationParser.js'
import { labelId } from '../utils/labelHelpers.js'
import { dueDateStatus } from '../utils/taskHelpers.js'

/**
 * Kanban board task card.
 *
 * Renders a single task as a draggable card inside a board column: title,
 * optional description, a due-date warning badge (yellow "Due soon" /
 * red "Overdue"), the status + priority chips, one chip per label the task
 * carries, and the assignee. The badge is driven by the pure `dueDateStatus`
 * helper (date-only comparison) so colour is never the sole signal — a text
 * label is always present (WCAG 1.4.1), and the label chip follows the same
 * rule: the swatch shows the label's colour, the chip text shows its name.
 *
 * @spec openspec/specs/kanban-board.md
 * @spec openspec/specs/admin-user-settings.md
 */
export default {
	name: 'TaskCard',
	components: { NcChip },

	props: {
		task: {
			type: Object,
			required: true,
		},

		/**
		 * The label OBJECTS this task carries, already resolved from the task's
		 * `labels` UUID array by the board.
		 *
		 * Resolution belongs to the board, not the card: labels are app-wide, so
		 * one fetch serves every card, and a card that resolved its own would
		 * issue one request per task.
		 */
		labels: {
			type: Array,
			default: () => [],
		},
	},

	computed: {
		/**
		 * @spec openspec/specs/kanban-board.md
		 */
		dueDateBadgeStatus() {
			return dueDateStatus(this.task)
		},

		/**
		 * @spec openspec/specs/time-tracking.md
		 */
		estimateLabel() {
			const minutes = Number(this.task.estimatedDuration) || 0
			return minutes > 0 ? formatDuration(minutes) : ''
		},

		/**
		 * @spec exclude Display getter — maps the due-date status to its translated chip label.
		 */
		dueDateBadgeText() {
			const map = {
				approaching: this.t('planninq', 'Due soon'),
				overdue: this.t('planninq', 'Overdue'),
			}
			return map[this.dueDateBadgeStatus] || ''
		},

		/**
		 * @spec exclude Display getter — maps the due-date status to a chip colour variant.
		 *
		 * `secondary` is NcChip's own default variant. The pre-migration code
		 * returned 'default', which was never a valid NcChip value in either
		 * major — it only tripped the prop validator and fell through to the
		 * base styling.
		 */
		dueDateBadgeVariant() {
			const map = {
				approaching: 'warning',
				overdue: 'error',
			}
			return map[this.dueDateBadgeStatus] || 'secondary'
		},

		/**
		 * @spec exclude Display getter — translated label for the task status chip.
		 */
		statusLabel() {
			const map = {
				open: this.t('planninq', 'Open'),
				in_progress: this.t('planninq', 'In Progress'),
				blocked: this.t('planninq', 'Blocked'),
				done: this.t('planninq', 'Done'),
				cancelled: this.t('planninq', 'Cancelled'),
			}
			return map[this.task.status] || this.task.status || this.t('planninq', 'Open')
		},

		/**
		 * @spec exclude Display getter — maps the task status to a chip colour variant.
		 */
		statusVariant() {
			const map = {
				open: 'secondary',
				in_progress: 'primary',
				blocked: 'error',
				done: 'success',
				cancelled: 'secondary',
			}
			return map[this.task.status] || 'secondary'
		},

		/**
		 * @spec exclude Display getter — translated label for the priority chip.
		 */
		priorityLabel() {
			const map = {
				low: this.t('planninq', 'Low'),
				normal: this.t('planninq', 'Normal'),
				high: this.t('planninq', 'High'),
				urgent: this.t('planninq', 'Urgent'),
			}
			return map[this.task.priority] || this.task.priority || ''
		},

		/**
		 * @spec exclude Display getter — maps the priority to a chip colour variant.
		 */
		priorityVariant() {
			const map = {
				low: 'secondary',
				normal: 'secondary',
				high: 'warning',
				urgent: 'error',
			}
			return map[this.task.priority] || 'secondary'
		},
	},

	methods: {
		/**
		 * @param {object} label The label to key.
		 * @return {string} The label's canonical id, used as the v-for key.
		 * @spec exclude Render helper — resolves the label id OpenRegister returned.
		 */
		labelKey(label) {
			return labelId(label)
		},
	},
}
</script>

<style scoped>
.task-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
}

.task-card__title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	line-height: 1.4;
	color: var(--color-text);
}

.task-card__description {
	margin: 0;
	font-size: 12px;
	line-height: 1.4;
	color: var(--color-text-maxcontrast);
	overflow-wrap: break-word;
}

.task-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.task-card__due-date-badge {
	flex-shrink: 0;
}

.task-card__status-badge {
	flex-shrink: 0;
}

.task-card__priority-badge {
	flex-shrink: 0;
}

.task-card__label-badge {
	flex-shrink: 0;
}

/* The label's own colour is DATA, held on the label object, so it arrives as
   an inline background on this swatch — the same way the board paints a
   project's accent bar. Everything around it stays on the theme tokens, and
   the border keeps a pale swatch visible against a light card. */
.task-card__label-swatch {
	display: block;
	width: 12px;
	height: 12px;
	margin-inline-start: 4px;
	border-radius: 50%;
	border: 1px solid var(--color-border);
	background: var(--color-background-dark);
}

.task-card__assignee {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
}
</style>
