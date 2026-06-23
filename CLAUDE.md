# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GraceBooks is a finance/membership management system for Tagaytay United Methodist Church, built as a static Firebase Hosting site — no build step, no bundler, no npm dependencies. Each page in `public/` is a self-contained HTML file with inline `<style>` and `<script>` blocks. Firebase is loaded via CDN `<script>` tags using the **compat** SDK (v10.7.1), not the modular SDK.

## Commands

There is no build/lint/test tooling in this repo (no `package.json`). Common operations are via the Firebase CLI:

```
firebase deploy --only hosting --project gracebooks-7eebc
firebase deploy --only firestore:rules --project gracebooks-7eebc
firebase deploy --only storage --project gracebooks-7eebc
```

On Windows, deploys are typically run as `cmd /c firebase deploy --only hosting --project gracebooks-7eebc` (per `PHASE-PLAN.md`). The default project is `gracebooks-7eebc` (set in `.firebaserc`).

To preview locally, serve `public/` with any static file server (e.g. `firebase emulators:start --only hosting` or `npx serve public`) — pages assume relative links to siblings in the same directory.

## Architecture

### Page structure
Every feature lives in its own top-level HTML file in `public/` (e.g. `tithe-entry.html`, `expenses.html`, `reports.html`, `print-report.html`). There are no shared JS modules or templates beyond `auth.js` — each page duplicates its own markup, styles, and Firestore logic inline. When fixing a bug or adding a feature, expect to edit a single large HTML file (many are 1,000–2,000+ lines).

`index.html` is the login screen and main dashboard. After login it renders a role-specific menu (the `menus` object keyed by role name) linking to the pages that role is allowed to use. `dashboard.html` is a dead redirect stub back to `index.html`.

### Auth flow (`auth.js`)
Loaded by every authenticated page after the Firebase compat scripts. Provides:
- `requireGraceBooksAuth()` — call once per page; redirects to `index.html` if not signed in, otherwise resolves `window.graceBooksAuthReady` with the user's profile and fires a `gracebooks-auth-ready` DOM event.
- `getGraceBooksProfile(user)` — fetches/caches the `userProfiles/{uid}` Firestore doc (role + name) into `sessionStorage` under `graceBooksUser`.
- `graceBooksLogout()` — signs out and clears `sessionStorage`.

Login uses Firebase Auth email/password with synthetic emails (`username@gracebooks.local` unless an `@` is already typed). Roles are **not** stored in Firebase Auth custom claims — they live in the `userProfiles` Firestore collection and are looked up by UID. Client-side writes to `userProfiles` are denied by Firestore rules; new users/roles must be provisioned via the Firebase Console (see `AUTH-MIGRATION.md`).

### Roles
Defined roles (see `AUTH-MIGRATION.md` and `firestore.rules`): `Treasurer`, `Pastor`, `Finance Chair`, `Chairperson`, `Deaconess`, `Admin Assistant`, `Auditor`, `District`, `Money Counter`, `Membership Secretary`. Treasurer is the primary editor for nearly all financial collections; most other roles are read-only or scoped to a single page (e.g. Membership Secretary only sees attendance/member tools, Money Counter only sees income entry).

### Data model (Firestore, see `firestore.rules`)
Key top-level collections: `userProfiles`, `userSignatures`, `income`, `expenses`, `members`, `attendance`, `churchObligations`, `reportReviews` (report workflow/approval state), `liquidationRequests`, `specialProjects` / `specialProjectEntries` / `specialProjectCosts`, `auditLogs`, `budgets`, `settings`. Access is gated per-collection by role via the `hasRole([...])` helper in rules; there is a catch-all deny at the bottom (`match /{document=**}`).

Rules currently include a `testingAccessOpen()` time-bomb (`request.time < timestamp.date(2027, 1, 1)`) that gates `signedIn()` — after that date all client access fails closed. The same expiry date is mirrored client-side in `index.html` (`TESTING_END_DATE`) to show a pre-expiry warning and block login.

### Audit logging
Mutating flows (expense create/update/delete, receipt removal, payroll generation, etc.) write to the `auditLogs` collection via a local `writeAuditLog(action, docId, beforeData, afterData, summary)` helper duplicated per page (see `expenses.html`). Follow this pattern — capture before/after snapshots and a human-readable summary — when adding new mutating actions. Only `Treasurer`/`Auditor` can read `auditLogs`; any signed-in user can create entries.

### File uploads (Storage rules)
Three upload surfaces, each with its own path prefix and constraints (`storage.rules`):
- `expense-receipts/{expenseId}/{fileName}` and `project-proofs/{entryId}/{fileName}` — images/PDF, ≤5MB.
- `signatures/{uid}/{fileName}` — images only, ≤2MB, owner-only write/delete.

Per `PHASE-PLAN.md` Phase 4B, treat all upload fields as security boundaries: enforce allowlisted file types, size limits, role checks, and audit logs; avoid trusting original filenames or rendering uploaded files as executable HTML.

### Report workflow
`report-workflow.html` implements a multi-step approval chain backed by `reportReviews` docs: Treasurer submits → Auditor + Finance Chair approve → routed to all signatories (Chairperson, Finance Chair, Treasurer, Auditor, Pastor) for signature → `print-report.html` renders the final signed report. Signature images are stored per-user in `userSignatures`/`signatures/{uid}`, not embedded per-report.

### Real-time vs one-time reads
Project convention (see `PHASE-PLAN.md` Standing Notes): prefer one-time Firestore fetches for new features to avoid continuous read costs. `financial-overview.html` is a deliberate exception that still uses real-time listeners — **do not change its listener behavior without explicit approval**, and avoid touching its logic/design when implementing unrelated enhancements.

## Working in this repo

- `PHASE-PLAN.md` is the authoritative running log of completed/in-progress/pending work, organized by phase. Check it before starting work to see current priorities and standing constraints, and update it when phase status changes.
- `AUTH-MIGRATION.md` documents the Auth/Firestore provisioning steps for new role accounts — required reading before changing anything in `userProfiles` access patterns.
- Files matching `AUTH-CREDENTIALS.local.md`, `AUTH-USERS.local.json`, `auth-users-import.json`, `auth-users-existing.json`, `auth-profiles.json` are gitignored local secrets — never commit real credentials here.
- Because there's no shared component layer, a fix that applies to one page (e.g. a date-formatting bug) usually needs to be located and fixed independently in every other page that duplicates similar logic.
