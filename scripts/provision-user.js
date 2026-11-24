// Admin-only user provisioning script for GraceBooks.
//
// Creates (or reuses) a Firebase Auth user and writes the matching
// `userProfiles/{uid}` Firestore document, per the manual steps documented
// in AUTH-MIGRATION.md. Client-side writes to `userProfiles` are denied by
// firestore.rules on purpose, so this has to run with a service account
// (see .github/workflows/provision-user.yml, which is the intended way to
// invoke this: it injects the FIREBASE_SERVICE_ACCOUNT GitHub secret and
// never persists it anywhere).
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
//   GB_USERNAME              - username or full email for the account
//   GB_NAME                  - display name stored on the profile doc
//   GB_ROLE                  - must exactly match one of VALID_ROLES
// Optional:
//   GB_RESET_PASSWORD         - 'true' to give an EXISTING account a new
//                                temporary password. New accounts always
//                                get one.
//
// PASSWORDS NEVER GO INTO THE LOG OR THE WORKFLOW INPUTS. This repository
// and its Actions logs are public, and GitHub prints a step's inputs in the
// log, so the temporary password is generated here and stored in
// pendingPasswords/{uid}, which only the Treasurer can read - the GraceBooks
// dashboard shows it to the Treasurer to hand out, then erase. The log only
// says which role was provisioned.

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

const VALID_ROLES = [
  'Treasurer',
  'Pastor',
  'Finance Chair',
  'Chairperson',
  'Deaconess',
  'Admin Assistant',
  'Auditor',
  'District',
  'Money Counter',
  'Membership Secretary',
  'Finance Committee'
];

function normalizeEmail(rawUsername) {
  const username = String(rawUsername || '').trim().toLowerCase();
  return username.includes('@') ? username : `${username}@gracebooks.local`;
}

function generatePassword() {
  // 16 random bytes -> base64url, trimmed to a comfortable length. Only
  // used for brand-new accounts with no explicit GB_PASSWORD supplied.
  return crypto.randomBytes(16).toString('base64url').slice(0, 20);
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const rawUsername = process.env.GB_USERNAME;
  const name = (process.env.GB_NAME || '').trim();
  const role = (process.env.GB_ROLE || '').trim();
  const resetPassword = String(process.env.GB_RESET_PASSWORD || '').toLowerCase() === 'true';

  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  if (!rawUsername) throw new Error('GB_USERNAME is required.');
  if (!name) throw new Error('GB_NAME is required.');
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`GB_ROLE "${role}" is not a valid role. Valid roles: ${VALID_ROLES.join(', ')}`);
  }

  const email = normalizeEmail(rawUsername);
  const serviceAccount = JSON.parse(serviceAccountJson);

  const app = initializeApp({
    credential: cert(serviceAccount)
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  let userRecord;
  let created = false;
  let tempPassword = null;

  try {
    userRecord = await auth.getUserByEmail(email);
    if (resetPassword) {
      tempPassword = generatePassword();
      await auth.updateUser(userRecord.uid, { password: tempPassword });
    }
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    tempPassword = generatePassword();
    userRecord = await auth.createUser({
      email,
      password: tempPassword,
      displayName: name,
      emailVerified: false
    });
    created = true;
  }

  await db.collection('userProfiles').doc(userRecord.uid).set({ name, role }, { merge: true });
  // storage.rules reads the role from this custom claim (see
  // scripts/security-migration.js); keep it in step with the profile.
  await auth.setCustomUserClaims(userRecord.uid, { ...(userRecord.customClaims || {}), role });

  if (tempPassword) {
    await db.collection('pendingPasswords').doc(userRecord.uid).set({
      username: email.endsWith('@gracebooks.local') ? email.replace('@gracebooks.local', '') : email,
      name, role, password: tempPassword,
      reason: created ? 'new account' : 'password reset',
      createdAt: new Date().toISOString()
    });
  }

  const outcome = created
    ? 'New account created'
    : tempPassword ? 'Existing account - password reset' : 'Existing account - profile/role updated, password unchanged';
  const summary = [
    '## GraceBooks user provisioned',
    '',
    `- Role: ${role}`,
    `- Result: ${outcome}`,
    tempPassword
      ? '- The temporary password is waiting on the Treasurer\'s GraceBooks dashboard ("New account passwords to hand out"). It is not shown here because this log is public.'
      : ''
  ].filter(Boolean).join('\n') + '\n';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main().catch((err) => {
  console.error('Provisioning failed:', err.message || err);
  process.exit(1);
});
