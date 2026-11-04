import React, { useMemo } from 'react';
import { useStore } from '../store';
import { Card, Kpi, PageHead, Progress } from '../ui';
import { Bars } from '../charts';
import { lastMonths, money, moneyK, monthKey, monthLabel, num, pct, sum } from '../util';

export default function Performance() {
  const { db, me, sec, scope, t } = useStore();
  const deals = useMemo(() => scope(db.deals, 'performance'), [db.deals, me.id]);
  const y = String(new Date().getFullYear());
  const won = deals.filter((d) => d.status === 'won');
  const closed = deals.filter((d) => d.status !== 'open');
  const wonYear = sum(won.filter((d) => (d.closeDate || '').startsWith(y)), (d) => d.value);
  const attain = me.target ? (wonYear / me.target) * 100 : 0;
  const months = lastMonths(12);
  const mineDone = scope(db.activities, 'performance').filter((a) => a.status === 'done').length;
  const reasons = Object.entries(deals.filter((d) => d.status === 'lost').reduce((m, d) => { const k = d.lostReason || 'No reason given'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const teammates = db.users.filter((u) => u.teamId === me.teamId && u.active);
  const rank = teammates.map((u) => ({ id: u.id, won: sum(db.deals.filter((d) => d.ownerId === u.id && d.status === 'won' && (d.closeDate || '').startsWith(y)), (d) => d.value) })).sort((a, b) => b.won - a.won).findIndex((x) => x.id === me.id) + 1;
  return (
    <div>
      <PageHead title={t('performance')} sub="Your results this year" />
      {sec('performance', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Won this year" value={moneyK(wonYear)} note={`Target ${moneyK(me.target)}`} icon="Trophy" />
        <Kpi label="Win rate" value={pct(closed.length ? (won.length / closed.length) * 100 : 0)} note={`${won.length} won of ${closed.length} closed`} icon="Target" />
        <Kpi label="Average deal" value={moneyK(sum(won, (d) => d.value) / (won.length || 1))} icon="Handshake" />
        <Kpi label="Team rank" value={rank ? `#${rank}` : '—'} note={`of ${teammates.length} on your team`} icon="Medal" />
      </div>}
      <div className="g-21" style={{ alignItems: 'start' }}>
        {sec('performance', 'revenue') && <Card title="Revenue won" sub="Last 12 months"><Bars data={months.map((m) => ({ label: monthLabel(m), Won: sum(won.filter((d) => monthKey(d.closeDate) === m), (d) => d.value) }))} series={[{ key: 'Won', name: 'Revenue won' }]} /></Card>}
        <div className="stack">
          {sec('performance', 'target') && <Card title="Annual target" sub={`${money(wonYear)} of ${money(me.target)}`}>
            <div className="kpi-value">{pct(attain)}</div>
            <div style={{ marginTop: 8 }}><Progress value={attain} /></div>
            <div className="small muted" style={{ marginTop: 6 }}>{wonYear >= me.target ? 'Target reached.' : `${money(me.target - wonYear)} to go.`}</div>
          </Card>}
          {sec('performance', 'lost') && <Card title="Why I lost deals">
            {!reasons.length && <div className="sub muted">No lost deals.</div>}
            {reasons.map(([k, n]) => <div key={k} className="dashlet"><span className="grow trunc">{k}</span><strong className="num">{num(n)}</strong></div>)}
          </Card>}
          {sec('performance', 'done') && <Card title="Activities completed"><div className="kpi-value">{num(mineDone)}</div></Card>}
        </div>
      </div>
    </div>
  );
}
