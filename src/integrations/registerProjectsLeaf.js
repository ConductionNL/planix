// SPDX-License-Identifier: EUPL-1.2
// Copyright (C) 2026 Conduction B.V.
//
// The CLIENT half of the `planninq-projects` leaf (ADR-066). Its server half is
// lib/Listener/RegisterProjectsLeafListener.php, and the two are bound by the
// shared id below — never by an import.
//
// Every field this file declares is compared field-by-field against that
// listener's constants by scripts/check-integration-parity.js (gate-24). Change
// one side only and the gate says so; change neither and they cannot drift.

import { translate as t } from '@nextcloud/l10n'
import { createApp } from 'vue'
import CnProjectsWidget from './CnProjectsWidget.vue'

/**
 * The integration id a consuming app references to place this leaf.
 *
 * @type {string}
 */
export const PROJECTS_INTEGRATION_ID = 'planninq-projects'

/**
 * Vue 3 app instances this leaf has mounted, keyed by the host-owned element.
 *
 * Keyed by ELEMENT, not by leaf id: the same leaf may be mounted several times
 * on one page — a sidebar tab and a detail-page widget at once — and each needs
 * its own instance to unmount independently.
 *
 * @type {Map<Element, import('vue').App>}
 */
const mountedApps = new Map()

/**
 * Every render surface this leaf targets.
 *
 * The list is duplicated verbatim by `RegisterProjectsLeafListener::SURFACES` on
 * the server half, and gate-24 compares the two. A half that declares its
 * surfaces by OMISSION is how hermiq's two halves drifted apart unnoticed.
 *
 * @type {string[]}
 */
const SURFACES = [
	'user-dashboard',
	'app-dashboard',
	'detail-page',
	'single-entity',
]

/**
 * Root a planninq-owned Vue 3 app at a host-owned element.
 *
 * planninq is Vue 3 and a consuming host may be Vue 2.7. A Vue-3 SFC handed to
 * such a host is interpreted under the host's incompatible runtime and renders
 * blank, so the host hands over a bare DOM element instead and each side runs
 * its own framework across that neutral boundary. Idempotent per element.
 *
 * @param {Element} el    Host-owned container element.
 * @param {object}  props Forwarded context: { register, schema, objectId, surface, … }.
 *
 * @return {void}
 */
function mount(el, props) {
	if (el === undefined || el === null || mountedApps.has(el) === true) {
		return
	}
	const app = createApp(CnProjectsWidget, { ...(props || {}) })
	// The SFC calls `this.t(...)`; main.js installs these for the app bundle,
	// and this leaf mounts its own instance, so install them here too (ADR-066).
	app.config.globalProperties.t = t
	app.mount(el)
	mountedApps.set(el, app)
}

/**
 * Destroy the app rooted at `el` and release the map entry.
 *
 * @param {Element} el The element previously passed to `mount`.
 *
 * @return {void}
 */
function unmount(el) {
	const app = mountedApps.get(el)
	if (app === undefined) {
		return
	}
	mountedApps.delete(el)
	app.unmount()
}

/**
 * The integration descriptor for the projects leaf.
 *
 * @type {object}
 */
export const projectsLeafDescriptor = {
	id: PROJECTS_INTEGRATION_ID,
	label: t('planninq', 'Projects'),
	icon: 'FolderOutline',
	requiredApp: 'planninq',
	order: 30,
	group: 'workflow',
	surfaces: SURFACES,
	// AD-18: a schema property carrying this referenceType renders this leaf's
	// single-entity surface instead of a plain value. It is the INTEGRATION ID,
	// not a loose word like 'project': OpenRegister's
	// PropertyReferenceTypeValidator resolves the marker through
	// IntegrationRegistry.isValidIntegrationId() and throws on a miss. Kept
	// byte-identical to the PHP half's REFERENCE_TYPE, which gate-24 compares.
	referenceType: 'planninq-projects',
	renderMode: 'mount',
	mount,
	unmount,
	defaultSize: { w: 4, h: 2 },
}

/**
 * Register the leaf on the shared OpenRegister integration registry.
 *
 * Installs a load-order-safe queue stub when OpenRegister's bundle has not yet
 * installed the real registry, so a planninq bundle that loads first is not
 * lost. Idempotent under the AD-13 collision policy: the first registration of
 * this id wins, a duplicate warns in production and throws in development.
 *
 * @param {object} [globalRef] Global to attach to (defaults to `window`).
 *
 * @return {void}
 */
export function registerProjectsLeaf(globalRef) {
	const target = globalRef || (typeof window !== 'undefined' ? window : null)
	if (target === null) {
		return
	}

	target.OCA = target.OCA || {}
	target.OCA.OpenRegister = target.OCA.OpenRegister || {}
	target.OCA.OpenRegister.integrations = target.OCA.OpenRegister
		.integrations || {
		_queue: [],
		register(entry) {
			this._queue.push(entry)
		},
	}

	target.OCA.OpenRegister.integrations.register(projectsLeafDescriptor)
}
