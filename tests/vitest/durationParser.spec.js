/**
 * Unit tests for the time-tracking duration parser/formatter.
 *
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @spec openspec/specs/time-tracking.md
 */
import { describe, expect, it } from 'vitest'
import {
	formatDuration,
	parseDuration,
} from '../../src/utils/durationParser.js'

describe('parseDuration — accepted formats', () => {
	it('parses "2h 30m" to 150 minutes', () => {
		expect(parseDuration('2h 30m')).toBe(150)
	})
	it('parses "2h30m" (no space) to 150 minutes', () => {
		expect(parseDuration('2h30m')).toBe(150)
	})
	it('parses "150m" to 150 minutes', () => {
		expect(parseDuration('150m')).toBe(150)
	})
	it('parses "1.5h" to 90 minutes', () => {
		expect(parseDuration('1.5h')).toBe(90)
	})
	it('parses bare "90" to 90 minutes', () => {
		expect(parseDuration('90')).toBe(90)
	})
	it('parses "2h" to 120 minutes', () => {
		expect(parseDuration('2h')).toBe(120)
	})
	it('is case-insensitive and trims whitespace', () => {
		expect(parseDuration('  2H 30M  ')).toBe(150)
	})
	it('accepts a numeric argument', () => {
		expect(parseDuration(45)).toBe(45)
	})
})

describe('parseDuration — invalid input returns null', () => {
	it.each([
		'lots',
		'-5',
		'0',
		'',
		'   ',
		'h',
		'm',
		'2x',
		'abc30m',
		null,
		undefined,
	])('returns null for %p', (input) => {
		expect(parseDuration(input)).toBeNull()
	})
})

describe('formatDuration', () => {
	it('formats 90 as "1h 30m"', () => {
		expect(formatDuration(90)).toBe('1h 30m')
	})
	it('formats 120 as "2h"', () => {
		expect(formatDuration(120)).toBe('2h')
	})
	it('formats 45 as "45m"', () => {
		expect(formatDuration(45)).toBe('45m')
	})
	it('formats 0 as "0m"', () => {
		expect(formatDuration(0)).toBe('0m')
	})
	it('round-trips parse→format for "2h 30m"', () => {
		expect(formatDuration(parseDuration('2h 30m'))).toBe('2h 30m')
	})
})
