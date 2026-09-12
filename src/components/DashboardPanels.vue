<!-- SPDX-License-Identifier: EUPL-1.2 -->
<!--
 The dashboard's two non-KPI panels: "My projects" and "Quick actions".

 Extracted verbatim from the former src/views/Dashboard.vue when the dashboard
 became a manifest `type:"dashboard"` page. The three KPI tiles that used to sit
 above these panels are now declarative `stat` widgets in the manifest, counted
 by OpenRegister instead of by filtering an already-fetched list in the browser.

 This component deliberately renders NO CnDashboardPage: it is mounted as a
 widget on a dashboard page, and a dashboard inside a dashboard is the
 dashboard-in-dashboard antipattern hydra gate-15 rejects.
-->
<template>
	<div class="planninq-dashboard__columns">
		<CnConfigurationCard :title="t('planninq', 'My projects')">
			<NcLoadingIcon v-if="loading" :size="24" />
			<ul v-else-if="recentProjects.length > 0" class="planninq-dashboard__project-list">
				<!-- A bare @click on an <li> is mouse-only: the element is
				     not focusable and fires nothing on Enter or Space, so
				     this list was unreachable by keyboard entirely. -->
				<li
					v-for="project in recentProjects"
					:key="project.id"
					class="planninq-dashboard__project-item"
					role="button"
					tabindex="0"
					@click="navigateToProject(project)"
					@keydown.enter="navigateToProject(project)"
					@keydown.space.prevent="navigateToProject(project)">
					<!-- `icon` holds either an emoji or a PascalCase MDI name
					     (the seed writes names). Printing it raw rendered
					     "AccountMultiplePlusOnboarding Automation" in the list;
					     a name goes through CnIcon, anything else stays text. -->
					<CnIcon
						v-if="isIconName(project.icon)"
						class="planninq-dashboard__project-icon"
						:name="project.icon"
						:size="16" />
					<span
						v-else-if="project.icon"
						class="planninq-dashboard__project-icon">{{ project.icon }}</span>
					<span>{{ project.title }}</span>
				</li>
			</ul>
			<p v-else class="planninq-dashboard__hint">
				{{ t('planninq', 'You are not a member of any projects yet.') }}
			</p>
		</CnConfigurationCard>

		<CnConfigurationCard :title="t('planninq', 'Quick actions')">
			<p class="planninq-dashboard__hint">
				{{ t('planninq', 'Use the Projects page to create and manage your projects and tasks.') }}
			</p>
			<NcButton variant="primary" @click="$router.push({ name: 'Projects' })">
				{{ t('planninq', 'Go to projects') }}
			</NcButton>
		</CnConfigurationCard>
	</div>
</template>

<script>
/**
 * Dashboard side panels.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-11
 */
import { CnConfigurationCard, CnIcon } from '@conduction/nextcloud-vue'
import { NcButton, NcLoadingIcon } from '@nextcloud/vue'
import { useProjectsStore } from '../store/projects.js'

export default {
	name: 'DashboardPanels',

	components: {
		CnConfigurationCard,
		CnIcon,
		NcButton,
		NcLoadingIcon,
	},

	computed: {
		/**
		 * @spec exclude Store passthrough — returns the projects Pinia store.
		 */
		projectsStore() {
			return useProjectsStore()
		},

		/**
		 * @spec exclude Store passthrough — proxies projectsStore.loading.
		 */
		loading() {
			return this.projectsStore.loading
		},

		/**
		 * Up to 5 most recent active projects, sorted by title for now.
		 *
		 * @return {Array}
		 */
		recentProjects() {
			return this.projectsStore.projects
				.filter((p) => p.status === 'active')
				.slice(0, 5)
		},
	},

	/**
	 * @spec exclude Lifecycle bootstrap — fetches the project list the panel lists.
	 */
	async mounted() {
		await this.projectsStore.fetchProjects()
	},

	methods: {
		/**
		 * Whether a project's `icon` is a PascalCase MDI name (rendered through
		 * CnIcon) rather than an emoji or other literal text.
		 *
		 * @param {string} icon The stored icon value.
		 * @return {boolean} True when it should render as an icon component.
		 */
		isIconName(icon) {
			return typeof icon === 'string' && /^[A-Z][A-Za-z0-9]+$/.test(icon)
		},

		/**
		 * Navigate to a project's board.
		 *
		 * @param {object} project Project to navigate to
		 */
		navigateToProject(project) {
			this.$router.push({ name: 'ProjectBoard', params: { id: project.id } })
		},
	},
}
</script>

<style scoped>
.planninq-dashboard__columns {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
}

@media (max-width: 900px) {
	.planninq-dashboard__columns {
		grid-template-columns: 1fr;
	}
}

.planninq-dashboard__project-list {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.planninq-dashboard__project-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: var(--border-radius);
	cursor: pointer;
	font-size: 14px;
}

.planninq-dashboard__project-item:hover {
	background: var(--color-background-hover);
}

.planninq-dashboard__project-icon {
	font-size: 16px;
}

.planninq-dashboard__hint {
	margin: 0 0 12px;
	line-height: 1.5;
	color: var(--color-text-maxcontrast);
}
</style>
