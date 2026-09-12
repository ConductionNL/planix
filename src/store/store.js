import { generateUrl } from '@nextcloud/router'
import { useObjectStore } from './modules/object.js'
import { useSettingsStore } from './modules/settings.js'
import { useObjectStore as useConductionObjectStore } from './objectStore.js'

/**
 * Boot routine that configures both OpenRegister object stores against the
 * OpenRegister endpoints and primes settings before the UI renders.
 *
 * @return {Promise<{settingsStore: object, objectStore: object}>}
 *
 * @spec openspec/changes/retrofit-2026-05-25-app-shell-and-data-store/tasks.md#task-3
 */
export async function initializeStores() {
	const settingsStore = useSettingsStore()
	const objectStore = useObjectStore()

	objectStore.configure({
		baseUrl: generateUrl('/apps/openregister/api/objects'),
		schemaBaseUrl: generateUrl('/apps/openregister/api/schemas'),
	})

	// Configure the @conduction/nextcloud-vue objectStore used by the projects store.
	const conductionObjectStore = useConductionObjectStore()
	conductionObjectStore.configure({
		baseUrl: generateUrl('/apps/openregister/api/objects'),
	})

	await settingsStore.fetchSettings()

	return { settingsStore, objectStore }
}

export { useSettingsStore }
