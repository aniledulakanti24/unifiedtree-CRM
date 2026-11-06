import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Clock, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, Confirm, DataTable, Empty, FieldInput, Icon, ListField, Modal, NoSections, PageHead, Pills, Progress, RecordModal, Stars, Tabs, UserChip, firstAllowed } from '../ui';
import { Bars } from '../charts';
import { ContactActions, personOfContact } from '../comms';
import { categoryOf } from '../forecast';
import { RequestButton } from './OpsExtras';
import { docColumns, ActivityDialog, Chatter, NotifyButton, RecordQuickCreate, TransferDialog, dealFields, relatedOf } from '../shared';
import { CustomValues, DealAssistant, Journey } from '../extras';
import { NO_RATE, addDays, dealFromForm, dealToForm, docMoney, fmtDate, fmtShort, groupBy, money, moneyK, rateOf, sum, today } from '../util';
import { DateRange, inRange, useDateRange } from '../dateRange';
import { daysInStage, nextActivity } from '../engine';
import { dealScore } from '../assistant';
import { DealPeople, DealProducts, NextStep, StageHistory, useStageMove } from './DealParts';

const PIPE_VIEWS = [{ k: 'kanban', icon: 'Kanban', label: 'Kanban' }, { k: 'reps', icon: 'UsersRound', label: 'By rep' }, { k: 'list', icon: 'List', label: 'List' }, { k: 'graph', icon: 'ChartColumn', label: 'Graph' }];

export function LostDialog({ deal, onClose }) {
  const { db, can, create, markLost, toast } = useStore();
  const [reason, setReason] = useState('');
  const required = db.settings.requireLostReason;
  return (
    <Modal size="sm" title="Mark as lost" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" disabled={required && !reason} onClick={() => { markLost(deal.id, reason); toast('Opportunity marked as lost'); onClose(); }}>Mark as lost</Btn></>}>
      <div className="field">
        <label className="label">Lost reason{required && <span className="req"> *</span>}</label>
        <ListField f={{ k: 'reason', label: 'Lost reason', type: 'select', blankLabel: 'Select a reason…', options: db.lostReasons.map((r) => r.name), onAdd: can('options', 'add') ? (name) => { create('lostReasons', { name }); return name; } : undefined }} value={reason} onChange={(_, x) => setReason(x)} />
        <span className="hint">Reasons feed Pipeline Analysis.</span>
      </div>
    </Modal>
  );
}

function DealCard({ d, activities, onDragStart, onDragEnd, dragging, onMove }) {
  const { db, update, companyName, userName, role, can } = useStore();
  const next = nextActivity(d.id, activities);
  const color = !next ? 'var(--bad)' : next.due < today() ? 'var(--bad)' : next.due === today() ? 'var(--warn)' : 'var(--good)';
  const days = daysInStage(d);
  const stuck = d.status === 'open' && days >= (db.settings.staleDays ?? 14);
  const score = db.settings.aiDealScore === false ? null : dealScore(db, d)?.score;
  return (
    <Link to={`/pipeline/${d.id}`} className={`kb-card ${dragging ? 'drag' : ''} ${stuck ? 'stuck' : ''}`} draggable={can('pipeline', 'edit')} onDragStart={(e) => { e.dataTransfer.setData('text/plain', d.id); onDragStart(d.id); }} onDragEnd={onDragEnd}>
      <div className="strong" style={{ lineHeight: 1.25 }}>{d.title}</div>
      <div className="small muted trunc">{companyName(d.companyId)}</div>
      <div className="row between"><span className="num strong">{docMoney(d, d.value)}</span><span className="small muted">{fmtShort(d.closeDate)}</span></div>
      {d.tags?.length > 0 && <div className="row wrap" style={{ gap: 4 }}>{d.tags.map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>)}</div>}
      <div className="kb-next small" title={next ? `Due ${fmtDate(next.due)}` : 'No next step planned'} style={{ color }}><Clock size={13} style={{ flexShrink: 0 }} /><span className="trunc">{next ? next.summary : 'No next step'}</span></div>
      <div className="row between" style={{ marginTop: 2 }}>
        <span className="row" style={{ gap: 6 }}>
          <Stars value={d.priority} onChange={can('pipeline', 'edit') ? (v) => update('deals', d.id, { priority: v }) : undefined} />
          {d.status === 'open' && <span className={`small num ${stuck ? 'kb-stuck' : 'muted'}`} title={`${days} days in this stage`}>{days}d</span>}
          {score != null && <span className="small num muted" title="Win chance">{score}%</span>}
        </span>
        {role !== 'sales' && <span title={userName(d.ownerId)} style={{ lineHeight: 0 }}><Avatar name={userName(d.ownerId)} size={22} /></span>}
      </div>
      {onMove && can('pipeline', 'edit') && <select className="select kb-move" aria-label={`Move ${d.title} to another stage`} value={d.stage} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onChange={(e) => onMove(d, e.target.value)}>{db.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    </Link>
  );
}
function QuickAdd({ stage, onDone }) {
  const { me, create, toast } = useStore();
  const [title, setTitle] = useState('');
  const [companyId, setCompany] = useState('');
  const [value, setValue] = useState('');
  const { db } = useStore();
  const add = (e) => {
    e.preventDefault();
    if (!title.trim() || !companyId) return;
    create('deals', { ...dealFromForm({ value }, null, db.companies.find((c) => c.id === companyId)), title: title.trim(), companyId, stage: stage.id, status: 'open', probability: stage.prob, priority: 0, ownerId: me.id, closeDate: addDays(30), tags: [], source: '', notes: '' });
    toast('Opportunity added'); onDone();
  };
  return (
    <form className="kb-card" style={{ cursor: 'default' }} onSubmit={add}>
      <input className="input" autoFocus aria-label="Opportunity name" placeholder="Opportunity name" value={title} onChange={(e) => setTitle(e.target.value)} />
      <FieldInput f={{ k: 'companyId', label: 'Customer', ariaLabel: 'Customer', type: 'company', blankLabel: 'Customer…' }} value={companyId} onChange={(_, x) => setCompany(x)} />
      <input className="input" aria-label="Expected revenue" type="number" min="0" placeholder="Expected revenue" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="row"><button className="btn primary sm" type="submit" disabled={!title.trim() || !companyId}>Add</button><Btn sm kind="ghost" onClick={onDone}>Discard</Btn></div>
    </form>
  );
}
function Kanban({ deals }) {
  const { db, scope, can } = useStore();
  const { tryMove, gateView } = useStageMove();
  const [losing, setLosing] = useState(null);
  const STAGES = db.stages;
  const [over, setOver] = useState(null);
  const [drag, setDrag] = useState(null);
  const [adding, setAdding] = useState(null);
  const activities = scope(db.activities, 'pipeline');
  const by = groupBy(deals, (d) => d.stage);
  return (
    <div className="kanban">
      {STAGES.map((s) => {
        const list = by[s.id] || [];
        const total = sum(list, (d) => d.value);
        const open = list.map((d) => activities.filter((a) => a.relatedId === d.id && a.status !== 'done').sort((a, b) => a.due.localeCompare(b.due))[0]);
        const n = list.length || 1;
        const planned = open.filter((a) => a && a.due > today()).length;
        const due = open.filter((a) => a && a.due === today()).length;
        const late = open.filter((a) => a && a.due < today()).length;
        return (
          <div key={s.id} className={`kb-col ${over === s.id ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setOver(null); const d = deals.find((x) => x.id === id); if (d && d.stage !== s.id) tryMove(d, s.id); }}>
            <div className="kb-head"><span>{s.name}</span><span className="muted num small">{list.length}</span><span className="grow" /><span className="num" title={`${moneyK(sum(list, (d) => (d.value * d.probability) / 100))} after probability`}>{moneyK(total)}</span>
              {s.id !== 'won' && can('pipeline', 'create') && <Btn sm kind="ghost" icon="Plus" aria-label={`Add to ${s.name}`} onClick={() => setAdding(s.id)} style={{ height: 22, width: 22 }} />}
            </div>
            <div className="kb-bar" title={`${planned} planned, ${due} today, ${late} overdue`}>
              <i style={{ width: `${(planned / n) * 100}%`, background: 'var(--good)' }} /><i style={{ width: `${(due / n) * 100}%`, background: 'var(--s4)' }} /><i style={{ width: `${(late / n) * 100}%`, background: 'var(--bad)' }} />
            </div>
            {adding === s.id && <QuickAdd stage={s} onDone={() => setAdding(null)} />}
            {list.map((d) => <DealCard key={d.id} d={d} activities={activities} dragging={drag === d.id} onDragStart={setDrag} onDragEnd={() => setDrag(null)} onMove={tryMove} />)}
            {!list.length && adding !== s.id && <div className="small muted" style={{ textAlign: 'center', padding: 18 }}>Drop opportunities here</div>}
          </div>
        );
      })}
      {drag && (
        <div className={`kb-col kb-lost ${over === 'lost' ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver('lost'); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); setLosing(deals.find((x) => x.id === e.dataTransfer.getData('text/plain')) || null); }}>
          <Icon name="ThumbsDown" size={18} /><span className="strong">Drop here to mark as lost</span>
        </div>
      )}
      {gateView}
      {losing && <LostDialog deal={losing} onClose={() => setLosing(null)} />}
    </div>
  );
}

function RepBoard({ deals }) {
  const { db, scope, assignable } = useStore();
  const activities = scope(db.activities, 'pipeline');
  const open = deals.filter((d) => d.status === 'open');
  return (
    <div className="kanban">
      {assignable().map((u) => {
        const list = open.filter((d) => d.ownerId === u.id).sort((a, b) => b.value - a.value);
        return (
          <div key={u.id} className="kb-col">
            <div className="kb-head"><Avatar name={u.name} size={22} /><span className="trunc">{u.name}</span><span className="muted num small">{list.length}</span><span className="grow" /><span className="num">{moneyK(sum(list, (d) => d.value))}</span></div>
            {list.map((d) => <DealCard key={d.id} d={d} activities={activities} onDragStart={() => {}} onDragEnd={() => {}} />)}
            {!list.length && <div className="small muted" style={{ textAlign: 'center', padding: 18 }}>No open deals</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Pipeline() {
  const { db, me, role, t, sec, scope, assignable, companyName, can, remove, update, moveDeal, optionsOf, toast } = useStore();
  const STAGES = db.stages;
  const stageName = (id) => db.stages.find((s) => s.id === id)?.name;
  const nav = useNavigate();
  const [quick, setQuick] = useState('all');
  const [pipe, setPipe] = useState('');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');
  const [closing, setClosing] = useDateRange();
  const [pref, setView] = useState('kanban');
  const views = PIPE_VIEWS.filter((v) => sec('pipeline', v.k));
  const view = firstAllowed(views, pref);
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('open');
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const base = useMemo(() => scope(db.deals), [db.deals, me.id]);
  const recentWon = addDays(-60);
  const allActivities = useMemo(() => scope(db.activities, 'pipeline'), [db.activities, me.id]);
  const filtered = useMemo(() => base.filter((d) => {
    if (owner && d.ownerId !== owner) return false;
    if (q && !`${d.title} ${companyName(d.companyId)}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (pipe && (d.pipeline || 'New business') !== pipe) return false;
    if (source && d.source !== source) return false;
    if (tag && !d.tags?.includes(tag)) return false;
    if (!inRange(d.closeDate, closing)) return false;
    if (quick === 'mine' && d.ownerId !== me.id) return false;
    if (quick === 'stuck' && !(d.status === 'open' && daysInStage(d) >= (db.settings.staleDays ?? 14))) return false;
    if (quick === 'nostep' && !(d.status === 'open' && !nextActivity(d.id, allActivities))) return false;
    if (quick === 'late' && !(d.status === 'open' && d.closeDate < today())) return false;
    return true;
  }), [base, owner, q, pipe, source, tag, closing, quick, allActivities]);
  const filtering = q || owner || pipe || source || tag || closing.from || quick !== 'all';
  const clearFilters = () => { setQ(''); setOwner(''); setPipe(''); setSource(''); setTag(''); setClosing({ preset: 'All time', from: '', to: '' }); setQuick('all'); };
  const tags = [...new Set(base.flatMap((d) => d.tags || []))].sort();
  // The board shows active deals plus recent wins so the Won column stays readable.
  const board = filtered.filter((d) => d.status === 'open' || (d.status === 'won' && d.closeDate >= recentWon));
  const openOnes = filtered.filter((d) => d.status === 'open');
  const list = status === 'all' ? filtered : filtered.filter((d) => d.status === status);
  return (
    <div>
      <PageHead title={t('pipeline')} sub={`${openOnes.length} open · ${money(sum(openOnes, (d) => d.value))} expected · ${money(sum(openOnes, (d) => (d.value * d.probability) / 100))} after probability`}>
        {can('pipeline', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setCreating(true)}>New opportunity</Btn>}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search pipeline" placeholder="Search opportunities…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {role !== 'sales' && (
          <select className="select tb-filter" aria-label="Salesperson" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All salespeople</option>
            {assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select className="select tb-filter" aria-label="Pipeline" value={pipe} onChange={(e) => setPipe(e.target.value)}><option value="">All pipelines</option>{optionsOf('dealPipeline').map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select className="select tb-filter" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{optionsOf('leadSource').map((x) => <option key={x} value={x}>{x}</option>)}</select>
        {tags.length > 0 && <select className="select tb-filter" aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{tags.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
        <DateRange value={closing} onChange={setClosing} allowAll />
        <div className="grow" />
        <Pills value={view} onChange={setView} options={views} />
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Pills value={quick} onChange={setQuick} options={[{ k: 'all', label: 'All deals' }, ...(role !== 'sales' ? [{ k: 'mine', label: 'My deals' }] : []), { k: 'stuck', label: 'Stuck' }, { k: 'nostep', label: 'No next step' }, { k: 'late', label: 'Past closing date' }]} />
        {filtering && <button type="button" className="btn ghost" onClick={clearFilters}><Icon name="X" size={15} />Clear filters</button>}
      </div>
      {!view && <NoSections />}
      {view === 'kanban' && <Kanban deals={board} />}
      {view === 'reps' && <RepBoard deals={filtered} />}
      {view === 'list' && (
        <div className="stack-s">
          <div><Pills value={status} onChange={setStatus} options={[{ k: 'open', label: 'Open', count: filtered.filter((d) => d.status === 'open').length }, { k: 'won', label: 'Won', count: filtered.filter((d) => d.status === 'won').length }, { k: 'lost', label: 'Lost', count: filtered.filter((d) => d.status === 'lost').length }, { k: 'all', label: 'All', count: filtered.length }]} /></div>
          <DataTable rows={list} exportName="pipeline" noSearch onRow={(d) => nav(`/pipeline/${d.id}`)} initialSort={{ k: 'closeDate', dir: 'asc' }}
            bulk={can('pipeline', 'edit') || can('pipeline', 'delete') ? (rows, clear) => <>
              {can('pipeline', 'edit') && <select className="select tb-filter" style={{ height: 30 }} aria-label="Move selected to stage" value="" onChange={(e) => { if (!e.target.value) return; rows.filter((r) => r.status === 'open').forEach((r) => moveDeal(r.id, e.target.value)); clear(); toast('Stage updated'); }}><option value="">Move to stage…</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
              {can('pipeline', 'edit') && role !== 'sales' && <select className="select tb-filter" style={{ height: 30 }} aria-label="Assign selected to" value="" onChange={(e) => { if (!e.target.value) return; rows.forEach((r) => update('deals', r.id, { ownerId: e.target.value }, 'Transfer')); clear(); toast('Deals assigned'); }}><option value="">Assign to…</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
              {can('pipeline', 'delete') && <Btn sm kind="danger" icon="Trash2" onClick={() => setConfirmDel({ rows, clear })}>Delete</Btn>}
            </> : undefined}
            columns={[
              { k: 'title', label: 'Opportunity', render: (d) => <span className="strong">{d.title}</span> },
              { k: 'company', label: 'Customer', value: (d) => companyName(d.companyId) },
              { k: 'stage', label: 'Stage', value: (d) => (d.status === 'lost' ? 'Lost' : stageName(d.stage)), render: (d) => <Badge>{d.status === 'lost' ? 'Lost' : stageName(d.stage)}</Badge> },
              { k: 'probability', label: 'Probability', align: 'r', render: (d) => `${d.probability}%` },
              { k: 'value', label: 'Expected', align: 'r', render: (d) => docMoney(d, d.value) }, ...docColumns((d) => d.value),
              { k: 'closeDate', label: 'Closing', nowrap: true, render: (d) => fmtDate(d.closeDate) },
              { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (d) => d.ownerId, render: (d) => <UserChip id={d.ownerId} /> },
              { k: 'win', label: 'Win chance', align: 'r', omit: db.settings.aiDealScore === false, value: (d) => dealScore(db, d)?.score ?? '', render: (d) => { const x = dealScore(db, d); return x ? `${x.score}%` : '—'; } },
              { k: 'inStage', label: 'Days in stage', align: 'r', value: (d) => (d.status === 'open' ? daysInStage(d) : '') },
              { k: 'nextStep', label: 'Next step', value: (d) => nextActivity(d.id, allActivities)?.summary || (d.status === 'open' ? 'None' : '') },
              { k: 'source', label: 'Source', hidden: true },
              { k: 'competitor', label: 'Competitor', hidden: true },
              { k: 'lostReason', label: 'Lost reason', hidden: true },
            ]} />
        </div>
      )}
      {view === 'graph' && (
        <Card title="Expected revenue by stage" sub={`${openOnes.length} open opportunities`}>
          <Bars height={340} data={STAGES.filter((s) => s.id !== 'won').map((s) => ({ label: s.name, Value: sum(openOnes.filter((d) => d.stage === s.id), (d) => d.value), Weighted: sum(openOnes.filter((d) => d.stage === s.id), (d) => (d.value * d.probability) / 100) }))} series={[{ key: 'Value', name: 'Expected revenue' }, { key: 'Weighted', name: 'Weighted revenue' }]} />
        </Card>
      )}
      {creating && <RecordQuickCreate kind="deal" onClose={() => setCreating(false)} />}
      {confirmDel && <Confirm title={`Delete ${confirmDel.rows.length} opportunities?`} text="They'll be removed for everyone. The audit log keeps a record of the deletion." onClose={() => setConfirmDel(null)} onConfirm={() => { confirmDel.rows.forEach((r) => remove('deals', r.id)); confirmDel.clear(); toast('Deleted'); }} />}
    </div>
  );
}

export function DealRecord() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, role, t, sec, can, update, reopen, remove, toast, companyName, userName, scope, create, formFields, opsReadOnly } = useStore();
  const STAGES = db.stages;
  const { tryMove, gateView } = useStageMove();
  const d = db.deals.find((x) => x.id === id);
  const [modal, setModal] = useState(null);
  const [tabPref, setTab] = useState('details');
  if (!d || !scope([d], 'pipeline').length) return <div className="card"><Empty icon="SearchX" text="This opportunity doesn't exist, or it isn't in your book."><Link className="btn" to="/pipeline">Back to pipeline</Link></Empty></div>;
  const canEdit = can('pipeline', 'edit');
  const dealTabs = [{ k: 'details', label: 'Details' }, { k: 'people', label: `People (${new Set([d.contactId, ...(d.people || []).map((p) => p.contactId)].filter(Boolean)).size})` }, { k: 'products', label: `Products (${(d.items || []).length})` }, ...(can('billing') ? [{ k: 'quotes', label: `Quotes (${db.quotes.filter((q) => q.dealId === d.id).length})` }] : []), { k: 'stagelog', label: 'Stage history' }, { k: 'notes', label: 'Internal notes' }].filter((x) => sec('pipeline', x.k));
  const tab = firstAllowed(dealTabs, tabPref);
  const contact = db.contacts.find((c) => c.id === d.contactId);
  const quotes = db.quotes.filter((q) => q.dealId === d.id);
  const related = relatedOf('deal', d);
  const curIdx = STAGES.findIndex((s) => s.id === d.stage);
  const newQuote = () => {
    const q = create('quotes', { number: `QT-${4500 + db.quotes.length}`, currency: d.currency || '', fxRate: d.fxRate || 1, dealId: d.id, companyId: d.companyId, ownerId: d.ownerId, date: today(), expiry: addDays(30), items: d.items || [], total: d.items?.length ? sum(d.items, (x) => x.qty * x.price) : d.value, status: 'Draft' });
    toast(`Draft quote ${q.number} created`);
    setTab('quotes');
  };
  return (
    <div className="stack">
      <PageHead title={d.title} crumbs={[t('pipeline'), d.title.split(' · ')[0]]}>
        {contact && <ContactActions person={{ ...personOfContact(contact, companyName(d.companyId)), relatedType: 'deal', relatedId: d.id }} />}
        {canEdit && d.status === 'open' && <Btn kind="good" icon="Trophy" onClick={() => tryMove(d, 'won')}>Won</Btn>}
        {canEdit && d.status === 'open' && <Btn kind="danger" icon="ThumbsDown" onClick={() => setModal('lost')}>Lost</Btn>}
        {canEdit && d.status !== 'open' && <Btn icon="RotateCcw" onClick={() => { reopen(d.id); toast('Opportunity reopened'); }}>Reopen</Btn>}
        {opsReadOnly && <RequestButton area="billing" type="quote" record={{ entity: 'deals', id: d.id, label: d.title, route: `/pipeline/${d.id}`, companyId: d.companyId }} icon="FileText" label="Ask for a quote" link="/pipeline" message={`Please prepare a quote for ${d.title} (${companyName(d.companyId)}).`} />}
        {can('billing', 'create') && <Btn icon="FileText" onClick={newQuote}>New quote</Btn>}
        {can('transfers', 'create') && <Btn icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}
        {canEdit && <Btn icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}
        {can('pipeline', 'create') && <Btn icon="Copy" onClick={() => { const { id: _x, stageLog: _l, ...rest } = d; const copy = create('deals', { ...rest, title: `${d.title} (copy)`, status: 'open', stage: db.stages[0].id, probability: db.stages[0].prob, stageAt: new Date().toISOString(), closeDate: addDays(30), lostReason: '' }); toast('Copy created'); nav(`/pipeline/${copy.id}`); }}>Duplicate</Btn>}
        {can('pipeline', 'delete') && <Btn icon="Trash2" kind="danger" aria-label="Delete" onClick={() => setModal('delete')} />}
      </PageHead>
      {sec('pipeline', 'path') && <div className="path" role="group" aria-label="Stage">
        {STAGES.map((s, i) => {
          const lost = d.status === 'lost' && i === STAGES.length - 1;
          const cls = lost ? 'lost' : d.status !== 'lost' && s.id === d.stage ? 'cur' : d.status !== 'lost' && i < curIdx ? 'done' : '';
          return <button key={s.id} type="button" aria-current={s.id === d.stage ? 'step' : undefined} className={`path-step ${cls}`} disabled={!canEdit} onClick={() => tryMove(d, s.id)}>{lost ? 'Lost' : s.name}</button>;
        })}
      </div>}
      {sec('pipeline', 'highlights') && <div className="card card-b">
        <div className="highlights">
          <div className="hl"><div className="k">Forecast</div><div className="v">{categoryOf(d)}</div></div>
          <div className="hl"><div className="k">Expected revenue</div><div className="v num">{docMoney(d, d.value)}</div>{d.currency && d.currency !== db.settings.currency && <div className="small muted num">{money(d.value)}</div>}</div>
          <div className="hl"><div className="k">Probability</div><div className="v num">{d.probability}%</div></div>
          <div className="hl"><div className="k">Customer</div><div className="v"><Link to={`/customers/${d.companyId}`}>{companyName(d.companyId)}</Link></div></div>
          <div className="hl"><div className="k">Expected closing</div><div className="v">{fmtDate(d.closeDate)}</div></div>
          <div className="hl"><div className="k">Salesperson</div><div className="v">{userName(d.ownerId)}</div></div>
          <div className="hl"><div className="k">Priority</div><div className="v"><Stars value={d.priority} onChange={can('pipeline', 'edit') ? (v) => update('deals', d.id, { priority: v }) : undefined} /></div></div>
          {d.status === 'lost' && <div className="hl"><div className="k">Lost reason</div><div className="v">{d.lostReason || '—'}</div></div>}
        </div>
      </div>}
      <NextStep deal={d} />
      <div className="g2" style={{ alignItems: 'start' }}><DealAssistant deal={d} /><Journey companyId={d.companyId} dealId={d.id} /></div>
      <div className="g-21" style={{ alignItems: 'start' }}>
        {tab && <div className="card card-b">
          <Tabs tabs={dealTabs} value={tab} onChange={setTab} />
          {tab === 'details' && (
            <dl className="dl">
              <dt>Contact</dt><dd>{contact ? `${contact.first} ${contact.last}, ${contact.title}` : '—'}</dd>
              <dt>Email</dt><dd>{contact?.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</dd>
              <dt>Phone</dt><dd>{contact?.phone || '—'}</dd>
              <dt>Source</dt><dd>{d.source || '—'}</dd>
              <dt>Pipeline</dt><dd>{d.pipeline || 'New business'}</dd>
              <dt>Competing against</dt><dd>{d.competitor || '—'}</dd>
              <dt>Days in this stage</dt><dd className="num">{d.status === 'open' ? daysInStage(d) : '—'}</dd>
              <dt>Created</dt><dd>{fmtDate(d.createdAt)}</dd>
              <dt>Tags</dt><dd className="row wrap">{d.tags?.length ? d.tags.map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>) : '—'}</dd>
              <dt>Status</dt><dd><Badge>{d.status === 'open' ? 'Open' : d.status === 'won' ? 'Won' : 'Lost'}</Badge></dd>
              <CustomValues kind="deal" record={d} />
            </dl>
          )}
          {tab === 'people' && <DealPeople deal={d} canEdit={canEdit} />}
          {tab === 'products' && <DealProducts deal={d} canEdit={canEdit} />}
          {tab === 'stagelog' && <StageHistory deal={d} />}
          {tab === 'quotes' && (quotes.length ? (
            <table className="table"><thead><tr><th>Number</th><th>Date</th><th>Status</th><th className="r">Total</th></tr></thead><tbody>
              {quotes.map((q) => <tr key={q.id}><td className="strong"><Link to="/billing">{q.number}</Link></td><td>{fmtDate(q.date)}</td><td><Badge>{q.status}</Badge></td><td className="r num">{docMoney(q, q.total)}</td></tr>)}
            </tbody></table>
          ) : <Empty icon="FileText" text="No quotes yet.">{can('billing', 'create') && <Btn icon="Plus" onClick={newQuote}>Create quote</Btn>}</Empty>)}
          {tab === 'notes' && (
            <textarea className="textarea" rows={7} readOnly={!canEdit} aria-label="Internal notes" defaultValue={d.notes} placeholder="Add notes only your team sees…" onBlur={(e) => { if (e.target.value !== d.notes) { update('deals', d.id, { notes: e.target.value }); toast('Notes saved'); } }} />
          )}
        </div>}
        {sec('pipeline', 'history') && <Chatter related={related} />}
      </div>
      {modal === 'edit' && <RecordModal size="lg" title="Edit opportunity" fields={formFields('deal', dealFields(null, { owner: role !== 'sales' }))} initial={dealToForm(d)} check={(v) => (rateOf(v.currency || db.companies.find((c) => c.id === v.companyId)?.currency) ? {} : { currency: NO_RATE })} onClose={() => setModal(null)} onSave={(v) => { const { id: _i, ...rest } = dealFromForm(v, d, db.companies.find((c) => c.id === v.companyId)); update('deals', d.id, rest); toast('Opportunity saved'); }} />}
      {gateView}
      {modal === 'lost' && <LostDialog deal={d} onClose={() => setModal(null)} />}
      {modal === 'transfer' && <TransferDialog record={related} onClose={() => setModal(null)} />}
      {modal === 'delete' && <Confirm title="Delete opportunity?" text={`“${d.title}” will be removed for everyone.`} onClose={() => setModal(null)} onConfirm={() => { remove('deals', d.id); toast('Deleted'); nav('/pipeline'); }} />}
    </div>
  );
}
