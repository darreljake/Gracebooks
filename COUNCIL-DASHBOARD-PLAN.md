# Council Dashboard - Plan

Status: Done (2026-10-02). Owner: Treasurer. Audience: Church Council (Sunday presentation).

## Goal

One page, `public/council-dashboard.html`, that pulls together the numbers already in GraceBooks
for a chosen period and shows them as a short, eye-catching report the Treasurer can project
to the Council, print, or save as a version. No retyping: every number comes from Firestore
(one-time reads, per the Standing Notes), on the **same basis as `print-report.html`** so the
Council sees the same totals as the signed statement.

## The KPIs the Council should see every time (CFO view)

Grouped as "slides". Each KPI shows: this period, YTD, and a comparison (same period last year
or budget), plus a plain-language one-liner.

### 1. Headline - "Where we stand" (hero slide)
- Total Cash Receipts (period, YTD) - General Fund basis, same as Print Report.
- Total Disbursements (period, YTD).
- Net Surplus / Deficit (period, YTD), green or red.
- Change vs same period last year (%).
- Cash level badge (Green / Yellow / Red / Black) with months of cover.

### 2. Liquidity - "Can we pay our bills?"
- Available Operating Cash today (Financial Overview basis).
- Months of cover = cash / Essential Monthly Operating Expense (`settings/cashControlSettings`).
- Cash level using FO's `getCashLevel()` thresholds (>= 3 / >= 1 / >= 0.5 months).
- 6-month trend projection (Conservative Hybrid), first month that reaches Red/Black.
- Restricted vs free cash: Building Fund, Mission, other restricted balances, payroll withholdings
  held for remittance, Building Fund money held in GF accounts (earmarked, not free).

### 3. Budget performance - "Are we on plan?"
- YTD income vs YTD budget (% achieved) and YTD expense vs YTD budget (% used),
  against "budget pace" (month / 12, or the schedule-weighted YTD budget).
- Top 5 expense lines over budget, top 5 income lines behind budget.
- Unbudgeted (Miscellaneous) spending total YTD.

### 4. Giving health - "Is our giving base healthy?"
- Tithes YTD and vs last year; Loose / Sunday offerings YTD.
- Number of unique tithers (period, YTD) and vs last year.
- Average tithe per tither.
- Tither participation rate = unique tithers / average attendance (existing definition).
- New tithers (first gift this year) and lapsed tithers (gave last year, nothing in last 3 months) - COUNTS ONLY.
- Giving concentration: share of tithes given by the top 10% of tithers - COUNT/PERCENT ONLY.
- Weekly Sunday collection trend (last 13 Sundays).
- **Privacy rule: no individual giver names or amounts anywhere on this page.**

### 5. Where every ₱100 goes - "How we use the offering"
- Disbursements by main category for the period/YTD expressed per ₱100.
- Staff cost ratio (payroll gross / total disbursements).
- Ministry spending ratio (NOW ministries: Nurture, Outreach, Witness) - existing definition.

### 6. Connectional giving & obligations - "Are we faithful to the wider church?"
- Church obligations (apportionments etc.): total due, paid, balance, % paid, overdue count.

### 7. Special projects & restricted funds - "Our building and mission work"
- Each active special project: target vs raised (gross receipts), costs, net, posted to GF.
- Building Fund: receipts in / out / balance for the period and YTD.

### 8. People - "Who we serve"
- Average Sunday attendance (period, YTD, vs last year) and trend.
- Membership roll counts by status (Active / Inactive / Overseas) - only when the viewer can
  read `membershipRoll`; otherwise the tile shows "not available for your role".

### 9. Stewardship & controls - "Can the Council trust these numbers?" (Treasurer/Auditor only)
- % of expenses with a receipt; % with a cash voucher.
- Sundays with a count sheet / total Sundays; counted cash vs recorded cash mismatches.
- Cash advances released but not yet liquidated (count, amount, oldest age in days).
- Report workflow status for the period (Draft / Submitted / Approved / Signed).
- Ending Balance reconciliation check (green / red) from the Print Report logic.

## Creative presentation

Design direction: "Sunday story" - big, calm, high-contrast numbers on clean cards, UMC
cross-and-flame colours (deep red / warm gold / navy) as accents, everything readable from the
back of a room.

- **Hero slide**: three giant animated count-up numbers (Receipts / Disbursements / Net) with a
  traffic-light ring showing the cash level and months of cover in the middle.
- **Waterfall chart**: Beginning Balance -> + Receipts -> - Disbursements -> +/- Transfers -> Ending Balance.
- **Cash runway gauge**: semicircle gauge Green/Yellow/Red/Black, needle at months of cover;
  under it a 6-month projected cash line with coloured level bands.
- **Budget bullet bars**: one thin bar per main category - actual vs budget with a pace marker.
- **"Every ₱100" graphic**: a row of 100 small coin/peso dots coloured by category (waffle
  chart), with the legend as plain sentences ("₱38 paid our pastor and staff").
- **12-month combo chart**: income bars vs expense bars with a net line; last year as a ghost line.
- **Giving calendar heatmap**: one square per Sunday, shaded by collection amount.
- **Progress rings**: apportionments % paid; thermometers for special projects / Building Fund.
- **Sparklines** inside every KPI tile (last 12 months).
- **Talking points**: auto-generated plain sentences per slide ("Giving is up 8% vs last
  year"), which the Treasurer can edit before presenting.

Modes:
- **Dashboard mode** (default): scrolling grid of all sections, period selector (month / quarter / year).
- **Presentation mode**: full-screen, one section per slide, arrow keys / click / swipe, slide
  counter, "Esc" to exit - built for projecting on Sunday.
- **Print / PDF**: clean print CSS (one section per page, no buttons).
- **Generate & Save Version** (Treasurer only): self-contained HTML snapshot into the existing
  Report Archive (`reportArchive` + `report-archive/{docId}/snapshot.html`), audit entry
  `report_version_saved`, same pattern as the three existing pages.

Charts are **hand-rolled inline SVG** (like `reports.html`), not a chart library: no CDN
dependency, works in the archived snapshot (self-contained HTML), and prints sharply.

## Data pipeline ("everything pipelined")

All one-time reads, cached per page load, then pure functions compute a single `kpi` object
that every chart/tile/talking point reads from. Rendering never queries Firestore.

```
load(period) -> raw { income, expenses, budgets[year, year-1], settings(beginningBalances,
  cashControlSettings, generalFundAccounts...), churchObligations, specialProjects(+entries),
  attendance, membershipRoll?, liquidationRequests?, countSheets?, cashVouchers?, reportReviews }
   -> normalize (same rules as print-report: account resolution, GF vs restricted, Building
      Fund rule, transfers excluded, duplicate legacy cash advance returns excluded, payroll
      gross for statement / net for cash, no-date = 2026-01-01)
   -> computeKpis(raw, period) -> kpi {...}   // pure, testable
   -> render(kpi)  /  talkingPoints(kpi)  /  snapshotHtml(kpi)
```

Basis helpers are **copied verbatim** (no shared modules in this repo) from:
- `print-report.html`: `isGeneralFundAccount`, `getIncomeAccountId`, `getExpenseAccountId`,
  `isBuildingFundEntry`, `isGeneralFundIncome`/`isGeneralFundExpense`, `getExpenseCashImpact`,
  `isDuplicateCashAdvanceReturn`, `outstandingWithholdingsThrough`,
  `buildingFundHeldInGfThrough`, `getAccountBalancesThrough`, budget month helpers.
- `financial-overview.html` / `budget-vs-actual.html`: `getCashLevel`, `trendBudgetedForMonth`,
  `trendCashLevel`, `fetchLiveAvailableOperatingCash` logic.
Each copied block gets a comment "copied from X - keep in step".

Reconciliation requirement: for any month, the dashboard's Total Receipts, Total Disbursements
and Ending Balance must equal `print-report.html`'s figures for that month to the centavo.

## Access

- Page: `Treasurer`, `Pastor`, `Auditor`, `Finance Chair`, `Chairperson`, `Finance Committee`
  (all can read `income`/`expenses`/`budgets`/`churchObligations`/`specialProjects`). Others
  redirect to `index.html` (financial-overview.html's role-gate pattern).
- Sections whose collection the role cannot read degrade to a muted "not available for your
  role" tile - never an error, never a blank page.
- Stewardship & controls section: Treasurer + Auditor only.
- Talking-point edits + Save Version: Treasurer only (talking points stored in
  `settings/councilNotes-YYYY-MM`; settings is already Treasurer-write, so **no rules change**).
- Add a "Council Dashboard" menu entry in `index.html` for those roles.

## Phases

1. Page shell, role gate, period selector, data loader, `computeKpis()` with basis helpers;
   Headline + Liquidity + Budget sections; reconciliation check vs print-report logic.
2. Giving health, Every ₱100, Obligations, Projects/Building Fund, People, Controls.
3. Presentation mode, talking points (auto + Treasurer edits), print CSS, Save Version to
   Report Archive, menu entry, CLAUDE.md + PHASE-PLAN.md updates.

## Verification

- Playwright harness with a stubbed Firebase compat layer and a fixture covering: GF and
  restricted income, Building Fund text-classified entry on cash-hand, a transfer, payroll
  with withholding, a legacy duplicate cash advance return, obligations, a special project.
- Assert dashboard totals == print-report totals for the same fixture/month.
- Screenshots at desktop (1440) and phone (390) widths, light print preview, presentation mode.
- Each role in the access list loads without console errors; a disallowed role redirects.

## Additions (Treasurer requests, built with the page)

1. **Month selector.** Instead of month/quarter/year, a year picker plus 12 toggle chips (non-contiguous allowed) with presets (This month, Last month, Q1-Q4, YTD, Full year, Clear). Receipts/disbursements/giving/attendance are summed (attendance averaged) over the selected months only; budget = sum of each selected month's own schedule-aware budget; comparison = the same months last year. Beginning Balance is through the day before the first selected month and Ending Balance through the end of the last; for a non-contiguous selection the waterfall adds an "Other months in between" bar and a note, so it still ties out. Titles, talking points, Save Version and the snapshot describe the selection in words ("June 2026", "Apr-Jun 2026", "Jan, Mar, Jun 2026"). All data is read once; chip clicks recompute from cache.
2. **Follow / sync.** The Treasurer's "Start presenting" publishes the view (year, months, section, slide, presentation mode) to `settings/councilPresenter` with a ~300ms debounce (audit entries only on start/stop). Other roles get a "Follow Treasurer" button; following attaches an `onSnapshot` listener to that one doc only (the single deliberate exception to one-time reads), shows a banner, pauses on a manual change (Resume following), and unfollows when the presenter stops or the page hides. No rules change.

## Follow-up build (attendance, landscape, per-100, pass-through, partial month)
2. **Attendance is per Sunday.** The first build summed every Sunday in a month and called it average monthly attendance (four ~63 Sundays showed 253, participation 5.5% instead of ~22%). Now: average Sunday attendance = sum of Sunday headcounts / Sundays recorded; a legacy monthly doc counts as one data point only for a month with no weekly docs (marked "monthly figure (older record)"); `_settings` ignored; same rule for last year, YTD and the 12-month series. Participation = unique tithers / average Sunday attendance. People slide: Sundays recorded, highest/lowest Sunday, average guests and members present, weekly bar chart with average line. `reports.html` got the same rule (`averageSundayAttendance()`), so both pages agree for the same month.
3. **Landscape / tablet / projector.** Short-landscape CSS (compact bar, scrolling chips row, 3-4 column tiles, side-by-side panels), `dvh` slides with vh-clamped hero, ~40px nav, compact follower banner (offset by its measured height), re-render on orientation or layout-mode change, portrait "rotate your phone" hint in Slide show.
4. **Every ₱100, redesigned.** Purpose buckets (`PURPOSE_BUCKETS`, first match wins), a receiving side (`INCOME_BUCKETS`), expandable bucket lines, gold-coin grids that animate in Slide show, a this-period / last-year / budget-plan stacked-bar trio, and ratio tiles with deltas vs the budget plan.
5. **Pass-through collections.** Treasurer tags Miscellaneous lines (`settings/passThroughItems`, audited); they leave Unbudgeted, budget %, top-5 and the mixes but stay in cash totals; a Budget-slide panel shows collected / remitted / still to remit, still-to-remit is earmarked in Liquidity; `print-report.html` shows them under "Pass-through Collections (for remittance)" / "Pass-through Remittances" with a "Still to remit" note, totals unchanged.
6. **Partial month.** Note + "Count budget only through today" toggle (default ON) pro-rating the in-progress month's budget for comparisons only.

## Second follow-up build (orientation, summary slide, specific lines, pitaka, reporting-only)

1. **Rotation.** `manifest.json` `orientation` is now `"any"` (it was `portrait-primary`, locking the installed PWA to portrait). Slide show on a phone also tries fullscreen + `screen.orientation.lock('landscape')` (feature-checked, try/catch, unlocked on exit); the portrait hint gains a "Landscape" button. The Capacitor Android app already follows the sensor (unchanged). An installed PWA may keep its old manifest for a while - remove and re-add the home-screen app.
2. **Summary slide ("The bottom line", slide 10).** Scorecard (status dot + text label per area) + three auto lists decided by the commented `SUMMARY_RULES` table; Treasurer-editable under `settings/councilNotes-*.summary`, audits `council_summary_saved/_reset`. Participation = unique tithers / average Sunday attendance (the plan's earlier "average attendance" wording means per-Sunday).
3. **Specific ₱100 lines.** Rows are budget sub-category (or main) lines, two-level largest-remainder pesos (lines == coins == 100), bucket chips/colours kept, top 8 + expandable others; talking points and summary use the top lines.
4. **Pitaka redesign of slide 5 (approved by the Treasurer after the first build).** ₱100 note + four views (Saan napunta / Saan galing / Ayon sa budget / Noong nakaraang taon), Taglish caption table with fun/plain tone (`PITAKA_CAPTIONS`), tear-and-slide animation (reduced-motion safe, static in print and the snapshot), compare-year select driven by whatever earlier years have data, friendly empty state, `per100View`/`pitakaTone` in the presenter doc.
5. **Reporting only.** The dashboard no longer writes `settings/passThroughItems`; tagging moved to Budget vs Actual > Setup Budget (Treasurer-only card with the print-report-exact keys). The dashboard still reads the tags and applies every effect; the Treasurer sees a link to the new home.

Verification harness (not committed): fixture with 2025 data, pass-through tags, six roles, Apr-Jun/YTD/June reconciliation against print-report (months 1-9, Apr-Jun, Jan/Mar/Jun), per-view totals = 100 and peso totals = statement to the centavo, summary-vs-slide figure equality, summary save/reload/reset, orientation-lock stubs, presenter follow to slide 10 and across slide-5 views, key equality between Budget vs Actual and print-report.

## Third follow-up build (section navigator, view modes, Ending Balance diagnostic)

1. **Section navigator and view modes (outside Slide show).** A sticky `#sec-nav` below the controls (numbered pills with the `short` title from `SLIDES`; horizontal scroll on phones, current pill highlighted and auto-centred, safe-area top inset, sits under the follower banner). Default **One section at a time**: only `.slide.current` shows, with a "Section N of 10" label and large "<- 3 Budget" / "5 ₱100 ->" buttons (`sectionFootHtml()`); a pill tap or button jumps to that section and scrolls to its top (`scroll-margin-top` = measured `--nav-h`); Left/Right arrows move between sections unless focus is in an input/select/textarea; no swipe (it fights chart scrolling). **Show all** (toggle in the navigator) is the long scroll with a full-width coloured header band per section, wide spacing, a dashed divider and an IntersectionObserver that highlights the pill of the section in view. The choice is remembered in `localStorage.councilViewMode` (try/catch, default one-at-a-time). Presenter follow reuses the existing `section` field: a follower in one-at-a-time mode shows the presenter's section; any manual navigation (pill, Next/Previous, arrows, view toggle) pauses following. Print, the saved snapshot and Slide show are unchanged (print forces every section visible and hides nav/buttons/dividers; the snapshot is built with `static` so it has no nav or buttons).
2. **Ending Balance check explained.** The check (`reconcileDiff`) is untouched and still a verbatim copy of print-report.html. `explainReconcile()` (Treasurer/Auditor, Controls section) shows, per document dated in the selected span, (a) its effect on the General Fund account balances - using `applyIncomeToBalances()`/`applyExpenseToBalances()`, the per-document step now factored out of `getAccountBalancesThrough()` with identical behaviour - (b) its effect on the statement's Ending Balance and (c) its effect on the withholding / Building-Fund-held adjustments; effect = a - c - b. Algebraically the effects of all documents sum EXACTLY to `reconcileDiff` (asserted in the harness and shown in the panel as "adds up exactly"). Panel ("Explain the difference", shown only when the check is off, plus an always-available "Show details" with group totals) lists the documents that do not cancel, with payee/member names (internal, never in print, Slide show or the snapshot). The tile now always shows the full amount ("✗ Off by ₱500.00", wrapping) and says whether the accounts are LOWER or HIGHER than the statement.
3. **Causes the diagnostic can detect:** a document posted to an account id the system does not know (balances skip it, the statement counts it as General Fund - income, expense or transfer); a special-project cost the statement leaves out (not paid from Cash on Hand / Cash in Bank - e.g. Petty Cash, or a non-account payment method such as "GCash" that the balances still treat as cash-hand); payroll whose net pay exceeds gross; anything else shows as "unclassified". Over-remittances and one-sided transfers do NOT unbalance this check (the withholding adjustment and the transfer lines absorb them); an over-remittance is noted in the details instead.
4. **Not a bug.** The special-project exclusion is a documented design rule copied from print-report.html (project costs paid from Petty Cash/other funds are "accounted for in the project ledger"), but the balances still deduct them, so such a cost always shows here; fixing that is a design decision for the Treasurer, not changed.

Harness (not committed): t30 (12 fixtures: baseline, over-remittance, one-sided transfers, special project from Petty Cash / GCash / cash-hand, unknown-account income / expense / transfer, payroll net > gross, combined - dashboard diff = print-report diff, one document named, effects sum to the diff) and t31 (six roles x phone/landscape/desktop, no horizontal scroll, navigation, keyboard, persistence, presenter follow, print emulation, snapshot, Slide show).
