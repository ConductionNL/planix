<template>
	<!-- role="option" alone does not make this reachable: an option still needs
	     to be focusable and to respond to Enter/Space, or the list is
	     mouse-only. -->
	<li
		class="project-list-item"
		role="option"
		tabindex="0"
		:aria-selected="false"
		@click="$emit('click', project)"
		@keydown.enter="$emit('click', project)"
		@keydown.space.prevent="$emit('click', project)">
		<!-- Color swatch -->
		<span
			class="project-list-item__swatch"
			:style="{ backgroundColor: project.color || 'var(--color-primary)' }"
			:aria-label="t('planninq', 'Project color: {color}', { color: project.color || 'default' })" />

		<!-- Icon / emoji -->
		<span class="project-list-item__icon" aria-hidden="true">
			{{ project.icon || '📁' }}
		</span>

		<!-- Title and description -->
		<span class="project-list-item__body">
			<span class="project-list-item__title">{{ project.title }}</span>
			<span v-if="project.description" class="project-list-item__description">
				{{ project.description }}
			</span>
		</span>

		<!-- Member count -->
		<span
			class="project-list-item__badge"
			:aria-label="t('planninq', '{count} members', { count: memberCount })">
			{{ memberCount }} {{ t('planninq', 'members') }}
		</span>

		<!-- Billable and budget. Only shown when the project actually carries
		     them, so internal work does not grow empty money columns. -->
		<span v-if="project.billable" class="project-list-item__badge">
			{{ t('planninq', 'Billable') }}
		</span>
		<span
			v-if="hasBudget"
			class="project-list-item__badge"
			:aria-label="t('planninq', 'Budget: {amount}', { amount: budgetLabel })">
			{{ budgetLabel }}
		</span>

		<!-- Status chip -->
		<NcChip
			class="project-list-item__status"
			:text="statusLabel"
			:variant="statusVariant"
			:noClose="true" />
	</li>
</template>

<script>
// @nextcloud/vue@9 removed the `dist/Components/*.js` layout; the package now
// publishes only an `exports` map (root barrel + `./components/<Name>`).
import { NcChip } from '@nextcloud/vue'

export default {
	name: 'ProjectListItem',
	components: { NcChip },

	props: {
		project: {
			type: Object,
			required: true,
		},
	},

	emits: ['click'],

	computed: {
		/**
		 * @spec openspec/changes/retrofit-2026-05-26-planix-display-capabilities/tasks.md#task-4
		 */
		memberCount() {
			return Array.isArray(this.project.members) ? this.project.members.length : 0
		},

		/**
		 * @spec openspec/changes/retrofit-2026-05-26-planix-display-capabilities/tasks.md#task-1
		 */
		statusLabel() {
			const map = {
				active: this.t('planninq', 'Active'),
				archived: this.t('planninq', 'Archived'),
				completed: this.t('planninq', 'Completed'),
				cancelled: this.t('planninq', 'Cancelled'),
			}
			return map[this.project.status] || this.project.status || this.t('planninq', 'Active')
		},

		/**
		 * @spec openspec/changes/retrofit-2026-05-26-planix-display-capabilities/tasks.md#task-2
		 */
		statusVariant() {
			// `secondary` is NcChip's own default variant. The pre-migration
			// code returned 'default', which was never a valid NcChip value in
			// either major — it only ever tripped the prop validator and fell
			// through to the base styling.
			const map = {
				active: 'success',
				archived: 'warning',
				completed: 'secondary',
				cancelled: 'error',
			}
			return map[this.project.status] || 'secondary'
		},

		/**
		 * Whether this project carries an agreed budget worth showing.
		 *
		 * Zero is the schema default and means "no budget was agreed", so it is
		 * not rendered — a `€ 0` budget reads as a decision nobody made.
		 *
		 * @return {boolean} Whether to render the budget.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-a-project-carries-its-delivery-and-billing-terms-v1
		 */
		hasBudget() {
			return Number(this.project.budgetAmount) > 0
		},

		/**
		 * The agreed budget, formatted for the reader's locale.
		 *
		 * @return {string} The budget, without cents.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-a-project-carries-its-delivery-and-billing-terms-v1
		 */
		budgetLabel() {
			const amount = Number(this.project.budgetAmount) || 0
			try {
				return new Intl.NumberFormat(undefined, {
					style: 'currency',
					currency: 'EUR',
					maximumFractionDigits: 0,
				}).format(amount)
			} catch {
				return String(Math.round(amount))
			}
		},
	},
}
</script>

<style scoped>
.project-list-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	cursor: pointer;
	border-radius: var(--border-radius);
	transition: background-color 0.1s;
	list-style: none;
}

.project-list-item:hover {
	background-color: var(--color-background-hover);
}

/* The hover colour still changes under reduced motion — only the animated
   transition to it is dropped. */
@media (prefers-reduced-motion: reduce) {
	.project-list-item {
		transition: none;
	}
}

.project-list-item__swatch {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	display: inline-block;
}

.project-list-item__icon {
	flex-shrink: 0;
	font-size: 18px;
	line-height: 1;
}

.project-list-item__body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.project-list-item__title {
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.project-list-item__description {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.project-list-item__badge {
	flex-shrink: 0;
	font-size: 12px;
	color: var(--color-text-maxcontrast);
}

.project-list-item__status {
	flex-shrink: 0;
}
</style>
