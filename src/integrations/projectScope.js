// SPDX-License-Identifier: EUPL-1.2
// Copyright (C) 2026 Conduction B.V.
//
// The scoping rules behind the `planninq-projects` leaf, as pure functions.
//
// They live outside CnProjectsWidget.vue so they can be tested without a DOM:
// tests/vitest runs in a node environment with no Vue plugin, so anything that
// only exists inside an SFC is, in practice, not covered by anything.

/**
 * Which surface asks which question.
 *
 * @type {{SINGLE: string}}
 */
export const SINGLE_ENTITY = 'single-entity'

/**
 * The query parameters that scope a project read for one surface.
 *
 * 🔴 BARE FIELD NAMES, NOT `_filters[field]`. OpenRegister's object API reads
 * `client=<uuid>`; the bracketed spellings are accepted and silently IGNORED,
 * so they return every row while looking exactly like a filtered read
 * (measured against the live API 2026-09-02). The symptom is always "too much
 * data", never an error — which is why `guardRows` exists as well.
 *
 * @param {string} surface  The render surface the host mounted the leaf into.
 * @param {string} objectId The host object's uuid, or the project's own uuid.
 *
 * @return {object} Query parameters for the object API.
 */
export function scopeParams(surface, objectId) {
	if (surface === SINGLE_ENTITY) {
		return { id: objectId }
	}
	if (objectId) {
		return { client: objectId }
	}
	return { status: 'active' }
}

/**
 * Drop rows the server should have filtered out but may not have.
 *
 * Belt and braces, not a substitute for the query: it is what stops an ignored
 * filter from listing one client's projects under another client's name.
 *
 * @param {Array}  rows     The rows the API returned.
 * @param {string} surface  The render surface.
 * @param {string} objectId The host object's uuid, or the project's own uuid.
 *
 * @return {Array} Only the rows this surface actually asked for.
 */
export function guardRows(rows, surface, objectId) {
	const list = Array.isArray(rows) ? rows : []
	if (surface === SINGLE_ENTITY) {
		return list.filter((r) => idOf(r) === objectId && objectId !== '')
	}
	if (objectId) {
		return list.filter((r) => r && r.client === objectId)
	}
	return list.filter((r) => r && r.status === 'active')
}

/**
 * An object's uuid, whichever shape the API returned it in.
 *
 * @param {object} row The row.
 *
 * @return {string} The uuid, or ''.
 */
export function idOf(row) {
	if (!row) {
		return ''
	}
	return row.id || (row['@self'] && row['@self'].id) || ''
}

/**
 * Sum the agreed budgets of a set of projects.
 *
 * A missing or unparseable budget counts as nothing rather than as NaN, which
 * would poison the whole total and render as "NaN" on the widget.
 *
 * @param {Array} projects The projects.
 *
 * @return {number} The summed budget.
 */
export function budgetOf(projects) {
	const list = Array.isArray(projects) ? projects : []
	return list.reduce((sum, p) => sum + (Number(p && p.budgetAmount) || 0), 0)
}
