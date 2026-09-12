# plannedTimeEntry reads humaniq's hours

## Why

Three apps declare a time-entry schema and a schema slug is global per
organisation, so `SchemaMapper::find()` returns whichever row it reaches first.
humaniq is the agreed owner.

## The owner is ready; this app is not yet moved

humaniq's `TimeEntry` accepted only a CLOCKED interval: `deriveHours()` threw
`De start- of eindtijd van de urenboeking is ongeldig` when `startedAt` or
`endedAt` was absent, and a supplied `hours` was overwritten rather than read.
This app records a `date` and a `duration` and no clock times at all, so the
owner refused the shape it produces.

humaniq#323 fixed that: `TimeEntry` now takes either shape, and a day booking
needs a valid `date` and a positive `hours`. The prerequisite is done.

## The mapping, measured

| this app | humaniq `TimeEntry` |
| --- | --- |
| `date` | `date` |
| `duration` (minutes) | `hours` (÷ 60) |
| `user` | `userId` |
| `description` | `description` |
| `billable` | `billable` |
| `project` (`$ref` project) | `projectId` (plain string, cross-register per ADR-062 rule 7) |
| `task` (`$ref` task) | `domainObjectType: 'task'` + `domainObjectRef` |
| `contractorRef` | **no column** |
| `hourlyRate` | **no column** |

`domainObjectType`/`domainObjectRef` is exactly the polymorphic pair humaniq
already carries for this, so `task` needs no new field on the owner.

## The shape

`timeEntry` becomes `plannedTimeEntry`, carrying only what the owner has no
column for — `contractorRef` and `hourlyRate` — plus a reference to the
humaniq `TimeEntry` that holds the hours. The hours live once.

## The part that is not obvious

**Four dashboard widgets read `duration`, `user` and `date` straight off
`timeEntry`.** Moving those fields to humaniq's register makes all four render
nothing on an instance without humaniq — not read-only, blank, with no
explanation. That is the failure this fleet keeps shipping.

The fix already exists here and this app is on both sides of it: pipelinq reads
planninq's `project` through a `requiredApp` WIDGET, which gate-55 supports and
which HIDES the widget when the backing app is absent instead of rendering an
empty one. The four widgets repoint at humaniq's register and declare
`requiredApp: humaniq`.

## Not started

This records the design and the measurement. No code has moved: the widgets,
the schema split, the stores (`src/store/timeEntries.js`, `src/store/projects.js`)
and the migration of existing rows are the change itself.
