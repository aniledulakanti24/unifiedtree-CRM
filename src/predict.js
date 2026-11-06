// Simple forecasting and pattern checks over the CRM's own records. These are plain sums and rules,
// shown with their reasons. They are not a trained AI model.
import { customerHealth, dealScore } from './assistant';
import { scoreReasons } from './engine';
import { lastMonths, monthKey, monthLabel, nextMonths, sum, today } from './util';

const NEXT_STEP = [
  [/No activity/, 'Call them this week'],
  [/Closing date has passed/, 'Agree a new closing date'],
  [/No next step/, 'Plan the next step'],
  [/No contact/, 'Add the main contact'],
  [/less often/, 'Ask a manager to join the next call'],
];
const stepFor = (reasons) => NEXT_STEP.find(([re]) => reasons.some(([t]) => re.test(t)))?.[1] || 'Check in with the customer';

export function revenueForecast(deals) {
  const past = lastMonths(6);
  const won = deals.filter((d) => d.status === 'won');
  const history = past.map((m) => sum(won.filter((d) => monthKey(d.closeDate) === m), (d) => d.value));
  // A straight line through the last six months.
  const n = history.length;
  const meanX = (n - 1) / 2;
  const meanY = sum(history) / n;
  const slope = history.reduce((a, y, i) => a + (i - meanX) * (y - meanY), 0) / (history.reduce((a, _, i) => a + (i - meanX) ** 2, 0) || 1);
  return {
    rows: [
      ...past.map((m, i) => ({ label: monthLabel(m), Actual: history[i] })),
      ...nextMonths(3).map((m, i) => ({ month: m, i })).map(({ month, i }) => ({ label: monthLabel(month), month, trend: Math.max(0, meanY + slope * (n + i - meanX)) })),
    ],
    meanY,
    slope,
  };
}

export function forecastRows(db, deals) {
  const f = revenueForecast(deals);
  const open = deals.filter((d) => d.status === 'open');
  let total = 0; let low = 0; let high = 0;
  const rows = f.rows.map((r) => {
    if (r.Actual !== undefined) return { label: r.label, Actual: Math.round(r.Actual) };
    const pipeline = sum(open.filter((d) => monthKey(d.closeDate) === r.month), (d) => d.value * ((dealScore(db, d)?.score || 0) / 100));
    const expected = (r.trend + pipeline) / 2;
    const lo = Math.min(r.trend, pipeline) * 0.8;
    const hi = Math.max(r.trend, pipeline) * 1.2;
    total += expected; low += lo; high += hi;
    return { label: r.label, Expected: Math.round(expected), Low: Math.round(lo), High: Math.round(hi) };
  });
  return { rows, total, low, high, rising: f.slope > 0 };
}

export const dealsAtRisk = (db, deals) => deals.filter((d) => d.status === 'open').map((d) => {
  const s = dealScore(db, d);
  const bad = s.reasons.filter(([, n]) => n < 0);
  return { deal: d, score: s.score, why: bad.map(([t]) => t), step: stepFor(bad), atStake: d.value * (1 - s.score / 100) };
}).filter((x) => x.why.length && (x.score < 45 || x.deal.closeDate < today())).sort((a, b) => b.atStake - a.atStake);

export const customersAtRisk = (db, companies) => companies.map((c) => {
  const h = customerHealth(db, c);
  const spent = sum(db.deals.filter((d) => d.companyId === c.id && d.status === 'won'), (d) => d.value);
  return { company: c, health: h, spent, why: h.reasons.filter(([, n]) => n < 0).map(([t]) => t) };
}).filter((x) => x.health.label === 'At risk').sort((a, b) => b.spent - a.spent);

export const leadsToCall = (leads) => leads.filter((l) => !['Converted', 'Lost', 'Junk', 'Unqualified'].includes(l.status)).sort((a, b) => (b.score || 0) - (a.score || 0)).map((l) => ({ lead: l, why: scoreReasons(l).filter(([, n]) => n > 0).slice(0, 3).map(([t]) => t) }));

// Compares the last seven days with the eight weeks before, and says what changed most.
const WEEK = 7 * 864e5;
const METRICS = [
  { key: 'leads', name: 'New leads', rows: (v) => v.leads, at: (r) => r.createdAt, by: (r) => r.source, word: 'source', goodUp: true },
  { key: 'won', name: 'Revenue won', rows: (v) => v.deals.filter((d) => d.status === 'won'), at: (r) => r.closeDate, value: (r) => r.value, by: (r) => r.source, word: 'source', goodUp: true, money: true },
  { key: 'lost', name: 'Deals lost', rows: (v) => v.deals.filter((d) => d.status === 'lost'), at: (r) => r.closeDate, by: (r) => r.lostReason, word: 'reason', goodUp: false },
  { key: 'cases', name: 'Support cases', rows: (v) => v.cases, at: (r) => r.createdAt, by: (r) => r.type, word: 'type', goodUp: false },
  { key: 'orders', name: 'Orders', rows: (v) => v.orders, at: (r) => r.date, by: (r) => r.channel, word: 'channel', goodUp: true },
];
export function unusualChanges(view) {
  const now = Date.now();
  return METRICS.map((m) => {
    const rows = m.rows(view);
    const weigh = m.value || (() => 1);
    const inWeek = (r, w) => { const t = new Date(m.at(r) || 0).getTime(); return t <= now - w * WEEK && t > now - (w + 1) * WEEK; };
    const weeks = Array.from({ length: 8 }, (_, i) => sum(rows.filter((r) => inWeek(r, i + 1)), weigh));
    const current = sum(rows.filter((r) => inWeek(r, 0)), weigh);
    const mean = sum(weeks) / 8;
    const sd = Math.sqrt(sum(weeks, (x) => (x - mean) ** 2) / 8);
    const change = mean ? (current - mean) / mean : current ? 1 : 0;
    if (Math.abs(current - mean) <= Math.max(sd * 1.5, mean * 0.25) || (current < 2 && mean < 2 && !m.money)) return null;
    const up = current > mean;
    const groups = new Map();
    rows.filter((r) => inWeek(r, 0)).forEach((r) => { const k = m.by(r) || 'Not recorded'; groups.set(k, (groups.get(k) || 0) + weigh(r)); });
    const top = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
    return { key: m.key, name: m.name, up, current, mean, change, good: up === m.goodUp, money: !!m.money, driver: top && up ? `Most came from the ${m.word} "${top[0]}".` : '' };
  }).filter(Boolean);
}

// The year-end if things change by these amounts.
export function whatIf(deals, target, { winRate = 0, dealSize = 0, volume = 0 }) {
  const year = String(new Date().getFullYear());
  const closed = deals.filter((d) => ['won', 'lost'].includes(d.status) && (d.closeDate || '').startsWith(year));
  const won = closed.filter((d) => d.status === 'won');
  const wonSoFar = sum(won, (d) => d.value);
  const monthsGone = new Date().getMonth() + 1;
  const monthsLeft = 12 - monthsGone;
  const perMonth = closed.length / monthsGone;
  const rate = closed.length ? won.length / closed.length : 0;
  const avg = won.length ? wonSoFar / won.length : 0;
  const yearEnd = (w, s, v) => wonSoFar + monthsLeft * perMonth * (1 + v / 100) * Math.min(1, rate + w / 100) * avg * (1 + s / 100);
  const base = yearEnd(0, 0, 0);
  const projected = yearEnd(winRate, dealSize, volume);
  return { rate, avg, perMonth, monthsLeft, wonSoFar, base, projected, gain: projected - base, target, gap: target - projected };
}
