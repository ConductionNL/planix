# project-delivery Specification

## Purpose

Planninq owns the project entity for the whole fleet, including the commercial
dimension of delivery work: which client a project is for, whether it is
billable, what budget was agreed, and which phases it is broken into. Sibling
apps read that through one ADR-066 leaf rather than storing a project of their
own.

This capability absorbs the four-level work breakdown structure pipelinq had
built (`project` → `projectPhase` → `projectTask` → `projectActivity`). Pipelinq
is a CRM; a schema slug is GLOBAL on a shared OpenRegister, so its `project`,
`projectTask` and `projectActivity` resolved against planninq's own `project`,
`task` and `timeEntry` — two definitions of one word, each able to answer for
the other. Planninq keeps the entity because planning work is its subject;
pipelinq keeps the client relationship and reads the rest.

Extends [projects.md](../projects.md), which defines the project container
itself, and [register-schemas](../register-schemas/spec.md), which defines how
these schemas are declared.

## Requirements

### Requirement: A project carries its delivery and billing terms [V1]

The `project` schema MUST carry the client it is delivered for, whether the work
is billable, the agreed budget in hours and in money, a default hourly rate, and
a planned start and end date. All of them MUST be optional: internal work has no
client and no budget, and a project that carries neither MUST behave exactly as
it did before these fields existed.

`client` points at a schema in another app's register, so it MUST carry
`x-external-register` rather than a `$ref` OpenRegister cannot resolve.

Budget fields default to `0`, meaning "no budget was agreed". A zero budget MUST
NOT be rendered as a figure, because `€ 0` reads as a decision somebody made.

#### Scenario: An internal project needs none of it
@e2e exclude Schema shape, asserted by PHPUnit (PlanninqRegisterSchemaTest) against the register descriptor
- GIVEN a project created with only a title
- WHEN it is stored
- THEN it MUST validate
- AND its list entry MUST show neither a budget nor a billable marker

#### Scenario: A client project carries its terms
@e2e exclude Schema shape, asserted by PHPUnit against the register descriptor
- GIVEN a project with a client, `billable: true` and a budget of 56000
- WHEN it is stored
- THEN every one of those values MUST round-trip
- AND its list entry MUST show the billable marker and the formatted budget

### Requirement: A project may be broken into phases [V1]

The register MUST declare a `projectPhase` schema: an ordered delivery stage
within one project, carrying its own status, billable flag and budget in hours.
A `task` MAY name the phase it delivers, and MUST remain valid without one, so a
project that is not phased is unaffected.

Billable is inherited downward and overridable at each level: a task with no
billable value of its own follows its phase, and a phase with none follows its
project.

`projectPhase` reuses the project-membership authorization of the other
project-scoped schemas, because a phase is exactly as sensitive as the project
it belongs to.

#### Scenario: The register declares exactly seven schemas
@e2e exclude Descriptor contents, asserted by PHPUnit (testRegisterDeclaresExactlySevenSchemas)
- GIVEN the planninq register descriptor
- WHEN its schema list is read
- THEN it MUST be exactly task, project, projectPhase, column, timeEntry, label and dependency

#### Scenario: An unphased project still works
@e2e exclude Schema shape, asserted by PHPUnit against the register descriptor
- GIVEN a project with no phases
- WHEN a task is created in it
- THEN the task MUST validate with no `phase`

### Requirement: Time entries record what they are worth [V1]

A `timeEntry` MUST be able to record whether it is billable and at what rate, and
MUST name the project it was booked against as well as the task. The project
reference is denormalised deliberately: OpenRegister's object API filters on
scalar equality, so without it, totalling a project's time means first reading
its tasks.

#### Scenario: Time rolls up per project in one read
@e2e exclude Query shape, asserted by Vitest against the scope helper
- GIVEN time entries booked against tasks in one project
- WHEN the project's time is totalled
- THEN it MUST be readable with a single equality filter on `project`

### Requirement: Both halves of the projects leaf agree [V1]

Planninq MUST publish a `planninq-projects` leaf on OpenRegister's integration
registry in two halves under one shared id: a PHP `LeafDescriptor` contributed
to `RegisterLeafProvidersEvent`, and a JS `registerIntegration()` call supplying
the render surface. The halves MUST agree on label, icon, group,
`referenceType`, `renderMode` and the surfaces list, each written out explicitly
rather than left to a default.

The leaf MUST be `render-surface` only and contribute NO provider (ADR-066
decision 2): it renders and reads, and never invokes a business action in
another app.

A failure while registering MUST cost only this leaf. The leaf catalogue MUST
still be built.

#### Scenario: The descriptor is contributed with no provider
@e2e exclude Registration behaviour, asserted by PHPUnit (RegisterProjectsLeafListenerTest)
- GIVEN OpenRegister dispatches the leaf-provider collect event
- WHEN planninq's listener handles it
- THEN exactly one leaf MUST be contributed
- AND its id MUST be `planninq-projects`
- AND its provider MUST be null
- AND its kinds MUST be exactly `render-surface`

#### Scenario: A registration failure does not take the catalogue down
@e2e exclude Failure path, asserted by PHPUnit with a throwing IL10N
- GIVEN the label cannot be translated
- WHEN the listener handles the event
- THEN it MUST log a warning
- AND MUST contribute no leaf
- AND MUST NOT throw

#### Scenario: The two halves cannot drift apart unnoticed
@e2e exclude Static correlation, asserted by scripts/check-integration-parity.sh (gate-24)
- GIVEN the PHP and JS halves of the leaf
- WHEN the parity checker compares them
- THEN any difference in id, label, icon, group, referenceType, renderMode or surfaces MUST fail

### Requirement: The leaf answers the question its surface asked [V1]

The projects leaf MUST scope what it shows to the surface the host mounted it
into: one named project on `single-entity`, the host client's projects on a
detail page, and active projects on a dashboard.

Scoping MUST use OpenRegister's bare field names. `_filters[field]` and
`filter[field]` are accepted by the object API and silently IGNORED, returning
every row in a response shaped exactly like a filtered one, so the leaf MUST
also re-check every row it received and MUST take its count from what survived
that check rather than from the server's reported total.

A read that fails MUST say so. It MUST NOT render an empty list or a zero, both
of which are indistinguishable from a real answer.

#### Scenario: An ignored filter does not leak another client's projects
@e2e exclude Guard logic, asserted by Vitest (projectScope.spec.js) with an unfiltered response
- GIVEN the API returns projects belonging to several clients
- WHEN the leaf is scoped to one client
- THEN only that client's projects MUST be rendered

#### Scenario: A failed read is reported, not rendered as empty
@e2e exclude Failure path, asserted by Vitest and by the component's error branch
- GIVEN the object API returns an error
- WHEN the leaf loads
- THEN it MUST show an error message
- AND MUST NOT show an empty-state that reads as "no projects"
