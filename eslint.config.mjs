// Flat config for eslint 10.
//
// WHY THIS REPLACED eslint.config.js
// ----------------------------------
// planninq was the last app in the fleet still on eslint 8. `@nextcloud/eslint-config@9`
// declares `peer eslint: ">=10"`, so the dependabot bump to 9.0.1 could not install at
// all: twelve checks went red at `npm ci`, before a single file was linted. Bumping the
// config alone was never going to work, because the eslint 8 constraint was held in three
// more places at once:
//
//   @typescript-eslint/parser@7  peers eslint ^8.56.0
//   eslint-plugin-import@2.32.0  peers eslint up to ^9
//   @eslint/eslintrc             exists only to bridge the eslintrc era
//
// So the stack moved together, to the versions hermiq, versioniq and keepiq already run
// green: eslint ^10.9.1, @nextcloud/eslint-config ^9.0.1, @typescript-eslint/parser
// ^8.68.0.
//
// `eslint-plugin-vue` is deliberately NOT a dependency any more. v9 bundles its own
// `eslint-plugin-vue@10`, and a stale `^9` left in devDependencies hoists over the
// bundled copy, which makes `**/*.vue` parse as TypeScript and fails every SFC.
// `vue-eslint-parser` stays, at `^10`, because it is a peer the app must supply.
//
// `conductionVue3Fixes` is gone too. That preset existed to patch a Vue-2 ruleset, and
// against v9's `recommended` every one of its jobs is already done: all 21
// `vue/no-deprecated-*` rules are enabled, and the two it had to switch off because they
// are inverted under Vue 3 are not enabled at all. Spreading it here is not merely
// redundant, it BREAKS the run: it names `vue/*` rules while registering no plugin, and
// eslint aborts with "could not find plugin vue" — exit 2, nothing linted.
//
// 🔴 THE FAILURE MODE THIS FILE MUST AVOID. An eslint 10 install pointed at a config it
// cannot read does not report zero problems loudly. It lints NOTHING and exits non-zero
// in a way that reads as a lint failure, which is how versioniq's entire Vue and
// TypeScript layer went unchecked with 266 real problems behind it. So the check after
// any change here is the FILE COUNT, never the error count: `npx eslint src --format
// json` must report the same 46 files it reported under eslint 8, not 0.
import { recommended } from '@nextcloud/eslint-config'

export default [
	...recommended,
	{
		// 🔴 SCOPED, and it must be. Flat config resolves a rule's plugin from the config
		// object the rule sits in, and v9 also lints `.json`, where `jsdoc` is not
		// registered. An unscoped `jsdoc/*` override aborts the whole run with "The jsdoc
		// plugin is not defined in your configuration file" — a config error, not a
		// finding. The ignores are part of that scope rather than an opinion: v9 registers
		// jsdoc only inside `nextcloud/documentation/*`, and those blocks carry exactly
		// this list, because Nextcloud does not require JSDoc in tests.
		files: ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.tsx', '**/*.vue'],
		ignores: [
			'**/*.test.*',
			'**/*.spec.*',
			'**/*.cy.*',
			'**/test/**',
			'**/tests/**',
			'**/__tests__/**',
			'**/__mocks__/**',
		],

		settings: {
			// `@conduction/nextcloud-vue` resolves to the sibling checkout when one is
			// present, which is how a local nextcloud-vue is linted against this app.
			'import/resolver': {
				alias: {
					map: [
						['@', './src'],
						['@floating-ui/dom-actual', './node_modules/@floating-ui/dom'],
						['@conduction/nextcloud-vue', '../nextcloud-vue/src'],
					],
					extensions: ['.js', '.ts', '.vue', '.json', '.css'],
				},
			},
		},

		rules: {
			// `t` and `n` are imported ahead of the translation wiring that will use them.
			'no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^(t|n)$', argsIgnorePattern: '^_' },
			],
			'jsdoc/require-jsdoc': 'off',
			// ADR-008 spec-coverage annotation.
			'jsdoc/check-tag-names': ['warn', { definedTags: ['spec'] }],
			'vue/first-attribute-linebreak': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'n/no-missing-import': 'off',

			// `error` and `warn` are how this app reports failures it cannot show in
			// the UI, and all 21 existing calls are one of those two. Deleting them to
			// satisfy the rule would remove diagnostics, so they are allowed by name
			// rather than the rule being switched off: a stray `console.log` left
			// behind while debugging is still an error, which is what the rule is for.
			'no-console': ['error', { allow: ['error', 'warn'] }],
		},
	},
	{
		// Route views are mounted by the router under their path, never written as a
		// tag in a template, so they cannot collide with a current or future HTML
		// element — which is the entire reason `vue/multi-word-component-names`
		// exists. Renaming `Dashboard` to `PlanninqDashboard` would churn five files
		// and every import of them to satisfy a rule that is not describing a risk
		// here. Scoped to `views/` so ordinary components keep the rule.
		files: ['src/views/**/*.vue'],
		rules: {
			'vue/multi-word-component-names': 'off',
		},
	},
	{
		// Node-side CLI checkers under tests/ legitimately use console and
		// process.exit, and ship as plain JS with no shebang. A GLOB, not a file
		// list: an explicit list silently stopped covering every new checker.
		files: ['tests/**/*.js', 'tests/**/*.mjs', 'tests/**/*.ts'],
		rules: {
			'no-console': 'off',
			'n/no-process-exit': 'off',
			'n/hashbang': 'off',
			// Tests import devDependencies by definition; this rule is about what
			// ships in the published package, which tests/ never does.
			'n/no-unpublished-import': 'off',
		},
	},

	{
		// `_` / `__` as a deliberate throwaway binding — `catch (_)`, a discarded
		// destructuring slot. Narrow on purpose: the pattern matches UNDERSCORES
		// ONLY, so a real name that happens to start with `_` is still reported.
		//
		// 🔴 `.js` / `.mjs` ONLY, NOT `.ts`. The CORE rule is not TypeScript-aware:
		// applied to a `.ts` file it reads the parameter NAMES inside a function
		// TYPE as bindings and reports them unused. Measured on humaniq —
		//
		//   t?: (app: string, key: string) => string
		//
		// produced four `no-unused-vars` errors for `app` and `key`, which are
		// documentation, not variables. The same mis-scoping made every unused
		// `catch (e)` in a `.ts` spec report TWICE, once per rule.
		//
		// v9 already turns the core rule off for `.ts` and drives
		// `@typescript-eslint/no-unused-vars` instead; naming `.ts` here switched
		// it back on. TypeScript files are handled by the block below.
		files: ['tests/**/*.js', 'tests/**/*.mjs'],
		rules: {
			'no-unused-vars': [
				'error',
				{
					// vars/caught: UNDERSCORES ONLY, so a real name that merely
					// starts with `_` is still reported.
					varsIgnorePattern: '^_+$',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_+$',
					// args: leading underscore, which is what NC's own TypeScript
					// block uses (`argsIgnorePattern: '^_'`) — a positional
					// parameter often has to keep a descriptive name to document
					// the signature even when the body ignores it.
					argsIgnorePattern: '^_',
					ignoreRestSiblings: true,
				},
			],
		},
	},

	{
		// The TypeScript half of the block above. Same intent, same patterns, on
		// the rule that actually understands the language: it knows a name inside
		// a function type is not a binding, so type annotations stay quiet while a
		// genuinely dead local is still reported.
		files: ['tests/**/*.ts', 'tests/**/*.tsx'],
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^_+$',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_+$',
					argsIgnorePattern: '^_',
					ignoreRestSiblings: true,
				},
			],
		},
	},
	{
		// 🔴 Node-side CLI tooling under `scripts/`, which is COMMONJS. Flat
		// config defaults every `.js` to ESM with browser-ish globals, so without
		// this block eslint reports the CommonJS wrapper itself as undefined
		// identifiers. Measured on this app: 52 of the 233 errors under
		// `tests/` + `scripts/` were `no-undef`, ALL of them in `scripts/`, and
		// all five names were the environment rather than a typo — `process` 23,
		// `require` 20, `__dirname` 6, `__filename` 2, `module` 1.
		//
		// This is describing the environment, not relaxing a rule, and it is the
		// same argument the test-globals block below makes: declaring them keeps
		// `no-undef` able to do its real job, which is catching a genuinely
		// misspelled identifier. Suppressing the rule instead would bury that.
		//
		// `no-console` is off because printing its report is what a CLI checker
		// is FOR.
		//
		// 🔴 NO `n/*` ENTRIES HERE, DELIBERATELY. `eslint-plugin-n` is NOT
		// registered for these files under eslint 10 + @nextcloud/eslint-config
		// 9, so `'n/no-process-exit': 'off'` would be dead config that reads as
		// if it were doing something. Measured both ways on this app: 0 `n/`
		// findings with the entries and 0 without.
		//
		// What DID report was the opposite — four `scripts/*.js` carried
		// `/* eslint-disable n/no-process-exit */` and `/* eslint-disable
		// n/shebang */` left over from the eslintrc era, and an inline disable
		// naming an unregistered plugin is itself an error ("Definition for rule
		// 'n/shebang' was not found"). Those 8 comments are removed; do not add
		// `n/*` rules back to replace them.
		//
		// ⚠️ `.js` and `.cjs` ONLY. A `scripts/*.mjs` is genuinely ESM and must
		// keep the default `sourceType`, or `import` stops parsing there.
		files: ['scripts/**/*.js', 'scripts/**/*.cjs'],
		languageOptions: {
			sourceType: 'commonjs',
			globals: {
				require: 'readonly',
				module: 'writable',
				exports: 'writable',
				process: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				console: 'readonly',
				Buffer: 'readonly',
				global: 'readonly',
				URL: 'readonly',
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
			},
		},
		rules: {
			'no-console': 'off',
		},
	},

	{
		// The ESM half of the block above. A `scripts/*.mjs` is genuinely a module
		// and must keep the default `sourceType`, so it gets Node's globals but
		// none of the CommonJS wrapper. Measured: `process` reported undefined 2x
		// in hermiq's generate-opengemeenten-icons.mjs and 4x in openregister's
		// l10n/runtime-check.mjs, which the `.js`/`.cjs` block deliberately does
		// not match.
		files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
		languageOptions: {
			globals: {
				process: 'readonly',
				console: 'readonly',
				Buffer: 'readonly',
				global: 'readonly',
				URL: 'readonly',
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
			},
		},
		rules: {
			'no-console': 'off',
		},
	},

	{
		// eslint must not try to PARSE a shell script. `tests/e2e/seed.test.sh`
		// matches the `**/*.test.*` glob some presets use, and eslint then reads
		// it as JavaScript and reports "Parsing error: Unexpected character" —
		// a finding about a file it should never have opened.
		ignores: ['**/*.sh', '**/*.bash'],
	},


]
