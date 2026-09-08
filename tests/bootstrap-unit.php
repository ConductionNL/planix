<?php

declare(strict_types=1);

// Define that we're running PHPUnit.
define('PHPUNIT_RUN', 1);

// Include Composer's autoloader.
$autoloader = require __DIR__ . '/../vendor/autoload.php';

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

// Bootstrap Nextcloud — when the app is checked out inside an INSTALLED
// Nextcloud server tree, the full environment (including \OC::$server) is
// available. A bare source tree is skipped: base.php declares OC and builds a
// server container before it aborts, and that half-built container autowires
// this app's services from scratch, which took 19 GB of RAM in openregister on
// 2026-09-08. The previous dbtype/dbhost check did not catch that case.
$ncBasePath = __DIR__ . '/../../../lib/base.php';
$ncRootPath = dirname(__DIR__, 3);
$ncLoaded = false;

if (file_exists($ncBasePath) === true && planninq_nc_root_is_installed($ncRootPath) === true) {
	try {
		require_once $ncBasePath;
		$ncLoaded = true;
	} catch (\Throwable $e) {
		fwrite(
			STDERR,
			sprintf(
				"[planninq/tests/bootstrap-unit] Nextcloud at %s could not be initialised (%s).\n"
				. "  A half-booted server cannot be undone, so the run stops here rather than pretending to be pure-unit.\n",
				$ncRootPath,
				$e->getMessage()
			)
		);
		exit(1);
	}
}

// If Nextcloud could not be loaded, register the OCP/NCU interface stubs
// shipped by the `nextcloud/ocp` dev dependency so pure unit tests can mock
// OCP interfaces (OCP\Activity\IEvent, OCP\IAppConfig, …).
//
// These PSR-4 prefixes are added to the autoloader instance owned by THIS
// PHPUnit process only. They are deliberately NOT declared in composer.json's
// `autoload` block: doing so would bake OCP into the generated
// vendor/composer/autoload_psr4.php and shadow the server's own OCP classes at
// runtime, which bricks the Nextcloud instance the app is installed in.
if ($ncLoaded === false && $autoloader instanceof \Composer\Autoload\ClassLoader) {
	$autoloader->addPsr4('OCP\\', __DIR__ . '/../vendor/nextcloud/ocp/OCP/');
	$autoloader->addPsr4('NCU\\', __DIR__ . '/../vendor/nextcloud/ocp/NCU/');

	// OpenRegister is a sibling Nextcloud app, not a composer dependency, so
	// its runtime classes are genuinely absent from a bare unit-test process.
	// tests/stubs/openregister/ carries the handful of signatures planninq's
	// listeners consume. Same containment rule as above: this prefix exists
	// only on the PHPUnit process's loader, and it is APPENDED, so a real
	// OCA\OpenRegister class always wins when one is on the path.
	$autoloader->addPsr4('OCA\\OpenRegister\\', __DIR__ . '/stubs/openregister/');
}

// Register Test\ namespace for NC test classes.
$serverTestsLib = __DIR__ . '/../../../tests/lib/';
if (is_dir($serverTestsLib)) {
	$loader = new \Composer\Autoload\ClassLoader();
	$loader->addPsr4('Test\\', $serverTestsLib);
	$loader->register(true);
}

// Stub Doctrine\DBAL\ParameterType for unit tests that mock IDBConnection or
// IQueryBuilder. The real class lives in doctrine/dbal, which Nextcloud
// provides at runtime but which is not one of planninq's composer dev deps.
if (class_exists('Doctrine\\DBAL\\ParameterType') === false) {
	eval(
		'namespace Doctrine\\DBAL; '
		. 'enum ParameterType: int { '
		. 'case NULL = 0; '
		. 'case INTEGER = 1; '
		. 'case STRING = 2; '
		. 'case LARGE_OBJECT = 3; '
		. 'case BOOLEAN = 5; '
		. 'case BINARY = 6; '
		. 'case ASCII = 7; '
		. '}'
	);
}
