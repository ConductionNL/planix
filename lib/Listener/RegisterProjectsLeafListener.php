<?php

/**
 * Planninq Register Projects Leaf Listener
 *
 * Registers Planninq's `planninq-projects` leaf on OpenRegister through the
 * sibling-app leaf-registration hook (`RegisterLeafProvidersEvent`, ADR-066).
 * This is the SERVER-SIDE half of a registration whose client half lives in
 * `src/integrations/registerProjectsLeaf.js` and mounts under the SAME id.
 *
 * WHY THE LEAF EXISTS AT ALL
 * --------------------------
 * Planninq owns projects. Pipelinq had grown a parallel four-level breakdown of
 * its own — project, phase, task and time entry — so the fleet carried two
 * `project` schemas, two task schemas and two time-entry schemas, and a schema
 * slug is GLOBAL on a shared OpenRegister. Those duplicates resolved to each
 * other silently.
 *
 * The duplicates are gone and the CRM now reads projects from here instead of
 * storing its own. A leaf is what makes that safe: pipelinq used to render the
 * list from its own manifest against `register: pipelinq`, and on an install
 * without the owning app such a read returns nothing while looking exactly like
 * a client that genuinely has no projects. A leaf cannot render when its app is
 * absent, so that failure mode does not exist rather than being handled.
 *
 * WHY BOTH HALVES, when the leaf already renders. ADR-066 decision 1 makes the
 * JS `registerIntegration()` path the render-surface half, bound to the server
 * descriptor by shared `id`. Without this listener the leaf renders but is
 * invisible to every server-side consumer — an orphan registration under
 * ADR-066 decision 4, which gate-24 refuses.
 *
 * RENDER-AND-READ ONLY (ADR-066 decision 2). The descriptor carries no Vue
 * components, no verb and no run authority. It declares one kind,
 * `render-surface`: Planninq mounts the projects surface on a host object, and
 * the components stay in Planninq's own bundle.
 *
 * It does NOT declare `data-provider`: the widget reads projects through
 * OpenRegister's own object API from the client (ADR-022), so Planninq serves
 * no app-local store behind this leaf and passes a null provider.
 *
 * @category Listener
 * @package  OCA\Planninq\Listener
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

namespace OCA\Planninq\Listener;

use OCA\OpenRegister\Event\RegisterLeafProvidersEvent;
use OCA\OpenRegister\Service\Integration\LeafDescriptor;
use OCA\Planninq\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IL10N;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Contributes the `planninq-projects` leaf descriptor to OpenRegister.
 *
 * @spec openspec/specs/project-delivery/spec.md#requirement-both-halves-of-the-projects-leaf-agree
 *
 * @template-implements IEventListener<Event>
 */
class RegisterProjectsLeafListener implements IEventListener {

	/**
	 * The leaf id, equal to `PROJECTS_INTEGRATION_ID` in the JS half.
	 *
	 * The two halves are bound by this shared string; a mismatch is an orphan
	 * registration on both sides rather than an error on either.
	 *
	 * @var string
	 */
	public const LEAF_ID = 'planninq-projects';

	/**
	 * The l10n SOURCE string for the label, equal to the string the JS half
	 * passes to its own translate call.
	 *
	 * Both halves must translate the SAME key or the two render different
	 * labels for one leaf depending on which side the reader is looking at.
	 *
	 * @var string
	 */
	public const LABEL_SOURCE = 'Projects';

	/**
	 * Material Design Icons name, equal to the JS half's `icon`.
	 *
	 * The same glyph the `project` schema carries, so the leaf and the schema
	 * it renders are recognisably the same thing.
	 *
	 * @var string
	 */
	public const ICON = 'FolderOutline';

	/**
	 * Admin-UI grouping, equal to the JS half's `group`.
	 *
	 * @var string
	 */
	public const GROUP = 'workflow';

	/**
	 * AD-18 marker: a schema property carrying this `referenceType` renders
	 * this leaf's single-entity surface instead of a plain value. It is what
	 * turns shillinq's `ProjectAssignment.projectId` from a bare uuid into the
	 * project itself.
	 *
	 * IT IS THE INTEGRATION ID, not a loose semantic word like 'project'.
	 * `PropertyReferenceTypeValidator::validate()` resolves the marker through
	 * `IntegrationRegistry::isValidIntegrationId()`, which is a lookup in the
	 * provider map keyed by leaf id, and THROWS on a miss. Nothing calls that
	 * validator today — it is registered as a service and wired into no import
	 * path — so a bare word is currently inert rather than fatal, which is
	 * exactly the shape of thing that is fine until the day it is wired.
	 * humaniq's leaf carries the same latent problem with 'hours'.
	 *
	 * Using the id also makes the render-layer match unambiguous: the property
	 * and the descriptor that claims it spell the same string.
	 *
	 * Written as a LITERAL equal to LEAF_ID rather than as `self::LEAF_ID`:
	 * scripts/check-integration-parity.js reads this constant with a regex over
	 * the source, so a constant expression reads as an EMPTY value and the gate
	 * reports the half as unreadable.
	 *
	 * @var string
	 */
	public const REFERENCE_TYPE = 'planninq-projects';

	/**
	 * The render surfaces this leaf targets — the SAME set, in the same order,
	 * as `SURFACES` in the JS half.
	 *
	 * Written out on both halves rather than left to a default, because that is
	 * what gives gate-24 two explicit sets to compare. A half that declares its
	 * surfaces by omission is how hermiq's two halves drifted apart unnoticed.
	 *
	 * @var string[]
	 */
	public const SURFACES = [
		'user-dashboard',
		'app-dashboard',
		'detail-page',
		'single-entity',
	];

	/**
	 * Constructor.
	 *
	 * @param IL10N           $l10n   Localisation for the human-readable label.
	 * @param LoggerInterface $logger PSR-3 logger; a throwing listener must cost only its own leaf.
	 */
	public function __construct(
		private readonly IL10N $l10n,
		private readonly LoggerInterface $logger,
	) {
	}//end __construct()

	/**
	 * Contribute the `planninq-projects` leaf descriptor.
	 *
	 * @param Event $event The dispatched event.
	 *
	 * @return void
	 *
	 * @spec openspec/specs/project-delivery/spec.md#requirement-both-halves-of-the-projects-leaf-agree
	 */
	public function handle(Event $event): void {
		if ($event instanceof RegisterLeafProvidersEvent === false) {
			return;
		}

		try {
			$descriptor = new LeafDescriptor(
				id: self::LEAF_ID,
				label: $this->l10n->t(self::LABEL_SOURCE),
				icon: self::ICON,
				kinds: [LeafDescriptor::KIND_RENDER_SURFACE],
				requiredApp: Application::APP_ID,
				group: self::GROUP,
				surfaces: self::SURFACES,
				referenceType: self::REFERENCE_TYPE,
				// Planninq is Vue 3 and a consuming host may still be Vue 2.7,
				// so the JS half renders through a mount/unmount DOM hand-off.
				// The server descriptor MUST declare the same render mode under
				// the shared id or the surface blanks.
				renderMode: LeafDescriptor::RENDER_MODE_MOUNT,
			);

			// Render-only leaf: no IntegrationProvider. The widget reads projects
			// through OpenRegister's object API in the browser, so there is no
			// app-local store to serve behind this leaf.
			$event->registerLeaf($descriptor, null);
		} catch (Throwable $e) {
			// Never take the leaf catalogue down: log and skip our own leaf only.
			$this->logger->warning(
				'Planninq could not register the planninq-projects leaf: ' . $e->getMessage(),
				['exception' => $e]
			);
		}//end try

	}//end handle()
}//end class
