// Read-only admin script: report every `income` transaction in one reporting
// week, together with who actually entered it.
//
// WRITES NOTHING. Use this to investigate a week whose total looks wrong
// before running scripts/prune-income-week.js, which is the script that can
// actually delete.
//
// Why a script: `income` documents carry no "created by" field of their own -
// attribution lives in `auditLogs` (`{action, collection: 'income', docId,
// actorUid, actorRole, actorName, createdAt}`), written by the page that
// created the row. So answering "who entered this?" means joining the two
// collections, which no page in the app does.
//
// The reporting week is computed with the SAME rules as reports.html's Weekly
// Collection tab (getReportingWeek + getWeekNumber, ported verbatim below), so
// "2nd week of September" here means exactly the "2nd Week" column the
// Treasurer is looking at: a transaction is pushed forward to the Sunday that
// closes its week (clamped to month end), and weeks are day 1-7, 8-14, 15-21,
// 22-28, 29+. For September 2026 the 2nd week is 2026-09-07..2026-09-13.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT - service account JSON (as a string)
// Optional env vars:
//   GB_YEAR  - default "2026"
//   GB_MONTH - calendar month, 1-12; default "9"
//   GB_WEEK  - reporting week 1-5; default "2". "all" reports every week.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Actions that any page in the app writes when it CREATES an income row.
// financial-overview.html's transfers/cash additions deliberately write no
// audit entry, so an income row can legitimately have no attribution at all -
// see UNATTRIBUTED handling below.
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

// Ported from reports.html - keep identical.
function getWeekNumber(date) {
  const day = date.getUTCDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

// Ported from reports.html - keep identical. A weekday transaction belongs to
// the week that ends on the following Sunday; if that Sunday falls into the
// next month it is clamped back to the last day of its own month.
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

// Same shape of "is this row system-generated rather than keyed by a person"
// test used by the prune script - kept here so the audit shows it too.
function systemGeneratedReason(d) {
  if (String(d.type || '').toLowerCase() === 'transfer') return 'account transfer (financial-overview)';
  if (d.linkedLiquidationRequestId) return 'liquidation cash-advance return';
  if (d.specialProjectId || d.specialProjectName) return 'special project posting';
  return '';
}

async function loadIncomeAttribution(db) {
  // Single-field query + JS filtering, so this never needs a composite index
  // (same approach as scripts/backfill-decker-deduction.js).
  const snap = await db.collection('auditLogs').where('collection', '==', 'income').get();
  const byDocId = new Map();
  snap.forEach((doc) => {
    const a = doc.data();
    if (!a.docId) return;
    if (!INCOME_CREATE_ACTIONS.includes(a.action)) return;
    const existing = byDocId.get(a.docId);
    // Keep the earliest creation entry if somehow more than one exists.
    if (existing && String(existing.createdAt || '') <= String(a.createdAt || '')) return;
    byDocId.set(a.docId, {
      auditId: doc.id,
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
  const weekInput = (process.env.GB_WEEK || '2').trim().toLowerCase();
  const targetWeek = weekInput === 'all' ? null : parseInt(weekInput, 10);

  if (!(month >= 1 && month <= 12)) throw new Error('GB_MONTH must be 1-12.');
  if (targetWeek !== null && !(targetWeek >= 1 && targetWeek <= 5)) {
    throw new Error('GB_WEEK must be 1-5 or "all".');
  }

  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }));
  const monthIndex = month - 1;

  const [incomeSnap, attribution] = await Promise.all([
    db.collection('income').get(),
    loadIncomeAttribution(db)
  ]);

  const monthRows = [];
  incomeSnap.forEach((doc) => {
    const d = doc.data();
    const dt = parseDate(d.date);
    if (!dt) return;
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== monthIndex) return;
    const reporting = getReportingWeek(d.date);
    if (!reporting) return;
    monthRows.push({
      id: doc.id,
      data: d,
      week: reporting.week,
      amount: Number(d.amount || 0),
      audit: attribution.get(doc.id) || null
    });
  });

  monthRows.sort((a, b) =>
    String(a.data.date).localeCompare(String(b.data.date)) ||
    String(a.data.timestamp || '').localeCompare(String(b.data.timestamp || '')));

  const monthName = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const out = [];
  out.push(`## Income audit - ${monthName} ${year}${targetWeek ? `, reporting week ${targetWeek}` : ' (all weeks)'}`);
  out.push('');
  out.push('Read-only. Nothing was written by this script.');
  out.push('');

  // Whole-month context first, so a "ballooned" week is visible next to its neighbours.
  const weekTotals = {};
  monthRows.forEach((r) => {
    weekTotals[r.week] = weekTotals[r.week] || { count: 0, total: 0 };
    weekTotals[r.week].count += 1;
    weekTotals[r.week].total += r.amount;
  });
  out.push(`### ${monthName} ${year} by reporting week`);
  out.push('');
  out.push('| Week | Entries | Total |');
  out.push('|---|---:|---:|');
  [1, 2, 3, 4, 5].forEach((w) => {
    const t = weekTotals[w];
    if (!t) return;
    out.push(`| ${w}${targetWeek === w ? ' **(target)**' : ''} | ${t.count} | ₱${peso(t.total)} |`);
  });
  out.push('');

  const rows = targetWeek === null ? monthRows : monthRows.filter((r) => r.week === targetWeek);
  const weekTotal = rows.reduce((s, r) => s + r.amount, 0);

  // Totals grouped by who entered the row.
  const byActor = new Map();
  rows.forEach((r) => {
    const sys = systemGeneratedReason(r.data);
    const key = r.audit
      ? `${r.audit.actorRole || '(no role)'} - ${r.audit.actorName || r.audit.actorUid || '(unnamed)'}`
      : (sys ? `UNATTRIBUTED (${sys})` : 'UNATTRIBUTED (no audit entry)');
    const cur = byActor.get(key) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += r.amount;
    byActor.set(key, cur);
  });

  out.push('### Who entered the entries in this week');
  out.push('');
  out.push('| Entered by | Entries | Total |');
  out.push('|---|---:|---:|');
  [...byActor.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([k, v]) => out.push(`| ${k} | ${v.count} | ₱${peso(v.total)} |`));
  out.push(`| **All** | **${rows.length}** | **₱${peso(weekTotal)}** |`);
  out.push('');

  // Duplicate detection: same day, same giver, same type, same amount.
  const dupKey = (r) => [
    String(r.data.date || ''),
    String(r.data.memberId || r.data.memberID || r.data.memberCode || ''),
    String(r.data.member || '').trim().toLowerCase(),
    String(r.data.type || '').trim().toLowerCase(),
    r.amount.toFixed(2)
  ].join('|');
  const groups = new Map();
  rows.forEach((r) => {
    const k = dupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  const dupExcess = dupGroups.reduce((s, g) => s + g.slice(1).reduce((x, r) => x + r.amount, 0), 0);

  out.push('### Duplicate groups (same date + giver + type + amount)');
  out.push('');
  if (dupGroups.length === 0) {
    out.push('None found.');
  } else {
    out.push(`${dupGroups.length} group(s); ₱${peso(dupExcess)} is the excess beyond one copy of each.`);
    out.push('');
    out.push('| Date | Giver | Type | Amount | Copies | Doc IDs (entered by) |');
    out.push('|---|---|---|---:|---:|---|');
    dupGroups.forEach((g) => {
      const who = g.map((r) => `\`${r.id}\` (${r.audit ? (r.audit.actorRole || '?') : 'unattributed'})`).join(', ');
      out.push(`| ${g[0].data.date || ''} | ${g[0].data.member || ''} | ${g[0].data.type || ''} | ₱${peso(g[0].amount)} | ${g.length} | ${who} |`);
    });
  }
  out.push('');

  out.push('### Every entry in this week');
  out.push('');
  out.push('| Doc ID | Date | Giver | Member ID | Type | Category | Amount | Payment | Entered by | Role | Entered at | System-generated |');
  out.push('|---|---|---|---|---|---|---:|---|---|---|---|---|');
  rows.forEach((r) => {
    const a = r.audit;
    out.push('| `' + r.id + '` | ' + [
      r.data.date || '',
      (r.data.member || '').replace(/\|/g, '/'),
      r.data.memberId || '',
      r.data.type || '',
      (r.data.budgetCategory || '').replace(/\|/g, '/'),
      '₱' + peso(r.amount),
      r.data.payment || '',
      a ? (a.actorName || a.actorUid || '') : '-',
      a ? (a.actorRole || '') : '-',
      a ? (a.createdAt || '') : (r.data.timestamp || r.data.postedAt || ''),
      systemGeneratedReason(r.data) || ''
    ].join(' | ') + ' |');
  });
  out.push('');

  // Audit entries whose income row is already gone - useful when a cleanup has
  // been run before, or when someone deleted rows by hand.
  const liveIds = new Set();
  incomeSnap.forEach((doc) => liveIds.add(doc.id));
  const orphans = [...attribution.entries()].filter(([docId]) => !liveIds.has(docId));
  out.push(`### Creation audit entries whose income row no longer exists: ${orphans.length}`);
  out.push('');
  if (orphans.length > 0) {
    out.push('| Doc ID | Entered by | Role | Entered at |');
    out.push('|---|---|---|---|');
    orphans
      .sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)))
      .slice(0, 40)
      .forEach(([docId, a]) => out.push(`| \`${docId}\` | ${a.actorName || a.actorUid} | ${a.actorRole} | ${a.createdAt} |`));
    if (orphans.length > 40) out.push('');
    if (orphans.length > 40) out.push(`_(showing the 40 most recent of ${orphans.length})_`);
  }
  out.push('');

  const text = out.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  }
}

main().catch((err) => {
  console.error('Audit failed:', err.message || err);
  process.exit(1);
});
