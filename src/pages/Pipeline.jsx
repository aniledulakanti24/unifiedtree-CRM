import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Clock, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { STAGES } from '../seed';
import { Avatar, Badge, Btn, Card, Confirm, DataTable, Empty, FieldInput, ListField, Modal, NoSections, PageHead, Pills, Progress, RecordModal, Stars, Tabs, UserChip, firstAllowed } from '../ui';
import { Bars } from '../charts';
import { ContactActions, personOfContact } from '../comms';
import { ActivityDialog, Chatter, RecordQuickCreate, TransferDialog, dealFields, relatedOf } from '../shared';
import { addDays, fmtDate, fmtShort, groupBy, money, moneyK, sum, today } from '../util';

const PIPE_VIEWS = [{ k: 'kanban', icon: 'Kanban', label: 'Kanban' }, { k: 'reps', icon: 'UsersRound', label: 'By rep' }, { k: 'list', icon: 'List', label: 'List' }, { k: 'graph', icon: 'ChartColumn', label: 'Graph' }];
const stageName = (id) => STAGES.find((s) => s.id === id)?.name;

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

function DealCard({ d, activities, onDragStart, onDragEnd, dragging }) {
  const { update, companyName, userName, role, can } = useStore();
  const next = activities.filter((a) => a.relatedId === d.id && a.status !== 'done').sort((a, b) => a.due.localeCompare(b.due))[0];
  const color = !next ? 'var(--ink-3)' : next.due < today() ? 'var(--bad)' : next.due === today() ? 'var(--warn)' : 'var(--good)';
  return (
    <Link to={`/pipeline/${d.id}`} className={`kb-card ${dragging ? 'drag' : ''}`} draggable={can('pipeline', 'edit')} onDragStart={(e) => { e.dataTransfer.setData('text/plain', d.id); onDragStart(d.id); }} onDragEnd={onDragEnd}>
      <div className="strong" style={{ lineHeight: 1.25 }}>{d.title}</div>
      <div className="small muted trunc">{companyName(d.companyId)}</div>
      <div className="row between"><span className="num strong">{money(d.value)}</span><span className="small muted">{fmtShort(d.closeDate)}</span></div>
      {d.tags?.length > 0 && <div className="row wrap" style={{ gap: 4 }}>{d.tags.map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>)}</div>}
      <div className="row between" style={{ marginTop: 2 }}>
        <span className="row" style={{ gap: 6 }}>
          <Stars value={d.priority} onChange={can('pipeline', 'edit') ? (v) => update('deals', d.id, { priority: v }) : undefined} />
          <span title={next ? `${next.summary}, due ${fmtDate(next.due)}` : 'No activity planned'} style={{ color, lineHeight: 0 }}><Clock size={14} /></span>
        </span>
        {role !== 'sales' && <span title={userName(d.ownerId)} style={{ lineHeight: 0 }}><Avatar name={userName(d.ownerId)} size={22} /></span>}
      </div>
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
    create('deals', { title: title.trim(), companyId, value: Number(value) || 0, stage: stage.id, status: 'open', probability: stage.prob, priority: 0, ownerId: me.id, closeDate: addDays(30), tags: [], source: '', notes: '' });
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
  const { db, moveDeal, toast, role, scope, can } = useStore();
  const [over, setOver] = useState(null);
  const [drag, setDrag] = useState(null);
  const [adding, setAdding] = useState(null);
  const activities = scope(db.activities);
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
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setOver(null); const d = deals.find((x) => x.id === id); if (d && d.stage !== s.id) { moveDeal(id, s.id); toast(s.id === 'won' ? `Won: ${d.title}` : `Moved to ${s.name}`); } }}>
            <div className="kb-head"><span>{s.name}</span><span className="muted num small">{list.length}</span><span className="grow" /><span className="num">{moneyK(total)}</span>
              {s.id !== 'won' && can('pipeline', 'create') && <Btn sm kind="ghost" icon="Plus" aria-label={`Add to ${s.name}`} onClick={() => setAdding(s.id)} style={{ height: 22, width: 22 }} />}
            </div>
            <div className="kb-bar" title={`${planned} planned, ${due} today, ${late} overdue`}>
              <i style={{ width: `${(planned / n) * 100}%`, background: 'var(--good)' }} /><i style={{ width: `${(due / n) * 100}%`, background: 'var(--s4)' }} /><i style={{ width: `${(late / n) * 100}%`, background: 'var(--bad)' }} />
            </div>
            {adding === s.id && <QuickAdd stage={s} onDone={() => setAdding(null)} />}
            {list.map((d) => <DealCard key={d.id} d={d} activities={activities} dragging={drag === d.id} onDragStart={setDrag} onDragEnd={() => setDrag(null)} />)}
            {!list.length && adding !== s.id && <div className="small muted" style={{ textAlign: 'center', padding: 18 }}>Drop opportunities here</div>}
          </div>
        );
      })}
    </div>
  );
}

function RepBoard({ deals }) {
  const { db, scope, assignable } = useStore();
  const activities = scope(db.activities);
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
  const { db, me, role, t, sec, scope, assignable, companyName, can, remove, toast } = useStore();
  const nav = useNavigate();
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
  const filtered = useMemo(() => base.filter((d) => {
    if (owner && d.ownerId !== owner) return false;
    if (q && !`${d.title} ${companyName(d.companyId)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [base, owner, q]);
  // The board shows active deals plus recent wins so the Won column stays readable.
  const board = filtered.filter((d) => d.status === 'open' || (d.status === 'won' && d.closeDate >= recentWon));
  const openOnes = filtered.filter((d) => d.status === 'open');
  const list = status === 'all' ? filtered : filtered.filter((d) => d.status === status);
  return (
    <div>
      <PageHead title={t('pipeline')} sub={`${openOnes.length} open · ${money(sum(openOnes, (d) => d.value))} expected revenue`}>
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
        <div className="grow" />
        <Pills value={view} onChange={setView} options={views} />
      </div>
      {!view && <NoSections />}
      {view === 'kanban' && <Kanban deals={board} />}
      {view === 'reps' && <RepBoard deals={filtered} />}
      {view === 'list' && (
        <div className="stack-s">
          <div><Pills value={status} onChange={setStatus} options={[{ k: 'open', label: 'Open', count: filtered.filter((d) => d.status === 'open').length }, { k: 'won', label: 'Won', count: filtered.filter((d) => d.status === 'won').length }, { k: 'lost', label: 'Lost', count: filtered.filter((d) => d.status === 'lost').length }, { k: 'all', label: 'All', count: filtered.length }]} /></div>
          <DataTable rows={list} exportName="pipeline" onRow={(d) => nav(`/pipeline/${d.id}`)} initialSort={{ k: 'closeDate', dir: 'asc' }}
            bulk={can('pipeline', 'delete') ? (rows, clear) => <Btn sm kind="danger" icon="Trash2" onClick={() => setConfirmDel({ rows, clear })}>Delete</Btn> : undefined}
            columns={[
              { k: 'title', label: 'Opportunity', render: (d) => <span className="strong">{d.title}</span> },
              { k: 'company', label: 'Customer', value: (d) => companyName(d.companyId) },
              { k: 'stage', label: 'Stage', value: (d) => (d.status === 'lost' ? 'Lost' : stageName(d.stage)), render: (d) => <Badge>{d.status === 'lost' ? 'Lost' : stageName(d.stage)}</Badge> },
              { k: 'probability', label: 'Probability', align: 'r', render: (d) => `${d.probability}%` },
              { k: 'value', label: 'Expected', align: 'r', render: (d) => money(d.value) },
              { k: 'closeDate', label: 'Closing', nowrap: true, render: (d) => fmtDate(d.closeDate) },
              { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (d) => d.ownerId, render: (d) => <UserChip id={d.ownerId} /> },
              { k: 'source', label: 'Source', hidden: true },
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
  const { db, role, t, sec, can, update, moveDeal, reopen, remove, toast, companyName, userName, scope, create, me } = useStore();
  const d = db.deals.find((x) => x.id === id);
  const [modal, setModal] = useState(null);
  const [tabPref, setTab] = useState('details');
  if (!d || !scope([d], 'pipeline').length) return <div className="card"><Empty icon="SearchX" text="This opportunity doesn't exist, or it isn't in your book."><Link className="btn" to="/pipeline">Back to pipeline</Link></Empty></div>;
  const canEdit = can('pipeline', 'edit');
  const dealTabs = [{ k: 'details', label: 'Details' }, ...(can('billing') ? [{ k: 'quotes', label: `Quotes (${db.quotes.filter((q) => q.dealId === d.id).length})` }] : []), { k: 'notes', label: 'Internal notes' }].filter((x) => sec('pipeline', x.k));
  const tab = firstAllowed(dealTabs, tabPref);
  const contact = db.contacts.find((c) => c.id === d.contactId);
  const quotes = db.quotes.filter((q) => q.dealId === d.id);
  const related = relatedOf('deal', d);
  const curIdx = STAGES.findIndex((s) => s.id === d.stage);
  const newQuote = () => {
    const q = create('quotes', { number: `QT-${4500 + db.quotes.length}`, dealId: d.id, companyId: d.companyId, ownerId: d.ownerId, date: today(), expiry: addDays(30), items: [], total: d.value, status: 'Draft' });
    toast(`Draft quote ${q.number} created`);
    setTab('quotes');
  };
  return (
    <div className="stack">
      <PageHead title={d.title} crumbs={[t('pipeline'), d.title.split(' · ')[0]]}>
        {contact && <ContactActions person={{ ...personOfContact(contact, companyName(d.companyId)), relatedType: 'deal', relatedId: d.id }} />}
        {canEdit && d.status === 'open' && <Btn kind="good" icon="Trophy" onClick={() => { moveDeal(d.id, 'won'); toast('Marked as won'); }}>Won</Btn>}
        {canEdit && d.status === 'open' && <Btn kind="danger" icon="ThumbsDown" onClick={() => setModal('lost')}>Lost</Btn>}
        {canEdit && d.status !== 'open' && <Btn icon="RotateCcw" onClick={() => { reopen(d.id); toast('Opportunity reopened'); }}>Reopen</Btn>}
        {can('billing', 'create') && <Btn icon="FileText" onClick={newQuote}>New quote</Btn>}
        {can('transfers', 'create') && <Btn icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}
        {canEdit && <Btn icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}
        {can('pipeline', 'delete') && <Btn icon="Trash2" kind="danger" aria-label="Delete" onClick={() => setModal('delete')} />}
      </PageHead>
      {sec('pipeline', 'path') && <div className="path" role="group" aria-label="Stage">
        {STAGES.map((s, i) => {
          const lost = d.status === 'lost' && i === STAGES.length - 1;
          const cls = lost ? 'lost' : d.status !== 'lost' && s.id === d.stage ? 'cur' : d.status !== 'lost' && i < curIdx ? 'done' : '';
          return <button key={s.id} type="button" aria-current={s.id === d.stage ? 'step' : undefined} className={`path-step ${cls}`} disabled={!canEdit} onClick={() => { moveDeal(d.id, s.id); toast(`Moved to ${s.name}`); }}>{lost ? 'Lost' : s.name}</button>;
        })}
      </div>}
      {sec('pipeline', 'highlights') && <div className="card card-b">
        <div className="highlights">
          <div className="hl"><div className="k">Expected revenue</div><div className="v num">{money(d.value)}</div></div>
          <div className="hl"><div className="k">Probability</div><div className="v num">{d.probability}%</div></div>
          <div className="hl"><div className="k">Customer</div><div className="v"><Link to={`/customers/${d.companyId}`}>{companyName(d.companyId)}</Link></div></div>
          <div className="hl"><div className="k">Expected closing</div><div className="v">{fmtDate(d.closeDate)}</div></div>
          <div className="hl"><div className="k">Salesperson</div><div className="v">{userName(d.ownerId)}</div></div>
          <div className="hl"><div className="k">Priority</div><div className="v"><Stars value={d.priority} onChange={can('pipeline', 'edit') ? (v) => update('deals', d.id, { priority: v }) : undefined} /></div></div>
          {d.status === 'lost' && <div className="hl"><div className="k">Lost reason</div><div className="v">{d.lostReason || '—'}</div></div>}
        </div>
      </div>}
      <div className="g-21" style={{ alignItems: 'start' }}>
        {tab && <div className="card card-b">
          <Tabs tabs={dealTabs} value={tab} onChange={setTab} />
          {tab === 'details' && (
            <dl className="dl">
              <dt>Contact</dt><dd>{contact ? `${contact.first} ${contact.last}, ${contact.title}` : '—'}</dd>
              <dt>Email</dt><dd>{contact?.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</dd>
              <dt>Phone</dt><dd>{contact?.phone || '—'}</dd>
              <dt>Source</dt><dd>{d.source || '—'}</dd>
              <dt>Created</dt><dd>{fmtDate(d.createdAt)}</dd>
              <dt>Tags</dt><dd className="row wrap">{d.tags?.length ? d.tags.map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>) : '—'}</dd>
              <dt>Status</dt><dd><Badge>{d.status === 'open' ? 'Open' : d.status === 'won' ? 'Won' : 'Lost'}</Badge></dd>
            </dl>
          )}
          {tab === 'quotes' && (quotes.length ? (
            <table className="table"><thead><tr><th>Number</th><th>Date</th><th>Status</th><th className="r">Total</th></tr></thead><tbody>
              {quotes.map((q) => <tr key={q.id}><td className="strong"><Link to="/billing">{q.number}</Link></td><td>{fmtDate(q.date)}</td><td><Badge>{q.status}</Badge></td><td className="r num">{money(q.total)}</td></tr>)}
            </tbody></table>
          ) : <Empty icon="FileText" text="No quotes yet.">{can('billing', 'create') && <Btn icon="Plus" onClick={newQuote}>Create quote</Btn>}</Empty>)}
          {tab === 'notes' && (
            <textarea className="textarea" rows={7} readOnly={!canEdit} aria-label="Internal notes" defaultValue={d.notes} placeholder="Add notes only your team sees…" onBlur={(e) => { if (e.target.value !== d.notes) { update('deals', d.id, { notes: e.target.value }); toast('Notes saved'); } }} />
          )}
        </div>}
        {sec('pipeline', 'history') && <Chatter related={related} />}
      </div>
      {modal === 'edit' && <RecordModal size="lg" title="Edit opportunity" fields={dealFields(null, { owner: role !== 'sales' })} initial={d} onClose={() => setModal(null)} onSave={(v) => { const { id: _i, ...rest } = v; update('deals', d.id, rest); toast('Opportunity saved'); }} />}
      {modal === 'lost' && <LostDialog deal={d} onClose={() => setModal(null)} />}
      {modal === 'transfer' && <TransferDialog record={related} onClose={() => setModal(null)} />}
      {modal === 'delete' && <Confirm title="Delete opportunity?" text={`“${d.title}” will be removed for everyone.`} onClose={() => setModal(null)} onConfirm={() => { remove('deals', d.id); toast('Deleted'); nav('/pipeline'); }} />}
    </div>
  );
}
