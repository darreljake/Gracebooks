// One-off admin script: seed the membershipRoll Firestore collection from
// the official church membership roll the owner supplied
// (StatisticsTagaytay_UMC_Members...xlsx, Jan 2026), matching the schema
// public/members.html reads/writes (memberId/lastName/firstName/layOrg/
// membershipType/ageLevel/status).
//
// Never overwrites a document that already exists (e.g. one already
// edited by hand in the app) - it only creates missing records, so this
// is safe to re-run after partial imports or after someone has started
// editing the roll in the app.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
// Optional env vars:
//   GB_APPLY - "true" to actually write changes; anything else (including
//               unset) performs a dry run that only lists what WOULD be
//               created.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const records = require('./data/membership-roll-seed.json');

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  const apply = (process.env.GB_APPLY || '').trim().toLowerCase() === 'true';

  const serviceAccount = JSON.parse(serviceAccountJson);
  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);

  const toCreate = [];
  const alreadyExists = [];
  for (const record of records) {
    const snap = await db.collection('membershipRoll').doc(record.memberId).get();
    if (snap.exists) {
      alreadyExists.push(record.memberId);
    } else {
      toCreate.push(record);
    }
  }

  const summaryLines = [
    '## Membership roll seed',
    '',
    `- Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`,
    `- Source records: ${records.length}`,
    `- Already in membershipRoll (skipped, never overwritten): ${alreadyExists.length}`,
    `- To create: ${toCreate.length}`,
    ''
  ];
  console.log(summaryLines.join('\n'));

  if (apply && toCreate.length > 0) {
    const createdAt = new Date().toISOString();
    let batch = db.batch();
    let opsInBatch = 0;
    for (const record of toCreate) {
      const ref = db.collection('membershipRoll').doc(record.memberId);
      batch.set(ref, record);
      opsInBatch++;
      if (opsInBatch === 400) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    if (opsInBatch > 0) await batch.commit();

    await db.collection('auditLogs').add({
      action: 'members_imported',
      collection: 'membershipRoll',
      docId: null,
      summary: `Seeded ${toCreate.length} members from the official membership roll (admin script)`,
      before: null,
      after: { count: toCreate.length },
      actorUid: 'seed-membership-roll-script',
      actorEmail: '',
      actorName: 'Membership Roll Seed Script',
      actorRole: 'Treasurer',
      createdAt
    });
    console.log(`\nCreated ${toCreate.length} member record(s) in membershipRoll.`);
  } else if (!apply && toCreate.length > 0) {
    console.log('\nDry run only - re-run with GB_APPLY=true to write these changes.');
  } else {
    console.log('\nNothing to do.');
  }

  const summary = summaryLines.join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
