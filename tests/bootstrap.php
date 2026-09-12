<?php

declare(strict_types=1);

// Define that we're running PHPUnit.
define('PHPUNIT_RUN', 1);

// Include Composer's autoloader.
require_once __DIR__ . '/../vendor/autoload.php';

/**
 * Tell whether a Nextcloud root is an INSTALLED instance, not just a source tree.
 *
 * lib/base.php from a tree that was never installed still declares `OC` and
 * builds `\OC::$server` before it throws. That server cannot be undone
 * (`OC::$server` is a typed static), so from then on every container lookup in
 * the code under test hits a container that knows none of this app's
 * registrations and autowires from scratch. On 2026-09-08 that recursion took
 * 19 GB of RAM in openregister. The decision therefore has to be made BEFORE
 * base.php is loaded, and the only cheap signal is the `installed` flag.
 *
 * A `dbtype` or `dbhost` key is NOT that signal: a half-written config carries
 * those long before the instance is installed.
 *
 * @param string $ncRoot Candidate Nextcloud root.
 *
 * @return bool True when config/config.php declares `installed => true`.
 */
function planninq_nc_root_is_installed(string $ncRoot): bool {
	$configFile = $ncRoot . '/config/config.php';
	if (is_file($configFile) === false || filesize($configFile) === 0) {
		return false;
	}

	// The config file is a plain `$CONFIG = [...]` script; including it inside a
	// closure keeps `$CONFIG` out of the global scope.
	$config = (static function () use ($configFile): array {
		$CONFIG = [];
		try {
			include $configFile;
		} catch (\Throwable) {
			return [];
		}

		if (is_array($CONFIG) === false) {
			return [];
		}

		return $CONFIG;
	})();

	return ($config['installed'] ?? false) === true;
}

// Bootstrap Nextcloud if not already done.
//
// This config boots the server: the OC_App calls below have no meaning without
// it. So an uninstalled tree is a hard stop with a message that says what to do,
// not a half-boot. Loading base.php from a tree that cannot finish booting is
// what cost 19 GB of RAM on 2026-09-08; use phpunit-unit.xml for a suite that
// runs without a server.
if (!defined('OC_CONSOLE')) {
	$planninqNcRoot = dirname(__DIR__, 3);

	if (is_file($planninqNcRoot . '/lib/base.php') === false) {
		fwrite(
			STDERR,
			sprintf(
				"[planninq/tests/bootstrap] No Nextcloud server at %s, and this config needs one.\n"
				. "  Run the suite from inside a Nextcloud checkout, or use phpunit-unit.xml for the standalone suite.\n",
				$planninqNcRoot
			)
		);
		exit(1);
	}

	if (planninq_nc_root_is_installed($planninqNcRoot) === false) {
		fwrite(
			STDERR,
			sprintf(
				"[planninq/tests/bootstrap] Nextcloud tree at %s is not installed (config/config.php lacks installed => true).\n"
				. "  Loading it would leave a half-built server container behind, so the run stops here.\n"
				. "  Use phpunit-unit.xml for the standalone suite, or point this at an installed instance.\n",
				$planninqNcRoot
			)
		);
		exit(1);
	}

	try {
		require_once $planninqNcRoot . '/lib/base.php';
	} catch (\Throwable $e) {
		// The tree IS installed, so the dangerous case this guard exists for
		// (loading a bare source tree) did not happen. base.php still failed
		// part-way.
		//
		// This does NOT abort. `OC::$server` is a typed static, so a half-built
		// container cannot be unset, and aborting was tried: it turned all six
		// PHPUnit legs red on a suite that passes (humaniq, 2026-09-08). The
		// runaway this guard exists for needs an autowiring lookup to reach the
		// poisoned container, this app has none in lib, and phpunit.xml's 2G cap
		// bounds one anyway.
		//
		// So: say plainly that the container is unreliable, and let the pure unit
		// tests run. A container-bound test failing loudly is the intended outcome.
		fwrite(
			STDERR,
			sprintf(
				"[planninq/tests/bootstrap] Nextcloud at %s could not finish booting (%s).\n"
				. "  \\OC::\$server now holds a HALF-BUILT container and cannot be unset. Pure unit tests\n"
				. "  continue; anything resolving a service from that container is UNVERIFIED by this run.\n",
				$planninqNcRoot,
				$e->getMessage()
			)
		);
	}

	if (file_exists($planninqNcRoot . '/tests/autoload.php')) {
		require_once $planninqNcRoot . '/tests/autoload.php';
	}

	\OC_App::loadApps();
	\OC_App::loadApp('planninq');
	OC_Hook::clear();
}
