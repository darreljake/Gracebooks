# GraceBooks Enhancement Phase Plan

## Standing Notes

- Do not change `financial-overview.html` real-time listeners unless explicitly approved.
- Keep unrelated logic and design untouched when implementing enhancements.
- Prefer one-time Firestore fetches for new report features to avoid continuous read costs.
- Deploy command used: `cmd /c firebase deploy --only hosting --project gracebooks-7eebc`.

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

Status: Started.

- Create `liquidation-reimbursements.html`. Done as initial staff request + Treasurer review page.
- Handle request, review, approval, release, reconciliation, and receipts.
- Auto-create expense entry after approval where appropriate.

## Staff Payroll Access

Status: Started.

- Pastor, Deaconess, and Admin Assistant accounts.
- Staff dashboard entries for payslips and liquidation/reimbursements.
- Initial `payslips.html` reads payroll-generated expense records for the signed-in staff role.

## Phase 4 - New HTML: Special Projects and Ministries

Status: Not started.

- Create `special-projects.html`.
- Create `connectional-ministries.html`.
- Include project totals and fund sources in print report later.

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
  - Add in-app and/or email notifications when a report is routed, returned, or finalized.
  - Notify the next responsible role immediately after each workflow transition.
- Finalized report locking:
  - Lock a report after Pastor finalization.
  - Require Treasurer/admin reopen action before any finalized workflow can be edited again.
- Better return notes: Done. `report-workflow.html` shows a prominent latest-return-note banner (who returned it, when, and the note text) whenever a report is in `returned_by_auditor` or `returned_by_finance` status. Return-note history was already visible per entry in the Routing History timeline.

## Phase 6 - Role and Access Enhancements

Status: Not started.

- Membership Secretary role.
- Attendance entry access.
- View-only role restrictions where needed.

## Later Phase - Official Membership Database Import

Status: Deferred.

- Replace the current tithe-giver/member-name list with the official Membership Secretary Excel/CSV database.
- Add CSV upload mapping.
- Add duplicate detection.
- Add preview/confirm before import.
- Add rollback-safe audit logging.
