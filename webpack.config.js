const path = require('path')
const fs = require('fs')
const webpack = require('webpack')
const webpackConfig = require('@nextcloud/webpack-vue-config')
const { VueLoaderPlugin } = require('vue-loader')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const buildMode = process.env.NODE_ENV
const isDev = buildMode === 'development'
webpackConfig.devtool = isDev ? 'cheap-source-map' : 'source-map'

webpackConfig.stats = {
	colors: true,
	modules: false,
}

const appId = 'planninq'
webpackConfig.entry = {
	main: {
		import: path.join(__dirname, 'src', 'main.js'),
		filename: appId + '-main.js',
	},
	adminSettings: {
		import: path.join(__dirname, 'src', 'settings.js'),
		filename: appId + '-settings.js',
	},
	// The CLIENT half of this app's OpenRegister leaves, as its own entry.
	//
	// OpenRegister's LeafScriptListener enqueues `planninq-leaves` on the pages
	// of OTHER apps that consume OpenRegister, so a pipelinq client page can
	// render planninq's projects. It must therefore stay SMALL and carry no
	// router, no store and no app shell: `main` is ~13 MiB and putting that on
	// another app's page would trade a feature for a performance regression.
	//
	// The entry name matters. The listener looks for `js/planninq-leaves.js`
	// and SKIPS the app when it is absent — silently, because enqueuing a
	// script that does not exist is a 404 in the consuming page. Renaming this
	// therefore turns the leaf off everywhere with nothing reported.
	leaves: {
		import: path.join(__dirname, 'src', 'leaves.js'),
		filename: appId + '-leaves.js',
	},
}

// Use local source when available (monorepo dev), otherwise fall back to the
// npm package. `USE_LOCAL_LIB=false` forces the published package even when a
// sibling checkout is present — without it a local build can never reproduce
// what CI and production build (they have no sibling, so they always resolve
// the npm dist).
//
// ⚠️ This alias silently OVERRIDES the exactly-pinned
// `@conduction/nextcloud-vue` dependency. A sibling `../nextcloud-vue` checkout
// sitting on the Vue 2 (`1.x` / `beta.*`) line would therefore build this Vue 3
// app against Vue 2 library sources: the build succeeds and the first symptom
// is a runtime failure that looks like a migration bug. The shared
// `apps-extra/nextcloud-vue` checkout is regularly parked on a `beta.*` branch,
// and `apps-extra/planninq` sits right next to it — so this is the normal case,
// not a hypothetical. Refuse a MAJOR mismatch loudly instead.
const localLib = path.resolve(__dirname, '../nextcloud-vue/src')

/**
 * Decide whether the sibling nc-vue checkout may be aliased in.
 *
 * @return {boolean} True when the local source should replace the npm package.
 */
function resolveUseLocalLib() {
	if (process.env.USE_LOCAL_LIB === 'false' || !fs.existsSync(localLib)) {
		return false
	}
	const wanted = require('./package.json').dependencies['@conduction/nextcloud-vue']
	const wantedMajor = String(wanted).replace(/^[^0-9]*/, '').split('.')[0]
	let localVersion = null
	try {
		localVersion = require(path.resolve(localLib, '..', 'package.json')).version
	} catch (e) {
		localVersion = null
	}
	const localMajor = localVersion ? String(localVersion).split('.')[0] : null
	if (localMajor !== null && localMajor !== wantedMajor) {
		throw new Error(
			`[planninq] Refusing to build against ../nextcloud-vue@${localVersion}: this app `
			+ `depends on @conduction/nextcloud-vue@${wanted} (major ${wantedMajor}). Aliasing a `
			+ `major-${localMajor} checkout in would silently build Vue 2 library sources into a `
			+ 'Vue 3 app. Check out the matching nc-vue branch, or set USE_LOCAL_LIB=false to '
			+ 'build against the pinned npm package.',
		)
	}
	return true
}

const useLocalLib = resolveUseLocalLib()

webpackConfig.resolve = webpackConfig.resolve || {}
webpackConfig.resolve.modules = [path.resolve(__dirname, 'node_modules'), 'node_modules']
webpackConfig.resolve.alias = {
	...(webpackConfig.resolve.alias || {}),
	'@': path.resolve(__dirname, 'src'),
	...(useLocalLib ? { '@conduction/nextcloud-vue': localLib } : {}),
	// Deduplicate shared packages so the aliased library source uses
	// the same instances as the app (prevents dual-Pinia / dual-Vue bugs).
	// `vue` and `pinia` still declare `main`, so a directory alias resolves.
	vue$: path.resolve(__dirname, 'node_modules/vue'),
	pinia$: path.resolve(__dirname, 'node_modules/pinia'),
	// MANDATORY, not an optimisation. `@nextcloud/vue@9` hard-depends on
	// `vue-router ^5.1.0` while this app is on `vue-router@4`, so npm installs
	// BOTH — `node_modules/vue-router` (4.x) and
	// `node_modules/@nextcloud/vue/node_modules/vue-router` (5.x). Without this
	// exact-match alias `main.js` gets the 4.x singleton while every
	// `@nextcloud/vue` component calling `useRoute()` / `useRouter()` resolves
	// the 5.x copy — a DIFFERENT injection key, so those components see no
	// router at all and `<NcAppNavigationItem :to="…">` renders inert with
	// nothing logged.
	'vue-router$': path.resolve(__dirname, 'node_modules/vue-router/dist/vue-router.mjs'),
	// These MUST point at the entry FILE, not the package directory.
	// @nextcloud/vue@9 and @nextcloud/dialogs@7 declare no `main` and no
	// `module` — only an `exports` map, which webpack applies to *package
	// requests* and never to an already-absolutised path. A directory alias
	// therefore resolves to nothing and every `from '@nextcloud/vue'` in the
	// app AND inside @conduction/nextcloud-vue's dist fails with
	// "Can't resolve '@nextcloud/vue'".
	//
	// The `$` exact-match suffix matters just as much: without it the alias
	// would also rewrite subpaths such as `@nextcloud/dialogs/style.css`, which
	// must keep going through the exports map.
	'@nextcloud/vue$': path.resolve(__dirname, 'node_modules/@nextcloud/vue/dist/index.mjs'),
	'@nextcloud/dialogs$': path.resolve(__dirname, 'node_modules/@nextcloud/dialogs/dist/index.mjs'),
	// NOTE: there is deliberately no `@nextcloud/axios$` alias here.
	//
	// This app used to pin one at `node_modules/@nextcloud/axios/dist/index.cjs`
	// to make the library's transitive import resolve to our own copy. That
	// alias was both unnecessary and fragile:
	//
	//  - Unnecessary. `@conduction/nextcloud-vue` declares `@nextcloud/axios`
	//    as a peerDependency and never as a dependency, so npm hoists exactly
	//    ONE copy to this app's `node_modules`. The library's dist emits a bare
	//    `@nextcloud/axios` specifier, which resolves to that same single copy
	//    by ordinary node resolution. Interceptors and the CSRF token are
	//    already shared without any alias.
	//
	//  - Fragile. Naming a build artefact by filename hard-codes the upstream
	//    package's internal layout. `@nextcloud/axios` 2.6.0 dropped its
	//    CommonJS output entirely: `dist/index.cjs` no longer exists and the
	//    `exports` map now declares only the `import` condition. The alias then
	//    pointed at a missing file, and because it is an exact-match (`$`) rule
	//    it took every consumer of the specifier down with it — the build
	//    failed with 72 copies of
	//
	//        Module not found: Can't resolve '@nextcloud/axios' in
	//          node_modules/@conduction/nextcloud-vue/dist/esm/components/…
	//
	//    once per component that imports axios, which reads like a broken
	//    library rather than a stale line in our own webpack config.
	//
	// Let webpack resolve the package through its `exports` map instead. If a
	// future dual-copy problem does appear, alias the PACKAGE, never a file
	// inside it.
}

// Allow `.js` import requests to resolve to `.cjs` files. @nextcloud/vue ships
// .cjs/.mjs; without this, `import './foo.js'` inside its ESM dist fails to
// find `./foo.cjs`.
webpackConfig.resolve.extensionAlias = {
	'.js': ['.cjs', '.js'],
	...(webpackConfig.resolve.extensionAlias || {}),
}

// The base @nextcloud/webpack-vue-config already registers VUE, CSS, SCSS, JS
// and ASSET rules. Re-pushing .vue/.css rules here stacked a second loader
// chain on top of the base one (css-loader!style-loader!css-loader!), so
// style-loader's JS output was fed back into css-loader and every stylesheet
// failed with "SyntaxError: Unknown word import". Keep the base rules; only
// replace plugins below to avoid a duplicate VueLoaderPlugin.
webpackConfig.plugins = [
	new VueLoaderPlugin(),
	new webpack.DefinePlugin({ appName: JSON.stringify(appId) }),
	new webpack.DefinePlugin({ appVersion: JSON.stringify(process.env.npm_package_version) }),
	new NodePolyfillPlugin({ additionalAliases: ['process'] }),
]

// @nextcloud/dialogs drags in a FilePicker chunk that imports node's `path`,
// and webpack 5 no longer auto-polyfills node core modules. The Vue 2 build
// stubbed this out with `path: false` because the app only uses the toast APIs;
// under @nextcloud/vue@9 the FilePicker is reachable from components the
// library pulls in, so supply the real shim rather than an empty module.
webpackConfig.resolve.fallback = {
	...(webpackConfig.resolve.fallback || {}),
	path: require.resolve('path-browserify'),
}

// `@nextcloud/webpack-vue-config` hardcodes `output.publicPath` to
// `/apps/<appName>/js/`. That is only correct when the app is installed under
// the apps path whose URL is `/apps`. The standard Docker image registers a
// SECOND apps path — `/var/www/html/custom_apps` served at `/custom_apps` —
// which is where a `docker cp`-deployed app lands, and the previous hardcoded
// `/custom_apps/planninq/js/` is in turn wrong for a `/apps`-served install.
//
// The entry bundle is unaffected (Nextcloud generates that script tag itself),
// so the failure only shows on LAZY-LOADED chunks: the wrong path does NOT
// 404 — Nextcloud answers 200 with `text/html`, the browser refuses it on MIME
// grounds, and the page dies with a `ChunkLoadError`. Vue 2 barely surfaced
// this because it emitted few async chunks; the Vue 3 dependency set splits
// @nextcloud/dialogs, @mdi/js and the Cn components into dozens.
//
// `'auto'` makes webpack derive the public path at runtime from the URL the
// entry script was actually loaded from, so it is correct under every apps path.
webpackConfig.output = {
	...webpackConfig.output,
	publicPath: 'auto',
}

module.exports = webpackConfig
