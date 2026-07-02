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

Status: In progress.

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
  - Move toward server-enforced role rules after the workflow is settled. Started for current core collections.
- Admin cleanup:
  - Confirm Firebase Auth users.
  - Remove local credential/import files from daily use or move them to secure storage.
## Phase 3 - New HTML: Liquidation and Reimbursements

Status: Done.

- Create `liquidation-reimbursements.html`. Done as initial staff request + Treasurer review page.
- Cash advance assignment: Done — Treasurer has an "Assign Cash Advance" card that lists Pastor/Deaconess/Admin Assistant profiles (new Treasurer read access on `userProfiles`) and creates a pre-approved `liquidationRequests` doc on the staff member's behalf (`assignedBy`/`assignedAt`), ready for release with no receipts required up front.
- Request types clarified: staff now choose **Cash Advance** (no receipts yet, liquidate later) or **Reimbursement** (already paid out of pocket, receipts attached at submission, supports multiple files). Legacy `Liquidation`-typed docs are treated as cash advances.
- Staff liquidation flow: Done — owners of a Released cash advance get a "Submit Liquidation" modal (itemized date/description/amount lines, multiple receipt uploads to `liquidation-receipts/{requestId}/`, running released-vs-spent balance) which sets status `Liquidation Submitted`; the Treasurer then reviews and reconciles (reconcile modal now shows the liquidation balance). Firestore rules allow owner updates only for the constrained transitions Submitted→Submitted/Cancelled and Released→Liquidation Submitted (amount/type immutable).
- Release semantics: cash advances stay `Released` until liquidated/reconciled; reimbursements move straight to `Completed` on release. Owners can cancel their own request while it is still `Submitted`.
- Overview summary boxes (pending review, outstanding advances, awaiting reconciliation, completed) plus a shared request details modal (items, receipts, balances, reconciliation notes) for staff, Treasurer, and Auditor visibility.
- Status-change notifications: submissions/approvals/releases/liquidations/reconciliations write role-targeted `notifications` docs picked up by the dashboard bell.
- Handle request, review, approval, release, reconciliation, and receipts. Done — requesters can attach an optional receipt/proof at submission (new `liquidation-receipts/{requestId}/...` Storage path, owner-or-Treasurer write, same image/PDF ≤5MB allowlist as other receipts). Treasurer flow now has explicit per-status actions: Submitted → Approve/Reject, Approved → "Release Payment" (picks a source of fund), Released → "Mark Reconciled" (optional notes). All transitions write `auditLogs` entries.
- Auto-create expense entry after approval where appropriate. Done — implemented at the **Release** step (not Approve), since that's when cash actually leaves the church: confirming release creates a linked `expenses` doc (category `Non-Budgeted - Staff Liquidation/Reimbursement`, `linkedLiquidationRequestId`) and stores `linkedExpenseId` back on the request, both audit-logged.

## Staff Payroll Access

Status: Done.

- Pastor, Deaconess, and Admin Assistant accounts.
- Staff dashboard entries for payslips and liquidation/reimbursements.
- Initial `payslips.html` reads payroll-generated expense records for the signed-in staff role.
- Company-style payslips: Done — payroll expense rows are now grouped into one payslip per staff per pay period (payrollMonth + payrollWeek), with a printable payslip sheet per period: church letterhead, payslip reference number, employee/position/pay-period/pay-date/fund metadata, itemized Earnings (salary + allowances) and Deductions (Worker's Tithe, SSS/PhilHealth employee share, other), employer contributions (benefit shares) shown separately as non-deducted, net pay in words, and Prepared by / Received by signature lines. List view adds YTD net totals and a staff filter for the Treasurer; a payslip can be printed individually or as a list.
- Downloadable PDF: Done — a "Download PDF" button next to Print on the payslip modal renders the open payslip to an A4 PDF via `html2pdf.js` (CDN), named after the payslip reference number; falls back to a message pointing at Print → Save as PDF if the library hasn't loaded.
- Configurable pay-period merging: Done — a "Pay Period" selector (Weekly / Semi-Monthly / Monthly / Yearly) re-groups each staff member's payroll rows at the chosen granularity, corporate-payroll style. Semi-monthly buckets by day-of-month (1-15 vs 16-31, falling back to payroll week when a row has no date); monthly merges all weeks in a month; yearly merges the whole year and swaps the Month filter for a Year filter. Reference numbers, the Pay Period column, and the printable payslip's period line all adapt to the selected granularity.

## Phase 4 - New HTML: Special Projects and Ministries

Status: Priority moved up; started as initial Special Projects ledger.

- Treat Special Projects as the next operational priority because past-month project activity needs to be encoded and reported.
- Create `special-projects.html`. Started with project setup, project funding/expense entries, summaries, dashboard access, and Firestore rules.
- Special Projects workflow now includes project CRUD, cost breakdowns, funding sources, linked expenses, receipt/proof uploads, close/reopen, funding draft entries, and push/remove from print report.
- Print report includes a Special Projects report selector for projects pushed from `special-projects.html`.
- Create `connectional-ministries.html`. Done — dedicated management page for the `churchObligations` Firestore collection: year-filtered obligation list, KPI cards (total obligated, settled, balance, progress %), overall progress bar, per-row progress bars, Add/Edit/Delete modals (Treasurer only), separate settlement update modal, and full audit log coverage. Dashboard menu entries added for Treasurer, Pastor, Auditor, District, Finance Chair, Chairperson, and Deaconess.
- Improve Special Projects print report formatting as usage grows.

## Phase 4B - Upload Security Gates

Status: Storage rules tightening started; remaining items not started.

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
- Review download exposure:
  - Avoid public file access.
  - Restrict reads to authenticated authorized roles.
  - Consider short-lived access URLs later for sensitive proofs.

## Phase 5 - Report Review, Audit Approval, and Signature Workflow

Status: Started.

- Report workflow:
  - Treasurer reviews the generated report.
  - Treasurer submits the report to the Finance Chair and Auditor. Started in `report-workflow.html`.
  - Auditor audits and approves the report. Started in `report-workflow.html`.
  - Finance Chair approves Chairperson notes and Pastor notes. Started in `report-workflow.html`.
  - Pastor may add notes and later sign, but does not audit or approve. Started in `report-workflow.html`.
- Signatories on the printed report:
  - Chairperson
  - Finance Chair
  - Treasurer
  - Auditor
  - Pastor
- Signature chain:
  - After Auditor and Finance Chair approve, route the report to all signatories.
  - Attach signatures only after each party signs. Started as workflow records in Firestore.
  - Final print report carries only completed/approved signatures.

### Next Enhancements

- Notifications:
  - In-app notifications: Done. `report-workflow.html` calls `writeNotification()` after each `saveTransition()` to write a doc to the new `notifications` Firestore collection (recipientRole, message, reportId, periodLabel, transition, actorName, actorRole, createdAt). `index.html` dashboard shows a bell icon in the topbar with a red badge count for unread notifications; clicking opens a dropdown listing recent notifications. "Unread" is tracked via `localStorage` per role (no Firestore write needed). Firestore rules allow any signed-in user to read/create notifications; updates and deletes are denied.
  - Email notifications: Needs a human decision on which email/notification provider to use (Firebase Extensions, SendGrid, etc.). Not implemented.
- Finalized report locking: Done. `report-workflow.html` already had no per-role action available once `status === 'finalized'` (every action button is gated to a specific non-finalized status), so finalized reports were already implicitly locked. Added an explicit Treasurer-only "Reopen Report" action (requires a reason note + confirmation) that resets status back to `draft` so the full approval chain must run again; reopen is logged to both workflow history and `auditLogs` via the existing `saveTransition`/`writeAuditLog` pattern. No Firestore rule change needed — Treasurer already has `update` rights on `reportReviews`.
- Better return notes: Done. `report-workflow.html` shows a prominent latest-return-note banner (who returned it, when, and the note text) whenever a report is in `returned_by_auditor` or `returned_by_finance` status. Return-note history was already visible per entry in the Routing History timeline.

## Phase 6 - Role and Access Enhancements

Status: Not started.

- Membership Secretary role.
- Attendance entry access.
- View-only role restrictions where needed.

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
