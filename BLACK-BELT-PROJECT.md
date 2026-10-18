# Lean Six Sigma Black Belt Project Submission

## Reducing Financial Record Defects in the Weekly Offering-to-Report Process

**Organization:** Tagaytay United Methodist Church (TUMC), Tagaytay City, Philippines
**Process owner / Sponsor:** Church Treasurer (sponsor signature required — see §10)
**Project lead:** *[candidate name]*
**Methodology:** DMAIC
**Project period:** 23 July 2026 – 13 September 2026 (improvement build and deployment); control phase ongoing
**Document date:** 19 September 2026

> **Note on personal data.** Member names appearing in the underlying operational records have been replaced with pseudonyms (Member A, Member B) throughout this document. No giver names, amounts attributable to named individuals, or account credentials are reproduced here.

---

## 1. Executive Summary

Tagaytay United Methodist Church records weekly worship offerings through a multi-role process running from cash counting on Sunday, through ledger entry, reconciliation against bank and cash-on-hand balances, and finally a five-signatory monthly report approval chain. The process is legally and ecclesiastically consequential: the church is accountable to its members, to its District, and to the annual conference for the accuracy of these reports.

The process exhibited two chronic, customer-reported failure symptoms:

1. **"My cash on hand and bank do not match the actual record."** — Treasurer, recorded in project log.
2. **"The second week of September income is ballooned."** — Treasurer, 13 September 2026.

Investigation of symptom (2) established a measured baseline for a single reporting week in which **97 of 124 income records (78.2%) were defective duplicates**, overstating recorded weekly income by **₱156,200 — 378% above the true collection of ₱41,300**. Root-cause analysis traced the defect to a confirmed causal chain in which *successful* save operations terminated on a permissions error screen, causing the operator to conclude the save had failed and to re-key the entire collection four times.

Fourteen distinct defect modes were identified and eliminated across the process. Countermeasures emphasized **mistake-proofing (poka-yoke)** over procedural controls: atomic transactional writes, transactional identifier allocation, and role-aware navigation. The control phase established an **automated regression test executing against the live production authorization rules**, which fails the build on recurrence.

The verified post-improvement state for the affected week is **27 records, ₱41,300, zero remaining defect candidates**.

**Honest scoping statement:** this submission presents one fully instrumented incident with a rigorous root-cause chain and a working control system. It does **not** yet present a multi-period statistical demonstration of sustained capability improvement. §9 sets out the ongoing data collection plan that closes this gap, and §11 states the limitations plainly.

---

## 2. DEFINE

### 2.1 Business Case

TUMC's finance function is staffed entirely by volunteers and part-time staff across eleven distinct roles. Financial record defects carry three costs:

| Cost category | Description | Quantification status |
|---|---|---|
| Rework | Re-counting, re-keying, and reconciliation of corrupted weeks | Estimated; requires sponsor validation |
| Governance risk | Reports submitted to District/Conference containing overstated income | Realized — see §3.4 |
| Trust | Congregational confidence in stewardship reporting | Not quantified (intangible) |

Unlike a manufacturing setting, the dominant cost here is **not** scrap value. It is the volunteer hours consumed in detecting and correcting defects, and the governance exposure of transmitting an incorrect report upward. This is stated explicitly because inflating the financial benefit of a non-profit project is a common and correctly-penalized error in Six Sigma submissions.

### 2.2 Problem Statement

> Between the point of Sunday cash counting and the issuance of the monthly financial report, the TUMC offering-recording process produces financial records that do not reflect actual collections. Two symptom classes are reported by the process owner: (a) recorded fund balances diverge from physically held cash and bank statements, and (b) recorded weekly income is inflated relative to actual collection. The magnitude, frequency, and cause of these defects were unknown at project start, and no measurement system existed capable of attributing a given record to the operator who created it.

### 2.3 Goal Statement

| Element | Target |
|---|---|
| Primary Y | Defect rate in weekly income records (defective records ÷ total records recorded for the reporting week) |
| Secondary Y | Absolute variance between recorded fund balances and physically verified cash/bank balances |
| Goal | Reduce primary Y to ≤ 1% of recorded weekly records, sustained over 8 consecutive reporting weeks |
| Constraint | No reduction in the authorization boundaries separating the eleven process roles |

### 2.4 Scope

**In scope:** the weekly offering-to-report value stream — cash counting, income record entry, member record creation incidental to entry, fund routing (cash-on-hand vs. cash-in-bank), reconciliation, and the five-signatory report approval chain.

**Out of scope (declared replication opportunities):** payroll generation, cash voucher issuance, liquidation and reimbursement workflow, membership attendance tracking, special-project fund ledgers, and equipment registry. Defects were also found and corrected in several of these adjacent processes during the project; they are documented in §6.3 as replication evidence but are **not** claimed as project benefit.

### 2.5 SIPOC

| Supplier | Input | Process | Output | Customer |
|---|---|---|---|---|
| Congregation | Cash, cheques, bank transfers | **1.** Count Sunday collection | Counted totals by offering type | Treasurer |
| Money Counter | Counted totals, giver identity | **2.** Key income records; create member record for walk-in givers | `income` records, `members` records | Treasurer |
| Treasurer | Income records, expense records | **3.** Route to correct fund (cash-on-hand / cash-in-bank / designated funds) | Fund-attributed ledger | Treasurer, Auditor |
| Treasurer | Ledger, bank statement, physical cash | **4.** Reconcile | Verified fund balances | Auditor, Finance Chair |
| Treasurer | Verified balances | **5.** Generate monthly report | Draft report | Approval chain |
| Auditor → Finance Chair → Chairperson → Pastor | Draft report | **6.** Approve and sign (5 signatories) | Signed report | Congregation, District, Conference |

### 2.6 Voice of the Customer → CTQ Tree

| VOC (verbatim, process owner) | Need | CTQ (measurable) | Specification |
|---|---|---|---|
| "My cash on hand and bank do not match the actual record." | Recorded balances must equal physical reality | Absolute variance, recorded vs. verified fund balance | ₱0 variance at month-end reconciliation |
| "The 2nd week of September income is ballooned." | Recorded income must equal collected income | Defective records ÷ total records per reporting week | ≤ 1% |
| "[The Money Counter] lacks permissions to enter income data." | An authorized operator must be able to complete their task | Task completion rate for authorized role | 100% |
| "[The] attachment cannot be attached." | Supporting evidence must attach successfully | Upload success rate for authorized role | 100% |

### 2.7 Critical Definitional Work: What Counts as a "Week"

A non-trivial Define-phase output. The organization's reporting week is **not** an ISO week. A weekday transaction rolls forward to the Sunday closing its week (clamped to month end), and weeks are partitioned as days 1–7 / 8–14 / 15–21 / 22–28 / 29+. The measurement instrument (§3.2) was built to port this definition **verbatim** from the reporting logic the Treasurer actually reads, rather than re-deriving it — otherwise the measurement would have partitioned the data differently from the customer's own view of it and every finding would have been disputable.

Verified for the baseline period: **September 2026 Week 2 = 2026-09-07 through 2026-09-13.** The instrument uses UTC date accessors so that a measurement run on a foreign server and a browser in Philippine time bucket identical calendar dates.

---

## 3. MEASURE

### 3.1 Operational Definitions

| Term | Operational definition |
|---|---|
| **Unit** | One income record for the reporting week |
| **Defect** | An income record that does not correspond to a distinct real collection event — i.e. a duplicate of another record, or a record attributable to a re-keying event rather than to money received |
| **Opportunity** | One per unit (a record either corresponds to a real collection event or it does not) |
| **Defective** | Synonymous with defect at unit level, as opportunity = 1 |
| **Attribution** | The role of the account that created the record, resolved by joining the record to its creation entry in the immutable audit log |

### 3.2 Measurement System

**The measurement system had to be constructed before the process could be measured.** This is itself a Measure-phase finding worth stating: income records carried **no creator field**. The record payload consisted only of date, member identifier, member name, offering type, amount, payment method, budget category, budget detail, notes, target account, and timestamp. Operator attribution existed **only** in a separate immutable audit-log collection.

Consequently, the question *"who entered this record?"* required a join across two collections that **no screen in the application performed**. No measurement was possible from the user interface.

Three instruments were built:

| Instrument | Function | Write behavior |
|---|---|---|
| `scripts/audit-income-week.js` | For one reporting week, enumerates every income record with its creating operator; totals grouped by operator; duplicate groups (same date + giver + type + amount, flagging the excess beyond one copy); per-week totals for the whole month as context; and orphaned creation entries whose record no longer exists | **Read-only. Writes nothing.** |
| `scripts/prune-income-week.js` | Removes records positively attributed to an operator role other than a specified keep-role | Dry-run by default; requires explicit apply flag |
| `scripts/restore-income-from-audit.js` | Reconstructs a removed record from the full pre-deletion snapshot stored on its deletion audit entry | Dry-run by default; uses create-only semantics so a restore can never overwrite a record re-keyed in the interim |

**Measurement system integrity controls.** The pruning instrument carries three hard refusals, each of which is a guard against measurement- or correction-induced error:

1. It never removes a record it cannot positively attribute. *Rationale:* the Financial Overview page's transfer and cash-addition features write **no audit entry at all**, so "unattributed" must not be read as "unauthorized."
2. It never removes a system-generated record (inter-fund transfers, liquidation-linked records, special-project records) regardless of attributed role, because each mirrors a second document elsewhere and deleting one side corrupts both.
3. Every removal first writes an audit entry carrying the **complete deleted document**, making every correction fully reversible.

**Measurement System Analysis.** Classical Gage R&R is not applicable to transactional record data. However, the baseline period contains a naturally occurring **attribute agreement study**: the same physical Sunday collection was independently counted and recorded by two operators — the Money Counter (four attempts) and the Treasurer (one attempt). The two operators' record sets **disagreed**: one offering category (Sunday School, ₱650) appeared in the Money Counter's set and was entirely absent from the Treasurer's. This disagreement is direct evidence that the *counting and classification* step — upstream of the recording defect this project addresses — carries its own appraiser variation, and it is carried forward as a declared open item (§11).

### 3.3 Baseline Data — September 2026, Week 2

| Measure | Value |
|---|---|
| Income records recorded for the week | **124** |
| Recorded total | **₱197,500.00** |
| True collection (post-correction, verified) | **₱41,300.00** |
| True record count | **27** |
| Defective records | **97** |
| **Defect rate** | **78.23%** |
| **DPMO** (1 opportunity per unit) | **782,258** |
| First-pass yield | 21.77% |
| **Process sigma** (long-term Z = −0.78; +1.5 shift) | **≈ 0.72σ** |
| Absolute overstatement | **₱156,200.00** |
| Overstatement relative to truth | **378%** (recorded = 4.78× actual) |

**Recording event sequence (from audit-log timestamps, UTC):**

| # | Operator role | Approx. time | Nature |
|---|---|---|---|
| 1 | Money Counter | 03:16 | Full collection keyed |
| 2 | Money Counter | 03:27 | Full collection re-keyed |
| 3 | Money Counter | 03:39 | Full collection re-keyed |
| 4 | Money Counter | 03:44 | Full collection re-keyed |
| 5 | Treasurer | 03:50 | Full collection keyed independently |
| 6 | Money Counter | 03:51 | Single Sunday School record |

No record in the week was unattributed, and none was system-generated — so the entire population was measurable and the attribution was complete.

### 3.4 Defect Propagation Beyond the Primary Y

The defect did not remain contained in the income ledger. Each re-keying attempt re-created walk-in givers as **new member records**. One giver (Member A) was created three times under three sequential identifiers. In a separate collision, a fourth identifier was allocated twice — to Member A and to Member B — and the second write **overwrote** the first. The consequence: two surviving income records point at a single member identifier, so one giver's ₱400 contribution reports under another giver's name until manually merged.

This is recorded because it demonstrates the defect's reach into a *downstream customer-visible output* — the individual giving certificate — not merely into an internal total.

---

## 4. ANALYZE

### 4.1 Primary Root Cause — 5 Why

**Problem:** The same Sunday collection was recorded five times.

| Why | Finding |
|---|---|
| **Why was the collection re-keyed?** | The operator believed each save had failed. |
| **Why did the operator believe the save had failed?** | After each save the screen displayed a permissions error. |
| **Why did a permissions error appear after a save?** | On success, the page navigated the operator to the income ledger screen. |
| **Why did that navigation produce an error?** | The Money Counter role holds **create** permission on income but deliberately holds **no read** permission — counters key entries, they do not review the ledger. The destination screen's first action is a read, which the authorization layer correctly denied. |
| **Why did the page navigate a role to a screen it cannot read?** | **ROOT CAUSE:** The post-save navigation target was hard-coded for all roles. The navigation logic carried no awareness of the role-based authorization model that the data layer enforces. |

**The critical inversion:** every save had **succeeded**. The authorization layer behaved exactly as designed. The defect was produced entirely by a **false failure signal** presented to a correctly-performing operator. The operator's re-keying was a rational response to the information they were given.

**Causal chain validated by timestamp evidence.** Two of the four re-keying attempts occurred *after* the corrective deployment at 03:37 UTC — consistent with an already-open browser session still executing the pre-fix page. This confirms the mechanism rather than contradicting it, and generated a specific control-phase action (operators must hard-refresh the application).

### 4.2 Secondary Root Cause — Identifier Allocation

A second, independent failure mode was active in the same code path, and would have produced defects even with the navigation issue absent.

| Why | Finding |
|---|---|
| **Why did new-member creation fail for the Money Counter?** | The write landed on an already-existing document, making it an **update**. The role holds create but not update permission. |
| **Why did it land on an existing document?** | The next identifier was derived by sorting existing identifiers descending and taking the highest. |
| **Why did that yield an occupied identifier?** | The identifier field is a **string**. Descending sort returns the highest *lexicographic* value. Bulk-imported records carry timestamp-style identifiers (e.g. `M1730900000000`), which sort above every three-digit code. Parsing that as an integer yields `NaN`. |
| **Why did that produce a collision?** | Every new member was therefore written to a document literally named `NaN`. The first such write created it; **every subsequent write was an update** — denied for the Money Counter, and a silent overwrite for the Treasurer. |
| **Second branch: why did two members in one batch collide?** | **ROOT CAUSE:** The identifier was allocated when a draft row was created and read only from the database — so two new members entered in the same batch were assigned the **same** identifier, and the second write overwrote the first. |

### 4.3 Cause-and-Effect Classification

Consolidating all fourteen identified defect modes into cause categories:

| Category | Defect modes | Count |
|---|---|---|
| **Method** (non-atomic operations) | Non-atomic dual write on inter-fund transfer; retry-duplication in bulk save loop; non-transactional identifier allocation; same-batch identifier collision | 4 |
| **Method** (state/classification logic) | Payment method ignored in fund routing; cash-advance return classified as income; missing ledger-visibility field on two write paths | 3 |
| **Measurement** (false signals to operator) | Post-save navigation to unreadable screen; silent rejection of camera-captured files with empty MIME type; no visible confirmation that a file attached | 3 |
| **Machine** (authorization/infrastructure) | Cross-service lookup in storage rules denying all non-owner uploads; invalid deletion sentinel propagated into audit write | 2 |
| **Method** (presentation) | Fixed-height voucher container silently clipping signature block; unescaped rendering in expense dropdown | 2 |

**Pareto observation.** Seven of fourteen defect modes (50%) fall under non-atomic operations or state-classification logic, and these account for the entirety of the measured financial misstatement. Three defect modes concern **false signals presented to operators** — and this category, though smaller in count, produced the single largest measured defect volume (97 of 97 baseline defects). **Defect volume did not follow defect count.** The countermeasure priority was set accordingly.

### 4.4 FMEA Extract

Severity (S), Occurrence (O), and Detection (D) rated 1–10 by the project team; ratings are team-assigned estimates, not derived from historical failure frequency data (declared limitation).

| Failure mode | Effect | S | O | D | RPN | Priority |
|---|---|---|---|---|---|---|
| Post-save navigation to unreadable screen | Operator re-keys entire collection; gross income overstatement | 9 | 7 | 9 | **567** | 1 |
| Non-transactional identifier allocation | Member records overwritten; giving misattributed to wrong person | 8 | 8 | 8 | **512** | 2 |
| Non-atomic inter-fund transfer | One fund permanently debited without the other credited | 9 | 4 | 9 | **324** | 3 |
| Payment method ignored in fund routing | Bank transfers booked to cash-on-hand; persistent reconciliation variance | 7 | 8 | 5 | **280** | 4 |
| Retry-duplication in bulk save loop | Partial-failure retry resubmits already-committed records | 8 | 4 | 7 | **224** | 5 |
| Cash-advance return classified as income | Returned money inflates reported income | 6 | 5 | 6 | **180** | 6 |

**Detection ratings are uniformly poor (5–9) across the top failure modes.** This is the analytical justification for the control strategy in §6: the process had no means of detecting these failures other than a human noticing an implausible total weeks later. Improving detection was as important as eliminating occurrence.

---

## 5. IMPROVE

### 5.1 Countermeasure Design Principle

Countermeasures were selected in the following order of preference:

1. **Elimination by design** — make the failure state unrepresentable.
2. **Poka-yoke** — make the error impossible to commit.
3. **Detection** — surface the failure immediately and unambiguously.
4. **Procedure** — instruct the operator. *Used only where 1–3 were unavailable.*

No countermeasure in this project relies on operator vigilance as its primary control.

### 5.2 Countermeasure Register

| # | Root cause | Countermeasure | Type |
|---|---|---|---|
| 1 | Role-blind post-save navigation | Navigation target now evaluated against the roles the authorization layer actually permits to read the destination. The Money Counter remains on the entry screen with an explicit "Saved — ready for the next entry" confirmation. | Elimination |
| 2 | Opaque authorization errors | Save errors now pass through a diagnostic handler that names the role actually provisioned on the account and states explicitly that drafts were **not** lost. A future role-provisioning mismatch is now self-diagnosing rather than presenting as a broken page. | Detection |
| 3 | Non-transactional identifier allocation | Identifier allocation moved inside a database transaction. Each candidate document is read **within** the transaction; if another device claims the identifier between read and commit, the transaction retries rather than overwriting. The write is therefore always a create — precisely what the Money Counter's permissions allow. | Poka-yoke |
| 4 | Lexicographic sort over string identifiers | Allocation now scans all known identifier fields for the true maximum, counting only wholly-numeric codes toward the sequence. Timestamp-style imports and the legacy `NaN` record still count as **occupied** — they simply no longer define the next number. Identifiers reserved by unsaved drafts also count as occupied, so a multi-member batch correctly yields consecutive identifiers. | Poka-yoke |
| 5 | Non-atomic inter-fund transfer | Both sides of a transfer now commit as a single atomic batch — both writes succeed or neither does. A closed tab or network interruption can no longer debit one fund without crediting the other. | Elimination |
| 6 | Payment method ignored in routing | Fund routing now evaluates payment method. Only designated funds (Building, Mission, Investment) remain pinned to fixed accounts; all other offerings route to cash-in-bank when the payment method is a bank transfer, cash-on-hand otherwise. | Elimination |
| 7 | Retry-duplication in bulk save | Each draft item is now removed from the draft set as it individually commits, and the draft state is persisted after each commit rather than only at loop end. A retry after partial failure resubmits **only** what actually remains. | Elimination |
| 8 | Returned cash advances counted as income | Reclassified to the existing balance-only transfer convention. Fund balances still move correctly; income totals across all four reporting surfaces already exclude transfers, so no downstream change was required. | Elimination |
| 9 | Ledger-visibility field missing | The ordering field is now written on both affected paths. A one-time idempotent backfill was provided for historical records, which restores visibility without altering amounts, categories, or fund attribution. | Elimination + recovery |
| 10 | Cross-service lookup in storage authorization | The ownership check no longer performs a cross-service document lookup. Ownership is now established by embedding the operator identifier in the storage path itself. | Elimination |
| 11 | Files silently rejected on empty MIME type | Validation now falls back to file extension when the reported type is empty — the condition produced by camera captures on certain mobile browsers. | Elimination |
| 12 | No confirmation that a file attached | A live attachment list now displays each attached file's name and size with a per-file remove control. | Detection |
| 13 | Fixed-height container clipping signatures | Container converted from fixed height with overflow hidden to minimum height with flexible layout, with the signature row anchored to the bottom. Short documents still fill a half sheet; long ones grow and take their own page rather than losing their signature block. | Elimination |
| 14 | Unescaped rendering in dropdown | Routed through the existing escaping helper. | Elimination |

### 5.3 Improvement Verification

| Countermeasure | Verification method | Result |
|---|---|---|
| Correction of baseline week | Independent re-run of the read-only audit instrument after correction | **27 records, ₱41,300.00, zero remaining defect candidates** |
| Identifier allocation | Multi-member batch entry | Consecutive identifiers allocated correctly; no collision |
| Role authorization boundaries | End-to-end test against live production rules (see §6.2) | All five expected outcomes confirmed |
| Signature clipping | Dimensional measurement in headless browser at two content lengths | Before: signature block bottom edge **39 px beyond** the clipped container boundary. After: fully contained at both 2-line (94.8 mm) and 6-line (107.9 mm) content |

### 5.4 Correction of the Defective Population

Correction was executed under the measurement-system integrity controls described in §3.2: 98 records totalling ₱156,850 were removed, 26 records totalling ₱40,650 retained. A subsequent verification pass confirmed zero further candidates.

**A correction error was then detected and reversed.** The retained-set criterion was "records attributed to the Treasurer." One genuine collection — the ₱650 Sunday School offering — existed **only** in the Money Counter's set and was therefore removed by a criterion that was correct in general and wrong in this instance. It was restored from its deletion audit snapshot, yielding the verified final state of 27 records / ₱41,300.

This is reported rather than quietly corrected because it demonstrates the reversibility control functioning as designed, and because a correction method that could not be reversed would have permanently destroyed a genuine record. The restoration logic re-attributes the restored record to the Treasurer, so that a subsequent correction run cannot remove a record the Treasurer deliberately reinstated.

---

## 6. CONTROL

### 6.1 Control Plan

| Y / process step | Control mechanism | Type | Frequency | Owner | Reaction plan |
|---|---|---|---|---|---|
| Role authorization boundaries | Automated end-to-end permission test against live production rules | Automated, build-blocking | Every change deployment | Project lead | Build fails; deployment blocked until resolved |
| Operator attribution of every record | Immutable audit log; create permitted to any authenticated user, update restricted to Treasurer | Automated, continuous | Every mutating action | Treasurer | Attribution join available via audit instrument |
| Weekly income defect rate | Read-only weekly audit instrument | Manual, on-demand | Weekly (proposed cadence, §9) | Treasurer | Correction instrument, with restore available |
| Fund balance variance | Diagnostic tool scanning for the historical mis-routing signature, with running total for manual reassignment | Manual, on-demand | Monthly at reconciliation | Treasurer | Manual reassignment of identified records |
| Correction reversibility | Every removal writes the complete pre-deletion document to the audit log | Automated | Every correction | System | Restore instrument, create-only semantics |
| Identifier uniqueness | Transactional allocation with in-transaction read | Poka-yoke, continuous | Every allocation | System | Transaction retries automatically |
| Atomicity of paired writes | Batch commit | Poka-yoke, continuous | Every transfer | System | Both writes roll back together |

### 6.2 The Principal Control — Automated Authorization Regression Test

This is the control that most directly prevents recurrence of the highest-RPN failure mode, and its design merits specific description.

The test does **not** re-read the authorization rules file held in the source repository. That would test the intended configuration, which is not the question. The question is whether the account **as actually provisioned in production** can perform the task.

The test therefore:

1. Locates the account provisioned with the role under test.
2. Mints a credential for that account using an administrative signing key, so no password is required.
3. Exchanges it for a session token.
4. Issues data-layer calls **as that operator**, so each call is evaluated by the **deployed** rules exactly as it would be from that operator's own browser.

Assertions, ordered as the entry workflow requires them:

| Operation | Expected | Rationale |
|---|---|---|
| Read member records | ALLOW | Giver lookup |
| **Create member record** | **ALLOW** | Walk-in giver registration |
| **Update member record** | **DENY** | The boundary that produced the original failure — a write onto an existing identifier is an update, which is why allocation must always land on a free identifier |
| Create income record | ALLOW | Core task |
| **Read income records** | **DENY** | Why the operator must never be navigated to the ledger screen |

**Test hygiene controls:** test documents use an obviously synthetic identifier prefix and are removed with administrative credentials in a guaranteed-execution block regardless of outcome. The test income record carries **amount zero**, so that even its momentary existence cannot move a total on any screen holding a live subscription. The job exits non-zero on any unmet expectation.

**Explicit failure-mode coverage:** if no account carries the role at all, the test reports this condition by name. That is the "provisioned under a near-miss role label" failure mode, which every authorization rule would silently deny and which is otherwise extremely difficult to distinguish from a broken application.

### 6.3 Replication Evidence

Countermeasures 9–14 address processes declared out of scope in §2.4. They are recorded here as **replication of the project's countermeasure patterns into adjacent processes**, not as project benefit. The transactional-allocation pattern established for member identifiers was subsequently applied to voucher numbering in the cash-voucher process, under the same design rule: **never a client-side count-plus-one.**

### 6.4 Procedural Control

One procedural control was unavoidable. Because two re-keying attempts occurred after the corrective deployment from an already-open session, operators must **hard-refresh the application** to load a deployed correction. This is documented as a known weakness of the control set: it is the only control in this project that depends on operator action, and it is the one most likely to fail.

---

## 7. Results

| Measure | Baseline (Sept 2026 Wk 2) | Post-improvement | Status |
|---|---|---|---|
| Records recorded | 124 | 27 | Verified |
| Recorded weekly income | ₱197,500.00 | ₱41,300.00 | Verified |
| Defective records | 97 | 0 | Verified |
| Defect rate | 78.23% | 0% | Verified, **single period** |
| DPMO | 782,258 | 0 | Verified, **single period** |
| Process sigma | ≈ 0.72σ | Not yet establishable | **Requires multi-period data** |
| Distinct defect modes active in the value stream | 14 | 0 known | Verified by test and inspection |
| Failure modes with automated detection | 0 | 5 | Verified |

### 7.1 Benefit Statement

**The ₱156,200 overstatement is not a financial saving and is not claimed as one.** It is a measure of data-accuracy defect magnitude. Treating a corrected misstatement as a cost saving is a misrepresentation, and this submission does not make it.

Claimed benefits:

| Benefit | Type | Status |
|---|---|---|
| Elimination of re-keying rework (4 redundant full-collection entries in the baseline incident alone) | Soft — volunteer labour hours | Requires sponsor quantification |
| Elimination of reconciliation investigation effort for fund-balance variances | Soft — volunteer labour hours | Requires sponsor quantification |
| Avoidance of governance exposure from transmitting overstated income to District/Conference | Risk avoidance | Not quantified |
| Restoration of correct attribution of individual giving records | Compliance / member trust | Realized, not quantified |

**All hard-benefit figures are pending sponsor validation and are deliberately left unstated rather than estimated.**

---

## 8. Sustain / Ongoing Monitoring

| Activity | Cadence | Owner |
|---|---|---|
| Weekly income audit instrument run | Weekly, before report generation | Treasurer |
| Fund-balance reconciliation against bank statement and physical count | Monthly | Treasurer, verified by Auditor |
| Automated authorization regression test | Every deployment | Project lead |
| Review of defect rate trend against control limits | Quarterly, once 8 weeks of data exist (§9) | Treasurer, Finance Chair |

---

## 9. Data Collection Plan to Close the Statistical Gap

This plan is stated as a declared commitment, not as completed work.

| Metric | Source | Collection method | Target n |
|---|---|---|---|
| Weekly income defect rate | Audit instrument, weekly | Duplicate-group count ÷ total records | 8 consecutive weeks post-improvement |
| Pre-improvement defect rate | Audit instrument run retrospectively over historical weeks | Same method, applied to weeks preceding the corrective deployment | ≥ 8 weeks pre-improvement |
| Report approval cycle time | Timestamps on the report approval workflow records (submit → audit approval → finance approval → signature → finalize) | Elapsed time per transition | All periods on record |
| Fund-balance variance | Month-end reconciliation | Recorded balance minus verified balance | ≥ 6 months |

**This plan is what converts the submission from a well-instrumented single incident into a statistically demonstrated capability improvement.** Once collected, the pre/post defect rates support a two-proportion hypothesis test, and the weekly rates support a p-chart with control limits. The approval-cycle-time data is available **retrospectively** from existing workflow records and requires no new collection.

---

## 10. Sponsor Verification

| Field | Entry |
|---|---|
| Project sponsor / champion | *[Name], Church Treasurer — or Chairperson, Administrative Council]* |
| Sponsor attests | The candidate led this project; the process described is a real process of this organization; the baseline and result figures are accurate |
| Signature | ______________________ |
| Date | ______________________ |

---

## 11. Declared Limitations

Stated plainly, because a reviewer will identify them regardless and an undeclared limitation reads as a concealed one.

1. **No pre-project baseline was collected before the improvement work began.** The baseline in §3.3 was established during the investigation of a reported incident, not in advance of a planned intervention. Retrospective baseline reconstruction is possible using the same instrument (§9) and is committed to, but has not been performed at time of writing.

2. **The result rests on a single reporting period (n = 1).** A defect rate of 0% for one week is not a demonstration of sustained capability. The post-improvement process sigma is deliberately left unstated rather than computed from one period.

3. **FMEA ratings are team-assigned estimates**, not derived from historical failure-frequency data, because that data did not exist prior to the measurement system being built.

4. **No classical MSA was performed.** The attribute agreement evidence in §3.2 is naturally occurring rather than designed, with n = 1 comparison between two appraisers.

5. **An upstream process was identified and not addressed.** The two independent counts of the same collection disagreed on one offering category, which indicates appraiser variation in the **counting and classification** step upstream of record entry. This project addressed the recording process only. This is the most significant declared scope exclusion and is the recommended successor project.

6. **Financial benefit is unquantified.** Soft benefits are identified but not costed; no hard saving is claimed.

7. **One control depends on operator action** (§6.4), and is known to have failed during the baseline incident itself.

8. **Two conditions were deliberately left unchanged pending process-owner decision**, and remain open: manually entered opening balances carry no reconciliation check against existing transactions; and expenses in pending status reduce recorded available cash before disbursement actually occurs. Both can produce a persistent recorded-versus-physical variance. Neither is a defect in the strict sense — each requires a policy decision the process owner alone can make.

---

## 12. Evidence Index

All figures in this document are traceable to primary records. A reviewer may verify against:

| Evidence | Location |
|---|---|
| Incident log, root-cause findings, correction outcomes | `PHASE-PLAN.md` — sections dated 2026-09-13 |
| Fund-balance defect audit | `PHASE-PLAN.md` — "Cash on Hand / Cash in Bank Mismatch Audit" |
| Measurement instrument (read-only) | `scripts/audit-income-week.js` |
| Correction instrument | `scripts/prune-income-week.js` |
| Reversal instrument | `scripts/restore-income-from-audit.js` |
| Authorization regression test | `scripts/test-money-counter-permissions.js` |
| Test execution definition | `.github/workflows/test-role-permissions.yml` |
| Authorization rules under test | `firestore.rules` |
| Role-to-process mapping | `ARCHITECTURE-REVIEW.md` §3 |
| Change history, dated | Version control log, 2026-07-23 through 2026-09-13 |

---

*Prepared for submission to a Lean Six Sigma certifying body. All operational figures are drawn from primary system records; member identities are pseudonymized.*
