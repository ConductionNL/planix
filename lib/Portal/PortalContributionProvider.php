<?php

/**
 * Planninq Portal Contribution Provider
 *
 * Planninq's contribution to the shared Portaliq external portal (hydra ADR-046 +
 * contribution contract v2.1). Portaliq — the ONE shared portal for people
 * WITHOUT Nextcloud accounts — discovers this class by convention FQCN
 * (`OCA\{Namespace}\Portal\PortalContributionProvider`) and duck-types it via
 * method_exists(), never instanceof. This class is therefore deliberately
 * PLAIN: no portaliq imports, no `implements` clause, no info.xml dependency,
 * no constructor dependencies. Without portaliq installed it is inert and
 * Planninq behaves exactly as before.
 *
 * It declares — for the single `external-employee` (contractor) audience — the
 * OpenRegister collections a portal subject may read and the whitelisted
 * create-action they may perform. Scoping uses the UUID domain-ref properties
 * added by the portal-identity change (`task.contractorRef`,
 * `timeEntry.contractorRef`, `project.contractorRefs`) — NEVER the Nextcloud
 * user ids Planninq uses internally (`task.assignedTo`, `timeEntry.user`,
 * `project.members`), because external contractors have no Nextcloud account by
 * premise (ADR-046 amendment A4). Rows whose contractorRef is unset are
 * invisible to the portal (fail-closed); see
 * openspec/changes/portal-contribution/design.md.
 *
 * @category Portal
 * @package  OCA\Planninq\Portal
 *
 * @author    Conduction Development Team <info@conduction.nl>
 * @copyright 2026 Conduction B.V.
 * @license   EUPL-1.2 https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * SPDX-FileCopyrightText: 2026 Conduction B.V. <info@conduction.nl>
 * SPDX-License-Identifier: EUPL-1.2
 *
 * @version GIT: <git-id>
 *
 * @link https://conduction.nl
 *
 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
 */

declare(strict_types=1);

namespace OCA\Planninq\Portal;

/**
 * Declares what an external portal subject may see and do in Planninq.
 *
 * The contribution is a declarative manifest (pure data — no I/O, no
 * callbacks). All subject identity (subjectRef, audience, organisation, trust)
 * is derived server-side by portaliq's auth edge and MUST never be trusted
 * from the client (ADR-005). Scoping uses UUID domain refs (the contractor
 * contact object UUID carried by `contractorRef`/`contractorRefs`) — never
 * Nextcloud user ids, because externals have no Nextcloud account by premise.
 *
 * Every read surface is field-projected: portaliq whitelist-projects rows after
 * per-row verification (identifiers always survive; a malformed `fields`
 * declaration degrades to identifiers-only). The `fields` lists here drop every
 * internal/estimate/private property — Nextcloud staff identity
 * (`assignedTo`/`user`/`owner`/`members`/`defaultAssignee`), effort estimates
 * and management metrics (`estimatedDuration`/`percentComplete`), kanban board
 * structure (`column`/`columnOrder`), government case linkage
 * (`zaakUuid`/`caseReference`) and integration ids (`calendarEventUid`). The
 * single create-action (log time) whitelists only the contractor-submittable
 * fields; `user` and `contractorRef` are server-authoritative. Rationale +
 * whitelist tables: openspec/changes/portal-contribution/design.md.
 *
 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
 */
class PortalContributionProvider {
	/**
	 * The OpenRegister register slug every collection below lives in.
	 *
	 * Moved from `planix` to `planninq` together with the MigrateRegisterSlug
	 * repair step, which renames the register ROW. This literal only resolves
	 * because that step runs first: OpenRegister looks a register up by slug and
	 * by nothing else, so a renamed slug here without the row rename would find
	 * no register at all.
	 *
	 * @var string
	 */
	private const REGISTER = 'planninq';

	/**
	 * The audiences this provider contributes to (contract v2, preferred).
	 *
	 * The registry probes for this method first. Planninq serves external
	 * contractors (`external-employee`) only — the client project-view is
	 * deliberately out of scope (no client reference exists in the Planninq
	 * data model).
	 *
	 * @return array<int, string> The audience identifiers.
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function getAudiences(): array {
		return ['external-employee'];
	}//end getAudiences()

	/**
	 * The primary audience this provider contributes to (contract v1 fallback).
	 *
	 * Kept alongside getAudiences() so the provider also works against a v1
	 * registry that predates multi-audience support.
	 *
	 * @return string The primary audience identifier.
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function getAudience(): string {
		return 'external-employee';
	}//end getAudience()

	/**
	 * Build the declarative portal manifest for one resolved subject.
	 *
	 * The subject array is server-derived by portaliq (subjectRef UUID,
	 * audience, organisation, trust level low|substantial|high). Returns null
	 * for any audience Planninq does not serve (fail-closed; the registry already
	 * filters by audience, but a provider must not rely on that). No `minTrust`
	 * threshold is declared, so every collection defaults to low trust — a
	 * contractor bearing a resolved `contractorRef` claim is sufficient.
	 *
	 * @param array<string, mixed> $subject The resolved portal subject.
	 *
	 * @return array<string, mixed>|null The manifest, or null when not contributing.
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function getContribution(array $subject): ?array {
		$audience = ($subject['audience'] ?? '');

		if ($audience === 'external-employee') {
			return $this->externalEmployeeContribution();
		}

		return null;
	}//end getContribution()

	/**
	 * Manifest for the `external-employee` audience (external contractor).
	 *
	 * Read surfaces are contractor-scoped: the subject's `contractorRef` claim
	 * (the contractor contact object UUID) matches `task.contractorRef`,
	 * `timeEntry.contractorRef` and — for the project list — is contained in
	 * `project.contractorRefs`. All three collections ship field-projected so
	 * the internal Nextcloud-uid assignment fields, effort estimates, kanban
	 * board structure, government case linkage and integration ids never reach
	 * the contractor. The single create-action lets a contractor log time
	 * against a task with a strict field whitelist; the logging `user` and the
	 * `contractorRef` scope key are set server-side, and any future
	 * approval/billing fields stay back-office-only.
	 *
	 * @return array<string, mixed> The external-employee manifest.
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	private function externalEmployeeContribution(): array {
		return [
			'label' => 'Planninq',
			'collections' => [
				[
					'id' => 'contractorTasks',
					'register' => self::REGISTER,
					'schema' => 'task',
					'scopeField' => 'contractorRef',
					'scopeClaim' => 'contractorRef',
					'label' => 'My tasks',
					'listable' => true,
					'fields' => [
						'title',
						'description',
						'status',
						'priority',
						'project',
						'dueDate',
						'startDate',
						'completedAt',
						'labels',
					],
				],
				[
					'id' => 'contractorTimeEntries',
					'register' => self::REGISTER,
					'schema' => 'plannedTimeEntry',
					'scopeField' => 'contractorRef',
					'scopeClaim' => 'contractorRef',
					'label' => 'My time entries',
					'listable' => true,
					'fields' => [
						'task',
						'date',
						'duration',
						'description',
					],
				],
				[
					'id' => 'contractorProjects',
					'register' => self::REGISTER,
					'schema' => 'project',
					'scopeField' => 'contractorRefs',
					'scopeClaim' => 'contractorRef',
					'label' => 'My projects',
					'listable' => true,
					'fields' => [
						'title',
						'description',
						'status',
						'color',
						'icon',
						'labels',
					],
				],
			],
			'actions' => [
				[
					'id' => 'logTime',
					'type' => 'create',
					'label' => 'Log time',
					'register' => self::REGISTER,
					'schema' => 'plannedTimeEntry',
					'fields' => [
						'task',
						'date',
						'duration',
						'description',
					],
				],
			],
			'notifications' => [],
		];

	}//end externalEmployeeContribution()
}//end class
