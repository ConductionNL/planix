<template>
	<NcDialog
		v-model:open="open"
		:name="t('planninq', 'Leave project')"
		@close="$emit('close')">
		<template #default>
			<p v-if="isLastMember" class="project-leave-dialog__warning" role="alert">
				{{ t('planninq', 'You are the last member. Leaving will make this project inaccessible to all users.') }}
			</p>
			<p v-else>
				{{ t('planninq', 'Are you sure you want to leave this project? You will lose access.') }}
			</p>
		</template>

		<template #actions>
			<NcButton
				:disabled="loading || isLastMember"
				variant="error"
				@click="confirm">
				<template v-if="loading" #icon>
					<NcLoadingIcon :size="16" />
				</template>
				{{ t('planninq', 'Leave project') }}
			</NcButton>
			<NcButton :disabled="loading" @click="$emit('close')">
				{{ t('planninq', 'Cancel') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script>
import { getCurrentUser } from '@nextcloud/auth'
import { showError } from '@nextcloud/dialogs'
/**
 * ProjectLeaveDialog.
 *
 * Leave-project flow with last-member warning.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
 */
import { NcButton, NcDialog, NcLoadingIcon } from '@nextcloud/vue'
import { useProjectsStore } from '../store/projects.js'

export default {
	name: 'ProjectLeaveDialog',

	components: { NcButton, NcDialog, NcLoadingIcon },

	props: {
		projectId: {
			type: String,
			required: true,
		},
	},

	emits: ['close', 'left'],

	data() {
		return {
			open: true,
			loading: false,
			isLastMember: false,
		}
	},

	/**
	 * Probe whether leaving would remove the last member by inspecting the
	 * already-loaded project data — no write operation is performed here.
	 *
	 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
	 */
	async mounted() {
		const store = useProjectsStore()
		const project = await store.fetchProject(this.projectId)
		if (project) {
			const uid = getCurrentUser()?.uid || ''
			const otherMembers = (Array.isArray(project.members) ? project.members : []).filter((m) => m !== uid)
			this.isLastMember = otherMembers.length === 0
		}
	},

	methods: {
		/**
		 * Confirm leaving the project by removing the current user as a member.
		 *
		 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-10
		 */
		async confirm() {
			this.loading = true
			try {
				const store = useProjectsStore()
				await store.leaveProject(this.projectId)
				this.$emit('left')
			} catch {
				showError(this.t('planninq', 'Could not leave project'))
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<style scoped>
.project-leave-dialog__warning {
	font-weight: 500;
	color: var(--color-error);
}
</style>
