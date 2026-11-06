// The dashboard's widget library. Every widget reads records through `scope`, so one widget
// shows the company to an Admin, the team to a Manager and only their own to a Sales Person.
import { getLocale } from './util';
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from './store';
import { inRange, previousOf } from './dateRange';
import { Avatar, Badge, Btn, Empty, Icon, Pills, Progress, UserChip } from './ui';
import { Bars, Donut, DrillCtx, SERIES, Trend } from './charts';
import { OPEN_PO, reorderPlan } from './stock';
import { deliveryState } from './logistics';
import { useComms, CHANNELS } from './comms';
import { Coaching } from './extras';
import { businessInsights } from './insights';
import { customerHealth, dealScore, nextActions } from './assistant';
import { PinnedReports, SOURCES, runReport } from './pages/ReportBuilder';
import { DAY, addDays, fmtShort, fmtTime, iso, lastMonths, money, moneyK, monthKey, monthLabel, nextMonths, num, pct, relTime, sum, today } from './util';

const closedStatus = ['Closed', 'Rejected'];
const unpaidOf = (i) => (i.total || 0) - (i.paid || 0);
const count = (list, f) => list.filter(f).length;
const moved = (now, before) => (before ? ((now - before) / before) * 100 : null);
const many = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

// Everything the widgets read, worked out once per change instead of once per widget.
export function buildContext({ db, me, scope: baseScope, can, range, ids, names }) {
  // The people filter narrows everything. Records with no owner, like deliveries, stay.
  const scope = (list, mod) => { const rows = baseScope(list, mod); return ids ? rows.filter((r) => !r.ownerId || ids.has(r.ownerId)) : rows; };
  const now = today();
  const y = now.slice(0, 4);
  const m = now.slice(0, 7);
  const dated = (list, dateOf) => list.filter((r) => inRange(dateOf(r), range));
  const allDeals = scope(db.deals);
  const allWon = allDeals.filter((d) => d.status === 'won');
  const open = allDeals.filter((d) => d.status === 'open');
  const won = dated(allWon, (d) => d.closeDate);
  const lost = dated(allDeals.filter((d) => d.status === 'lost'), (d) => d.closeDate);
  const leads = scope(db.leads); const orders = scope(db.orders); const invoices = scope(db.invoices); const payments = scope(db.payments);
  const cases = scope(db.cases); const calls = scope(db.calls); const shipments = scope(db.shipments); const aiCalls = scope(db.aiCalls, 'aiVoice');
  // Trend charts count by day for a short period, and by month for a longer one. Future dates are left off.
  const last = range?.to && range.to < now ? range.to : now;
  const first = range?.from || null;
  const days = first ? Math.round((new Date(`${last}T00:00:00`) - new Date(`${first}T00:00:00`)) / DAY) + 1 : 0;
  const byDay = days > 0 && days <= 31;
  const keys = [];
  if (byDay) for (let i = 0; i < days; i++) keys.push(addDays(i, new Date(`${first}T00:00:00`)));
  else if (first && days > 0) { const d = new Date(`${first}T00:00:00`); d.setDate(1); while (monthKey(iso(d)) <= monthKey(last)) { keys.push(monthKey(iso(d))); d.setMonth(d.getMonth() + 1); } } else if (!first) keys.push(...lastMonths(12));
  const keyOf = byDay ? (s) => (s || '').slice(0, 10) : (s) => monthKey(s);
  const team = db.teams.find((x) => x.id === me.teamId);
  const target = me.role === 'admin' ? sum(db.teams, (x) => x.target) : me.role === 'sales' ? me.target : team?.target || me.target;
  return { db, range,
    prev: (() => { const p = previousOf(range); if (!p) return null; const at = (list, f) => list.filter((r) => inRange(f(r), p)); return { won: at(allWon, (d) => d.closeDate), lost: at(allDeals.filter((d) => d.status === 'lost'), (d) => d.closeDate), payments: at(payments, (x) => x.date), leads: at(leads, (l) => l.createdAt), calls: at(calls, (x) => x.at) }; })(),
    names, db, me, now, y, m, range, months: keys, keyOf, label: byDay ? (k) => fmtShort(k) : monthLabel,
    won, lost, open, target, deals: [...open, ...won, ...lost],
    wonYear: sum(allWon.filter((d) => (d.closeDate || '').startsWith(y)), (d) => d.value),
    leads: dated(leads, (l) => l.createdAt), orders: dated(orders, (o) => o.date), invoices: dated(invoices, (i) => i.date), payments: dated(payments, (p) => p.date),
    cases: dated(cases, (x) => x.createdAt), calls: dated(calls, (x) => x.at), shipments: dated(shipments, (s) => s.createdAt || s.eta), aiCalls: dated(aiCalls, (x) => x.at),
    // Things that are true today, whatever period is chosen.
    all: { deals: allDeals, won: allWon, leads, orders, invoices, payments, cases, calls, shipments, activities: scope(db.activities) },
    tasks: scope(db.activities), followups: scope(db.followups), events: scope(db.events),
    products: can('products') ? db.products : [],
    inMonths: (list, dateOf, valueOf = () => 1) => { const totals = {}; list.forEach((r) => { const k = keyOf(dateOf(r)); totals[k] = (totals[k] || 0) + valueOf(r); }); return keys.map((k) => totals[k] || 0); },
  };
}

const NoData = ({ text = 'No data yet.' }) => <Empty icon="ChartNoAxesColumn" text={text} />;

// Colours follow the name, not the size, so a slice keeps its colour as numbers change.
const slices = (list, keyOf, valueOf = () => 1) => {
  const totals = {};
  list.forEach((r) => { const k = keyOf(r) || 'None'; totals[k] = (totals[k] || 0) + valueOf(r); });
  const rows = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 7).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value], i) => ({ name, value, color: SERIES[i] }));
  const rest = sum(rows.slice(7), (r) => r[1]);
  return rest ? [...top, { name: 'Other', value: rest, color: SERIES[7] }] : top;
};
const ranking = (list, keyOf, valueOf, n = 6) => {
  const totals = {};
  list.forEach((r) => { const k = keyOf(r) || 'None'; totals[k] = (totals[k] || 0) + valueOf(r); });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }));
};

const DonutW = ({ data, format = num, label }) => (data.length ? <div className="wd-donut"><Donut data={data} format={format} height={150} centerLabel={label} /></div> : <NoData />);
// One bar split into its parts, for "how is this group divided up" without another round chart.
export function SplitW({ data, format = num, label }) {
  const pick = useContext(DrillCtx);
  if (!data.length) return <NoData />;
  const total = sum(data, (d) => d.value);
  return (
    <div className="wd-split">
      <div><span className="kpi-value">{format(total)}</span> <span className="small muted">{label}</span></div>
      <div className="wd-split-bar" role="img" aria-label={data.map((d) => `${d.name} ${format(d.value)}`).join(', ')}>
        {data.map((d) => <span key={d.name} title={`${d.name}: ${format(d.value)}`} style={{ flexGrow: d.value, background: d.color, cursor: pick ? 'pointer' : undefined }} onClick={pick ? () => pick(d.name) : undefined} />)}
      </div>
      <div className="stack-s">
        {data.map((d) => (
          <div key={d.name} className={`row between small ${pick ? 'pickable' : ''}`} role={pick ? 'button' : undefined} tabIndex={pick ? 0 : undefined} onClick={pick ? () => pick(d.name) : undefined} onKeyDown={pick ? (e) => { if (e.key === 'Enter') pick(d.name); } : undefined}>
            <span className="row"><i style={{ background: d.color }} /><span className="sub">{d.name}</span></span>
            <span className="num strong">{format(d.value)}<span className="muted" style={{ fontWeight: 400 }}> · {pct((d.value / total) * 100)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
// A ranked list with a thin bar under each name: quicker to read than another bar chart.
export function RankW({ data, format = moneyK }) {
  const pick = useContext(DrillCtx);
  const rows = data.filter((d) => d.value);
  if (!rows.length) return <NoData />;
  const top = rows[0].value;
  return (
    <div className="wd-rank">
      {rows.map((d, i) => (
        <div key={d.label} className={`wd-rank-row ${pick ? 'pickable' : ''}`} role={pick ? 'button' : undefined} tabIndex={pick ? 0 : undefined} onClick={pick ? () => pick(d.label) : undefined} onKeyDown={pick ? (e) => { if (e.key === 'Enter') pick(d.label); } : undefined}>
          <div className="row between small"><span className="trunc"><span className="wd-rank-n">{i + 1}</span>{d.label}</span><span className="num strong nowrap">{format(d.value)}</span></div>
          <div className="wd-rank-bar"><i style={{ width: `${(d.value / top) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
// Deals narrowing through the stages, with how much of the pipeline each one holds.
function FunnelW({ rows }) {
  const pick = useContext(DrillCtx);
  const top = Math.max(...rows.map((r) => r.value));
  if (!top) return <NoData text="No open deals." />;
  const total = sum(rows, (r) => r.value);
  return (
    <div className="wd-funnel">
      {rows.map((r) => (
        <div key={r.label} className={`wd-funnel-row ${pick ? 'pickable' : ''}`} role={pick ? 'button' : undefined} tabIndex={pick ? 0 : undefined} onClick={pick ? () => pick(r.label) : undefined} onKeyDown={pick ? (e) => { if (e.key === 'Enter') pick(r.label); } : undefined}>
          <span className="small trunc">{r.label}</span>
          <span className="wd-funnel-track"><i style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} /></span>
          <span className="small num strong nowrap">{moneyK(r.value)}<span className="muted" style={{ fontWeight: 400 }}> · {r.count}</span></span>
        </div>
      ))}
      <div className="small muted">{moneyK(total)} across {sum(rows, (r) => r.count)} open deals</div>
    </div>
  );
}
// A few counts side by side, for a short fixed list like priorities.
function CellsW({ cells }) {
  const pick = useContext(DrillCtx);
  return cells.some((c) => c.value) ? (
  <div className="wd-cells">{cells.map((c) => <div key={c.label} className={`wd-cell ${c.tone || ''} ${pick ? 'pickable' : ''}`} role={pick ? 'button' : undefined} tabIndex={pick ? 0 : undefined} onClick={pick ? () => pick(c.label) : undefined}><div className="kpi-value">{num(c.value)}</div><div className="small muted">{c.label}</div></div>)}</div>
) : <NoData text="Nothing open." />;
}
const MonthBars = ({ ctx, list, dateOf, amount, name, format }) => { const v = ctx.inMonths(list, dateOf, amount); return v.some(Boolean) ? <Bars data={ctx.months.map((k, i) => ({ label: ctx.label(k), value: v[i] }))} series={[{ key: 'value', name }]} format={format} height={220} /> : <NoData />; };

function Ring({ value, label }) {
  const p = Math.min(100, Math.max(0, value || 0));
  const r = 54; const c = 2 * Math.PI * r;
  return (
    <div className="wd-ring">
      <svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label={`${pct(value)} ${label}`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--s1)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 66 66)" />
      </svg>
      <div className="wd-ring-c"><div className="kpi-value">{pct(value)}</div><div className="small muted">{label}</div></div>
    </div>
  );
}

const Row = ({ to, children }) => (to ? <Link to={to} className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}>{children}</Link> : <div className="dashlet">{children}</div>);

/* ---------- Widgets that need their own state or actions ---------- */
const MEASURE_FMT = { count: num, duration: num };
const CHARTS = [{ k: 'bar', icon: 'ChartColumn', label: 'Bar', title: 'Bar chart' }, { k: 'line', icon: 'ChartLine', label: 'Line', title: 'Line chart' }, { k: 'donut', icon: 'ChartPie', label: 'Donut', title: 'Donut chart' }];

// The chart people can change themselves. Its choices are saved with the dashboard.
function Explorer({ cfg, setCfg, range }) {
  const { db, can, scope, userName, companyName } = useStore();
  const sources = Object.entries(SOURCES).filter(([, s]) => can(s.module));
  if (!sources.length) return <NoData text="You don't have access to any data for this chart." />;
  const c = { source: sources[0][0], group: SOURCES[sources[0][0]].groups[0][0], measure: 'count', chart: 'bar', status: 'all', ...cfg };
  if (!SOURCES[c.source] || !can(SOURCES[c.source].module)) c.source = sources[0][0];
  const src = SOURCES[c.source];
  const group = src.groups.some(([k]) => k === c.group) ? c.group : src.groups[0][0];
  const measure = src.measures.some(([k]) => k === c.measure) ? c.measure : 'count';
  const measureName = src.measures.find(([k]) => k === measure)?.[1] || 'Number of records';
  const set = (patch) => setCfg({ ...c, group, measure, ...patch });
  const seen = new Set(scope(db[c.source], src.module).map((r) => r.status).filter(Boolean));
  const statuses = c.source === 'deals' ? ['open', 'won', 'lost'].filter((x) => seen.has(x)) : [...seen].sort();
  const report = { source: c.source, group, measure, range, status: statuses.includes(c.status) ? c.status : 'all' };
  const rows = runReport(db, scope, userName, companyName, report);
  const fmt = MEASURE_FMT[measure] || moneyK;
  const series = [{ key: 'Value', name: measureName }];
  const named = [...rows].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const donut = [...named.slice(0, 7).map((r, i) => ({ name: r.label, value: r.Value, color: SERIES[i] })), ...(named.length > 7 ? [{ name: 'Other', value: sum(named.slice(7), (r) => r.Value), color: SERIES[7] }] : [])];
  return (
    <div>
      <div className="wd-tools">
        <label className="row small"><span className="muted">Data</span><select className="select tb-filter" value={c.source} onChange={(e) => set({ source: e.target.value, group: SOURCES[e.target.value].groups[0][0], measure: 'count', status: 'all' })}>{sources.map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></label>
        <label className="row small"><span className="muted">Measure</span><select className="select tb-filter" value={measure} onChange={(e) => set({ measure: e.target.value })}><option value="count">Number of records</option>{src.measures.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="row small"><span className="muted">Group by</span><select className="select tb-filter" value={group} onChange={(e) => set({ group: e.target.value })}>{src.groups.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {statuses.length > 0 && statuses.length <= 4
          ? <Pills value={report.status} onChange={(x) => set({ status: x })} options={[{ k: 'all', label: 'All' }, ...statuses.map((x) => ({ k: x, label: x[0].toUpperCase() + x.slice(1) }))]} />
          : statuses.length > 4 && <label className="row small"><span className="muted">Status</span><select className="select tb-filter" value={report.status} onChange={(e) => set({ status: e.target.value })}><option value="all">All</option>{statuses.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
        <div className="grow" />
        <Pills value={c.chart} onChange={(x) => set({ chart: x })} options={CHARTS} />
      </div>
      {!rows.length && <NoData text="No records for these choices." />}
      {rows.length > 0 && c.chart === 'bar' && <Bars height={300} format={fmt} data={rows} series={series} />}
      {rows.length > 0 && c.chart === 'line' && <Trend height={300} format={fmt} data={rows} series={series} />}
      {rows.length > 0 && c.chart === 'donut' && <div style={{ maxWidth: 420, margin: '0 auto' }}><Donut data={donut} format={fmt} height={220} centerLabel={measureName.toLowerCase()} /></div>}
    </div>
  );
}

function Followups({ ctx }) {
  const { startCall, canCall, inCall } = useComms();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const list = ctx.followups.filter((f) => f.status === 'open' && f.at <= end.toISOString()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  if (!list.length) return <Empty icon="BellOff" text="No follow-ups due." />;
  return list.map((f) => (
    <div key={f.id} className="dashlet">
      <span className="kpi-ico" style={{ width: 28, height: 28 }}><Icon name={CHANNELS[f.channel]} size={14} /></span>
      <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{f.title}</div><div className="small muted trunc">{f.name} · {fmtTime(f.at)}</div></div>
      {f.channel === 'Call' && f.phone && canCall && <Btn sm icon="Phone" aria-label={`Call ${f.name}`} disabled={inCall} onClick={() => startCall('voice', { name: f.name, phone: f.phone, relatedType: f.relatedType, relatedId: f.relatedId, contactId: f.contactId })} />}
    </div>
  ));
}

function Focus({ ctx }) {
  const { db, can, update, toast } = useStore();
  const todo = ctx.tasks.filter((a) => a.status !== 'done').sort((a, b) => a.due.localeCompare(b.due));
  const due = todo.filter((a) => a.due <= ctx.now);
  const list = (due.length ? due : todo).slice(0, 6);
  if (!list.length) return <Empty icon="CheckCheck" text="You're all caught up." />;
  return list.map((a) => {
    const type = db.activityTypes.find((x) => x.id === a.typeId);
    const late = a.due < ctx.now;
    return (
      <div key={a.id} className="dashlet">
        <input type="checkbox" aria-label={`Complete ${a.summary}`} disabled={!can('tasks', 'edit')} onChange={() => { update('activities', a.id, { status: 'done' }); toast('Activity done'); }} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
        <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{a.summary}</div>{a.relatedType === 'deal' ? <Link className="small trunc" style={{ display: 'block' }} to={`/pipeline/${a.relatedId}`}>{a.relatedLabel}</Link> : <div className="small muted trunc">{a.relatedLabel || type?.name}</div>}</div>
        <span className="small nowrap" style={{ color: late ? 'var(--bad)' : 'var(--ink-3)' }}>{late ? 'Overdue · ' : ''}{fmtShort(a.due)}</span>
      </div>
    );
  });
}

function TodayMeetings() {
  const { db, me, can, userName } = useStore();
  const now = new Date();
  const list = db.events.filter((e) => (e.ownerId === me.id || e.attendeeIds?.includes(me.id)) && e.category !== 'Holiday' && new Date(e.start).toDateString() === now.toDateString() && new Date(e.end) > now).sort((a, b) => a.start.localeCompare(b.start));
  const waiting = can('meetings') ? count(db.meetingRequests, (r) => r.status === 'Pending' && r.toId === me.id) : 0;
  return (
    <>
      {waiting > 0 && <p className="notice" style={{ margin: '0 0 10px' }}>{waiting === 1 ? '1 meeting request needs' : `${waiting} meeting requests need`} your answer. <Link to="/meetings">Review</Link></p>}
      {!list.length && <Empty icon="CalendarCheck" text="No more meetings today." />}
      {list.map((e) => {
        const others = [e.ownerId, ...(e.attendeeIds || [])].filter((u) => u !== me.id).map((u) => userName(u));
        return (
          <div key={e.id} className="dashlet">
            <div className="strong num" style={{ width: 66, flexShrink: 0 }}>{fmtTime(e.start)}</div>
            <div className="grow" style={{ minWidth: 0 }}><div className="trunc strong"><Link to={e.requestId ? `/meetings?open=${e.requestId}` : '/calendar'}>{e.title}</Link></div><div className="small muted trunc">{[others.length ? `With ${others.join(', ')}` : '', e.location].filter(Boolean).join(' · ')}</div></div>
          </div>
        );
      })}
    </>
  );
}

function Attention({ ctx }) {
  const { canRoute, db } = useStore();
  const items = [
    { n: count(ctx.products, (p) => p.tracked && p.stock <= p.reorder), text: 'products at or below reorder level', icon: 'PackageX', to: '/inventory' },
    { n: count(ctx.all.invoices, (i) => i.status === 'Overdue'), text: 'overdue invoices', icon: 'Receipt', to: '/billing' },
    { n: count(ctx.all.shipments, (s) => s.status === 'Delayed'), text: 'delayed shipments', icon: 'Truck', to: '/logistics' },
    { n: count(ctx.all.cases, (c) => c.priority === 'Urgent' && !closedStatus.includes(c.status)), text: 'urgent support cases', icon: 'Siren', to: '/cases' },
    { n: count(db.transfers, (x) => x.status === 'Pending'), text: 'transfers waiting for a manager', icon: 'ArrowRightLeft', to: '/transfers' },
    { n: count(ctx.all.leads, (l) => l.status === 'New' && Date.now() - new Date(l.createdAt).getTime() > 3 * DAY), text: 'new leads waiting over 3 days', icon: 'Magnet', to: '/leads' },
  ].filter((a) => a.n > 0 && canRoute(a.to));
  if (!items.length) return <Empty icon="ShieldCheck" text="Nothing needs attention." />;
  return items.map((a) => (
    <Row key={a.text} to={a.to}>
      <span className="kpi-ico" style={{ width: 30, height: 30, background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name={a.icon} size={15} /></span>
      <span className="grow"><strong className="num">{a.n}</strong> {a.text}</span>
      <Icon name="ChevronRight" size={15} color="var(--ink-3)" />
    </Row>
  ));
}

function Approvals() {
  const { db, me, can, role, decideTransfer, toast, userName } = useStore();
  const list = !can('transfers', 'approve') ? [] : db.transfers.filter((x) => x.status === 'Pending' && (role === 'admin' || db.users.some((u) => u.teamId === me.teamId && u.id === x.fromId)));
  if (!list.length) return <Empty icon="CheckCheck" text="No transfers waiting." />;
  return list.slice(0, 4).map((x) => (
    <div key={x.id} className="stack-s" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div><div className="strong trunc">{x.recordLabel}</div><div className="small muted trunc">{userName(x.fromId)} → {userName(x.toId)}</div><div className="small sub">{x.reason}</div></div>
      <div className="row"><Btn sm kind="primary" onClick={() => { decideTransfer(x.id, true, 'Approved from dashboard'); toast('Transfer approved. Ownership moved.'); }}>Approve</Btn><Btn sm onClick={() => { decideTransfer(x.id, false, 'Rejected from dashboard'); toast('Transfer rejected'); }}>Reject</Btn></div>
    </div>
  ));
}

function Scorecard({ ctx }) {
  const { db, me, role } = useStore();
  const people = db.users.filter((u) => u.active && u.role !== 'admin' && (role === 'admin' || u.teamId === me.teamId));
  const rows = people.map((u) => {
    const mine = ctx.deals.filter((d) => d.ownerId === u.id);
    const won = sum(mine.filter((d) => d.status === 'won'), (d) => d.value);
    const yearWon = sum(ctx.all.deals.filter((d) => d.ownerId === u.id && d.status === 'won' && (d.closeDate || '').startsWith(ctx.y)), (d) => d.value);
    const closed = mine.filter((d) => d.status !== 'open');
    return { u, open: sum(mine.filter((d) => d.status === 'open'), (d) => d.value), won, attain: u.target ? (yearWon / u.target) * 100 : 0, win: closed.length ? (count(closed, (d) => d.status === 'won') / closed.length) * 100 : 0, overdue: count(ctx.tasks, (a) => a.ownerId === u.id && a.status !== 'done' && a.due < ctx.now) };
  }).sort((a, b) => b.won - a.won);
  if (!rows.length) return <NoData />;
  return (
    <div className="tb-wrap"><table className="table">
      <thead><tr><th>Person</th><th className="r">Pipeline</th><th className="r">Won</th><th style={{ width: 130 }}>Yearly target</th><th className="r">Win rate</th><th className="r">Overdue</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.u.id}><td><UserChip id={r.u.id} /></td><td className="r num">{moneyK(r.open)}</td><td className="r num strong">{moneyK(r.won)}</td><td><div className="row"><div className="grow"><Progress value={r.attain} /></div><span className="small num">{pct(r.attain)}</span></div></td><td className="r num">{pct(r.win)}</td><td className="r num" style={r.overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{r.overdue}</td></tr>)}</tbody>
    </table></div>
  );
}

function InsightsW({ ctx }) {
  const { db, companyName, scopeOf } = useStore();
  const x = businessInsights(db, ctx.all, 90, companyName, scopeOf('insights') === 'all');
  if (!x.statements.length) return <Empty icon="Lightbulb" text="Nothing stands out right now." />;
  const tone = { bad: ['OctagonAlert', 'var(--bad)'], warn: ['TriangleAlert', 'var(--warn)'], good: ['CircleCheck', 'var(--good)'], info: ['Lightbulb', 'var(--info)'] };
  return x.statements.slice(0, 6).map((s) => <div key={s.text} className="dashlet"><Icon name={tone[s.tone][0]} size={16} color={tone[s.tone][1]} style={{ flexShrink: 0 }} /><span className="grow">{s.text}</span></div>);
}

/* ---------- The library ---------- */
export const GROUPS = ['My day', 'Sales', 'Leads', 'Orders and money', 'Stock and delivery', 'Support', 'Calls', 'Team'];
const TYPE = { tile: 'Number', chart: 'Chart', list: 'List', table: 'Table' };
export const typeLabel = (w) => TYPE[w.type];

// A number tile. `fn` gives the value, a note and optionally 12 months for the small trend line.
const section = (k, title) => ({ k, title, type: 'section', size: 'f', sec: 'sections', module: 'dashboard', hidden: true, group: 'Sections', icon: 'Heading' });
const tile = (k, title, icon, group, module, fn) => ({ k, title, icon, group, module, type: 'tile', size: 's', sec: 'kpis', fn });
const chart = (k, title, sub, icon, group, module, size, C, extra = {}) => ({ k, title, sub, icon, group, module, type: 'chart', size, sec: 'charts', C, ...extra });
const list = (k, title, sub, icon, group, module, size, sec, C, extra = {}) => ({ k, title, sub, icon, group, module, type: 'list', size, sec, C, ...extra });

export const WIDGETS = [
  section('sec_sales', 'Sales'), section('sec_money', 'Money and orders'), section('sec_ops', 'Operations and support'), section('sec_team', 'Team and system'), section('sec_build', 'Build your own'), section('sec_day', 'My day'), section('sec_leads', 'Leads and activity'),
  /* Sales numbers */
  tile('wonYear', 'Revenue won', 'CircleDollarSign', 'Sales', 'pipeline', (c) => ({ value: moneyK(sum(c.won, (d) => d.value)), delta: c.prev && moved(sum(c.won, (d) => d.value), sum(c.prev.won, (d) => d.value)), note: many(c.won.length, 'deal'), spark: c.inMonths(c.won, (d) => d.closeDate, (d) => d.value) })),
  tile('wonMonth', 'Won this month', 'Trophy', 'Sales', 'pipeline', (c) => { const l = c.all.won.filter((d) => monthKey(d.closeDate) === c.m); return { value: moneyK(sum(l, (d) => d.value)), note: many(l.length, 'deal'), spark: c.inMonths(c.won, (d) => d.closeDate, (d) => d.value) }; }),
  tile('pipeline', 'Open pipeline', 'Kanban', 'Sales', 'pipeline', (c) => ({ value: moneyK(sum(c.open, (d) => d.value)), note: many(c.open.length, 'open deal') })),
  tile('weighted', 'Weighted forecast', 'Scale', 'Sales', 'pipeline', (c) => ({ value: moneyK(sum(c.open, (d) => (d.value * d.probability) / 100)), note: 'Value × probability' })),
  tile('aiForecast', 'Likely revenue', 'Sparkles', 'Sales', 'pipeline', (c) => ({ value: moneyK(sum(c.open, (d) => (d.value * (dealScore(c.db, d)?.score || 0)) / 100)), note: 'Open deals × win chance' })),
  tile('target', 'Target progress', 'Target', 'Sales', 'pipeline', (c) => ({ value: c.target ? pct((c.wonYear / c.target) * 100) : '—', note: c.target ? `${moneyK(c.wonYear)} of ${moneyK(c.target)}` : 'No target set' })),
  tile('winRate', 'Win rate', 'Percent', 'Sales', 'pipeline', (c) => { const n = c.won.length + c.lost.length; const before = c.prev ? c.prev.won.length + c.prev.lost.length : 0; return { value: n ? pct((c.won.length / n) * 100) : '—', delta: n && before ? ((c.won.length / n) - (c.prev.won.length / before)) * 100 : null, unit: ' pts', note: many(n, 'closed deal'), spark: c.inMonths(c.won, (d) => d.closeDate) }; }),
  tile('avgDeal', 'Average deal won', 'Handshake', 'Sales', 'pipeline', (c) => ({ value: moneyK(c.won.length ? sum(c.won, (d) => d.value) / c.won.length : 0), delta: c.prev?.won.length && c.won.length ? moved(sum(c.won, (d) => d.value) / c.won.length, sum(c.prev.won, (d) => d.value) / c.prev.won.length) : null, note: `From ${many(c.won.length, 'deal')}` })),
  tile('cycle', 'Time to close', 'Timer', 'Sales', 'pipeline', (c) => { const l = c.won.filter((d) => d.createdAt && d.closeDate); return { value: l.length ? `${Math.round(sum(l, (d) => (new Date(d.closeDate) - new Date(d.createdAt)) / DAY) / l.length)} days` : '—', note: 'Average, won deals' }; }),
  tile('closing30', 'Closing in 30 days', 'CalendarClock', 'Sales', 'pipeline', (c) => { const l = c.open.filter((d) => d.closeDate >= c.now && d.closeDate <= addDays(30)); return { value: num(l.length), note: moneyK(sum(l, (d) => d.value)) }; }),
  tile('lateDeals', 'Past close date', 'CalendarX', 'Sales', 'pipeline', (c) => { const l = c.open.filter((d) => d.closeDate < c.now); return { value: num(l.length), note: `${moneyK(sum(l, (d) => d.value))} still open` }; }),
  /* Leads numbers */
  tile('newLeads', 'New leads', 'Magnet', 'Leads', 'leads', (c) => ({ value: num(count(c.all.leads, (l) => l.status === 'New')), note: 'Not contacted yet', spark: c.inMonths(c.leads, (l) => l.createdAt) })),
  tile('conversion', 'Lead conversion', 'Repeat', 'Leads', 'leads', (c) => ({ value: c.leads.length ? pct((count(c.leads, (l) => l.status === 'Converted') / c.leads.length) * 100) : '—', note: `${many(c.leads.length, 'lead')} in total` })),
  tile('hotLeads', 'Hot leads', 'Flame', 'Leads', 'leads', (c) => ({ value: num(count(c.all.leads, (l) => l.score >= 70 && !['Converted', 'Unqualified'].includes(l.status))), note: 'Score of 70 or more' })),
  /* Money numbers */
  tile('orderSales', 'Orders this month', 'ShoppingCart', 'Orders and money', 'orders', (c) => { const l = c.all.orders.filter((o) => monthKey(o.date) === c.m && o.status !== 'Cancelled'); return { value: moneyK(sum(l, (o) => o.total)), note: many(l.length, 'order'), spark: c.inMonths(c.orders, (o) => o.date, (o) => o.total) }; }),
  tile('toFulfil', 'Orders to fulfil', 'PackageOpen', 'Orders and money', 'orders', (c) => ({ value: num(count(c.all.orders, (o) => ['Pending', 'Processing'].includes(o.status))), note: 'Pending or processing' })),
  tile('unpaid', 'Unpaid invoices', 'Receipt', 'Orders and money', 'billing', (c) => { const l = c.all.invoices.filter((i) => unpaidOf(i) > 0); return { value: moneyK(sum(l, unpaidOf)), note: many(l.length, 'invoice') }; }),
  tile('overdue', 'Overdue invoices', 'ReceiptText', 'Orders and money', 'billing', (c) => { const l = c.all.invoices.filter((i) => unpaidOf(i) > 0 && i.due < c.now); return { value: moneyK(sum(l, unpaidOf)), note: `${l.length} past the due date` }; }),
  tile('collected', 'Cash collected', 'Wallet', 'Orders and money', 'billing', (c) => ({ value: moneyK(sum(c.payments, (p) => p.amount)), delta: c.prev && moved(sum(c.payments, (p) => p.amount), sum(c.prev.payments, (p) => p.amount)), note: 'Payments received', spark: c.inMonths(c.payments, (p) => p.date, (p) => p.amount) })),
  /* Stock numbers */
  tile('stockValue', 'Stock value', 'Warehouse', 'Stock and delivery', 'products', (c) => ({ value: moneyK(sum(c.products.filter((p) => p.tracked), (p) => p.stock * p.cost)), note: 'At cost' })),
  tile('openPurchases', 'Open purchase orders', 'ClipboardList', 'Stock and delivery', 'purchasing', (c) => { const open = (c.db.purchaseOrders || []).filter((o) => OPEN_PO.includes(o.status)); return { value: moneyK(open.reduce((a, o) => a + o.total, 0)), note: `${open.length} orders with suppliers` }; }),
  tile('stockToBuy', 'Products to reorder', 'ShoppingBasket', 'Stock and delivery', 'purchasing', (c) => ({ value: num(reorderPlan(c.db).length), note: 'At or below reorder level' })),
  tile('creditsIssued', 'Credit notes', 'Undo2', 'Money and orders', 'billing', (c) => { const list = (c.db.creditNotes || []).filter((x) => inRange(x.date, c.range)); return { value: moneyK(list.reduce((a, x) => a + x.total, 0)), note: `${list.length} in this period` }; }),
  tile('lowStock', 'Low stock', 'PackageX', 'Stock and delivery', 'products', (c) => ({ value: num(count(c.products, (p) => p.tracked && p.stock <= p.reorder)), note: 'At or below reorder level' })),
  tile('onTimeRate', 'On-time delivery', 'Target', 'Stock and delivery', 'logistics', (c) => { const done = c.all.shipments.filter((s) => s.status === 'Delivered'); return { value: done.length ? `${Math.round((done.filter((s) => deliveryState(s) === 'On time').length / done.length) * 100)}%` : '—', note: `${done.length} delivered` }; }),
  tile('inTransit', 'In transit', 'Truck', 'Stock and delivery', 'logistics', (c) => ({ value: num(count(c.all.shipments, (s) => s.status === 'In Transit')), note: 'Shipments on the road' })),
  tile('delayed', 'Delayed deliveries', 'Clock', 'Stock and delivery', 'logistics', (c) => ({ value: num(count(c.all.shipments, (s) => s.status === 'Delayed')), note: 'Tell the customer' })),
  /* Support, calls, day */
  tile('openCases', 'Open support cases', 'LifeBuoy', 'Support', 'cases', (c) => ({ value: num(count(c.all.cases, (x) => !closedStatus.includes(x.status))), note: `${c.all.cases.length} in total`, spark: c.inMonths(c.cases, (x) => x.createdAt) })),
  tile('urgentCases', 'Urgent cases', 'Siren', 'Support', 'cases', (c) => ({ value: num(count(c.all.cases, (x) => x.priority === 'Urgent' && !closedStatus.includes(x.status))), note: 'Still open' })),
  tile('callsToday', 'Calls today', 'PhoneCall', 'Calls', 'calls', (c) => ({ value: num(count(c.all.calls, (x) => x.at.slice(0, 10) === c.now)), note: `${c.all.calls.length} logged in total`, spark: c.inMonths(c.calls, (x) => x.at) })),
  tile('connect', 'Connect rate', 'PhoneForwarded', 'Calls', 'calls', (c) => ({ value: c.calls.length ? pct((count(c.calls, (x) => x.outcome === 'Connected') / c.calls.length) * 100) : '—', note: 'Calls that connected' })),
  tile('talk', 'Talk time', 'AudioWaveform', 'Calls', 'calls', (c) => ({ value: `${num(Math.round(sum(c.calls, (x) => x.duration) / 60))} min`, note: 'In the selected period' })),
  tile('aiCalls', 'AI Voice calls', 'AudioLines', 'Calls', 'aiVoice', (c) => ({ value: num(c.aiCalls.length), note: `${count(c.aiCalls, (x) => x.outcome === 'Interested')} interested (simulated)` })),
  tile('tasksDue', 'Due today or overdue', 'AlarmClock', 'My day', 'tasks', (c) => { const open = c.tasks.filter((a) => a.status !== 'done'); return { value: num(count(open, (a) => a.due <= c.now)), note: `${open.length} open in total` }; }),
  tile('followupsDue', 'Follow-ups due', 'BellRing', 'My day', 'followups', (c) => ({ value: num(count(c.followups, (f) => f.status === 'open' && f.at.slice(0, 10) <= c.now)), note: 'Today or late' })),
  tile('activeUsers', 'Active users', 'UsersRound', 'Team', 'users', (c) => ({ value: num(count(c.db.users, (u) => u.active)), note: many(c.db.teams.length, 'sales team') })),

  /* The changeable chart */
  { k: 'explorer', title: 'Chart builder', sub: 'Choose the data, measure, grouping and chart type', icon: 'SlidersHorizontal', group: 'Sales', type: 'chart', size: 'f', sec: 'charts', multi: true, module: 'reportBuilder', Explorer },

  /* Sales charts */
  chart('revenueTrend', 'Revenue won', 'In the selected period', 'TrendingUp', 'Sales', 'pipeline', 'l', ({ ctx }) => { const v = ctx.inMonths(ctx.won, (d) => d.closeDate, (d) => d.value); return v.some(Boolean) ? <Trend area height={220} data={ctx.months.map((k, i) => ({ label: ctx.label(k), value: v[i] }))} series={[{ key: 'value', name: 'Revenue won' }]} /> : <NoData />; }, { sec: 'teamRevenue' }),
  chart('wonLost', 'Won and lost deals', 'In the selected period', 'ChartColumnStacked', 'Sales', 'pipeline', 'l', ({ ctx }) => { const w = ctx.inMonths(ctx.won, (d) => d.closeDate); const l = ctx.inMonths(ctx.lost, (d) => d.closeDate); return w.some(Boolean) || l.some(Boolean) ? <Bars stacked height={220} format={num} data={ctx.months.map((k, i) => ({ label: ctx.label(k), won: w[i], lost: l[i] }))} series={[{ key: 'won', name: 'Won' }, { key: 'lost', name: 'Lost' }]} /> : <NoData />; }),
  chart('stages', 'Pipeline by stage', 'Value and number of open deals', 'Filter', 'Sales', 'pipeline', 'm', ({ ctx }) => <FunnelW rows={ctx.db.stages.filter((s) => s.id !== 'won').map((s) => { const l = ctx.open.filter((d) => d.stage === s.id); return { label: s.name, value: sum(l, (d) => d.value), count: l.length }; })} />, { sec: 'stageChart' }),
  chart('forecast', 'Forecast', 'Next 6 months, after probability', 'CalendarRange', 'Sales', 'pipeline', 'l', ({ ctx }) => { const rows = nextMonths(6).map((k) => ({ label: monthLabel(k), value: sum(ctx.open.filter((d) => monthKey(d.closeDate) === k), (d) => (d.value * d.probability) / 100) })); return rows.some((r) => r.value) ? <Bars height={220} data={rows} series={[{ key: 'value', name: 'Expected' }]} /> : <NoData />; }),
  chart('dealSource', 'Deals by source', 'Revenue won', 'Compass', 'Sales', 'pipeline', 'm', ({ ctx }) => <DonutW data={slices(ctx.won, (d) => d.source, (d) => d.value)} format={moneyK} label="won" />),
  chart('lostReasons', 'Why deals are lost', 'In the selected period', 'ThumbsDown', 'Sales', 'pipeline', 'm', ({ ctx }) => <RankW name="Deals" format={num} data={ranking(ctx.lost, (d) => d.lostReason || 'No reason given', () => 1)} />),
  chart('targetRing', 'Target', 'This year', 'Target', 'Sales', 'pipeline', 'm', ({ ctx }) => (ctx.target ? <div style={{ textAlign: 'center' }}><Ring value={(ctx.wonYear / ctx.target) * 100} label="of target" /><div className="small muted" style={{ marginTop: 8 }}>{money(ctx.wonYear)} of {money(ctx.target)}</div></div> : <NoData text="No target set." />)),
  chart('topCustomers', 'Top customers', 'Revenue won', 'Building2', 'Sales', 'pipeline', 'm', ({ ctx }) => { const { companyName } = useStore(); return <RankW name="Revenue won" data={ranking(ctx.won, (d) => companyName(d.companyId), (d) => d.value)} />; }),
  /* Leads charts */
  chart('leadStatus', 'Leads by status', 'In the selected period', 'ChartPie', 'Leads', 'leads', 'm', ({ ctx }) => <SplitW data={slices(ctx.leads, (l) => l.status)} label="leads" />),
  chart('leadSource', 'Leads by source', 'In the selected period', 'Compass', 'Leads', 'leads', 'm', ({ ctx }) => <RankW name="Leads" format={num} data={ranking(ctx.leads, (l) => l.source, () => 1)} />),
  chart('leadTrend', 'Leads over time', 'In the selected period', 'ChartLine', 'Leads', 'leads', 'l', ({ ctx }) => <MonthBars ctx={ctx} list={ctx.leads} dateOf={(l) => l.createdAt} name="Leads" format={num} />),
  chart('leadScore', 'Lead quality', 'By score', 'Gauge', 'Leads', 'leads', 'm', ({ ctx }) => <SplitW data={slices(ctx.leads, (l) => (l.score >= 70 ? 'Hot, 70 or more' : l.score >= 40 ? 'Warm, 40 to 69' : 'Cold, under 40'))} label="leads" />),
  /* Money charts */
  chart('orderTrend', 'Order value', 'In the selected period', 'ChartColumn', 'Orders and money', 'orders', 'l', ({ ctx }) => <MonthBars ctx={ctx} list={ctx.orders.filter((o) => o.status !== 'Cancelled')} dateOf={(o) => o.date} amount={(o) => o.total} name="Orders" />),
  chart('orderStatus', 'Orders by status', 'In the selected period', 'ChartPie', 'Orders and money', 'orders', 'm', ({ ctx }) => <SplitW data={slices(ctx.orders, (o) => o.status)} label="orders" />),
  chart('orderChannel', 'Sales by channel', 'Order value', 'Network', 'Orders and money', 'orders', 'm', ({ ctx }) => <DonutW data={slices(ctx.orders.filter((o) => o.status !== 'Cancelled'), (o) => o.channel, (o) => o.total)} format={moneyK} label="sales" />),
  chart('topProducts', 'Best-selling products', 'Order value', 'Package', 'Orders and money', 'orders', 'm', ({ ctx }) => <RankW name="Sales" data={ranking(ctx.orders.filter((o) => o.status !== 'Cancelled').flatMap((o) => o.items || []), (x) => x.name, (x) => x.qty * x.price)} />),
  chart('cash', 'Invoiced and collected', 'In the selected period', 'Landmark', 'Orders and money', 'billing', 'l', ({ ctx }) => { const a = ctx.inMonths(ctx.invoices, (i) => i.date, (i) => i.total); const b = ctx.inMonths(ctx.payments, (p) => p.date, (p) => p.amount); return a.some(Boolean) || b.some(Boolean) ? <Trend height={220} data={ctx.months.map((k, i) => ({ label: ctx.label(k), a: a[i], b: b[i] }))} series={[{ key: 'a', name: 'Invoiced' }, { key: 'b', name: 'Collected' }]} /> : <NoData />; }),
  chart('ageing', 'Unpaid by days overdue', 'Money still owed', 'Hourglass', 'Orders and money', 'billing', 'm', ({ ctx }) => {
    const age = (i) => Math.floor((Date.now() - new Date(i.due).getTime()) / DAY);
    const open = ctx.all.invoices.filter((i) => unpaidOf(i) > 0);
    const rows = [['Not due', (n) => n <= 0], ['1–30', (n) => n > 0 && n <= 30], ['31–60', (n) => n > 30 && n <= 60], ['61–90', (n) => n > 60 && n <= 90], ['90+', (n) => n > 90]].map(([label, t]) => ({ label, value: sum(open.filter((i) => t(age(i))), unpaidOf) }));
    return rows.some((r) => r.value) ? <Bars height={220} data={rows} series={[{ key: 'value', name: 'Unpaid' }]} /> : <NoData text="Nothing is unpaid." />;
  }),
  chart('invoiceStatus', 'Invoices by status', 'In the selected period', 'ChartPie', 'Orders and money', 'billing', 'm', ({ ctx }) => <SplitW data={slices(ctx.invoices, (i) => i.status)} label="invoices" />),
  /* Stock charts */
  chart('stockCategory', 'Stock value by category', 'At cost', 'Warehouse', 'Stock and delivery', 'products', 'm', ({ ctx }) => <RankW name="Stock value" data={ranking(ctx.products.filter((p) => p.tracked), (p) => p.category, (p) => p.stock * p.cost)} />),
  chart('shipStatus', 'Deliveries by status', 'In the selected period', 'Truck', 'Stock and delivery', 'logistics', 'm', ({ ctx }) => <SplitW data={slices(ctx.shipments, (s) => s.status)} label="deliveries" />),
  /* Support charts */
  chart('caseStatus', 'Cases by status', 'In the selected period', 'ChartPie', 'Support', 'cases', 'm', ({ ctx }) => <SplitW data={slices(ctx.cases, (x) => x.status)} label="cases" />),
  chart('casePriority', 'Open cases by priority', 'Not closed yet', 'Siren', 'Support', 'cases', 'm', ({ ctx }) => <CellsW cells={['Urgent', 'High', 'Normal', 'Low'].map((p) => ({ label: p, tone: p === 'Urgent' ? 'bad' : p === 'High' ? 'warn' : '', value: count(ctx.cases, (x) => x.priority === p && !closedStatus.includes(x.status)) }))} />),
  chart('caseTrend', 'New cases', 'In the selected period', 'ChartLine', 'Support', 'cases', 'l', ({ ctx }) => <MonthBars ctx={ctx} list={ctx.cases} dateOf={(x) => x.createdAt} name="Cases" format={num} />),
  /* Call charts */
  chart('callOutcome', 'Call outcomes', 'In the selected period', 'PhoneCall', 'Calls', 'calls', 'm', ({ ctx }) => <SplitW data={slices(ctx.calls, (x) => x.outcome)} label="calls" />),
  chart('callTrend', 'Calls', 'In the selected period', 'ChartColumn', 'Calls', 'calls', 'l', ({ ctx }) => <MonthBars ctx={ctx} list={ctx.calls} dateOf={(x) => x.at} name="Calls" format={num} />),
  chart('aiOutcome', 'AI Voice results', 'Simulated, in the selected period', 'AudioLines', 'Calls', 'aiVoice', 'm', ({ ctx }) => <SplitW data={slices(ctx.aiCalls, (x) => x.outcome)} label="calls" />),
  /* Team charts */
  chart('revenueTeams', 'Revenue won by team', 'In the selected period', 'UsersRound', 'Team', 'teams', 'l', ({ ctx }) => {
    const { db } = ctx;
    const teamOf = (id) => db.users.find((u) => u.id === id)?.teamId;
    const rows = ctx.months.map((k) => { const r = { label: ctx.label(k) }; db.teams.forEach((x) => { r[x.id] = sum(ctx.won.filter((d) => ctx.keyOf(d.closeDate) === k && teamOf(d.ownerId) === x.id), (d) => d.value); }); return r; });
    return db.teams.length && ctx.won.length ? <Bars height={240} data={rows} series={db.teams.map((x) => ({ key: x.id, name: x.name }))} /> : <NoData />;
  }, { sec: 'revenueTeams' }),
  chart('leaderboard', 'Leaderboard', 'Revenue won in the selected period', 'Medal', 'Team', 'teams', 'm', ({ ctx }) => { const { userName } = useStore(); return <RankW name="Revenue won" data={ranking(ctx.won, (d) => userName(d.ownerId), (d) => d.value, 6)} />; }),
  chart('taskStatus', 'Tasks by status', 'All tasks', 'ListTodo', 'My day', 'tasks', 'm', ({ ctx }) => <SplitW data={slices(ctx.tasks, (a) => a.status)} label="tasks" />),
  list('targets', 'Team targets', 'This year', 'Flag', 'Team', 'teams', 'm', 'targets', ({ ctx }) => {
    const { userName } = useStore();
    const { db } = ctx;
    const teamOf = (id) => db.users.find((u) => u.id === id)?.teamId;
    return <div className="stack">{db.teams.map((x) => { const won = sum(ctx.all.won.filter((d) => (d.closeDate || '').startsWith(ctx.y) && teamOf(d.ownerId) === x.id), (d) => d.value); const p = x.target ? (won / x.target) * 100 : 0; return <div key={x.id}><div className="row between"><span className="strong trunc">{x.name}</span><span className="num small">{moneyK(won)} of {moneyK(x.target)}</span></div><div style={{ marginTop: 5 }}><Progress value={p} /></div><div className="small muted" style={{ marginTop: 3 }}>{pct(p)} · led by {userName(x.managerId)}</div></div>; })}</div>;
  }),

  /* Lists */
  list('nextBest', 'What to do first', 'Ranked by urgency and value, using fixed rules', 'Sparkles', 'My day', 'dashboard', 'l', 'charts', ({ ctx }) => {
    const { canRoute, db, companyName } = useStore();
    if (db.settings.aiNextBest === false) return <Empty icon="Sparkles" text="Turned off in Settings." />;
    const items = nextActions({ db, tasks: ctx.tasks, open: ctx.open, leads: ctx.all.leads, invoices: ctx.all.invoices, cases: ctx.all.cases, companyName });
    if (!items.length) return <Empty icon="CheckCheck" text="Nothing urgent right now." />;
    return items.map((x) => <Row key={x.title} to={canRoute(x.to.split('?')[0].replace(/\/[^/]*$/, (m) => (x.to.includes('?') ? m : ''))) ? x.to : undefined}><span className="kpi-ico" style={{ width: 30, height: 30 }}><Icon name={x.icon} size={15} /></span><span className="grow" style={{ minWidth: 0 }}><span className="strong trunc" style={{ display: 'block' }}>{x.title}</span><span className="small muted trunc" style={{ display: 'block' }}>{x.why}</span></span><Icon name="ChevronRight" size={15} color="var(--ink-3)" /></Row>);
  }),
  list('likelyDeals', 'Most likely to close', 'By win chance', 'Trophy', 'Sales', 'pipeline', 'm', 'charts', ({ ctx }) => {
    const { companyName } = useStore();
    const l = ctx.open.map((d) => ({ d, s: dealScore(ctx.db, d)?.score || 0 })).sort((a, b) => b.s - a.s || b.d.value - a.d.value).slice(0, 5);
    if (!l.length) return <Empty icon="Handshake" text="No open deals." />;
    return l.map(({ d, s }) => <Row key={d.id} to={`/pipeline/${d.id}`}><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{d.title}</div><div className="small muted trunc">{companyName(d.companyId)} · {moneyK(d.value)}</div></div><span className="num strong">{s}%</span></Row>);
  }),
  list('atRisk', 'Customers at risk', 'From customer health', 'HeartPulse', 'Sales', 'customers', 'm', 'charts', ({ ctx }) => {
    const { scope } = useStore();
    const l = scope(ctx.db.companies, 'customers').map((c) => ({ c, h: customerHealth(ctx.db, c) })).filter((x) => x.h.label === 'At risk').sort((a, b) => a.h.score - b.h.score).slice(0, 5);
    if (!l.length) return <Empty icon="HeartHandshake" text="No customers look at risk." />;
    return l.map(({ c, h }) => <Row key={c.id} to={`/customers/${c.id}`}><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{c.name}</div><div className="small muted trunc">{h.reasons.filter((r) => r[1] < 0)[0]?.[0]}</div></div><Badge tone="bad" dot={false}>{h.score}</Badge></Row>);
  }),
  list('meetings', "Today's meetings", '', 'CalendarCheck', 'My day', 'calendar', 'm', 'todayMeetings', TodayMeetings, { to: '/calendar' }),
  list('focus', "Today's focus", 'Overdue first', 'ListChecks', 'My day', 'tasks', 'm', 'focus', Focus, { to: '/tasks' }),
  list('followups', 'Follow-ups today', '', 'BellRing', 'My day', 'followups', 'm', 'followupsCard', Followups, { to: '/followups' }),
  list('appointments', 'Next appointments', '', 'CalendarDays', 'My day', 'calendar', 'm', 'appointments', ({ ctx }) => {
    const iso = new Date().toISOString();
    const l = ctx.events.filter((e) => e.start >= iso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
    if (!l.length) return <Empty icon="CalendarOff" text="Nothing scheduled." />;
    return l.map((e) => <div key={e.id} className="dashlet"><div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}><div className="small muted">{new Date(e.start).toLocaleDateString(getLocale(), { month: 'short' })}</div><div className="strong num" style={{ fontSize: 16, lineHeight: 1.1 }}>{new Date(e.start).getDate()}</div></div><div className="grow" style={{ minWidth: 0 }}><div className="trunc strong">{e.title}</div><div className="small muted trunc">{fmtTime(e.start)} · {e.location}</div></div></div>);
  }, { to: '/calendar' }),
  list('attention', 'Needs attention', '', 'TriangleAlert', 'Team', 'dashboard', 'm', 'attention', Attention),
  list('insights', 'What the numbers say', 'Last 90 days, from your records', 'Lightbulb', 'Team', 'insights', 'l', 'charts', InsightsW, { to: '/insights', secOf: ['insights', 'business'] }),
  list('approvals', 'Approvals', 'Transfers waiting for you', 'CircleCheck', 'Team', 'transfers', 'm', 'approvals', Approvals, { to: '/transfers', needs: ['transfers', 'approve'] }),
  list('leadsToContact', 'Leads to contact', 'Highest score first', 'Magnet', 'Leads', 'leads', 'm', 'leadsCard', ({ ctx }) => {
    const l = ctx.all.leads.filter((x) => x.status === 'New').sort((a, b) => b.score - a.score).slice(0, 5);
    if (!l.length) return <Empty icon="Magnet" text="No new leads." />;
    return l.map((x) => <Row key={x.id} to={`/leads?open=${x.id}`}><Avatar name={x.name} size={28} /><div className="grow" style={{ minWidth: 0 }}><div className="trunc strong">{x.name}</div><div className="small muted trunc">{x.company}</div></div><Badge tone="muted" dot={false}>{x.score}</Badge></Row>);
  }, { to: '/leads' }),
  list('closing', 'Closing soon', 'Next 30 days', 'Handshake', 'Sales', 'pipeline', 'm', 'closing', ({ ctx }) => {
    const { companyName } = useStore();
    const l = ctx.open.filter((d) => d.closeDate <= addDays(30)).sort((a, b) => a.closeDate.localeCompare(b.closeDate)).slice(0, 5);
    if (!l.length) return <Empty icon="Handshake" text="No deals closing soon." />;
    return l.map((d) => <Row key={d.id} to={`/pipeline/${d.id}`}><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{d.title}</div><div className="small muted trunc">{companyName(d.companyId)}</div></div><span style={{ textAlign: 'end' }}><div className="num strong">{moneyK(d.value)}</div><div className="small nowrap" style={{ color: d.closeDate < ctx.now ? 'var(--bad)' : 'var(--ink-3)' }}>{fmtShort(d.closeDate)}</div></span></Row>);
  }, { to: '/pipeline' }),
  list('risk', 'Deals at risk', 'Largest first', 'ShieldAlert', 'Sales', 'pipeline', 'm', 'risk', ({ ctx }) => {
    const planned = new Set(ctx.tasks.filter((a) => a.status !== 'done').map((a) => a.relatedId));
    const l = ctx.open.map((d) => ({ d, why: d.closeDate < ctx.now ? 'Past closing date' : !planned.has(d.id) ? 'No next activity' : null })).filter((x) => x.why).sort((a, b) => b.d.value - a.d.value).slice(0, 5);
    if (!l.length) return <Empty icon="ShieldCheck" text="No deals at risk." />;
    return l.map(({ d, why }) => <Row key={d.id} to={`/pipeline/${d.id}`}><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{d.title}</div><Badge tone={d.closeDate < ctx.now ? 'bad' : 'warn'}>{why}</Badge></div><span className="num strong">{moneyK(d.value)}</span></Row>);
  }),
  list('waiting', 'Waiting on my manager', '', 'Hourglass', 'My day', 'transfers', 'm', 'transfersCard', ({ ctx }) => {
    const l = ctx.db.transfers.filter((x) => x.status === 'Pending' && x.requestedBy === ctx.me.id);
    return l.length ? l.map((x) => <div key={x.id} className="dashlet"><div className="grow trunc">{x.recordLabel}</div><Badge>{x.status}</Badge></div>) : <Empty icon="CheckCheck" text="Nothing waiting." />;
  }, { to: '/transfers' }),
  list('users', 'Users and access', '', 'UserCog', 'Team', 'users', 'm', 'usersCard', ({ ctx }) => {
    const { db } = ctx;
    return [['Admins', 'admin'], ['Managers', 'manager'], ['Sales people', 'sales']].map(([label, r]) => <div key={r} className="dashlet"><span className="grow">{label}</span><strong className="num">{count(db.users, (u) => u.role === r && u.active)}</strong></div>).concat(<div key="off" className="dashlet"><span className="grow">Inactive</span><strong className="num">{count(db.users, (u) => !u.active)}</strong></div>);
  }, { to: '/users' }),
  list('activity', 'Recent system activity', '', 'ScrollText', 'Team', 'audit', 'l', 'activity', ({ ctx }) => {
    const { userName } = useStore();
    return ctx.db.audit.slice(0, 6).map((a) => <div key={a.id} className="dashlet"><Avatar name={userName(a.userId)} size={26} /><span className="grow trunc"><strong>{userName(a.userId)}</strong> <span className="muted">{a.action === 'Automation' ? 'ran the rule' : `${a.action.toLowerCase()}d`}</span> {a.label}</span><span className="small muted nowrap">{relTime(a.at)}</span></div>);
  }, { to: '/audit' }),
  { ...list('scorecard', 'Rep scorecard', 'Won in the selected period, target for the year', 'Medal', 'Team', 'teams', 'f', 'scorecard', Scorecard, { to: '/teams' }), type: 'table', pad: false },
  { ...list('coaching', 'Coaching', 'Who may need help this week', 'HeartHandshake', 'Team', 'teams', 'f', 'coaching', ({ ctx }) => <Coaching userIds={ctx.db.users.filter((u) => u.active && u.role !== 'admin' && (ctx.me.role === 'admin' || u.teamId === ctx.me.teamId)).map((u) => u.id)} />), type: 'table', bare: true },
  { ...list('pinned', 'Pinned reports', 'Reports you pinned in the report builder', 'Pin', 'Team', 'reportBuilder', 'f', 'charts', () => <PinnedReports />), bare: true },
];

export const widgetOf = (k) => WIDGETS.find((w) => w.k === k);

// Charts of the same size can swap places, so each one's heading is a dropdown of the others.
const FAMILIES = [
  ['orderStatus', 'orderChannel', 'dealSource', 'leadStatus', 'leadScore', 'invoiceStatus', 'shipStatus', 'caseStatus', 'casePriority', 'callOutcome', 'aiOutcome', 'taskStatus', 'stages', 'lostReasons', 'topCustomers', 'topProducts', 'leadSource', 'stockCategory', 'leaderboard', 'ageing'],
  ['revenueTrend', 'wonLost', 'forecast', 'revenueTeams', 'leadTrend', 'orderTrend', 'cash', 'caseTrend', 'callTrend'],
];
export const familyOf = (k) => FAMILIES.find((f) => f.includes(k)) || [];

// What sits behind each widget. `key` matches a record to the chart segment that was clicked.
const byMonthLabel = (date) => (r, c) => c.label(c.keyOf(date(r)));
const open = (x) => !closedStatus.includes(x.status);
export const DRILLS = {
  wonYear: { kind: 'deal', rows: (c) => c.won }, avgDeal: { kind: 'deal', rows: (c) => c.won }, winRate: { kind: 'deal', rows: (c) => [...c.won, ...c.lost] },
  wonMonth: { kind: 'deal', rows: (c) => c.all.won.filter((d) => monthKey(d.closeDate) === c.m) }, target: { kind: 'deal', rows: (c) => c.all.won.filter((d) => (d.closeDate || '').startsWith(c.y)) },
  pipeline: { kind: 'deal', rows: (c) => c.open }, weighted: { kind: 'deal', rows: (c) => c.open }, closing30: { kind: 'deal', rows: (c) => c.open.filter((d) => d.closeDate >= c.now && d.closeDate <= addDays(30)) }, lateDeals: { kind: 'deal', rows: (c) => c.open.filter((d) => d.closeDate < c.now) },
  newLeads: { kind: 'lead', rows: (c) => c.all.leads.filter((l) => l.status === 'New') }, conversion: { kind: 'lead', rows: (c) => c.leads }, hotLeads: { kind: 'lead', rows: (c) => c.all.leads.filter((l) => l.score >= 70 && !['Converted', 'Unqualified'].includes(l.status)) },
  orderSales: { kind: 'order', rows: (c) => c.all.orders.filter((o) => monthKey(o.date) === c.m && o.status !== 'Cancelled') }, toFulfil: { kind: 'order', rows: (c) => c.all.orders.filter((o) => ['Pending', 'Processing'].includes(o.status)) },
  unpaid: { kind: 'invoice', rows: (c) => c.all.invoices.filter((i) => unpaidOf(i) > 0) }, overdue: { kind: 'invoice', rows: (c) => c.all.invoices.filter((i) => unpaidOf(i) > 0 && i.due < c.now) }, collected: { kind: 'payment', rows: (c) => c.payments },
  stockValue: { kind: 'product', rows: (c) => c.products.filter((p) => p.tracked) }, lowStock: { kind: 'product', rows: (c) => c.products.filter((p) => p.tracked && p.stock <= p.reorder) },
  inTransit: { kind: 'shipment', rows: (c) => c.all.shipments.filter((s) => s.status === 'In Transit') }, delayed: { kind: 'shipment', rows: (c) => c.all.shipments.filter((s) => s.status === 'Delayed') },
  openCases: { kind: 'case', rows: (c) => c.all.cases.filter(open) }, urgentCases: { kind: 'case', rows: (c) => c.all.cases.filter((x) => x.priority === 'Urgent' && open(x)) },
  callsToday: { kind: 'call', rows: (c) => c.all.calls.filter((x) => x.at.slice(0, 10) === c.now) }, connect: { kind: 'call', rows: (c) => c.calls }, talk: { kind: 'call', rows: (c) => c.calls }, aiCalls: { kind: 'ai', rows: (c) => c.aiCalls },
  tasksDue: { kind: 'task', rows: (c) => c.tasks.filter((a) => a.status !== 'done' && a.due <= c.now) }, followupsDue: { kind: 'followup', rows: (c) => c.followups.filter((f) => f.status === 'open' && f.at.slice(0, 10) <= c.now) },
  revenueTrend: { kind: 'deal', rows: (c) => c.won, key: byMonthLabel((d) => d.closeDate) }, wonLost: { kind: 'deal', rows: (c) => [...c.won, ...c.lost], key: byMonthLabel((d) => d.closeDate) }, revenueTeams: { kind: 'deal', rows: (c) => c.won, key: byMonthLabel((d) => d.closeDate) },
  stages: { kind: 'deal', rows: (c) => c.open, key: (d, c) => c.db.stages.find((s) => s.id === d.stage)?.name }, forecast: { kind: 'deal', rows: (c) => c.open, key: (d) => monthLabel(monthKey(d.closeDate)) },
  dealSource: { kind: 'deal', rows: (c) => c.won, key: (d) => d.source || 'None' }, lostReasons: { kind: 'deal', rows: (c) => c.lost, key: (d) => d.lostReason || 'No reason given' }, topCustomers: { kind: 'deal', rows: (c) => c.won, key: (d, c) => c.names.companyName(d.companyId) }, leaderboard: { kind: 'deal', rows: (c) => c.won, key: (d, c) => c.names.userName(d.ownerId) },
  leadStatus: { kind: 'lead', rows: (c) => c.leads, key: (l) => l.status || 'None' }, leadSource: { kind: 'lead', rows: (c) => c.leads, key: (l) => l.source || 'None' }, leadTrend: { kind: 'lead', rows: (c) => c.leads, key: byMonthLabel((l) => l.createdAt) }, leadScore: { kind: 'lead', rows: (c) => c.leads, key: (l) => (l.score >= 70 ? 'Hot, 70 or more' : l.score >= 40 ? 'Warm, 40 to 69' : 'Cold, under 40') },
  orderStatus: { kind: 'order', rows: (c) => c.orders, key: (o) => o.status || 'None' }, orderChannel: { kind: 'order', rows: (c) => c.orders.filter((o) => o.status !== 'Cancelled'), key: (o) => o.channel || 'None' }, orderTrend: { kind: 'order', rows: (c) => c.orders.filter((o) => o.status !== 'Cancelled'), key: byMonthLabel((o) => o.date) },
  cash: { kind: 'invoice', rows: (c) => c.invoices, key: byMonthLabel((i) => i.date) }, invoiceStatus: { kind: 'invoice', rows: (c) => c.invoices, key: (i) => i.status || 'None' },
  ageing: { kind: 'invoice', rows: (c) => c.all.invoices.filter((i) => unpaidOf(i) > 0), key: (i) => { const n = Math.floor((Date.now() - new Date(i.due).getTime()) / DAY); return n <= 0 ? 'Not due' : n <= 30 ? '1–30' : n <= 60 ? '31–60' : n <= 90 ? '61–90' : '90+'; } },
  stockCategory: { kind: 'product', rows: (c) => c.products.filter((p) => p.tracked), key: (p) => p.category || 'None' }, shipStatus: { kind: 'shipment', rows: (c) => c.shipments, key: (s) => s.status || 'None' },
  caseStatus: { kind: 'case', rows: (c) => c.cases, key: (x) => x.status || 'None' }, casePriority: { kind: 'case', rows: (c) => c.cases.filter(open), key: (x) => x.priority }, caseTrend: { kind: 'case', rows: (c) => c.cases, key: byMonthLabel((x) => x.createdAt) },
  callOutcome: { kind: 'call', rows: (c) => c.calls, key: (x) => x.outcome || 'None' }, callTrend: { kind: 'call', rows: (c) => c.calls, key: byMonthLabel((x) => x.at) }, aiOutcome: { kind: 'ai', rows: (c) => c.aiCalls, key: (x) => x.outcome || 'None' }, taskStatus: { kind: 'task', rows: (c) => c.tasks, key: (a) => a.status || 'None' },
};

// Ready-made extra dashboards.
export const BOARD_TEMPLATES = {
  blank: { label: 'Start empty', items: [] },
  sales: { label: 'Sales', items: ['wonYear', 'winRate', 'avgDeal', 'pipeline', 'revenueTrend', 'forecast', 'stages', 'dealSource', 'lostReasons', 'topCustomers', 'leaderboard', 'risk'] },
  finance: { label: 'Finance', items: ['collected', 'unpaid', 'overdue', 'orderSales', 'cash', 'ageing', 'invoiceStatus', 'orderChannel', 'topProducts'] },
  operations: { label: 'Operations', items: ['toFulfil', 'onTimeRate', 'lowStock', 'openPurchases', 'stockToBuy', 'creditsIssued', 'inTransit', 'delayed', 'orderStatus', 'shipStatus', 'stockCategory', 'caseStatus', 'casePriority', 'caseTrend'] },
};

// What each role starts with, until someone changes their own dashboard. Related widgets sit together.
export const DEFAULTS = {
  admin: [
    'wonYear', 'collected', 'winRate', 'avgDeal', 'pipeline', 'weighted', 'target', 'unpaid', 'overdue', 'toFulfil', 'aiForecast', 'openCases',
    'insights', 'attention',
    'nextBest', 'atRisk', 'likelyDeals',
    'sec_sales', 'revenueTeams', 'forecast', 'stages', 'targets', 'dealSource', 'topCustomers', 'lostReasons', 'leaderboard',
    'sec_money', 'cash', 'ageing', 'orderStatus', 'orderChannel', 'topProducts',
    'sec_ops', 'shipStatus', 'casePriority', 'callOutcome',
    'sec_team', 'activity', 'users', 'coaching',
    'sec_build', 'explorer', 'pinned',
  ],
  manager: [
    'wonYear', 'winRate', 'avgDeal', 'target', 'pipeline', 'weighted', 'closing30', 'lateDeals', 'newLeads', 'hotLeads', 'tasksDue', 'urgentCases',
    'insights', 'nextBest',
    'approvals', 'likelyDeals', 'atRisk',
    'sec_sales', 'revenueTrend', 'forecast', 'stages', 'leaderboard', 'risk', 'lostReasons',
    'sec_leads', 'leadStatus', 'callOutcome', 'casePriority',
    'sec_team', 'scorecard', 'coaching',
    'sec_build', 'explorer', 'pinned',
  ],
  sales: [
    'tasksDue', 'followupsDue', 'closing30', 'hotLeads', 'wonYear', 'winRate', 'pipeline', 'target',
    'sec_day', 'nextBest', 'likelyDeals', 'meetings', 'focus', 'followups',
    'sec_sales', 'revenueTrend', 'targetRing', 'stages', 'closing', 'lostReasons',
    'sec_leads', 'leadsToContact', 'callOutcome', 'appointments',
    'sec_build', 'explorer', 'waiting', 'pinned',
  ],
};
