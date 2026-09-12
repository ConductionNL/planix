<?php

declare(strict_types=1);

// AppHost canonical route table (ADR-040): dashboard#page + #catchAll, the
// settings#index/create/load API, the per-user preferences#* endpoints, and the
// observability metrics#index / health#index routes are all provided by
// \OCA\OpenRegister\AppHost\Routes::standard(). Planninq's domain routes are
// appended as $extra (inserted before the SPA catch-all so they keep priority).
return \OCA\OpenRegister\AppHost\Routes::standard([
    // Per-user notification settings — planninq-specific, NOT in the canonical set.
    // First-time setup wizard (ADR-042) - the standard CnSetupWizard contract.
    ['name' => 'setup#status',    'url' => '/api/setup/status',            'verb' => 'GET'],
    ['name' => 'setup#runAction', 'url' => '/api/setup/action/{actionId}', 'verb' => 'POST', 'requirements' => ['actionId' => '[a-z0-9\\-]+']],
    ['name' => 'setup#saveConfig', 'url' => '/api/setup/config',           'verb' => 'POST'],
    ['name' => 'settings#updateUser', 'url' => '/api/settings/user', 'verb' => 'POST'],

    // Project creation policy check — enforces allow_project_creation server-side.
    ['name' => 'project#checkCreatePolicy', 'url' => '/api/projects/check-create-policy', 'verb' => 'GET'],
    // Project create proxy — C1: enforces policy then calls OR ObjectService server-side.
    ['name' => 'project#create', 'url' => '/api/projects', 'verb' => 'POST'],
    // Leave-project proxy — C3: allows non-owner members to remove themselves (_rbac: false).
    ['name' => 'project#leaveProject', 'url' => '/api/projects/{projectId}/leave', 'verb' => 'POST', 'requirements' => ['projectId' => '[^/]+']],

    // Label management (admin-only) — usage listing + cascade delete.
    // Admin posture enforced by NC SecurityMiddleware (no #[NoAdminRequired]
    // on the controller methods) plus an explicit isCurrentUserAdmin() check.
    ['name' => 'label#index', 'url' => '/api/labels', 'verb' => 'GET'],
    ['name' => 'label#destroy', 'url' => '/api/labels/{id}', 'verb' => 'DELETE', 'requirements' => ['id' => '[^/]+']],

    // Dependency edge create — server-side cycle/self/duplicate/cross-project validation.
    ['name' => 'dependency#create', 'url' => '/api/dependencies', 'verb' => 'POST'],
    // Dependency edge delete — project-member guarded.
    ['name' => 'dependency#destroy', 'url' => '/api/dependencies/{id}', 'verb' => 'DELETE', 'requirements' => ['id' => '[^/]+']],

    // Read-only per-project timeline (Gantt) — RBAC-scoped through OR ObjectService.
    ['name' => 'timeline#forProject', 'url' => '/api/projects/{projectId}/timeline', 'verb' => 'GET', 'requirements' => ['projectId' => '[^/]+']],
]);
