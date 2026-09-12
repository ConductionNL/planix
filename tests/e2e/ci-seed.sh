#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 Planninq Contributors
# SPDX-License-Identifier: EUPL-1.2
#
# Provision Planninq's OpenRegister register + schemas on a freshly installed
# Nextcloud, for the shared `E2E Tests (Playwright)` CI job.
#
# Wired up as the workflow's `playwright-seed-command`. That step runs AFTER
# `php -S` is up and with cwd set to the Nextcloud server root, so this is
# invoked as:
#
#     playwright-seed-command: 'bash apps/planninq/tests/e2e/ci-seed.sh'
#
# WHY THIS IS NEEDED
# ------------------
# `occ app:enable planninq` runs the `InitializeSettings` post-migration repair
# step (lib/Repair/InitializeSettings.php), which is supposed to import
# `lib/Settings/planninq_register.json` into OpenRegister. Two things make that
# unreliable as the sole fresh-install path, and BOTH fail silently:
#
#   1. An IRepairStep runs with NO user session. OpenRegister's RBAC evaluates
#      the acting user, so the import is denied outright. This is not a
#      hypothesis for this app — it is the exact message the first attempt at
#      enabling this job recorded (run 30692400428):
#
#          Could not auto-configure Planninq: Failed to import configuration for
#          app planninq: User 'Anonymous' does not have permission to 'create'
#          objects in schema 'Label'
#
#      `InitializeSettings::run()` catches `\Throwable` and downgrades it to
#      `$output->warning(...)`, so `occ app:enable planninq` still exits 0.
#   2. It calls `loadConfiguration(force: false)`. The non-forced path is
#      version-guarded: it can advance the recorded configuration version
#      WITHOUT applying the register, so a second run then sees "already
#      current" and does nothing either.
#
# Either way the app enables cleanly, the SPA boots, and the register simply is
# not there. The e2e suite's failure mode in that state is `[seed] Planninq
# register not reachable` from tests/e2e/fixtures/seed.ts followed by every UI
# spec timing out on a board that has no project to open — messages that accuse
# the fixtures and the selectors, not the missing import.
#
# So this script does the import EXPLICITLY over the admin HTTP API (which has
# a real session and passes RBAC), forced, and then VERIFIES the register and
# schemas actually exist. A failed provision becomes ONE loud step failure here
# instead of a dozen misleading spec failures later.
#
# It is idempotent: the import is idempotent server-side and re-running only
# re-verifies.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# ── Mode ─────────────────────────────────────────────────────────────────────
# `e2e` (default) is the Playwright path and runs everything below, including
# the closing SPA-bundle gate.
#
# `api` is for the Newman job, which needs exactly the same OpenRegister
# provisioning — without it every request returns **412 Precondition failed**,
# which is what 14 assertions were reporting — but which has no frontend build
# step at all. Running the bundle gate there would `exit 1` over a bundle that
# was never meant to exist, converting a fix for those assertions into a hard
# job failure. Skipping it removes no coverage: no Newman assertion loads a
# page. Same split as docudesk's seed, for the same reason.
SEED_MODE="${1:-e2e}"
case "$SEED_MODE" in
	e2e | api) ;;
	*)
		echo "::error::unknown seed mode '${SEED_MODE}' — expected 'e2e' or 'api'."
		exit 1
		;;
esac

# ── Target resolution ────────────────────────────────────────────────────────
# The shared workflow's "Seed test data" step exports BASE_URL / NEXTCLOUD_URL /
# NC_BASE_URL / ADMIN_USER / ADMIN_PASSWORD / NC_ADMIN_USER / NC_ADMIN_PASS
# (ConductionNL/.github#124). Accept all of them, and fall back to the CI
# runner's own `php -S 0.0.0.0:8080` only when actually running on CI.
#
# On a developer box `localhost:8080` is the SHARED dev container, and this
# script performs ADMIN WRITES — it must never silently import a register into
# somebody else's environment. Off CI, an unset target is a hard error.
BASE="${PLAYWRIGHT_BASE_URL:-${BASE_URL:-${NEXTCLOUD_URL:-${NC_BASE_URL:-}}}}"
if [ -z "$BASE" ]; then
	if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then
		BASE="http://localhost:8080"
	else
		echo "ERROR: no base URL set. Export PLAYWRIGHT_BASE_URL or BASE_URL." >&2
		echo "       Refusing to default to http://localhost:8080 outside CI —" >&2
		echo "       that is the SHARED dev container and this script writes to it." >&2
		exit 1
	fi
fi
BASE="${BASE%/}"

USER_NAME="${ADMIN_USER:-${NC_ADMIN_USER:-admin}}"
USER_PASS="${ADMIN_PASSWORD:-${NC_ADMIN_PASS:-admin}}"

echo "[ci-seed] target:  ${BASE}"
echo "[ci-seed] app dir: ${APP_DIR}"

# ── 1. Import the Planninq configuration ───────────────────────────────────────
# Planninq has NO `settings#import` route of its own, but it does not need one:
# its `appinfo/routes.php` returns `\OCA\OpenRegister\AppHost\Routes::standard()`,
# whose canonical table ships `settings#load` at POST /api/settings/load. On
# planninq that name resolves to OCA\Planninq\Controller\SettingsController::load(),
# which calls `loadConfiguration(force: true)` — precisely the forced import the
# repair step cannot perform. It is admin-only (no #[NoAdminRequired], plus an
# explicit isCurrentUserAdmin() body check), so HTTP Basic as admin is required.
#
# `OCS-APIRequest: true` is load-bearing, not decoration: the method carries no
# #[NoCSRFRequired], and Nextcloud's Request::passesCSRFCheck() short-circuits
# to true on that header (the strict-cookie precondition is satisfied because a
# Basic-auth request carries no session cookie at all). Without the header this
# POST is rejected as a CSRF failure.
IMPORT_URL="${BASE}/index.php/apps/planninq/api/settings/load"
echo "[ci-seed] POST ${IMPORT_URL} (forced import)"

IMPORT_BODY="$(mktemp)"
IMPORT_CODE="$(
	curl -sS -o "$IMPORT_BODY" -w '%{http_code}' \
		-u "${USER_NAME}:${USER_PASS}" \
		-X POST \
		-H 'Content-Type: application/json' \
		-H 'OCS-APIRequest: true' \
		--data '{}' \
		"$IMPORT_URL" || echo 000
)"

echo "[ci-seed] settings#load HTTP ${IMPORT_CODE}"
head -c 2000 "$IMPORT_BODY"; echo

# HTTP 200 is necessary but NOT sufficient: SettingsController::load() returns
# `{"success": false, "message": "..."}` with a 200 when the import itself
# failed. Treat anything that is not an explicit success as a reason to try the
# generic importer below, and let the verification step decide the outcome.
IMPORT_OK=0
if [ "$IMPORT_CODE" = "200" ] && grep -q '"success":[[:space:]]*true' "$IMPORT_BODY"; then
	IMPORT_OK=1
	echo "[ci-seed] planninq settings#load reported success."
else
	echo "[ci-seed] planninq settings#load did not report success; falling back to the OpenRegister importer."
fi

# ── 1b. Fallback: OpenRegister's generic configuration importer ──────────────
# Independent of planninq's own controller wiring, so it still provisions the
# register if `settings#load` is unavailable (e.g. an OpenRegister build whose
# AppHost route table predates `settings#load`) or if the planninq SettingsService
# rejects the file. Admin-only. It reads the upload under the literal form key
# `file`; a raw JSON request body is NOT one of its accepted shapes. `force` is
# compared `=== 'true' || === true` here, so the form-encoded string is fine.
if [ "$IMPORT_OK" != "1" ]; then
	REGISTER_JSON="${APP_DIR}/lib/Settings/planninq_register.json"
	if [ ! -f "$REGISTER_JSON" ]; then
		echo "::error::planninq_register.json not found at ${REGISTER_JSON}."
		exit 1
	fi

	OR_URL="${BASE}/index.php/apps/openregister/api/configurations/import"
	echo "[ci-seed] POST ${OR_URL} (file=planninq_register.json, force=true)"
	OR_BODY="$(mktemp)"
	OR_CODE="$(
		curl -sS -o "$OR_BODY" -w '%{http_code}' \
			-u "${USER_NAME}:${USER_PASS}" \
			-X POST \
			-H 'OCS-APIRequest: true' \
			-F "file=@${REGISTER_JSON}" \
			-F 'force=true' \
			-F 'appId=planninq' \
			"$OR_URL" || echo 000
	)"
	echo "[ci-seed] configurations/import HTTP ${OR_CODE}"
	head -c 2000 "$OR_BODY"; echo
fi

# ── 2. Verify the register and schemas are actually there ────────────────────
# An import reporting success is not the same as the register existing. Verify
# against OpenRegister directly, using the same slugs the e2e fixtures resolve
# by (tests/e2e/fixtures/seed.ts builds its object URLs as
# /apps/openregister/api/objects/planninq/<schema>).
#
# The HTTP status is captured and checked separately from the payload on
# purpose: an endpoint that 404s or redirects to the login form yields an empty
# slug set, which is indistinguishable from "the import produced nothing" if
# you only look at the parsed list. A wrong lookup manufactures an absence for
# free, so the two are reported as different errors.
verify() {
	python3 - "$1" "$2" "$3" <<'PY'
import json, sys
path, kind, code = sys.argv[1], sys.argv[2], sys.argv[3]
required = {
    'registers': ['planninq'],
    # `plannedTimeEntry`, not `timeEntry`: #575 renamed the slug because three
    # apps declared one and a schema slug is global per organisation. This
    # list is the ninth hiding place a slug rename has, and the one that
    # kills the whole suite: the seed exits before Playwright starts, so
    # every spec is reported as not run rather than as failing.
    'schemas': ['task', 'project', 'column', 'label', 'plannedTimeEntry', 'dependency'],
}[kind]
with open(path) as fh:
    raw = fh.read()
if code != '200':
    print(f'::error::OpenRegister {kind} endpoint returned HTTP {code}, so the '
          f'slug list below proves nothing about the import. First 500 bytes:')
    print(raw[:500])
    sys.exit(1)
try:
    body = json.loads(raw)
except json.JSONDecodeError:
    print(f'::error::{kind} endpoint did not return JSON (HTTP 200). First 500 bytes:')
    print(raw[:500])
    sys.exit(1)
items = body if isinstance(body, list) else body.get('results', [])
slugs = {i.get('slug') for i in items if isinstance(i, dict)}

# A PAGE IS NOT THE POPULATION. `total` is what the instance holds; `items` is
# what this request returned. On a shared instance carrying several apps those
# differ wildly, and a slug that simply fell off the page reads exactly like a
# slug the import never created — with an error message that blames the import.
# Refuse to judge rather than report a false absence.
total = None
if isinstance(body, dict):
    for _k in ('total', 'count'):
        if isinstance(body.get(_k), int):
            total = body[_k]
            break
if total is not None and total > len(items):
    print(f'::error::{kind} listing is TRUNCATED: {len(items)} of {total} returned.')
    print('::error::Raise the _limit on this request. A missing slug cannot be '
          'distinguished from one that fell off the page, so this check is '
          'refusing to report either.')
    sys.exit(1)
missing = [s for s in required if s not in slugs]
print(f'[ci-seed] {kind} present: {sorted(s for s in slugs if s)}')
if missing:
    print(f'::error::Planninq {kind} missing after import: {missing}')
    print('::error::The e2e suite cannot seed a project, columns, tasks or labels without them.')
    sys.exit(1)
print(f'[ci-seed] {kind} OK ({len(required)} required slugs present)')
PY
}

REG_BODY="$(mktemp)"
REG_CODE="$(curl -sS -u "${USER_NAME}:${USER_PASS}" -H 'OCS-APIRequest: true' \
	-o "$REG_BODY" -w '%{http_code}' \
	"${BASE}/index.php/apps/openregister/api/registers?_limit=2000" || echo 000)"
verify "$REG_BODY" registers "$REG_CODE"

SCH_BODY="$(mktemp)"
SCH_CODE="$(curl -sS -u "${USER_NAME}:${USER_PASS}" -H 'OCS-APIRequest: true' \
	-o "$SCH_BODY" -w '%{http_code}' \
	"${BASE}/index.php/apps/openregister/api/schemas?_limit=10000" || echo 000)"
verify "$SCH_BODY" schemas "$SCH_CODE"

# The register existing is still not the same as it being WRITABLE by the admin
# session the fixtures use. `fixtures/seed.ts` probes exactly this URL and
# silently returns false ("Planninq register not reachable") on a 4xx, after which
# every UI spec fails on an empty board. Probe it here so that failure mode has
# a name.
OBJ_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
	-u "${USER_NAME}:${USER_PASS}" -H 'OCS-APIRequest: true' \
	"${BASE}/index.php/apps/openregister/api/objects/planninq/project?_limit=1" || echo 000)"
echo "[ci-seed] objects/planninq/project probe -> ${OBJ_CODE}"
if [ "$OBJ_CODE" -ge 400 ] 2>/dev/null; then
	echo "::error::The Planninq project collection is not readable (HTTP ${OBJ_CODE})."
	echo "::error::tests/e2e/fixtures/seed.ts treats this as 'app not installed' and seeds nothing."
	exit 1
fi

echo "[ci-seed] Planninq register + schemas provisioned."

# ── 2b. Make the admin a returning user ─────────────────────────
# 🔴 OR THE SUPPORT DIALOG SWALLOWS EVERY CLICK.
#
# nc-vue opens the support dialog on first visit and records that the user has
# seen it in a per-user preference. Playwright starts from a fresh browser
# profile, but this preference lives on the SERVER, so writing it once here
# makes every context a returning user.
#
# Without it the dialog mounts as a full modal mask over the app.
# due-date-reminder-settings.spec.ts failed exactly this way: the call log
# reads "element is visible, enabled and stable" for the Settings button and
# then names a role=dialog with data-testid-modal="cn-support-dialog" as the
# subtree intercepting pointer events. The element was found; the click never
# landed, and the test timed out accusing the settings dialog.
#
# buildiq's seed does the same thing for the same reason.
set_pref() {
	# $1 = preference key, $2 = value
	code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 120 \
		-u "${USER_NAME}:${USER_PASS}" \
		-X PUT \
		-H 'Content-Type: application/json' \
		-H 'OCS-APIRequest: true' \
		--data "{\"value\":\"$2\"}" \
		"${BASE}/index.php/apps/planninq/api/preferences/$1" || echo 000)"
	echo "[ci-seed] preference $1=$2 -> HTTP ${code}"
	if [ "$code" != "200" ]; then
		echo "::warning::Could not set the '$1' preference (HTTP ${code}) — the first-visit overlay will re-open in every test and swallow clicks."
	fi
}

set_pref 'support-dialog-seen' '1'

# ── 3. Warm the SPA so the first spec doesn't pay the cold start ─────────────
# The shared workflow serves Nextcloud with `php -S 0.0.0.0:8080`. It now sets
# PHP_CLI_SERVER_WORKERS=8, but the first hit still pays a cold opcache and the
# first parse of a multi-megabyte webpack bundle, and that cost lands entirely
# on whichever spec happens to run first. Warming it here puts that cost in the
# environment-preparation step where it belongs, rather than inside an assertion
# timeout that would then have to keep drifting upward.
#
# Failures are ignored on purpose: this is a warm-up, not a gate. The real
# checks are above and below.
for path in \
	"/index.php/apps/planninq/" \
	"/index.php/apps/planninq/api/settings" \
	"/index.php/settings/admin/planninq" \
	"/index.php/apps/openregister/api/registers?_limit=2000"
do
	code="$(curl -sS -o /dev/null -w '%{http_code}' -u "${USER_NAME}:${USER_PASS}" \
		-H 'OCS-APIRequest: true' "${BASE}${path}" || echo 000)"
	echo "[ci-seed] warm ${path} -> ${code}"
done

if [ "$SEED_MODE" = "api" ]; then
	echo "[ci-seed] api mode: skipping the SPA bundle warm-up and gate — the Newman"
	echo "[ci-seed] suite is HTTP-only and its job never builds the frontend."
	echo "[ci-seed] done."
	exit 0
fi

# Pull the main webpack bundle once so it is in the page cache.
#
# Do NOT hardcode the URL. Nextcloud serves an app's assets from whichever apps
# directory it was installed into — `/apps/planninq/js/…` on the CI runner,
# `/custom_apps/planninq/js/…` in the docker dev images — and asking for the wrong
# one does not 404. It returns **HTTP 200 with `text/html`**: the NC error page,
# served through index.php. A status-code check therefore reports success while
# fetching a 40 KB HTML page instead of a multi-MB bundle, so the warm-up
# silently warms nothing.
#
# Read the real src out of the rendered app page instead, and verify the
# response is actually JavaScript.
APP_HTML="$(mktemp)"
curl -sS -u "${USER_NAME}:${USER_PASS}" -H 'OCS-APIRequest: true' \
	"${BASE}/index.php/apps/planninq/" -o "$APP_HTML" || true

# `|| true` is load-bearing: grep exits 1 when it matches nothing, and under
# `set -euo pipefail` that aborts the script right here — so the case the gate
# below exists to explain (no bundle) would die with a bare non-zero exit and
# none of the diagnosis. Let it fall through to the gate instead.
BUNDLE_SRC="$(grep -oE 'src="[^"]*planninq-main[^"]*"' "$APP_HTML" \
	| head -1 | sed 's/^src="//; s/"$//' || true)"

if [ -n "$BUNDLE_SRC" ]; then
	BUNDLE_INFO="$(curl -sS -o /dev/null \
		-w '%{http_code} %{content_type} %{size_download}' \
		-u "${USER_NAME}:${USER_PASS}" "${BASE}${BUNDLE_SRC}" || echo '000 - 0')"
	echo "[ci-seed] warm bundle ${BUNDLE_SRC} -> ${BUNDLE_INFO}"
else
	echo "[ci-seed] could not locate the bundle src in the rendered app page."
	BUNDLE_INFO=""
fi

# On CI this is a GATE, not a warm-up.
#
# The single most likely way this job "succeeds" dishonestly is by passing
# without ever loading the app — and the environment hides it well: when the
# bundle is absent, Nextcloud does not 404. It serves its HTML error page with
# **HTTP 200 and Content-Type text/html**, so `npm run build` producing nothing
# looks, to every status-code check in the pipeline, exactly like success.
#
# Note that this gate reads the SERVED response, not the file on disk, and it
# is placed at the very end so that a run which reaches the specs has provably
# been able to fetch real JavaScript for the SPA.
if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then
	case "$BUNDLE_INFO" in
		*javascript*)
			echo "[ci-seed] bundle verified as JavaScript."
			;;
		*)
			echo "::error::The Planninq frontend bundle did not serve as JavaScript (got: ${BUNDLE_INFO:-<not found>})."
			echo "::error::The SPA cannot mount, so every UI spec would fail on a selector timeout with a misleading cause."
			echo "::error::Check the 'Build app frontend' step — a missing bundle returns HTTP 200 text/html, not 404."
			exit 1
			;;
	esac
fi

echo "[ci-seed] done."

# ── Settle the demo-data decision ────────────────────────────────────────────
# 🔴 OR THE SETUP WIZARD MASKS EVERY CLICK. ADR-111 added an OPTIONAL
# `demo-data` step, and CnAppRoot opens the non-gating wizard as a full modal
# mask while ANY optional step that is not info/summary is reported not-done —
# in every fresh browser context, so once per spec.
#
# Measured on this app's development at the ADR-111 merge: clicks failed with
# "locator resolved to <button ...> - attempting click action", the call log
# naming <ol class="cn-wizard-dialog__progress"> as the interceptor. The element
# was found; the click never landed.
#
# SKIPPED, not installed: recording the decision is what closes the wizard.
# Installing would push the app's whole demo dataset into every list the suite
# asserts on. `demo-data-setup-step.spec.ts` exercises the install deliberately.
#
# Uses the workflow's own exported credentials rather than this script's, so it
# does not depend on where in the file it sits.
#
# Tolerant on purpose: an app whose wizard has no demo-data step answers 400
# here, and that is not a seeding failure.
DEMO_BASE="${BASE_URL:-${NEXTCLOUD_URL:-http://localhost:8080}}"
DEMO_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 300 \
	-u "${ADMIN_USER:-admin}:${ADMIN_PASSWORD:-admin}" -X POST \
	-H 'Content-Type: application/json' -H 'OCS-APIRequest: true' --data '{}' \
	"${DEMO_BASE}/index.php/apps/planninq/api/setup/action/skip-demo-data" || echo 000)"
echo "[ci-seed] POST setup/action/skip-demo-data -> HTTP ${DEMO_CODE}"
