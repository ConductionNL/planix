/**
 * Duration parsing/formatting helpers for the time-tracking MVP.
 *
 * The estimate input accepts the natural formats named in
 * openspec/specs/time-tracking.md ("2h 30m", "150m", "1.5h", "90", "2h") and
 * stores an integer number of minutes. `formatDuration` is the inverse used to
 * render a stored minute count back to a human-readable string on the task
 * card, task detail and timesheet.
 *
 * SPDX-FileCopyrightText: 2026 Planninq Contributors
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @spec openspec/specs/time-tracking.md
 */

/**
 * Parse a human-entered duration to an integer number of minutes.
 *
 * Accepted forms (case-insensitive, surrounding whitespace ignored):
 *   - "2h 30m" / "2h30m"  → hours + minutes
 *   - "2h" / "1.5h"       → hours (fractional allowed)
 *   - "150m" / "30 m"     → minutes
 *   - "90"                → a bare number is interpreted as minutes
 *
 * Unparseable, zero or negative input returns `null` (the caller shows an
 * inline validation error and does not persist).
 *
 * @param {string|number} raw The raw user input.
 * @return {number|null} Whole minutes (> 0), or null when invalid.
 *
 * @spec openspec/specs/time-tracking.md
 */
export function parseDuration(raw) {
	if (raw === null || raw === undefined) {
		return null
	}
	const s = String(raw).trim().toLowerCase()
	if (s === '') {
		return null
	}

	let minutes

	// Combined "<h>h <m>m" (minutes part optional spacing).
	const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+(?:\.\d+)?)\s*m$/)
	if (hm) {
		minutes = parseFloat(hm[1]) * 60 + parseFloat(hm[2])
	} else if (/^(\d+(?:\.\d+)?)\s*h$/.test(s)) {
		// Hours only (fractional allowed, e.g. "1.5h").
		minutes = parseFloat(s) * 60
	} else if (/^(\d+(?:\.\d+)?)\s*m$/.test(s)) {
		// Minutes only.
		minutes = parseFloat(s)
	} else if (/^\d+(?:\.\d+)?$/.test(s)) {
		// Bare number → minutes.
		minutes = parseFloat(s)
	} else {
		return null
	}

	if (!Number.isFinite(minutes)) {
		return null
	}
	minutes = Math.round(minutes)
	if (minutes <= 0) {
		return null
	}
	return minutes
}

/**
 * Format an integer number of minutes as a human-readable duration.
 *
 *   90  → "1h 30m"
 *   120 → "2h"
 *   45  → "45m"
 *   0   → "0m"
 *
 * @param {number} minutes Whole minutes (non-negative).
 * @return {string} Human-readable duration.
 *
 * @spec openspec/specs/time-tracking.md
 */
export function formatDuration(minutes) {
	const total = Math.max(0, Math.round(Number(minutes) || 0))
	const h = Math.floor(total / 60)
	const m = total % 60
	if (h > 0 && m > 0) {
		return `${h}h ${m}m`
	}
	if (h > 0) {
		return `${h}h`
	}
	return `${m}m`
}
