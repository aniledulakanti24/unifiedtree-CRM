import { getLocale } from '../util';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Paperclip, Search, Send, Smile, X } from 'lucide-react';
import { unreadOf, useStore } from '../store';
import { Avatar, Badge, Btn, Empty, Icon, ListField, Modal, PageHead, Pills } from '../ui';
import { useComms, whatsappUrl } from '../comms';
import { suggestReply } from '../assistant';
import { fmtDT, fmtTime, uid } from '../util';
import { WhatsAppPage } from './WhatsAppExtras';
import { approved, consentOf, fillTemplate, templatesOf, waOf } from '../whatsapp';
import { BrowseChannels, CHAT_STATES, ChatDetails, ChatText, FILE_LIMIT, QUICK_REACTIONS, RecordCard, SavedMessages, ShareRecord } from './ChatExtras';

const EMOJI = ['😀', '😂', '😊', '😍', '🙏', '👍', '👏', '🎉', '🔥', '✅', '📞', '📅'];
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayLabel = (s) => new Date(s).toLocaleDateString(getLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
const listDate = (s) => (sameDay(s, Date.now()) ? fmtTime(s) : new Date(s).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }));
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
// Simulated: a real status needs a server. It stays the same for an hour, then may change.
const presenceOf = (id, meId) => {
  if (id === meId) return 'Online';
  const n = hash(`${id}${Math.floor(Date.now() / 36e5)}`) % 10;
  return n < 6 ? 'Online' : n < 8 ? 'Away' : 'Offline';
};

function NewChat({ kind, onClose, onOpen, onGroup }) {
  const { db, me, can, scope } = useStore();
  const [mode, setMode] = useState('person');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const list = kind === 'team'
    ? db.users.filter((u) => u.id !== me.id && u.active).map((u) => ({ id: u.id, name: u.name, sub: u.title }))
    : (can('contacts') ? scope(db.contacts) : []).filter((c) => c.phone).map((c) => ({ id: c.id, name: `${c.first} ${c.last}`, sub: c.phone, phone: c.phone }));
  const found = list.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  const makeGroup = () => {
    if (!name.trim()) { setError('Give the group a name.'); return; }
    if (picked.length < 2) { setError('Choose at least two people.'); return; }
    onGroup(name.trim(), picked, { public: open, topic: topic.trim() });
  };
  return (
    <Modal size="sm" title="New conversation" onClose={onClose} footer={mode === 'group' ? <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={makeGroup}>Create group</Btn></> : undefined}>
      <div className="stack-s">
        {kind === 'team' && <Pills value={mode} onChange={setMode} options={[{ k: 'person', label: 'Person' }, { k: 'group', label: 'Group' }]} />}
        {mode === 'group' && <input className="input" aria-label="Group name" placeholder="Group name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />}
        {mode === 'group' && <input className="input" aria-label="What it's for" placeholder="What it's for (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />}
        {mode === 'group' && <label className="check small"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />Anyone can find and join</label>}
        <input className="input" autoFocus aria-label="Search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {mode === 'person' && found.slice(0, 8).map((x) => <button key={x.id} type="button" className="pop-item" onClick={() => onOpen(x)}><Avatar name={x.name} size={28} /><span className="grow"><div className="strong trunc">{x.name}</div><div className="small muted trunc">{x.sub}</div></span></button>)}
        {mode === 'group' && <div className="chatx-pick">{found.map((x) => <label key={x.id} className="check"><input type="checkbox" checked={picked.includes(x.id)} onChange={() => { setPicked((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : [...p, x.id])); setError(''); }} /><Avatar name={x.name} size={24} /><span className="trunc">{x.name}</span></label>)}</div>}
        {!found.length && <div className="sub muted">No matches.</div>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </Modal>
  );
}

function Broadcast({ templates, rows, onSend, onClose }) {
  const [tpl, setTpl] = useState(templates[0] || '');
  const [audience, setAudience] = useState('All');
  const statuses = ['All', ...new Set(rows.map((c) => c.status).filter(Boolean))];
  const list = (audience === 'All' ? rows : rows.filter((c) => c.status === audience)).slice(0, 100);
  return (
    <Modal size="sm" title="WhatsApp broadcast" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Send" disabled={!list.length || !tpl} onClick={() => onSend(list, tpl)}>Send to {list.length}</Btn></>}>
      <div className="stack">
        <div className="field"><label className="label" htmlFor="bc-to">Send to</label><select id="bc-to" className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>{statuses.map((x) => <option key={x} value={x}>{x === 'All' ? 'All my contacts' : `${x} contacts`}</option>)}</select><span className="hint">Up to 100 at a time. Only send to people who agreed to hear from you.</span></div>
        <div className="field"><label className="label" htmlFor="bc-tpl">Approved template</label><select id="bc-tpl" className="select" value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((x) => <option key={x} value={x}>{x.slice(0, 70)}</option>)}</select><span className="hint">Edit templates in Settings, Dropdown options.</span></div>
        {tpl && <div className="notice">{tpl.replace('{name}', list[0]?.first || 'there')}</div>}
      </div>
    </Modal>
  );
}

function Info({ cur, title, onClose, onJump, onLeft }) {
  const { db, can, role, userName, companyName, assignConversation, create, update, patchQuiet, toast } = useStore();
  const canAssign = role !== 'sales' && can('whatsapp', 'create');
  const other = cur.kind === 'team' && !cur.group ? db.users.find((u) => cur.members.includes(u.id) && u.id !== cur.me) : null;
  const contact = cur.kind === 'whatsapp' ? db.contacts.find((c) => c.id === cur.contactId) : null;
  const Row = ({ label, value }) => (value ? <div><div className="small muted">{label}</div><div style={{ overflowWrap: 'anywhere' }}>{value}</div></div> : null);
  return (
    <div className="chatx-info">
      <div className="row between"><div className="strong">Details</div><Btn sm kind="ghost" icon="X" aria-label="Close details" onClick={onClose} /></div>
      <div style={{ textAlign: 'center' }}>{cur.group ? <span className="chatx-group big"><Icon name="UsersRound" size={24} /></span> : <Avatar name={title} size={56} />}<div className="strong" style={{ marginTop: 6 }}>{title}</div></div>
      {other && <><Row label="Job title" value={other.title} /><Row label="Email" value={other.email} /><Row label="Phone" value={other.phone} /><Row label="Team" value={db.teams.find((t) => t.id === other.teamId)?.name} /></>}
      {contact && <><Row label="Phone" value={contact.phone} /><Row label="Email" value={contact.email} /><Row label="Customer" value={companyName(contact.companyId)} /></>}
      {cur.kind === 'whatsapp' && <><Row label="Handled by" value={userName(cur.ownerId)} />{canAssign && <select className="select" aria-label="Assign this conversation" value={cur.ownerId} onChange={(e) => assignConversation(cur.id, e.target.value)}>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}{contact && can('contacts') && <Link className="btn sm" to={`/contacts?open=${contact.id}`}>Open contact</Link>}
        {contact && <div className="stack-s"><div className="small muted">Marketing messages</div><div>{contact.waOptOut ? 'Said stop' : contact.waOptIn ? `Agreed${contact.waOptInAt ? ` on ${fmtDT(contact.waOptInAt)}` : ''}` : 'Not asked yet'}</div>
          {!contact.waOptOut && can('contacts', 'edit') && <Btn sm onClick={() => { update('contacts', contact.id, contact.waOptIn ? { waOptIn: false, waOptInAt: null } : { waOptIn: true, waOptInAt: new Date().toISOString() }); toast(contact.waOptIn ? 'Consent removed' : 'Consent recorded'); }}>{contact.waOptIn ? 'Remove consent' : 'They agreed to marketing'}</Btn>}</div>}
        {!contact && !cur.leadId && can('leads', 'create') && <Btn sm icon="UserPlus" onClick={() => { const l = create('leads', { name: /^[+\d]/.test(cur.name) ? 'WhatsApp enquiry' : cur.name, company: '', phone: cur.phone, email: '', status: 'New', source: 'WhatsApp', ownerId: cur.ownerId || db.users.find((u) => u.role === 'admin')?.id, expected: 0, notes: 'Started on WhatsApp.' }); patchQuiet('conversations', cur.id, { leadId: l.id }); toast('Lead created'); }}>Make a lead</Btn>}
        {cur.leadId && <Link className="btn sm" to={`/leads?open=${cur.leadId}`}>Open lead</Link>}</>}
      {cur.kind === 'team' && <ChatDetails key={cur.id} cur={cur} onJump={onJump} onClose={onLeft} />}
    </div>
  );
}

// One screen for both Chat and WhatsApp. `kind` picks which conversations it shows.
function Conversations({ kind, embedded, onCampaigns }) {
  const { db, me, t, can, scope, scopeOf, userName, simulateChatReply, simulateNewChat, setConversationStatus, sendMessage, markConversationRead, openConversation, createGroup, sendBroadcast, assignConversation, optionsOf, toast, patchChatMessage, patchQuiet, prefs, savePrefs } = useStore();
  const [broadcast, setBroadcast] = useState(false);
  const { canWhatsapp, canCall, canVideo, inCall, startCall } = useComms();
  const wa = kind === 'whatsapp';
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [emoji, setEmoji] = useState(false);
  const [info, setInfo] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [link, setLink] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [listMode, setListMode] = useState('All');
  const [tools, setTools] = useState(null);
  const [flash, setFlash] = useState(null);
  const [noteMode, setNoteMode] = useState(false);
  const [tpl, setTpl] = useState(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  const teamIds = useMemo(() => new Set(db.users.filter((u) => u.teamId && u.teamId === me.teamId).map((u) => u.id)), [db.users, me.teamId]);
  const sc = wa ? scopeOf('whatsapp') : 'own';
  const visible = db.conversations.filter((c) => c.kind === kind && !c.archived && (wa ? sc === 'all' || c.ownerId === me.id || (sc === 'team' && (teamIds.has(c.ownerId) || !c.ownerId)) : c.members.includes(me.id)));
  const otherOf = (c) => c.members.find((m) => m !== me.id);
  const nameOf = (c) => (c.group ? c.name : wa ? c.name : userName(otherOf(c)));
  const lastAt = (c) => c.messages[c.messages.length - 1]?.at || c.createdAt || '';
  const term = q.trim().toLowerCase();
  const hitOf = (c) => (!wa && term.length > 1 ? [...c.messages].reverse().find((m) => !m.deleted && (m.text || '').toLowerCase().includes(term)) : null);
  const mentionsMe = (c) => c.messages.some((m) => m.mentions?.includes(me.id) && !m.deleted);
  const list = visible.filter((c) => !term || nameOf(c).toLowerCase().includes(term) || hitOf(c)).filter((c) => (listMode === 'Unread' ? unreadOf(c, me.id) > 0 : listMode === 'Mentions' ? mentionsMe(c) : listMode === 'Open' ? (c.status || 'Open') === 'Open' : listMode === 'Resolved' ? c.status === 'Resolved' : listMode === 'Unassigned' ? !c.ownerId : true)).sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  const stateOf = (id) => db.prefs?.[id]?.chatStatus || presenceOf(id, me.id);
  const dotOf = (st) => ({ Available: 'online', Online: 'online', Busy: 'away', 'In a meeting': 'away', Away: 'away', Offline: 'offline' }[st] || 'offline');
  const jumpTo = (id, msgId) => {
    setOpenId(id);
    setTimeout(() => { document.getElementById(`msg-${msgId}`)?.scrollIntoView?.({ block: 'center' }); setFlash(msgId); setTimeout(() => setFlash(null), 1500); }, 150);
  };
  const cur = visible.find((c) => c.id === openId);
  const presence = cur && !wa && !cur.group ? stateOf(otherOf(cur)) : null;
  const person = !cur || cur.group ? null : wa ? { name: cur.name, phone: cur.phone, relatedType: 'contact', relatedId: cur.contactId || '', contactId: cur.contactId || '' } : (() => { const u = db.users.find((x) => x.id === otherOf(cur)); return u && { name: u.name, phone: u.phone, relatedType: '', relatedId: '' }; })();

  // On a wide screen, open the latest conversation, as a phone shows the list first.
  useEffect(() => { if (!openId && list[0] && window.matchMedia('(min-width: 901px)').matches) setOpenId(list[0].id); }, [openId, list[0]?.id]);
  useEffect(() => {
    const open = params.get('open');
    if (!wa && open) { setOpenId(open); setParams({}, { replace: true }); }
  }, [params]);
  useEffect(() => {
    const phone = params.get('phone');
    if (wa && phone && canWhatsapp) {
      setOpenId(openConversation('whatsapp', { id: params.get('whatsapp') || '', name: params.get('name') || phone, phone }));
      setParams({}, { replace: true });
    }
  }, [params]);
  useEffect(() => { if (cur && unreadOf(cur, me.id)) markConversationRead(cur.id); }, [cur?.id, cur?.messages.length]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [cur?.id, cur?.messages.length]);
  useEffect(() => { setText(''); setFile(null); setEmoji(false); setReplyTo(null); setEditing(null); setLink(null); setTools(null); setNoteMode(false); setTpl(null); }, [cur?.id]);

  const canSend = can(wa ? 'whatsapp' : 'messages', 'create') && (!wa || canWhatsapp);
  // WhatsApp only allows free text within 24 hours of the customer's last message. Outside that, it's templates only.
  const lastIn = wa && cur ? [...cur.messages].reverse().find((m) => !m.by) : null;
  const windowOpen = !wa || (lastIn && Date.now() - new Date(lastIn.at).getTime() < 864e5);
  const templates = wa ? optionsOf('messageTemplate') : [];
  const waSet = waOf(db.settings);
  const waTemplates = wa ? approved(templatesOf(db, templates)) : [];
  const consent = wa && cur ? consentOf(db, cur.contactId, cur.phone) : {};
  const optedOut = wa && (cur?.optOut || consent.optedOut);
  const pickTemplate = (id) => {
    const t = waTemplates.find((x) => x.id === id);
    if (!t) return;
    if (t.category === 'Marketing' && waSet.optInOnly && !consent.optedIn) { toast(`${cur.name.split(' ')[0]} hasn't agreed to marketing messages, so marketing templates are off for this chat.`, 'bad'); return; }
    setText(fillTemplate(t.body, { name: cur.name, company: db.settings.companyName, owner: userName(cur.ownerId) }));
    setTpl(t);
  };
  const quick = ['Thanks!', 'I will call you shortly.', 'Please share a good time to talk.'];
  const send = (e) => {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !file && !link) || !cur) return;
    if (editing) {
      patchChatMessage(cur.id, editing, { text: body, edited: true });
      setEditing(null); setText('');
      return;
    }
    if (wa) {
      if (noteMode) sendMessage(cur.id, body, 'Note', null, { note: true, net: null });
      else sendMessage(cur.id, body, 'Sent', null, tpl ? { templateId: tpl.id, buttons: tpl.buttons } : {});
      setTpl(null);
    } else {
      const everyone = cur.group && /@everyone\b/.test(body);
      const mentions = cur.members.filter((u) => u !== me.id && (everyone || body.includes(`@${userName(u)}`)));
      sendMessage(cur.id, body, 'Sent', file, { ...(replyTo ? { replyTo } : {}), ...(mentions.length ? { mentions } : {}), ...(link ? { link } : {}) });
    }
    setText(''); setFile(null); setEmoji(false); setReplyTo(null); setLink(null);
  };
  const memberNames = cur && !wa ? cur.members.filter((u) => u !== me.id).map((u) => userName(u)) : [];
  const allNames = cur && !wa ? cur.members.map((u) => userName(u)) : [];
  const mentionQuery = !wa && cur ? text.match(/(?:^|\s)@([^@]*)$/)?.[1] : undefined;
  const mentionOptions = mentionQuery === undefined ? [] : [...(cur.group ? ['everyone'] : []), ...memberNames].filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6);
  const pickMention = (n) => { setText(text.replace(/@([^@]*)$/, `@${n} `)); inputRef.current?.focus(); };
  const react = (m, emoji_) => patchChatMessage(cur.id, m.id, (x) => {
    const had = x.reactions?.[emoji_] || [];
    const next = had.includes(me.id) ? had.filter((u) => u !== me.id) : [...had, me.id];
    const reactions = { ...x.reactions, [emoji_]: next };
    if (!next.length) delete reactions[emoji_];
    return { reactions };
  });
  const toggleSaved = (m) => { const on = m.saved?.includes(me.id); patchChatMessage(cur.id, m.id, { saved: on ? m.saved.filter((u) => u !== me.id) : [...(m.saved || []), me.id] }); toast(on ? 'Removed from saved' : 'Message saved'); };
  const pinned = cur && !wa ? cur.messages.filter((m) => m.pinned && !m.deleted) : [];
  const attach = (f) => {
    if (f.size > FILE_LIMIT) { setFile({ id: uid('f'), name: f.name, size: f.size }); return; }
    const r = new FileReader();
    r.onload = () => setFile({ id: uid('f'), name: f.name, size: f.size, data: r.result });
    r.onerror = () => setFile({ id: uid('f'), name: f.name, size: f.size });
    r.readAsDataURL(f);
  };
  const seenByAll = (m) => cur.members?.filter((u) => u !== me.id).every((u) => cur.reads?.[u] >= m.at);
  const title = t(kind === 'team' ? 'messages' : 'whatsapp');
  if (wa && !canWhatsapp) return <div><PageHead title={title} /><div className="card"><Empty icon="MessageCircle" text="WhatsApp is turned off for you. Ask your admin." /></div></div>;
  return (
    <div>
      {!embedded && <><div className="crumbs"><Link to="/">Dashboard</Link><ChevronRight size={14} /><span>{title}</span></div>
      <PageHead title={title} sub={wa ? 'WhatsApp conversations with your contacts.' : 'Messages and conversations with your team.'} /></>}
      <div className={`card chatx ${cur ? 'has-thread' : ''}`}>
        <div className="chatx-list">
          <div className="chatx-search">
            <div className="tb-search grow" style={{ maxWidth: 'none' }}><Search size={15} /><input className="input" aria-label="Search conversations" placeholder="Search conversations…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {canSend && <Btn icon="Plus" aria-label="New conversation" title="New conversation" onClick={() => setNewChat(true)} />}
            {!wa && <Btn icon="Hash" aria-label="Browse channels" title="Browse channels" onClick={() => setBrowsing(true)} />}
            {!wa && <Btn icon="Bookmark" aria-label="Saved messages" title="Saved messages" onClick={() => setSavedOpen(true)} />}
            {canSend && wa && can('whatsapp', 'campaigns') && <Btn icon="Megaphone" aria-label="Campaigns" title="Campaigns" onClick={() => (onCampaigns ? onCampaigns() : setBroadcast(true))} />}
            {canSend && wa && <Btn icon="MessageSquarePlus" aria-label="Simulate a new customer writing" title="Simulate a new customer writing" onClick={() => { const id = simulateNewChat(); setOpenId(id); toast('A new customer wrote in (simulated)'); }} />}
          </div>
          {wa && <div style={{ padding: '0 10px 8px', overflowX: 'auto' }}><Pills value={listMode} onChange={setListMode} options={['All', 'Open', 'Unassigned', 'Resolved', 'Unread'].map((k) => ({ k, label: k, count: k === 'Unassigned' ? visible.filter((c) => !c.ownerId).length || undefined : undefined }))} /></div>}
          {!wa && <div className="row between wrap" style={{ padding: '0 10px 8px', gap: 6 }}>
            <Pills value={listMode} onChange={setListMode} options={['All', 'Unread', 'Mentions']} />
            <select className="select tb-filter" aria-label="My status" value={prefs.chatStatus || ''} onChange={(e) => { savePrefs({ chatStatus: e.target.value }); toast(e.target.value ? `Status: ${e.target.value}` : 'Status set to automatic'); }}>{CHAT_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>}
          <div className="chatx-rows">
            {list.map((c) => {
              const hit = term.length > 1 ? hitOf(c) : null;
              const last = c.messages[c.messages.length - 1];
              const n = unreadOf(c, me.id);
              const st = !wa && !c.group ? stateOf(otherOf(c)) : null;
              return (
                <button key={c.id} type="button" className={`chatx-row ${c.id === openId ? 'on' : ''}`} onClick={() => (hit ? jumpTo(c.id, hit.id) : setOpenId(c.id))}>
                  <span className="chatx-av">{c.group ? <span className="chatx-group"><Icon name="UsersRound" size={18} /></span> : <Avatar name={nameOf(c)} size={40} />}{st && <span className={`dot-st ${dotOf(st)}`} />}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="row between"><span className={`trunc notranslate ${n ? 'strong' : ''}`} translate="no">{nameOf(c)}</span>{last && <span className="small chatx-date nowrap">{listDate(last.at)}</span>}</span>
                    <span className="row between"><span className="small chatx-prev trunc">{hit ? hit.text : last ? (last.deleted ? 'Message deleted' : last.file && !last.text ? `Attachment: ${last.file.name}` : last.link && !last.text ? last.link.label : last.text) : 'No messages yet'}</span>{c.muted?.[me.id] && <Icon name="BellOff" size={12} color="var(--ink-3)" aria-label="Muted" />}{n > 0 && <span className="unread">{n}</span>}</span>
                  </span>
                </button>
              );
            })}
            {!list.length && <Empty icon="MessagesSquare" text="No conversations yet." />}
          </div>
        </div>
        <div className="chatx-thread">
          {!cur ? <Empty icon="MessageSquare" text="Pick a conversation to start." /> : (
            <>
              <div className="chatx-head">
                <Btn sm kind="ghost" icon="ArrowLeft" className="chat-back" aria-label="Back to conversations" onClick={() => setOpenId(null)} />
                <span className="chatx-av">{cur.group ? <span className="chatx-group"><Icon name="UsersRound" size={18} /></span> : <Avatar name={nameOf(cur)} size={40} />}{presence && <span className={`dot-st ${dotOf(presence)}`} />}</span>
                <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc notranslate" translate="no">{nameOf(cur)}</div><div className="small muted trunc">{cur.group ? (cur.topic || `${cur.members.length} members`) : presence || `${cur.phone}${sc !== 'own' ? ` · ${cur.ownerId ? userName(cur.ownerId) : 'Unassigned'}` : ''}${wa && cur.status === 'Resolved' ? ' · Resolved' : ''}`}</div></div>
                {wa && !cur.ownerId && canSend && <Btn sm kind="primary" onClick={() => { assignConversation(cur.id, me.id); toast('This chat is yours now'); }}>Take it</Btn>}
                {wa && canSend && <Btn sm kind="ghost" icon={cur.status === 'Resolved' ? 'RotateCcw' : 'CheckCircle2'} aria-label={cur.status === 'Resolved' ? 'Reopen this chat' : 'Mark this chat resolved'} title={cur.status === 'Resolved' ? 'Reopen' : 'Resolve'} onClick={() => { setConversationStatus(cur.id, cur.status === 'Resolved' ? 'Open' : 'Resolved'); toast(cur.status === 'Resolved' ? 'Chat reopened' : 'Chat resolved'); }} />}
                {person?.phone && canCall && <Btn sm kind="ghost" icon="Phone" aria-label={`Call ${person.name}`} title="Call" disabled={inCall} onClick={() => startCall('voice', person)} />}
                {person?.phone && canVideo && <Btn sm kind="ghost" icon="Video" aria-label={`Video call ${person.name}`} title="Video call" disabled={inCall} onClick={() => startCall('video', person)} />}
                <Btn sm kind="ghost" icon="Info" aria-label="Details" aria-pressed={info} title="Details" onClick={() => setInfo(!info)} />
              </div>
              {wa && <div className="chatx-note"><span className="grow small muted">Simulated: nothing reaches a real phone.</span><a className="btn sm" href={whatsappUrl(cur.phone)} target="_blank" rel="noreferrer"><Icon name="ExternalLink" size={14} />Open real WhatsApp</a><select className="select tb-filter" aria-label="Simulate a customer reply" value="" onChange={(e) => { if (e.target.value) { simulateChatReply(cur.id, e.target.value); toast('Customer reply simulated'); } }}><option value="">Simulate a reply…</option>{['Thanks for the update. Can we talk tomorrow?', 'What is the price?', 'STOP', 'START'].map((x) => <option key={x} value={x}>{x}</option>)}</select></div>}
              {pinned.length > 0 && <button type="button" className="chat-pinned" onClick={() => jumpTo(cur.id, pinned[pinned.length - 1].id)}><Icon name="Pin" size={13} /><span className="trunc grow">{pinned[pinned.length - 1].text || pinned[pinned.length - 1].file?.name}</span>{pinned.length > 1 && <span className="small muted">{pinned.length} pinned</span>}</button>}
              <div className="chatx-msgs">
                {cur.messages.map((m, i) => {
                  const mine = m.by === me.id;
                  const newDay = !i || !sameDay(cur.messages[i - 1].at, m.at);
                  const seen = !wa && mine && seenByAll(m);
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && <div className="chatx-day"><span>{dayLabel(m.at)}</span></div>}
                      <div id={`msg-${m.id}`} className={`chatx-msg ${mine || (wa && m.by) ? 'mine' : ''} ${m.note ? 'note' : ''} ${flash === m.id ? 'flash' : ''} ${tools === m.id ? 'show-tools' : ''}`}>
                        {!mine && (cur.group || (wa && m.by)) && <div className="small muted notranslate" translate="no">{userName(m.by)}</div>}
                        {m.replyTo && !m.deleted && (() => { const o = cur.messages.find((x) => x.id === m.replyTo); return o && <button type="button" className="chat-quote" onClick={() => jumpTo(cur.id, o.id)}><span className="strong">{userName(o.by)}</span> {o.deleted ? 'Message deleted' : (o.text || o.file?.name || '').slice(0, 70)}</button>; })()}
                        <div className="chatx-bubble" onClick={!wa ? () => setTools(tools === m.id ? null : m.id) : undefined}>
                          {m.deleted ? <em className="small">Message deleted</em> : <>
                          {m.file && (m.file.data ? <a className="chatx-file" href={m.file.data} download={m.file.name} onClick={(e) => e.stopPropagation()}><Paperclip size={14} /><span className="trunc">{m.file.name}</span></a> : <div className="chatx-file"><Paperclip size={14} /><span className="trunc">{m.file.name}</span></div>)}
                          {m.note && <div className="small strong">Private note</div>}
                          {m.auto && <div className="small muted">Automatic reply</div>}
                          {m.text && <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{wa ? m.text : <ChatText text={m.text} names={allNames} />}</div>}
                          {m.link && <RecordCard link={m.link} />}
                          {m.buttons?.length > 0 && <div className="wa-btns">{m.buttons.map((b) => <span key={b}>{b}</span>)}</div>}
                          </>}
                        </div>
                        {!!Object.keys(m.reactions || {}).length && !m.deleted && <div className="chat-reactions">{Object.entries(m.reactions).map(([e, who]) => <button key={e} type="button" className={who.includes(me.id) ? 'on' : ''} title={who.map((u) => userName(u)).join(', ')} aria-label={`${e}, ${who.length}`} onClick={() => react(m, e)}>{e} {who.length}</button>)}</div>}
                        {!wa && !m.deleted && canSend && <div className="chat-tools">
                          {QUICK_REACTIONS.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => react(m, e)}>{e}</button>)}
                          <button type="button" aria-label="Reply to this" title="Reply" onClick={() => { setReplyTo(m.id); setEditing(null); inputRef.current?.focus(); }}><Icon name="Reply" size={14} /></button>
                          <button type="button" aria-label={m.pinned ? 'Unpin' : 'Pin'} title={m.pinned ? 'Unpin' : 'Pin'} onClick={() => { patchChatMessage(cur.id, m.id, { pinned: !m.pinned }); toast(m.pinned ? 'Unpinned' : 'Pinned'); }}><Icon name={m.pinned ? 'PinOff' : 'Pin'} size={14} /></button>
                          <button type="button" aria-label={m.saved?.includes(me.id) ? 'Remove from saved' : 'Save'} title="Save" onClick={() => toggleSaved(m)}><Icon name={m.saved?.includes(me.id) ? 'BookmarkCheck' : 'Bookmark'} size={14} /></button>
                          {mine && <button type="button" aria-label="Edit" title="Edit" onClick={() => { setEditing(m.id); setReplyTo(null); setText(m.text || ''); inputRef.current?.focus(); }}><Icon name="Pencil" size={14} /></button>}
                          {mine && <button type="button" aria-label="Delete" title="Delete" onClick={() => { patchChatMessage(cur.id, m.id, { deleted: true, text: '', file: null, link: null, pinned: false, reactions: {} }); toast('Message deleted'); }}><Icon name="Trash2" size={14} /></button>}
                        </div>}
                        <div className="chatx-meta" title={fmtDT(m.at)}>{m.pinned && !m.deleted && <Icon name="Pin" size={11} aria-label="Pinned" />}{m.edited && !m.deleted && 'edited · '}{fmtTime(m.at)}{wa && mine && ['Sent', 'Delivered', 'Read'].includes(m.status) ? <Icon name={m.status === 'Sent' ? 'Check' : 'CheckCheck'} size={14} className={m.status === 'Read' ? 'seen' : ''} aria-label={m.status} /> : wa && mine && m.status ? ` · ${m.status}` : ''}{!wa && mine && <Icon name={seen ? 'CheckCheck' : 'Check'} size={14} className={seen ? 'seen' : ''} aria-label={seen ? 'Seen' : 'Sent'} />}</div>
                      </div>
                    </React.Fragment>
                  );
                })}
                {!cur.messages.length && <div className="sub muted" style={{ textAlign: 'center', padding: 20 }}>Say hello.</div>}
                <div ref={endRef} />
              </div>
              {canSend && (
                <form className={`chatx-compose ${noteMode ? 'note-mode' : ''}`} onSubmit={send}>
                  {wa && windowOpen && !optedOut && !noteMode && lastIn && db.settings.aiWriter !== false && <div className="wa-quick"><button type="button" className="wa-chip wa-ai" onClick={() => setText(suggestReply(lastIn.text))}><Icon name="Sparkles" size={12} />Suggested: {suggestReply(lastIn.text)}</button></div>}
                  {wa && windowOpen && !optedOut && !noteMode && <div className="wa-quick">{quick.map((x) => <button key={x} type="button" className="wa-chip" onClick={() => setText(x)}>{x}</button>)}</div>}
                  {wa && !windowOpen && <p className="notice" style={{ margin: '0 0 8px' }}>It's over 24 hours since {cur.name.split(' ')[0]} last wrote, so WhatsApp only allows an approved template until they reply. Choose one below.</p>}
                  {wa && optedOut && <p className="notice" style={{ margin: '0 0 8px' }}>{cur.name.split(' ')[0]} said stop, so you can't message them. You can still add a private note.</p>}
                  {wa && !optedOut && !noteMode && <div style={{ marginBottom: 8 }}><select className="select" aria-label="Message template" value="" onChange={(e) => pickTemplate(e.target.value)}><option value="">Use a template…</option>{waTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category}){t.category === 'Marketing' && waSet.optInOnly && !consent.optedIn ? ', needs consent' : ''}</option>)}</select></div>}
                  {mentionOptions.length > 0 && <div className="chat-mention-pop">{mentionOptions.map((n) => <button key={n} type="button" className="pop-item" onClick={() => pickMention(n)}><Avatar name={n} size={22} />{n === 'everyone' ? 'Everyone here' : n}</button>)}</div>}
                  {replyTo && <div className="chatx-chip"><Icon name="Reply" size={13} /><span className="trunc">Replying to {userName(cur.messages.find((x) => x.id === replyTo)?.by)}: {(cur.messages.find((x) => x.id === replyTo)?.text || '').slice(0, 50)}</span><button type="button" className="link-btn" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></button></div>}
                  {editing && <div className="chatx-chip"><Icon name="Pencil" size={13} /><span className="trunc grow">Editing your message</span><button type="button" className="link-btn" aria-label="Cancel editing" onClick={() => { setEditing(null); setText(''); }}><X size={14} /></button></div>}
                  {link && <div className="chatx-chip"><Icon name={link.icon} size={13} /><span className="trunc grow">{link.label}</span><button type="button" className="link-btn" aria-label="Remove record" onClick={() => setLink(null)}><X size={14} /></button></div>}
                  {file && <div className="chatx-chip"><Paperclip size={13} /><span className="trunc">{file.name}</span>{!file.data && <Badge tone="muted" dot={false}>Over 300 KB, so name only</Badge>}<button type="button" className="link-btn" aria-label="Remove attachment" onClick={() => setFile(null)}><X size={14} /></button></div>}
                  {emoji && <div className="chatx-emoji">{EMOJI.map((x) => <button key={x} type="button" aria-label={`Add ${x}`} onClick={() => { setText((p) => p + x); setEmoji(false); }}>{x}</button>)}</div>}
                  <div className="row">
                    {!wa && <><input ref={fileRef} type="file" hidden aria-label="Attach a file" onChange={(e) => { const f = e.target.files[0]; if (f) attach(f); e.target.value = ''; }} /><Btn kind="ghost" icon="Paperclip" aria-label="Attach a file" title="Attach a file" onClick={() => fileRef.current.click()} /><Btn kind="ghost" icon="Link2" aria-label="Share a record" title="Share a record" onClick={() => setSharing(true)} /></>}
                    <input ref={inputRef} className="input chatx-input" aria-label="Type a message" placeholder={noteMode ? "Private note. The customer won't see it." : optedOut ? 'They said stop' : !windowOpen ? 'Choose a template above' : wa ? 'Type a message…' : 'Type a message. Use @ to mention someone.'} readOnly={(!windowOpen || optedOut) && !noteMode} value={text} onChange={(e) => { setText(e.target.value); if (tpl) setTpl(null); }} />
                    {wa && <button type="button" className={`btn ghost ${noteMode ? 'on' : ''}`} aria-pressed={noteMode} aria-label="Private note" title="Private note for your team" onClick={() => { setNoteMode(!noteMode); setText(''); setTpl(null); }}><Icon name="StickyNote" size={17} /></button>}
                    <button type="button" className="btn ghost" aria-label="Add an emoji" aria-expanded={emoji} title="Add an emoji" onClick={() => setEmoji(!emoji)}><Smile size={17} /></button>
                    <button className="btn primary" type="submit" disabled={!text.trim() && !file && !link} aria-label={editing ? 'Save message' : 'Send message'}><Send size={15} /></button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
        {cur && info && <Info cur={{ ...cur, me: me.id }} title={nameOf(cur)} onClose={() => setInfo(false)} onJump={jumpTo} onLeft={() => { setInfo(false); setOpenId(null); }} />}
      </div>
      {broadcast && <Broadcast templates={templates} rows={scope(db.contacts).filter((c) => c.phone)} onClose={() => setBroadcast(false)} onSend={(list, tpl) => { const n = sendBroadcast(list, (c) => tpl.replace('{name}', c.first)); toast(`Broadcast sent to ${n} (simulated)`); setBroadcast(false); }} />}
      {newChat && <NewChat kind={kind} onClose={() => setNewChat(false)} onOpen={(x) => { setOpenId(openConversation(kind, x)); setNewChat(false); }} onGroup={(name, ids, extra) => { setOpenId(createGroup(name, ids, extra)); setNewChat(false); toast('Group created'); }} />}
      {sharing && <ShareRecord onClose={() => setSharing(false)} onPick={(x) => { setLink(x); setSharing(false); }} />}
      {browsing && <BrowseChannels onClose={() => setBrowsing(false)} onOpen={(id) => { setOpenId(id); setBrowsing(false); }} />}
      {savedOpen && <SavedMessages onClose={() => setSavedOpen(false)} onJump={jumpTo} />}
    </div>
  );
}

export default function Chat() {
  const [params] = useSearchParams();
  // Old alerts and links still point at /messages?whatsapp=1.
  if (params.get('whatsapp') != null) return <Navigate to={`/whatsapp?${params}`} replace />;
  return <Conversations kind="team" />;
}
const WhatsAppInbox = (props) => <Conversations kind="whatsapp" {...props} />;
export const WhatsApp = () => <WhatsAppPage Inbox={WhatsAppInbox} />;
