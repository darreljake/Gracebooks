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
