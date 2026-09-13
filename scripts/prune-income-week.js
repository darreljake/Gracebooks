// One-off admin script: in ONE reporting week, delete the `income` rows that
// were entered by someone other than the Treasurer, keeping the Treasurer's
// entries as the record of that week.
//
// Run scripts/audit-income-week.js first - it is read-only and shows exactly
// which rows this script would remove and who entered them.
//
// Safety rules, in order of importance:
//  1. DRY RUN unless GB_APPLY=true. The dry run lists every row it would
//     delete and the resulting week total.
//  2. It only deletes a row it can POSITIVELY attribute to a non-keep role
//     via an `auditLogs` creation entry. A row with no audit entry is never
//     deleted - financial-overview.html's transfers and cash additions write
//     no audit entry at all, so "unattributed" does not mean "unauthorised".
//  3. It never deletes a system-generated row (account transfer, liquidation
//     cash-advance return, special project posting), whatever role wrote it,
//     because those mirror a second document elsewhere (a transfer's paired
//     row, a project's linkedIncomeId) and deleting one side corrupts both.
//  4. Every deletion writes an `auditLogs` entry containing the FULL deleted
//     document under `before`, so any row removed here can be reconstructed
//     from the audit log.
//
// Week selection is identical to reports.html's Weekly Collection tab - see
// scripts/audit-income-week.js for the ported logic and the rationale.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
// Optional env vars:
//   GB_YEAR      - default "2026"
//   GB_MONTH     - calendar month 1-12; default "9"
//   GB_WEEK      - reporting week 1-5; default "2"
//   GB_KEEP_ROLE - role whose entries are kept; default "Treasurer"
//   GB_APPLY     - "true" to actually delete; anything else is a dry run

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const INCOME_CREATE_ACTIONS = [
  'income_created',
  'income_created_from_liquidation_return',
  'special_project_income_posted'
];

function parseDate(value) {
  if (!value) return null;
  if (value.seconds) return new Date(value.seconds * 1000);
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

function getWeekNumber(date) {
  const day = date.getUTCDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

function getReportingWeek(transactionDate) {
  const dt = parseDate(transactionDate);
  if (!dt) return null;
  const dayOfWeek = dt.getUTCDay();
  let reportingDate = new Date(dt);
  if (dayOfWeek !== 0) {
    reportingDate = new Date(dt);
    reportingDate.setUTCDate(dt.getUTCDate() + (7 - dayOfWeek));
  }
  if (reportingDate.getUTCMonth() !== dt.getUTCMonth()) {
    const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    reportingDate = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), lastDay));
  }
  return {
    year: reportingDate.getUTCFullYear(),
    month: reportingDate.getUTCMonth(),
    week: getWeekNumber(reportingDate)
  };
}

function peso(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function systemGeneratedReason(d) {
  if (String(d.type || '').toLowerCase() === 'transfer') return 'account transfer (financial-overview)';
  if (d.linkedLiquidationRequestId) return 'liquidation cash-advance return';
  if (d.specialProjectId || d.specialProjectName) return 'special project posting';
  return '';
}

async function loadIncomeAttribution(db) {
  const snap = await db.collection('auditLogs').where('collection', '==', 'income').get();
  const byDocId = new Map();
  snap.forEach((doc) => {
    const a = doc.data();
    if (!a.docId || !INCOME_CREATE_ACTIONS.includes(a.action)) return;
    const existing = byDocId.get(a.docId);
    if (existing && String(existing.createdAt || '') <= String(a.createdAt || '')) return;
    byDocId.set(a.docId, {
      action: a.action,
      actorUid: a.actorUid || '',
      actorName: a.actorName || '',
      actorRole: a.actorRole || '',
      actorEmail: a.actorEmail || '',
      createdAt: a.createdAt || ''
    });
  });
  return byDocId;
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');

  const year = parseInt(process.env.GB_YEAR || '2026', 10);
  const month = parseInt(process.env.GB_MONTH || '9', 10);
  const week = parseInt(process.env.GB_WEEK || '2', 10);
  const keepRole = (process.env.GB_KEEP_ROLE || 'Treasurer').trim();
  const apply = (process.env.GB_APPLY || '').trim().toLowerCase() === 'true';

  if (!(month >= 1 && month <= 12)) throw new Error('GB_MONTH must be 1-12.');
  if (!(week >= 1 && week <= 5)) throw new Error('GB_WEEK must be 1-5.');
  if (!keepRole) throw new Error('GB_KEEP_ROLE must not be empty.');

  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }));
  const monthIndex = month - 1;

  const [incomeSnap, attribution] = await Promise.all([
    db.collection('income').get(),
    loadIncomeAttribution(db)
  ]);

  const keep = [];
  const remove = [];
  const skipped = [];

  incomeSnap.forEach((doc) => {
    const d = doc.data();
    const dt = parseDate(d.date);
    if (!dt) return;
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== monthIndex) return;
    const reporting = getReportingWeek(d.date);
    if (!reporting || reporting.week !== week) return;

    const row = { id: doc.id, data: d, amount: Number(d.amount || 0), audit: attribution.get(doc.id) || null };
    const sys = systemGeneratedReason(d);

    if (!row.audit) {
      skipped.push({ ...row, reason: sys ? `no audit entry - ${sys}` : 'no audit entry (cannot attribute)' });
      return;
    }
    if (sys) {
      skipped.push({ ...row, reason: `system-generated - ${sys}` });
      return;
    }
    if ((row.audit.actorRole || '').trim().toLowerCase() === keepRole.toLowerCase()) {
      keep.push(row);
      return;
    }
    remove.push(row);
  });

  const sum = (list) => list.reduce((s, r) => s + r.amount, 0);
  const monthName = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  const out = [];
  out.push(`## Income cleanup - ${monthName} ${year}, reporting week ${week}`);
  out.push('');
  out.push(`- Mode: ${apply ? '**APPLY (deleting rows)**' : 'DRY RUN (nothing written)'}`);
  out.push(`- Keeping entries whose creator role is: **${keepRole}**`);
  out.push(`- Week total before: **₱${peso(sum(keep) + sum(remove) + sum(skipped))}**`);
  out.push(`- Kept (${keepRole}): ${keep.length} entr(ies), ₱${peso(sum(keep))}`);
  out.push(`- Left alone (unattributed / system-generated): ${skipped.length} entr(ies), ₱${peso(sum(skipped))}`);
  out.push(`- To delete: ${remove.length} entr(ies), ₱${peso(sum(remove))}`);
  out.push(`- Week total after: **₱${peso(sum(keep) + sum(skipped))}**`);
  out.push('');

  if (remove.length > 0) {
    out.push(`### ${apply ? 'Deleted' : 'Would delete'}`);
    out.push('');
    out.push('| Doc ID | Date | Giver | Type | Amount | Entered by | Role | Entered at |');
    out.push('|---|---|---|---|---:|---|---|---|');
    remove.forEach((r) => {
      out.push(`| \`${r.id}\` | ${r.data.date || ''} | ${(r.data.member || '').replace(/\|/g, '/')} | ${r.data.type || ''} | ₱${peso(r.amount)} | ${r.audit.actorName || r.audit.actorUid} | ${r.audit.actorRole} | ${r.audit.createdAt} |`);
    });
    out.push('');
  } else {
    out.push('Nothing matched for deletion.');
    out.push('');
  }

  if (skipped.length > 0) {
    out.push('### Left alone (needs a human decision)');
    out.push('');
    out.push('| Doc ID | Date | Giver | Type | Amount | Why it was skipped |');
    out.push('|---|---|---|---|---:|---|');
    skipped.forEach((r) => {
      out.push(`| \`${r.id}\` | ${r.data.date || ''} | ${(r.data.member || '').replace(/\|/g, '/')} | ${r.data.type || ''} | ₱${peso(r.amount)} | ${r.reason} |`);
    });
    out.push('');
  }

  if (keep.length > 0) {
    out.push(`### Kept (${keepRole})`);
    out.push('');
    out.push('| Doc ID | Date | Giver | Type | Amount |');
    out.push('|---|---|---|---|---:|');
    keep.forEach((r) => {
      out.push(`| \`${r.id}\` | ${r.data.date || ''} | ${(r.data.member || '').replace(/\|/g, '/')} | ${r.data.type || ''} | ₱${peso(r.amount)} |`);
    });
    out.push('');
  }

  if (apply && remove.length > 0) {
    const createdAt = new Date().toISOString();
    for (const r of remove) {
      // Audit entry first, so the full document is recoverable even if the
      // delete below is the last thing that happens in this run.
      await db.collection('auditLogs').add({
        action: 'income_deleted_week_cleanup',
        collection: 'income',
        docId: r.id,
        summary: `Removed ₱${peso(r.amount)} ${r.data.type || 'income'} for ${r.data.member || 'member'} dated ${r.data.date || ''} - entered by ${r.audit.actorName || r.audit.actorUid} (${r.audit.actorRole}); ${monthName} ${year} week ${week} kept to ${keepRole} entries only`,
        before: r.data,
        after: null,
        originalActorUid: r.audit.actorUid || '',
        originalActorName: r.audit.actorName || '',
        originalActorRole: r.audit.actorRole || '',
        actorUid: 'prune-income-week-script',
        actorEmail: '',
        actorName: 'Income Week Cleanup Script',
        actorRole: 'Treasurer',
        createdAt
      });
      await db.collection('income').doc(r.id).delete();
    }
    out.push(`Deleted ${remove.length} entr(ies) totalling ₱${peso(sum(remove))}. Each deletion is recoverable from its \`auditLogs\` entry (\`action: income_deleted_week_cleanup\`, full document under \`before\`).`);
  } else if (!apply && remove.length > 0) {
    out.push('Dry run only - re-run with apply to delete these rows.');
  }

  const text = out.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message || err);
  process.exit(1);
});
