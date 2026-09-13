// One-off admin script: put an `income` document back, rebuilt from the
// `auditLogs` entry that recorded its deletion.
//
// scripts/prune-income-week.js writes the FULL deleted document under `before`
// on an `income_deleted_week_cleanup` audit entry precisely so a deletion can
// be undone. This is the undo.
//
// Safety rules:
//  1. DRY RUN unless GB_APPLY=true.
//  2. The document is written with `.create()`, which FAILS if a document with
//     that id already exists - a restore can never overwrite live data. Ids are
//     reused deliberately (rather than generating new ones) so the restored row
//     matches the docId already referenced by the audit trail.
//  3. It only restores from a deletion entry it can actually find, and only
//     when that entry carries a `before` object with a numeric amount.
//  4. Each restore writes an `income_restored_from_audit` audit entry naming
//     the source entry and who had originally entered the row.
//
// That last entry also matters to the prune script: a restore is a deliberate
// Treasurer decision to keep the row, so prune-income-week.js treats a
// restored document as Treasurer-attributed and will not delete it again on a
// later run (see loadIncomeAttribution there).
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
//   GB_DOC_IDS               - comma-separated income document ids to restore
// Optional env vars:
//   GB_APPLY                 - "true" to actually write; anything else is a dry run

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Deletion actions whose `before` snapshot is a full income document.
const INCOME_DELETE_ACTIONS = [
  'income_deleted_week_cleanup',
  'income_deleted'
];

function peso(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function findDeletionEntry(db, docId) {
  const snap = await db.collection('auditLogs').where('docId', '==', docId).get();
  let best = null;
  snap.forEach((doc) => {
    const a = doc.data();
    if (a.collection !== 'income') return;
    if (!INCOME_DELETE_ACTIONS.includes(a.action)) return;
    if (!a.before || typeof a.before !== 'object') return;
    // Most recent deletion wins, in case a row was deleted more than once.
    if (best && String(best.data.createdAt || '') >= String(a.createdAt || '')) return;
    best = { auditId: doc.id, data: a };
  });
  return best;
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');

  const docIds = (process.env.GB_DOC_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (docIds.length === 0) throw new Error('GB_DOC_IDS is empty - nothing to restore.');

  const apply = (process.env.GB_APPLY || '').trim().toLowerCase() === 'true';
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }));

  const out = [];
  out.push('## Income restore from audit log');
  out.push('');
  out.push(`- Mode: ${apply ? '**APPLY (writing documents)**' : 'DRY RUN (nothing written)'}`);
  out.push(`- Requested: ${docIds.length} document(s)`);
  out.push('');

  const plan = [];
  for (const docId of docIds) {
    const existing = await db.collection('income').doc(docId).get();
    if (existing.exists) {
      plan.push({ docId, status: 'skip', reason: 'an income document with this id already exists' });
      continue;
    }
    const entry = await findDeletionEntry(db, docId);
    if (!entry) {
      plan.push({ docId, status: 'skip', reason: 'no income deletion audit entry with a `before` snapshot found' });
      continue;
    }
    const before = entry.data.before;
    const amount = Number(before.amount);
    if (!Number.isFinite(amount)) {
      plan.push({ docId, status: 'skip', reason: 'audit snapshot has no numeric amount' });
      continue;
    }
    plan.push({ docId, status: 'restore', entry, before, amount });
  }

  const restorable = plan.filter((p) => p.status === 'restore');
  const skipped = plan.filter((p) => p.status === 'skip');

  out.push('| Doc ID | Date | Giver | Type | Category | Amount | Originally entered by | Source audit entry |');
  out.push('|---|---|---|---|---|---:|---|---|');
  restorable.forEach((p) => {
    out.push(`| \`${p.docId}\` | ${p.before.date || ''} | ${(p.before.member || '').replace(/\|/g, '/')} | ${p.before.type || ''} | ${(p.before.budgetCategory || '').replace(/\|/g, '/')} | ₱${peso(p.amount)} | ${p.entry.data.originalActorName || '?'} (${p.entry.data.originalActorRole || '?'}) | \`${p.entry.auditId}\` |`);
  });
  if (restorable.length === 0) out.push('| _(none)_ | | | | | | | |');
  out.push('');
  out.push(`Total to restore: **₱${peso(restorable.reduce((s, p) => s + p.amount, 0))}**`);
  out.push('');

  if (skipped.length > 0) {
    out.push('### Skipped');
    out.push('');
    out.push('| Doc ID | Why |');
    out.push('|---|---|');
    skipped.forEach((p) => out.push(`| \`${p.docId}\` | ${p.reason} |`));
    out.push('');
  }

  if (apply && restorable.length > 0) {
    const createdAt = new Date().toISOString();
    for (const p of restorable) {
      // .create() throws if the document exists, so a restore can never
      // clobber a row someone re-keyed in the meantime.
      await db.collection('income').doc(p.docId).create(p.before);
      await db.collection('auditLogs').add({
        action: 'income_restored_from_audit',
        collection: 'income',
        docId: p.docId,
        summary: `Restored ₱${peso(p.amount)} ${p.before.type || 'income'}${p.before.budgetCategory ? ` (${p.before.budgetCategory})` : ''} for ${p.before.member || 'member'} dated ${p.before.date || ''}, rebuilt from audit entry ${p.entry.auditId}; originally entered by ${p.entry.data.originalActorName || '?'} (${p.entry.data.originalActorRole || '?'}) and restored on the Treasurer's instruction`,
        before: null,
        after: p.before,
        sourceAuditId: p.entry.auditId,
        originalActorUid: p.entry.data.originalActorUid || '',
        originalActorName: p.entry.data.originalActorName || '',
        originalActorRole: p.entry.data.originalActorRole || '',
        actorUid: 'restore-income-from-audit-script',
        actorEmail: '',
        actorName: 'Income Restore Script',
        actorRole: 'Treasurer',
        createdAt
      });
    }
    out.push(`Restored ${restorable.length} document(s) totalling ₱${peso(restorable.reduce((s, p) => s + p.amount, 0))}.`);
  } else if (!apply && restorable.length > 0) {
    out.push('Dry run only - re-run with apply to write these documents.');
  }

  const text = out.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  }
}

main().catch((err) => {
  console.error('Restore failed:', err.message || err);
  process.exit(1);
});
