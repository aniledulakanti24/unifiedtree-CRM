import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { STAGES } from '../seed';
import { Avatar, Badge, Btn, Card, Empty, Icon, Kpi, PageHead, Progress, UserChip } from '../ui';
import { Bars, Trend } from '../charts';
import { RecordQuickCreate } from '../shared';
import { CHANNELS, useComms } from '../comms';
import { addDays, fmtDate, fmtShort, fmtTime, lastMonths, money, moneyK, monthKey, monthLabel, num, pct, relTime, sum, today } from '../util';

const stageName = (id) => STAGES.find((s) => s.id === id)?.name;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const dateLine = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const thisYear = () => String(new Date().getFullYear());
const wonIn = (deals, prefix) => deals.filter((d) => d.status === 'won' && (d.closeDate || '').startsWith(prefix));
const SeeAll = ({ to, children = 'View all' }) => { const { canRoute } = useStore(); return canRoute(to) ? <Link className="small" to={to}>{children}</Link> : null; };
const HeadLink = ({ to, primary, icon, children }) => { const { canRoute } = useStore(); return canRoute(to) ? <Link className={`btn ${primary ? 'primary' : ''}`} to={to}><Icon name={icon} />{children}</Link> : null; };

/* ---------- Sales Person: what do I do today? ---------- */
// Shown on every role's home screen. Only meetings you're in, even for people who can see everyone's.
function TodayMeetings() {
  const { db, me, can, sec, userName } = useStore();
  if (!sec('dashboard', 'todayMeetings')) return null;
  const now = new Date();
  const list = db.events.filter((e) => (e.ownerId === me.id || e.attendeeIds?.includes(me.id)) && e.category !== 'Holiday' && new Date(e.start).toDateString() === now.toDateString() && new Date(e.end) > now).sort((a, b) => a.start.localeCompare(b.start));
  const waiting = can('meetings') ? db.meetingRequests.filter((r) => r.status === 'Pending' && r.toId === me.id).length : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <Card title="Today's meetings" action={can('meetings', 'create') ? <Link className="small" to="/meetings?new=1">Request a meeting</Link> : null}>
        {waiting > 0 && <p className="notice" style={{ margin: '0 0 10px' }}>{waiting === 1 ? '1 meeting request needs' : `${waiting} meeting requests need`} your answer. <Link to="/meetings">Review</Link></p>}
        {!list.length && <div className="sub">No more meetings today.</div>}
        {list.map((e) => {
          const others = [e.ownerId, ...(e.attendeeIds || [])].filter((u) => u !== me.id).map((u) => userName(u));
          return (
            <div key={e.id} className="dashlet">
              <div className="strong num" style={{ width: 66, flexShrink: 0 }}>{fmtTime(e.start)}</div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="trunc strong"><Link to={e.requestId ? `/meetings?open=${e.requestId}` : '/calendar'}>{e.title}</Link></div>
                <div className="small muted trunc">{[others.length ? `With ${others.join(', ')}` : '', e.location].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function FollowupsCard() {
  const { db, me, can, sec, scope, t } = useStore();
  const { startCall, canCall, inCall } = useComms();
  if (!can('followups') || !sec('dashboard', 'followupsCard')) return null;
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const list = scope(db.followups).filter((f) => f.status === 'open' && f.at <= dayEnd.toISOString()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  return (
    <Card title="Follow-ups today" action={<SeeAll to="/followups">{t('followups')}</SeeAll>}>
      {!list.length && <Empty icon="BellOff" text="No follow-ups due." />}
      {list.map((f) => (
        <div key={f.id} className="dashlet">
          <span className="kpi-ico" style={{ width: 28, height: 28 }}><Icon name={CHANNELS[f.channel]} size={14} /></span>
          <div className="grow"><div className="strong trunc">{f.title}</div><div className="small muted trunc">{f.name} · {fmtTime(f.at)}</div></div>
          {f.channel === 'Call' && f.phone && canCall && <Btn sm icon="Phone" aria-label={`Call ${f.name}`} disabled={inCall} onClick={() => startCall('voice', { name: f.name, phone: f.phone, relatedType: f.relatedType, relatedId: f.relatedId, contactId: f.contactId })} />}
        </div>
      ))}
    </Card>
  );
}

function SalesDashboard() {
  const { db, me, can, sec, scope, update, toast, companyName, t } = useStore();
  const [quick, setQuick] = useState(null);
  const deals = useMemo(() => scope(db.deals), [db.deals, me.id]);
  const open = deals.filter((d) => d.status === 'open');
  const tasks = scope(db.activities).filter((a) => a.status !== 'done').sort((a, b) => a.due.localeCompare(b.due));
  const now = today();
  const dueNow = tasks.filter((a) => a.due <= now);
  const focus = (dueNow.length ? dueNow : tasks).slice(0, 7);
  const wonMonth = sum(wonIn(deals, now.slice(0, 7)), (d) => d.value);
  const wonYear = sum(wonIn(deals, thisYear()), (d) => d.value);
  const closing = open.filter((d) => d.closeDate <= addDays(30)).sort((a, b) => a.closeDate.localeCompare(b.closeDate)).slice(0, 6);
  const leads = scope(db.leads).filter((l) => l.status === 'New').sort((a, b) => b.score - a.score).slice(0, 5);
  const iso = new Date().toISOString();
  const meetings = scope(db.events).filter((e) => e.start >= iso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const transfers = db.transfers.filter((x) => x.status === 'Pending' && x.requestedBy === me.id);
  const byStage = STAGES.filter((s) => s.id !== 'won').map((s) => ({ label: s.name, Value: sum(open.filter((d) => d.stage === s.id), (d) => d.value) }));
  const attain = me.target ? (wonYear / me.target) * 100 : 0;
  return (
    <div>
      <PageHead title={`${greeting()}, ${me.name.split(' ')[0]}`} sub={`${dateLine()} · ${dueNow.length ? `${dueNow.length} activities need you today` : 'Nothing overdue'}`}>
        {can('leads', 'create') && <Btn icon="Magnet" onClick={() => setQuick('lead')}>New lead</Btn>}
        {can('pipeline', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setQuick('deal')}>New opportunity</Btn>}
      </PageHead>
      <TodayMeetings />
      {sec('dashboard', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Due today or overdue" value={num(dueNow.length)} note={`${tasks.length} open in total`} icon="AlarmClock" />
        <Kpi label="My open pipeline" value={moneyK(sum(open, (d) => d.value))} note={`${open.length} opportunities`} icon="Kanban" />
        <Kpi label="Won this month" value={moneyK(wonMonth)} icon="Trophy" />
        <Kpi label="Annual target" value={pct(attain)} note={`${moneyK(wonYear)} of ${moneyK(me.target)}`} icon="Target" />
      </div>}
      <div className="g-21" style={{ alignItems: 'start' }}>
        <div className="stack">
          {sec('dashboard', 'focus') && <Card title="Today's focus" sub={dueNow.length ? 'Overdue first' : 'Coming up next'} action={<SeeAll to="/tasks">{t('tasks')}</SeeAll>}>
            {!focus.length && <Empty icon="CheckCheck" text="You're all caught up." />}
            {focus.map((a) => {
              const type = db.activityTypes.find((x) => x.id === a.typeId);
              const late = a.due < now;
              return (
                <div key={a.id} className="dashlet">
                  <input type="checkbox" aria-label={`Complete ${a.summary}`} disabled={!can('tasks', 'edit')} onChange={() => { update('activities', a.id, { status: 'done' }); toast('Activity done'); }} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
                  <span className="kpi-ico" style={{ width: 28, height: 28 }}><Icon name={type?.icon} size={14} /></span>
                  <div className="grow"><div className="strong trunc">{a.summary}</div>{a.relatedType === 'deal' ? <Link className="small trunc" style={{ display: 'block' }} to={`/pipeline/${a.relatedId}`}>{a.relatedLabel}</Link> : <div className="small muted trunc">{a.relatedLabel || type?.name}</div>}</div>
                  <span className="small nowrap" style={{ color: late ? 'var(--bad)' : 'var(--ink-3)' }}>{late ? 'Overdue · ' : ''}{fmtShort(a.due)}</span>
                </div>
              );
            })}
          </Card>}
          <FollowupsCard />
          {sec('dashboard', 'closing') && <Card title="Closing in the next 30 days" action={<SeeAll to="/pipeline">{t('pipeline')}</SeeAll>} pad={false}>
            <div style={{ marginTop: 10 }}>
              {!closing.length && <Empty icon="Handshake" text="No deals closing soon." />}
              {closing.length > 0 && (
                <div className="tb-wrap"><table className="table"><thead><tr><th>Opportunity</th><th>Stage</th><th>Closing</th><th className="r">Value</th></tr></thead><tbody>
                  {closing.map((d) => <tr key={d.id}><td><Link className="strong" to={`/pipeline/${d.id}`}>{d.title}</Link><div className="small muted">{companyName(d.companyId)}</div></td><td><Badge>{stageName(d.stage)}</Badge></td><td className="nowrap" style={d.closeDate < now ? { color: 'var(--bad)' } : undefined}>{fmtShort(d.closeDate)}</td><td className="r num strong">{money(d.value)}</td></tr>)}
                </tbody></table></div>
              )}
            </div>
          </Card>}
          {sec('dashboard', 'stageChart') && <Card title="My pipeline by stage"><Bars horizontal height={190} data={byStage} series={[{ key: 'Value', name: 'Pipeline value' }]} /></Card>}
        </div>
        <div className="stack">
          {can('calendar') && sec('dashboard', 'appointments') && <Card title="Next appointments" action={<SeeAll to="/calendar">{t('calendar')}</SeeAll>}>
            {!meetings.length && <Empty icon="CalendarOff" text="Nothing scheduled." />}
            {meetings.map((e) => (
              <div key={e.id} className="dashlet">
                <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}><div className="small muted">{new Date(e.start).toLocaleDateString('en-US', { month: 'short' })}</div><div className="strong num" style={{ fontSize: 16, lineHeight: 1.1 }}>{new Date(e.start).getDate()}</div></div>
                <div className="grow"><div className="trunc strong">{e.title}</div><div className="small muted">{fmtTime(e.start)} · {e.location}</div></div>
              </div>
            ))}
          </Card>}
          {can('leads') && sec('dashboard', 'leadsCard') && <Card title="Leads to contact" sub="Highest score first" action={<SeeAll to="/leads">{t('leads')}</SeeAll>}>
            {!leads.length && <Empty icon="Magnet" text="No new leads." />}
            {leads.map((l) => (
              <Link key={l.id} to={`/leads?open=${l.id}`} className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}>
                <Avatar name={l.name} size={28} />
                <div className="grow"><div className="trunc strong">{l.name}</div><div className="small muted trunc">{l.company}</div></div>
                <Badge tone="muted" dot={false}>{l.score}</Badge>
              </Link>
            ))}
          </Card>}
          {can('transfers') && sec('dashboard', 'transfersCard') && transfers.length > 0 && (
            <Card title="Waiting on my manager" action={<SeeAll to="/transfers">{t('transfers')}</SeeAll>}>
              {transfers.map((x) => <div key={x.id} className="dashlet"><div className="grow trunc">{x.recordLabel}</div><Badge>{x.status}</Badge></div>)}
            </Card>
          )}
        </div>
      </div>
      {quick && <RecordQuickCreate kind={quick} onClose={() => setQuick(null)} />}
    </div>
  );
}

/* ---------- Manager: how is my team doing, and what needs me? ---------- */
function ManagerDashboard() {
  const { db, me, can, sec, scope, decideTransfer, toast, userName, companyName, t } = useStore();
  const team = db.teams.find((x) => x.id === me.teamId);
  const members = db.users.filter((u) => u.teamId === me.teamId && u.active);
  const deals = useMemo(() => scope(db.deals), [db.deals, me.id]);
  const open = deals.filter((d) => d.status === 'open');
  const activities = scope(db.activities);
  const now = today();
  const wonYear = sum(wonIn(deals, thisYear()), (d) => d.value);
  const attain = team?.target ? (wonYear / team.target) * 100 : 0;
  const approvals = !can('transfers', 'approve') ? [] : db.transfers.filter((x) => x.status === 'Pending' && members.some((u) => u.id === x.fromId));
  const months = lastMonths(12);
  const scorecard = members.map((u) => {
    const mine = deals.filter((d) => d.ownerId === u.id);
    const won = sum(wonIn(mine, thisYear()), (d) => d.value);
    const closed = mine.filter((d) => d.status !== 'open');
    return { u, open: mine.filter((d) => d.status === 'open').length, pipeline: sum(mine.filter((d) => d.status === 'open'), (d) => d.value), won, attain: u.target ? (won / u.target) * 100 : 0, winRate: closed.length ? (closed.filter((d) => d.status === 'won').length / closed.length) * 100 : 0, overdue: activities.filter((a) => a.ownerId === u.id && a.status !== 'done' && a.due < now).length };
  }).sort((a, b) => b.won - a.won);
  const planned = new Set(activities.filter((a) => a.status !== 'done').map((a) => a.relatedId));
  const risk = open.map((d) => ({ d, why: d.closeDate < now ? 'Past closing date' : !planned.has(d.id) ? 'No next activity' : null })).filter((x) => x.why).sort((a, b) => b.d.value - a.d.value).slice(0, 6);
  const waiting = scope(db.leads).filter((l) => l.status === 'New').length;
  return (
    <div>
      <PageHead title={team?.name || t('dashboard')} sub={`${dateLine()} · ${members.length} people on your team`}>
        <HeadLink to="/reports/forecast" icon="TrendingUp">{t('forecast')}</HeadLink>
        <HeadLink primary to="/pipeline" icon="Kanban">{t('pipeline')}</HeadLink>
      </PageHead>
      <TodayMeetings />
      {sec('dashboard', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Team target" value={pct(attain)} note={`${moneyK(wonYear)} of ${moneyK(team?.target)}`} icon="Target" />
        <Kpi label="Team pipeline" value={moneyK(sum(open, (d) => d.value))} note={`${open.length} open deals`} icon="Kanban" />
        <Kpi label="Weighted forecast" value={moneyK(sum(open, (d) => (d.value * d.probability) / 100))} note="Value × probability" icon="Scale" />
        <Kpi label="Waiting for you" value={num(approvals.length)} note="Transfer approvals" icon="Hourglass" />
      </div>}
      <div className="g-21" style={{ alignItems: 'start', marginBottom: 14 }}>
        {sec('dashboard', 'scorecard') && <Card title="Rep scorecard" sub="This year" pad={false} action={<SeeAll to="/teams">{t('teams')}</SeeAll>}>
          <div className="tb-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Salesperson</th><th className="r">Open</th><th className="r">Pipeline</th><th className="r">Won</th><th style={{ width: 130 }}>Target</th><th className="r">Win rate</th><th className="r">Overdue</th></tr></thead>
              <tbody>{scorecard.map((r) => (
                <tr key={r.u.id}>
                  <td><UserChip id={r.u.id} /></td>
                  <td className="r num">{r.open}</td>
                  <td className="r num">{moneyK(r.pipeline)}</td>
                  <td className="r num strong">{moneyK(r.won)}</td>
                  <td><div className="row"><div className="grow"><Progress value={r.attain} /></div><span className="small num">{pct(r.attain)}</span></div></td>
                  <td className="r num">{pct(r.winRate)}</td>
                  <td className="r num" style={r.overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{r.overdue}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>}
        {sec('dashboard', 'approvals') && <Card title="Approvals" action={<SeeAll to="/transfers">{t('transfers')}</SeeAll>}>
          {!approvals.length && <Empty icon="CheckCheck" text="No transfers waiting." />}
          {approvals.slice(0, 4).map((x) => (
            <div key={x.id} className="stack-s" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div><div className="strong trunc">{x.recordLabel}</div><div className="small muted trunc">{userName(x.fromId)} → {userName(x.toId)}</div><div className="small sub">{x.reason}</div></div>
              <div className="row"><Btn sm kind="primary" onClick={() => { decideTransfer(x.id, true, 'Approved from dashboard'); toast('Transfer approved. Ownership moved.'); }}>Approve</Btn><Btn sm onClick={() => { decideTransfer(x.id, false, 'Rejected from dashboard'); toast('Transfer rejected'); }}>Reject</Btn></div>
            </div>
          ))}
        </Card>}
      </div>
      <div className="g-21" style={{ alignItems: 'start' }}>
        {sec('dashboard', 'risk') && <Card title="Deals at risk" sub="Largest first" pad={false}>
          <div style={{ marginTop: 10 }}>
            {!risk.length && <Empty icon="ShieldCheck" text="No deals at risk." />}
            {risk.length > 0 && (
              <div className="tb-wrap"><table className="table"><thead><tr><th>Opportunity</th><th>Owner</th><th>Risk</th><th className="r">Value</th></tr></thead><tbody>
                {risk.map(({ d, why }) => <tr key={d.id}><td><Link className="strong" to={`/pipeline/${d.id}`}>{d.title}</Link><div className="small muted">{companyName(d.companyId)} · closes {fmtDate(d.closeDate)}</div></td><td><UserChip id={d.ownerId} /></td><td><Badge tone={d.closeDate < now ? 'bad' : 'warn'}>{why}</Badge></td><td className="r num strong">{money(d.value)}</td></tr>)}
              </tbody></table></div>
            )}
          </div>
        </Card>}
        <div className="stack">
          {sec('dashboard', 'teamRevenue') && <Card title="Team revenue won" sub="Last 12 months"><Bars height={190} data={months.map((m) => ({ label: monthLabel(m), Won: sum(deals.filter((d) => d.status === 'won' && monthKey(d.closeDate) === m), (d) => d.value) }))} series={[{ key: 'Won', name: 'Revenue won' }]} /></Card>}
          {can('leads') && sec('dashboard', 'newLeads') && <Link to="/leads" className="card row between" style={{ padding: '14px 16px', color: 'inherit', textDecoration: 'none' }}>
            <span><span className="strong">{num(waiting)} new leads</span><div className="small muted">Assign them to your team</div></span>
            <Icon name="ChevronRight" />
          </Link>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin: is the company and the system healthy? ---------- */
function AdminDashboard() {
  const { db, userName, t, sec, canRoute } = useStore();
  const deals = db.deals;
  const open = deals.filter((d) => d.status === 'open');
  const wonYear = sum(wonIn(deals, thisYear()), (d) => d.value);
  const unpaid = sum(db.invoices, (i) => i.total - (i.paid || 0));
  const months = lastMonths(12);
  const teamOf = (id) => db.users.find((u) => u.id === id)?.teamId;
  const byTeam = months.map((m) => {
    const row = { label: monthLabel(m) };
    db.teams.forEach((x) => { row[x.id] = sum(deals.filter((d) => d.status === 'won' && monthKey(d.closeDate) === m && teamOf(d.ownerId) === x.id), (d) => d.value); });
    return row;
  });
  const alerts = [
    { n: db.products.filter((p) => p.tracked && p.stock <= p.reorder).length, text: 'products at or below reorder level', icon: 'PackageX', to: '/inventory' },
    { n: db.invoices.filter((i) => i.status === 'Overdue').length, text: 'overdue invoices', icon: 'Receipt', to: '/billing' },
    { n: db.shipments.filter((s) => s.status === 'Delayed').length, text: 'delayed shipments', icon: 'Truck', to: '/logistics' },
    { n: db.cases.filter((c) => c.priority === 'Urgent' && !['Closed', 'Rejected'].includes(c.status)).length, text: 'urgent support cases', icon: 'Siren', to: '/cases' },
    { n: db.transfers.filter((x) => x.status === 'Pending').length, text: 'transfers waiting for a manager', icon: 'ArrowRightLeft', to: '/transfers' },
  ].filter((a) => a.n > 0 && canRoute(a.to));
  const roles = [['Admins', 'admin'], ['Managers', 'manager'], ['Sales people', 'sales']].map(([label, r]) => ({ label, n: db.users.filter((u) => u.role === r && u.active).length }));
  return (
    <div>
      <PageHead title={t('dashboard')} sub={`${db.settings.companyName} · ${dateLine()}`}>
        <HeadLink to="/access" icon="ShieldCheck">{t('access')}</HeadLink>
        <HeadLink to="/audit" icon="ScrollText">{t('audit')}</HeadLink>
        <HeadLink primary to="/users" icon="UserCog">{t('users')}</HeadLink>
      </PageHead>
      <TodayMeetings />
      {sec('dashboard', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Revenue won this year" value={moneyK(wonYear)} icon="CircleDollarSign" />
        <Kpi label="Company pipeline" value={moneyK(sum(open, (d) => d.value))} note={`${open.length} open deals`} icon="Kanban" />
        <Kpi label="Unpaid invoices" value={moneyK(unpaid)} note={`${db.invoices.filter((i) => i.status === 'Overdue').length} overdue`} icon="Receipt" />
        <Kpi label="Active users" value={num(db.users.filter((u) => u.active).length)} note={`${db.teams.length} sales teams`} icon="UsersRound" />
      </div>}
      <div className="g-21" style={{ alignItems: 'start', marginBottom: 14 }}>
        {sec('dashboard', 'revenueTeams') && <Card title="Revenue won by team" sub="Last 12 months"><Bars data={byTeam} series={db.teams.map((x) => ({ key: x.id, name: x.name }))} height={280} /></Card>}
        {sec('dashboard', 'attention') && <Card title="Needs attention">
          {!alerts.length && <Empty icon="ShieldCheck" text="Nothing needs attention." />}
          {alerts.map((a) => (
            <Link key={a.text} to={a.to} className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="kpi-ico" style={{ width: 30, height: 30, background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name={a.icon} size={15} /></span>
              <span className="grow"><strong className="num">{a.n}</strong> {a.text}</span>
              <Icon name="ChevronRight" size={15} color="var(--ink-3)" />
            </Link>
          ))}
        </Card>}
      </div>
      <div className="g3" style={{ alignItems: 'start', marginBottom: 14 }}>
        {sec('dashboard', 'targets') && <Card title="Team targets" action={<SeeAll to="/teams">{t('teams')}</SeeAll>}>
          <div className="stack">
            {db.teams.map((x) => {
              const won = sum(wonIn(deals.filter((d) => teamOf(d.ownerId) === x.id), thisYear()), (d) => d.value);
              const p = x.target ? (won / x.target) * 100 : 0;
              return <div key={x.id}><div className="row between"><span className="strong trunc">{x.name}</span><span className="num small">{moneyK(won)} of {moneyK(x.target)}</span></div><div style={{ marginTop: 5 }}><Progress value={p} /></div><div className="small muted" style={{ marginTop: 3 }}>{pct(p)} · led by {userName(x.managerId)}</div></div>;
            })}
          </div>
        </Card>}
        {sec('dashboard', 'usersCard') && <Card title="Users and access" action={<SeeAll to="/users">Manage</SeeAll>}>
          {roles.map((r) => <div key={r.label} className="dashlet"><span className="grow">{r.label}</span><strong className="num">{r.n}</strong></div>)}
          <div className="dashlet"><span className="grow">Inactive</span><strong className="num">{db.users.filter((u) => !u.active).length}</strong></div>
        </Card>}
        {sec('dashboard', 'operations') && <Card title="Operations">
          <Link to="/orders" className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}><span className="grow">Orders to fulfil</span><strong className="num">{db.orders.filter((o) => ['Pending', 'Processing'].includes(o.status)).length}</strong></Link>
          <Link to="/logistics" className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}><span className="grow">Shipments in transit</span><strong className="num">{db.shipments.filter((s) => s.status === 'In Transit').length}</strong></Link>
          <Link to="/inventory" className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}><span className="grow">Stock value at cost</span><strong className="num">{moneyK(sum(db.products.filter((p) => p.tracked), (p) => p.stock * p.cost))}</strong></Link>
          <Link to="/cases" className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }}><span className="grow">Open support cases</span><strong className="num">{db.cases.filter((c) => !['Closed', 'Rejected'].includes(c.status)).length}</strong></Link>
        </Card>}
      </div>
      {sec('dashboard', 'activity') && <Card title="Recent system activity" action={<SeeAll to="/audit">{t('audit')}</SeeAll>}>
        {db.audit.slice(0, 6).map((a) => (
          <div key={a.id} className="dashlet">
            <Avatar name={userName(a.userId)} size={26} />
            <span className="grow trunc"><strong>{userName(a.userId)}</strong> <span className="muted">{a.action.toLowerCase()}d</span> {a.label}</span>
            <span className="small muted nowrap">{relTime(a.at)}</span>
          </div>
        ))}
      </Card>}
    </div>
  );
}

export default function Dashboard() {
  const { role } = useStore();
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'manager') return <ManagerDashboard />;
  return <SalesDashboard />;
}
