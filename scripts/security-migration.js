// Idempotent security migration, run by .github/workflows/firebase-deploy.yml
// BEFORE the rules are deployed (and safe to re-run any time):
//
//   1. Role custom claims - copies userProfiles/{uid}.role onto each Auth
//      user's `role` claim, which storage.rules reads (Storage rules do not
//      read Firestore). A user's open session picks the claim up when its
//      token refreshes (within an hour); until then storage.rules treats a
//      claim-less token the old way, so nobody is locked out mid-session.
//   2. Public certificate verification copies - writes
//      certificateVerifications/{id} for every certificate (the only thing
//      verify-certificate.html may read without signing in). Same shape as
//      verificationCopy() in public/certificate-of-giving.html - keep in step.
//
// PRINTS COUNTS ONLY. The repository and its Actions logs are public, so no
// names, emails, uids or amounts are ever logged here.
//
// Required env: FIREBASE_SERVICE_ACCOUNT (service account JSON string).

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function verificationCopy(c) {
  const sig = c.signatures || {};
  return {
    certNo: c.certNo || '',
    memberName: c.memberName || '',
    periodLabel: c.periodLabel || '',
    grandTotal: Number(c.grandTotal || 0),
    issuedAt: c.issuedAt || '',
    status: c.status || 'issued',
    fullySigned: !!(sig.treasurer && sig.pastor)
  };
}

async function syncRoleClaims(auth, db) {
  const profiles = await db.collection('userProfiles').get();
  let updated = 0, unchanged = 0, missingUser = 0;
  for (const doc of profiles.docs) {
    const role = String(doc.data().role || '').trim();
    if (!role) continue;
    let user;
    try {
      user = await auth.getUser(doc.id);
    } catch (err) {
      if (err.code === 'auth/user-not-found') { missingUser++; continue; }
      throw err;
    }
    const claims = user.customClaims || {};
    if (claims.role === role) { unchanged++; continue; }
    await auth.setCustomUserClaims(doc.id, { ...claims, role });
    updated++;
  }
  console.log(`Role claims: ${updated} updated, ${unchanged} already current, ${missingUser} profile(s) without an Auth user.`);
}

async function syncCertificateVerifications(db) {
  const [certs, vers] = await Promise.all([
    db.collection('certificates').get(),
    db.collection('certificateVerifications').get()
  ]);
  const have = new Map(vers.docs.map(d => [d.id, d.data()]));
  const keys = ['certNo', 'memberName', 'periodLabel', 'grandTotal', 'issuedAt', 'status', 'fullySigned'];
  let batch = db.batch(), pending = 0, written = 0;
  for (const doc of certs.docs) {
    const want = verificationCopy(doc.data());
    const cur = have.get(doc.id);
    if (cur && keys.every(k => cur[k] === want[k])) continue;
    batch.set(db.collection('certificateVerifications').doc(doc.id), { ...want, updatedAt: new Date().toISOString() });
    pending++; written++;
    if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  console.log(`Certificate verification copies: ${written} written, ${certs.size - written} already current.`);
}

async function main() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  const app = initializeApp({ credential: cert(JSON.parse(json)) });
  const auth = getAuth(app);
  const db = getFirestore(app);
  await syncRoleClaims(auth, db);
  await syncCertificateVerifications(db);
}

main().catch((err) => {
  // Message only - never the stack's data.
  console.error('Security migration failed:', err.message || err);
  process.exit(1);
});
