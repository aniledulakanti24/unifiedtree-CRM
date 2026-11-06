// Forecast periods, categories and sums. A category says how sure the salesperson is about a deal.
export const CATEGORIES = ['Commit', 'Best case', 'Pipeline', 'Omitted'];
export const categoryOf = (d) => d.forecastCategory || ((d.probability || 0) >= 70 ? 'Commit' : (d.probability || 0) >= 40 ? 'Best case' : 'Pipeline');
export const CATEGORY_TONE = { Commit: 'good', 'Best case': 'info', Pipeline: 'muted', Omitted: 'warn' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Quarters follow the fiscal year set in Settings.
export const quarterOf = (fiscalStart, at = new Date()) => {
  const first = Math.max(0, MONTHS.indexOf(fiscalStart));
  const offset = (at.getMonth() - first + 12) % 12;
  const q = Math.floor(offset / 3);
  const start = new Date(at.getFullYear(), at.getMonth() - (offset % 3), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  const fyEnd = new Date(start.getFullYear(), start.getMonth() + 12 - q * 3 - 1, 1).getFullYear();
  return { key: `FY${fyEnd}-Q${q + 1}`, label: `Q${q + 1} FY${fyEnd}`, from: ymd(start), to: ymd(end), months: 3 };
};
const shift = (fiscalStart, by) => { const n = new Date(); return quarterOf(fiscalStart, new Date(n.getFullYear(), n.getMonth() + by * 3, 1)); };
const monthOf = (by) => {
  const s = new Date(new Date().getFullYear(), new Date().getMonth() + by, 1);
  const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
  return { key: ymd(s).slice(0, 7), label: s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), from: ymd(s), to: ymd(e), months: 1 };
};
export const periodOptions = (fiscalStart) => [monthOf(0), monthOf(1), shift(fiscalStart, 0), shift(fiscalStart, 1)];
export const pastQuarters = (fiscalStart, n = 3) => Array.from({ length: n }, (_, i) => shift(fiscalStart, -(i + 1)));

const inPeriod = (d, p) => (d.closeDate || '') >= p.from && (d.closeDate || '') <= p.to;
export const quotaFor = (db, user, p) => {
  const set = db.quotas?.[p.key]?.[user.id];
  return set !== undefined ? Number(set) : Math.round(((Number(user.target) || 0) * p.months) / 12);
};
export const latestCall = (db, ownerId, key) => (db.forecastCalls || []).filter((c) => c.ownerId === ownerId && c.period === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
export const forecastRow = (db, user, deals, p) => {
  const mine = deals.filter((d) => d.ownerId === user.id && inPeriod(d, p));
  const open = mine.filter((d) => d.status === 'open');
  const of = (c) => open.filter((d) => categoryOf(d) === c).reduce((a, d) => a + d.value, 0);
  const won = mine.filter((d) => d.status === 'won').reduce((a, d) => a + d.value, 0);
  const commit = of('Commit');
  const best = of('Best case');
  const pipeline = of('Pipeline');
  const quota = quotaFor(db, user, p);
  const call = latestCall(db, user.id, p.key);
  return { id: user.id, ownerId: user.id, user, name: user.name, quota, won, commit, best, pipeline, call, likely: won + commit, gap: quota - (won + commit), attainment: quota ? (won / quota) * 100 : 0 };
};
export const addRows = (rows) => rows.reduce((a, r) => ({ quota: a.quota + r.quota, won: a.won + r.won, commit: a.commit + r.commit, best: a.best + r.best, pipeline: a.pipeline + r.pipeline, call: a.call + (r.call ? r.call.amount : r.won + r.commit) }), { quota: 0, won: 0, commit: 0, best: 0, pipeline: 0, call: 0 });

// A saved copy of the forecast, so changes since then can be listed.
export const snapshotOf = (db, p, date) => ({
  id: `fs-${p.key}-${date}`, date, period: p.key,
  deals: Object.fromEntries(db.deals.filter((d) => inPeriod(d, p) && d.status !== 'lost').map((d) => [d.id, { v: Math.round(d.value), c: d.status === 'won' ? 'Won' : categoryOf(d) }])),
});
export const changesSince = (snap, deals, p) => {
  if (!snap) return [];
  const out = [];
  const inNow = new Map(deals.filter((d) => inPeriod(d, p) && d.status !== 'lost').map((d) => [d.id, d]));
  const label = (d) => (d.status === 'won' ? 'Won' : categoryOf(d));
  inNow.forEach((d, id) => {
    const was = snap.deals[id];
    if (!was) { out.push({ deal: d, kind: 'Added', text: `New in this period, as ${label(d)}`, amount: d.value }); return; }
    if (label(d) !== was.c) out.push({ deal: d, kind: 'Moved', text: `${was.c} to ${label(d)}`, amount: 0 });
    if (Math.abs(d.value - was.v) >= 1) out.push({ deal: d, kind: d.value > was.v ? 'Bigger' : 'Smaller', text: `Value changed by ${Math.round(d.value - was.v)}`, amount: d.value - was.v });
  });
  deals.filter((d) => snap.deals[d.id] && !inNow.has(d.id)).forEach((d) => out.push({ deal: d, kind: d.status === 'lost' ? 'Lost' : 'Pushed out', text: d.status === 'lost' ? 'Marked as lost' : `Closing date moved to ${d.closeDate}`, amount: -snap.deals[d.id].v }));
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
};

// Sample history for the demo company, once. Real numbers come from people submitting.
export const upgradeSampleForecast = (d) => {
  if (d.fcV1) return d;
  const fiscal = d.settings.fiscalStart;
  const owners = d.users.filter((u) => u.role === 'sales' && u.active);
  const calls = [];
  pastQuarters(fiscal, 3).forEach((p, q) => owners.forEach((u, i) => {
    const actual = d.deals.filter((x) => x.ownerId === u.id && x.status === 'won' && inPeriod(x, p)).reduce((a, x) => a + x.value, 0);
    const skew = 0.8 + ((i * 7 + q * 5) % 9) * 0.05;
    calls.push({ id: `fc${q}${i}`, name: `${p.label} forecast`, period: p.key, ownerId: u.id, by: u.id, amount: Math.round((actual || (u.target || 0) / 8) * skew), note: '', kind: 'call', sample: true, createdAt: `${p.to}T09:00:00.000Z` });
  }));
  const cur = quarterOf(fiscal);
  const week = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const snap = snapshotOf(d, cur, week);
  Object.keys(snap.deals).forEach((id, i) => {
    if (i % 7 === 3) delete snap.deals[id];
    else if (i % 5 === 1) snap.deals[id].v = Math.round(snap.deals[id].v * 0.85);
    else if (i % 6 === 2 && snap.deals[id].c === 'Commit') snap.deals[id].c = 'Best case';
  });
  return { ...d, fcV1: true, forecastCalls: [...(d.forecastCalls || []), ...calls], forecastSnapshots: [snap, ...(d.forecastSnapshots || [])] };
};
export { inPeriod };
