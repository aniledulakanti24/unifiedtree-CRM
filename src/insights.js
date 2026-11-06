// Turns CRM records into plain statements. Fixed rules over the data, not an AI model.
// Rates need a minimum number of records, so one lucky deal doesn't read as a trend.
import { lastTouch } from './engine';
import { previousOf } from './dateRange';
import { DAY, addDays, lineTotal, money, monthKey, monthLabel, num, pad, pct, sum, today } from './util';

const MIN_CLOSED = 5;
const STUCK_DAYS = 14;
const ORDER = { bad: 0, warn: 1, good: 2, info: 3 };
const rank = (list) => list.filter(Boolean).sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

const day = (s) => (s || '').slice(0, 10);
const within = (s, from, to) => day(s) >= from && day(s) <= to;
// Takes a number of days back from today, or a from and to. The comparison is the same length just before it.
const windows = (p) => {
  if (typeof p === 'number') return { from: addDays(-p + 1), to: today(), prevFrom: addDays(-2 * p + 1), prevTo: addDays(-p) };
  if (!p?.from) return { from: '0000-01-01', to: '9999-12-31', prevFrom: '9999-12-31', prevTo: '0000-01-01' };
  const prev = previousOf(p);
  return { from: p.from, to: p.to, prevFrom: prev?.from || '9999-12-31', prevTo: prev?.to || '0000-01-01' };
};
const unpaid = (i) => (i.total || 0) - (i.paid || 0);
const isOverdue = (i) => unpaid(i) > 0 && i.due && day(i.due) < today();
const rate = (won, lost) => (won + lost >= MIN_CLOSED ? (won / (won + lost)) * 100 : null);
const closedIn = (deals, status, from, to) => deals.filter((d) => d.status === status && within(d.closeDate, from, to));
const change = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

export const months12 = () => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
};
const byMonth = (rows, dateOf, valueOf) => { const m = {}; rows.forEach((r) => { const k = monthKey(dateOf(r)); m[k] = (m[k] || 0) + valueOf(r); }); return m; };
const topOf = (rows, keyOf, valueOf) => { const m = {}; rows.forEach((r) => { const k = keyOf(r); m[k] = (m[k] || 0) + valueOf(r); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const stuckDeals = (db, deals) => deals.filter((d) => d.status === 'open' && Date.now() - new Date(lastTouch(db, d.id) || d.createdAt).getTime() > STUCK_DAYS * DAY);

// `v` holds the records this person may see. `whole` is true when that is the entire company.
export function businessInsights(db, v, days, companyName, whole, target = 0) {
  const { from, to, prevFrom, prevTo } = windows(days);
  const won = closedIn(v.deals, 'won', from, to);
  const lost = closedIn(v.deals, 'lost', from, to);
  const prevWon = closedIn(v.deals, 'won', prevFrom, prevTo);
  const prevLost = closedIn(v.deals, 'lost', prevFrom, prevTo);
  const revenue = sum(won, (d) => d.value);
  const prevRevenue = sum(prevWon, (d) => d.value);
  const revChange = change(revenue, prevRevenue);
  const winRate = rate(won.length, lost.length);
  const prevWinRate = rate(prevWon.length, prevLost.length);
  const open = v.deals.filter((d) => d.status === 'open');
  const weighted = sum(open, (d) => (d.value * (d.probability || 0)) / 100);
  const invoiceIds = new Set(v.invoices.map((i) => i.id));
  const collected = sum(v.payments.filter((p) => invoiceIds.has(p.invoiceId) && within(p.date, from, to)), (p) => p.amount);
  const overdue = v.invoices.filter(isOverdue);
  const overdueMoney = sum(overdue, unpaid);
  const orders = v.orders.filter((o) => o.status !== 'Cancelled' && within(o.date, from, to));
  const lines = orders.flatMap((o) => o.items || []);
  const sales = sum(lines, (x) => lineTotal(x));
  const costOf = (x) => (db.products.find((p) => p.id === x.productId)?.cost || 0) * x.qty;
  const margin = sales ? ((sales - sum(lines, costOf)) / sales) * 100 : null;
  const openCases = v.cases.filter((c) => !['Closed', 'Rejected'].includes(c.status));

  const stuck = stuckDeals(db, open);
  const late = open.filter((d) => d.closeDate && day(d.closeDate) < today());
  const staleLeads = v.leads.filter((l) => l.status === 'New' && Date.now() - new Date(l.createdAt).getTime() > 3 * DAY);
  const urgent = openCases.filter((c) => c.priority === 'Urgent');
  const nextMonth = sum(open.filter((d) => within(d.closeDate, today(), addDays(30))), (d) => (d.value * (d.probability || 0)) / 100);
  const customers = topOf(won, (d) => d.companyId, (d) => d.value);
  const topShare = customers[0] && revenue ? (customers[0][1] / revenue) * 100 : 0;
  const reasons = topOf(lost, (d) => d.lostReason || 'No reason given', () => 1);
  const sourceRows = topOf([...won, ...lost], (d) => d.source || 'Unknown', () => 1).map(([source, closed]) => {
    const w = won.filter((d) => (d.source || 'Unknown') === source);
    return { source, closed, won: w.length, revenue: sum(w, (d) => d.value), rate: rate(w.length, closed - w.length) };
  });
  const bestSource = sourceRows.filter((s) => s.rate != null).sort((a, b) => b.rate - a.rate)[0];
  const productRows = topOf(lines, (x) => x.productId, (x) => lineTotal(x)).map(([id, value]) => {
    const p = db.products.find((x) => x.id === id);
    const mine = lines.filter((x) => x.productId === id);
    return { id, name: p?.name || mine[0]?.name || 'Removed product', value, qty: sum(mine, (x) => x.qty), margin: p?.cost != null && value ? ((value - sum(mine, costOf)) / value) * 100 : null };
  });
  const thin = productRows.filter((p) => p.margin != null && p.margin < 30)[0];
  const lowStock = whole ? db.products.filter((p) => p.tracked && p.active !== false && p.stock <= p.reorder) : [];

  const prevAvg = prevWon.length ? prevRevenue / prevWon.length : 0;
  const avgDeal = won.length ? revenue / won.length : 0;
  const prevCollected = sum(v.payments.filter((p) => invoiceIds.has(p.invoiceId) && within(p.date, prevFrom, prevTo)), (p) => p.amount);
  const billedNow = sum(v.invoices.filter((i) => within(i.date, from, to)), (i) => i.total);

  // The year so far against the target, and where the current pace would finish.
  const yr = String(new Date().getFullYear());
  const wonByKey = byMonth(v.deals.filter((d) => d.status === 'won' && (d.closeDate || '').startsWith(yr)), (d) => d.closeDate, (d) => d.value);
  const wonYear = sum(Object.values(wonByKey));
  const nowMonth = new Date().getMonth();
  let running = 0;
  const yearRows = Array.from({ length: 12 }, (_, i) => {
    const k = `${yr}-${pad(i + 1)}`;
    running += wonByKey[k] || 0;
    return { label: monthLabel(k), actual: i <= nowMonth ? running : null, target: target ? Math.round((target * (i + 1)) / 12) : null };
  });
  const elapsed = (Date.now() - new Date(Number(yr), 0, 1).getTime()) / (365 * DAY);
  const projected = elapsed > 0 ? wonYear / elapsed : 0;
  const remaining = Math.max(0, target - wonYear);

  // Who bought before this period, and who has stopped buying.
  const firstWon = {};
  v.deals.filter((d) => d.status === 'won').forEach((d) => { if (!firstWon[d.companyId] || d.closeDate < firstWon[d.companyId]) firstWon[d.companyId] = d.closeDate; });
  const newRevenue = sum(won.filter((d) => firstWon[d.companyId] >= from), (d) => d.value);
  const mix = [{ name: 'New customers', value: newRevenue, color: 'var(--s1)' }, { name: 'Returning customers', value: revenue - newRevenue, color: 'var(--s2)' }].filter((x) => x.value > 0);
  const touched = {};
  const lifetime = {};
  const note = (id, date, value) => { if (!id) return; lifetime[id] = (lifetime[id] || 0) + value; if (!touched[id] || date > touched[id]) touched[id] = date; };
  v.deals.filter((d) => d.status === 'won').forEach((d) => note(d.companyId, d.closeDate, d.value));
  v.orders.filter((o) => o.status !== 'Cancelled').forEach((o) => note(o.companyId, o.date, o.total));
  const quietSince = addDays(-90);
  const quiet = Object.keys(touched).filter((id) => day(touched[id]) < quietSince).map((id) => ({ id, name: companyName(id), value: lifetime[id], days: Math.floor((Date.now() - new Date(touched[id]).getTime()) / DAY) })).sort((a, b) => b.value - a.value).slice(0, 5);

  const collectRate = billedNow ? (collected / billedNow) * 100 : null;
  const cover = remaining ? weighted / remaining : null;
  const health = [
    { label: 'Growth', value: revChange == null ? '—' : `${revChange >= 0 ? '+' : ''}${Math.round(revChange)}%`, note: revChange == null ? 'No earlier period to compare' : 'Revenue won against the period before', tone: revChange == null ? 'info' : revChange >= 5 ? 'good' : revChange <= -5 ? 'bad' : 'warn' },
    { label: 'Win rate', value: winRate == null ? '—' : pct(winRate), note: winRate == null ? 'Needs 5 closed deals' : `${won.length} won, ${lost.length} lost`, tone: winRate == null ? 'info' : winRate >= 50 ? 'good' : winRate >= 35 ? 'warn' : 'bad' },
    { label: 'Cash collection', value: collectRate == null ? '—' : pct(collectRate), note: collectRate == null ? 'Nothing invoiced in this period' : 'Collected against invoiced', tone: collectRate == null ? 'info' : collectRate >= 80 ? 'good' : collectRate >= 60 ? 'warn' : 'bad' },
    { label: 'Pipeline cover', value: !target ? '—' : !remaining ? 'Met' : `${cover.toFixed(1)}x`, note: !target ? 'No target set' : !remaining ? 'Yearly target reached' : 'Expected from open deals against what is still needed', tone: !target ? 'info' : !remaining || cover >= 1 ? 'good' : cover >= 0.6 ? 'warn' : 'bad' },
    { label: 'Customer spread', value: revenue ? pct(topShare) : '—', note: revenue ? 'Share of revenue from the largest customer' : 'No revenue in this period', tone: !revenue ? 'info' : topShare < 25 ? 'good' : topShare < 40 ? 'warn' : 'bad' },
    { label: 'Support', value: num(urgent.length), note: `Urgent, out of ${num(openCases.length)} open cases`, tone: !urgent.length ? 'good' : urgent.length < 3 ? 'warn' : 'bad' },
  ];

  const statements = rank([
    revChange != null && Math.abs(revChange) >= 5 && { tone: revChange > 0 ? 'good' : 'bad', text: `Revenue won is ${revChange > 0 ? 'up' : 'down'} ${pct(Math.abs(revChange))} on the previous period: ${money(revenue)}, against ${money(prevRevenue)}.`, to: '/pipeline' },
    winRate != null && prevWinRate != null && Math.abs(winRate - prevWinRate) >= 5 && { tone: winRate > prevWinRate ? 'good' : 'warn', text: `Win rate moved from ${pct(prevWinRate)} to ${pct(winRate)}.`, to: '/reports/pipeline' },
    overdueMoney > 0 && { tone: overdueMoney >= revenue * 0.05 ? 'bad' : 'warn', text: `${money(overdueMoney)} is overdue across ${plural(overdue.length, 'invoice')}. Chase these first.`, to: '/billing' },
    stuck.length > 0 && { tone: 'warn', text: `${plural(stuck.length, 'open deal')} worth ${money(sum(stuck, (d) => d.value))} had no activity for ${STUCK_DAYS} days or more.`, to: '/pipeline' },
    late.length > 0 && { tone: 'warn', text: `${plural(late.length, 'open deal')} ${late.length === 1 ? 'is' : 'are'} past the expected close date, so your forecast may be too high.`, to: '/pipeline' },
    urgent.length > 0 && { tone: 'bad', text: `${plural(urgent.length, 'urgent support case')} ${urgent.length === 1 ? 'is' : 'are'} still open.`, to: '/cases' },
    staleLeads.length > 0 && { tone: 'warn', text: `${plural(staleLeads.length, 'new lead')} waited more than 3 days without contact.`, to: '/leads' },
    lowStock.length > 0 && { tone: 'warn', text: `${plural(lowStock.length, 'product')} ${lowStock.length === 1 ? 'is' : 'are'} at or below the reorder level.`, to: '/inventory' },
    topShare >= 25 && won.length > 1 && { tone: 'warn', text: `${companyName(customers[0][0])} is ${pct(topShare)} of revenue won, which is a lot to depend on one customer.`, to: `/customers/${customers[0][0]}` },
    thin && { tone: 'warn', text: `${thin.name} sold ${money(thin.value)} at only a ${pct(thin.margin)} margin.`, to: '/products' },
    reasons[0]?.[1] >= 3 && { tone: 'info', text: `The most common reason for losing deals is "${reasons[0][0]}" (${reasons[0][1]} of ${lost.length}).`, to: '/reports/pipeline' },
    bestSource && { tone: 'good', text: `${bestSource.source} is your best source: ${pct(bestSource.rate)} of its ${bestSource.closed} closed deals were won.`, to: '/reports/leads' },
    productRows[0] && { tone: 'good', text: `${productRows[0].name} is your top seller at ${money(productRows[0].value)}.`, to: '/products' },
    nextMonth > 0 && { tone: 'info', text: `Open deals due in the next 30 days are worth about ${money(nextMonth)} after probability.`, to: '/reports/forecast' },
  ]);

  const months = months12();
  const wonByMonth = byMonth(v.deals.filter((d) => d.status === 'won'), (d) => d.closeDate, (d) => d.value);
  const billed = byMonth(v.invoices, (i) => i.date, (i) => i.total);
  const paid = byMonth(v.payments.filter((p) => invoiceIds.has(p.invoiceId)), (p) => p.date, (p) => p.amount);
  const ageing = [['Not due yet', (n) => n <= 0], ['1 to 30 days', (n) => n >= 1 && n <= 30], ['31 to 60 days', (n) => n > 30 && n <= 60], ['61 to 90 days', (n) => n > 60 && n <= 90], ['Over 90 days', (n) => n > 90]]
    .map(([label, test]) => ({ label, value: sum(v.invoices.filter((i) => unpaid(i) > 0 && test(Math.floor((Date.now() - new Date(i.due).getTime()) / DAY))), unpaid) }));

  return {
    statements,
    health,
    mix,
    quiet,
    year: { rows: yearRows, target, won: wonYear, projected },
    kpis: { revenue, revChange, wonCount: won.length, avgChange: change(avgDeal, prevAvg), cashChange: change(collected, prevCollected), collected, overdueMoney, overdueCount: overdue.length, weighted, openValue: sum(open, (d) => d.value), winRate, closed: won.length + lost.length, avgDeal, margin, openCases: openCases.length, urgent: urgent.length },
    charts: {
      revenue: months.map((k) => ({ label: monthLabel(k), value: wonByMonth[k] || 0 })),
      cash: months.map((k) => ({ label: monthLabel(k), billed: billed[k] || 0, paid: paid[k] || 0 })),
      stages: db.stages.filter((s) => s.id !== 'won').map((s) => ({ label: s.name, value: sum(open.filter((d) => d.stage === s.id), (d) => d.value) })),
      customers: customers.slice(0, 5).map(([id, value]) => ({ label: companyName(id), value })),
      ageing,
      reasons: reasons.slice(0, 6).map(([label, value]) => ({ label, value })),
    },
    sources: sourceRows,
    products: productRows.slice(0, 6),
  };
}

export function personStats(db, u, days) {
  const { from, to } = windows(days);
  const mine = (list) => list.filter((r) => r.ownerId === u.id);
  const deals = mine(db.deals);
  const won = closedIn(deals, 'won', from, to);
  const lost = closedIn(deals, 'lost', from, to);
  const open = deals.filter((d) => d.status === 'open');
  const calls = mine(db.calls).filter((c) => within(c.at, from, to));
  const tasks = mine(db.activities);
  const leads = mine(db.leads).filter((l) => within(l.createdAt, from, to));
  const year = String(new Date().getFullYear());
  const wonYear = sum(deals.filter((d) => d.status === 'won' && (d.closeDate || '').startsWith(year)), (d) => d.value);
  const start = new Date(new Date().getFullYear(), 0, 1).getTime();
  const elapsed = (Date.now() - start) / (365 * DAY);
  const wonMonths = byMonth(deals.filter((d) => d.status === 'won'), (d) => d.closeDate, (d) => d.value);
  return {
    id: u.id, name: u.name, title: u.title, target: u.target || 0, wonYear,
    attainment: u.target ? (wonYear / u.target) * 100 : null,
    pace: u.target ? (wonYear / (u.target * elapsed)) * 100 : null,
    revenue: sum(won, (d) => d.value), wonCount: won.length, lostCount: lost.length, winRate: rate(won.length, lost.length),
    avgDeal: won.length ? sum(won, (d) => d.value) / won.length : 0,
    openCount: open.length, openValue: sum(open, (d) => d.value), stuck: stuckDeals(db, open).length,
    calls: calls.length, connected: calls.filter((c) => c.outcome === 'Connected').length, talkMinutes: Math.round(sum(calls, (c) => c.duration) / 60),
    tasksDone: tasks.filter((a) => a.status === 'done' && within(a.createdAt, from, to)).length,
    overdueTasks: tasks.filter((a) => a.status !== 'done' && a.due && day(a.due) < today()).length,
    missedFollowups: mine(db.followups).filter((f) => f.status === 'open' && new Date(f.at).getTime() < Date.now() - DAY).length,
    leads: leads.length, converted: leads.filter((l) => l.status === 'Converted').length,
    overdueMoney: sum(mine(db.invoices).filter(isOverdue), unpaid),
    openCases: mine(db.cases).filter((c) => !['Closed', 'Rejected'].includes(c.status)).length,
    trend: months12().map((k) => ({ label: monthLabel(k), value: wonMonths[k] || 0 })),
  };
}

// What stands out for one person, measured against the others in view.
export function personSignals(s, all) {
  const avg = (f) => (all.length ? sum(all, f) / all.length : 0);
  const compare = all.length > 1;
  return rank([
    s.pace != null && s.pace >= 110 && { tone: 'good', text: `Ahead of target pace: ${pct(s.attainment)} of the yearly target so far.` },
    s.pace != null && s.pace < 70 && { tone: 'bad', text: `Behind target pace: ${money(s.wonYear)} of ${money(s.target)} so far, ${pct(s.attainment)}.` },
    compare && s.revenue > avg((x) => x.revenue) * 1.25 && s.revenue > 0 && { tone: 'good', text: `Revenue won is well above the group average of ${money(avg((x) => x.revenue))}.` },
    s.winRate != null && s.winRate >= 60 && { tone: 'good', text: `Strong win rate of ${pct(s.winRate)} from ${s.wonCount + s.lostCount} closed deals.` },
    s.winRate != null && s.winRate < 35 && { tone: 'warn', text: `Low win rate of ${pct(s.winRate)} from ${s.wonCount + s.lostCount} closed deals. Check how these deals are qualified.` },
    s.overdueTasks >= 5 && { tone: 'warn', text: `${plural(s.overdueTasks, 'task')} overdue. This may be too much work, or tasks that need clearing.` },
    s.missedFollowups >= 3 && { tone: 'warn', text: `${plural(s.missedFollowups, 'follow-up')} more than a day late.` },
    s.stuck >= 5 && { tone: 'warn', text: `${plural(s.stuck, 'open deal')} with no activity for ${STUCK_DAYS} days or more.` },
    s.calls === 0 && { tone: 'info', text: `No calls logged in this period. Calls made outside the CRM don't show here.` },
    s.overdueMoney > 0 && { tone: 'info', text: `${money(s.overdueMoney)} of this person's invoices is overdue.` },
    compare && s.calls > avg((x) => x.calls) * 1.5 && s.calls >= 5 && { tone: 'good', text: `Very active on calls: ${num(s.calls)} against a group average of ${Math.round(avg((x) => x.calls))}.` },
  ]);
}

export function teamSignals(rows) {
  if (!rows.length) return [];
  const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const total = sum(rows, (r) => r.revenue);
  const behind = rows.filter((r) => r.pace != null && r.pace < 70);
  const ahead = rows.filter((r) => r.pace != null && r.pace >= 110);
  const best = rows.filter((r) => r.winRate != null).sort((a, b) => b.winRate - a.winRate)[0];
  const busy = [...rows].sort((a, b) => b.overdueTasks - a.overdueTasks)[0];
  const quiet = rows.filter((r) => r.calls === 0);
  const names = (list) => (list.length > 3 ? `${list.slice(0, 3).map((r) => r.name).join(', ')} and ${list.length - 3} more` : list.map((r) => r.name).join(', '));
  return rank([
    top.revenue > 0 && rows.length > 1 && { tone: 'good', text: `${top.name} won the most in this period: ${money(top.revenue)}, ${pct((top.revenue / total) * 100)} of the group's total.` },
    best && rows.length > 1 && { tone: 'good', text: `${best.name} has the best win rate at ${pct(best.winRate)}.` },
    ahead.length > 0 && { tone: 'good', text: `Ahead of target pace: ${names(ahead)}.` },
    behind.length > 0 && { tone: 'bad', text: `Behind target pace: ${names(behind)}.` },
    busy.overdueTasks >= 5 && { tone: 'warn', text: `${busy.name} has the most overdue tasks (${busy.overdueTasks}). Check their workload.` },
    quiet.length > 0 && { tone: 'info', text: `No calls logged in this period: ${names(quiet)}.` },
  ]);
}
