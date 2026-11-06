import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { DateRange, useDateRange } from '../dateRange';
import { Avatar, Badge, Card, DataTable, Drawer, Empty, Icon, NoSections, PageHead, Progress, Stat, Tabs, firstAllowed } from '../ui';
import { Bars, Trend } from '../charts';
import { businessInsights, personSignals, personStats, teamSignals } from '../insights';
import { RankW, SplitW } from '../widgets';
import { money, moneyK, num, pct, sum } from '../util';
import Predictions from './Predictions';

const TONES = { bad: ['OctagonAlert', 'Act now'], warn: ['TriangleAlert', 'Watch'], good: ['CircleCheck', 'Going well'], info: ['Lightbulb', 'Worth knowing'] };
const CTA = { '/billing': 'View invoices', '/pipeline': 'View deals', '/cases': 'View cases', '/leads': 'View leads', '/inventory': 'View stock', '/products': 'View products', '/reports/pipeline': 'See analysis', '/reports/leads': 'See sources', '/reports/forecast': 'See forecast' };
const VALUE = [{ key: 'value', name: 'Revenue won' }];
const orDash = (n, f = pct) => (n == null ? '—' : f(n));

function Statements({ items, empty }) {
  const { canRoute } = useStore();
  if (!items.length) return <div className="sub">{empty}</div>;
  return (
    <div className="insight-list">
      {items.map((s) => {
        const [icon, label] = TONES[s.tone];
        const link = s.to && canRoute(s.to);
        return (
          <div key={s.text} className={`insight ${s.tone}`}>
            <span className="insight-icon" aria-label={label} role="img"><Icon name={icon} size={16} /></span>
            <div className="grow" style={{ minWidth: 0 }}>{s.text}</div>
            {link && <Link className="btn sm nowrap" to={s.to}>{CTA[s.to] || 'View customer'}</Link>}
          </div>
        );
      })}
    </div>
  );
}

function Health({ cards }) {
  return (
    <div className="hc-grid">
      {cards.map((c) => (
        <div key={c.label} className={`hc ${c.tone}`}>
          <div className="row between"><span className="small strong">{c.label}</span><span className="insight-icon" role="img" aria-label={TONES[c.tone][1]}><Icon name={TONES[c.tone][0]} size={14} /></span></div>
          <div className="kpi-value">{c.value}</div>
          <div className="small muted">{c.note}</div>
        </div>
      ))}
    </div>
  );
}

function Business({ view, days, whole, target }) {
  const { db, companyName } = useStore();
  const x = useMemo(() => businessInsights(db, view, days, companyName, whole, target), [db, view, days, whole, target]);
  const k = x.kpis;
  const act = x.statements.filter((s) => s.tone === 'bad');
  const watch = x.statements.filter((s) => s.tone === 'warn');
  const good = x.statements.filter((s) => s.tone === 'good' || s.tone === 'info');
  return (
    <div className="stack">
      <section className={`verdict ${act.length ? 'bad' : watch.length ? 'warn' : 'good'}`}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="verdict-t">{act[0]?.text || watch[0]?.text || 'Nothing needs urgent action in this period.'}</div>
          <div className="small muted">First on the list of things to act on, from your CRM records.</div>
        </div>
        <div className="row wrap">
          <Badge tone="bad" dot={false}>{`${act.length} to act on`}</Badge>
          <Badge tone="warn" dot={false}>{`${watch.length} to watch`}</Badge>
          <Badge tone="good" dot={false}>{`${good.length} going well or useful`}</Badge>
        </div>
      </section>

      <div className="g4">
        <Stat label="Revenue won" value={money(k.revenue)} delta={k.revChange} note={`${num(k.wonCount)} deals`} icon="TrendingUp" />
        <Stat label="Cash collected" value={money(k.collected)} delta={k.cashChange} note="Payments received" icon="Wallet" />
        <Stat label="Average deal won" value={money(k.avgDeal)} delta={k.avgChange} note={`${k.closed} closed deals`} icon="Handshake" />
        <Stat label="Gross margin" value={orDash(k.margin)} note="On order lines, using product cost" icon="Percent" />
      </div>

      <Card title="Health check" sub="Rules of thumb applied to this period, so read them as prompts rather than verdicts."><Health cards={x.health} /></Card>

      <div className="g2 ins-top">
        <Card title="What to do next" sub="Most urgent first"><Statements items={[...act, ...watch]} empty="Nothing needs action in this period." /></Card>
        <Card title="What's working" sub="Keep doing these"><Statements items={good} empty="Nothing stands out yet for this period." /></Card>
      </div>

      <h2 className="wd-section">Are we on track?</h2>
      <div className="g-21 ins-top">
        <Card title="Revenue against target" sub={`${new Date().getFullYear()}, running total`}>
          {x.year.target ? <Trend height={240} data={x.year.rows} series={[{ key: 'actual', name: 'Revenue won' }, { key: 'target', name: 'Target pace' }]} /> : <Empty icon="Target" text="No target set." />}
        </Card>
        <Card title="Year-end estimate" sub="If the pace so far continues">
          <div className="kpi-value" style={{ fontSize: 28 }}>{moneyK(x.year.projected)}</div>
          {x.year.target > 0 && <div style={{ margin: '12px 0 6px' }}><Progress value={(x.year.projected / x.year.target) * 100} /></div>}
          {x.year.target > 0 && <div className="small muted">{pct((x.year.projected / x.year.target) * 100)} of the {moneyK(x.year.target)} target</div>}
          <div className="ins-facts">
            <div><span className="muted">Won so far</span><strong className="num">{moneyK(x.year.won)}</strong></div>
            <div><span className="muted">Still needed</span><strong className="num">{moneyK(Math.max(0, x.year.target - x.year.won))}</strong></div>
            <div><span className="muted">Expected from open deals</span><strong className="num">{moneyK(k.weighted)}</strong></div>
          </div>
        </Card>
      </div>

      <h2 className="wd-section">Customers</h2>
      <div className="g3 ins-top">
        <Card title="Top customers" sub="Revenue won in this period">{x.charts.customers.length ? <RankW data={x.charts.customers} /> : <Empty icon="Building2" text="No deals won in this period." />}</Card>
        <Card title="New and returning" sub="Revenue won in this period"><SplitW data={x.mix} format={moneyK} label="won" /></Card>
        <Card title="Customers going quiet" sub="Nothing won or ordered in 90 days, largest first">
          {!x.quiet.length && <Empty icon="HeartHandshake" text="No customers have gone quiet." />}
          {x.quiet.map((c) => <Link key={c.id} to={`/customers/${c.id}`} className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{c.name}</div><div className="small muted">{c.days} days quiet</div></div><span className="num strong">{moneyK(c.value)}</span></Link>)}
        </Card>
      </div>

      <h2 className="wd-section">Sales</h2>
      <div className="g3 ins-top">
        <Card title="Where deals come from" sub="Deals closed in this period" pad={false}>
          {x.sources.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Source</th><th className="r">Closed</th><th className="r">Win rate</th><th className="r">Revenue</th></tr></thead><tbody>{x.sources.map((s) => <tr key={s.source}><td>{s.source}</td><td className="r num">{s.closed}</td><td className="r num">{orDash(s.rate)}</td><td className="r num">{moneyK(s.revenue)}</td></tr>)}</tbody></table></div> : <Empty icon="Compass" text="No deals closed in this period." />}
        </Card>
        <Card title="Why deals are lost" sub="This period">{x.charts.reasons.length ? <RankW data={x.charts.reasons} format={num} /> : <Empty icon="ThumbsDown" text="No deals lost in this period." />}</Card>
        <Card title="Open deals by stage" sub="Value before probability"><RankW data={x.charts.stages} /></Card>
      </div>

      <h2 className="wd-section">Money and products</h2>
      <div className="g2 ins-top">
        <Card title="Invoiced and collected" sub="Last 12 months"><Trend height={240} data={x.charts.cash} series={[{ key: 'billed', name: 'Invoiced' }, { key: 'paid', name: 'Collected' }]} /></Card>
        <Card title="Unpaid invoices by days overdue" sub="Money still owed"><Bars height={240} data={x.charts.ageing} series={[{ key: 'value', name: 'Unpaid' }]} /></Card>
      </div>
      <Card title="Best-selling products" sub="Orders in this period" pad={false}>
        {x.products.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Product</th><th className="r">Sold</th><th className="r">Sales</th><th className="r">Margin</th></tr></thead><tbody>{x.products.map((p) => <tr key={p.id}><td>{p.name}</td><td className="r num">{num(p.qty)}</td><td className="r num">{moneyK(p.value)}</td><td className="r num">{orDash(p.margin)}</td></tr>)}</tbody></table></div> : <Empty icon="Package" text="No orders in this period." />}
      </Card>
    </div>
  );
}

function PersonDetail({ s, all }) {
  const avg = (f) => (all.length ? sum(all, f) / all.length : 0);
  const rows = [
    ['Revenue won', money(s.revenue), money(avg((x) => x.revenue))],
    ['Deals won', num(s.wonCount), num(Math.round(avg((x) => x.wonCount)))],
    ['Open deals', `${num(s.openCount)} · ${moneyK(s.openValue)}`, num(Math.round(avg((x) => x.openCount)))],
    ['Calls', num(s.calls), num(Math.round(avg((x) => x.calls)))],
    ['Talk time', `${num(s.talkMinutes)} min`, `${num(Math.round(avg((x) => x.talkMinutes)))} min`],
    ['Tasks completed', num(s.tasksDone), num(Math.round(avg((x) => x.tasksDone)))],
    ['Overdue tasks', num(s.overdueTasks), num(Math.round(avg((x) => x.overdueTasks)))],
    ['Late follow-ups', num(s.missedFollowups), num(Math.round(avg((x) => x.missedFollowups)))],
    ['New leads', `${num(s.leads)} · ${num(s.converted)} converted`, num(Math.round(avg((x) => x.leads)))],
    ['Open support cases', num(s.openCases), num(Math.round(avg((x) => x.openCases)))],
  ];
  return (
    <div className="stack">
      {s.target > 0 && (
        <div>
          <div className="row between small"><span className="strong">Yearly target</span><span className="muted">{money(s.wonYear)} of {money(s.target)}</span></div>
          <div className="ai-bar" role="progressbar" aria-label="Yearly target progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(s.attainment))} style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, s.attainment)}%` }} /></div>
        </div>
      )}
      <Statements items={personSignals(s, all)} empty="Nothing stands out for this period." />
      <div><div className="label" style={{ marginBottom: 6 }}>Revenue won, last 12 months</div><Bars data={s.trend} series={VALUE} height={200} /></div>
      <div className="tb-wrap"><table className="table"><thead><tr><th>This period</th><th className="r">{all.length > 1 ? 'This person' : 'You'}</th>{all.length > 1 && <th className="r">Group average</th>}</tr></thead><tbody>{rows.map(([label, a, b]) => <tr key={label}><td>{label}</td><td className="r num">{a}</td>{all.length > 1 && <td className="r num muted">{b}</td>}</tr>)}</tbody></table></div>
    </div>
  );
}

function PersonCard({ r, place, onOpen }) {
  return (
    <button type="button" className="card podium" onClick={onOpen}>
      <span className="podium-n">{place}</span>
      <Avatar name={r.name} size={44} />
      <span className="strong trunc notranslate" translate="no" style={{ maxWidth: '100%' }}>{r.name}</span>
      <span className="kpi-value">{moneyK(r.revenue)}</span>
      <span className="small muted">{r.wonCount} deals won · win rate {orDash(r.winRate)}</span>
      {r.attainment != null && <span className="podium-bar"><Progress value={r.attainment} /><span className="small muted">{pct(r.attainment)} of yearly target</span></span>}
    </button>
  );
}

function Employees({ people, days, sc }) {
  const { db } = useStore();
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => people.map((u) => personStats(db, u, days)), [db, people, days]);
  if (!rows.length) return <div className="card"><Empty icon="UsersRound" text="There's nobody to show yet." /></div>;
  if (sc === 'own') {
    const s = rows[0];
    return (
      <div className="stack">
        <div className="g4">
          <Stat label="Revenue won" value={money(s.revenue)} note={`${num(s.wonCount)} deals`} icon="TrendingUp" />
          <Stat label="Yearly target" value={orDash(s.attainment)} note={`${moneyK(s.wonYear)} of ${moneyK(s.target)}`} icon="Target" />
          <Stat label="Win rate" value={orDash(s.winRate)} note={`${s.wonCount + s.lostCount} closed deals`} icon="Percent" />
          <Stat label="Calls" value={num(s.calls)} note={`${num(s.talkMinutes)} minutes`} icon="PhoneCall" />
        </div>
        <Card title={s.name} sub={s.title}><PersonDetail s={s} all={rows} /></Card>
      </div>
    );
  }
  const cur = rows.find((r) => r.id === open);
  const ranked = [...rows].sort((a, b) => b.revenue - a.revenue);
  const support = rows.map((r) => ({ r, flags: personSignals(r, rows).filter((f) => f.tone === 'bad' || f.tone === 'warn') })).filter((x) => x.flags.length).sort((a, b) => b.flags.length - a.flags.length).slice(0, 5);
  return (
    <div className="stack">
      <div className="g4">
        <Stat label="People" value={num(rows.length)} icon="UsersRound" />
        <Stat label="Revenue won" value={money(sum(rows, (r) => r.revenue))} icon="TrendingUp" />
        <Stat label="Calls" value={num(sum(rows, (r) => r.calls))} note={`${num(sum(rows, (r) => r.talkMinutes))} minutes`} icon="PhoneCall" />
        <Stat label="Overdue tasks" value={num(sum(rows, (r) => r.overdueTasks))} icon="ListTodo" />
      </div>
      <h2 className="wd-section">Top performers</h2>
      <div className="g3">{ranked.slice(0, 3).map((r, i) => <PersonCard key={r.id} r={r} place={i + 1} onOpen={() => setOpen(r.id)} />)}</div>
      <div className="g2 ins-top">
        <Card title="Who may need support" sub="Most flags first">
          {!support.length && <Empty icon="HeartHandshake" text="Nobody stands out as needing support." />}
          {support.map(({ r, flags }) => <button key={r.id} type="button" className="dashlet ins-person" onClick={() => setOpen(r.id)}><Avatar name={r.name} size={30} /><span className="grow" style={{ minWidth: 0 }}><span className="strong trunc notranslate" translate="no" style={{ display: 'block' }}>{r.name}</span><span className="small muted">{flags[0].text}</span></span><Badge tone="warn" dot={false}>{flags.length === 1 ? '1 flag' : `${flags.length} flags`}</Badge></button>)}
        </Card>
        <Card title="What stands out"><Statements items={teamSignals(rows)} empty="Nothing stands out for this period." /></Card>
      </div>
      <DataTable rows={rows} exportName="employee-insights" initialSort={{ k: 'revenue', dir: 'desc' }} onRow={(r) => setOpen(r.id)} searchPlaceholder="Search people…"
        columns={[
          { k: 'name', label: 'Person', render: (r) => <span className="row"><Avatar name={r.name} size={26} /><span><div className="strong notranslate" translate="no">{r.name}</div><div className="small muted">{r.title}</div></span></span> },
          { k: 'revenue', label: 'Revenue won', align: 'r', render: (r) => money(r.revenue) },
          { k: 'attainment', label: 'Yearly target', align: 'r', render: (r) => (r.attainment == null ? '—' : <Badge tone={r.pace >= 100 ? 'good' : r.pace < 70 ? 'bad' : 'warn'} dot={false}>{pct(r.attainment)}</Badge>) },
          { k: 'winRate', label: 'Win rate', align: 'r', render: (r) => orDash(r.winRate) },
          { k: 'openValue', label: 'Open deals', align: 'r', render: (r) => moneyK(r.openValue) },
          { k: 'calls', label: 'Calls', align: 'r' },
          { k: 'tasksDone', label: 'Tasks done', align: 'r' },
          { k: 'overdueTasks', label: 'Overdue tasks', align: 'r' },
          { k: 'missedFollowups', label: 'Late follow-ups', align: 'r' },
          { k: 'stuck', label: 'Stuck deals', align: 'r', hidden: true },
          { k: 'overdueMoney', label: 'Overdue invoices', align: 'r', hidden: true, render: (r) => money(r.overdueMoney) },
        ]} />
      <p className="small muted" style={{ margin: 0 }}>These figures only cover what's recorded in the CRM, so use them to start a conversation, not to judge someone. Win rate needs at least 5 closed deals. Target colours compare results with where the person should be by this point in the year.</p>
      {cur && <Drawer title={cur.name} onClose={() => setOpen(null)}><PersonDetail s={cur} all={rows} /></Drawer>}
    </div>
  );
}

export default function Insights() {
  const { db, me, t, can, sec, scopeOf } = useStore();
  const sc = scopeOf('insights');
  const tabs = [{ k: 'business', label: 'Business', icon: 'Building2' }, { k: 'employees', label: 'Employees', icon: 'UsersRound' }, { k: 'predict', label: 'Predictions', icon: 'Sparkles' }].filter((x) => sec('insights', x.k));
  const [pref, setTab] = useState('business');
  const [days, setDays] = useDateRange('Current Fiscal Year');
  const tab = firstAllowed(tabs, pref);
  const people = useMemo(() => {
    if (sc === 'own') return [me];
    const list = db.users.filter((u) => u.active && (sc === 'all' || u.teamId === me.teamId || u.id === me.id));
    // Admins only appear if they personally own records.
    return list.filter((u) => u.role !== 'admin' || db.deals.some((d) => d.ownerId === u.id));
  }, [db.users, db.deals, sc, me.id]);
  const view = useMemo(() => {
    const ids = new Set(people.map((u) => u.id));
    const own = (list) => (sc === 'all' ? list : list.filter((r) => ids.has(r.ownerId)));
    return { deals: own(db.deals), leads: own(db.leads), orders: own(db.orders), invoices: own(db.invoices), payments: own(db.payments), cases: own(db.cases) };
  }, [db, people, sc]);
  const target = sc === 'all' ? sum(db.teams, (x) => x.target) : sc === 'team' ? db.teams.find((x) => x.id === me.teamId)?.target || me.target : me.target;
  if (!tab || !can('insights')) return <div><PageHead title={t('insights')} /><NoSections /></div>;
  const sub = tab === 'predict' ? 'What is likely to happen next, and what to do about it.' : tab === 'business'
    ? (sc === 'all' ? 'How the whole business is doing, and what to act on.' : "How your team's part of the business is doing, and what to act on.")
    : (sc === 'own' ? 'How you are doing, compared with your yearly target.' : sc === 'team' ? 'How each person on your team is doing.' : 'How each person in the company is doing.');
  return (
    <div>
      <PageHead title={t('insights')} sub={sub}>{tab !== 'predict' && <DateRange value={days} onChange={setDays} />}</PageHead>
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} />}
      <div style={{ marginTop: tabs.length > 1 ? 14 : 0 }}>
        {tab === 'business' && <Business view={view} days={days} whole={sc === 'all'} target={target} />}
        {tab === 'employees' && <Employees people={people} days={days} sc={sc} />}
        {tab === 'predict' && <Predictions view={view} target={target} />}
      </div>
    </div>
  );
}
