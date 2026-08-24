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
//   GB_PASSWORD               - explicit password; a random one is
//                                generated and only used when this is a
//                                brand-new account and no password was given

const admin = require('firebase-admin');
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
  const explicitPassword = process.env.GB_PASSWORD;

  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  if (!rawUsername) throw new Error('GB_USERNAME is required.');
  if (!name) throw new Error('GB_NAME is required.');
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`GB_ROLE "${role}" is not a valid role. Valid roles: ${VALID_ROLES.join(', ')}`);
  }

  const email = normalizeEmail(rawUsername);
  const serviceAccount = JSON.parse(serviceAccountJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const auth = admin.auth();
  const db = admin.firestore();

  let userRecord;
  let created = false;
  let tempPassword = null;

  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Existing Auth user found for ${email} (uid: ${userRecord.uid}). Password left unchanged.`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    tempPassword = explicitPassword || generatePassword();
    userRecord = await auth.createUser({
      email,
      password: tempPassword,
      displayName: name,
      emailVerified: false
    });
    created = true;
    console.log(`Created new Auth user for ${email} (uid: ${userRecord.uid}).`);
  }

  await db.collection('userProfiles').doc(userRecord.uid).set({ name, role }, { merge: true });
  console.log(`Wrote userProfiles/${userRecord.uid} -> { name: "${name}", role: "${role}" }`);

  const summaryLines = [
    '## GraceBooks user provisioned',
    '',
    `- Email/username: \`${email}\``,
    `- UID: \`${userRecord.uid}\``,
    `- Name: ${name}`,
    `- Role: ${role}`,
    `- Auth account: ${created ? 'newly created' : 'already existed (password unchanged)'}`
  ];
  if (created) {
    summaryLines.push(
      '',
      `**Temporary password:** \`${tempPassword}\``,
      '',
      '⚠️ This appears once, here, in this workflow run\'s summary/log. Sign in with it and ' +
      'immediately use the "Change Password" button (key icon) on the GraceBooks dashboard to set a permanent one.'
    );
  }
  const summary = summaryLines.join('\n') + '\n';
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main().catch((err) => {
  console.error('Provisioning failed:', err.message || err);
  process.exit(1);
});
