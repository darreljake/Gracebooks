# GraceBooks Enhancement Phase Plan

## Standing Notes

- Do not change `financial-overview.html` real-time listeners unless explicitly approved.
- Keep unrelated logic and design untouched when implementing enhancements.
- Prefer one-time Firestore fetches for new report features to avoid continuous read costs.
- Deploy command used: `cmd /c firebase deploy --only hosting --project gracebooks-7eebc`.
- Treat all upload fields as security boundaries. Receipts, project proofs, and signatures must use allowlisted file types, size limits, role checks, audit logs, and non-public storage access.

## Phase 1 - Quick Wins and Fixes

Status: Done, except Financial Overview listener conversion is intentionally skipped.

- Income log excludes financial overview transfers.
- Tithe entry Member ID defaults to numeric keyboard.
- Tithe entry reduced scrolling:
  - Desktop/tablet split layout.
  - Entry card remains visible.
  - Draft list scrolls separately.
  - After adding to draft, focus returns to Member Code / First Name / Amount as appropriate.
- Reports weekly tithers total row added.
- Reports and print report use latest member names where `memberId` is available, plus best-effort legacy name matching.
- Print report full-screen mode with zoom and close.
- Print report expense category hierarchy cleaned:
  - Main category remains.
  - Subcategory remains.
  - Detail rows remove repeated subcategory text.
  - Utilities `with fee` note stays beside the subcategory line.
  - Particulars are darker; subcategory totals are stronger than detail amounts.
- Firestore listeners converted to one-time fetch in approved pages.

## Phase 2 - Existing HTML Enhancements

### Done

- Reports analytics KPI section:
  - Original visible cards remain: Total Income, Total Expenses, Net Balance.
  - Extra KPI cards are hidden behind `Show other KPI Cards`.
  - Extra cards include:
    - Total Tithes
    - Loose Offering
    - Tithe Participants
    - Average Tithe per Tither
    - Expense Ratio
    - Month-over-Month / Quarter-over-Quarter / Year-on-Year Net Change
    - Ministry Spending Ratio
    - YTD Net
- Budget vs Actual:
  - Budget Utilization KPI added in `budget-vs-actual.html`.
- Expenses receipt/voucher upload per transaction.
- Expenses camera capture for receipt/voucher photos.
- Expenses receipt viewer, receipt removal, receipt replacement during edit, and expense edit/delete controls.
- Expenses audit-log writes for create, update, delete, and receipt removal actions.
- Reports attendance, collection, tithe participation, and participation-rate trend graphs.
- Reports attendance input restricted to Membership Secretary.
- Membership Secretary role now uses a dedicated weekly attendance entry page with member-name selection and cannot see finance/report data.
- Membership Secretary can access and maintain the member database.
  - Fix: `index.html` dashboard menu for the Membership Secretary role was missing the "Members" link (only "Weekly Attendance" was listed), even though `firestore.rules` already granted this role full read/create/update/delete on `members`. Added the menu entry so the role can actually reach `members.html`.
- Reports church obligations section with input mechanism.
- Reports church obligation input restricted to Treasurer.
- Firestore role rules for income, expenses, members, attendance, church obligations, budgets, settings, and audit logs.
- Membership Secretary role and dashboard entry.
- Print report financial overview accounts section.
- Print report church obligations section.
- Print report receipts and disbursements summary with surplus/deficit indicator.

### Important Definitions

- NOW ministries for Ministry Spending Ratio:
  - Nurture
  - Outreach
  - Witness
- Tithe Participation Rate:
  - Formula: `unique tithers / attendance * 100`
  - Best implemented together with attendance input and trend graphs.
- Trend graph feature should include:
  - Attendance line
  - Collection line
  - Unique tithers line
  - Tithe participation rate line

### Pending

- None.

## Current Enhancement Blueprint

Status: Done. All implementable sub-items were completed across subsequent phases (Phases 2–7). Two admin cleanup items remain as human/operational tasks:
- Confirm Firebase Auth users in the Firebase Console.
- Remove or secure local credential/import files from daily use.

- Expense document management:
  - Optional receipt/voucher upload and real-time camera capture.
  - Ledger receipt preview/viewer.
  - Replace or remove receipt after saving.
  - Edit or delete expense records with audit-log entries.
- Review and approval:
  - Treasurer reviews the report first.
  - Treasurer submits the report to the Finance Chair and Auditor when ready.
  - Auditor is the only role that performs audit approval.
  - Finance Chair approves Chairperson notes and Pastor notes.
  - Pastor can add notes/sign the printed report but does not audit or approve transactions.
  - After Auditor and Finance Chair approve, route the report to all signatories for signatures.
  - Final print report carries approved signatures.
- Role and access:
  - Keep Treasurer as the primary editor for expenses.
  - Add clearer view-only behavior for Pastor, Auditor, District, and Counter accounts. Done for current reports/finance writes.
  - Move toward server-enforced role rules after the workflow is settled. Done — all Firestore collections (income, expenses, members, attendance, churchObligations, reportReviews, notifications, liquidationRequests, specialProjects/Entries/Costs, auditLogs, budgets, settings, userProfiles, userSignatures) now have explicit role-gated rules with a catch-all deny.
- Admin cleanup:
  - Confirm Firebase Auth users. (Human task — requires Firebase Console access.)
  - Remove local credential/import files from daily use or move them to secure storage. (Human/operational task.)

## Phase 3 - New HTML: Liquidation and Reimbursements

Status: Done.

- Create `liquidation-reimbursements.html`. Done as initial staff request + Treasurer review page.
- Cash advance assignment: Done — Treasurer has an "Assign Cash Advance" card that lists Pastor/Deaconess/Admin Assistant profiles (new Treasurer read access on `userProfiles`) and creates a pre-approved `liquidationRequests` doc on the staff member's behalf (`assignedBy`/`assignedAt`), ready for release with no receipts required up front. The Assign form now also has its own **Source of Fund** dropdown (`presetFund`, defaults to Cash on Hand) — no cash moves yet at this step, but the fund choice is visible immediately and carries over to pre-fill the Release Payment modal's fund selector later.
- Request types clarified: staff now choose **Cash Advance** (no receipts yet, liquidate later) or **Reimbursement** (already paid out of pocket, receipts attached at submission, supports multiple files). Legacy `Liquidation`-typed docs are treated as cash advances.
- Staff liquidation flow: Done — owners of a Released cash advance get a "Submit Liquidation" modal (itemized date/description/amount lines, multiple receipt uploads to `liquidation-receipts/{requestId}/`, running released-vs-spent balance) which sets status `Liquidation Submitted`; the Treasurer then reviews and reconciles (reconcile modal now shows the liquidation balance). Firestore rules allow owner updates only for the constrained transitions Submitted→Submitted/Cancelled and Released→Liquidation Submitted (amount/type immutable).
- Release semantics: cash advances stay `Released` until liquidated/reconciled; reimbursements move straight to `Completed` on release. Owners can cancel their own request while it is still `Submitted`.
- Overview summary boxes (pending review, outstanding advances, awaiting reconciliation, completed) plus a shared request details modal (items, receipts, balances, reconciliation notes) for staff, Treasurer, and Auditor visibility.
- Status-change notifications: submissions/approvals/releases/liquidations/reconciliations write role-targeted `notifications` docs picked up by the dashboard bell.
- Handle request, review, approval, release, reconciliation, and receipts. Done — requesters can attach an optional receipt/proof at submission (new `liquidation-receipts/{requestId}/...` Storage path, owner-or-Treasurer write, same image/PDF ≤5MB allowlist as other receipts). Treasurer flow now has explicit per-status actions: Submitted → Approve/Reject, Approved → "Release Payment" (picks a source of fund), Released → "Mark Reconciled" (optional notes). All transitions write `auditLogs` entries.
- Auto-create expense entry after approval where appropriate. Done — implemented at the **Release** step (not Approve), since that's when cash actually leaves the church: confirming release creates a linked `expenses` doc, `linkedLiquidationRequestId`, and stores `linkedExpenseId` back on the request, both audit-logged.
- Fund bucketing bug fix: Done — every expense/income doc this page writes now sets `targetAccId` (and `targetAccount` for income) explicitly to the chosen fund. `financial-overview.html`'s listeners only map `payment` to an account for the literal strings `'Bank Transfer'`/`'Petty Cash'`; without an explicit `targetAccId`, any other fund silently fell back to Cash on Hand. This was in-scope since it directly affects "does releasing a cash advance/reimbursement actually reduce the right fund" — no changes were made to `financial-overview.html` itself, only to the documents this page writes.
- Expense category classification at approval time: Done, closing the gap where every release only ever landed under one generic placeholder category with no way to route it into the church's real budget categories for Reports/Print Report.
  - **Reimbursements** — receipts are already attached at submission, so the Release modal now shows an Expense Category dropdown (built from `budgets/{year}.expense`, same tree as `expenses.html`, plus a "⚠️ Non-Budgeted" fallback bucket) that the Treasurer must pick before releasing; the created expense is classified immediately.
  - **Cash Advances** — still release under a placeholder category (`Non-Budgeted - Staff Cash Advance (Pending Liquidation)`) since no receipts exist yet. Once the staff member submits an itemized liquidation, the reconcile modal ("Review Receipts & Reconcile") lists every item with its own category dropdown; confirming reconciliation deletes the original placeholder expense and writes one classified `expenses` doc per item (audit-logged as `expense_deleted` + `expense_created_from_liquidation_item`).
  - **Balance settlement** — if the liquidated total is less than what was released, an `income` doc (`Cash Advance Return`) is recorded crediting the same fund back for the unspent amount. If the staff member overspent, an overspend now **auto-creates a Reimbursement request** (`type: 'Reimbursement'`, `status: 'Approved'`, `sourceLiquidationRequestId` pointing back at the originating cash advance, `presetCategory`/`presetFund` carried over from what the Treasurer picked during reconciliation) instead of directly writing a paid expense — it still needs an explicit "Release Payment" click before cash moves, same as every other request. `openReleaseModal` pre-fills the fund and category from those preset fields; the "no receipt" warning is skipped for these since receipts live on the source request.
  - Requests store `classifiedExpenseIds`/`returnedIncomeId`/`topupRequestId` for traceability; the details modal shows each item's assigned category, how any balance was settled, and (for auto-created reimbursements) the source request it came from. The requests list tags these rows "Auto (overspend)".
- Staff-suggested category (Treasurer keeps final say): Done — the "Submit Liquidation" itemized table now has a per-item Expense Category dropdown for the requester (same `budgets/{year}` tree, loaded for all signed-in roles, not just Treasurer). It's optional and purely advisory: the value is stored as `item.suggestedCategory`, never written to `expenses` directly (Firestore rules still restrict expense create/update/delete to Treasurer). At reconciliation, the Treasurer's per-item category dropdown is pre-filled from the staff suggestion (with a "Suggested by staff" hint) but remains fully editable before confirming — the Treasurer's selection at that point is what actually gets written to the classified `expenses` docs. The details modal shows the staff's suggested category pre-reconciliation and the Treasurer's final category post-reconciliation.
- Fixed a bug where the "Assign Cash Advance" card never actually became visible for the Treasurer: `.treasurer-only { display: none; }` combined with `el.style.display = ''` (an empty inline style doesn't override a CSS class rule) meant the card stayed hidden regardless of role. Changed to `el.style.display = 'block'`.

## Staff Payroll Access

Status: Done.

- Pastor, Deaconess, and Admin Assistant accounts.
- Staff dashboard entries for payslips and liquidation/reimbursements.
- Initial `payslips.html` reads payroll-generated expense records for the signed-in staff role.
- Company-style payslips: Done — payroll expense rows are now grouped into one payslip per staff per pay period (payrollMonth + payrollWeek), with a printable payslip sheet per period: church letterhead, payslip reference number, employee/position/pay-period/pay-date/fund metadata, itemized Earnings (salary + allowances) and Deductions (Worker's Tithe, SSS/PhilHealth employee share, other), employer contributions (benefit shares) shown separately as non-deducted, net pay in words, and Prepared by / Received by signature lines. List view adds YTD net totals and a staff filter for the Treasurer; a payslip can be printed individually or as a list.
- Downloadable PDF: Done — a "Download PDF" button next to Print on the payslip modal renders the open payslip to an A4 PDF via `html2pdf.js` (CDN), named after the payslip reference number; falls back to a message pointing at Print → Save as PDF if the library hasn't loaded.
- Configurable pay-period merging: Done — a "Pay Period" selector (Weekly / Semi-Monthly / Monthly / Yearly) re-groups each staff member's payroll rows at the chosen granularity, corporate-payroll style. Semi-monthly buckets by day-of-month (1-15 vs 16-31, falling back to payroll week when a row has no date); monthly merges all weeks in a month; yearly merges the whole year and swaps the Month filter for a Year filter. Reference numbers, the Pay Period column, and the printable payslip's period line all adapt to the selected granularity.

## Phase 4 - New HTML: Special Projects and Ministries

Status: Done.

- Treat Special Projects as the next operational priority because past-month project activity needs to be encoded and reported.
- Create `special-projects.html`. Done — project setup, project funding/expense entries, summaries, dashboard access, and Firestore rules.
- Special Projects workflow now includes project CRUD, cost breakdowns, funding sources, linked expenses, receipt/proof uploads, close/reopen, funding draft entries, and push/remove from print report.
- Print report includes a Special Projects report selector for projects pushed from `special-projects.html`.
- Create `connectional-ministries.html`. Done — dedicated management page for the `churchObligations` Firestore collection: year-filtered obligation list, KPI cards (total obligated, settled, balance, progress %), overall progress bar, per-row progress bars, Add/Edit/Delete modals (Treasurer only), separate settlement update modal, and full audit log coverage. Dashboard menu entries added for Treasurer, Pastor, Auditor, District, Finance Chair, Chairperson, and Deaconess.
- Improve Special Projects print report formatting as usage grows. Done — `print-report.html` now shows a dedicated "Project Details" section (type, status with close date, start date, notes) above a renamed "Financial Summary" section; adds a funding-progress percentage row; Estimated vs Actual cost subtotals appear when a project has both; cost detail rows style the Estimated/Actual label in colour-coded bold text.

## Phase 4B - Upload Security Gates

Status: Mostly done. Malware scanning and role-restricted Storage reads are the only remaining items; both need a human decision before they can proceed (see notes below).

- Tighten Firebase Storage rules:
  - Receipts and project proofs: Treasurer-only upload/update/delete. Done — `storage.rules` now gates create/update/delete on `expense-receipts/` and `project-proofs/` with `isTreasurer()` plus file validation; read stays open to any signed-in user so other roles can still view receipts during report review. Do not use `firestore.get()` in Storage rules; it caused receipt uploads to be denied.
  - Signatures: owner-only upload/update/delete.
  - Keep strict file size caps.
  - Keep file type allowlist to images and PDFs only for receipts/proofs, images only for signatures.
  - Prevent silent overwrites where possible; prefer create-only uploads with replacement audit records.
- Add upload audit records: Done — `expenses.html`, `special-projects.html`, and `liquidation-reimbursements.html` upload functions now write a dedicated `receipt_uploaded`, `receipt_replaced`, or `proof_uploaded` `auditLogs` entry immediately after each successful `put()`, capturing uploader UID/role (via writeAuditLog actor fields), file path, original filename, file size, file type, linked docId/collection, and (for replacements) the old receipt path in `before`.
  - Uploader UID, role, timestamp, file path, linked transaction/project, action type, and replacement/removal reason.
- Add safer file handling:
  - Generate server/app-side storage paths instead of trusting original filenames. Done — `expenses.html`, `special-projects.html` (both its expense-receipt and project-proof uploaders), and `liquidation-reimbursements.html` now build the Storage path from a `crypto.randomUUID()`-based token (`Date.now()`+random fallback) plus a sanitized extension only; the original filename is no longer embedded in the path.
  - Store original filename only as display metadata. Done as part of the above — `receiptName`/`proofName` already carried the original filename for display; it's now purely metadata, not part of the path.
  - Do not render uploaded PDFs or files as executable HTML. Done — `expenses.html`'s receipt viewer was the only page still embedding receipt PDFs in-page via `<iframe src="...">`; it now shows an "Open PDF in New Tab" link instead, matching the existing link-out pattern already used by `special-projects.html` and `liquidation-reimbursements.html` for their proof/receipt files. Image previews are unchanged.
- Add malware/content validation later:
  - Cloud Function triggered after upload.
  - Inspect actual file signature/magic bytes, not only filename or browser MIME type.
  - Mark uploads as `pending_scan`, `safe`, or `blocked`.
  - Quarantine/delete blocked uploads and show clear UI status.
  - **Decision needed**: this requires provisioning a Cloud Function in Firebase (a separate infrastructure step outside the static-hosting repo). Choose whether to use Firebase Extensions (e.g. Scan Files with VirusTotal), a custom Cloud Function, or defer indefinitely.
- Review download exposure:
  - Avoid public file access. Done — all Storage paths already require `signedIn()` for reads; no unauthenticated access is possible.
  - Restrict reads to authenticated authorized roles. **Decision needed**: roles are not stored in Firebase Auth custom claims (they live in Firestore `userProfiles`), so role-gating Storage reads requires a `firestore.get()` call inside Storage rules. This is explicitly avoided for `expense-receipts/` and `project-proofs/` because a prior attempt caused receipt uploads to be denied (see note above). Options: (a) add role info to Firebase Auth custom claims so Storage rules can check `request.auth.token.role` without a Firestore lookup — requires a Cloud Function to set claims on user creation/role change; (b) carefully test whether `firestore.get()` is safe for read-only Storage rules on these paths (lower risk than for writes, but untested); (c) defer until short-lived signed URLs are implemented. Without a decision here, reads remain open to any signed-in user, which is low-risk given all pages already enforce role checks client-side and no unauthenticated access is possible.
  - Consider short-lived access URLs later for sensitive proofs. Deferred.

## Phase 5 - Report Review, Audit Approval, and Signature Workflow

Status: Done.

- Report workflow:
  - Treasurer reviews the generated report. Done — `report-workflow.html`.
  - Treasurer submits the report to the Auditor. Done — `treasurerSubmit()` action with electronic or manual signing, writes to `reportReviews`.
  - Auditor audits and approves, then routes to Finance Chair, or returns to Treasurer. Done — `auditorApprove()` / `returnToTreasurer()`.
  - Finance Chair approves and routes to Chairperson, or returns to Treasurer. Done — `financeApprove()` / `returnToTreasurer()`.
  - Pastor affixes signature to finalize. Done — `pastorSign()` sets status to `finalized`.
- Signatories on the printed report:
  - Chairperson, Finance Chair, Treasurer, Auditor, Pastor. Done — `print-report.html` loads `workflowSignatures` from `reportReviews` and renders each party's electronic signature image (if signed electronically) or an empty line (for manual or pending).
- Signature chain: Done — each step in `report-workflow.html` stores `signatures[key]` (name, role, uid, mode, signatureUrl, signedAt); re-routing clears downstream signatures via `removeSignaturesAfter()`; the print report only renders signature images for completed electronic signatures.

### Next Enhancements

- Notifications:
  - In-app notifications: Done. `report-workflow.html` calls `writeNotification()` after each `saveTransition()` to write a doc to the new `notifications` Firestore collection (recipientRole, message, reportId, periodLabel, transition, actorName, actorRole, createdAt). `index.html` dashboard shows a bell icon in the topbar with a red badge count for unread notifications; clicking opens a dropdown listing recent notifications. "Unread" is tracked via `localStorage` per role (no Firestore write needed). Firestore rules allow any signed-in user to read/create notifications; updates and deletes are denied.
  - Email notifications: Needs a human decision on which email/notification provider to use (Firebase Extensions, SendGrid, etc.). Not implemented. **Decision needed: choose a notification provider before implementation can proceed.**
- Finalized report locking: Done. `report-workflow.html` already had no per-role action available once `status === 'finalized'` (every action button is gated to a specific non-finalized status), so finalized reports were already implicitly locked. Added an explicit Treasurer-only "Reopen Report" action (requires a reason note + confirmation) that resets status back to `draft` so the full approval chain must run again; reopen is logged to both workflow history and `auditLogs` via the existing `saveTransition`/`writeAuditLog` pattern. No Firestore rule change needed — Treasurer already has `update` rights on `reportReviews`.
- Better return notes: Done. `report-workflow.html` shows a prominent latest-return-note banner (who returned it, when, and the note text) whenever a report is in `returned_by_auditor` or `returned_by_finance` status. Return-note history was already visible per entry in the Routing History timeline.

## Phase 6 - Role and Access Enhancements

Status: Done (completed via Phase 2 and subsequent work).

- Membership Secretary role. Done in Phase 2 — dedicated `membership-attendance.html` page, role-gated Firestore rules, dashboard entries.
- Attendance entry access. Done in Phase 2 — restricted to Membership Secretary; Deaconess granted read-only access.
- View-only role restrictions where needed. Done — all mutating actions (expenses, special projects, connectional ministries, budgets, liquidation/reimbursements) are gated to Treasurer via `roleIs('Treasurer')` checks and `.treasurer-only` CSS; Pastor, Auditor, District, Finance Chair, Chairperson, and Counter accounts see read-only views across all financial pages.

## Phase 7 - Security Hardening and Reporting/Budget/Entry Enhancements

Status: Mostly done; App Check enforcement still needs a manual Firebase Console step.

- Security audit findings fixed:
  - XSS: `expenses.html` recurring-expense dropdown rendered `r.particular` via unescaped `innerHTML`. Fixed with the existing `escapeHtml()` helper.
  - Storage rules: see Phase 4B (Treasurer-only create/update/delete on receipts/proofs).
  - Rate limiting / scripted-abuse protection: wired Firebase App Check (reCAPTCHA v3) across every authenticated page and `auth.js`, guarded behind an empty `APP_CHECK_SITE_KEY` placeholder so it stays inactive until configured. **Manual step still needed**: create a reCAPTCHA v3 site key in Firebase Console → Build → App Check, paste it into `auth.js` and the two pages using the modular SDK (`tithe-entry.html`, `members.html`), redeploy, confirm verified traffic in the console, then flip Firestore/Storage to "Enforced" mode.
  - No other issues found (no eval/Function, no hardcoded secrets beyond public Firebase config, Firestore rules already role-gated with a default-deny catch-all).
- `reports.html`: added a "Year over Year" tab (5-year income/expense/net comparison chart) and a top-expense-categories chart inside the existing Expense Breakdown tab. Both use the project's existing hand-drawn-SVG convention, no new dependency.
- `budget-vs-actual.html`: expense progress bars now show an amber tier at ≥90% utilization (red stayed at ≥100%); the previously-unused `#alert-exceeded` banner now lists categories near/over budget. Budget Wizard's Preview tab gained a per-category multi-year actual-vs-proposed comparison table (driven by the existing basis-years selector).
- `tithe-entry.html`: member lookup now uses an in-memory cache with name-or-code type-ahead instead of issuing several Firestore reads per keystroke; pledge Target/Payment No. fields are now actually persisted to the draft and the `income` document (previously collected in the UI and silently discarded); the draft card shows a running cash subtotal so Money Counters can start counting denominations before the final review modal.

## Later Phase - Official Membership Database Import

Status: Deferred.

- Replace the current tithe-giver/member-name list with the official Membership Secretary Excel/CSV database.
- Add CSV upload mapping.
- Add duplicate detection.
- Add preview/confirm before import.
- Add rollback-safe audit logging.

## Architecture Review Follow-up

Status: Partially actioned; several items intentionally deferred by explicit decision.

- `ARCHITECTURE-REVIEW.md` added at repo root — a from-scratch whole-repo survey (tech stack, data model, page inventory, connectivity diagrams, ranked findings) written as a handoff for independent review.
- Findings actioned:
  - `income-log.html` was still loading the old namespaced Firebase v8.10.1 SDK while every other page uses v10.7.1 compat. Since it only used namespaced-style calls (`firebase.firestore()`, `.collection().get()`) that compat preserves exactly, swapped the four `<script>` tags to the matching v10.7.1 compat build — no JS logic changes needed.
  - `expenses.html`'s two expense-writing paths (manual single-entry `dbPayload`, batch payroll generator `payrollPayload`) were missing `targetAccId`, the same fund-bucketing gap already fixed in `liquidation-reimbursements.html` — `financial-overview.html`'s account-resolution fallback silently miscategorizes any write without it into Cash on Hand unless `payment` is literally `'Bank Transfer'`/`'Petty Cash'`. Both payloads now set `targetAccId` alongside `payment`.
  - Historical backfill: Done — `audit-log.html` gained a second Treasurer-only maintenance button, "Fix Missing Fund Assignment" (`fixMissingFundAssignment()`), matching the existing "Backfill Existing Records" pattern on the same page. Scans every `expenses` doc, and for any missing `targetAccId` infers it from `payment` (uses `payment` directly if it's already a valid fund id; maps the literal strings `'Bank Transfer'`/`'Petty Cash'` to `cash-bank`/`petty-cash`; otherwise defaults to `cash-hand`, matching the pre-existing fallback for genuinely ambiguous legacy data), writes it, and logs an `expense_fund_assignment_backfilled` audit entry per doc. Idempotent — only touches docs still missing `targetAccId`, safe to re-run. Scoped to `expenses` only; `income` docs' analogous `targetAccount` field was not audited or touched.
  - `special-projects.html` was audited for the same gap and found already correct (`targetAccId: item.sourceAccount` already set on its linked-expense writes) — no change needed.
  - Removed the unused `guardrails` npm script from `package.json` (referenced `scripts/guardrails/check-storage-rules.js`, which never existed in the repo).
  - Deleted `apphosting.yaml` and the root-level `index.html`/`404.html` — confirmed unused Firebase CLI scaffold files (`firebase.json` serves Hosting from `public/`, so these were never actually deployed).
- Findings explicitly deferred by decision (do not "fix" without revisiting this decision first):
  - **`storage.rules` hardcoded-UID Treasurer check** — `expense-receipts`/`project-proofs` gate on `isTreasurer() { return request.auth.uid == 'CrJfm5bwpEhH3DCaKXgMntD0LHI3'; }` instead of role-based `hasRole(['Treasurer'])` used everywhere else (including `liquidation-receipts` in the same file). This predates the liquidation/reimbursement work — not a merge accident. Left as-is because a standing note earlier in this doc records that `firestore.get()` inside Storage rules previously caused receipt uploads to fail outright, which is the likely reason the UID was hardcoded as a workaround in the first place; `liquidation-receipts` proves `hasRole()` works there today, but changing the two most heavily-used receipt paths without testing first risks silently breaking Treasurer receipt uploads. **Consequence of leaving as-is: if the Treasurer's Firebase Auth account is ever recreated or a new Treasurer takes over, receipt upload/replace/delete on `expense-receipts`/`project-proofs` will silently stop working until the hardcoded UID is updated in `storage.rules` and redeployed.**
  - **`churchObligations` duplication** (`reports.html` vs `connectional-ministries.html` both fully implement create/update, the latter also has delete) — explicit decision to keep both as-is for now.
- `review-confirm.html` deleted. It was confirmed dead/unreachable (zero Firestore calls, no auth gate, sessionStorage keys that don't match `tithe-entry.html`'s actual scheme, nothing links to it) — best guess was an abandoned prototype of an intermediate review-before-posting step from before direct-Firestore-write forms existed.

## Liquidation Fixes: Return for Correction, Camera Capture, Attachment Reliability

Status: Done. Triggered by a live incident — a Deaconess submitted an incomplete liquidation with no way for the Treasurer to send it back, and reported that her receipt attachment "could not be attached."

- **Return for Correction (new)**: Treasurer now has a "Return for Correction" action on any `Liquidation Submitted` request, alongside "Review & Reconcile" (`openReturnModal`/`confirmReturn`). Requires a reason note. Sets status back to `Released` (no Firestore rules change needed — Treasurer already has unrestricted `update` rights) and stores `liquidationReturnedNotes`/`liquidationReturnedBy`/`liquidationReturnedAt`, audit-logged as `liquidation_returned_for_correction`, with a role-targeted notification to the requester.
  - `openLiquidationModal` now shows the return reason prominently and **pre-fills her previous itemized entries** (`row.liquidationItems`) instead of starting blank, so she only has to fix what was wrong rather than redo the whole thing.
  - On resubmission, `submitLiquidation` clears the `liquidationReturnedNotes`/`By`/`At` fields (`FieldValue.delete()`) since the pending notice has been addressed — the permanent record stays in `auditLogs`.
  - Details modal shows return history (reason, who, when) whenever present.
  - New `audit-log.html` filter/label entry for `liquidation_returned_for_correction`.
- **Camera capture for liquidation receipts (new)**: added a "📷 Take Photo" button to the Submit Liquidation modal, matching `expenses.html`'s existing camera pattern (`getUserMedia` → `<video>` preview → canvas capture → JPEG blob), but **additive** rather than replacing the file list — each capture appends to the existing attached files via a rebuilt `DataTransfer`, so multiple receipts can be photographed in one session without reopening the camera each time (`openLiqCameraModal`/`captureLiqReceiptPhoto`/`closeLiqCameraModal`).
- **Visible attachment list (new)**: the file input now has a live preview list underneath (`renderLiqReceiptsPreview`) showing each attached file's name and size with a per-file Remove button, so staff get visible confirmation a file actually attached — the input previously gave zero feedback beyond a static hint line, which was likely contributing to "my attachment didn't work" reports even when nothing was actually broken.
- **Likely root cause of the reported attachment failure, fixed**: `validateReceiptFile()` previously rejected any file whose `type` wasn't exactly `image/*` or `application/pdf`. Camera-captured photos on some mobile browsers (notably iOS HEIC photos) report an empty or unrecognized MIME type, which this silently rejected with no useful error. Now falls back to checking the file extension when `type` is empty, before rejecting. This is the shared validation function used by both the initial request form (`#req-receipt`) and the liquidation submission form (`#liq-receipts`), so the fix covers both attachment surfaces.

## Follow-up: Real Upload Failure Found and Fixed, Plus Delete Requests

Status: Done. The camera/preview/validation work above shipped first attempt; the very next real-world try by a Deaconess still failed with two separate errors, both now root-caused and fixed.

- **The actual cause of "attachment cannot be attached": `storage/unauthorized` on every non-Treasurer upload.** `storage.rules`' `liquidation-receipts` match block checked ownership via `isLiquidationRequestOwner(requestId)`, which called `firestore.get()` against the `liquidationRequests` doc — the exact same `firestore.get()`-in-Storage-rules pattern already documented elsewhere in this file as having previously broken receipt uploads. It had never been exercised by an actual owner-upload until now (Treasurer testing never triggers the owner-check branch). Fixed by removing `firestore.get()` from this rule entirely, matching the already-proven pattern used by `signatures/{uid}/...` and the hardcoded-UID `expense-receipts`/`project-proofs`: the path is now `liquidation-receipts/{requestId}/{uid}/{fileName}` (uid embedded in the path itself, checked via `request.auth.uid == uid`, no Firestore lookup). `role()`/`hasRole()` are now unused and removed from `storage.rules` entirely — every path in the file uses either the hardcoded-UID `isTreasurer()` or a path-embedded uid, no `firestore.get()` anywhere. `uploadReceiptForRequest()` in `liquidation-reimbursements.html` updated to build the new path (always the current user's own uid — this function is only ever called by a request's own owner). This is a genuine fix to something actively broken, not a change to the earlier deliberately-deferred `expense-receipts`/`project-proofs` hardcoded-UID decision (that one still stands, unchanged, because it's currently working).
- **Second error, a real bug introduced by the "Return for Correction" feature**: `submitLiquidation()` clears `liquidationReturnedNotes`/`By`/`At` via `firebase.firestore.FieldValue.delete()` when resubmitting, which is valid for the `.set(after, {merge:true})` write to `liquidationRequests` — but the same `after` object was also being spread directly into `writeAuditLog()`'s `afterData` parameter, which writes via `.add()` (a create, not a merge-set). `FieldValue.delete()` sentinels are invalid outside a merge-set/update, so the audit log write failed with "FieldValue.delete() cannot be used with set() unless you pass {merge:true}" every time someone resubmitted a returned liquidation. Fixed by building a separate plain-value snapshot (`auditAfter`, with the three fields set to `null` instead of the delete sentinel) for the audit log call, while the actual Firestore write keeps using the sentinel correctly.
- **New: Delete Request (Treasurer-only)**. Every request row now has a "Delete" button for the Treasurer, for cleaning up erroneous submissions (duplicates, mistakes, test entries). Deleting only removes the `liquidationRequests` tracking/workflow document — it never touches `expenses`/`income` docs already created from a release or reconciliation, so the books stay accurate regardless of when it's deleted. The confirmation dialog explicitly warns when a request already has linked financial records (`linkedExpenseId`/`classifiedExpenseIds`/`returnedIncomeId`/`topupRequestId`) so it isn't mistaken for "this undoes the payment" — those must be corrected separately on the Expenses page if truly erroneous. No Firestore rules change needed (`allow delete: if hasRole(['Treasurer'])` already existed; this was purely a missing UI feature). New `liquidation_request_deleted` audit-log filter/label entry added to match.
- **Third bug, found right after: liquidation-created expenses never appeared in `expenses.html`'s ledger at all.** `expenses.html` queries `db.collection('expenses').orderBy('postedAt', 'desc')` — Firestore's `orderBy` silently excludes any document that doesn't have that field, rather than erroring. Both expense-writing payloads in `liquidation-reimbursements.html` (the release-time placeholder in `confirmRelease()`, and the reconciled/classified per-item entries in `confirmReconcile()`) set `createdAt`/`updatedAt` but never `postedAt`, so every cash-advance and reimbursement expense this page ever created was invisible in the Expenses ledger — even though it correctly showed up in `financial-overview.html` (which does a plain `.get()` with no `orderBy`) and in Reports/Print Report. Fixed by adding `postedAt: now` to both payloads, matching the field `expenses.html` itself already sets on every manual/payroll entry. Audited `special-projects.html`'s own expense-writing payload for the same gap — already sets `postedAt` correctly, no change needed there.
  - Historical backfill: Done — `audit-log.html` gained a third Treasurer-only maintenance button, "Fix Missing Ledger Entries" (`fixMissingLedgerVisibility()`), same pattern as the other two backfill tools on the same page. Scans every `expenses` doc missing `postedAt` and fills it in from `createdAt` (falling back to `date`, then now), so pre-existing liquidation/reimbursement expenses become visible in the ledger without altering their actual amounts, categories, or fund. Idempotent, audit-logged per doc as `expense_ledger_visibility_backfilled`, safe to re-run.
