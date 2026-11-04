import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Search } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, Empty, NoSections, PageHead, Pills, firstAllowed } from '../ui';
import { ActivityDialog } from '../shared';
import { fmtShort, today } from '../util';

const GROUPS = [['todo', 'To Do'], ['doing', 'In Progress'], ['done', 'Completed']];
const TAG_TONE = { Sales: 'info', Renewal: 'good', Marketing: 'violet', Support: 'warn' };

function linkFor(a) {
  if (a.relatedType === 'deal') return `/pipeline/${a.relatedId}`;
  if (a.relatedType === 'company') return `/customers/${a.relatedId}`;
  if (a.relatedType === 'contact') return `/contacts?open=${a.relatedId}`;
  if (a.relatedType === 'lead') return `/leads?open=${a.relatedId}`;
  return null;
}

function TaskRow({ a, onEdit, onDelete }) {
  const { update, userName, can, scopeOf } = useStore();
  const late = a.status !== 'done' && a.due < today();
  const to = linkFor(a);
  return (
    <div className={`task-row ${a.status === 'done' ? 'done' : ''}`}>
      <input type="checkbox" aria-label={`Complete ${a.summary}`} checked={a.status === 'done'} disabled={!can('tasks', 'edit')} onChange={(e) => update('activities', a.id, { status: e.target.checked ? 'done' : 'todo' })} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
      <button type="button" className="grow" disabled={!can('tasks', 'edit')} onClick={() => onEdit(a)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'start', color: 'inherit' }}>
        <div className="task-t strong trunc">{a.summary}</div>
        {a.relatedLabel && <div className="small muted trunc">{a.relatedLabel}</div>}
      </button>
      {to && <Link to={to} className="small nowrap" aria-label="Open related record">Open</Link>}
      <Badge tone={TAG_TONE[a.tag] || 'muted'} dot={false}>{a.tag || 'General'}</Badge>
      <span className="small nowrap row" style={{ gap: 4, color: late ? 'var(--bad)' : 'var(--ink-3)' }}><CalendarDays size={13} />{late ? 'Overdue, ' : ''}{fmtShort(a.due)}</span>
      {scopeOf('tasks') !== 'own' && <Avatar name={userName(a.ownerId)} size={24} />}
      {can('tasks', 'delete') && <Btn sm kind="ghost" icon="Trash2" aria-label="Delete task" onClick={() => onDelete(a)} />}
    </div>
  );
}

export default function Tasks() {
  const { db, can, sec, scopeOf, t, assignable, scope, remove, update, toast, userName } = useStore();
  const [owner, setOwner] = useState('');
  const [tab, setTab] = useState('all');
  const [pref, setView] = useState('list');
  const views = [{ k: 'list', icon: 'List', label: 'List' }, { k: 'board', icon: 'Kanban', label: 'Board' }].filter((v) => sec('tasks', v.k));
  const view = firstAllowed(views, pref);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('due');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [drag, setDrag] = useState(null);
  const all = scope(db.activities).filter((a) => !owner || a.ownerId === owner);
  const rows = all.filter((a) => !q || `${a.summary} ${a.relatedLabel} ${userName(a.ownerId)}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === 'due' ? a.due.localeCompare(b.due) : a.summary.localeCompare(b.summary)));
  const groups = GROUPS.filter(([k]) => tab === 'all' || tab === k);
  return (
    <div>
      <PageHead title={t('tasks')} >
        {can('tasks', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({})}>{scopeOf('tasks') === 'own' ? 'New task' : 'Assign task'}</Btn>}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Pills value={tab} onChange={setTab} options={[{ k: 'all', label: 'All', count: all.length }, ...GROUPS.map(([k, l]) => ({ k, label: l, count: all.filter((a) => a.status === k).length }))]} />
        <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search tasks" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select tb-filter" aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value)}><option value="due">Sort by due date</option><option value="name">Sort by name</option></select>
        {scopeOf('tasks') !== 'own' && <select className="select tb-filter" aria-label="Salesperson" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Whole team</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <div className="grow" />
        <Pills value={view} onChange={setView} options={views} />
      </div>
      {!view && <NoSections />}
      {view === 'list' && (
        <div className="stack">
          {groups.map(([k, label]) => {
            const list = rows.filter((a) => a.status === k);
            return (
              <section key={k} className="stack-s">
                <div className="row"><h2 className="card-t">{label}</h2><Badge tone="muted" dot={false}>{list.length}</Badge></div>
                {list.map((a) => <TaskRow key={a.id} a={a} onEdit={setEdit} onDelete={setDel} />)}
                {!list.length && <div className="sub muted">Nothing here.</div>}
              </section>
            );
          })}
        </div>
      )}
      {view === 'board' && (
        <div className="kanban">
          {groups.map(([k, label]) => {
            const list = rows.filter((a) => a.status === k);
            return (
              <div key={k} className="kb-col" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) { update('activities', drag, { status: k }); setDrag(null); toast(`Moved to ${label}`); } }}>
                <div className="kb-head">{label}<span className="muted small num">{list.length}</span></div>
                {list.map((a) => (
                  <div key={a.id} className="kb-card" draggable={can('tasks', 'edit')} onDragStart={() => setDrag(a.id)} onClick={() => { if (can('tasks', 'edit')) setEdit(a); }}>
                    <div className="strong">{a.summary}</div>
                    {a.relatedLabel && <div className="small muted trunc">{a.relatedLabel}</div>}
                    <div className="row between"><Badge tone={TAG_TONE[a.tag] || 'muted'} dot={false}>{a.tag || 'General'}</Badge><span className="small" style={{ color: a.status !== 'done' && a.due < today() ? 'var(--bad)' : 'var(--ink-3)' }}>{fmtShort(a.due)}</span></div>
                  </div>
                ))}
                {!list.length && <Empty icon="Inbox" text="Drop tasks here" />}
              </div>
            );
          })}
        </div>
      )}
      {edit && <ActivityDialog initial={edit.id ? edit : undefined} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete task?" text={`“${del.summary}” will be removed.`} onClose={() => setDel(null)} onConfirm={() => { remove('activities', del.id); toast('Task deleted'); }} />}
    </div>
  );
}
