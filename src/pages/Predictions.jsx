import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Empty, Icon, Stat } from '../ui';
import { Trend } from '../charts';
import { customersAtRisk, dealsAtRisk, forecastRows, leadsToCall, unusualChanges, whatIf } from '../predict';
import { addDays, money, moneyK, num, pct } from '../util';

function Action({ id, text, title, relatedType, relatedId, to, toLabel, dismiss }) {
  const { db, me, can, create, toast, canRoute } = useStore();
  const task = () => {
    create('activities', { typeId: db.activityTypes[0]?.id, summary: title, due: addDays(1), ownerId: me.id, note: text, status: 'todo', priority: 'High', tag: 'Sales', relatedType, relatedId });
    toast('Task added for tomorrow');
    dismiss(id);
  };
  return (
    <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
      {can('tasks', 'create') && <Btn sm icon="Plus" onClick={task}>Add task</Btn>}
      {to && canRoute(to.split('/').slice(0, 2).join('/')) && <Link className="btn sm" to={to}>{toLabel}</Link>}
      <Btn sm kind="ghost" onClick={() => { dismiss(id); toast('Hidden. It comes back if things change.'); }}>Dismiss</Btn>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, suffix = '%' }) {
  return (
    <label className="field">
      <span className="row between"><span className="label">{label}</span><span className="num strong">{value > 0 ? '+' : ''}{value}{suffix}</span></span>
      <input type="range" aria-label={label} min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--brand)' }} />
    </label>
  );
}

export default function Predictions({ view, target }) {
  const { db, can, scope, companyName, prefs, savePrefs } = useStore();
  const hidden = prefs.dismissedInsights || {};
  const today_ = new Date().toISOString().slice(0, 10);
  // Dismissals last 14 days, so a real problem can't stay hidden for good.
  const shown = (id) => !hidden[id] || hidden[id] < today_;
  const dismiss = (id) => savePrefs({ dismissedInsights: { ...hidden, [id]: addDays(14) } });
  const companies = can('customers') ? scope(db.companies, 'customers') : [];
  const forecast = useMemo(() => forecastRows(db, view.deals), [db, view.deals]);
  const risky = useMemo(() => dealsAtRisk(db, view.deals).filter((x) => shown(`deal-${x.deal.id}`)), [db, view.deals, prefs.dismissedInsights]);
  const churn = useMemo(() => customersAtRisk(db, companies).filter((x) => shown(`co-${x.company.id}`)), [db, companies.length, prefs.dismissedInsights]);
  const leads = useMemo(() => leadsToCall(view.leads).filter((x) => shown(`lead-${x.lead.id}`)), [view.leads, prefs.dismissedInsights]);
  const unusual = useMemo(() => unusualChanges(view), [view]);
  const [w, setW] = useState({ winRate: 0, dealSize: 0, volume: 0 });
  const plan = whatIf(view.deals, target, w);
  const atStake = risky.reduce((a, x) => a + x.atStake, 0);
  return (
    <div className="stack">
      <p className="notice" style={{ margin: 0 }}>These come from plain sums and rules over your records, with the reasons shown. They aren't a trained AI model, and they can be wrong, so treat them as prompts.</p>
      <div className="g4">
        <Stat label="Next 3 months" value={moneyK(forecast.total)} note={`Likely ${moneyK(forecast.low)} to ${moneyK(forecast.high)}`} icon="TrendingUp" />
        <Stat label="Deals at risk" value={num(risky.length)} note={`${moneyK(atStake)} could be lost`} icon="ShieldAlert" />
        <Stat label="Customers at risk" value={num(churn.length)} note="May stop buying" icon="HeartCrack" />
        <Stat label="Unusual this week" value={num(unusual.length)} note="Compared with the last 8 weeks" icon="Activity" />
      </div>
      <div className="g-21 ins-top">
        <Card title="Revenue forecast" sub={`Past 6 months and next 3. The trend is ${forecast.rising ? 'going up' : 'going down'}. Expected is the average of the trend and open deals, weighted by win chance.`}>
          <Trend height={260} data={forecast.rows} series={[{ key: 'Actual', name: 'Won' }, { key: 'Expected', name: 'Expected' }, { key: 'High', name: 'Likely high' }, { key: 'Low', name: 'Likely low' }]} />
        </Card>
        <Card title="What if?" sub="Move these to see the year-end change.">
          <div className="stack-s">
            <Slider label="Win rate" value={w.winRate} min={-20} max={30} onChange={(x) => setW({ ...w, winRate: x })} />
            <Slider label="Deal size" value={w.dealSize} min={-30} max={50} onChange={(x) => setW({ ...w, dealSize: x })} />
            <Slider label="Deals closed" value={w.volume} min={-30} max={50} onChange={(x) => setW({ ...w, volume: x })} />
            <div className="kpi-value" style={{ fontSize: 26 }}>{moneyK(plan.projected)}</div>
            <div className="small muted">Year-end estimate, {plan.gain >= 0 ? '+' : ''}{moneyK(plan.gain)} against today's pace of {moneyK(plan.base)}.</div>
            {plan.target > 0 && <div className="small" style={{ color: plan.gap > 0 ? 'var(--bad)' : 'var(--good)' }}>{plan.gap > 0 ? `${moneyK(plan.gap)} short of the ${moneyK(plan.target)} target` : `${moneyK(-plan.gap)} over the ${moneyK(plan.target)} target`}</div>}
            <div className="small muted">Today: {pct(plan.rate * 100)} win rate, {moneyK(plan.avg)} average deal, {plan.perMonth.toFixed(1)} deals closed a month.</div>
            <div><Btn sm onClick={() => setW({ winRate: 0, dealSize: 0, volume: 0 })}>Reset</Btn></div>
          </div>
        </Card>
      </div>
      <Card title="Unusual this week" sub="The last 7 days against the 8 weeks before.">
        {!unusual.length ? <Empty icon="Activity" text="Nothing unusual this week." /> : <div className="insight-list">{unusual.map((u) => (
          <div key={u.key} className={`insight ${u.good ? 'good' : 'warn'}`}>
            <span className="insight-icon" role="img" aria-label={u.good ? 'Good news' : 'Worth a look'}><Icon name={u.up ? 'TrendingUp' : 'TrendingDown'} size={16} /></span>
            <div className="grow"><span className="strong">{u.name} {u.up ? 'up' : 'down'} {Math.round(Math.abs(u.change) * 100)}%.</span> {u.money ? money(u.current) : num(Math.round(u.current))} this week, against about {u.money ? money(Math.round(u.mean)) : num(Math.round(u.mean))} a week. {u.driver}</div>
          </div>
        ))}</div>}
      </Card>
      <Card title="Deals at risk" sub="Biggest amount at stake first, with the reason and the next step." pad={false}>
        {!risky.length && <Empty icon="ShieldCheck" text="No deals look at risk." />}
        {risky.slice(0, 8).map((x) => (
          <div key={x.deal.id} className="predict-row">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row wrap"><span className="strong">{x.deal.title}</span><Badge tone="bad" dot={false}>{x.score}% win chance</Badge></div>
              <div className="small muted">{companyName(x.deal.companyId)} · {money(x.deal.value)} · {x.why.join(', ')}</div>
              <div className="small"><span className="strong">Do next:</span> {x.step}</div>
            </div>
            <Action id={`deal-${x.deal.id}`} title={`${x.step}: ${x.deal.title}`} text={`At risk: ${x.why.join(', ')}.`} relatedType="deal" relatedId={x.deal.id} to={`/pipeline/${x.deal.id}`} toLabel="Open deal" dismiss={dismiss} />
          </div>
        ))}
      </Card>
      <div className="g2 ins-top">
        <Card title="Customers who may stop buying" sub="Largest customers first." pad={false}>
          {!churn.length && <Empty icon="HeartHandshake" text="No customers look at risk." />}
          {churn.slice(0, 6).map((x) => (
            <div key={x.company.id} className="predict-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong trunc">{x.company.name}</div>
                <div className="small muted">{money(x.spent)} won so far · {x.why.join(', ')}</div>
              </div>
              <Action id={`co-${x.company.id}`} title={`Check in with ${x.company.name}`} text={`Customer at risk: ${x.why.join(', ')}.`} relatedType="company" relatedId={x.company.id} to={`/customers/${x.company.id}`} toLabel="Open" dismiss={dismiss} />
            </div>
          ))}
        </Card>
        <Card title="Leads to call first" sub="Highest score first, with the reasons." pad={false}>
          {!leads.length && <Empty icon="Magnet" text="No open leads." />}
          {leads.slice(0, 6).map((x) => (
            <div key={x.lead.id} className="predict-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row"><span className="strong trunc">{x.lead.name}</span><Badge tone="good" dot={false}>Score {x.lead.score}</Badge></div>
                <div className="small muted">{x.lead.company} · {x.why.join(', ')}</div>
              </div>
              <Action id={`lead-${x.lead.id}`} title={`Call ${x.lead.name}`} text={`High-scoring lead: ${x.why.join(', ')}.`} relatedType="lead" relatedId={x.lead.id} to={`/leads?open=${x.lead.id}`} toLabel="Open" dismiss={dismiss} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
