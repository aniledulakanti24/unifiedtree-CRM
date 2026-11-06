import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { DateRange, inRange, previousOf, useDateRange } from '../dateRange';
import { Badge, Btn, Card, Confirm, DataTable, Empty, FormFields, Icon, ListField, Modal, PageHead, Progress } from '../ui';
import { Bars, Donut, DrillCtx, SERIES, Trend } from '../charts';
import { RecordsDrawer, printPage } from '../drill';
import { MODULE_BY_KEY } from '../permissions';
import { downloadCsv, fmtDate, fmtDT, iso, money, moneyK, monthKey, monthLabel, num, sum, today } from '../util';

const OWNER = ['owner', 'Salesperson'];
const CUSTOMER = ['customer', 'Customer'];
const MONTH = ['month', 'Month'];
const QUARTER = ['quarter', 'Quarter'];
export const SOURCES = {
  deals: { label: 'Opportunities', kind: 'deal', module: 'pipeline', date: (r) => r.closeDate, groups: [['stage', 'Stage'], OWNER, ['source', 'Source'], ['status', 'Status'], ['pipeline', 'Pipeline'], ['competitor', 'Competitor'], ['lostReason', 'Lost reason'], CUSTOMER, ['industry', 'Customer industry'], ['ccountry', 'Customer country'], MONTH, QUARTER], measures: [['winrate', 'Win rate (%)'], ['value', 'Expected revenue'], ['weighted', 'After probability']] },
  leads: { label: 'Leads', kind: 'lead', module: 'leads', date: (r) => r.createdAt, groups: [['status', 'Status'], ['source', 'Source'], OWNER, ['country', 'Country'], MONTH, QUARTER], measures: [['convrate', 'Converted (%)'], ['expected', 'Expected revenue'], ['score', 'Lead score']] },
  orders: { label: 'Orders', kind: 'order', module: 'orders', date: (r) => r.date, groups: [['status', 'Status'], ['channel', 'Channel'], OWNER, CUSTOMER, ['industry', 'Customer industry'], ['ccountry', 'Customer country'], MONTH, QUARTER], measures: [['total', 'Total']] },
  invoices: { label: 'Invoices', kind: 'invoice', module: 'billing', date: (r) => r.date, groups: [['status', 'Status'], OWNER, CUSTOMER, ['industry', 'Customer industry'], ['ccountry', 'Customer country'], MONTH, QUARTER], measures: [['total', 'Total'], ['paid', 'Paid'], ['unpaid', 'Still unpaid']] },
  quotes: { label: 'Quotes', kind: 'quote', module: 'billing', date: (r) => r.date, groups: [['status', 'Status'], OWNER, CUSTOMER, MONTH], measures: [['total', 'Total']] },
  cases: { label: 'Support cases', kind: 'case', module: 'cases', date: (r) => r.createdAt, groups: [['status', 'Status'], ['priority', 'Priority'], ['type', 'Type'], OWNER, CUSTOMER, ['industry', 'Customer industry'], ['ccountry', 'Customer country'], MONTH], measures: [] },
  calls: { label: 'Calls', kind: 'call', module: 'calls', date: (r) => r.at, groups: [['outcome', 'Outcome'], ['direction', 'Direction'], OWNER, MONTH], measures: [['connectrate', 'Answered (%)'], ['duration', 'Talk time (seconds)']] },
  activities: { label: 'Tasks', kind: 'task', module: 'tasks', date: (r) => r.due, groups: [['status', 'Status'], ['priority', 'Priority'], ['tag', 'Tag'], OWNER, MONTH], measures: [] },
  emails: { label: 'Emails', kind: 'email', module: 'emails', date: (r) => r.at, groups: [['status', 'Status'], OWNER, ['templateId', 'Template'], ['campaign', 'Campaign'], MONTH], measures: [['openrate', 'Opened (%)'], ['replyrate', 'Replied (%)']] },
  formSubmissions: { label: 'Web enquiries', kind: 'enquiry', module: 'webforms', all: true, date: (r) => r.at, groups: [['status', 'Result'], ['form', 'Form'], ['from', 'Came from'], OWNER, MONTH], measures: [] },
  companies: { label: 'Customers', kind: 'company', module: 'customers', date: (r) => r.createdAt, groups: [['status', 'Status'], ['industry', 'Industry'], ['country', 'Country'], OWNER], measures: [] },
};
// Rates are worked out across a group of records, not added up.
const share = (list, test) => (list.length ? (list.filter(test).length / list.length) * 100 : 0);
const sentMail = (l) => l.filter((r) => !r.incoming && !['Draft', 'Scheduled', 'Bounced'].includes(r.status));
export const RATES = {
  winrate: (l) => share(l.filter((r) => ['won', 'lost'].includes(r.status)), (r) => r.status === 'won'),
  convrate: (l) => share(l, (r) => r.status === 'Converted'),
  connectrate: (l) => share(l, (r) => r.outcome === 'Connected'),
  openrate: (l) => share(sentMail(l), (r) => ['Opened', 'Clicked', 'Replied'].includes(r.status)),
  replyrate: (l) => share(sentMail(l), (r) => r.status === 'Replied'),
};
const pctFmt = (v) => `${Math.round(v)}%`;
const quarterOf = (s) => { const k = monthKey(s); return k ? `${k.slice(0, 4)} Q${Math.ceil(Number(k.slice(5)) / 3)}` : 'None'; };
const groupOf = (db, userName, companyName, source, group, r) => {
  if (group === 'owner') return userName(r.ownerId);
  if (group === 'customer') return companyName(r.companyId);
  if (group === 'industry') return db.companies.find((c) => c.id === r.companyId)?.industry || 'None';
  if (group === 'ccountry') return db.companies.find((c) => c.id === r.companyId)?.country || 'None';
  if (group === 'templateId') return (db.emailTemplates || []).find((t) => t.id === r.templateId)?.name || 'No template';
  if (group === 'campaign') return (db.emailCampaigns || []).find((c) => c.id === r.campaignId)?.name || 'Not a campaign';
  if (group === 'form') return (db.webForms || []).find((f) => f.id === r.formId)?.name || 'Deleted form';
  if (group === 'from') return r.utm?.utm_source || 'Direct link';
  if (group === 'month') return monthKey(SOURCES[source].date(r)) || 'None';
  if (group === 'quarter') return quarterOf(SOURCES[source].date(r));
  if (group === 'stage') return r.status === 'lost' ? 'Lost' : db.stages.find((s) => s.id === r.stage)?.name || r.stage;
  return r[group] || 'None';
};
const amountOf = (r, m) => (m === 'count' ? 1 : m === 'weighted' ? (r.value * (r.probability || 0)) / 100 : m === 'unpaid' ? (r.total || 0) - (r.paid || 0) : Number(r[m]) || 0);
const showLabel = (group, k) => (group === 'month' && k !== 'None' ? monthLabel(k) : k);

// The records a report counts, after its dates, status and filters.
export function reportRecords(db, scope, userName, companyName, cfg, range = cfg.range) {
  const src = SOURCES[cfg.source];
  // Lists without owners, like web enquiries, aren't narrowed by owner: access to the page is the check.
  const list = src.all && !MODULE_BY_KEY[src.module]?.scoped ? db[cfg.source] || [] : scope(db[cfg.source] || [], src.module);
  return list.filter((r) => (!range || inRange(src.date(r), range))
    && (!cfg.status || cfg.status === 'all' || r.status === cfg.status)
    && (cfg.filters || []).every((f) => {
      if (!f.field || f.value === '' || f.value == null) return true;
      if (src.measures.some(([k]) => k === f.field)) { const a = amountOf(r, f.field); const v = Number(f.value); return f.op === 'lt' ? a < v : a > v; }
      return (groupOf(db, userName, companyName, cfg.source, f.field, r) === f.value) === (f.op !== 'not');
    }));
}

export function runReport(db, scope, userName, companyName, cfg) {
  const rows = reportRecords(db, scope, userName, companyName, cfg);
  const key = (r, g = cfg.group) => groupOf(db, userName, companyName, cfg.source, g, r);
  const total = (list) => { if (RATES[cfg.measure]) return RATES[cfg.measure](list); const t = sum(list, (r) => amountOf(r, cfg.measure)); return cfg.agg === 'avg' && list.length ? t / list.length : t; };
  const buckets = new Map();
  rows.forEach((r) => { const k = key(r); buckets.set(k, [...(buckets.get(k) || []), r]); });
  const prevRange = cfg.compare ? previousOf(cfg.range) : null;
  const prevRows = prevRange ? reportRecords(db, scope, userName, companyName, cfg, prevRange) : [];
  const splits = cfg.split ? (() => { const t = new Map(); rows.forEach((r) => { const k = key(r, cfg.split); t.set(k, (t.get(k) || 0) + amountOf(r, RATES[cfg.measure] ? 'count' : cfg.measure)); }); return [...t].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k); })() : [];
  const data = [...buckets].map(([k, list]) => {
    const row = { label: showLabel(cfg.group, k), sort: k, Value: total(list), count: list.length };
    if (prevRange) row.Previous = total(prevRows.filter((r) => key(r) === k));
    splits.forEach((s) => { row[s] = total(list.filter((r) => key(r, cfg.split) === s)); });
    return row;
  });
  const stageOrder = [...db.stages.map((s) => s.name), 'Lost'];
  if (cfg.group === 'stage') data.sort((a, b) => stageOrder.indexOf(a.label) - stageOrder.indexOf(b.label));
  else if (cfg.group === 'month' || cfg.group === 'quarter') data.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
  else data.sort((a, b) => b.Value - a.Value);
  data.splits = splits;
  data.grand = total(rows);
  data.prevGrand = prevRange ? total(prevRows) : null;
  return data;
}

const isMoney = (cfg) => !['count', 'duration', 'score'].includes(cfg.measure) && !RATES[cfg.measure];
const fmtOf = (cfg) => (RATES[cfg.measure] ? pctFmt : isMoney(cfg) ? money : num);
const measureName = (cfg) => { const m = cfg.measure === 'count' ? 'Number of records' : SOURCES[cfg.source].measures.find(([k]) => k === cfg.measure)?.[1] || 'Value'; return cfg.agg === 'avg' && cfg.measure !== 'count' && !RATES[cfg.measure] ? `Average ${m.toLowerCase()}` : m; };

export function ReportChart({ cfg, data, height = 300 }) {
  const fmt = RATES[cfg.measure] ? pctFmt : isMoney(cfg) ? moneyK : num;
  if (!data.length) return <Empty icon="ChartNoAxesColumn" text="No data for this report." />;
  if (cfg.chart === 'list') return <div className="rb-number"><div className="rb-big">{num(sum(data, (d) => d.count))}</div><div className="small muted">records</div></div>;
  if (cfg.chart === 'funnel') return <><Funnel data={data} fmt={fmtOf(cfg)} cfg={cfg} />{cfg.group === 'stage' && <div className="small muted" style={{ marginTop: 6 }}>Each step counts everything that reached it, including what moved further on.</div>}</>;
  const name = measureName(cfg);
  const series = data.splits?.length ? data.splits.map((s) => ({ key: s, name: s })) : [{ key: 'Value', name: cfg.compare ? 'This period' : name }, ...(cfg.compare && data[0]?.Previous !== undefined ? [{ key: 'Previous', name: 'Previous period' }] : [])];
  if (cfg.chart === 'number') {
    const change = data.prevGrand ? ((data.grand - data.prevGrand) / data.prevGrand) * 100 : null;
    return <div className="rb-number"><div className="rb-big">{fmtOf(cfg)(data.grand)}</div><div className="small muted">{name}{change != null ? ` · ${change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}% on the previous period` : ''}</div>{Number(cfg.goal) > 0 && <div style={{ maxWidth: 320, margin: '12px auto 0' }}><Progress value={(data.grand / Number(cfg.goal)) * 100} /><div className="small muted" style={{ marginTop: 4 }}>{Math.round((data.grand / Number(cfg.goal)) * 100)}% of the goal of {fmtOf(cfg)(Number(cfg.goal))}</div></div>}</div>;
  }
  if (cfg.chart === 'donut') return <div style={{ maxWidth: 440, margin: '0 auto' }}><Donut data={data.slice(0, 8).map((d, i) => ({ name: d.label, value: d.Value, color: SERIES[i] }))} format={fmt} height={Math.min(height, 240)} centerLabel={name.toLowerCase()} /></div>;
  if (cfg.chart === 'line' || cfg.chart === 'area') return <Trend data={data} series={series} format={fmt} height={height} area={cfg.chart === 'area'} />;
  if (cfg.chart === 'hbar') return <Bars horizontal stacked={!!data.splits?.length} data={data.slice(0, 12)} series={series} format={fmt} height={Math.max(220, Math.min(data.length, 12) * 36)} />;
  return <Bars data={data} stacked={!!data.splits?.length} series={series} format={fmt} height={height} />;
}

// Each step as a bar, with how many carried on from the step before.
function Funnel({ data: raw, fmt, cfg }) {
  const drill = useContext(DrillCtx);
  // By stage, a deal further on has passed the earlier stages too, so each step counts everything at or after it.
  const staged = cfg?.group === 'stage' && !RATES[cfg.measure] && cfg.agg !== 'avg';
  const data = staged ? raw.filter((d) => d.label !== 'Lost').map((d, i, all) => ({ ...d, Value: all.slice(i).reduce((a, x) => a + x.Value, 0) })) : raw;
  const max = Math.max(...data.map((d) => d.Value), 1);
  return (
    <div className="rb-funnel">
      {data.map((d, i) => (
        <button key={d.sort} type="button" className="rb-funnel-row" onClick={() => drill?.(d.label)}>
          <span className="rb-funnel-label trunc">{d.label}</span>
          <span className="rb-funnel-bar"><i style={{ width: `${Math.max(2, (d.Value / max) * 100)}%` }} /></span>
          <span className="small num nowrap">{fmt(d.Value)}{i > 0 && data[i - 1].Value ? <span className="muted"> · {Math.round((d.Value / data[i - 1].Value) * 100)}% of the step before</span> : ''}</span>
        </button>
      ))}
    </div>
  );
}

const listFields = (src) => [...src.groups.filter(([k]) => !['month', 'quarter'].includes(k)), ...src.measures.filter(([k]) => !RATES[k])];
const nameOfRecord = (r) => r.name || r.title || r.number || r.subject || r.values?.name || r.to || [r.first, r.last].filter(Boolean).join(' ') || r.id;
function RecordList({ cfg }) {
  const { db, scope, userName, companyName } = useStore();
  const src = SOURCES[cfg.source];
  const rows = reportRecords(db, scope, userName, companyName, cfg);
  const all = listFields(src);
  const cols = (cfg.columns?.length ? cfg.columns : all.slice(0, 5).map(([k]) => k)).filter((k) => all.some(([x]) => x === k));
  return (
    <DataTable rows={rows} exportName={(cfg.name || 'report-records').toLowerCase().replace(/\W+/g, '-')} initialSort={{ k: 'date', dir: 'desc' }} columns={[
      { k: 'name', label: 'Record', value: nameOfRecord },
      { k: 'date', label: 'Date', nowrap: true, value: (r) => src.date(r) || '', render: (r) => (src.date(r) ? fmtDate(src.date(r)) : '—') },
      ...cols.map((k) => {
        const isM = src.measures.some(([x]) => x === k);
        return { k: `c_${k}`, label: all.find(([x]) => x === k)[1], align: isM ? 'r' : undefined, value: (r) => (isM ? amountOf(r, k) : groupOf(db, userName, companyName, cfg.source, k, r)), render: isM ? (r) => (['duration', 'score'].includes(k) ? num : money)(amountOf(r, k)) : undefined };
      }),
    ]} />
  );
}

// "Tell me when": checks your reports with an alert every few minutes while the CRM is open, and tells only you.
export function ReportAlertWatcher() {
  const { db, me, scope, userName, companyName, patchQuiet, pushNotification } = useStore();
  const latest = useRef(null);
  latest.current = { db, me, scope, userName, companyName, patchQuiet, pushNotification };
  const key = (db.reports || []).filter((r) => r.alert?.op && r.ownerId === me?.id).map((r) => `${r.id}${r.alert.op}${r.alert.value}`).join();
  useEffect(() => {
    if (!key) return undefined;
    const check = () => {
      const x = latest.current;
      const range = { from: iso(new Date(Date.now() - 30 * 864e5)), to: today() };
      (x.db.reports || []).filter((r) => r.alert?.op && r.ownerId === x.me.id && SOURCES[r.source] && r.alert.value !== '' && r.alert.value != null).forEach((r) => {
        const grand = runReport(x.db, x.scope, x.userName, x.companyName, { ...r, range, compare: false, split: '' }).grand;
        const limit = Number(r.alert.value);
        const hit = r.alert.op === 'above' ? grand > limit : grand < limit;
        if (hit && !r.alertOn) {
          x.patchQuiet('reports', r.id, { alertOn: true, alertAt: new Date().toISOString() });
          x.pushNotification(x.me.id, `Report "${r.name}" is ${r.alert.op} ${fmtOf(r)(limit)}: now ${fmtOf(r)(grand)} over the last 30 days.`, `/reports/custom?open=${r.id}`);
        } else if (!hit && r.alertOn) x.patchQuiet('reports', r.id, { alertOn: false });
      });
    };
    check();
    const id = setInterval(check, 5 * 6e4);
    return () => clearInterval(id);
  }, [key]);
  return null;
}

export function PinnedReports() {
  const { db, me, scope, userName, companyName, can } = useStore();
  const pinned = (db.reports || []).filter((r) => r.pinnedBy?.includes(me.id) && SOURCES[r.source] && can(SOURCES[r.source].module));
  if (!pinned.length || !can('reportBuilder')) return null;
  return (
    <div className="g2" style={{ marginBottom: 14, alignItems: 'start' }}>
      {pinned.map((r) => <Card key={r.id} title={r.name} action={<Link className="small" to={`/reports/custom?open=${r.id}`}>Open report</Link>}><ReportChart cfg={r} data={runReport(db, scope, userName, companyName, r)} /></Card>)}
    </div>
  );
}

const T = (name, about, source, group, measure, chart, extra = {}) => ({ name, about, source, group, measure, chart, agg: 'sum', split: '', filters: [], ...extra });
const TEMPLATES = [
  T('Sales by salesperson', 'Who won the most revenue', 'deals', 'owner', 'value', 'hbar', { filters: [{ field: 'status', op: 'is', value: 'won' }] }),
  T('Revenue by month', 'Revenue won over time', 'deals', 'month', 'value', 'area', { filters: [{ field: 'status', op: 'is', value: 'won' }] }),
  T('Pipeline by stage and salesperson', 'Who holds what, and where', 'deals', 'stage', 'value', 'bar', { split: 'owner', filters: [{ field: 'status', op: 'is', value: 'open' }] }),
  T('Why deals are lost', 'The most common reasons', 'deals', 'lostReason', 'count', 'hbar', { filters: [{ field: 'status', op: 'is', value: 'lost' }] }),
  T('Competitors we meet', 'Deals by competitor', 'deals', 'competitor', 'count', 'donut'),
  T('Lead sources', 'Where leads come from', 'leads', 'source', 'count', 'hbar'),
  T('Leads by month and status', 'New leads and how they progress', 'leads', 'month', 'count', 'bar', { split: 'status' }),
  T('Orders by channel', 'Where orders come from', 'orders', 'channel', 'total', 'donut'),
  T('Unpaid invoices by customer', 'Who owes the most', 'invoices', 'customer', 'unpaid', 'hbar'),
  T('Cash collected against invoiced', 'Invoices by month', 'invoices', 'month', 'paid', 'line'),
  T('Support cases by priority', 'Cases and their urgency', 'cases', 'priority', 'count', 'bar', { split: 'status' }),
  T('Calls by outcome and salesperson', 'Calling activity', 'calls', 'owner', 'count', 'hbar', { split: 'outcome' }),
  T('Win rate by salesperson', 'Share of closed deals that were won', 'deals', 'owner', 'winrate', 'hbar'),
  T('Sales funnel', 'Open deals at each stage', 'deals', 'stage', 'count', 'funnel', { filters: [{ field: 'status', op: 'is', value: 'open' }] }),
  T('Revenue by customer industry', 'Which industries buy most', 'deals', 'industry', 'value', 'donut', { filters: [{ field: 'status', op: 'is', value: 'won' }] }),
  T('Big open deals', 'Every open deal over 50,000', 'deals', 'stage', 'value', 'list', { filters: [{ field: 'status', op: 'is', value: 'open' }, { field: 'value', op: 'gt', value: 50000 }], columns: ['stage', 'owner', 'customer', 'value'] }),
  T('Lead conversion by source', 'Which sources turn into customers', 'leads', 'source', 'convrate', 'hbar'),
  T('Email open rate by template', 'Which emails get read', 'emails', 'templateId', 'openrate', 'hbar'),
  T('Web enquiries by source', 'Which links bring enquiries', 'formSubmissions', 'from', 'count', 'hbar'),
];

function ScheduleDialog({ report, onClose }) {
  const { db, saveReportSchedule, sendReportNow, toast } = useStore();
  const s = report.schedule || {};
  const [freq, setFreq] = useState(s.freq || 'weekly');
  const [to, setTo] = useState(s.to || [report.ownerId]);
  const people = db.users.filter((u) => u.active);
  return (
    <Modal title={`Schedule ${report.name}`} onClose={onClose} footer={<>{report.schedule && <Btn kind="danger" onClick={() => { saveReportSchedule(report.id, null); toast('Schedule removed'); onClose(); }}>Remove schedule</Btn>}<Btn onClick={() => { sendReportNow(report.id, to); toast('Report sent (simulated). See Email and your notifications.'); onClose(); }} disabled={!to.length}>Send now</Btn><Btn kind="primary" disabled={!to.length} onClick={() => { saveReportSchedule(report.id, { freq, to }); toast('Report scheduled'); onClose(); }}>Save schedule</Btn></>}>
      <div className="stack">
        <div className="field"><label className="label" htmlFor="sch-freq">How often</label><select id="sch-freq" className="select" value={freq} onChange={(e) => setFreq(e.target.value)}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Send to</div><div className="form-grid">{people.map((u) => <label key={u.id} className="check"><input type="checkbox" checked={to.includes(u.id)} onChange={() => setTo((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))} /><span className="trunc">{u.name}</span></label>)}</div></div>
        {s.next && <div className="small muted">Next due {fmtDT(s.next)}{s.last ? `, last sent ${fmtDT(s.last)}` : ''}.</div>}
        <div className="notice">Simulated. It runs while someone has the CRM open, adds an entry to Email and sends a notification. No real email leaves the CRM.</div>
      </div>
    </Modal>
  );
}

export default function ReportBuilder() {
  const { db, me, role, t, can, scope, userName, companyName, create, update, remove, toast, optionsOf } = useStore();
  const [params, setParams] = useSearchParams();
  const sources = Object.entries(SOURCES).filter(([, s]) => can(s.module));
  const blank = { name: '', source: sources[0]?.[0], group: SOURCES[sources[0]?.[0]]?.groups[0][0], split: '', measure: 'count', agg: 'sum', chart: 'bar', compare: false, filters: [], share: 'private', folder: '' };
  const [cfg, setCfg] = useState(blank);
  const [range, setRange] = useDateRange();
  const [error, setError] = useState('');
  const [del, setDel] = useState(null);
  const [gallery, setGallery] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [drill, setDrill] = useState(null);
  const [find, setFind] = useState('');
  useEffect(() => {
    const open = params.get('open');
    const r = open && (db.reports || []).find((x) => x.id === open);
    if (r) { setCfg({ ...blank, ...r }); setParams({}, { replace: true }); }
  }, [params]);
  if (!sources.length) return <div className="card"><Empty icon="ShieldAlert" text="You don't have access to any data to report on." /></div>;
  const src = SOURCES[cfg.source];
  const live = { ...cfg, range };
  const data = runReport(db, scope, userName, companyName, live);
  const canEdit = can('reportBuilder', 'edit');
  const mine = (r) => r.ownerId === me.id || role === 'admin';
  const teamOf = (id) => db.users.find((u) => u.id === id)?.teamId;
  // Older reports had no sharing setting, and everyone could see them.
  const visible = (r) => SOURCES[r.source] && can(SOURCES[r.source].module) && (r.ownerId === me.id || role === 'admin' || (r.share || 'all') === 'all' || (r.share === 'team' && teamOf(r.ownerId) === me.teamId));
  const saved = (db.reports || []).filter(visible).filter((r) => r.name.toLowerCase().includes(find.toLowerCase()));
  const folders = [...new Set(saved.map((r) => r.folder || ''))].sort();
  const current = cfg.id && (db.reports || []).find((r) => r.id === cfg.id);
  const change = (k, x) => {
    setError('');
    setCfg((p) => (k === 'source' ? { ...p, source: x, group: SOURCES[x].groups[0][0], split: '', measure: 'count', filters: [] } : { ...p, [k]: x }));
  };
  const fields = [
    { k: 'source', label: 'Report on', type: 'select', noBlank: true, full: true, options: sources.map(([value, s]) => ({ value, label: s.label })) },
    { k: 'measure', label: 'Measure', type: 'select', noBlank: true, full: true, options: [{ value: 'count', label: 'Number of records' }, ...src.measures.map(([value, label]) => ({ value, label }))] },
    { k: 'agg', label: 'Calculate', type: 'select', noBlank: true, hide: cfg.measure === 'count' || !!RATES[cfg.measure], options: [{ value: 'sum', label: 'Total' }, { value: 'avg', label: 'Average' }] },
    { k: 'group', label: 'Group by', type: 'select', noBlank: true, options: src.groups.map(([value, label]) => ({ value, label })) },
    { k: 'split', label: 'Split by', type: 'select', noBlank: true, options: [{ value: '', label: 'Nothing' }, ...src.groups.filter(([k]) => k !== cfg.group).map(([value, label]) => ({ value, label }))] },
    { k: 'chart', label: 'Show as', type: 'select', noBlank: true, full: true, options: [['bar', 'Columns'], ['hbar', 'Bars'], ['line', 'Line'], ['area', 'Area'], ['donut', 'Donut'], ['funnel', 'Funnel'], ['number', 'Single number'], ['table', 'Table only'], ['list', 'List of records']].map(([value, label]) => ({ value, label })) },
    { k: 'extra', label: 'Extra column', type: 'select', noBlank: true, hide: ['number', 'list'].includes(cfg.chart), options: [{ value: '', label: 'None' }, { value: 'share', label: 'Share of total' }, { value: 'running', label: 'Running total' }] },
    { k: 'goal', label: 'Goal', type: 'number', min: 0, hide: cfg.chart === 'list', hint: 'Rows that reach it are marked' },
  ];
  const valuesFor = (field) => [...new Set(scope(db[cfg.source], src.module).map((r) => groupOf(db, userName, companyName, cfg.source, field, r)))].sort();
  const setFilter = (i, patch) => setCfg((p) => ({ ...p, filters: p.filters.map((f, n) => (n === i ? { ...f, ...patch } : f)) }));
  const save = () => {
    const name = cfg.name.trim();
    if (!name) { setError('Give this report a name.'); return; }
    const { id, createdAt, schedule, pinnedBy, ownerId, alertOn, alertAt, ...rest } = cfg;
    if (cfg.alert?.op && (cfg.alert.value === '' || cfg.alert.value == null)) { setError('Add the amount for the alert, or turn it off.'); return; }
    if (id && current && mine(current)) { update('reports', id, { ...rest, name, alertOn: false }); toast('Report saved'); return; }
    const rec = create('reports', { ...rest, name, pinnedBy: [], ownerId: me.id });
    setCfg({ ...cfg, id: rec.id, name, ownerId: me.id });
    toast('Report saved');
  };
  const useTemplate = (x) => { const { about, ...rest } = x; setCfg({ ...blank, ...rest, name: x.name }); setGallery(false); };
  const allowedTemplates = TEMPLATES.filter((x) => can(SOURCES[x.source].module));
  const fmt = fmtOf(live);
  const showDrill = (label) => {
    const row = data.find((d) => d.label === label);
    if (!row) return;
    setDrill({ title: `${cfg.name || src.label}: ${label}`, kind: src.kind, rows: reportRecords(db, scope, userName, companyName, live).filter((r) => groupOf(db, userName, companyName, cfg.source, cfg.group, r) === row.sort) });
  };
  const csv = () => downloadCsv((cfg.name || 'report').toLowerCase().replace(/\W+/g, '-'), [[src.groups.find(([k]) => k === cfg.group)?.[1] || 'Group', 'Records', measureName(cfg), ...(cfg.compare ? ['Previous period'] : []), ...(data.splits || [])], ...data.map((d) => [d.label, d.count, d.Value, ...(cfg.compare ? [d.Previous ?? 0] : []), ...(data.splits || []).map((s) => d[s] ?? 0)])]);
  return (
    <div className="print-area">
      <PageHead title={t('reportBuilder')} sub="Build your own report from your CRM data. It only uses records you're allowed to see.">
        <DateRange value={range} onChange={setRange} allowAll />
        <Btn icon="LayoutTemplate" onClick={() => setGallery(true)}>Templates</Btn>
      </PageHead>
      <div className="g-12 rb-layout" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title={cfg.id ? 'Edit report' : 'New report'}>
            <div className="stack">
              <FormFields fields={fields} values={cfg} onChange={change} />
              {cfg.chart === 'list' && <fieldset className="plain-fieldset"><legend className="label" style={{ marginBottom: 6 }}>Columns</legend><div className="row wrap">{listFields(src).map(([k, l]) => { const on = (cfg.columns?.length ? cfg.columns : listFields(src).slice(0, 5).map(([x]) => x)).includes(k); return <label key={k} className="check"><input type="checkbox" checked={on} onChange={() => { const curCols = cfg.columns?.length ? cfg.columns : listFields(src).slice(0, 5).map(([x]) => x); change('columns', on ? curCols.filter((x) => x !== k) : [...curCols, k]); }} />{l}</label>; })}</div></fieldset>}
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Filters</div>
                {(cfg.filters || []).map((f, i) => (
                  <div key={i} className="rb-filter">
                    <select className="select" aria-label={`Filter ${i + 1} field`} value={f.field} onChange={(e) => setFilter(i, { field: e.target.value, value: '', op: src.measures.some(([k]) => k === e.target.value) ? 'gt' : 'is' })}>{src.groups.map(([k, l]) => <option key={k} value={k}>{l}</option>)}{src.measures.filter(([k]) => !RATES[k]).map(([k, l]) => <option key={k} value={k}>{l} (number)</option>)}</select>
                    {src.measures.some(([k]) => k === f.field) ? <>
                      <select className="select" aria-label={`Filter ${i + 1} condition`} value={f.op || 'gt'} onChange={(e) => setFilter(i, { op: e.target.value })}><option value="gt">more than</option><option value="lt">less than</option></select>
                      <input className="input" type="number" aria-label={`Filter ${i + 1} amount`} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} />
                    </> : <>
                      <select className="select" aria-label={`Filter ${i + 1} condition`} value={f.op || 'is'} onChange={(e) => setFilter(i, { op: e.target.value })}><option value="is">is</option><option value="not">is not</option></select>
                      <select className="select" aria-label={`Filter ${i + 1} value`} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })}><option value="">Any</option>{valuesFor(f.field).map((v) => <option key={v} value={v}>{showLabel(f.field, v)}</option>)}</select>
                    </>}
                    <Btn sm kind="ghost" icon="X" aria-label={`Remove filter ${i + 1}`} onClick={() => setCfg((p) => ({ ...p, filters: p.filters.filter((_, n) => n !== i) }))} />
                  </div>
                ))}
                <Btn sm icon="Plus" onClick={() => setCfg((p) => ({ ...p, filters: [...(p.filters || []), { field: src.groups[0][0], op: 'is', value: '' }] }))}>Add a filter</Btn>
              </div>
              <label className="check"><input type="checkbox" checked={!!cfg.compare} disabled={!range.from || !!cfg.split} onChange={(e) => change('compare', e.target.checked)} />Compare with the previous period{!range.from && <span className="small muted"> (pick dates first)</span>}</label>
              {canEdit && (
                <>
                  <div className="field"><label className="label" htmlFor="report-name">Report name</label><input id="report-name" className={`input ${error ? 'err' : ''}`} value={cfg.name} onChange={(e) => { setCfg((p) => ({ ...p, name: e.target.value })); setError(''); }} />{error && <span className="error-text">{error}</span>}</div>
                  <div className="field"><label className="label">Folder</label><ListField f={{ k: 'folder', label: 'Folder', ariaLabel: 'Folder', type: 'select', list: 'reportFolder', blankLabel: 'No folder' }} value={cfg.folder || ''} onChange={(_, x) => change('folder', x)} /></div>
                  <div className="field"><label className="label" htmlFor="report-share">Who can see it</label><select id="report-share" className="select" value={cfg.share || 'private'} onChange={(e) => change('share', e.target.value)}><option value="private">Only me</option><option value="team">My team</option><option value="all">Everyone</option></select><span className="hint">Each person only sees the records they're allowed to.</span></div>
                  <div className="field"><label className="label" htmlFor="rb-alert">Tell me when the last 30 days total is</label><div className="row"><select id="rb-alert" className="select" value={cfg.alert?.op || ''} onChange={(e) => change('alert', e.target.value ? { op: e.target.value, value: cfg.alert?.value ?? '' } : null)}><option value="">Don't tell me</option><option value="above">Above</option><option value="below">Below</option></select>{cfg.alert?.op && <input className="input" type="number" aria-label="Alert amount" value={cfg.alert.value} onChange={(e) => change('alert', { ...cfg.alert, value: e.target.value })} />}</div><span className="hint">Checked every few minutes while you have the CRM open. Only you are told.</span></div>
                  <div className="row wrap"><Btn kind="primary" onClick={save}>Save</Btn>{cfg.id && <Btn onClick={() => setCfg(blank)}>New report</Btn>}</div>
                </>
              )}
            </div>
          </Card>
          <Card title="Saved reports" sub={`${saved.length} ${saved.length === 1 ? 'report' : 'reports'}`}>
            <div className="stack-s">
              <input className="input" aria-label="Search saved reports" placeholder="Search reports…" value={find} onChange={(e) => setFind(e.target.value)} />
              {!saved.length && <div className="sub">Nothing here yet. Start from a template.</div>}
              {folders.map((folder) => (
                <div key={folder || 'none'}>
                  {folders.length > 1 && <div className="filter-title"><Icon name="Folder" size={13} />{folder || 'No folder'}</div>}
                  {saved.filter((r) => (r.folder || '') === folder).map((r) => {
                    const pinned = r.pinnedBy?.includes(me.id);
                    return (
                      <div key={r.id} className={`dashlet rb-saved ${cfg.id === r.id ? 'on' : ''}`}>
                        <button type="button" className="link-btn grow trunc" style={{ textAlign: 'start' }} onClick={() => setCfg(mine(r) ? { ...blank, ...r } : { ...blank, ...r, id: undefined, name: `${r.name} (copy)` })}>{r.name}</button>
                        {r.schedule && <span title={`Sent ${r.schedule.freq}`}><Icon name="Clock" size={13} color="var(--ink-3)" /></span>}
                        {r.share === 'private' || r.share === 'team' ? <Badge tone="muted" dot={false}>{r.share === 'team' ? 'Team' : 'Me'}</Badge> : null}
                        <Btn sm kind="ghost" icon={pinned ? 'PinOff' : 'Pin'} title={pinned ? 'Remove from home screen' : 'Add to home screen'} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${r.name}`} onClick={() => { update('reports', r.id, { pinnedBy: pinned ? r.pinnedBy.filter((u) => u !== me.id) : [...(r.pinnedBy || []), me.id] }); toast(pinned ? 'Removed from your home screen' : 'Added to your home screen'); }} />
                        {canEdit && mine(r) && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${r.name}`} onClick={() => setDel(r)} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack rb-result">
          <Card title={cfg.name || 'Preview'} sub={`${measureName(cfg)} by ${src.groups.find(([k]) => k === cfg.group)?.[1].toLowerCase()}${cfg.split ? ` and ${src.groups.find(([k]) => k === cfg.split)?.[1].toLowerCase()}` : ''} · Generated ${fmtDT(new Date().toISOString())}`} action={<span className="row wrap no-print">{current && mine(current) && <Btn sm icon="Clock" onClick={() => setScheduling(true)}>{current.schedule ? 'Scheduled' : 'Schedule'}</Btn>}<Btn sm icon="Printer" onClick={printPage}>Print or PDF</Btn><Btn sm icon="Download" onClick={csv}>Export</Btn></span>}>
            {cfg.chart === 'list' ? <RecordList cfg={live} /> : cfg.chart !== 'table' && <DrillCtx.Provider value={showDrill}><ReportChart cfg={live} data={data} /></DrillCtx.Provider>}
            {cfg.chart === 'table' && !data.length && <Empty icon="ChartNoAxesColumn" text="No data for this report." />}
          </Card>
          {data.length > 0 && !['number', 'list'].includes(cfg.chart) && (
            <Card title="Breakdown" sub="Click a row to see its records" pad={false}>
              <div className="tb-wrap"><table className="table rb-table">
                <thead><tr><th>{src.groups.find(([k]) => k === cfg.group)?.[1]}</th><th className="r">Records</th>{(data.splits || []).map((s) => <th key={s} className="r">{s}</th>)}<th className="r">{cfg.compare ? 'This period' : measureName(cfg)}</th>{cfg.extra === 'share' && <th className="r">Share</th>}{cfg.extra === 'running' && <th className="r">Running total</th>}{cfg.compare && <th className="r">Previous</th>}{cfg.compare && <th className="r">Change</th>}</tr></thead>
                <tbody>
                  {data.map((d, i) => <tr key={d.sort} className={Number(cfg.goal) > 0 ? (d.Value >= Number(cfg.goal) ? 'rb-hit' : 'rb-miss') : undefined} tabIndex={0} onClick={() => showDrill(d.label)} onKeyDown={(e) => { if (e.key === 'Enter') showDrill(d.label); }}><td className="strong">{d.label}</td><td className="r num">{num(d.count)}</td>{(data.splits || []).map((s) => <td key={s} className="r num">{fmt(d[s] || 0)}</td>)}<td className="r num strong">{fmt(d.Value)}{Number(cfg.goal) > 0 && d.Value >= Number(cfg.goal) && <Icon name="Check" size={13} aria-label="Reached the goal" style={{ marginInlineStart: 4 }} />}</td>{cfg.extra === 'share' && <td className="r num">{!RATES[cfg.measure] && cfg.agg !== 'avg' && sum(data, (x) => x.Value) ? `${Math.round((d.Value / sum(data, (x) => x.Value)) * 100)}%` : '—'}</td>}{cfg.extra === 'running' && <td className="r num">{RATES[cfg.measure] || cfg.agg === 'avg' ? '—' : fmt(sum(data.slice(0, i + 1), (x) => x.Value))}</td>}{cfg.compare && <td className="r num">{fmt(d.Previous || 0)}</td>}{cfg.compare && <td className="r num">{d.Previous ? `${d.Value >= d.Previous ? '+' : ''}${Math.round(((d.Value - d.Previous) / d.Previous) * 100)}%` : '—'}</td>}</tr>)}
                  <tr className="rb-total"><td>Total</td><td className="r num">{num(sum(data, (d) => d.count))}</td>{(data.splits || []).map((s) => <td key={s} className="r num">{cfg.agg === 'avg' || RATES[cfg.measure] ? '' : fmt(sum(data, (d) => d[s] || 0))}</td>)}<td className="r num">{fmt(data.grand)}</td>{cfg.extra && <td />}{cfg.compare && <td className="r num">{fmt(data.prevGrand || 0)}</td>}{cfg.compare && <td />}</tr>
                </tbody>
              </table></div>
            </Card>
          )}
        </div>
      </div>
      {gallery && <Modal size="lg" title="Start from a template" onClose={() => setGallery(false)}><div className="rb-gallery">{allowedTemplates.map((x) => <button key={x.name} type="button" className="rb-template" onClick={() => useTemplate(x)}><Icon name={{ bar: 'ChartColumn', hbar: 'ChartBar', line: 'ChartLine', area: 'ChartArea', donut: 'ChartPie' }[x.chart]} size={18} /><span className="grow" style={{ minWidth: 0 }}><span className="strong" style={{ display: 'block' }}>{x.name}</span><span className="small muted">{x.about}</span></span></button>)}</div></Modal>}
      {scheduling && current && <ScheduleDialog report={current} onClose={() => setScheduling(false)} />}
      {drill && <RecordsDrawer {...drill} onClose={() => setDrill(null)} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="It's removed for everyone who can see it." onClose={() => setDel(null)} onConfirm={() => { remove('reports', del.id); if (cfg.id === del.id) setCfg(blank); toast('Report deleted'); }} />}
    </div>
  );
}
