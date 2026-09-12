/**
 * Vitest unit tests for the task detail collaboration sidebar config helper.
 *
 * Covers the CnObjectSidebar wiring asserted by the task-collaboration spec:
 * the correct Planninq register + `task` schema + task UUID are passed, the
 * generic `tags` / `tasks` tabs are hidden, and the legacy hardcoded-tabs mode
 * (use-registry=false) is selected so the built-in Comments / Files / Audit
 * Trail tabs render.
 *
 * @spec openspec/specs/task-collaboration.md
 */
import { describe, expect, it } from 'vitest'
import {
	PLANNINQ_REGISTER,
	TASK_SIDEBAR_HIDDEN_TABS,
	taskCollaborationSidebarConfig,
} from '../../src/utils/taskHelpers.js'

describe('taskCollaborationSidebarConfig', () => {
	// The register slug moved from `planix` to `planninq` together with the
	// MigrateRegisterSlug repair step that renames the register ROW. These
	// literals pin the NEW slug on purpose: asserting via PLANNINQ_REGISTER
	// alone would pass whatever the constant happens to say, so the raw string
	// is what actually catches a half-done rename.
	it('passes the Planninq register, task schema and the task UUID', () => {
		const config = taskCollaborationSidebarConfig({ id: 'task-uuid-123' })
		expect(config.register).toBe(PLANNINQ_REGISTER)
		expect(config.register).toBe('planninq')
		expect(config.schema).toBe('task')
		expect(config.objectId).toBe('task-uuid-123')
		expect(config.objectType).toBe('planninq-task')
	})

	it('hides the generic tags and tasks tabs', () => {
		const config = taskCollaborationSidebarConfig({ id: 'x' })
		expect(config.hiddenTabs).toEqual(['tags', 'tasks'])
		expect(config.hiddenTabs).toBe(TASK_SIDEBAR_HIDDEN_TABS)
		// Comments (notes), files and auditTrail tabs are NOT hidden.
		expect(config.hiddenTabs).not.toContain('notes')
		expect(config.hiddenTabs).not.toContain('files')
		expect(config.hiddenTabs).not.toContain('auditTrail')
	})

	it('selects the legacy hardcoded-tabs mode', () => {
		expect(taskCollaborationSidebarConfig({ id: 'x' }).useRegistry).toBe(false)
	})

	it('coerces a non-string id to string and tolerates a missing task', () => {
		expect(taskCollaborationSidebarConfig({ id: 42 }).objectId).toBe('42')
		expect(taskCollaborationSidebarConfig(null).objectId).toBe('')
		expect(taskCollaborationSidebarConfig({}).objectId).toBe('')
	})
})
