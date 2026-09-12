<?php

/**
 * Test-only stub for OpenRegister's LeafDescriptor.
 *
 * TEST-ONLY — see tests/stubs/openregister/Db/ObjectEntity.php for the full
 * rationale. Reachable only via the PSR-4 prefix appended by
 * tests/bootstrap-unit.php, never from composer.json's autoload map.
 *
 * Mirrored from openregister/lib/Service/Integration/LeafDescriptor.php: the
 * constructor's named parameters and the getters the listener test reads back.
 * The real class also validates its kinds, surfaces and render mode; this stub
 * deliberately does NOT, because a stub that reimplements validation tests the
 * stub rather than the listener.
 *
 * @category Test
 * @package  OCA\OpenRegister\Service\Integration
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

namespace OCA\OpenRegister\Service\Integration;

/**
 * Test-only stub of a leaf descriptor.
 */
class LeafDescriptor {
	/**
	 * A tab/widget rendered alongside an object.
	 *
	 * @var string
	 */
	public const KIND_RENDER_SURFACE = 'render-surface';

	/**
	 * A provider serving the app's own data for an object.
	 *
	 * @var string
	 */
	public const KIND_DATA_PROVIDER = 'data-provider';

	/**
	 * The host renders the leaf's component itself.
	 *
	 * @var string
	 */
	public const RENDER_MODE_COMPONENT = 'component';

	/**
	 * The host hands over a bare element and the leaf mounts into it.
	 *
	 * @var string
	 */
	public const RENDER_MODE_MOUNT = 'mount';

	/**
	 * Constructor.
	 *
	 * @param string      $id                 Stable kebab-case identifier.
	 * @param string      $label              Human-readable label.
	 * @param string      $icon               Material Design Icons name.
	 * @param array       $kinds              The leaf kinds.
	 * @param string|null $requiredApp        App that must be installed.
	 * @param string|null $group              Admin-UI grouping.
	 * @param array       $surfaces           Render surfaces targeted.
	 * @param string|null $referenceType      AD-18 property marker.
	 * @param string|null $requiresPermission Permission gate.
	 * @param string      $renderMode         How the host renders it.
	 */
	public function __construct(
		private string $id,
		private string $label,
		private string $icon,
		private array $kinds,
		private ?string $requiredApp = null,
		private ?string $group = null,
		private array $surfaces = [],
		private ?string $referenceType = null,
		private ?string $requiresPermission = null,
		private string $renderMode = self::RENDER_MODE_COMPONENT,
	) {
	}//end __construct()

	/**
	 * The leaf id.
	 *
	 * @return string The id.
	 */
	public function getId(): string {
		return $this->id;
	}//end getId()

	/**
	 * The label.
	 *
	 * @return string The label.
	 */
	public function getLabel(): string {
		return $this->label;
	}//end getLabel()

	/**
	 * The icon name.
	 *
	 * @return string The icon.
	 */
	public function getIcon(): string {
		return $this->icon;
	}//end getIcon()

	/**
	 * The declared kinds.
	 *
	 * @return array The kinds.
	 */
	public function getKinds(): array {
		return $this->kinds;
	}//end getKinds()

	/**
	 * The app that must be installed.
	 *
	 * @return string|null The app id.
	 */
	public function getRequiredApp(): ?string {
		return $this->requiredApp;
	}//end getRequiredApp()

	/**
	 * The admin-UI group.
	 *
	 * @return string|null The group.
	 */
	public function getGroup(): ?string {
		return $this->group;
	}//end getGroup()

	/**
	 * The render surfaces.
	 *
	 * @return array The surfaces.
	 */
	public function getSurfaces(): array {
		return $this->surfaces;
	}//end getSurfaces()

	/**
	 * The AD-18 reference-type marker.
	 *
	 * @return string|null The reference type.
	 */
	public function getReferenceType(): ?string {
		return $this->referenceType;
	}//end getReferenceType()

	/**
	 * The permission gate.
	 *
	 * @return string|null The permission.
	 */
	public function getRequiresPermission(): ?string {
		return $this->requiresPermission;
	}//end getRequiresPermission()

	/**
	 * The render mode.
	 *
	 * @return string The render mode.
	 */
	public function getRenderMode(): string {
		return $this->renderMode;
	}//end getRenderMode()
}//end class
