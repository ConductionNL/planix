<?php

/**
 * Static-analysis stub for OpenRegister's AppHost engine (ADR-040).
 *
 * ANALYSIS-ONLY. This file is referenced from phpstan.neon `scanFiles` and
 * psalm.xml `<stubs>` and is NEVER autoloaded or executed at runtime — it is
 * not under `lib/`, is not in the composer PSR-4 map, and nothing requires it.
 *
 * Why it exists: openregister is a sibling Nextcloud app, not a composer
 * dependency, so its classes genuinely are not on the analysis path. planninq
 * already declares that policy for phpstan (`- '#unknown class
 * OCA\\OpenRegister\\#'` in phpstan.neon) and for psalm (the documented
 * "OpenRegister cross-app classes (loaded dynamically)" `referencedClass`
 * block in psalm.xml); those mechanisms silence the analyzer. This stub is
 * strictly better: it supplies the REAL signatures instead, so the analyzers
 * still type-check every call planninq makes into the engine.
 *
 * Every signature below is mirrored verbatim from
 * openregister/lib/AppHost/{Controller,Settings,Listener}/Generic*.php.
 * If the engine changes, this stub must be updated to match — a drifted stub
 * is worse than none.
 *
 * @category Test
 * @package  OCA\OpenRegister\AppHost
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

namespace OCA\OpenRegister\AppHost\Observability;

/**
 * Analysis-only stub: loads and validates an app's observability manifest.
 */
class ManifestLoader {
}//end class

/**
 * Analysis-only stub: runs the health checks declared in a manifest.
 */
class HealthCheckExecutor {
}//end class

/**
 * Analysis-only stub: renders the metrics declared in a manifest.
 */
class MetricsEngine {
}//end class

namespace OCA\OpenRegister\AppHost\Controller;

use OCA\OpenRegister\AppHost\Observability\HealthCheckExecutor;
use OCA\OpenRegister\AppHost\Observability\ManifestLoader;
use OCA\OpenRegister\AppHost\Observability\MetricsEngine;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Analysis-only stub: serves the app's Vue SPA and its history-mode catch-all.
 */
class GenericDashboardController extends Controller {
	/**
	 * Construct the dashboard controller.
	 *
	 * @param string $appName The app id.
	 * @param IRequest $request The current request.
	 */
	public function __construct(
		string $appName,
		IRequest $request,
	) {
		parent::__construct($appName, $request);
	}//end __construct()

	/**
	 * Render the SPA entry point.
	 *
	 * @return TemplateResponse
	 */
	public function page(): TemplateResponse {
	}//end page()

	/**
	 * Render the SPA for any history-mode sub-path.
	 *
	 * @return TemplateResponse
	 */
	public function catchAll(): TemplateResponse {
	}//end catchAll()
}//end class

/**
 * Analysis-only stub: per-user UI preference storage.
 */
class GenericPreferencesController extends Controller {
	/**
	 * Construct the preferences controller.
	 *
	 * @param string $appName The app id.
	 * @param IRequest $request The current request.
	 * @param IConfig $config The config service.
	 * @param IUserSession $userSession The user session.
	 */
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IConfig $config,
		private readonly IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}//end __construct()

	/**
	 * Read one preference for the current user.
	 *
	 * @param string $key The preference key.
	 *
	 * @return JSONResponse
	 */
	public function getPreference(string $key): JSONResponse {
	}//end getPreference()

	/**
	 * Write one preference for the current user.
	 *
	 * @param string $key The preference key.
	 * @param string $value The preference value.
	 *
	 * @return JSONResponse
	 */
	public function setPreference(string $key, string $value = ''): JSONResponse {
	}//end setPreference()
}//end class

/**
 * Analysis-only stub: manifest-driven health endpoint.
 */
class GenericHealthController extends Controller {
	/**
	 * Construct the health controller.
	 *
	 * @param string $appName The app id.
	 * @param IRequest $request The current request.
	 * @param ManifestLoader $manifestLoader The observability manifest loader.
	 * @param HealthCheckExecutor $executor The health check executor.
	 */
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly ManifestLoader $manifestLoader,
		private readonly HealthCheckExecutor $executor,
	) {
		parent::__construct($appName, $request);
	}//end __construct()

	/**
	 * Return the aggregated health result.
	 *
	 * @return JSONResponse
	 */
	public function index(): JSONResponse {
	}//end index()
}//end class

/**
 * Analysis-only stub: manifest-driven Prometheus metrics endpoint.
 */
class GenericMetricsController extends Controller {
	/**
	 * Construct the metrics controller.
	 *
	 * @param string $appName The app id.
	 * @param IRequest $request The current request.
	 * @param ManifestLoader $manifestLoader The observability manifest loader.
	 * @param MetricsEngine $engine The metrics engine.
	 */
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly ManifestLoader $manifestLoader,
		private readonly MetricsEngine $engine,
	) {
		parent::__construct($appName, $request);
	}//end __construct()

	/**
	 * Return the rendered metrics exposition.
	 *
	 * @return mixed The engine returns a TextPlainResponse.
	 */
	public function index() {
	}//end index()
}//end class

namespace OCA\OpenRegister\AppHost\Settings;

use OCP\App\IAppManager;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IAppConfig;
use OCP\IURLGenerator;
use OCP\Settings\IDelegatedSettings;
use OCP\Settings\IIconSection;

/**
 * Analysis-only stub: the admin settings panel base class.
 *
 * planninq's lib/Settings/AdminSettings.php extends this, which is what lets
 * `#[AuthorizedAdminSetting(settings: AdminSettings::class)]` satisfy its
 * `class-string<IDelegatedSettings>` parameter type.
 */
class GenericAdminSettings implements IDelegatedSettings {
	/**
	 * Construct the admin settings panel.
	 *
	 * @param string $appId The app id.
	 * @param string $sectionId The settings section id.
	 * @param int $priority The display priority.
	 * @param IAppManager $appManager The app manager.
	 * @param IInitialState $initialState The initial state service.
	 * @param IAppConfig|null $appConfig The app config service.
	 */
	public function __construct(
		protected readonly string $appId,
		protected readonly string $sectionId,
		protected readonly int $priority,
		protected readonly IAppManager $appManager,
		protected readonly IInitialState $initialState,
		protected readonly ?IAppConfig $appConfig = null,
	) {
	}//end __construct()

	/**
	 * Render the settings form.
	 *
	 * @return TemplateResponse
	 */
	public function getForm(): TemplateResponse {
	}//end getForm()

	/**
	 * Return the settings section id.
	 *
	 * @return string
	 */
	public function getSection(): string {
	}//end getSection()

	/**
	 * Return the display priority.
	 *
	 * @return int
	 */
	public function getPriority(): int {
	}//end getPriority()

	/**
	 * Return the delegated-settings display name.
	 *
	 * @return string|null
	 */
	public function getName(): ?string {
	}//end getName()

	/**
	 * Return the app config keys a delegated admin may write.
	 *
	 * @return array<string,array<int,string>>
	 */
	public function getAuthorizedAppConfig(): array {
	}//end getAuthorizedAppConfig()
}//end class

/**
 * Analysis-only stub: the admin settings section base class.
 */
class GenericSettingsSection implements IIconSection {
	/**
	 * Construct the settings section.
	 *
	 * @param string $sectionId The section id.
	 * @param string $name The display name.
	 * @param string $appId The app id.
	 * @param string $iconFile The icon file name.
	 * @param int $priority The display priority.
	 * @param IURLGenerator $urlGenerator The URL generator.
	 */
	public function __construct(
		protected readonly string $sectionId,
		protected readonly string $name,
		protected readonly string $appId,
		protected readonly string $iconFile,
		protected readonly int $priority,
		protected readonly IURLGenerator $urlGenerator,
	) {
	}//end __construct()

	/**
	 * Return the section id.
	 *
	 * @return string
	 */
	public function getID(): string {
	}//end getID()

	/**
	 * Return the display name.
	 *
	 * @return string
	 */
	public function getName(): string {
	}//end getName()

	/**
	 * Return the display priority.
	 *
	 * @return int
	 */
	public function getPriority(): int {
	}//end getPriority()

	/**
	 * Return the absolute URL to the section icon.
	 *
	 * @return string
	 */
	public function getIcon(): string {
	}//end getIcon()
}//end class

namespace OCA\OpenRegister\AppHost\Listener;

use OCP\App\IAppManager;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use Psr\Log\LoggerInterface;

/**
 * Analysis-only stub: answers OpenRegister's deep-link registration event from
 * the app's src/manifest.json `deepLinks` block.
 *
 * @template-implements IEventListener<Event>
 */
class GenericDeepLinkRegistrationListener implements IEventListener {
	/**
	 * Construct the deep-link registration listener.
	 *
	 * @param string $appId The app id.
	 * @param IAppManager $appManager The app manager.
	 * @param LoggerInterface $logger The logger.
	 */
	public function __construct(
		protected readonly string $appId,
		protected readonly IAppManager $appManager,
		protected readonly LoggerInterface $logger,
	) {
	}//end __construct()

	/**
	 * Handle the deep-link registration event.
	 *
	 * @param Event $event The dispatched event.
	 *
	 * @return void
	 */
	public function handle(Event $event): void {
	}//end handle()
}//end class

namespace OCA\OpenRegister\Exception;

/*
 * OpenRegister's exception classes, declared here for the same reason as the
 * AppHost engine above: openregister is a sibling Nextcloud app, not a composer
 * dependency, so its classes are absent from the analysis path.
 *
 * Without them PHPStan types `get_class($e)` as a class-string it cannot match
 * against these names and reports every comparison in
 * ProjectController::classifyObjectServiceException() as "will always evaluate
 * to false" — five findings about code that is correct and load-bearing at
 * runtime. Stubbing the real names keeps those comparisons type-checked instead
 * of silenced in a baseline.
 *
 * Analysis-only: never autoloaded or executed.
 */

class NotAuthorizedException extends \Exception {
}

class ValidationException extends \Exception {
}

class CustomValidationException extends \Exception {
}

class ProviderUnavailableException extends \Exception {
}

/*
 * `OCA\OpenRegister\AppHost\Bootstrap` USED TO BE DECLARED HERE.
 *
 * It moved to the shared package, which now ships it as
 * vendor/conduction/hydra-gates/hydra-gates/stubs/openregister-apphost-bootstrap.stub.php
 * (ConductionNL/.github#686). psalm.xml and phpstan.neon name that file.
 *
 * Not a tidy-up. decidiq and filinq adopted the same AppHost route table and
 * write the same guarded `Bootstrap::aliasStoreController()` call, and both
 * were red on psalm with the `UnusedParam` finding this stub answers. planninq
 * was green only because it had already paid for a copy. Three copies of one
 * stub is three chances to drift from the engine, so the copy left this tree.
 *
 * Do NOT re-declare the class below: two stubs declaring it would be a
 * duplicate class declaration, not a fallback.
 */

namespace OCA\OpenRegister\Service\Integration;

/**
 * The integration-provider contract (ADR-019 / ADR-066).
 *
 * Planninq's projects leaf is render-and-read only and contributes `null` where
 * a provider would go, so only the TYPE has to resolve here. Stubbing it keeps
 * `registerLeaf()`'s second parameter type-checked rather than silenced.
 *
 * Analysis-only: never autoloaded or executed.
 */
interface IntegrationProvider {
}

/**
 * A leaf descriptor (ADR-066).
 *
 * Mirrored from openregister/lib/Service/Integration/LeafDescriptor.php. The
 * constants matter most: `RegisterProjectsLeafListener` names
 * `KIND_RENDER_SURFACE` and `RENDER_MODE_MOUNT`, and both halves of the leaf
 * must agree on the render mode or the surface silently blanks. A stub keeps
 * those two constant reads checked; the psalm suppress list would not.
 *
 * Analysis-only: never autoloaded or executed.
 */
class LeafDescriptor {
	public const KIND_RENDER_SURFACE = 'render-surface';

	public const KIND_DATA_PROVIDER = 'data-provider';

	public const KIND_AGENT_RUNNER = 'agent-runner';

	public const RENDER_MODE_COMPONENT = 'component';

	public const RENDER_MODE_MOUNT = 'mount';

	public function __construct(
		string $id,
		string $label,
		string $icon,
		array $kinds,
		?string $requiredApp = null,
		?string $group = null,
		array $surfaces = [],
		?string $referenceType = null,
		?string $requiresPermission = null,
		string $renderMode = self::RENDER_MODE_COMPONENT,
	) {
	}//end __construct()

	public function getId(): string {
	}//end getId()

	public function getKinds(): array {
	}//end getKinds()

	public function getSurfaces(): array {
	}//end getSurfaces()

	public function getRenderMode(): string {
	}//end getRenderMode()
}//end class

namespace OCA\OpenRegister\Event;

use OCA\OpenRegister\Service\Integration\IntegrationProvider;
use OCA\OpenRegister\Service\Integration\LeafDescriptor;
use OCP\EventDispatcher\Event;

/**
 * The ADR-066 collect-event a sibling app contributes its leaf to.
 *
 * Mirrored from openregister/lib/Event/RegisterLeafProvidersEvent.php.
 *
 * Analysis-only: never autoloaded or executed.
 */
class RegisterLeafProvidersEvent extends Event {
	public function registerLeaf(LeafDescriptor $descriptor, ?IntegrationProvider $provider = null): void {
	}//end registerLeaf()

	public function getLeaves(): array {
	}//end getLeaves()
}//end class
