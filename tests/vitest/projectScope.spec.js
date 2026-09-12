// SPDX-License-Identifier: EUPL-1.2
// Copyright (C) 2026 Conduction B.V.

import { describe, expect, it } from 'vitest'
import {
	budgetOf,
	guardRows,
	idOf,
	scopeParams,
} from '../../src/integrations/projectScope.js'

/**
 * The scoping rules behind the `planninq-projects` leaf.
 *
 * The case that matters most is the last describe block: OpenRegister accepts
 * `_filters[client]` and silently ignores it, so an unfiltered response is
 * indistinguishable from a filtered one by its shape alone. These tests pin
 * both halves of the defence — the bare param that actually filters, and the
 * guard that catches it when it does not.
 */
describe('scopeParams', () => {
	it('asks for one project by id on the single-entity surface', () => {
		expect(scopeParams('single-entity', 'proj-1')).toEqual({ id: 'proj-1' })
	})

	it('scopes to the host client on a detail page', () => {
		expect(scopeParams('detail-page', 'client-7')).toEqual({
			client: 'client-7',
		})
	})

	it('falls back to active projects when there is no host object', () => {
		expect(scopeParams('app-dashboard', '')).toEqual({ status: 'active' })
	})

	it('uses a BARE field name, never the bracketed form OpenRegister ignores', () => {
		const params = scopeParams('detail-page', 'client-7')
		expect(Object.keys(params)).toEqual(['client'])
		expect(params['_filters[client]']).toBeUndefined()
		expect(params['filter[client]']).toBeUndefined()
	})
})

describe('idOf', () => {
	it('reads a top-level id', () => {
		expect(idOf({ id: 'a' })).toBe('a')
	})

	it('falls back to the @self envelope', () => {
		expect(idOf({ '@self': { id: 'b' } })).toBe('b')
	})

	it('is empty rather than throwing on nothing', () => {
		expect(idOf(null)).toBe('')
		expect(idOf({})).toBe('')
	})
})

describe('budgetOf', () => {
	it('sums the agreed budgets', () => {
		expect(budgetOf([{ budgetAmount: 100 }, { budgetAmount: 50.5 }])).toBe(150.5)
	})

	it('treats a missing or unparseable budget as nothing, not NaN', () => {
		expect(budgetOf([{ budgetAmount: 'nonsense' }, {}, { budgetAmount: 10 }]))
			.toBe(10)
	})

	it('survives a non-array', () => {
		expect(budgetOf(undefined)).toBe(0)
	})
})

describe('guardRows — the defence against a filter that did not run', () => {
	// Exactly what the API returns when it ignores the client filter: every
	// client's projects, in a response shaped like a successful filtered read.
	const unfiltered = [
		{ id: 'p1', client: 'client-7', status: 'active', title: 'Ours' },
		{ id: 'p2', client: 'client-9', status: 'active', title: 'Someone else' },
		{ id: 'p3', client: 'client-9', status: 'archived', title: 'Also theirs' },
	]

	it('keeps only the host client rows when the server returned everything', () => {
		const kept = guardRows(unfiltered, 'detail-page', 'client-7')
		expect(kept.map((r) => r.id)).toEqual(['p1'])
	})

	it('keeps only the named project on the single-entity surface', () => {
		const kept = guardRows(unfiltered, 'single-entity', 'p2')
		expect(kept.map((r) => r.id)).toEqual(['p2'])
	})

	it('never matches every row when the single-entity id is empty', () => {
		// Without the explicit empty check, `idOf({}) === ''` would match and the
		// surface would render an arbitrary project as though it were the one asked for.
		expect(guardRows([{}, {}], 'single-entity', '')).toEqual([])
	})

	it('keeps only active projects on a dashboard', () => {
		const kept = guardRows(unfiltered, 'app-dashboard', '')
		expect(kept.map((r) => r.id)).toEqual(['p1', 'p2'])
	})

	it('survives a non-array and null rows', () => {
		expect(guardRows(undefined, 'detail-page', 'client-7')).toEqual([])
		expect(guardRows([null], 'detail-page', 'client-7')).toEqual([])
	})
})
