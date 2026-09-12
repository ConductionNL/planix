/**
 * Vitest unit tests for the timeline layout helpers.
 *
 * Covers the pure Gantt layout maths asserted by the gantt-timeline-view spec:
 * ISO-date → day-index parsing, the scheduled split (dateless tasks dropped
 * from the bar set), bar positioning/width, and the spec-critical dependency
 * arrow sourcing — an arrow is emitted ONLY between two rendered bars, keyed by
 * the stored edge id, and no arrow is fabricated for an edge whose endpoint is
 * unscheduled (the timeline renders existing links, never a new copy).
 *
 * @spec openspec/changes/gantt-timeline-view/specs/gantt-timeline-view/spec.md
 */
import { describe, expect, it } from 'vitest'
import {
	BAR_HEIGHT,
	buildLayout,
	parseDay,
	PX_PER_DAY,
	statusColor,
	toScheduled,
} from '../../src/utils/timelineHelpers.js'

describe('parseDay', () => {
	it('parses an ISO date to a whole-day index', () => {
		expect(parseDay('1970-01-01')).toBe(0)
		expect(parseDay('1970-01-02')).toBe(1)
	})

	it('returns null for empty or unparseable input', () => {
		expect(parseDay('')).toBeNull()
		expect(parseDay(null)).toBeNull()
		expect(parseDay('not-a-date')).toBeNull()
		expect(parseDay(12345)).toBeNull()
	})
})

describe('toScheduled', () => {
	it('resolves start/end day indices and preserves order', () => {
		const rows = toScheduled([
			{ id: 'a', startDate: '2026-01-01', dueDate: '2026-01-03' },
			{ id: 'b', startDate: '2026-01-05', dueDate: '2026-01-05' },
		])
		expect(rows).toHaveLength(2)
		expect(rows[0].id).toBe('a')
		expect(rows[0].endDay - rows[0].startDay).toBe(2)
	})

	it('drops tasks with no parseable date', () => {
		const rows = toScheduled([
			{ id: 'a', startDate: '2026-01-01', dueDate: '2026-01-02' },
			{ id: 'b', startDate: null, dueDate: null },
			{ id: 'c' },
		])
		expect(rows.map((r) => r.id)).toEqual(['a'])
	})

	it('treats a single date as a one-day span and normalises reversed dates', () => {
		const [single] = toScheduled([{ id: 'a', dueDate: '2026-02-10' }])
		expect(single.startDay).toBe(single.endDay)

		const [reversed] = toScheduled([
			{ id: 'b', startDate: '2026-02-10', dueDate: '2026-02-01' },
		])
		expect(reversed.startDay).toBeLessThan(reversed.endDay)
	})

	it('tolerates non-array input', () => {
		expect(toScheduled(undefined)).toEqual([])
		expect(toScheduled(null)).toEqual([])
	})
})

describe('buildLayout', () => {
	const scheduled = toScheduled([
		{
			id: 'a',
			title: 'A',
			status: 'open',
			startDate: '2026-01-01',
			dueDate: '2026-01-02',
		},
		{
			id: 'b',
			title: 'B',
			status: 'done',
			startDate: '2026-01-04',
			dueDate: '2026-01-05',
		},
	])

	it('positions bars relative to the earliest day', () => {
		const layout = buildLayout(scheduled, [], PX_PER_DAY.day)
		expect(layout.bars).toHaveLength(2)
		// First bar starts at x=0; second is 3 days later.
		expect(layout.bars[0].left).toBe(0)
		expect(layout.bars[1].left).toBe(3 * PX_PER_DAY.day)
		// A two-day task spans two day columns.
		expect(layout.bars[0].width).toBe(2 * PX_PER_DAY.day)
		// Chart spans 2026-01-01 .. 2026-01-05 inclusive = 5 days.
		expect(layout.dayCount).toBe(5)
	})

	it('draws a dependency arrow between two rendered bars, keyed by edge id', () => {
		const deps = [{ id: 'edge-1', blocker: 'a', blocked: 'b' }]
		const layout = buildLayout(scheduled, deps, PX_PER_DAY.day)
		expect(layout.edgeLines).toHaveLength(1)
		const line = layout.edgeLines[0]
		expect(line.key).toBe('edge-1')
		// From blocker bar's right edge to blocked bar's left edge.
		expect(line.x1).toBe(layout.bars[0].left + layout.bars[0].width)
		expect(line.x2).toBe(layout.bars[1].left)
		expect(line.y1).toBe(layout.bars[0].top + BAR_HEIGHT / 2)
	})

	it('never fabricates an arrow when an endpoint is not a rendered bar', () => {
		// 'ghost' is unscheduled → not in the bar set, so the edge is not drawn.
		const deps = [
			{ id: 'edge-real', blocker: 'a', blocked: 'b' },
			{ id: 'edge-ghost', blocker: 'a', blocked: 'ghost' },
		]
		const layout = buildLayout(scheduled, deps, PX_PER_DAY.day)
		expect(layout.edgeLines.map((l) => l.key)).toEqual(['edge-real'])
	})

	it('returns a safe empty layout when there are no scheduled tasks', () => {
		const layout = buildLayout(
			[],
			[{ id: 'e', blocker: 'a', blocked: 'b' }],
			PX_PER_DAY.day,
		)
		expect(layout.bars).toEqual([])
		expect(layout.edgeLines).toEqual([])
		expect(layout.dayCount).toBe(1)
	})
})

describe('statusColor', () => {
	it('maps known statuses and falls back to the open colour', () => {
		expect(statusColor('done')).toContain('--color-success')
		expect(statusColor('blocked')).toContain('--color-error')
		expect(statusColor('nonsense')).toBe(statusColor('open'))
	})
})
