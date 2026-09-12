# Tasks

## 0. Prerequisite

- [x] 0.1 humaniq's `TimeEntry` accepts a day booking (humaniq#323). Without it
      the owner refuses the shape this app records.

## 1. The schema

- [ ] 1.1 `timeEntry` -> `plannedTimeEntry`, key AND `slug`, in the register
      descriptor.
- [ ] 1.2 It keeps `contractorRef` and `hourlyRate` — the two the owner has no
      column for — and gains a reference to the humaniq `TimeEntry`.
- [ ] 1.3 `date`, `duration`, `user`, `description`, `billable`, `project` and
      `task` move to the owner. `task` maps onto the existing
      `domainObjectType`/`domainObjectRef` pair rather than a new field.
- [ ] 1.4 A repair step renames the row, scoped to `(application, slug)`. The
      import's not-found branch CREATES a second schema, so a descriptor change
      alone strands every existing row.

## 2. The widgets, which is the part that bites

- [ ] 2.1 The four dashboard widgets reading `duration`/`user`/`date` repoint at
      humaniq's register and declare `requiredApp: humaniq`, so they HIDE when
      humaniq is absent instead of rendering empty. Same pattern pipelinq uses
      to read this app's `project`.

## 3. The stores

- [ ] 3.1 `src/store/timeEntries.js` and `src/store/projects.js` resolve the
      owner's schema for the hours and this app's for the rate.
- [ ] 3.2 Degradation when humaniq is absent, stated rather than discovered.

## 4. The rows

- [ ] 4.1 Migrate existing entries: one humaniq `TimeEntry` per row, one
      `plannedTimeEntry` referencing it, `duration` minutes converted to hours.
- [ ] 4.2 `occ openregister:schemas:prune-retired --app=planninq --slug=timeEntry`
      once the rows are moved. It refuses while the schema still owns objects,
      which is the order it enforces.
