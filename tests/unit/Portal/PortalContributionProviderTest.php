<?php

/**
 * Unit tests for the Portaliq portal contribution provider.
 *
 * Pins planninq's ADR-046 contract-v2.1 contribution: the dependency-free
 * duck-typed shape (inert without portaliq), the v2 getAudiences() + v1
 * getAudience() pair for the single `external-employee` audience, the
 * fail-closed null for every other audience, the contractor-scoped read
 * collections (task, timeEntry, project), the conservative log-time
 * create-action whitelist, and the absence of any minTrust threshold
 * (default low).
 *
 * It also pins the scoping map + projection whitelists against
 * planninq_register.json at HEAD so a schema drift fails HERE instead of silently
 * scoping portal reads to nothing: every scopeField must exist on its schema,
 * every projected `fields` entry must be a real property, and the internal
 * Nextcloud-uid identity fields (assignedTo / user / owner / members /
 * defaultAssignee) must NEVER appear in a projected read set (ADR-046 A4).
 *
 * Subjects use nil-pattern UUIDs — self-evidently fake, never colliding with
 * live data. The provider is constructed directly (no mocks, no container): it
 * is a plain dependency-free class by contract (amendment A1).
 *
 * @category Test
 * @package  OCA\Planninq\Tests\Unit\Portal
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

namespace OCA\Planninq\Tests\Unit\Portal;

use OCA\Planninq\Portal\PortalContributionProvider;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * Pin the declarative portal contribution manifest.
 *
 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
 */
final class PortalContributionProviderTest extends TestCase {

	/**
	 * Server-derived subject fixture for the external-employee audience.
	 *
	 * @var array<string, mixed>
	 */
	private const CONTRACTOR_SUBJECT = [
		'subjectRef' => '00000000-0000-0000-0000-000000000001',
		'audience' => 'external-employee',
		'organisation' => '00000000-0000-0000-0000-000000000002',
		'trust' => 'low',
	];

	/**
	 * Nextcloud-uid identity fields that MUST never be portal-projected (A4).
	 *
	 * @var array<int, string>
	 */
	private const NC_UID_FIELDS = [
		'assignedTo',
		'user',
		'owner',
		'members',
		'defaultAssignee',
	];

	/**
	 * The provider under test (direct construction — no container).
	 *
	 * @var PortalContributionProvider
	 */
	private PortalContributionProvider $provider;

	/**
	 * Decoded planninq_register.json, for the drift-pin assertions.
	 *
	 * @var array<string, mixed>
	 */
	private array $register;

	/**
	 * Construct the provider directly, as portaliq's registry would.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->provider = new PortalContributionProvider();

		$path = __DIR__ . '/../../../lib/Settings/planninq_register.json';
		$this->register = json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

	}//end setUp()

	/**
	 * Scenario: Provider is discoverable and inert without portaliq.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testProviderIsPlainAndDependencyFree(): void {
		$reflection = new ReflectionClass(PortalContributionProvider::class);

		$this->assertSame(
			'OCA\\Planninq\\Portal\\PortalContributionProvider',
			$reflection->getName(),
			'Provider must live at the convention FQCN portaliq probes for'
		);
		$this->assertSame([], $reflection->getInterfaceNames(), 'Duck-typed: no implements clause allowed');
		$this->assertFalse($reflection->getParentClass(), 'Provider must not extend anything');
		$this->assertNull($reflection->getConstructor(), 'Provider must have no constructor dependencies');

		$source = (string)file_get_contents((string)$reflection->getFileName());
		$codeOnly = (preg_replace('/\/\*.*?\*\/|\/\/[^\n]*/s', '', $source) ?? '');
		$this->assertStringNotContainsStringIgnoringCase(
			'portaliq',
			$codeOnly,
			'Provider code must reference no portaliq symbol (comments excluded)'
		);

	}//end testProviderIsPlainAndDependencyFree()

	/**
	 * Scenario: v2 and v1 audience methods agree on external-employee.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testAudienceMethodsDeclareExternalEmployee(): void {
		$this->assertSame(['external-employee'], $this->provider->getAudiences());
		$this->assertSame('external-employee', $this->provider->getAudience());
		$this->assertContains(
			$this->provider->getAudience(),
			$this->provider->getAudiences(),
			'v1 primary audience must be one of the v2 audiences'
		);

	}//end testAudienceMethodsDeclareExternalEmployee()

	/**
	 * Scenario: any non-external-employee subject receives null (fail-closed).
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testGetContributionIsFailClosedForOtherAudiences(): void {
		foreach (['client', 'customer', 'supplier', ''] as $audience) {
			$subject = self::CONTRACTOR_SUBJECT;
			$subject['audience'] = $audience;
			$this->assertNull(
				$this->provider->getContribution($subject),
				"audience '{$audience}' must contribute nothing"
			);
		}

		$this->assertNull($this->provider->getContribution([]), 'absent audience must contribute nothing');

	}//end testGetContributionIsFailClosedForOtherAudiences()

	/**
	 * Scenario: external-employee subject receives the labelled manifest.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testContractorSubjectReceivesManifest(): void {
		$manifest = $this->provider->getContribution(self::CONTRACTOR_SUBJECT);

		$this->assertIsArray($manifest);
		$this->assertSame('Planninq', $manifest['label']);
		$this->assertArrayHasKey('collections', $manifest);
		$this->assertArrayHasKey('actions', $manifest);
		$this->assertSame([], $manifest['notifications'], 'no per-subject inbox collection exists in planninq');

	}//end testContractorSubjectReceivesManifest()

	/**
	 * Scenario: the three reads are contractor-scoped by the UUID domain refs.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testCollectionsAreContractorScoped(): void {
		$manifest = $this->provider->getContribution(self::CONTRACTOR_SUBJECT);
		$collections = $manifest['collections'];

		$this->assertSame(
			['contractorTasks', 'contractorTimeEntries', 'contractorProjects'],
			array_column($collections, 'id')
		);
		$this->assertSame(['task', 'plannedTimeEntry', 'project'], array_column($collections, 'schema'));
		$this->assertSame(
			['contractorRef', 'contractorRef', 'contractorRefs'],
			array_column($collections, 'scopeField')
		);

		foreach ($collections as $collection) {
			$this->assertSame(self::REGISTER_EXPECTATION(), $collection['register']);
			$this->assertSame('contractorRef', $collection['scopeClaim'], 'every read scopes on the contractorRef claim');
			$this->assertTrue($collection['listable']);
			$this->assertArrayNotHasKey('minTrust', $collection, 'no minTrust — default low');
		}

	}//end testCollectionsAreContractorScoped()

	/**
	 * Scenario: the log-time create-action whitelists only submittable fields.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testLogTimeActionWhitelist(): void {
		$manifest = $this->provider->getContribution(self::CONTRACTOR_SUBJECT);
		$actions = $manifest['actions'];

		$this->assertCount(1, $actions);
		$action = $actions[0];

		$this->assertSame('logTime', $action['id']);
		$this->assertSame('create', $action['type']);
		$this->assertSame('plannedTimeEntry', $action['schema']);
		$this->assertSame(['task', 'date', 'duration', 'description'], $action['fields']);
		$this->assertNotContains('user', $action['fields'], 'the logging NC user is server-authoritative');
		$this->assertNotContains('contractorRef', $action['fields'], 'the scope key is derived from the claim, not submitted');

	}//end testLogTimeActionWhitelist()

	/**
	 * Drift pin: the portal-identity change added the contractorRef props.
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-identity/specs/portal-identity/spec.md
	 */
	public function testRegisterCarriesContractorRefProperties(): void {
		$schemas = $this->register['components']['schemas'];

		foreach (['task', 'plannedTimeEntry'] as $schemaName) {
			$prop = $schemas[$schemaName]['properties']['contractorRef'];
			$this->assertSame('string', $prop['type'], "{$schemaName}.contractorRef must be a string");
			$this->assertSame('uuid', $prop['format'], "{$schemaName}.contractorRef must be format uuid");
			$this->assertNotContains(
				'contractorRef',
				$schemas[$schemaName]['required'],
				"{$schemaName}.contractorRef must stay optional (fail-closed additive)"
			);
		}

		// project carries the array form alongside members.
		$refs = $schemas['project']['properties']['contractorRefs'];
		$this->assertSame('array', $refs['type']);
		$this->assertSame('uuid', $refs['items']['format']);
		$this->assertNotContains('contractorRefs', $schemas['project']['required']);

		// The NC-uid props they sit ALONGSIDE are kept, not replaced.
		$this->assertArrayHasKey('assignedTo', $schemas['task']['properties']);
		$this->assertArrayHasKey('user', $schemas['plannedTimeEntry']['properties']);
		$this->assertArrayHasKey('members', $schemas['project']['properties']);

	}//end testRegisterCarriesContractorRefProperties()

	/**
	 * Drift pin: every scopeField + projected field is a real schema property,
	 * and no Nextcloud-uid identity field is ever projected (A4 leak guard).
	 *
	 * @return void
	 *
	 * @spec openspec/changes/portal-contribution/specs/portal-contribution/spec.md
	 */
	public function testManifestReferencesOnlyRealNonLeakingProperties(): void {
		$schemas = $this->register['components']['schemas'];
		$manifest = $this->provider->getContribution(self::CONTRACTOR_SUBJECT);

		foreach ($manifest['collections'] as $collection) {
			$properties = $schemas[$collection['schema']]['properties'];

			$this->assertArrayHasKey(
				$collection['scopeField'],
				$properties,
				"scopeField '{$collection['scopeField']}' must exist on schema '{$collection['schema']}'"
			);

			foreach ($collection['fields'] as $field) {
				$this->assertArrayHasKey(
					$field,
					$properties,
					"projected field '{$field}' must exist on schema '{$collection['schema']}'"
				);
				$this->assertNotContains(
					$field,
					self::NC_UID_FIELDS,
					"projected field '{$field}' is a Nextcloud-uid identity field and must not leak (A4)"
				);
			}
		}//end foreach

		// The log-time create-action must not accept an NC-uid field either.
		foreach ($manifest['actions'] as $action) {
			foreach ($action['fields'] as $field) {
				$this->assertNotContains(
					$field,
					self::NC_UID_FIELDS,
					"create field '{$field}' is a Nextcloud-uid identity field and must not be submittable (A4)"
				);
			}
		}

	}//end testManifestReferencesOnlyRealNonLeakingProperties()

	/**
	 * The register slug every portal collection reads from.
	 *
	 * @return string The OpenRegister register slug (post-rename `planninq`).
	 */
	private static function REGISTER_EXPECTATION(): string {
		return 'planninq';
	}//end REGISTER_EXPECTATION()

}//end class
