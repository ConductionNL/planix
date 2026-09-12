/**
 * Planninq v2 component registry (ADR-036).
 *
 * Kind-tagged map passed as the `registry` prop to CnAppRoot. CnPageRenderer
 * resolves every manifest-referenced component name — `type:"custom"` page
 * components and the dashboard's slot-mounted widget — against this map,
 * keying on the `kind` discriminator.
 *
 * Planninq's pages are hand-written Vue views rather than declarative index /
 * detail pages: the manifest owns the ROUTES, the NAVIGATION and the dashboard,
 * and each view is mounted by name from here. That is the Tier-1 shape from
 * docs/migrating-to-manifest.md, and it is what "manifest driven" means for an
 * app whose screens are boards and timelines rather than object tables.
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: 2026 Conduction B.V.
 */

// NOTE: the dashboard's DashboardPanels component is NOT registered here. A
// dashboard widget TYPE resolves against the library's own widget catalog via
// registerDashboardWidget() in main.js; this registry is for page components
// and slot overrides only.
import Boards from './views/Boards.vue'
import Portfolio from './views/Portfolio.vue'
import ProjectBacklog from './views/ProjectBacklog.vue'
import ProjectBoard from './views/ProjectBoard.vue'
import ProjectList from './views/ProjectList.vue'
import ProjectTimeline from './views/ProjectTimeline.vue'
import TaskDetail from './views/TaskDetail.vue'
import Timesheet from './views/Timesheet.vue'

/**
 * A routed page component — the target of a manifest `type:"custom"` page.
 *
 * @param {object} component The Vue component.
 * @return {object} Kind-tagged registry entry.
 */
function page(component) {
	return { kind: 'page', component }
}

export default {
	Boards: page(Boards),
	Portfolio: page(Portfolio),
	ProjectBacklog: page(ProjectBacklog),
	ProjectBoard: page(ProjectBoard),
	ProjectList: page(ProjectList),
	ProjectTimeline: page(ProjectTimeline),
	TaskDetail: page(TaskDetail),
	Timesheet: page(Timesheet),
}
