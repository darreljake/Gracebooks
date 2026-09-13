// Test run: can a Money Counter actually add a new tither and save income?
//
// This is an END-TO-END permission test against the LIVE security rules, not a
// re-reading of firestore.rules. It mints a custom token for the real Money
// Counter account (firebase-admin signs it locally with the service account
// key), exchanges it for an ID token, and then performs Firestore REST calls
// *as that user*, so every call is evaluated by the deployed rules exactly as
// it would be from tithe-entry.html in the counter's browser.
//
// Why this and not the rules emulator: the emulator would test the rules file
// in this repo, which is not the question. The question is whether the account
// as provisioned - its `userProfiles/{uid}.role` string, against the rules
// actually deployed - can do the job.
//
// What it checks, in the order the entry flow needs them:
//   1. members  read   - the type-ahead/lookup on tithe-entry.html
//   2. members  create - ADDING A NEW TITHER (the reported problem)
//   3. members  update - expected DENY; this is why tithe-entry.html must never
//                        write onto an existing member id (a `set` onto an
//                        existing doc is an update), hence createNewMemberDoc()
//   4. income   create - saving the collection
//   5. income   read   - expected DENY; why a counter must not be sent to
//                        income-log.html after saving
//
// Test documents are written under an obviously-fake id and DELETED in a
// finally block with admin credentials, whatever the outcome. The test income
// row is written with amount 0 so that even its brief existence cannot move a
// total on a page with a live listener.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
// Optional env vars:
//   GB_ROLE        - role to test as; default "Money Counter"
//   GB_WEB_API_KEY - Firebase Web API key. Defaults to the one in
//                    public/tithe-entry.html (public by design - it ships in
//                    every page of the site), so there is no second copy to
//                    keep in sync.

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

function webApiKeyFromSource() {
  const file = path.join(__dirname, '..', 'public', 'tithe-entry.html');
  const m = fs.readFileSync(file, 'utf8').match(/apiKey:\s*"([^"]+)"/);
  if (!m) throw new Error('Could not read apiKey from public/tithe-entry.html - pass GB_WEB_API_KEY.');
  return m[1];
}

// --- Firestore REST helpers, called with the *user's* ID token -------------
function docPath(projectId, collection, docId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}` +
    (docId ? `/${docId}` : '');
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') fields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return { fields };
}

async function asUser(idToken, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let detail = '';
  if (!res.ok) {
    try {
      const j = await res.json();
      detail = j.error && j.error.message ? j.error.message : '';
    } catch (_) { /* non-JSON error body */ }
  }
  return { ok: res.ok, status: res.status, detail };
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');

  const roleUnderTest = (process.env.GB_ROLE || 'Money Counter').trim();
  const apiKey = (process.env.GB_WEB_API_KEY || '').trim() || webApiKeyFromSource();

  const serviceAccount = JSON.parse(serviceAccountJson);
  const projectId = serviceAccount.project_id;
  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);

  // Find the account actually provisioned with this role.
  const profiles = await db.collection('userProfiles').where('role', '==', roleUnderTest).get();
  const out = [];
  out.push(`## Permission test run - "${roleUnderTest}" adding a new tither`);
  out.push('');

  if (profiles.empty) {
    out.push(`**No \`userProfiles\` document has \`role == "${roleUnderTest}"\`.**`);
    out.push('');
    out.push('Every rule in `firestore.rules` matches the role string exactly, so an account');
    out.push('provisioned with a different spelling (for example "Counter") is denied everything');
    out.push('a Money Counter should be allowed to do. Fix the profile role, then re-run.');
    const text = out.join('\n');
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
    process.exit(1);
  }

  const profileDoc = profiles.docs[0];
  const uid = profileDoc.id;
  out.push(`Testing as \`userProfiles/${uid}\` - name "${profileDoc.data().name || '(unnamed)'}", role "${profileDoc.data().role}".`);
  if (profiles.size > 1) out.push(`(${profiles.size} accounts carry this role; testing the first.)`);
  out.push('');

  // Sign in as that user: custom token -> ID token. The service account key
  // signs the custom token locally, so this needs no password.
  const customToken = await getAuth(app).createCustomToken(uid);
  const signInRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  const signIn = await signInRes.json();
  if (!signInRes.ok || !signIn.idToken) {
    throw new Error(`Could not sign in as ${uid}: ${JSON.stringify(signIn.error || signIn)}`);
  }
  const idToken = signIn.idToken;

  const stamp = Date.now();
  const testMemberId = `ZZ-PERMTEST-${stamp}`;
  const testIncomeId = `ZZ-PERMTEST-INCOME-${stamp}`;
  const results = [];

  try {
    // 1. Read the member roster (type-ahead / lookup on tithe-entry.html).
    const readMembers = await asUser(idToken, 'GET', docPath(projectId, 'members') + '?pageSize=1');
    results.push({ step: '`members` read (member lookup)', expected: 'ALLOW', ok: readMembers.ok, status: readMembers.status, detail: readMembers.detail });

    // 2. THE REPORTED CASE: add a new tither.
    const createMember = await asUser(idToken, 'POST',
      docPath(projectId, 'members') + `?documentId=${encodeURIComponent(testMemberId)}`,
      toFirestoreFields({
        memberId: testMemberId, first: 'Permission', last: 'Test',
        type: 'Professing', status: 'Active', contact: '', email: '', address: '',
        joinedDate: new Date().toISOString()
      }));
    results.push({ step: '`members` create (**add a new tither**)', expected: 'ALLOW', ok: createMember.ok, status: createMember.status, detail: createMember.detail });

    // 3. Update the member we just created - expected to be refused. This is
    //    the boundary that broke the entry flow: a `set` onto an EXISTING
    //    document id is an update, not a create.
    if (createMember.ok) {
      const updateMember = await asUser(idToken, 'PATCH',
        docPath(projectId, 'members', testMemberId),
        toFirestoreFields({ memberId: testMemberId, first: 'Permission', last: 'Test EDITED' }));
      results.push({ step: '`members` update (overwriting an existing id)', expected: 'DENY', ok: !updateMember.ok, status: updateMember.status, detail: updateMember.detail });
    } else {
      results.push({ step: '`members` update (overwriting an existing id)', expected: 'DENY', ok: null, status: '-', detail: 'skipped - the create above failed' });
    }

    // 4. Save an income row (amount 0 so a live listener sees nothing move).
    const createIncome = await asUser(idToken, 'POST',
      docPath(projectId, 'income') + `?documentId=${encodeURIComponent(testIncomeId)}`,
      toFirestoreFields({
        date: new Date().toISOString().slice(0, 10),
        memberId: testMemberId, member: 'PERMISSION TEST - auto-deleted', type: 'Source of Funds',
        amount: 0, payment: 'Cash', budgetCategory: 'PERMISSION TEST', budgetDetails: '',
        notes: 'Written and deleted by scripts/test-money-counter-permissions.js',
        targetAccount: 'cash-hand', timestamp: new Date().toISOString()
      }));
    results.push({ step: '`income` create (save the collection)', expected: 'ALLOW', ok: createIncome.ok, status: createIncome.status, detail: createIncome.detail });

    // 5. Read income back - expected to be refused, which is exactly why a
    //    counter must not be redirected to income-log.html after saving.
    const readIncome = await asUser(idToken, 'GET', docPath(projectId, 'income') + '?pageSize=1');
    results.push({ step: '`income` read (income-log.html)', expected: 'DENY', ok: !readIncome.ok, status: readIncome.status, detail: readIncome.detail });
  } finally {
    // Always clean up, with admin credentials, whatever happened above.
    await db.collection('members').doc(testMemberId).delete().catch(() => {});
    await db.collection('income').doc(testIncomeId).delete().catch(() => {});
  }

  out.push('| Check | Expected | Result | HTTP |');
  out.push('|---|---|---|---|');
  results.forEach((r) => {
    const verdict = r.ok === null ? 'SKIPPED' : (r.ok ? 'PASS' : 'FAIL');
    out.push(`| ${r.step} | ${r.expected} | **${verdict}** | ${r.status}${r.detail ? ` - ${r.detail}` : ''} |`);
  });
  out.push('');

  const failed = results.filter((r) => r.ok === false);
  if (failed.length === 0) {
    out.push(`**All checks passed.** A "${roleUnderTest}" can look up members, add a new tither, and save income; it cannot overwrite an existing member or read the income log, which is the intended boundary.`);
  } else {
    out.push(`**${failed.length} check(s) failed.** See the HTTP column for the rule denial.`);
  }
  out.push('');
  out.push(`Test documents \`members/${testMemberId}\` and \`income/${testIncomeId}\` were deleted.`);

  const text = out.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Permission test failed to run:', err.message || err);
  process.exit(1);
});
