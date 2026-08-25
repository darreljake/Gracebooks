// One-off admin script: backfill the deckerDeduction field on historical
// Deaconess Salary payroll records.
//
// Root cause (see expenses.html saveSmartPayroll): Smart Payroll has always
// correctly subtracted the Decker Fund deduction from the Deaconess's net
// pay at creation time (netPay = gross - tithe - sss - otherDeduction), so
// cash impact and the Deductions Payable total have always been right. But
// it never wrote that amount into its own `deckerDeduction` field, so the
// Ledger's per-row "Ded: Decker ₱75" breakdown has never shown for any
// Decker row, for any month - not just Jan-Aug. This script only backfills
// the missing `deckerDeduction` field for the requested date range; it does
// NOT touch `amount` or `netPay`, which were already correct.
//
// Matches: expenses docs where isPayrollGenerated == true, role == GB_ROLE
// (default "Deaconess"), payrollParticulars starts with GB_PARTICULARS_PREFIX
// (default "Salary"), date within [GB_START_DATE, GB_END_DATE], and
// deckerDeduction is currently 0/missing (never overwrites an existing
// nonzero value).
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
// Optional env vars:
//   GB_START_DATE            - default "2026-01-01"
//   GB_END_DATE               - default "2026-08-31"
//   GB_ROLE                   - default "Deaconess"
//   GB_PARTICULARS_PREFIX     - default "Salary"
//   GB_DECKER_AMOUNT          - default "75"
//   GB_APPLY                  - "true" to actually write changes; anything
//                                else (including unset) performs a dry run
//                                that only lists what WOULD change.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');

  const startDate = (process.env.GB_START_DATE || '2026-01-01').trim();
  const endDate = (process.env.GB_END_DATE || '2026-08-31').trim();
  const role = (process.env.GB_ROLE || 'Deaconess').trim();
  const particularsPrefix = (process.env.GB_PARTICULARS_PREFIX || 'Salary').trim().toLowerCase();
  const deckerAmount = parseFloat(process.env.GB_DECKER_AMOUNT || '75') || 0;
  const apply = (process.env.GB_APPLY || '').trim().toLowerCase() === 'true';

  if (deckerAmount <= 0) throw new Error('GB_DECKER_AMOUNT must be a positive number.');

  const serviceAccount = JSON.parse(serviceAccountJson);
  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);

  // Filter isPayrollGenerated only in the query (single-field index, always
  // available) and do the rest of the matching in JS, so this never depends
  // on a composite index existing for role + date range.
  const snap = await db.collection('expenses').where('isPayrollGenerated', '==', true).get();

  const matches = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if ((data.role || '') !== role) return;
    if (!String(data.payrollParticulars || '').toLowerCase().startsWith(particularsPrefix)) return;
    const date = String(data.date || '');
    if (date < startDate || date > endDate) return;
    if (parseFloat(data.deckerDeduction || 0) > 0) return; // never overwrite an existing value
    matches.push({ id: doc.id, data });
  });

  const summaryLines = [
    '## Decker deduction backfill',
    '',
    `- Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`,
    `- Filter: role="${role}", payrollParticulars starts with "${particularsPrefix}", date ${startDate}..${endDate}, deckerDeduction currently 0/missing`,
    `- Amount to set: ₱${deckerAmount}`,
    `- Matching records: ${matches.length}`,
    ''
  ];

  if (matches.length === 0) {
    summaryLines.push('No matching records found - nothing to do.');
  } else {
    summaryLines.push('| Doc ID | Date | Particulars | Amount | Current netPay |');
    summaryLines.push('|---|---|---|---|---|');
    matches.forEach((m) => {
      summaryLines.push(`| \`${m.id}\` | ${m.data.date || ''} | ${m.data.payrollParticulars || ''} | ₱${m.data.amount || 0} | ₱${m.data.netPay ?? ''} |`);
    });
  }

  console.log(summaryLines.join('\n'));

  if (apply && matches.length > 0) {
    const createdAt = new Date().toISOString();
    for (const m of matches) {
      const before = { ...m.data };
      const after = { deckerDeduction: deckerAmount };
      await db.collection('expenses').doc(m.id).update(after);
      await db.collection('auditLogs').add({
        action: 'deduction_backfill',
        collection: 'expenses',
        docId: m.id,
        summary: `Backfilled missing Decker deduction (₱${deckerAmount}) for ${m.data.date || ''} payroll record`,
        before,
        after: { ...before, ...after },
        actorUid: 'backfill-script',
        actorEmail: '',
        actorName: 'Decker Deduction Backfill Script',
        actorRole: 'Treasurer',
        createdAt
      });
    }
    console.log(`\nApplied deckerDeduction=${deckerAmount} to ${matches.length} record(s).`);
  } else if (!apply && matches.length > 0) {
    console.log('\nDry run only - re-run with GB_APPLY=true to write these changes.');
  }

  const summary = summaryLines.join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message || err);
  process.exit(1);
});
