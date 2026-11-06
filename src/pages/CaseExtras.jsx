import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Empty, Kpi, Modal, Pills, RecordModal, UserChip } from '../ui';
import { Bars } from '../charts';
import { SLA_DEFAULT, SLA_TONE, articlesFor, hoursBetween, isOpenCase, niceHours, slaHours, slaOf } from '../cases';
import { fmtDT, fmtDate, num } from '../util';

export function SlaPanel({ c }) {
  const { db } = useStore();
  const s = slaOf(c, db.settings);
  const row = (label, state, due, at) => (
    <div className="dashlet"><span className="grow small"><span className="strong">{label}</span><div className="muted">{at ? `Done ${fmtDT(at)}` : state === 'Paused' ? 'Paused while waiting for the customer' : state === 'Not needed' ? 'Not needed' : `Due ${fmtDT(new Date(due).toISOString())}`}</div></span><Badge tone={SLA_TONE[state]}>{state}</Badge></div>
  );
  return <div className="stack-s">{row('First reply', s.first, s.firstDue, c.firstResponseAt)}{row('Resolved', s.resolve, s.resolveDue, c.resolvedAt)}</div>;
}

const ARTICLE_FIELDS = [
  { k: 'title', label: 'Title', req: true, full: true },
  { k: 'category', label: 'Category', type: 'select', req: true, list: 'kbCategory' },
  { k: 'status', label: 'Status', type: 'select', noBlank: true, options: ['Draft', 'Published'] },
  { k: 'body', label: 'Article', type: 'textarea', req: true, full: true },
];

export function KnowledgeBase() {
  const { db, can, create, update, remove, toast, optionsOf, userName, me } = useStore();
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const editable = can('cases', 'edit');
  const rows = (db.kbArticles || []).filter((a) => editable || a.status === 'Published');
  const save = (v) => {
    const stamp = { updatedAt: new Date().toISOString(), updatedBy: me.id };
    if (edit.id) { const { id, ...rest } = v; update('kbArticles', id, { ...rest, ...stamp }); } else create('kbArticles', { ...v, views: 0, helpful: 0, notHelpful: 0, ...stamp });
    toast(edit.id ? 'Article saved' : 'Article added');
    setEdit(null);
  };
  const current = rows.find((a) => a.id === view);
  return (
    <>
      <DataTable key="kb" rows={rows} exportName="knowledge-base" onRow={(a) => setView(a.id)} searchPlaceholder="Search articles…" initialSort={{ k: 'views', dir: 'desc' }}
        statusTabs={editable ? { options: ['Published', 'Draft'], get: (a) => a.status } : undefined}
        filters={[{ k: 'category', label: 'Category', get: (a) => a.category, options: optionsOf('kbCategory') }]}
        actions={editable && <Btn kind="primary" icon="Plus" onClick={() => setEdit({ status: 'Draft' })}>New article</Btn>}
        columns={[
          { k: 'title', label: 'Article', render: (a) => <span className="strong">{a.title}</span> },
          { k: 'category', label: 'Category' },
          { k: 'status', label: 'Status', render: (a) => <Badge tone={a.status === 'Published' ? 'good' : 'muted'}>{a.status}</Badge> },
          { k: 'views', label: 'Views', align: 'r', value: (a) => a.views || 0 },
          { k: 'rating', label: 'Helpful', align: 'r', value: (a) => { const t = (a.helpful || 0) + (a.notHelpful || 0); return t ? Math.round(((a.helpful || 0) / t) * 100) : -1; }, render: (a) => { const t = (a.helpful || 0) + (a.notHelpful || 0); return t ? `${Math.round(((a.helpful || 0) / t) * 100)}%` : '—'; } },
          { k: 'updatedAt', label: 'Updated', nowrap: true, render: (a) => fmtDate(a.updatedAt) },
        ]} />
      {current && <Modal size="lg" title={current.title} onClose={() => setView(null)} footer={<>
        {editable && <Btn kind="danger" icon="Trash2" style={{ marginInlineEnd: 'auto' }} onClick={() => setDel(current)}>Delete</Btn>}
        {editable && <Btn icon="Pencil" onClick={() => { setEdit(current); setView(null); }}>Edit</Btn>}
        <Btn kind="primary" onClick={() => setView(null)}>Done</Btn>
      </>}>
        <div className="stack-s"><div className="small muted">{current.category} · updated {fmtDate(current.updatedAt)}{current.updatedBy ? ` by ${userName(current.updatedBy)}` : ''}</div><div style={{ whiteSpace: 'pre-wrap' }}>{current.body}</div></div>
      </Modal>}
      {edit && <RecordModal size="lg" title={edit.id ? 'Edit article' : 'New article'} fields={ARTICLE_FIELDS} initial={edit} onClose={() => setEdit(null)} onSave={save} />}
      {del && <Confirm title={`Delete ${del.title}?`} text="It goes to the recycle bin for 30 days." onClose={() => setDel(null)} onConfirm={() => { remove('kbArticles', del.id); setView(null); toast('Article deleted'); }} />}
    </>
  );
}

export function CasePerformance({ rows }) {
  const { db } = useStore();
  const [span, setSpan] = useState('30 days');
  const since = span === 'All time' ? '' : new Date(Date.now() - (span === '30 days' ? 30 : 90) * 864e5).toISOString();
  const list = rows.filter((c) => c.createdAt >= since);
  const closed = list.filter((c) => c.status === 'Closed');
  const avg = (arr) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : null);
  const firstHours = (l) => l.filter((c) => c.firstResponseAt).map((c) => hoursBetween(c.createdAt, c.firstResponseAt));
  const resolveHours = (l) => l.filter((c) => c.resolvedAt && c.status === 'Closed').map((c) => hoursBetween(c.createdAt, c.resolvedAt));
  const metRate = (l) => {
    const done = l.filter((c) => ['Met', 'Missed'].includes(slaOf(c, db.settings).resolve));
    return done.length ? Math.round((done.filter((c) => slaOf(c, db.settings).resolve === 'Met').length / done.length) * 100) : null;
  };
  const csatOf = (l) => avg(l.filter((c) => c.csat).map((c) => c.csat));
  const owners = [...new Set(list.map((c) => c.ownerId))].map((id) => {
    const mine = list.filter((c) => c.ownerId === id);
    return { id, ownerId: id, open: mine.filter(isOpenCase).length, closed: mine.filter((c) => c.status === 'Closed').length, first: avg(firstHours(mine)), resolve: avg(resolveHours(mine)), met: metRate(mine), csat: csatOf(mine) };
  });
  const queues = [...new Set(list.map((c) => c.queue || 'General'))].map((q) => ({ label: q, Open: list.filter((c) => (c.queue || 'General') === q && isOpenCase(c)).length }));
  const overall = metRate(list);
  const csat = csatOf(list);
  return (
    <div className="stack">
      <div className="row"><Pills value={span} onChange={setSpan} options={['30 days', '90 days', 'All time']} /></div>
      <div className="g4">
        <Kpi label="Service target met" value={overall == null ? '—' : `${overall}%`} note="Resolved in time" icon="Target" />
        <Kpi label="First reply" value={niceHours(avg(firstHours(list)))} note="Average time" icon="Reply" />
        <Kpi label="Time to resolve" value={niceHours(avg(resolveHours(list)))} note={`${num(closed.length)} closed`} icon="Timer" />
        <Kpi label="Customer rating" value={csat == null ? '—' : `${csat.toFixed(1)} / 5`} note={`${list.filter((c) => c.csat).length} ratings`} icon="Star" />
      </div>
      <Card title="Open cases by queue"><Bars height={200} format={num} horizontal data={queues} series={[{ key: 'Open', name: 'Open cases' }]} /></Card>
      <DataTable key={span} rows={owners} exportName="case-performance" noSearch initialSort={{ k: 'open', dir: 'desc' }}
        columns={[
          { k: 'owner', label: 'Assigned user', sort: false, value: () => '', render: (r) => <UserChip id={r.id} /> },
          { k: 'open', label: 'Open', align: 'r' },
          { k: 'closed', label: 'Closed', align: 'r' },
          { k: 'first', label: 'First reply', align: 'r', render: (r) => niceHours(r.first) },
          { k: 'resolve', label: 'To resolve', align: 'r', render: (r) => niceHours(r.resolve) },
          { k: 'met', label: 'Target met', align: 'r', render: (r) => (r.met == null ? '—' : `${r.met}%`) },
          { k: 'csat', label: 'Rating', align: 'r', render: (r) => (r.csat == null ? '—' : r.csat.toFixed(1)) },
        ]} />
    </div>
  );
}

export function CaseSetup() {
  const { db, updateSettings, create, update, remove, toast } = useStore();
  const [hours, setHours] = useState(slaHours(db.settings));
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const put = (p, k, x) => setHours((h) => ({ ...h, [p]: { ...h[p], [k]: x } }));
  const save = () => {
    const clean = Object.fromEntries(Object.entries(hours).map(([p, h]) => [p, { first: Math.max(0.25, Number(h.first) || SLA_DEFAULT[p]?.first || 8), resolve: Math.max(0.25, Number(h.resolve) || SLA_DEFAULT[p]?.resolve || 48) }]));
    updateSettings({ slaHours: clean });
    toast('Service targets saved');
  };
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Service targets" sub="Hours by priority, around the clock. The clock stops while a case is Pending." pad={false}>
        <div className="tb-wrap"><table className="table"><thead><tr><th>Priority</th><th>First reply (hours)</th><th>Resolve (hours)</th></tr></thead>
          <tbody>{Object.keys(hours).map((p) => <tr key={p}><td className="strong">{p}</td>{['first', 'resolve'].map((k) => <td key={k}><input className="input" style={{ width: 90 }} type="number" min="0.25" step="any" aria-label={`${p}: ${k === 'first' ? 'first reply' : 'resolve'} hours`} value={hours[p][k]} onChange={(e) => put(p, k, e.target.value)} /></td>)}</tr>)}</tbody>
        </table></div>
        <div style={{ padding: 12 }}><Btn kind="primary" onClick={save}>Save targets</Btn></div>
      </Card>
      <Card title="Saved replies" sub="Ready-made answers. {name} becomes the contact's first name." action={<Btn icon="Plus" onClick={() => setEdit({})}>New reply</Btn>} pad={false}>
        {(db.cannedReplies || []).length ? (db.cannedReplies || []).map((r) => (
          <div key={r.id} className="dashlet" style={{ padding: '8px 12px' }}><span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{r.name}</div><div className="small muted trunc">{r.text}</div></span><Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${r.name}`} onClick={() => setEdit(r)} /><Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${r.name}`} onClick={() => setDel(r)} /></div>
        )) : <Empty icon="MessageSquareText" text="No saved replies yet." />}
      </Card>
      {edit && <RecordModal title={edit.id ? 'Edit saved reply' : 'New saved reply'} fields={[{ k: 'name', label: 'Name', req: true, full: true }, { k: 'text', label: 'Reply', type: 'textarea', req: true, full: true }]} initial={edit} onClose={() => setEdit(null)} onSave={(v) => { if (edit.id) { const { id, ...rest } = v; update('cannedReplies', id, rest); } else create('cannedReplies', v); toast('Saved reply saved'); setEdit(null); }} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="It goes to the recycle bin for 30 days." onClose={() => setDel(null)} onConfirm={() => { remove('cannedReplies', del.id); toast('Saved reply deleted'); }} />}
    </div>
  );
}

// What the customer sees in their portal.
export function PortalSupport({ company, cases, tell }) {
  const { db, update } = useStore();
  const [open, setOpen] = useState(null);
  const [text, setText] = useState('');
  const c = cases.find((x) => x.id === open);
  const send = () => {
    if (!text.trim()) return;
    update('cases', c.id, { stream: [{ at: new Date().toISOString(), by: null, kind: 'customer', text: text.trim() }, ...c.stream], ...(c.status === 'Pending' ? { status: 'Assigned' } : {}), ...(!isOpenCase(c) ? { status: 'Assigned' } : {}) });
    tell(`replied on case #${c.number}: ${text.trim().slice(0, 60)}`);
    setText('');
  };
  const rate = (n) => { update('cases', c.id, { csat: n }); tell(`rated case #${c.number} ${n} out of 5`); };
  return (
    <Card title="Support requests" pad={false}>
      {!cases.length && <div className="sub" style={{ padding: 12 }}>No requests.</div>}
      {cases.map((x) => <button key={x.id} type="button" className="dashlet" style={{ width: '100%', background: 'none', border: 0, textAlign: 'start', cursor: 'pointer', padding: '8px 12px' }} onClick={() => setOpen(x.id)}><span className="grow strong">#{x.number} {x.subject}</span><Badge>{x.status}</Badge><span className="small muted nowrap">{fmtDate(x.createdAt)}</span></button>)}
      {c && <Modal title={`#${c.number} ${c.subject}`} onClose={() => setOpen(null)} footer={<Btn kind="primary" onClick={() => setOpen(null)}>Done</Btn>}>
        <div className="stack">
          <div className="row"><Badge>{c.status}</Badge></div>
          {c.status === 'Closed' && <div><div className="label">How did we do?</div><div className="row">{[1, 2, 3, 4, 5].map((n) => <Btn key={n} sm kind={c.csat === n ? 'primary' : ''} aria-label={`Rate ${n} out of 5`} onClick={() => rate(n)}>{n}</Btn>)}</div></div>}
          <div><textarea className="textarea" aria-label="Write a reply" placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} /><div style={{ marginTop: 6 }}><Btn sm kind="primary" disabled={!text.trim()} onClick={send}>Send</Btn></div></div>
          <div className="feed">{c.stream.filter((m) => m.kind === 'reply' || m.kind === 'customer').map((m) => <div key={m.at + m.text} className="feed-item"><div className="grow"><div className="small"><span className="strong">{m.kind === 'customer' ? company.name : db.settings.companyName}</span> <span className="muted">{fmtDT(m.at)}</span></div><div style={{ overflowWrap: 'anywhere' }}>{m.text}</div></div></div>)}</div>
        </div>
      </Modal>}
    </Card>
  );
}

export function PortalHelp() {
  const { db, patchQuiet } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [voted, setVoted] = useState(false);
  const published = (db.kbArticles || []).filter((a) => a.status === 'Published');
  const hits = q.trim().length > 2 ? articlesFor(published, q) : published.slice(0, 4);
  const a = published.find((x) => x.id === open);
  const read = (x) => { patchQuiet('kbArticles', x.id, { views: (x.views || 0) + 1 }); setVoted(false); setOpen(x.id); };
  const vote = (k) => { patchQuiet('kbArticles', a.id, { [k]: (a[k] || 0) + 1 }); setVoted(true); };
  return (
    <Card title="Help articles" sub="Find an answer without waiting.">
      <div className="stack-s">
        <input className="input" aria-label="Search help articles" placeholder="Search help articles…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.map((x) => <button key={x.id} type="button" className="dashlet" style={{ width: '100%', background: 'none', border: 0, textAlign: 'start', cursor: 'pointer' }} onClick={() => read(x)}><span className="grow">{x.title}<div className="small muted">{x.category}</div></span></button>)}
        {!hits.length && <div className="sub">No articles match.</div>}
      </div>
      {a && <Modal title={a.title} onClose={() => setOpen(null)} footer={<Btn kind="primary" onClick={() => setOpen(null)}>Done</Btn>}>
        <div className="stack"><div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
          {voted ? <div className="small muted">Thanks for telling us.</div> : <div className="row"><span className="small">Was this helpful?</span><Btn sm onClick={() => vote('helpful')}>Yes</Btn><Btn sm onClick={() => vote('notHelpful')}>No</Btn></div>}
        </div>
      </Modal>}
    </Card>
  );
}
