import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { STAGES } from '../seed';
import { Badge, Btn, Card, Kpi, PageHead, Pills, Stars } from '../ui';
import { Bars, Donut, SERIES, Trend } from '../charts';
import { downloadCsv, fmtShort, groupBy, lastMonths, money, moneyK, monthKey, monthLabel, nextMonths, num, pct, sum } from '../util';

const stageName = (id) => STAGES.find((s) => s.id === id)?.name;

export function Forecast() {
  const { db, me, sec, scopeOf, t, scope, companyName, userName } = useStore();
  const open = useMemo(() => scope(db.deals, 'forecast').filter((d) => d.status === 'open'), [db.deals, me.id]);
  const months = nextMonths(5);
  const data = months.map((m) => {
    const list = open.filter((d) => monthKey(d.closeDate) === m);
    return { k: m, label: monthLabel(m), list, Expected: sum(list, (d) => d.value), Weighted: Math.round(sum(list, (d) => (d.value * d.probability) / 100)) };
  });
  const overdue = open.filter((d) => monthKey(d.closeDate) < months[0]);
  return (
    <div>
      <PageHead title={t('forecast')} sub="Open opportunities by expected closing month" />
      {sec('forecast', 'kpis') && <div className="g3" style={{ marginBottom: 14 }}>
        <Kpi label="Expected, next 5 months" value={moneyK(sum(data, (d) => d.Expected))} icon="TrendingUp" />
        <Kpi label="Weighted forecast" value={moneyK(sum(data, (d) => d.Weighted))} note="Expected revenue × probability" icon="Scale" />
        <Kpi label="Past expected closing" value={num(overdue.length)} note="Open deals that need a new date" icon="CalendarX" />
      </div>}
      {sec('forecast', 'chart') && <Card title="Expected vs weighted revenue" className="" ><Bars height={260} data={data} series={[{ key: 'Expected', name: 'Expected revenue' }, { key: 'Weighted', name: 'Weighted revenue' }]} /></Card>}
      {sec('forecast', 'board') && <div className="kanban" style={{ marginTop: 14 }}>
        {data.map((col) => (
          <div key={col.k} className="kb-col">
            <div className="kb-head"><span>{col.label}</span><span className="muted small num">{col.list.length}</span><span className="grow" /><span className="num">{moneyK(col.Expected)}</span></div>
            {col.list.sort((a, b) => b.value - a.value).map((d) => (
              <Link key={d.id} to={`/pipeline/${d.id}`} className="kb-card" style={{ cursor: 'pointer' }}>
                <div className="strong" style={{ lineHeight: 1.25 }}>{d.title}</div>
                <div className="small muted trunc">{companyName(d.companyId)}{scopeOf('forecast') !== 'own' ? ` · ${userName(d.ownerId)}` : ''}</div>
                <div className="row between"><span className="num strong">{money(d.value)}</span><Badge>{stageName(d.stage)}</Badge></div>
              </Link>
            ))}
            {!col.list.length && <div className="small muted" style={{ textAlign: 'center', padding: 18 }}>Nothing expected.</div>}
          </div>
        ))}
      </div>}
    </div>
  );
}

const GROUPS = {
  stage: ['Stage', (d) => (d.status === 'lost' ? 'Lost' : stageName(d.stage))],
  owner: ['Salesperson', null],
  team: ['Sales team', null],
  source: ['Source', (d) => d.source || 'Unknown'],
  lost: ['Lost reason', (d) => d.lostReason || 'Not lost'],
  month: ['Closing month', (d) => monthKey(d.closeDate)],
};
const MEASURES = { value: ['Expected revenue', moneyK, (l) => sum(l, (d) => d.value)], weighted: ['Weighted revenue', moneyK, (l) => Math.round(sum(l, (d) => (d.value * d.probability) / 100))], count: ['Count', num, (l) => l.length] };

export function PipelineAnalysis() {
  const { db, me, can, sec, scopeOf, t, scope, userName } = useStore();
  const [group, setGroup] = useState('stage');
  const [measure, setMeasure] = useState('value');
  const [chart, setChart] = useState('bar');
  const [status, setStatus] = useState('all');
  const base = useMemo(() => scope(db.deals, 'analysis'), [db.deals, me.id]);
  const deals = status === 'all' ? base : base.filter((d) => d.status === status);
  const keyFn = group === 'owner' ? (d) => userName(d.ownerId)
    : group === 'team' ? (d) => db.teams.find((t) => t.id === db.users.find((u) => u.id === d.ownerId)?.teamId)?.name || 'No team'
      : GROUPS[group][1];
  const [mLabel, fmt, calc] = MEASURES[measure];
  const raw = Object.entries(groupBy(deals, keyFn)).map(([k, list]) => ({ key: k, list }));
  const order = group === 'stage' ? [...STAGES.map((s) => s.name), 'Lost'] : null;
  const sorted = order ? raw.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : group === 'month' ? raw.sort((a, b) => a.key.localeCompare(b.key)) : raw.sort((a, b) => calc(b.list) - calc(a.list));
  const rows = sorted.map((r) => ({ label: group === 'month' ? monthLabel(r.key) : r.key, Measure: calc(r.list), count: r.list.length, value: sum(r.list, (d) => d.value), weighted: Math.round(sum(r.list, (d) => (d.value * d.probability) / 100)), won: r.list.filter((d) => d.status === 'won').length, lost: r.list.filter((d) => d.status === 'lost').length }));
  const donutRows = rows.slice(0, 7);
  const rest = rows.slice(7);
  const donut = [...donutRows.map((r, i) => ({ name: r.label, value: r.Measure, color: SERIES[i] })), ...(rest.length ? [{ name: 'Other', value: sum(rest, (r) => r.Measure), color: SERIES[7] }] : [])];
  const closed = base.filter((d) => d.status !== 'open');
  return (
    <div>
      <PageHead title={t('analysis')} >
        {can('data', 'export') && <Btn icon="Download" onClick={() => downloadCsv('pipeline-analysis', [[GROUPS[group][0], 'Count', 'Expected', 'Weighted', 'Won', 'Lost'], ...rows.map((r) => [r.label, r.count, r.value, r.weighted, r.won, r.lost])])}>Export</Btn>}
      </PageHead>
      {sec('analysis', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Opportunities" value={num(base.length)} icon="Handshake" />
        <Kpi label="Won value" value={moneyK(sum(base.filter((d) => d.status === 'won'), (d) => d.value))} icon="Trophy" />
        <Kpi label="Lost value" value={moneyK(sum(base.filter((d) => d.status === 'lost'), (d) => d.value))} icon="ThumbsDown" />
        <Kpi label="Win rate" value={pct(closed.length ? (base.filter((d) => d.status === 'won').length / closed.length) * 100 : 0)} icon="Target" />
      </div>}
      {sec('analysis', 'chart') && <div className="card" style={{ marginBottom: 14 }}>
        <div className="tb-toolbar">
          <label className="row small"><span className="muted">Measure</span><select className="select tb-filter" value={measure} onChange={(e) => setMeasure(e.target.value)}>{Object.entries(MEASURES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="row small"><span className="muted">Group by</span><select className="select tb-filter" value={group} onChange={(e) => setGroup(e.target.value)}>{Object.entries(GROUPS).filter(([k]) => k !== 'team' || scopeOf('analysis') === 'all').map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <Pills value={status} onChange={setStatus} options={[{ k: 'all', label: 'All' }, { k: 'open', label: 'Open' }, { k: 'won', label: 'Won' }, { k: 'lost', label: 'Lost' }]} />
          <div className="grow" />
          <Pills value={chart} onChange={setChart} options={[{ k: 'bar', icon: 'ChartColumn', label: 'Bar', title: 'Bar chart' }, { k: 'line', icon: 'ChartLine', label: 'Line', title: 'Line chart' }, { k: 'pie', icon: 'ChartPie', label: 'Donut', title: 'Donut chart' }]} />
        </div>
        <div style={{ padding: '4px 16px 16px' }}>
          {chart === 'bar' && <Bars height={320} format={fmt} data={rows} series={[{ key: 'Measure', name: mLabel }]} />}
          {chart === 'line' && <Trend height={320} format={fmt} data={rows} series={[{ key: 'Measure', name: mLabel }]} />}
          {chart === 'pie' && <div style={{ maxWidth: 420, margin: '0 auto' }}><Donut data={donut} format={fmt} height={240} centerLabel={mLabel.toLowerCase()} /></div>}
        </div>
      </div>}
      {sec('analysis', 'pivot') && <Card title="Pivot table" pad={false}>
        <div className="tb-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>{GROUPS[group][0]}</th><th className="r">Count</th><th className="r">Expected revenue</th><th className="r">Weighted revenue</th><th className="r">Won</th><th className="r">Lost</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.label}><td className="strong">{r.label}</td><td className="r num">{r.count}</td><td className="r num">{money(r.value)}</td><td className="r num">{money(r.weighted)}</td><td className="r num">{r.won}</td><td className="r num">{r.lost}</td></tr>)}
              <tr><td className="strong">Total</td><td className="r num strong">{sum(rows, (r) => r.count)}</td><td className="r num strong">{money(sum(rows, (r) => r.value))}</td><td className="r num strong">{money(sum(rows, (r) => r.weighted))}</td><td className="r num strong">{sum(rows, (r) => r.won)}</td><td className="r num strong">{sum(rows, (r) => r.lost)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>}
    </div>
  );
}

export function LeadsAnalysis() {
  const { db, me, can, sec, scopeOf, t, scope, userName } = useStore();
  const leads = useMemo(() => scope(db.leads, 'leadsReport'), [db.leads, me.id]);
  const [group, setGroup] = useState('source');
  const key = { source: (l) => l.source, status: (l) => l.status, owner: (l) => userName(l.ownerId), country: (l) => l.country || 'Unknown' }[group];
  const rows = Object.entries(groupBy(leads, key)).map(([label, list]) => ({
    label, Leads: list.length, converted: list.filter((l) => l.status === 'Converted').length, score: Math.round(sum(list, (l) => l.score) / list.length), expected: sum(list, (l) => l.expected),
  })).sort((a, b) => b.Leads - a.Leads);
  const months = lastMonths(12);
  const conv = leads.filter((l) => l.status === 'Converted').length;
  return (
    <div>
      <PageHead title={t('leadsReport')} />
      {sec('leadsReport', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Leads" value={num(leads.length)} icon="Magnet" />
        <Kpi label="Converted" value={num(conv)} icon="Repeat" />
        <Kpi label="Conversion rate" value={pct(leads.length ? (conv / leads.length) * 100 : 0)} icon="Percent" />
        <Kpi label="Expected revenue" value={moneyK(sum(leads, (l) => l.expected))} icon="CircleDollarSign" />
      </div>}
      <div className="g2" style={{ marginBottom: 14 }}>
        {sec('leadsReport', 'trend') && <Card title="Leads created" sub="Last 12 months"><Trend area format={num} height={260} data={months.map((m) => ({ label: monthLabel(m), Leads: leads.filter((l) => monthKey(l.createdAt) === m).length }))} series={[{ key: 'Leads', name: 'Leads' }]} /></Card>}
        {sec('leadsReport', 'breakdown') && <Card title="Breakdown" action={<select className="select tb-filter" aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value)}><option value="source">By source</option><option value="status">By status</option><option value="owner">By salesperson</option><option value="country">By country</option></select>}>
          <Bars horizontal format={num} height={260} data={rows.slice(0, 8)} series={[{ key: 'Leads', name: 'Leads' }]} />
        </Card>}
      </div>
      {sec('leadsReport', 'detail') && <Card title="Detail" pad={false}>
        <div className="tb-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>Group</th><th className="r">Leads</th><th className="r">Converted</th><th className="r">Conversion</th><th className="r">Avg. score</th><th className="r">Expected</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label}><td className="strong">{r.label}</td><td className="r num">{r.Leads}</td><td className="r num">{r.converted}</td><td className="r num">{pct((r.converted / r.Leads) * 100)}</td><td className="r num">{r.score}</td><td className="r num">{money(r.expected)}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>}
    </div>
  );
}
