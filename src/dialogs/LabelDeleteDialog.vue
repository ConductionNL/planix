<template>
	<NcDialog
		:name="t('planninq', 'Delete label')"
		@closing="$emit('close')">
		<template #default>
			<div class="label-delete-dialog__body">
				<p>
					{{ n('planninq',
						'Delete label "{title}"? It will be removed from {count} task.',
						'Delete label "{title}"? It will be removed from {count} tasks.',
						usageCount,
						{ title: label.title, count: usageCount }) }}
				</p>
				<p class="label-delete-dialog__warning">
					{{ t('planninq', 'This cannot be undone.') }}
				</p>
			</div>
		</template>

		<template #actions>
			<NcButton :disabled="loading" @click="$emit('close')">
				{{ t('planninq', 'Cancel') }}
			</NcButton>
			<NcButton
				variant="error"
				:disabled="loading"
				@click="confirm">
				<template v-if="loading" #icon>
					<NcLoadingIcon :size="16" />
				</template>
				{{ t('planninq', 'Delete label') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script>
import { showError, showSuccess } from '@nextcloud/dialogs'
/**
 * LabelDeleteDialog.
 *
 * Confirms deletion of an app-wide label, warning how many tasks reference it.
 * On confirm it calls the Planninq cascade endpoint (via the labels store), which
 * removes the label's UUID from every referencing task before deleting the label
 * object, then surfaces the swept-task count in a success toast.
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
import { NcButton, NcDialog, NcLoadingIcon } from '@nextcloud/vue'
import { useLabelsStore } from '../store/labels.js'

export default {
	name: 'LabelDeleteDialog',

	components: { NcButton, NcDialog, NcLoadingIcon },

	props: {
		label: {
			type: Object,
			required: true,
		},
	},

	emits: ['close', 'deleted'],

	data() {
		return {
			loading: false,
		}
	},

	computed: {
		/**
		 * Number of tasks currently referencing this label.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		usageCount() {
			return this.label.usageCount || 0
		},
	},

	methods: {
		/**
		 * Confirm and run the cascade delete via the labels store.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async confirm() {
			this.loading = true
			const store = useLabelsStore()
			try {
				const tasksUpdated = await store.deleteLabel(this.label.id)
				showSuccess(this.n('planninq', 'Label deleted and removed from {count} task', 'Label deleted and removed from {count} tasks', tasksUpdated, { count: tasksUpdated }))
				this.$emit('deleted')
			} catch {
				showError(store.error || this.t('planninq', 'Could not delete label'))
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<style scoped>
.label-delete-dialog__body {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.label-delete-dialog__warning {
	color: var(--color-error);
	font-weight: 600;
}
</style>
