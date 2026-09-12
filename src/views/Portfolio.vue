<template>
	<div class="portfolio">
		<div class="portfolio__header">
			<h2 class="portfolio__title">
				{{ t('planninq', 'Portfolio') }}
			</h2>
			<p class="portfolio__subtitle">
				{{ t('planninq', 'Capacity across your projects') }}
			</p>
		</div>

		<div v-if="loading" class="portfolio__loading">
			<NcLoadingIcon :size="32" />
		</div>

		<NcEmptyContent
			v-else-if="rows.length === 0"
			:name="t('planninq', 'No projects yet')"
			:description="t('planninq', 'Create a project to see capacity here.')">
			<template #icon>
				<ChartBarIcon :size="20" />
			</template>
		</NcEmptyContent>

		<div v-else class="portfolio__content">
			<!-- Simple horizontal bar chart of open task counts per project.
			     Uses CSS bars (NC design tokens) rather than a bespoke charting
			     library (ADR-036). -->
			<table class="portfolio__table">
				<thead>
					<tr>
						<th scope="col">
							{{ t('planninq', 'Project') }}
						</th>
						<th scope="col">
							{{ t('planninq', 'Members') }}
						</th>
						<th scope="col">
							{{ t('planninq', 'Open') }}
						</th>
						<th scope="col">
							{{ t('planninq', 'Overdue') }}
						</th>
						<th scope="col" class="portfolio__bar-col">
							{{ t('planninq', 'Open work') }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in rows" :key="row.id">
						<th scope="row" class="portfolio__project-cell">
							{{ row.icon }} {{ row.title }}
						</th>
						<td>{{ row.members }}</td>
						<td>{{ row.open }}</td>
						<td :class="{ portfolio__overdue: row.overdue > 0 }">
							{{ row.overdue }}
						</td>
						<td class="portfolio__bar-col">
							<div class="portfolio__bar-track">
								<div
									class="portfolio__bar"
									:style="{ width: barWidth(row.open) }"
									:aria-label="t('planninq', '{count} open tasks', { count: row.open })" />
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script>
/**
 * Portfolio view — capacity-planning MVP (ADR-001 IA, Portfolio menu).
 *
 * For every project the user is a member of, shows member count and open /
 * overdue task counts with a simple bar chart of open work. Reads directly
 * from the `project`/`task` OpenRegister schemas via the projects store and a
 * client-side reduce (ADR-022 — no bespoke aggregation service). BBV /
 * cross-app PMO rollups are explicitly out of scope (tracked follow-ups).
 *
 * @spec openspec/specs/capacity-planning-resource.md
 */
import { NcEmptyContent, NcLoadingIcon } from '@nextcloud/vue'
import ChartBarIcon from 'vue-material-design-icons/ChartBar.vue'
import { useProjectsStore } from '../store/projects.js'
import { summariseProjectTasks } from '../utils/portfolioHelpers.js'

export default {
	name: 'Portfolio',

	components: { NcEmptyContent, NcLoadingIcon, ChartBarIcon },

	data() {
		return {
			projectsStore: useProjectsStore(),
			rows: [],
			loading: true,
		}
	},

	computed: {
		/**
		 * The largest open-task count across projects (bar-chart scale).
		 *
		 * @spec exclude Display helper — chart scaling.
		 */
		maxOpen() {
			return this.rows.reduce((max, r) => Math.max(max, r.open), 0)
		},
	},

	/**
	 * @spec exclude Lifecycle glue — loads projects + per-project task counts.
	 */
	async mounted() {
		await this.loadCapacity()
	},

	methods: {
		/**
		 * Load member projects and reduce each project's tasks into capacity
		 * counts.
		 *
		 * @return {Promise<void>}
		 *
		 * @spec openspec/specs/capacity-planning-resource.md
		 */
		async loadCapacity() {
			this.loading = true
			try {
				const projects = await this.projectsStore.fetchProjects({ status: 'active' })
				const rows = []
				for (const project of projects) {
					const tasks = await this.projectsStore.fetchTasks(project.id)
					const stats = summariseProjectTasks(tasks)
					rows.push({
						id: project.id,
						title: project.title,
						icon: project.icon || '',
						members: Array.isArray(project.members) ? project.members.length : 0,
						open: stats.open,
						overdue: stats.overdue,
						total: stats.total,
					})
				}
				this.rows = rows
			} finally {
				this.loading = false
			}
		},

		/**
		 * The CSS width for a project's open-work bar (relative to the busiest
		 * project).
		 *
		 * @param {number} open Open task count.
		 * @return {string} A CSS width percentage.
		 *
		 * @spec exclude Display helper — bar width.
		 */
		barWidth(open) {
			if (this.maxOpen <= 0) {
				return '0%'
			}
			return `${Math.round((open / this.maxOpen) * 100)}%`
		},
	},
}
</script>

<style scoped>
.portfolio {
	padding: 24px;
	max-width: 1000px;
}

.portfolio__header {
	margin-bottom: 24px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--color-border);
}

.portfolio__title {
	margin: 0;
}

.portfolio__subtitle {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
}

.portfolio__loading {
	display: flex;
	justify-content: center;
	padding: 48px 0;
}

.portfolio__table {
	width: 100%;
	border-collapse: collapse;
}

.portfolio__table th,
.portfolio__table td {
	padding: 8px 12px;
	text-align: start;
	border-bottom: 1px solid var(--color-border);
}

.portfolio__project-cell {
	font-weight: 600;
}

.portfolio__overdue {
	color: var(--color-error);
	font-weight: 600;
}

.portfolio__bar-col {
	width: 30%;
}

.portfolio__bar-track {
	width: 100%;
	height: 12px;
	background: var(--color-background-dark);
	border-radius: 6px;
	overflow: hidden;
}

.portfolio__bar {
	height: 100%;
	min-width: 2px;
	background: var(--color-primary-element);
	border-radius: 6px;
}
</style>
