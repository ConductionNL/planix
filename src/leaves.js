// SPDX-License-Identifier: EUPL-1.2
// Copyright (C) 2026 Conduction B.V.
//
// The `planninq-leaves` bundle: this app's OpenRegister leaves, and nothing else.
//
// WHERE THIS RUNS. Not on planninq's own pages — `main.js` already registers
// the leaf there. This entry is what OpenRegister's LeafScriptListener enqueues
// on OTHER apps' pages, so a pipelinq client page can render a client's
// planninq projects without pipelinq reading planninq's register itself.
//
// WHY IT IS A SEPARATE ENTRY. `planninq-main.js` is ~13 MiB and carries the
// whole SPA — router, stores, every view. Loading that on another app's page
// would trade a feature for a performance regression on every page of every
// consuming app. This entry pulls in only the leaf registration and the widget
// it mounts.
//
// KEEP IT THIN. Anything imported here lands on other apps' pages. Import the
// leaf registrations and nothing else: no router, no pinia, no app shell, no
// `./manifest.json`.

import { loadTranslations } from '@nextcloud/l10n'
import { registerProjectsLeaf } from './integrations/registerProjectsLeaf.js'

// Register FIRST, translate second.
//
// The registry entry must exist before the host looks for it, and the host may
// look during the same tick. `loadTranslations` is a fetch, so awaiting it
// before registering would lose the race on a cold cache and the leaf would
// simply not be in the registry when the page asked — rendering nothing, with
// nothing logged. The labels fall back to their English source until the
// catalogue lands, which is the lesser failure and a visible one.
registerProjectsLeaf()

// `loadTranslations` REJECTS on a 404 — any locale for which l10n/<lang>.json
// was never generated — so an unguarded call here would produce an unhandled
// rejection in a page that does not belong to this app.
loadTranslations('planninq').catch(() => {
	// Deliberately silent: this bundle runs inside another app's page, where a
	// console warning about planninq's catalogue is noise the reader cannot act
	// on. The leaf still renders, in English.
})
