<template>
	<div class="project-backlog">
		<!-- Breadcrumb -->
		<nav class="project-backlog__breadcrumb" aria-label="breadcrumb">
			<NcButton variant="tertiary-no-background" @click="$router.push({ name: 'Projects' })">
				{{ t('planninq', 'Projects') }}
			</NcButton>
			<span aria-hidden="true">&rsaquo;</span>
			<NcButton
				variant="tertiary-no-background"
				@click="$router.push({ name: 'ProjectBoard', params: { id: $route.params.id } })">
				{{ projectTitle }}
			</NcButton>
			<span aria-hidden="true">&rsaquo;</span>
			<span>{{ t('planninq', 'Backlog') }}</span>
		</nav>

		<!-- Page header -->
		<div class="project-backlog__header">
			<h2>{{ t('planninq', 'Backlog') }}</h2>
		</div>

		<!-- Placeholder -->
		<NcEmptyContent
			:name="t('planninq', 'Backlog view coming soon')"
			:description="t('planninq', 'Task management will be available in a future update.')">
			<template #icon>
				<FormatListBulleted :size="20" />
			</template>
		</NcEmptyContent>
	</div>
</template>

<script>
/**
 * ProjectBacklog view.
 *
 * Renders the `/projects/:id/backlog` route as a navigable shell — breadcrumb
 * back to the project board plus a placeholder NcEmptyContent. Hydrates the
 * projects store on direct deep link so the breadcrumb resolves the project
 * title rather than echoing the raw UUID. Stays a placeholder until
 * tasks#REQ-Task-CRUD lands.
 *
 * @spec openspec/changes/retrofit-2026-05-24-reverse-spec-projects-backlog/tasks.md#task-1
 */
import { NcButton, NcEmptyContent } from '@nextcloud/vue'
import FormatListBulleted from 'vue-material-design-icons/FormatListBulleted.vue'
import { useProjectsStore } from '../store/projects.js'

export default {
	name: 'ProjectBacklog',

	components: {
		NcButton,
		NcEmptyContent,
		FormatListBulleted,
	},

	computed: {
		/**
		 * @spec exclude Store passthrough — returns the projects Pinia store.
		 */
		projectsStore() {
			return useProjectsStore()
		},

		/**
		 * @spec exclude Trivial display getter — active project title with UUID fallback.
		 */
		projectTitle() {
			return this.projectsStore.activeProject?.title || this.$route.params.id
		},
	},

	/**
	 * Hydrate the projects store on direct deep link so the breadcrumb
	 * title resolves to the project title rather than the raw UUID.
	 *
	 * @spec openspec/changes/retrofit-2026-05-24-reverse-spec-projects-backlog/tasks.md#task-1
	 */
	async mounted() {
		if (!this.projectsStore.activeProject || this.projectsStore.activeProject.id !== this.$route.params.id) {
			await this.projectsStore.fetchProject(this.$route.params.id)
		}
	},
}
</script>

<style scoped>
.project-backlog {
	padding: 8px 4px 24px;
	max-width: 1200px;
}

.project-backlog__breadcrumb {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-bottom: 16px;
	font-size: 14px;
	color: var(--color-text-maxcontrast);
}

.project-backlog__header {
	margin-bottom: 16px;
}

.project-backlog__header h2 {
	margin: 0;
	font-size: 22px;
	font-weight: 600;
}
</style>
