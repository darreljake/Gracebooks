# Security Review & Remediation Plan (2026-10-24)

Scope: the whole repo (`public/`, `firestore.rules`, `storage.rules`, `firebase.json`,
`auth.js`, `.github/workflows/`, `scripts/`). Findings were confirmed by reading the code.
None were exploited against the live project.

## 1. The PHP question

**GraceBooks contains no PHP and runs no server of its own.** There are no `.php` files, no
`.htaccess` and no `composer.json`. The app is static HTML/JS on Firebase Hosting. It talks
straight to Google-managed Firestore, Auth and Storage. A PHP vulnerability (in the PHP
interpreter, a framework like Laravel or WordPress, or a CGI setup) has nothing here to
attack.

The app could still be touched by such an outbreak in three indirect ways:

- **Credential reuse.** PHP-site breaches leak password databases. If a GraceBooks user
  (especially the Treasurer) uses the same password on a breached site (a forum, a
  WordPress blog, a webmail), attackers can use it here. This is the most realistic risk:
  it needs no flaw in GraceBooks at all. See items A3 and A4.
- **Phishing that rides the news.** "Your account was affected, re-enter your password"
  messages. The fix is the same: MFA and unique passwords.
- **Compromised third-party scripts.** Every page loads Firebase from `gstatic.com` and
  SheetJS/html2pdf from `cdnjs`, with no integrity check (see B4). That is a supply-chain
  risk, not a PHP one, but it is the same kind of internet-wide incident.

The real attack surface is **Firestore/Storage rules + who can sign in + what the browser
renders.** Everything below is about that.

## 2. Findings (most severe first)

### Critical / High

**A1. Stored XSS: a low-trust role can run code as the Treasurer.**
Money Counter and Membership Secretary can `create` documents in `members`. Several
Treasurer-facing pages put member fields into `innerHTML` without escaping:
- `tithers.html:278-285` puts `m.memberId`, `m.last`, `m.first`, `m.contact`, `m.type`
  and `m.status` in raw.
- `tithe-entry.html:1582-1586` (member suggestions) and `:1804-1810` (draft table) put
  the member name and code in raw. This page also has no `escapeHtml` at all.
- The same pattern probably exists elsewhere: 27 pages use `innerHTML` about 350 times,
  and escaping depends on each page remembering to do it.

Attack: a member saved with the last name `<img src=x onerror="...">` runs that script in
the Treasurer's signed-in browser the next time the Treasurer opens Tithers. The script
then has full Treasurer power: delete income or expenses, rewrite budgets, delete audit
logs, export the membership roll. **This is the one finding that turns any low-level
account into total control.**

**A2. No backups, and the Treasurer can delete the audit trail.**
`auditLogs` allows `update, delete` for the Treasurer. Nothing in the repo or
`PHASE-PLAN.md` mentions scheduled Firestore exports, Point-in-Time Recovery or delete
protection. One compromised Treasurer session (through A1, a reused password or a stolen
laptop) can delete every collection *and* the logs that would show it happened. There
would be no way to recover. This is the "ruin data" scenario.

**A3. Password-only sign-in, no MFA, guessable usernames.**
Login uses `username@gracebooks.local`, and usernames tend to be predictable (role or
first names). There is no second factor. The Treasurer's account is the whole system.

**A4. App Check is not active.**
`auth.js:11` has `APP_CHECK_SITE_KEY = ''`. Anyone can call the Firebase APIs directly
with the public config in `auth.js` from scripts, not just from the app. That allows
automated password guessing against Auth and scripted reads with a stolen session.
(`ARCHITECTURE-REVIEW.md` already lists this as a known gap.)

**A5. Possible open self-registration, combined with `signedIn()`-only rules.**
`signedIn()` only checks `request.auth != null`. If Email/Password **sign-up** is still
enabled in the Firebase Console (the default), anyone can create an account with the
public API key. With no `userProfiles` doc, that account can still:
- read **every Storage file**: receipts, signatures, count sheets, report-archive
  snapshots (paths need IDs, which lowers but does not remove the risk),
- read `attendance` and `notifications`,
- create `notifications` and `auditLogs` entries (spam or forged audit lines),
- upload up to 5 MB files without limit into `count-sheets/*/{ownUid}/` and
  `liquidation-receipts/*/{ownUid}/` (storage-cost abuse).

Whether sign-up is open must be checked in the Console (Authentication > Settings >
User actions). Either way, the rules should not depend on it.

### Medium

**B1. Business-rule gaps in the Firestore rules (insider fraud).** The rules check *who*
can write, almost never *what* gets written:
- `income` create (Money Counter): no checks on `amount` (it can be negative or huge),
  `date`, `type` (it can be `'transfer'`, which the reports treat differently),
  account, or `createdBy`.
- `liquidationRequests` create (Pastor/Deaconess/Admin Assistant): only `requesterUid`
  is checked. A staff member can create a request **already** `Approved` or `Released`,
  skip Treasurer approval and go straight to "Liquidation Submitted".
- `reportReviews` update (Auditor, Finance Chair, Chairperson, Pastor): any field. A
  signer could mark *other* signers' approvals or signatures, or set the final status.
- `auditLogs` create: `actorUid`, `actorName` and `actorRole` come from the client, so
  any signed-in user can write an entry that claims to be someone else.

**B2. Signature images are public through the certificate verify page.**
`certificates` allows `get: if true`. The doc stores
`signatures.treasurer/pastor.signatureUrl`, which is a tokenized Storage download URL,
and tokenized URLs work without signing in. Anyone holding a certificate (or its QR
code) can download the Treasurer's and Pastor's signature images, and with them forge
vouchers or letters. The public doc also carries the member's name and giving totals.

**B3. Storage reads are "any signed-in user" for everything.**
Payroll-linked receipts, signatures and archived financial reports are all readable by,
for example, a Money Counter or Membership Secretary who learns a path. The Firestore
rules are role-gated, but the files behind them are not.

**B4. No hosting security headers and no Subresource Integrity.**
`firebase.json` sets no `Content-Security-Policy`, `X-Frame-Options` /
`frame-ancestors`, `Referrer-Policy` or `Permissions-Policy`. Pages can be framed by
other sites (clickjacking a Treasurer into clicking "Delete"). The CDN `<script>` tags
have no `integrity=` attribute, so a tampered CDN file would run with full access.

**B5. Upload type checks trust the browser.** `image/.*` also admits `image/svg+xml`,
which can carry script. Files are served from the `firebasestorage.googleapis.com`
origin, not the app's origin, which limits the damage. Still, report-archive HTML
snapshots and SVGs open in a new tab and could carry phishing content. Magic-byte
validation is already listed as deferred in `ARCHITECTURE-REVIEW.md`.

### Low / operational

- **C1. The access cutoff is 1 Jan 2027, 69 days from now.** `testingAccessOpen()` in
  both rules files (and `TESTING_END_DATE` in `index.html`) will lock **everyone** out on
  that date. This is not an attack, but it is a scheduled total outage. It needs a
  decision: extend it, or remove it as part of this hardening.
- **C2. The Treasurer UID is hard-coded in `storage.rules` (`isTreasurer()`).** If that
  account is ever recreated (for example after a compromise), Storage silently stops
  working for the Treasurer. Role-based checks would be better (see the plan).
- **C3. The deploy workflow runs `firebase-tools@latest` on every push to `main`.** Anyone
  with push rights, or a compromised npm release, can redeploy rules. Pin the version and
  protect `main` (required review). The `FIREBASE_SERVICE_ACCOUNT` secret should have only
  the roles it needs (Hosting Admin + Firebase Rules Admin, not Owner/Editor).
  `provision-user`, `income-week-cleanup` and the other admin workflows use the same
  powerful key.
- **C4. The `sessionStorage` role is used for UI gating.** This is fine because the rules
  enforce access. Just never let it be the only check for a new feature.

## 3. Remediation plan

Ordered by how much risk each step removes for the effort. Items marked **(Console)**
need a project owner in the Firebase/Google Cloud Console and cannot be done from the repo.

### Phase S1 — this week (stop the worst outcomes)

1. **(Console) Turn on backups.** Enable Firestore **Point-in-Time Recovery** (7-day
   rollback) and **delete protection** on the database. Add a scheduled daily managed
   export to a separate GCS bucket with a retention lock. Do a test restore once.
   *(Fixes A2.)*
2. **(Console) Lock down Auth.** Disable self-sign-up (only `provision-user.yml` /
   the Console create users). Enable **email enumeration protection**. Set a password
   policy (12+ characters). Have every user, starting with the Treasurer, set a unique
   password that is not used anywhere else. *(Fixes A3 and A5.)*
3. **Fix the stored XSS.** Add `escapeHtml` to `tithe-entry.html` and escape every
   member, payee, notes and label field in `tithers.html`, `tithe-entry.html`, and every
   other `innerHTML` template that renders Firestore text. Sweep all 27 pages. Also
   reject `<`, `>` and `"` in member names at create time. *(Fixes A1.)*
4. **Decide on the 1 Jan 2027 cutoff** (C1) before it fires.

### Phase S2 — next 2–3 weeks (harden the rules)

5. **Require a real profile for `signedIn()`:** `request.auth != null &&
   exists(/databases/$(database)/documents/userProfiles/$(request.auth.uid))`. Storage
   rules can do the same with `firestore.exists()`. If `firestore.get()` is still
   unreliable there (see the existing comment in `storage.rules`), at least gate it with
   a custom claim set by `provision-user.js`. *(Fixes A5 and B3.)*
6. **Make audit logs append-only:** `allow update, delete: if false` on `auditLogs`.
   Require `request.resource.data.actorUid == request.auth.uid` and
   `actorRole == role()` on create. *(Fixes A2 and B1.)*
7. **Add field validation to the riskiest writes:**
   - `income` create by Money Counter: `amount is number && amount > 0 && amount <
     <sane cap>`, `type != 'transfer'`, `date is string`, and a key allowlist.
   - `liquidationRequests` create by staff: `status == 'Submitted'` only.
   - `reportReviews` update: each non-Treasurer signer may only change their own
     approval or signature keys (`affectedKeys().hasOnly([...])`, checked against their
     role).
   - `notifications` create: `actorUid == request.auth.uid`, and a size limit on
     `message`.
8. **Storage per role:** restrict `signatures/*` and `voucher-signatures/*` reads to
   the signing/reviewing roles. Restrict report-archive reads to the archive roles.
   Replace the hard-coded Treasurer UID with the role check from step 5. Narrow
   `image/.*` to `image/(jpeg|png|webp|heic|heif)`. *(Fixes B3, B5 and C2.)*
9. **Stop exposing signature URLs publicly:** keep only `certNo`, `status`, `issuedAt`,
   `periodLabel` and the signer **names** in the publicly readable certificate fields.
   Move signature URLs and amounts to a role-gated subdocument, or render the signed PDF
   at issue time. *(Fixes B2.)*
10. Extend `scripts/test-money-counter-permissions.js` / `test-role-permissions.yml` to
    try each of the above as the wrong role, so a rule regression fails CI.

### Phase S3 — within a month (defence in depth)

11. **(Console + repo) Activate App Check:** register a reCAPTCHA Enterprise/v3 key, put
    it in `APP_CHECK_SITE_KEY`, watch the metrics for a week, then **Enforce** for
    Firestore, Storage and Auth. *(Fixes A4.)*
12. **(Console) MFA for the Treasurer and Auditor:** upgrade to Identity Platform (free
    tier) and enable TOTP/SMS second factor, which needs a small sign-in change in
    `index.html`. *(Fixes A3.)*
13. **Hosting headers in `firebase.json`:** `Content-Security-Policy` (scripts only from
    self, `www.gstatic.com`, `cdnjs.cloudflare.com`, `frame-ancestors 'self'`;
    `'unsafe-inline'` is needed for now because of the inline scripts),
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and
    `Permissions-Policy`. Add `integrity=` + `crossorigin` to the cdnjs tags, or vendor
    them into `public/`. *(Fixes B4.)*
14. **CI hygiene:** pin `firebase-tools` to an exact version, require PR review on
    `main`, and narrow the service account's IAM roles. Consider a separate key for the
    data-changing admin workflows. *(Fixes C3.)*
15. **(Console) Alerting:** set a budget alert on the project, plus a Cloud Monitoring
    alert on unusual Firestore delete counts or Auth failure spikes.

### Ongoing

- Before each deploy, review any new `innerHTML` template for unescaped Firestore text.
- Every quarter, review the user list and remove accounts of people who have left a
  role.
- Every year, rotate the GitHub service-account key.
