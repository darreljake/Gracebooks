# GraceBooks Multi-Church Deployment Plan

**Status:** Plan only — nothing in this document has been implemented yet.
**Written:** 2026-09-25
**Goal:** Turn GraceBooks from a single-church system for Tagaytay United Methodist Church into a product that other churches can adopt, starting with United Methodist churches in the Philippines.

This plan covers what must change in the code, what must be built, and the order to do it in. It complements `PHASE-PLAN.md` (the running log of completed work) and `ARCHITECTURE-REVIEW.md` (known issues). When a phase below starts, record its progress in `PHASE-PLAN.md` as usual.

---

## 1. Key Decision: Deployment Model

| | **A. One Firebase project per church** (recommended) | **B. One shared multi-tenant project** |
|---|---|---|
| Data isolation | Complete — each church has its own database and storage bucket | Every document needs a `churchId`; one rules mistake leaks one church's data to another |
| Code changes | Small: move church details into configuration/settings | Large: rewrite `firestore.rules`, `storage.rules`, and every query across ~28,000 lines / 21 pages |
| Cost | Billed per church (each church can own its billing account) | One bill, re-charged to churches |
| Updates | Deploy the same release to N projects (automated via CI matrix) | Deploy once |
| Android app | One build per church (`capacitor.config.json` `server.url` points at one site) | One app with a church picker |
| Fits current code | Yes — rules, roles, and pages all assume one church | No |

**Recommendation:** Start with **Model A (per-church projects)**. Revisit Model B only if the number of churches grows past roughly 15–20 and the per-project deployment overhead becomes the bottleneck.

### Other decisions to make in Phase 0
- **Target market:** UMC churches in the Philippines first. This keeps UMC-specific features (Connectional Ministries, apportionments, District role, MIS tracking, membership classes, Deaconess) and Philippine payroll deductions (SSS, PhilHealth, Pag-IBIG) relevant. Other denominations/countries are a later phase.
- **Who owns the Firebase project and billing:** the church, or you on their behalf. Note Cloud Storage for new Firebase projects requires the Blaze (pay-as-you-go) plan, so each project needs a billing account and budget alerts.
- **Pricing and support model:** free pilot, subscription, or donation-based; who answers support questions and how fast.
- **Data ownership and exit:** a church leaving must be able to export all its data.

---

## 2. Inventory: What Is Tied to Tagaytay Today

### 2.1 Hard-coded church identity
| Item | Where | Fix |
|---|---|---|
| "Tagaytay United Methodist Church" / "Tagaytay City" (~30 occurrences) | `print-report.html`, `certificate-of-giving.html`, `verify-certificate.html`, `cash-voucher.html`, `payslips.html`, `members.html` (Excel export title "TAGAYTAY UMC…"), `member-report.html`, `reports.html`, `financial-overview.html`, `index.html`, `tithers.html` (sample CSV), `manifest.json` | Read from a new `settings/churchProfile` document |
| Church logo and photo | `public/umc-logo.png`, `public/church.jpg` | Per-church upload (Storage) with the current files as defaults |
| Firebase config (`gracebooks-7eebc`, API key) duplicated in 21 files | Every page's inline `firebase.initializeApp({...})` | Extract to one shared `public/firebase-config.js` loaded before `auth.js` |
| Default project | `.firebaserc`, `CLAUDE.md` deploy commands | Firebase CLI aliases per church (`firebase use --add`) |
| Android app identity | `capacitor.config.json` (`appId: org.tumc.gracebooks`, `server.url`) | Per-church build parameters in CI |

### 2.2 Tagaytay-specific data and workflow
| Item | Where | Action |
|---|---|---|
| **Real membership roll committed to git** (160 members: names, lay org, status) | `scripts/data/membership-roll-seed.json` | Remove from the repo **and purge from git history** before the repo is shared or made public; keep seed data outside version control |
| Decker-specific deduction logic | `expenses.html`, `financial-overview.html`, `special-projects.html`, `scripts/backfill-decker-deduction.js`, `.github/workflows/backfill-decker-deduction.yml` | Generalize into configurable payroll deductions, or retire after Tagaytay's backfill |
| One-off maintenance scripts | `prune-income-week.js`, `restore-income-from-audit.js`, `audit-income-week.js`, `income-week-cleanup.yml` | Move to an internal `scripts/maintenance/` area, not part of the shipped product |
| Payroll deductions (SSS, PhilHealth, Pag-IBIG) | `expenses.html`, `payslips.html` | Make the deduction list configurable per church |
| Role set (Deaconess, Money Counter, District, etc.) | `firestore.rules`, `index.html` `menus` | Keep roles fixed; allow a church to simply not assign unused roles. Make display titles configurable |
| Signatory titles and report headers | `settings/signatories`, `print-report.html`, `report-workflow.html` | Confirm all read from settings, not literals |

### 2.3 Critical security and reliability items
| Item | Where | Why it matters |
|---|---|---|
| **Testing-access expiry on 2027-01-01** | `firestore.rules` `testingAccessOpen()`, `index.html` `TESTING_END_DATE` | All users — **including Tagaytay** — are locked out after that date. Must be replaced before any rollout and before the deadline regardless |
| Storage rules check one hard-coded Treasurer UID | `storage.rules` `isTreasurer()` (see `ARCHITECTURE-REVIEW.md` §7.0) | Any other church's Treasurer cannot upload expense receipts or project proofs. Switch to role-based check and live-test uploads |
| App Check wired but inactive | `auth.js` `APP_CHECK_SITE_KEY = ''` | Activate per project (reCAPTCHA v3 key) and move Firestore/Storage to Enforced |
| Role names are unvalidated free text | `userProfiles` docs, client-side `role === '...'` checks | A typo silently removes all access. Validate on provisioning and show a clear error on login |
| Pages without a client-side role gate | `members.html`, `budget-vs-actual.html`, `member-report.html`, `income-log.html`, `print-report.html` | Rules block data, but users see silent errors instead of a clear message |
| No backups | — | Scheduled Firestore exports per project |
| Personal data of other churches | Members' birthdays, giving history, payroll | Philippine Data Privacy Act of 2012 compliance (see Phase 4) |

---

## 3. Phases

### Phase 0 — Decisions and Groundwork (≈1 week)
- [ ] Confirm the deployment model (recommendation: per-church projects).
- [ ] Confirm the target market (UMC Philippines first).
- [ ] Decide Firebase project/billing ownership, pricing, and support model.
- [ ] Identify 2–3 pilot churches (same district is easiest to support).
- [ ] Decide product name/branding: keep "GraceBooks" as the product; each church's name appears inside it.

**Exit criteria:** decisions written into this document.

### Phase 1 — Must-Fix Items (≈1 week, start immediately)
These protect Tagaytay as much as future churches.
- [ ] Replace the `testingAccessOpen()` expiry in `firestore.rules` and `TESTING_END_DATE` in `index.html` with a permanent access model (e.g. signed-in + valid role + optional per-church `settings/license` active flag).
- [ ] Replace the hard-coded UID in `storage.rules` with `hasRole(['Treasurer'])`; live-test receipt upload, replace, and delete for expenses and special projects.
- [ ] Remove `scripts/data/membership-roll-seed.json` from the repo and purge it from history; add `scripts/data/` to `.gitignore`.
- [ ] Confirm no other real personal data or credentials are committed (scan history).

**Exit criteria:** Tagaytay continues working past 2027-01-01; no member data in the repository.

### Phase 2 — Church Configuration (≈2–3 weeks)
- [ ] Create `settings/churchProfile` with: church name, short name, address/city, conference, district, pastor name, logo URL, photo URL, currency (default PHP), timezone (default Asia/Manila), fiscal-year start, report footer text.
- [ ] Replace every hard-coded "Tagaytay" string (§2.1) with values from `churchProfile`, with a safe fallback while loading.
- [ ] Add a logo/photo upload path in `storage.rules` (images only, size-limited, Treasurer-only write) and use it on the dashboard, reports, certificates, vouchers, and payslips.
- [ ] Extract the Firebase config into `public/firebase-config.js`; update all 21 pages to load it.
- [ ] Make `manifest.json` name generic ("GraceBooks") or generate it per church at deploy time.
- [ ] Make payroll deductions configurable (name, type, default amount), replacing fixed SSS/PhilHealth/Pag-IBIG/Decker handling while migrating Tagaytay's existing data unchanged.
- [ ] Make role display titles configurable where churches use different titles, keeping the internal role keys unchanged.
- [ ] Update `CLAUDE.md` and `ARCHITECTURE-REVIEW.md` to describe the configuration model.

**Exit criteria:** a fresh deployment shows no Tagaytay-specific text or images anywhere; Tagaytay's own deployment looks unchanged after setting its profile.

### Phase 3 — Onboarding a New Church (≈3–4 weeks)
- [ ] **Provisioning script** (`scripts/new-church.js` or a GitHub Actions workflow extending `provision-user.yml`) that, given a Firebase project:
  - deploys hosting, Firestore rules/indexes, and Storage rules;
  - creates the first Treasurer account and its `userProfiles` doc;
  - seeds default settings: `churchProfile`, `accountStructure`, `beginningBalances`, `yearsConfig`, budget category tree, `signatories`, `cashControlSettings`, `voucherSettings`, `certificateCounter`, `payrollTemplate`.
- [ ] **First-login setup wizard** for the Treasurer: church profile and logo, opening balances per account, fiscal year, signatories, cash-control thresholds.
- [ ] **User management page** (Treasurer-only) to create accounts and assign roles, backed by a Cloud Function or the provisioning workflow — since client writes to `userProfiles` are denied by design, this needs a server-side path.
- [ ] **Empty-database testing:** open every page against a brand-new project and fix any page that assumes existing documents (settings, years, budgets, accounts).
- [ ] **Data import tools:** membership roll (CSV import exists in `members.html`), tithers roster, opening balances, and optionally prior-year totals for comparison reports.
- [ ] **Data export for churches:** full export of all collections plus Storage files so a church can leave or keep its own archive.

**Exit criteria:** a new church can be set up end-to-end in about an hour without using the Firebase Console directly.

### Phase 4 — Hardening and Compliance (≈2–3 weeks, can overlap Phase 3)
- [ ] Activate App Check per project and enforce it on Firestore and Storage.
- [ ] Validate roles against a fixed list at provisioning time; show a clear "account not configured" error on login for unknown roles.
- [ ] Add client-side role gates to the pages listed in §2.3, following the `financial-overview.html` / `cash-voucher.html` pattern.
- [ ] Scheduled daily Firestore exports to a Cloud Storage bucket per project, with a documented restore procedure.
- [ ] Budget alerts on each project's billing account.
- [ ] Turn `scripts/test-money-counter-permissions.js` / `test-role-permissions.yml` into a Firestore/Storage rules test suite run against the emulator in CI for every role.
- [ ] Add basic end-to-end smoke tests (Playwright): login per role, income entry, expense entry, report generation, report workflow.
- [ ] **Data privacy (Philippine Data Privacy Act of 2012):**
  - privacy notice shown to users;
  - data processing agreement template between you and each church;
  - retention and deletion policy (members, giving, payroll, audit logs);
  - a named contact for data-subject requests and breach notification;
  - review what each role can see of personal data (birthdays, giving amounts, payroll).
- [ ] Revisit upload security from `PHASE-PLAN.md` Phase 4B (server-side file-type validation).

**Exit criteria:** rules tests pass for every role in CI; backups verified by a test restore; privacy documents ready for pilot churches.

### Phase 5 — Pilot (≈2–3 months)
- [ ] Deploy to 2–3 pilot churches using the Phase 3 tooling.
- [ ] Write a user manual per role (Treasurer, Money Counter, Membership Secretary, Pastor, Auditor, signatories) — short, with screenshots.
- [ ] Hold an onboarding/training session per church (Treasurer first, then other roles).
- [ ] Set up a support channel (e.g. group chat or email) and an issue log.
- [ ] Collect feedback monthly; separate church-specific requests from product-wide improvements.
- [ ] Track: setup time, support requests per church, errors, Firebase cost per church.

**Exit criteria:** pilot churches complete at least one full month-end cycle (entries → report workflow → signed report) without developer help.

### Phase 6 — General Release and Operations (ongoing)
- [ ] Staging Firebase project that receives every change before production churches.
- [ ] Versioned releases with a changelog; every church runs a known version.
- [ ] CI workflow that deploys a release to all church projects (matrix over project IDs), extending `firebase-deploy.yml`.
- [ ] Android: release signing (replace debug-only APK in `android-apk.yml`), per-church build parameters, and a decision on Play Store distribution vs direct APK.
- [ ] Onboarding checklist and standard operating procedure for adding a church.
- [ ] Terms of use and support commitments.

### Phase 7 — Optional Scale-Up (later)
- [ ] Re-evaluate multi-tenant (Model B) if church count makes per-project deployment costly.
- [ ] Other denominations/countries: configurable membership classes, fund structures, currency, and payroll rules.
- [ ] Email notifications (currently in-app only).

---

## 4. Timeline Summary

| Phase | Duration (one developer, rough) | Depends on |
|---|---|---|
| 0 — Decisions | 1 week | — |
| 1 — Must-fix | 1 week | — (start now) |
| 2 — Church configuration | 2–3 weeks | 1 |
| 3 — Onboarding tooling | 3–4 weeks | 2 |
| 4 — Hardening & compliance | 2–3 weeks | 2 (overlaps 3) |
| 5 — Pilot | 2–3 months | 3, 4 |
| 6 — Release & operations | ongoing | 5 |
| 7 — Scale-up | later | 6 |

Roughly **2–3 months of development** before a pilot, then a **2–3 month pilot** before general release.

## 5. Risks

| Risk | Mitigation |
|---|---|
| 2027-01-01 access expiry locks out all users | Phase 1, before December 2026 |
| Tagaytay regressions while generalizing | Staging project; Tagaytay's profile set to reproduce current output exactly; check reports against known past months |
| Cross-church data exposure | Per-church projects (Model A); rules tests in CI |
| Treasurer at a new church has no Firebase knowledge | Setup wizard and user management page; no Console steps required |
| Firebase costs surprise a church | Budget alerts; cost tracking during the pilot |
| Support load grows with each church | User manuals, training, support channel, issue log |
| Large single-file pages make changes risky | Small changes per release; smoke tests; staged rollout via staging project |
