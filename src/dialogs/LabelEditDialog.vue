<template>
	<NcDialog
		:name="isEdit ? t('planninq', 'Edit label') : t('planninq', 'Create label')"
		@closing="$emit('close')">
		<template #default>
			<div class="label-edit-dialog__body">
				<div class="label-edit-dialog__field">
					<NcTextField
						v-model="title"
						:label="t('planninq', 'Title')"
						:error="!!titleError"
						:helperText="titleError"
						required />
				</div>

				<div class="label-edit-dialog__field">
					<label class="label-edit-dialog__label" for="label-color">{{ t('planninq', 'Color') }}</label>
					<div class="label-edit-dialog__color-row">
						<input
							id="label-color-swatch"
							type="color"
							class="label-edit-dialog__swatch"
							:aria-label="t('planninq', 'Pick a color')"
							:value="normalisedColor"
							@input="onSwatchInput">
						<NcTextField
							id="label-color"
							v-model="color"
							:label="t('planninq', 'Hex color')"
							:error="!!colorError"
							:helperText="colorError || t('planninq', 'Six-digit hex code, e.g. #4376FC')" />
					</div>
				</div>

				<div class="label-edit-dialog__field">
					<NcTextField
						v-model="description"
						:label="t('planninq', 'Description (optional)')" />
				</div>

				<div v-if="submitError" class="label-edit-dialog__error" role="alert">
					{{ submitError }}
				</div>
			</div>
		</template>

		<template #actions>
			<NcButton :disabled="saving" @click="$emit('close')">
				{{ t('planninq', 'Cancel') }}
			</NcButton>
			<NcButton
				variant="primary"
				:disabled="saving || !isValid"
				@click="save">
				<template v-if="saving" #icon>
					<NcLoadingIcon :size="16" />
				</template>
				{{ isEdit ? t('planninq', 'Save') : t('planninq', 'Create') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script>
import { showError } from '@nextcloud/dialogs'
/**
 * LabelEditDialog.
 *
 * Create or edit an app-wide label. Title is required; the colour must match the
 * schema's 6-digit hex pattern (validated client-side here and authoritatively by
 * the OpenRegister `label` schema). Create/edit go directly to the OR object API
 * via the labels store (ADR-022 — no Planninq wrapper).
 *
 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
 */
import { NcButton, NcDialog, NcLoadingIcon, NcTextField } from '@nextcloud/vue'
import { useLabelsStore } from '../store/labels.js'
import {
	DEFAULT_LABEL_COLOR as DEFAULT_COLOR,
	isValidHexColor,
	isValidLabelTitle,
	normaliseLabelPayload,
} from '../utils/labelHelpers.js'

export default {
	name: 'LabelEditDialog',

	components: { NcButton, NcDialog, NcLoadingIcon, NcTextField },

	props: {
		/** The label being edited, or null when creating. */
		label: {
			type: Object,
			default: null,
		},
	},

	emits: ['close', 'saved'],

	data() {
		return {
			title: this.label?.title || '',
			color: this.label?.color || DEFAULT_COLOR,
			description: this.label?.description || '',
			saving: false,
			submitError: '',
		}
	},

	computed: {
		/**
		 * @spec exclude Presentational flag — true when editing an existing label.
		 */
		isEdit() {
			return !!this.label?.id
		},

		/**
		 * Inline validation error for the title field (required, non-empty).
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		titleError() {
			if (!isValidLabelTitle(this.title)) {
				return this.t('planninq', 'Title is required')
			}
			return ''
		},

		/**
		 * Inline validation error for the colour field (6-digit hex pattern).
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		colorError() {
			if (!isValidHexColor(this.color)) {
				return this.t('planninq', 'Color must be a 6-digit hex code (e.g. #4376FC)')
			}
			return ''
		},

		/**
		 * A safe value for the native colour swatch (always a valid hex).
		 *
		 * @spec exclude Presentational fallback for the native swatch input.
		 */
		normalisedColor() {
			return isValidHexColor(this.color) ? this.color : DEFAULT_COLOR
		},

		/**
		 * Whether the form passes client-side validation.
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		isValid() {
			return this.titleError === '' && this.colorError === ''
		},
	},

	methods: {
		/**
		 * Sync the native colour swatch value into the hex text field (uppercased).
		 *
		 * @param {Event} event The input event from the native colour picker.
		 *
		 * @spec exclude UI glue — copies the swatch value into the hex field.
		 */
		onSwatchInput(event) {
			this.color = (event.target.value || DEFAULT_COLOR).toUpperCase()
		},

		/**
		 * Validate and persist the label via the labels store (create or update).
		 *
		 * @spec openspec/changes/label-management-admin/specs/admin-user-settings/spec.md
		 */
		async save() {
			if (!this.isValid) {
				return
			}
			this.saving = true
			this.submitError = ''
			const store = useLabelsStore()
			const payload = normaliseLabelPayload({
				title: this.title,
				color: this.color,
				description: this.description,
			})
			try {
				if (this.isEdit) {
					await store.updateLabel(this.label.id, payload)
				} else {
					await store.createLabel(payload)
				}
				this.$emit('saved')
			} catch {
				this.submitError = store.error || this.t('planninq', 'Failed to save label')
				showError(this.submitError)
			} finally {
				this.saving = false
			}
		},
	},
}
</script>

<style scoped>
.label-edit-dialog__body {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 8px 0;
}

.label-edit-dialog__label {
	display: block;
	margin-bottom: 4px;
	font-weight: 600;
}

.label-edit-dialog__color-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.label-edit-dialog__swatch {
	width: 44px;
	height: 44px;
	padding: 0;
	border: none;
	background: none;
	cursor: pointer;
}

.label-edit-dialog__error {
	color: var(--color-error);
}
</style>
