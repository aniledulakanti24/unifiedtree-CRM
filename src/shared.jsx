import React, { useState } from 'react';
import { CheckCircle2, Clock, MessageSquare, Pencil, Send, StickyNote, Trash2 } from 'lucide-react';
import { Avatar, Badge, Btn, Empty, FormFields, Icon, Modal, RecordModal, validate } from './ui';
import { RECORD_ENTITY, useStore } from './store';
import { addDays, fmtDate, relTime, today, uid } from './util';

export const dealFields = (s, { owner = true } = {}) => [
  { k: 'title', label: 'Opportunity', req: true, full: true },
  { k: 'companyId', label: 'Customer', type: 'company', req: true },
  { k: 'value', label: 'Expected revenue', type: 'number', min: 0, req: true },
  { k: 'closeDate', label: 'Expected closing', type: 'date', req: true },
  { k: 'source', label: 'Source', type: 'select', list: 'leadSource' },
  { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: !owner },
  { k: 'tags', label: 'Tags', type: 'tags' },
  { k: 'notes', label: 'Internal notes', type: 'textarea' },
];
export const leadFields = ({ owner = true } = {}) => [
  { k: 'name', label: 'Contact name', req: true },
  { k: 'company', label: 'Company', req: true },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'title', label: 'Job title' },
  { k: 'source', label: 'Source', type: 'select', list: 'leadSource' },
  { k: 'status', label: 'Status', type: 'select', noBlank: true, list: 'leadStatus' },
  { k: 'expected', label: 'Expected revenue', type: 'number', min: 0 },
  { k: 'city', label: 'City' },
  { k: 'country', label: 'Country' },
  { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: !owner },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];
export const contactFields = ({ owner = true } = {}) => [
  { k: 'first', label: 'First name', req: true },
  { k: 'last', label: 'Last name', req: true },
  { k: 'title', label: 'Job title' },
  { k: 'companyId', label: 'Company', type: 'company', req: true },
  { k: 'email', label: 'Email', type: 'email', req: true },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'status', label: 'Status', type: 'radio', list: 'contactStatus', full: true },
  { k: 'ownerId', label: 'Account manager', type: 'user', req: true, hide: !owner },
  { k: 'tags', label: 'Tags', type: 'tags' },
  { k: 'notes', label: 'Background', type: 'textarea' },
];
export const companyFields = ({ owner = true } = {}) => [
  { k: 'name', label: 'Company name', req: true, full: true },
  { k: 'status', label: 'Type', type: 'radio', list: 'customerType' },
  { k: 'industry', label: 'Industry', type: 'select', list: 'industry' },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'website', label: 'Website' },
  { k: 'size', label: 'Company size', type: 'select', list: 'companySize' },
  { k: 'address', label: 'Street' },
  { k: 'city', label: 'City' },
  { k: 'country', label: 'Country' },
  { k: 'taxId', label: 'Tax ID' },
  { k: 'paymentTerms', label: 'Payment terms', type: 'select', list: 'paymentTerms' },
  { k: 'priceList', label: 'Price list', type: 'select', list: 'priceList' },
  { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: !owner },
  { k: 'tags', label: 'Tags', type: 'tags' },
  { k: 'notes', label: 'Internal notes', type: 'textarea' },
];

// The Odoo "To-Do" dialog: schedule, mark done, or complete and chain the next activity.
export function ActivityDialog({ related, initial, onClose }) {
  const { db, me, can, create, update, toast, addChatter } = useStore();
  const editing = !!initial?.id;
  const firstType = db.activityTypes[0];
  const [v, setV] = useState(() => initial || { typeId: firstType.id, summary: firstType.summary, due: addDays(firstType.delay), ownerId: related?.ownerId || me.id, note: '', priority: 'Medium', tag: 'Sales' });
  const [errors, setErrors] = useState({});
  const set = (k, val) => {
    setV((p) => {
      const n = { ...p, [k]: val };
      if (k === 'typeId') { const t = db.activityTypes.find((x) => x.id === val); if (t) { n.due = addDays(t.delay); if (!p.summary || db.activityTypes.some((x) => x.summary === p.summary)) n.summary = t.summary; if (t.userId) n.ownerId = t.userId; } }
      return n;
    });
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fields = [
    { k: 'typeId', label: 'Activity type', type: 'select', noBlank: true, options: db.activityTypes.map((t) => ({ value: t.id, label: t.name })), req: true, onAdd: can('options', 'add') ? (name) => create('activityTypes', { name, icon: 'CheckSquare', delay: 1, action: 'None', summary: '', userId: '', chainId: '' }).id : undefined },
    { k: 'due', label: 'Due date', type: 'date', req: true },
    { k: 'summary', label: 'Summary', req: true, placeholder: 'e.g. Discuss proposal' },
    { k: 'ownerId', label: 'Assigned to', type: 'user', req: true },
    { k: 'note', label: 'Notes', type: 'textarea', placeholder: 'Log a note…' },
  ];
  const save = (status) => {
    const er = validate(fields, v);
    setErrors(er);
    if (Object.keys(er).length) return null;
    const base = { ...v, status, relatedType: related?.type || v.relatedType || '', relatedId: related?.id || v.relatedId || '', relatedLabel: related?.label || v.relatedLabel || '' };
    if (editing) update('activities', v.id, base);
    else create('activities', base);
    return base;
  };
  const key = related ? `${related.type}:${related.id}` : (v.relatedType ? `${v.relatedType}:${v.relatedId}` : null);
  const typeName = db.activityTypes.find((t) => t.id === v.typeId)?.name;
  const schedule = () => { if (save(editing ? v.status : 'todo')) { toast(`${typeName} scheduled`); onClose(); } };
  const done = () => { if (save('done')) { if (key) addChatter(key, 'activity', `${typeName} done: ${v.summary}`); toast(`${typeName} marked as done`); onClose(); } };
  const doneNext = () => {
    if (!save('done')) return;
    if (key) addChatter(key, 'activity', `${typeName} done: ${v.summary}`);
    const chained = db.activityTypes.find((t) => t.id === db.activityTypes.find((x) => x.id === v.typeId)?.chainId) || firstType;
    setV({ typeId: chained.id, summary: chained.summary, due: addDays(chained.delay), ownerId: v.ownerId, note: '', priority: 'Medium', tag: v.tag, relatedType: v.relatedType, relatedId: v.relatedId, relatedLabel: v.relatedLabel });
    toast('Done. Schedule the next activity.');
  };
  return (
    <Modal title={editing ? 'Edit activity' : 'Schedule activity'} onClose={onClose} footer={<>
      <Btn onClick={onClose} kind="ghost" style={{ marginInlineEnd: 'auto' }}>Discard</Btn>
      <Btn icon="Check" onClick={done}>Mark as done</Btn>
      <Btn onClick={doneNext}>Done &amp; schedule next</Btn>
      <Btn kind="primary" onClick={schedule}>{editing ? 'Save' : 'Schedule'}</Btn>
    </>}>
      {related && <div className="sub" style={{ marginBottom: 12 }}>For <strong>{related.label}</strong></div>}
      <FormFields fields={fields} values={v} errors={errors} onChange={set} />
    </Modal>
  );
}

export function TransferDialog({ record, onClose }) {
  const { db, me, can, requestTransfer, toast } = useStore();
  const [toId, setToId] = useState('');
  const [reason, setReason] = useState('');
  const [includeRelated, setInclude] = useState(true);
  const [err, setErr] = useState({});
  const from = db.users.find((u) => u.id === record.ownerId);
  const candidates = db.users.filter((u) => u.active && u.id !== record.ownerId && u.role !== 'admin' && (me.role === 'admin' || u.teamId === me.teamId));
  const direct = can('transfers', 'direct') || !db.settings.transferNeedsApproval;
  const submit = () => {
    const e = {};
    if (!toId) e.toId = 'Choose who should receive this record';
    if (!reason.trim()) e.reason = 'Add a reason for the audit trail';
    setErr(e);
    if (Object.keys(e).length) return;
    const moved = requestTransfer({ recordType: record.type, recordId: record.id, recordLabel: record.label, fromId: record.ownerId, toId, reason: reason.trim(), includeRelated });
    toast(moved ? 'Record transferred' : 'Transfer request sent for approval');
    onClose();
  };
  return (
    <Modal size="sm" title="Internal transfer" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="ArrowRightLeft" onClick={submit}>{direct ? 'Transfer now' : 'Request approval'}</Btn></>}>
      <div className="stack">
        <div className="sub">Moving <strong>{record.label}</strong> from <strong>{from?.name}</strong>.</div>
        <div className="field">
          <label className="label">Transfer to <span className="req">*</span></label>
          <select className="select" value={toId} onChange={(e) => { setToId(e.target.value); setErr((p) => ({ ...p, toId: undefined })); }}>
            <option value="">Select a colleague…</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}
          </select>
          {err.toId && <span className="error-text">{err.toId}</span>}
        </div>
        <div className="field">
          <label className="label">Reason <span className="req">*</span></label>
          <textarea className="textarea" value={reason} onChange={(e) => { setReason(e.target.value); setErr((p) => ({ ...p, reason: undefined })); }} placeholder="Why is this moving?" />
          {err.reason && <span className="error-text">{err.reason}</span>}
        </div>
        <label className="check"><input type="checkbox" checked={includeRelated} onChange={(e) => setInclude(e.target.checked)} />Move open activities{record.type === 'company' ? ', contacts and open deals' : ''} too</label>
        {!direct && <div className="notice">Your manager needs to approve this. Ownership stays the same until then.</div>}
      </div>
    </Modal>
  );
}

export function ActivityList({ items, related, emptyText = 'No planned activities.' }) {
  const { db, can, update, toast, addChatter, userName } = useStore();
  const [edit, setEdit] = useState(null);
  return (
    <div className="stack-s">
      {!items.length && <div className="sub muted">{emptyText}</div>}
      {items.map((a) => {
        const t = db.activityTypes.find((x) => x.id === a.typeId);
        const overdue = a.due < today();
        return (
          <div key={a.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span className="kpi-ico" style={{ width: 28, height: 28 }}><Icon name={t?.icon} size={14} /></span>
            <div className="grow">
              <div className="strong">{a.summary || t?.name}</div>
              <div className="small muted">{t?.name} · {userName(a.ownerId)} · <span style={overdue ? { color: 'var(--bad)' } : undefined}>{overdue ? 'Overdue, ' : ''}{fmtDate(a.due)}</span></div>
              {a.note && <div className="small sub">{a.note}</div>}
            </div>
            {can('tasks', 'edit') && <Btn sm kind="ghost" icon="Pencil" aria-label="Edit activity" onClick={() => setEdit(a)} />}
            {can('tasks', 'edit') && <Btn sm icon="Check" aria-label="Mark done" onClick={() => { update('activities', a.id, { status: 'done' }); if (related) addChatter(`${related.type}:${related.id}`, 'activity', `${t?.name} done: ${a.summary}`); toast('Activity done'); }} />}
          </div>
        );
      })}
      {edit && <ActivityDialog initial={edit} related={related} onClose={() => setEdit(null)} />}
    </div>
  );
}

// The Odoo chatter: messages and notes on the record, with its planned activities.
export function Chatter({ related }) {
  const { db, me, can, addChatter, toast, userName } = useStore();
  const [mode, setMode] = useState('note');
  const [text, setText] = useState('');
  const [sched, setSched] = useState(false);
  const key = `${related.type}:${related.id}`;
  const feed = db.chatter[key] || [];
  const planned = db.activities.filter((a) => a.relatedId === related.id && a.status !== 'done');
  const audits = db.audit.filter((a) => a.entityId === related.id).slice(0, 12).map((a) => ({ id: a.id, at: a.at, by: a.userId, kind: 'audit', text: a.changes.length ? a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; ') : `${a.action}d this record` }));
  const items = [...feed, ...audits].sort((a, b) => new Date(b.at) - new Date(a.at));
  const post = () => {
    if (!text.trim()) return;
    addChatter(key, mode, text.trim());
    setText('');
    toast(mode === 'message' ? 'Logged. Email sending is not connected yet.' : 'Note logged');
  };
  const KIND = { note: StickyNote, message: Send, activity: CheckCircle2, audit: Pencil };
  return (
    <div className="card">
      <div className="card-b stack">
        <div className="row wrap">
          <Btn sm kind={mode === 'message' ? 'primary' : ''} icon="Send" onClick={() => setMode('message')}>Send message</Btn>
          <Btn sm kind={mode === 'note' ? 'primary' : ''} icon="StickyNote" onClick={() => setMode('note')}>Log note</Btn>
          {can('tasks', 'create') && <Btn sm icon="ListTodo" onClick={() => setSched(true)}>To-Do</Btn>}
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Avatar name={me.name} size={28} />
          <div className="grow stack-s">
            <textarea className="textarea" aria-label={mode === 'note' ? 'Log an internal note' : 'Write a message'} placeholder={mode === 'note' ? 'Log an internal note…' : 'Write a message to followers…'} value={text} onChange={(e) => setText(e.target.value)} />
            <div><Btn sm kind="primary" disabled={!text.trim()} onClick={post}>{mode === 'note' ? 'Log' : 'Send'}</Btn></div>
          </div>
        </div>
        {can('tasks') && <div>
          <div className="filter-title"><Clock size={13} />Planned activities ({planned.length})</div>
          <ActivityList items={planned} related={related} />
        </div>}
        <div>
          <div className="filter-title"><MessageSquare size={13} />History</div>
          <div className="feed">
            {!items.length && <div className="sub muted">No history yet.</div>}
            {items.map((m) => {
              const K = KIND[m.kind] || StickyNote;
              return (
                <div key={m.id} className="feed-item">
                  <Avatar name={userName(m.by)} size={26} />
                  <div className="grow">
                    <div className="small"><span className="strong">{userName(m.by)}</span> <span className="muted">{relTime(m.at)}</span> <K size={11} style={{ verticalAlign: -1, color: 'var(--ink-3)' }} /></div>
                    <div style={{ overflowWrap: 'anywhere' }}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {sched && <ActivityDialog related={related} onClose={() => setSched(false)} />}
    </div>
  );
}

export function NewOrderItems({ items, setItems }) {
  const { db } = useStore();
  const change = (i, patch) => setItems(items.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>Line items <span className="req">*</span></div>
      {items.map((it, i) => (
        <div className="line-item" key={it.key}>
          <select className="select" aria-label="Product" value={it.productId} onChange={(e) => { const p = db.products.find((x) => x.id === e.target.value); change(i, { productId: e.target.value, name: p?.name || '', price: p?.price || 0 }); }}>
            <option value="">Select a product…</option>
            {db.products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.tracked ? ` (${p.stock} in stock)` : ''}</option>)}
          </select>
          <input className="input" aria-label="Quantity" type="number" min="1" value={it.qty} onChange={(e) => change(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
          <input className="input li-price" aria-label="Unit price" type="number" min="0" value={it.price} onChange={(e) => change(i, { price: Math.max(0, Number(e.target.value) || 0) })} />
          <span className="num right li-total strong">{(it.qty * it.price).toLocaleString('en-US')}</span>
          <Btn sm kind="ghost" icon="Trash2" aria-label="Remove line" disabled={items.length === 1} onClick={() => setItems(items.filter((_, n) => n !== i))} />
        </div>
      ))}
      <Btn sm icon="Plus" onClick={() => setItems([...items, newLine()])}>Add line</Btn>
    </div>
  );
}
export const newLine = () => ({ key: uid('li'), productId: '', name: '', qty: 1, price: 0 });
export const cleanItems = (items) => items.filter((x) => x.productId).map(({ key, ...x }) => x);

export const RecordQuickCreate = ({ kind, onClose, defaults = {} }) => {
  const { db, me, can, create, toast, role } = useStore();
  const owner = role !== 'sales';
  const ownerId = owner ? me.id : me.id;
  const cfg = {
    deal: { title: 'New opportunity', fields: dealFields(null, { owner }), entity: 'deals', init: { title: '', value: 10000, closeDate: addDays(30), source: 'Website', ownerId, tags: [], notes: '', stage: db.stages[0].id, status: 'open', probability: db.stages[0].prob, priority: 0, ...defaults } },
    lead: { title: 'New lead', fields: leadFields({ owner }), entity: 'leads', init: { status: 'New', source: 'Website', score: 50, ownerId, expected: 5000, ...defaults } },
    contact: { title: 'New contact', fields: contactFields({ owner }), entity: 'contacts', init: { status: 'Cold', ownerId, tags: [], lastActivity: new Date().toISOString(), ...defaults } },
    company: { title: 'New customer', fields: companyFields({ owner }), entity: 'companies', init: { status: 'Prospect', ownerId, tags: [], paymentTerms: '30 days', priceList: 'Standard', ...defaults } },
  }[kind];
  return <RecordModal title={cfg.title} fields={cfg.fields} initial={cfg.init} onClose={onClose} size="lg" saveLabel="Create" onSave={(v) => { create(cfg.entity, v); toast(`${cfg.title.replace('New ', '')} created`); }} />;
};
export const relatedOf = (type, r) => ({ type, id: r.id, label: type === 'deal' ? r.title : type === 'contact' ? `${r.first} ${r.last}` : r.name, ownerId: r.ownerId });
export { RECORD_ENTITY };
