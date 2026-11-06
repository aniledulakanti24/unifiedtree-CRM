import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Btn, Confirm, Empty, Icon, Modal } from '../ui';
import { fmtDT } from '../util';

export const QUICK_REACTIONS = ['👍', '✅', '😂', '🎉', '🙏'];
export const CHAT_STATES = [['', 'Automatic'], ['Available', 'Available'], ['Busy', 'Busy'], ['In a meeting', 'In a meeting'], ['Away', 'Away']];
export const FILE_LIMIT = 300 * 1024;

// Highlights @names, using the people who are really in the conversation.
export function ChatText({ text, names }) {
  if (!text) return null;
  const list = [...names, 'everyone'].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!list.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(@(?:${list.join('|')}))`, 'g'));
  return <>{parts.map((p, i) => (p.startsWith('@') && list.some((n) => p.slice(1) === n.replace(/\\/g, '')) ? <strong key={i} className="chat-mention">{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

export function BrowseChannels({ onClose, onOpen }) {
  const { db, me, patchQuiet, toast } = useStore();
  const [q, setQ] = useState('');
  const list = db.conversations.filter((c) => c.kind === 'team' && c.group && c.public && !c.members.includes(me.id) && c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal size="sm" title="Browse channels" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Done</Btn>}>
      <div className="stack-s">
        <input className="input" autoFocus aria-label="Search channels" placeholder="Search channels…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!list.length && <Empty icon="Hash" text="No open channels to join." />}
        {list.map((c) => <div key={c.id} className="dashlet"><span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{c.name}</div><div className="small muted trunc">{c.topic || `${c.members.length} members`}</div></span><Btn sm kind="primary" onClick={() => { patchQuiet('conversations', c.id, { members: [...c.members, me.id] }); toast(`You joined ${c.name}`); onOpen(c.id); }}>Join</Btn></div>)}
      </div>
    </Modal>
  );
}

export function SavedMessages({ onClose, onJump }) {
  const { db, me, userName } = useStore();
  const saved = db.conversations.filter((c) => c.kind === 'team' && c.members.includes(me.id)).flatMap((c) => c.messages.filter((m) => m.saved?.includes(me.id) && !m.deleted).map((m) => ({ c, m })));
  return (
    <Modal size="sm" title="Saved messages" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Done</Btn>}>
      <div className="stack-s">
        {!saved.length && <Empty icon="Bookmark" text="Save a message to find it here later." />}
        {saved.map(({ c, m }) => <button key={m.id} type="button" className="pop-item" style={{ alignItems: 'flex-start' }} onClick={() => { onJump(c.id, m.id); onClose(); }}><span className="grow" style={{ minWidth: 0 }}><div className="small muted">{userName(m.by)} · {fmtDT(m.at)}</div><div className="trunc">{m.text || m.file?.name}</div></span></button>)}
      </div>
    </Modal>
  );
}

// Share a deal, customer, lead or case as a card people can open.
export function ShareRecord({ onClose, onPick }) {
  const { db, can, scope } = useStore();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const all = [
    ...(can('pipeline') ? scope(db.deals, 'pipeline').map((d) => ({ key: d.id, type: 'Opportunity', icon: 'Kanban', label: d.title, to: `/pipeline/${d.id}` })) : []),
    ...(can('customers') ? scope(db.companies, 'customers').map((c) => ({ key: c.id, type: 'Customer', icon: 'Building2', label: c.name, to: `/customers/${c.id}` })) : []),
    ...(can('leads') ? scope(db.leads, 'leads').map((l) => ({ key: l.id, type: 'Lead', icon: 'Magnet', label: l.name, to: `/leads?open=${l.id}` })) : []),
    ...(can('cases') ? scope(db.cases, 'cases').map((c) => ({ key: c.id, type: 'Case', icon: 'LifeBuoy', label: `#${c.number} ${c.subject}`, to: `/cases?open=${c.id}` })) : []),
  ];
  const hits = term ? all.filter((x) => x.label.toLowerCase().includes(term)).slice(0, 8) : all.slice(0, 6);
  return (
    <Modal size="sm" title="Share a record" onClose={onClose}>
      <div className="stack-s">
        <input className="input" autoFocus aria-label="Search records" placeholder="Search deals, customers, leads and cases…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!hits.length && <div className="sub muted">No matches.</div>}
        {hits.map((x) => <button key={x.key} type="button" className="pop-item" onClick={() => onPick({ to: x.to, label: x.label, type: x.type, icon: x.icon })}><Icon name={x.icon} size={15} /><span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{x.label}</div><div className="small muted">{x.type}</div></span></button>)}
      </div>
    </Modal>
  );
}

export const RecordCard = ({ link }) => <Link className="chat-card" to={link.to}><Icon name={link.icon || 'Link'} size={15} /><span className="trunc"><span className="strong">{link.label}</span><span className="small muted"> · {link.type}</span></span></Link>;

// Pins, files and member settings for one conversation.
export function ChatDetails({ cur, onJump, onClose: closeThread }) {
  const { db, me, role, patchQuiet, toast, userName } = useStore();
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState(cur.name || '');
  const [topic, setTopic] = useState(cur.topic || '');
  const canManage = role !== 'sales' || cur.createdBy === me.id;
  const muted = !!cur.muted?.[me.id];
  const pins = cur.messages.filter((m) => m.pinned && !m.deleted);
  const files = cur.messages.filter((m) => m.file && !m.deleted);
  const put = (patch) => patchQuiet('conversations', cur.id, patch);
  const others = db.users.filter((u) => u.active && !cur.members.includes(u.id));
  return (
    <div className="stack">
      <label className="check small"><input type="checkbox" checked={muted} onChange={(e) => { put({ muted: { ...cur.muted, [me.id]: e.target.checked } }); toast(e.target.checked ? 'Muted. You still hear about @mentions.' : 'Alerts on'); }} />Mute alerts for this conversation</label>
      {cur.group && <div className="stack-s">
        {canManage ? <>
          <div className="field"><label className="label" htmlFor="chan-name">Name</label><input id="chan-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== cur.name) { put({ name: name.trim() }); toast('Name saved'); } }} /></div>
          <div className="field"><label className="label" htmlFor="chan-topic">What it's for</label><input id="chan-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => { if (topic !== (cur.topic || '')) { put({ topic: topic.trim() }); toast('Saved'); } }} /></div>
          <label className="check small"><input type="checkbox" checked={!!cur.public} onChange={(e) => { put({ public: e.target.checked }); toast(e.target.checked ? 'Anyone can now find and join this' : 'Now only by invitation'); }} />Anyone can find and join</label>
        </> : cur.topic && <div className="small">{cur.topic}</div>}
      </div>}
      {pins.length > 0 && <div><div className="small muted" style={{ marginBottom: 4 }}>Pinned</div><div className="stack-s">{pins.map((m) => <button key={m.id} type="button" className="link-btn" style={{ textAlign: 'start' }} onClick={() => onJump(cur.id, m.id)}>{(m.text || m.file?.name || '').slice(0, 60)}</button>)}</div></div>}
      {files.length > 0 && <div><div className="small muted" style={{ marginBottom: 4 }}>Files</div><div className="stack-s">{files.map((m) => (m.file.data ? <a key={m.id} className="small trunc" href={m.file.data} download={m.file.name}>{m.file.name}</a> : <div key={m.id} className="small muted trunc">{m.file.name} (name only)</div>))}</div></div>}
      {cur.group && <div>
        <div className="row between" style={{ marginBottom: 6 }}><span className="small muted">{cur.members.length} members</span>{canManage && others.length > 0 && <Btn sm icon="UserPlus" onClick={() => setAdding(!adding)}>Add</Btn>}</div>
        {adding && <select className="select" style={{ marginBottom: 6 }} aria-label="Add someone" value="" onChange={(e) => { if (e.target.value) { put({ members: [...cur.members, e.target.value] }); toast(`${userName(e.target.value)} added`); setAdding(false); } }}><option value="">Choose a person…</option>{others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <div className="stack-s">{cur.members.map((m) => <div key={m} className="row"><Avatar name={userName(m)} size={24} /><span className="small trunc grow">{userName(m)}</span>{canManage && m !== me.id && <Btn sm kind="ghost" icon="X" aria-label={`Remove ${userName(m)}`} onClick={() => { put({ members: cur.members.filter((x) => x !== m) }); toast(`${userName(m)} removed`); }} />}</div>)}</div>
        <div style={{ marginTop: 8 }}><Btn sm kind="danger" onClick={() => setLeaving(true)}>Leave</Btn></div>
      </div>}
      {leaving && <Confirm title={`Leave ${cur.name}?`} text="You'll stop seeing its messages." confirmLabel="Leave" onClose={() => setLeaving(false)} onConfirm={() => { put({ members: cur.members.filter((x) => x !== me.id) }); toast(`You left ${cur.name}`); closeThread?.(); }} />}
    </div>
  );
}
