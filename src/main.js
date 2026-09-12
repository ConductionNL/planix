import {
	buildManifest,
	CnPageRenderer,
	defaultPageTypes,
	registerBuiltinDashboardWidgets,
	registerDashboardWidget,
	registerIcons,
	registerTranslations,
} from '@conduction/nextcloud-vue'
import { loadTranslations, translatePlural as n, translate as t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import DashboardPanels from './components/DashboardPanels.vue'
import appIcons from './icons.js'
import { registerProjectsLeaf } from './integrations/registerProjectsLeaf.js'
import bundledManifest from './manifest.json'
import pinia from './pinia.js'
import registry from './registry.js'
import { initializeStores } from './store/store.js'

// Library CSS — must be explicit import (webpack tree-shakes side-effect imports from aliased packages)
import '@conduction/nextcloud-vue/css/index.css'
// nc-vue's CnDashboardGrid/CnWidgetGrid no longer bundle gridstack's JS or CSS
// (nc-vue#557) — it is a peerDependency, so the consuming app must supply both.
// Without this import every grid item renders 0px wide: height comes from JS
// and is set correctly, width comes from this stylesheet via
// `--gs-column-width`, so a missing stylesheet makes width silently disagree
// with height. Planninq needs it now that its dashboard is a manifest
// `type:"dashboard"` page rendered on the grid.
import 'gridstack/dist/gridstack.min.css'
// Global (unscoped) app styles
import './assets/app.css'

// ADR-077 rule 3. The shared components resolve an `icon` by PascalCase name
// through this registry, and an unregistered name renders NO icon rather than a
// fallback — so a missing registerIcons() call is invisible in code review and
// shows up only as silently icon-less navigation.
//
// Called at module scope, before mountApp(), so the registry is populated
// before any component renders.
registerIcons(appIcons)

// Populate the dashboard widget catalog. The library self-registers its widgets
// via bare side-effect imports in the barrel, which webpack may drop — leaving
// the registry empty, so the dashboard's `stat` tiles render "Widget not
// available". This exported no-op forces the registration module to evaluate.
registerBuiltinDashboardWidgets()

// Publish the `planninq-projects` leaf on OpenRegister's integration registry.
//
// Planninq owns projects, so every other app reads them through this rather
// than querying planninq's register from its own manifest. At module scope on
// purpose: a consuming page may mount the leaf before planninq's own app has
// mounted, and the registry stub in registerProjectsLeaf.js queues the entry
// when OpenRegister's bundle has not loaded yet.
//
// Its server half is lib/Listener/RegisterProjectsLeafListener.php. The two are
// bound by the shared id, and gate-24 compares them field by field.
registerProjectsLeaf()

// The dashboard's "My projects" / "Quick actions" panels.
//
// ⚠️ A dashboard widget type is resolved against the LIBRARY's widget catalog
// (`getWidgetTypeEntry`, populated by this call), NOT against the app's
// `registry` prop — CnDashboardPage's grid reaches `registryRenderer(item)`
// only after its typed branches, and an unregistered type falls through to the
// "Widget not available" placeholder with nothing logged. The app `registry` is
// for PAGE components and slot overrides; it is not consulted here.
registerDashboardWidget('project-panels', {
	renderer: DashboardPanels,
	defaultContent: {},
	displayName: 'Project panels',
	icon: 'FolderOutline',
	card: true,
})

try {
	registerTranslations()
} catch (e) {
	console.warn('[planninq] registerTranslations failed; lib strings fall back to English source', e)
}

// Shallow-clone CnPageRenderer because the lib's barrel exports are
// non-extensible ESM module records, and the router stores per-route
// bookkeeping against the component object.
const RoutePageRenderer = { ...CnPageRenderer }

/**
 * Build the vue-router config from the manifest. Each manifest page becomes one
 * route whose `name` IS `page.id` — the library's contract, since menu entries
 * reference pages by id and CnPageRenderer matches on `$route.name`. Routes
 * whose path declares a `:` parameter get `props: true` so route params reach
 * the rendered page.
 *
 * Page order in the manifest is preserved: it matches the order the
 * hand-written router declared, so `/projects` still resolves before
 * `/projects/:id` and the nested backlog / timeline / task routes keep their
 * relative precedence.
 *
 * @param {object} manifest The bundled manifest (with `pages[]`).
 * @return {Array<object>} vue-router 4 routes config.
 */
function routesFromManifest(manifest) {
	const routes = manifest.pages.map((page) => ({
		name: page.id,
		path: page.route,
		component: RoutePageRenderer,
		props: page.route.includes(':'),
	}))
	// vue-router 4 REMOVED the bare `path: '*'` wildcard. It does not throw —
	// the route simply never matches, so an unknown URL renders the app shell
	// with an empty <main> and nothing in the console. This is the v4 spelling.
	routes.push({ path: '/:pathMatch(.*)*', redirect: '/' })
	return routes
}

// ADR-044 §1: build the effective manifest through the shared
// `buildManifest(base, fragments, menuLayout)` pipeline rather than handing the
// bundled JSON straight to CnAppRoot. Planninq ships no `manifest.d/` fragments
// and no menu-layout overrides today, so this is a normalising pass, not a
// merge — but it is the pipeline every other manifest-driven app in the fleet
// runs, and the shape it produces is the one CnPageRenderer is written against.
const mergedManifest = buildManifest(bundledManifest, [], {})

/**
 * The router base for THIS page load.
 *
 * ⚠️ `generateUrl('/apps/planninq')` alone is not enough. Nextcloud serves the
 * app under BOTH `/apps/planninq/...` and `/index.php/apps/planninq/...`, but
 * `generateUrl()` returns only the form the instance is configured for. A
 * visitor arriving on the other form — a bookmark, an emailed deep link, an
 * integration that hardcodes `/index.php` — has a pathname the router cannot
 * strip its base from. No route matches, the catch-all takes over, and they
 * land on the dashboard with no error at all: the deep link is silently
 * swallowed.
 *
 * Measured on a live instance for learniq, across all 282 of its routes:
 * `/apps/learniq/courses` resolved to Courses, `/index.php/apps/learniq/courses`
 * resolved to the dashboard. Every route behaved the same way, so this is not
 * one broken page but every deep link in that URL form.
 *
 * Deriving the base from the pathname makes both forms resolve, because the
 * base then always matches the URL the visitor actually arrived on.
 *
 * @return {string} The base path vue-router should strip from the URL.
 */
function routerBase() {
	const match = window.location.pathname.match(/^(.*\/apps\/planninq)(?:\/|$)/)
	return match ? match[1] : generateUrl('/apps/planninq')
}

const router = createRouter({
	// vue-router 4 replaces `mode: 'history'` + `base` with a history object
	// that carries the base itself. The router is installed per app instance
	// (`app.use(router)` below), so there is no `Vue.use(Router)` any more.
	history: createWebHistory(routerBase()),
	routes: routesFromManifest(mergedManifest),
})

/**
 * Bootstrap the Planninq SPA.
 *
 * @return {void}
 */
function mountApp() {
	// Pass shallow copies of the registry maps — the lib exports
	// `defaultPageTypes` (and the app's `registry`) as frozen module objects in
	// some bundle shapes, and the renderer merges into them.
	const app = createApp(App, {
		manifest: mergedManifest,
		registry: { ...registry },
		pageTypes: { ...defaultPageTypes },
	})

	// Vue 3 has no global `Vue.mixin` / `Vue.use` — both are per-app instance.
	app.mixin({ methods: { t, n } })
	app.use(pinia)
	app.use(router)

	// ⚠️ The host element is `#planninq-app`, NOT `#content`.
	//
	// Vue 2's `$mount()` REPLACED the matched element; Vue 3's `mount()`
	// renders INSIDE it. The old `<div id="content">` in templates/index.php
	// duplicates Nextcloud's own `layout.user.php` wrapper — under Vue 2 the
	// duplication was invisible because the app replaced core's div, but under
	// Vue 3 the app would render *inside* core's `#content` and the NcContent
	// layout breaks. Renaming the host element sidesteps the question of which
	// div wins entirely.
	app.mount('#planninq-app')

	// Initialize stores after mount.
	initializeStores()
}

// Load translations first so `t()` resolves real strings on first render — but
// mount either way.
//
// `loadTranslations` only invokes its callback when the fetch succeeds; on a
// 404 (any locale for which `l10n/<lang>.json` was never generated) it REJECTS
// and the callback never runs. Mounting inside the callback therefore leaves a
// permanently blank page for those users, with only a network 404 to show for
// it. `.finally()` runs the mount exactly once on both paths.
loadTranslations('planninq')
	.catch((error) => {
		console.warn('[planninq] translations could not be loaded; falling back to source strings', error)
	})
	.finally(mountApp)
