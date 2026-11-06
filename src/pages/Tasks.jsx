import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Search } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, Empty, NoSections, PageHead, Pills, firstAllowed } from '../ui';
import { ActivityDialog } from '../shared';
import { addDays, fmtShort, today } from '../util';
import { Bars } from '../charts';

const GROUPS = [['todo', 'To Do'], ['doing', 'In Progress'], ['done', 'Completed']];
const TAG_TONE = { Sales: 'info', Renewal: 'good', Marketing: 'violet', Support: 'warn' };

function linkFor(a) {
  if (a.relatedType === 'deal') return `/pipeline/${a.relatedId}`;
  if (a.relatedType === 'company') return `/customers/${a.relatedId}`;
  if (a.relatedType === 'contact') return `/contacts?open=${a.relatedId}`;
  if (a.relatedType === 'lead') return `/leads?open=${a.relatedId}`;
  return null;
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
function TaskRow({ a, onEdit, onDelete, picked, onPick }) {
  const { update, userName, can, scopeOf } = useStore();
  const late = a.status !== 'done' && a.due < today();
  const to = linkFor(a);
  return (
    <div className={`task-row ${a.status === 'done' ? 'done' : ''}`}>
      {can('tasks', 'edit') && <input type="checkbox" className="task-pick" aria-label={`Select ${a.summary}`} checked={!!picked} onChange={() => onPick(a.id)} />}
      <input type="checkbox" aria-label={`Complete ${a.summary}`} checked={a.status === 'done'} disabled={!can('tasks', 'edit')} onChange={(e) => update('activities', a.id, { status: e.target.checked ? 'done' : 'todo' })} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
      <button type="button" className="grow" disabled={!can('tasks', 'edit')} onClick={() => onEdit(a)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'start', color: 'inherit' }}>
        <div className="task-t strong trunc">{a.priority === 'High' && a.status !== 'done' && <span className="task-high" title="High priority">!</span>}{a.summary}</div>
        {(a.relatedLabel || a.repeat && a.repeat !== 'Never' || a.subtasks?.length > 0) && <div className="small muted trunc">{[a.relatedLabel, a.repeat && a.repeat !== 'Never' ? `Repeats ${a.repeat.toLowerCase()}` : '', a.subtasks?.length ? `${a.subtasks.filter((x) => x.done).length} of ${a.subtasks.length} steps` : ''].filter(Boolean).join(' · ')}</div>}
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
  const views = [{ k: 'list', icon: 'List', label: 'List' }, { k: 'board', icon: 'Kanban', label: 'Board' }, ...(scopeOf('tasks') !== 'own' ? [{ k: 'workload', icon: 'Users', label: 'Workload' }] : [])].filter((v) => sec('tasks', v.k));
  const view = firstAllowed(views, pref);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('due');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [when, setWhen] = useState('');
  const [picked, setPicked] = useState([]);
  const everyone = scope(db.activities);
  const now = today();
  const inWhen = (a) => (when === 'overdue' ? a.status !== 'done' && a.due < now : when === 'today' ? a.status !== 'done' && a.due === now : when === 'week' ? a.status !== 'done' && a.due >= now && a.due <= addDays(7) : true);
  const all = everyone.filter((a) => (!owner || a.ownerId === owner) && inWhen(a));
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const bulk = (patch, text) => { picked.forEach((id) => update('activities', id, patch)); setPicked([]); toast(text); };
  const rows = all.filter((a) => !q || `${a.summary} ${a.relatedLabel} ${userName(a.ownerId)}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === 'due' ? a.due.localeCompare(b.due) : sort === 'priority' ? (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || a.due.localeCompare(b.due) : a.summary.localeCompare(b.summary)));
  const groups = GROUPS.filter(([k]) => tab === 'all' || tab === k);
  return (
    <div>
      <PageHead title={t('tasks')} >
        {can('tasks', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({})}>{scopeOf('tasks') === 'own' ? 'New task' : 'Assign task'}</Btn>}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Pills value={tab} onChange={setTab} options={[{ k: 'all', label: 'All', count: all.length }, ...GROUPS.map(([k, l]) => ({ k, label: l, count: all.filter((a) => a.status === k).length }))]} />
        <Pills value={when} onChange={setWhen} options={[{ k: '', label: 'Any time' }, { k: 'overdue', label: 'Overdue', count: everyone.filter((a) => a.status !== 'done' && a.due < now).length }, { k: 'today', label: 'Today' }, { k: 'week', label: 'Next 7 days' }]} />
        <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search tasks" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select tb-filter" aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value)}><option value="due">Sort by due date</option><option value="priority">Sort by priority</option><option value="name">Sort by name</option></select>
        {scopeOf('tasks') !== 'own' && <select className="select tb-filter" aria-label="Salesperson" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Whole team</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <div className="grow" />
        <Pills value={view} onChange={setView} options={views} />
      </div>
      {!view && <NoSections />}
      {picked.length > 0 && <div className="bulkbar" style={{ marginBottom: 10 }}>{picked.length} selected
        <Btn sm icon="Check" onClick={() => bulk({ status: 'done' }, 'Tasks completed')}>Complete</Btn>
        <Btn sm icon="CalendarClock" onClick={() => bulk({ due: addDays(1) }, 'Moved to tomorrow')}>Tomorrow</Btn>
        {scopeOf('tasks') !== 'own' && <select className="select tb-filter" aria-label="Assign selected to" value="" onChange={(e) => { if (e.target.value) bulk({ ownerId: e.target.value }, `Assigned to ${userName(e.target.value)}`); }}><option value="">Assign to…</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <Btn kind="ghost" sm onClick={() => setPicked([])}>Clear</Btn></div>}
      {view === 'workload' && (() => {
        const rowsW = [...new Set(everyone.map((a) => a.ownerId))].map((id) => { const mine = everyone.filter((a) => a.ownerId === id && a.status !== 'done'); return { id, name: userName(id), open: mine.length, overdue: mine.filter((a) => a.due < now).length, week: mine.filter((a) => a.due >= now && a.due <= addDays(7)).length }; }).sort((a, b) => b.open - a.open);
        return <div className="stack">
          <div className="card card-b"><div className="card-t" style={{ marginBottom: 8 }}>Open tasks by person</div><Bars height={Math.max(180, rowsW.length * 34)} horizontal data={rowsW.map((r) => ({ label: r.name, Overdue: r.overdue, 'Not overdue': r.open - r.overdue }))} series={[{ key: 'Overdue', name: 'Overdue', color: 'var(--bad)' }, { key: 'Not overdue', name: 'Not overdue' }]} /></div>
          <div className="card"><div className="tb-wrap"><table className="table"><thead><tr><th>Person</th><th className="r">Open</th><th className="r">Overdue</th><th className="r">Next 7 days</th></tr></thead><tbody>{rowsW.map((r) => <tr key={r.id} className="clickable" onClick={() => { setOwner(r.id); setView('list'); }}><td className="strong">{r.name}</td><td className="r num">{r.open}</td><td className="r num">{r.overdue}</td><td className="r num">{r.week}</td></tr>)}</tbody></table></div></div>
        </div>;
      })()}
      {view === 'list' && (
        <div className="stack">
          {groups.map(([k, label]) => {
            const list = rows.filter((a) => a.status === k);
            return (
              <section key={k} className="stack-s">
                <div className="row"><h2 className="card-t">{label}</h2><Badge tone="muted" dot={false}>{list.length}</Badge></div>
                {list.map((a) => <TaskRow key={a.id} a={a} onEdit={setEdit} onDelete={setDel} picked={picked.includes(a.id)} onPick={togglePick} />)}
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
