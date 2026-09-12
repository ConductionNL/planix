<!--
  - SPDX-FileCopyrightText: 2026 Conduction B.V.
  - SPDX-License-Identifier: EUPL-1.2
-->

<template>
	<div class="pq-projects-widget">
		<p v-if="error" class="pq-projects-widget__error">
			{{ error }}
		</p>

		<template v-else>
			<div v-if="showTotals" class="pq-projects-widget__figure">
				<span class="pq-projects-widget__value">{{
					displayCount
				}}</span>
				<span class="pq-projects-widget__unit">{{ countLabel }}</span>
				<span v-if="budgetTotal > 0" class="pq-projects-widget__budget">
					{{ formatAmount(budgetTotal) }}
				</span>
			</div>

			<p v-if="loading" class="pq-projects-widget__empty">
				{{ t('planninq', 'Loading projects') }}
			</p>
			<p
				v-else-if="projects.length === 0"
				class="pq-projects-widget__empty">
				{{ emptyLabel }}
			</p>
			<ul v-else class="pq-projects-widget__list">
				<li
					v-for="project in visibleProjects"
					:key="project.id"
					class="pq-projects-widget__row">
					<a
						class="pq-projects-widget__row-title"
						:href="projectUrl(project)">
						{{ project.title || t('planninq', 'Untitled project') }}
					</a>
					<span class="pq-projects-widget__row-status">{{
						statusLabel(project.status)
					}}</span>
					<span
						v-if="project.billable"
						class="pq-projects-widget__row-billable">
						{{ t('planninq', 'Billable') }}
					</span>
					<span
						v-if="Number(project.budgetAmount) > 0"
						class="pq-projects-widget__row-budget">
						{{ formatAmount(project.budgetAmount) }}
					</span>
				</li>
			</ul>

			<p v-if="truncated" class="pq-projects-widget__more">
				{{ moreLabel }}
			</p>

			<div class="pq-projects-widget__actions">
				<button
					type="button"
					class="pq-projects-widget__action"
					@click="openProjects">
					{{ t('planninq', 'Open in Planninq') }}
				</button>
				<button
					v-if="canCreate"
					type="button"
					class="pq-projects-widget__action"
					@click="openNewProject">
					{{ t('planninq', 'New project') }}
				</button>
			</div>
		</template>
	</div>
</template>

<script>
/**
 * CnProjectsWidget — the projects belonging to whatever object hosts this leaf.
 *
 * Planninq owns projects, so planninq renders them. The consuming app places
 * this leaf and passes the object context; it does not query planninq's
 * register itself.
 *
 * That indirection is the point. Pipelinq used to list a client's projects from
 * its OWN manifest against `register: pipelinq`, which meant that on an install
 * without the owning app the table rendered empty — indistinguishable from a
 * client that genuinely has no projects. A leaf cannot render at all when its
 * app is absent, so the failure mode disappears rather than being handled.
 *
 * THREE SURFACES, THREE QUESTIONS. The host tells us which one it mounted:
 *
 *   - `single-entity` — the host property IS a project uuid (the AD-18
 *     `referenceType: 'planninq-projects'` marker, which is how shillinq's
 *     `ProjectAssignment.projectId` renders). We show that one project.
 *     NOT `ProjectBudget.projectId`, which $refs shillinq's own
 *     AnalyticalDimension and is a cost-accounting dimension, not this.
 *   - `detail-page` — the host object is something projects hang off, so far
 *     always a client. We show the projects whose `client` is that object.
 *   - the dashboards — there is no host object. We show active projects.
 *
 * FILTERING IS A BARE FIELD NAME. OpenRegister's object API reads `client=<uuid>`
 * and IGNORES `_filters[client]` / `filter[client]` — measured against the live
 * API 2026-09-02, where the bracketed form returned every row while looking
 * exactly like a filtered read. The symptom is always "too much data", never an
 * error, which is why `guardRows()` re-checks every row and the count comes from
 * what survived it rather than from the server's own total.
 */
import axios from '@nextcloud/axios'
import { translate as t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import {
	budgetOf,
	guardRows,
	idOf,
	scopeParams,
	SINGLE_ENTITY,
} from './projectScope.js'

/** Planninq's own register slug — the projects live here, not in the host's. */
const PLANNINQ_REGISTER = 'planninq'

/** The schema this widget reads. */
const PROJECT_SCHEMA = 'project'

export default {
	name: 'CnProjectsWidget',

	// The host also passes `register` and `schema` for the object it mounted us
	// on. They are deliberately NOT declared: `project` has exactly one property
	// that points at a host object (`client`), so there is nothing for the host's
	// own type to select between. Declaring them to ignore them is how a prop
	// starts looking load-bearing. Vue forwards them as attrs regardless, so the
	// day a second host relationship exists they can be picked up here.
	props: {
		/** The host object's uuid, or the project uuid on `single-entity`. */
		objectId: {
			type: String,
			default: '',
		},

		/** The render surface the host mounted us into. */
		surface: {
			type: String,
			default: 'detail-page',
		},

		/** How many projects to list. */
		limit: {
			type: Number,
			default: 5,
		},
	},

	data() {
		return {
			projects: [],
			total: 0,
			loading: false,
			error: '',
		}
	},

	computed: {
		/**
		 * True when this surface renders one named project rather than a list.
		 *
		 * @return {boolean} Whether the host handed us a project uuid.
		 */
		isSingleEntity() {
			return this.surface === SINGLE_ENTITY
		},

		/**
		 * True when the host object is something projects can hang off.
		 *
		 * @return {boolean} Whether to scope the list to the host object.
		 */
		isHostScoped() {
			return this.isSingleEntity === false && this.objectId !== ''
		},

		/**
		 * A count and budget headline only make sense for a list.
		 *
		 * @return {boolean} Whether to render the figure block.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		showTotals() {
			return this.isSingleEntity === false
		},

		/**
		 * A "New project" button only makes sense where a client is in scope.
		 *
		 * @return {boolean} Whether creating from here would know its client.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		canCreate() {
			return this.isHostScoped
		},

		/**
		 * The project count, or a dash while unknown.
		 *
		 * A dash rather than 0 on failure, deliberately: a zero that means "could
		 * not read" is the defect this whole leaf exists to remove.
		 *
		 * @return {string|number} The count, or '—'.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		displayCount() {
			if (this.error !== '') {
				return '—'
			}
			return this.total
		},

		/**
		 * @return {string} The noun the count is counting.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		countLabel() {
			return t('planninq', 'Projects')
		},

		/**
		 * @return {string} The empty state, phrased for the surface.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		emptyLabel() {
			if (this.isSingleEntity) {
				return t('planninq', 'This project could not be found')
			}
			if (this.isHostScoped) {
				return t('planninq', 'No projects for this client yet')
			}
			return t('planninq', 'No projects yet')
		},

		/**
		 * @return {number} Summed budget of the projects in view.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		budgetTotal() {
			return budgetOf(this.projects)
		},

		/**
		 * @return {Array} At most `limit` projects.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		visibleProjects() {
			return this.projects.slice(0, this.limit)
		},

		/**
		 * @return {boolean} Whether more projects exist than are listed.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		truncated() {
			return this.total > this.visibleProjects.length
		},

		/**
		 * @return {string} The "and N more" line.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		moreLabel() {
			const rest = this.total - this.visibleProjects.length
			return t('planninq', 'and {count} more', { count: rest })
		},
	},

	watch: {
		objectId: 'load',
		surface: 'load',
	},

	mounted() {
		this.load()
	},

	methods: {
		t,

		/**
		 * Read the projects this surface is asking about from OpenRegister.
		 *
		 * @return {Promise<void>} Resolves when the list has settled.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		async load() {
			this.loading = true
			this.error = ''
			try {
				const url = generateUrl(
					'/apps/openregister/api/objects/{register}/{schema}',
					{
						register: PLANNINQ_REGISTER,
						schema: PROJECT_SCHEMA,
					},
				)

				const { data } = await axios.get(url, {
					params: {
						_limit: 100,
						...scopeParams(this.surface, this.objectId),
					},
				})
				const rows = Array.isArray(data?.results)
					? data.results
					: Array.isArray(data)
						? data
						: []

				// A filter that did not run returns MORE than it should, and looks
				// like success. So the count comes from the rows this widget was
				// actually willing to show, never from the server's own total.
				this.projects = guardRows(rows, this.surface, this.objectId)
				this.total = this.projects.length
			} catch {
				// Say so rather than render an empty list. See the docblock.
				this.error = t('planninq', 'Could not load projects')
				this.projects = []
				this.total = 0
			} finally {
				this.loading = false
			}
		},

		/**
		 * Deep link to one project inside planninq.
		 *
		 * @param {object} project The project row.
		 * @return {string} The url of its board.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		projectUrl(project) {
			return generateUrl('/apps/planninq/projects/{id}', {
				id: idOf(project),
			})
		},

		/**
		 * Open planninq's project list.
		 *
		 * @return {void}
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		openProjects() {
			window.open(generateUrl('/apps/planninq/projects'), '_self')
		},

		/**
		 * Open planninq's project list with this client pre-selected.
		 *
		 * @return {void}
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		openNewProject() {
			const url = generateUrl(
				'/apps/planninq/projects?new=1&client={client}',
				{
					client: this.objectId,
				},
			)
			window.open(url, '_self')
		},

		/**
		 * A project's status, in the reader's language.
		 *
		 * @param {string} status The stored enum value.
		 * @return {string} The label.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		statusLabel(status) {
			const labels = {
				active: t('planninq', 'Active'),
				archived: t('planninq', 'Archived'),
				completed: t('planninq', 'Completed'),
				cancelled: t('planninq', 'Cancelled'),
			}
			return labels[status] || status || ''
		},

		/**
		 * Format an amount as euros, without cents.
		 *
		 * @param {number} value The amount.
		 * @return {string} The formatted amount.
		 *
		 * @spec openspec/specs/project-delivery/spec.md#requirement-the-leaf-answers-the-question-its-surface-asked-v1
		 */
		formatAmount(value) {
			const n = Number(value) || 0
			try {
				return new Intl.NumberFormat(undefined, {
					style: 'currency',
					currency: 'EUR',
					maximumFractionDigits: 0,
				}).format(n)
			} catch {
				return String(Math.round(n))
			}
		},
	},
}
</script>

<style scoped>
.pq-projects-widget {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px 0;
}

.pq-projects-widget__figure {
	display: flex;
	align-items: baseline;
	gap: 6px;
}

.pq-projects-widget__value {
	font-size: 1.6em;
	font-weight: 600;
}

.pq-projects-widget__unit {
	color: var(--color-text-maxcontrast);
}

.pq-projects-widget__budget {
	margin-inline-start: auto;
	color: var(--color-text-maxcontrast);
}

.pq-projects-widget__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.pq-projects-widget__row {
	display: flex;
	align-items: baseline;
	gap: 8px;
}

.pq-projects-widget__row-title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pq-projects-widget__row-status,
.pq-projects-widget__row-billable,
.pq-projects-widget__row-budget {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}

.pq-projects-widget__row-budget {
	margin-inline-start: auto;
}

.pq-projects-widget__empty,
.pq-projects-widget__more {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.pq-projects-widget__error {
	margin: 0;
	color: var(--color-error);
}

.pq-projects-widget__actions {
	display: flex;
	gap: 8px;
}
</style>
