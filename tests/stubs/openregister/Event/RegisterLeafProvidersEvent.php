<?php

/**
 * Test-only stub for OpenRegister's RegisterLeafProvidersEvent.
 *
 * TEST-ONLY — see tests/stubs/openregister/Db/ObjectEntity.php for the full
 * rationale. Reachable only via the PSR-4 prefix appended by
 * tests/bootstrap-unit.php, never from composer.json's autoload map.
 *
 * Mirrored from openregister/lib/Event/RegisterLeafProvidersEvent.php — the
 * ADR-066 collect-event a sibling app contributes its leaf descriptor to.
 *
 * @category Test
 * @package  OCA\OpenRegister\Event
 *
 * @author    Conduction Development Team <dev@conduction.nl>
 * @copyright 2026 Conduction B.V.
 * @license   EUPL-1.2 https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * @version GIT: <git-id>
 *
 * @link https://conduction.nl
 *
 * SPDX-FileCopyrightText: 2026 Conduction B.V. <info@conduction.nl>
 * SPDX-License-Identifier: EUPL-1.2
 */

declare(strict_types=1);

namespace OCA\OpenRegister\Event;

use OCA\OpenRegister\Service\Integration\IntegrationProvider;
use OCA\OpenRegister\Service\Integration\LeafDescriptor;
use OCP\EventDispatcher\Event;

/**
 * Test-only stub of the leaf-provider collect event.
 */
class RegisterLeafProvidersEvent extends Event {
	/**
	 * Leaves contributed during this dispatch.
	 *
	 * @var array<int, array{descriptor: LeafDescriptor, provider: ?IntegrationProvider}>
	 */
	private array $leaves = [];

	/**
	 * Contribute one leaf.
	 *
	 * @param LeafDescriptor           $descriptor The descriptor.
	 * @param IntegrationProvider|null $provider   The provider, or null for render-only.
	 *
	 * @return void
	 */
	public function registerLeaf(LeafDescriptor $descriptor, ?IntegrationProvider $provider = null): void {
		$this->leaves[] = [
			'descriptor' => $descriptor,
			'provider' => $provider,
		];

	}//end registerLeaf()

	/**
	 * Every leaf contributed during this dispatch.
	 *
	 * @return array<int, array{descriptor: LeafDescriptor, provider: ?IntegrationProvider}> The leaves.
	 */
	public function getLeaves(): array {
		return $this->leaves;
	}//end getLeaves()
}//end class
