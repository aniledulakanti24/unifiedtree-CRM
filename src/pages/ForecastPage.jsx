import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, DataTable, Empty, Kpi, Modal, NoSections, PageHead, Progress, Tabs, firstAllowed } from '../ui';
import { Bars } from '../charts';
import { CATEGORIES, CATEGORY_TONE, addRows, categoryOf, changesSince, forecastRow, inPeriod, latestCall, pastQuarters, periodOptions, snapshotOf } from '../forecast';
import { MonthlyForecast } from './Reports';
import { fmtDT, fmtShort, money, moneyK, num, pct, today } from '../util';

function CallDialog({ row, period, adjusting, onClose }) {
  const { db, me, create, toast, pushNotification, userName } = useStore();
  const [amount, setAmount] = useState(Math.round(row.call?.amount ?? row.won + row.commit));
  const [note, setNote] = useState(adjusting ? '' : row.call?.note || '');
  const [error, setError] = useState('');
  const save = () => {
    if (!(Number(amount) >= 0) || amount === '') { setError('Enter an amount.'); return; }
    if (adjusting && !note.trim()) { setError('Say why you are changing their number.'); return; }
    create('forecastCalls', { name: `${period.label} forecast`, period: period.key, ownerId: row.id, by: me.id, amount: Number(amount), note: note.trim(), kind: adjusting ? 'adjust' : 'call' });
    if (adjusting) pushNotification(row.id, `${me.name} changed your ${period.label} forecast to ${money(Number(amount))}: ${note.trim()}`, '/reports/forecast');
    else {
      const managerId = db.teams.find((t) => t.id === me.teamId)?.managerId;
      if (managerId && managerId !== me.id) pushNotification(managerId, `${me.name} submitted a ${period.label} forecast of ${money(Number(amount))}`, '/reports/forecast');
    }
    toast(adjusting ? `${userName(row.id)}'s forecast changed` : 'Forecast submitted');
    onClose();
  };
  return (
    <Modal size="sm" title={adjusting ? `Change ${row.name}'s forecast` : `Submit my ${period.label} forecast`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>{adjusting ? 'Save change' : 'Submit'}</Btn></>}>
      <div className="stack">
        <div className="small muted">Won {money(row.won)}, committed {money(row.commit)}, best case {money(row.best)}, quota {money(row.quota)}.</div>
        <div className="field"><label className="label" htmlFor="fc-amount">Your number</label><input id="fc-amount" className="input" type="number" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></div>
        <div className="field"><label className="label" htmlFor="fc-note">{adjusting ? 'Why are you changing it?' : 'Note'}</label><textarea id="fc-note" className="textarea" value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} /></div>
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

function QuotaDialog({ row, period, onClose }) {
  const { db, patchDb, toast } = useStore();
  const [v, setV] = useState(row.quota);
  return (
    <Modal size="sm" title={`Quota for ${row.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={() => { patchDb({ quotas: { ...db.quotas, [period.key]: { ...db.quotas?.[period.key], [row.id]: Math.max(0, Number(v) || 0) } } }, 'Quota', `${row.name}, ${period.label}`); toast('Quota saved'); onClose(); }}>Save</Btn></>}>
      <div className="field"><label className="label" htmlFor="fc-quota">{period.label}</label><input id="fc-quota" className="input" type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} /><span className="hint">By default this is their yearly target, divided up.</span></div>
    </Modal>
  );
}

function TeamForecast({ rows, period, deals, onPerson }) {
  const { db, me, role, can, scopeOf } = useStore();
  const [call, setCall] = useState(null);
  const [quota, setQuota] = useState(null);
  const total = addRows(rows);
  const managerView = scopeOf('forecast') !== 'own';
  const mine = rows.find((r) => r.id === me.id);
  const canAdjust = role !== 'sales';
  const teams = [...new Set(rows.map((r) => r.user.teamId || 'none'))];
  const teamRows = managerView && teams.length > 1 ? teams.map((t) => { const list = rows.filter((r) => (r.user.teamId || 'none') === t); return { id: t, name: db.teams.find((x) => x.id === t)?.name || 'No team', ...addRows(list), people: list.length }; }) : [];
  return (
    <div className="stack">
      <div className="g4">
        <Kpi label="Won so far" value={moneyK(total.won)} note={`${pct(total.quota ? (total.won / total.quota) * 100 : 0)} of ${moneyK(total.quota)} quota`} icon="Trophy" />
        <Kpi label="Committed" value={moneyK(total.commit)} note="Very likely to close" icon="Target" />
        <Kpi label="Best case" value={moneyK(total.best)} note="Could close" icon="TrendingUp" />
        <Kpi label={managerView ? 'Team number' : 'My number'} value={moneyK(total.call)} note={total.call >= total.quota ? 'Reaches the quota' : `${moneyK(total.quota - total.call)} short of quota`} icon="Flag" />
      </div>
      <Card title="Progress to quota" sub="Won, then committed, then best case.">
        <div className="fc-bar" role="img" aria-label={`Won ${money(total.won)}, committed ${money(total.commit)}, best case ${money(total.best)}, against a quota of ${money(total.quota)}`}>
          {[['won', total.won], ['commit', total.commit], ['best', total.best]].map(([k, n]) => <span key={k} className={k} style={{ width: `${Math.min(100, (n / Math.max(total.quota, total.won + total.commit + total.best, 1)) * 100)}%` }} />)}
          {total.quota > 0 && <i style={{ insetInlineStart: `${Math.min(100, (total.quota / Math.max(total.quota, total.won + total.commit + total.best, 1)) * 100)}%` }} />}
        </div>
        <div className="row wrap small" style={{ marginTop: 8, gap: 14 }}><span><b className="fc-dot won" /> Won</span><span><b className="fc-dot commit" /> Committed</span><span><b className="fc-dot best" /> Best case</span><span className="muted">The line marks the quota</span></div>
      </Card>
      {mine && <div className="row between wrap card card-b"><span>{mine.call ? <>You submitted <strong>{money(mine.call.amount)}</strong> on {fmtDT(mine.call.createdAt)}{mine.call.kind === 'adjust' ? ' (changed by your manager)' : ''}.</> : <>You haven't submitted a number for {period.label} yet.</>}</span><Btn kind="primary" icon="Send" onClick={() => setCall({ row: mine })}>{mine.call ? 'Update my forecast' : 'Submit my forecast'}</Btn></div>}
      {teamRows.length > 0 && <DataTable key="teams" rows={teamRows} exportName="forecast-teams" noSearch columns={[
        { k: 'name', label: 'Team', render: (r) => <span className="strong">{r.name}</span> },
        { k: 'people', label: 'People', align: 'r' },
        { k: 'quota', label: 'Quota', align: 'r', render: (r) => moneyK(r.quota) },
        { k: 'won', label: 'Won', align: 'r', render: (r) => moneyK(r.won) },
        { k: 'commit', label: 'Committed', align: 'r', render: (r) => moneyK(r.commit) },
        { k: 'best', label: 'Best case', align: 'r', render: (r) => moneyK(r.best) },
        { k: 'call', label: 'Team number', align: 'r', render: (r) => <span className="strong">{moneyK(r.call)}</span> },
      ]} />}
      <DataTable key="people" rows={rows} exportName="forecast-people" noSearch initialSort={{ k: 'quota', dir: 'desc' }} onRow={(r) => onPerson(r.id)}
        columns={[
          { k: 'name', label: 'Person', render: (r) => <span className="strong">{r.name}</span> },
          { k: 'quota', label: 'Quota', align: 'r', render: (r) => money(r.quota) },
          { k: 'won', label: 'Won', align: 'r', render: (r) => money(r.won) },
          { k: 'commit', label: 'Committed', align: 'r', render: (r) => money(r.commit) },
          { k: 'best', label: 'Best case', align: 'r', render: (r) => money(r.best) },
          { k: 'pipeline', label: 'Pipeline', align: 'r', render: (r) => money(r.pipeline) },
          { k: 'number', label: 'Their number', align: 'r', value: (r) => r.call?.amount ?? -1, render: (r) => (r.call ? <span title={r.call.note}>{money(r.call.amount)}{r.call.kind === 'adjust' && <Badge tone="warn" dot={false}>Changed</Badge>}</span> : <span className="muted">Not submitted</span>) },
          { k: 'gap', label: 'To quota', align: 'r', render: (r) => (r.gap > 0 ? money(r.gap) : <span style={{ color: 'var(--good)' }}>Reached</span>) },
          ...(canAdjust ? [{ k: 'act', label: '', sort: false, stop: true, value: () => '', render: (r) => <div className="row" style={{ justifyContent: 'flex-end' }}>{r.id !== me.id && <Btn sm onClick={() => setCall({ row: r, adjusting: true })}>Change</Btn>}{can('teams', 'edit') && <Btn sm kind="ghost" onClick={() => setQuota(r)}>Quota</Btn>}</div> }] : []),
        ]} />
      {call && <CallDialog row={call.row} adjusting={call.adjusting} period={period} onClose={() => setCall(null)} />}
      {quota && <QuotaDialog row={quota} period={period} onClose={() => setQuota(null)} />}
    </div>
  );
}

function Deals({ deals, period, person, setPerson, people }) {
  const { can, update, toast, companyName, userName, scopeOf } = useStore();
  const editable = can('pipeline', 'edit');
  const open = deals.filter((d) => d.status === 'open' && inPeriod(d, period) && (!person || d.ownerId === person));
  const rows = open;
  return (
    <div className="stack">
      {scopeOf('forecast') !== 'own' && <select className="select tb-filter" style={{ alignSelf: 'flex-start' }} aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Everyone</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <DataTable key="deals" rows={rows} exportName="forecast-deals" initialSort={{ k: 'value', dir: 'desc' }} searchPlaceholder="Search deals…"
        statusTabs={{ options: CATEGORIES, get: categoryOf }} emptyText={`No open deals close in ${period.label}.`}
        columns={[
          { k: 'title', label: 'Opportunity', render: (d) => <Link className="strong" to={`/pipeline/${d.id}`}>{d.title}</Link> },
          { k: 'customer', label: 'Customer', value: (d) => companyName(d.companyId) },
          { k: 'owner', label: 'Salesperson', value: (d) => userName(d.ownerId) },
          { k: 'closeDate', label: 'Closing', nowrap: true, render: (d) => fmtShort(d.closeDate) },
          { k: 'probability', label: 'Probability', align: 'r', render: (d) => `${d.probability || 0}%` },
          { k: 'value', label: 'Value', align: 'r', render: (d) => money(d.value) },
          { k: 'cat', label: 'Category', value: categoryOf, stop: true, render: (d) => (editable ? <select className="select" style={{ height: 30 }} aria-label={`Category for ${d.title}`} value={categoryOf(d)} onChange={(e) => { update('deals', d.id, { forecastCategory: e.target.value }); toast(`Moved to ${e.target.value}`); }}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select> : <Badge tone={CATEGORY_TONE[categoryOf(d)]} dot={false}>{categoryOf(d)}</Badge>) },
        ]} />
    </div>
  );
}

function History({ deals, period, people }) {
  const { db, scopeOf, companyName } = useStore();
  const snap = (db.forecastSnapshots || []).filter((s) => s.period === period.key).sort((a, b) => b.date.localeCompare(a.date)).find((s) => s.date < today());
  const ids = new Set(deals.map((d) => d.id));
  const changes = changesSince(snap ? { ...snap, deals: Object.fromEntries(Object.entries(snap.deals).filter(([id]) => ids.has(id))) } : null, deals, period);
  const net = changes.reduce((a, c) => a + c.amount, 0);
  const past = pastQuarters(db.settings.fiscalStart, 3);
  const accuracy = past.flatMap((p) => people.map((u) => {
    const call = latestCall(db, u.id, p.key);
    if (!call) return null;
    const actual = db.deals.filter((d) => d.ownerId === u.id && d.status === 'won' && inPeriod(d, p)).reduce((a, d) => a + d.value, 0);
    const score = actual ? Math.max(0, 100 - (Math.abs(call.amount - actual) / actual) * 100) : call.amount ? 0 : 100;
    return { id: `${p.key}-${u.id}`, period: p.label, name: u.name, call: call.amount, actual, score, sample: call.sample };
  })).filter(Boolean);
  const avg = accuracy.length ? accuracy.reduce((a, r) => a + r.score, 0) / accuracy.length : null;
  const byQuarter = past.slice().reverse().map((p) => { const rows = accuracy.filter((r) => r.period === p.label); return { label: p.label, Forecast: rows.reduce((a, r) => a + r.call, 0), Won: rows.reduce((a, r) => a + r.actual, 0) }; });
  return (
    <div className="stack">
      <Card title="What changed" sub={snap ? `Since ${fmtShort(snap.date)}. Net change ${net >= 0 ? '+' : '−'}${money(Math.abs(Math.round(net)))}.` : 'A saved copy is made each week, so changes appear after the first week.'} pad={false}>
        {!changes.length && <Empty icon="History" text="No changes since the last saved copy." />}
        {changes.slice(0, 12).map((c, i) => <div key={c.deal.id + c.kind + i} className="predict-row"><div className="grow" style={{ minWidth: 0 }}><Link className="strong" to={`/pipeline/${c.deal.id}`}>{c.deal.title}</Link><div className="small muted">{companyName(c.deal.companyId)} · {c.text}</div></div><Badge tone={c.amount < 0 || c.kind === 'Lost' ? 'bad' : c.amount > 0 ? 'good' : 'info'} dot={false}>{c.kind}</Badge>{c.amount !== 0 && <span className="num nowrap">{c.amount > 0 ? '+' : '−'}{moneyK(Math.abs(c.amount))}</span>}</div>)}
      </Card>
      <div className="g3"><Kpi label="Forecast accuracy" value={avg == null ? '—' : pct(avg)} note="How close numbers were, last 3 quarters" icon="Crosshair" /><Kpi label="Numbers on file" value={num(accuracy.length)} icon="ClipboardList" /><Kpi label="Over or under" value={accuracy.length ? (accuracy.reduce((a, r) => a + r.call, 0) >= accuracy.reduce((a, r) => a + r.actual, 0) ? 'Too high' : 'Too low') : '—'} note={scopeOf('forecast') === 'own' ? 'Your overall habit' : 'The overall habit'} icon="Scale" /></div>
      {byQuarter.some((x) => x.Forecast || x.Won) && <Card title="Forecast against won"><Bars height={220} format={moneyK} data={byQuarter} series={[{ key: 'Forecast', name: 'Forecast' }, { key: 'Won', name: 'Won', color: 'var(--s3)' }]} /></Card>}
      <DataTable key="acc" rows={accuracy} exportName="forecast-accuracy" noSearch emptyText="No past forecasts yet." initialSort={{ k: 'period', dir: 'desc' }}
        columns={[
          { k: 'period', label: 'Quarter' },
          { k: 'name', label: 'Person', render: (r) => <span className="strong">{r.name}</span> },
          { k: 'call', label: 'Their number', align: 'r', render: (r) => money(r.call) },
          { k: 'actual', label: 'Won', align: 'r', render: (r) => money(r.actual) },
          { k: 'score', label: 'Accuracy', align: 'r', render: (r) => <div className="row" style={{ justifyContent: 'flex-end' }}><div style={{ width: 60 }}><Progress value={r.score} /></div><span className="num">{pct(r.score)}</span></div> },
        ]} />
    </div>
  );
}

export function Forecast() {
  const { db, me, t, sec, scope, scopeOf, saveForecastSnapshot } = useStore();
  const periods = useMemo(() => periodOptions(db.settings.fiscalStart), [db.settings.fiscalStart]);
  const [key, setKey] = useState(() => periods[2].key);
  const [person, setPerson] = useState('');
  const [pref, setTab] = useState('team');
  const period = periods.find((p) => p.key === key) || periods[2];
  const deals = scope(db.deals, 'forecast');
  const sc = scopeOf('forecast');
  const people = useMemo(() => db.users.filter((u) => u.active && (sc === 'all' ? u.role !== 'admin' || db.deals.some((d) => d.ownerId === u.id) : sc === 'team' ? u.teamId === me.teamId && (u.role !== 'manager' || u.id === me.id) : u.id === me.id)), [db.users, db.deals, sc, me.id]);
  const rows = people.map((u) => forecastRow(db, u, deals, period));
  useEffect(() => { saveForecastSnapshot(snapshotOf(db, periods[2], today())); }, []);
  const tabs = [{ k: 'team', label: sc === 'own' ? 'My forecast' : 'Team forecast', icon: 'Flag' }, { k: 'deals', label: 'Deals', icon: 'Kanban' }, { k: 'history', label: 'Changes and accuracy', icon: 'History' }, { k: 'monthly', label: 'By month', icon: 'CalendarDays' }].filter((x) => sec('forecast', x.k));
  const tab = firstAllowed(tabs, pref);
  return (
    <div>
      <PageHead title={t('forecast')} sub="How much will close, how sure everyone is, and how that compares with quota">
        {tab !== 'monthly' && <select className="select tb-filter" aria-label="Forecast period" value={period.key} onChange={(e) => setKey(e.target.value)}>{periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {!tab && <NoSections />}
      {tab === 'team' && <TeamForecast rows={rows} period={period} deals={deals} onPerson={(id) => { setPerson(id); setTab('deals'); }} />}
      {tab === 'deals' && <Deals deals={deals} period={period} person={person} setPerson={setPerson} people={people} />}
      {tab === 'history' && <History deals={deals} period={period} people={people} />}
      {tab === 'monthly' && <MonthlyForecast embedded />}
    </div>
  );
}
