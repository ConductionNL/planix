<template>
	<div class="planninq-admin">
		<CnVersionInfoCard
			appName="Planninq"
			:appVersion="appVersion"
			:isUpToDate="true"
			:showUpdateButton="true"
			:title="t('planninq', 'Version information')"
			:description="t('planninq', 'Information about the current Planninq installation')">
			<template #footer>
				<div class="cn-support-info">
					<h4>{{ t('planninq', 'Support') }}</h4>
					<p>{{ t('planninq', 'For support, contact us at') }} <a href="mailto:support@conduction.nl">support@conduction.nl</a></p>
				</div>
			</template>
		</CnVersionInfoCard>

		<Settings v-if="storesReady" />
	</div>
</template>

<script>
import { CnVersionInfoCard } from '@conduction/nextcloud-vue'
/**
 * AdminRoot view.
 *
 * Admin settings root mounted by settings.js bootstrap; renders the
 * version info card and the Settings form.
 *
 * @spec openspec/changes/retrofit-2026-05-24-annotate-planix/tasks.md#task-4
 */
import { loadState } from '@nextcloud/initial-state'
import Settings from './Settings.vue'
import { initializeStores } from '../../store/store.js'

export default {
	name: 'AdminRoot',
	components: {
		CnVersionInfoCard,
		Settings,
	},

	data() {
		return {
			storesReady: false,
			appVersion: loadState('planninq', 'version', 'Unknown'),
		}
	},

	/**
	 * @spec exclude Lifecycle bootstrap — awaits initializeStores() then flips storesReady; store wiring is spec'd in app-shell-and-data-store.
	 */
	async created() {
		await initializeStores()
		this.storesReady = true
	},
}
</script>

<style scoped>
.planninq-admin {
	max-width: 900px;
}
</style>
