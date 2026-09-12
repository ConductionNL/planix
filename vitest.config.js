import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for planninq frontend unit tests.
 *
 * Tests live in tests/vitest/ and cover the pure derived-state helpers
 * (utils/taskHelpers.js) — no DOM/component mount required, so the default
 * node environment is used.
 */
export default defineConfig({
	test: {
		environment: 'node',
		// `.ts` as well as `.js`: the shared-instance guard the e2e suite
		// resolves its target through is TypeScript, and its spec has to run
		// somewhere the unit runner actually looks. It cannot live next to the
		// guard under tests/e2e, because playwright's default testMatch would
		// collect it and throw on the vitest import.
		include: ['tests/vitest/**/*.spec.{js,ts}'],
	},
})
