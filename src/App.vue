<!-- SPDX-License-Identifier: EUPL-1.2 -->
<!--
 Planninq app shell. Mounts CnAppRoot with the bundled manifest and the v2
 kind-tagged registry (ADR-036); CnAppRoot handles the OpenRegister dependency
 check, renders CnAppNav from manifest.menu, and routes <router-view> pages
 through CnPageRenderer.

 What this replaced: a hand-written NcContent + MainMenu.vue + an
 own-rolled OpenRegister gate + a router whose routes were declared in
 src/router/index.js. All four are manifest concerns now — the gate is
 `manifest.dependencies`, the nav is `manifest.menu`, and the routes are built
 from `manifest.pages` in main.js.

 The sidebar outlet stays: planninq's views call the injected setSidebar() to
 render a per-view sidebar, which is app-local behaviour the shell does not own.

 @adr ADR-024 (app manifest)
 @adr ADR-036 (v2 registry)
-->
<template>
	<CnAppRoot
		appId="planninq"
		:manifest="manifest"
		:registry="registry"
		:pageTypes="pageTypes"
		:translate="translateForApp"
		:permissions="permissions">
		<template #dependency-missing>
			<NcAppContent class="open-register-missing">
				<NcEmptyContent
					:name="t('planninq', 'OpenRegister is required')"
					:description="t('planninq', 'This app needs OpenRegister to store and manage data. Please install OpenRegister from the app store to get started.')">
					<template #icon>
						<img :src="appIcon"
							alt=""
							width="64"
							height="64">
					</template>
					<template #action>
						<NcButton
							v-if="isAdmin"
							variant="primary"
							:href="appStoreUrl">
							{{ t('planninq', 'Install OpenRegister') }}
						</NcButton>
					</template>
				</NcEmptyContent>
			</NcAppContent>
		</template>

		<!-- Planninq's own settings pane, rendered inside CnAppRoot's
		     NcAppSettingsDialog. UserSettings.vue is a bare
		     NcAppSettingsSection now; the shell supplies the dialog and the
		     navigation entry that opens it. -->
		<template #user-settings>
			<UserSettings />
		</template>

		<!-- Sidebar outlet: views inject their sidebar component here. -->
		<template #sidebar>
			<component
				:is="activeSidebar"
				v-if="activeSidebar"
				v-bind="activeSidebar.propsData || {}"
				v-on="activeSidebar.on || {}"
				@close="activeSidebar = null" />
		</template>
	</CnAppRoot>
</template>

<script>
/**
 * App root component.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-5
 */
import { CnAppRoot } from '@conduction/nextcloud-vue'
import { translate as ncT } from '@nextcloud/l10n'
import { generateUrl, imagePath } from '@nextcloud/router'
import { NcAppContent, NcButton, NcEmptyContent } from '@nextcloud/vue'
import { markRaw } from 'vue'
import UserSettings from './views/settings/UserSettings.vue'
import { useSettingsStore } from './store/modules/settings.js'
import { initializeStores } from './store/store.js'

export default {
	name: 'App',

	components: {
		CnAppRoot,
		NcAppContent,
		NcButton,
		NcEmptyContent,
		UserSettings,
	},

	/**
	 * @spec exclude Framework glue — provides setSidebar/closeSidebar inject callbacks; no observable behavior.
	 */
	provide() {
		return {
			// Views can call this.setSidebar(componentDefinition) to render a sidebar.
			//
			// `markRaw` is required under Vue 3: assigning a component
			// definition into reactive `data` makes Vue deep-proxy the whole
			// options object, which it warns about ("Vue received a Component
			// that was made a reactive object") and which needlessly proxies
			// every option on every render.
			setSidebar: (component) => {
				this.activeSidebar = component ? markRaw(component) : null
			},

			closeSidebar: () => {
				this.activeSidebar = null
			},
		}
	},

	props: {
		/**
		 * Bundled app manifest — passed from main.js. CnAppRoot reads
		 * `manifest.dependencies` for the dependency-check phase and
		 * `manifest.menu` for CnAppNav.
		 *
		 * @type {object}
		 */
		manifest: {
			type: Object,
			required: true,
		},

		/**
		 * V2 kind-tagged registry (ADR-036) — map of registry key →
		 * `{ kind: "page", component }`. CnPageRenderer resolves every
		 * manifest-referenced component name against the `kind: "page"`
		 * entries here.
		 *
		 * @type {object}
		 */
		registry: {
			type: Object,
			default: () => ({}),
		},

		/**
		 * Page-type registry — `{ index, detail, dashboard, custom, ... }`.
		 * Wired through to descendant CnPageRenderer instances.
		 *
		 * @type {?object}
		 */
		pageTypes: {
			type: Object,
			default: null,
		},
	},

	data() {
		return {
			/** @type {object|null} Active sidebar component definition */
			activeSidebar: null,
		}
	},

	computed: {
		/**
		 * The current user's Nextcloud permission flags, passed to CnAppNav.
		 *
		 * @return {Array} Permission identifiers (empty when unavailable).
		 */
		permissions() {
			return window.OC?.currentUser?.permissions ?? []
		},

		/**
		 * @spec exclude Store passthrough — proxies settingsStore.getIsAdmin.
		 */
		isAdmin() {
			try {
				return useSettingsStore().getIsAdmin === true
			} catch {
				return typeof window.OC?.isUserAdmin === 'function'
					? window.OC.isUserAdmin()
					: false
			}
		},

		/**
		 * @spec exclude Trivial asset-path getter — resolves the app-dark.svg image path.
		 */
		appIcon() {
			return imagePath('planninq', 'app-dark.svg')
		},

		/**
		 * @spec exclude Trivial URL getter — builds the OpenRegister app-store link.
		 */
		appStoreUrl() {
			return generateUrl('/settings/apps/integration/openregister')
		},
	},

	/**
	 * @spec exclude Lifecycle bootstrap — awaits initializeStores() so the legacy views' Pinia stores are up; CnAppRoot does not depend on them.
	 */
	async created() {
		try {
			await initializeStores()
		} catch (e) {
			console.error('planninq: initializeStores() failed', e)
		}
	},

	methods: {
		/**
		 * Translate function handed to CnAppRoot / CnAppNav / CnPageRenderer.
		 * Closes over Nextcloud's translate so the lib never needs the app id.
		 *
		 * @param {string} key Translation key.
		 * @return {string} Translated string (or the key on miss).
		 */
		translateForApp(key) {
			return ncT('planninq', key)
		},
	},
}
</script>

<style scoped>
.open-register-missing {
	display: flex;
	align-items: center;
	justify-content: center;
}
</style>
