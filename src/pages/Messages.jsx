import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Send } from 'lucide-react';
import { unreadOf, useStore } from '../store';
import { Avatar, Badge, Btn, Empty, ListField, Modal, NoSections, PageHead, Pills, firstAllowed } from '../ui';
import { useComms, whatsappUrl } from '../comms';
import { fmtTime, relTime, uid } from '../util';


function NewChat({ onClose, onOpen }) {
  const { db, me, sec, can, scope } = useStore();
  const { canWhatsapp } = useComms();
  const kinds = [...(sec('messages', 'team') ? [{ k: 'team', label: 'Team member' }] : []), ...(canWhatsapp && sec('messages', 'whatsapp') ? [{ k: 'whatsapp', label: 'WhatsApp contact' }] : [])];
  const [kind, setKind] = useState(kinds[0]?.k);
  const [q, setQ] = useState('');
  const list = kind === 'team'
    ? db.users.filter((u) => u.id !== me.id && u.active).map((u) => ({ id: u.id, name: u.name, sub: u.title }))
    : (can('contacts') ? scope(db.contacts) : []).filter((c) => c.phone).map((c) => ({ id: c.id, name: `${c.first} ${c.last}`, sub: c.phone, phone: c.phone }));
  const shown = list.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <Modal size="sm" title="New conversation" onClose={onClose}>
      <div className="stack-s">
        {kinds.length > 1 && <Pills value={kind} onChange={setKind} options={kinds} />}
        <input className="input" autoFocus aria-label="Search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.map((x) => <button key={x.id} type="button" className="pop-item" onClick={() => onOpen(kind, x)}><Avatar name={x.name} size={28} /><span className="grow"><div className="strong trunc">{x.name}</div><div className="small muted trunc">{x.sub}</div></span></button>)}
        {!shown.length && <div className="sub muted">No matches.</div>}
      </div>
    </Modal>
  );
}

export default function Messages() {
  const { db, me, t, sec, can, scopeOf, userName, sendMessage, markConversationRead, openConversation, toast } = useStore();
  const { canWhatsapp } = useComms();
  const [params, setParams] = useSearchParams();
  const tabs = [{ k: 'team', label: 'Team chat', icon: 'MessagesSquare' }, ...(canWhatsapp ? [{ k: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' }] : [])].filter((x) => sec('messages', x.k));
  const [pref, setTab] = useState(params.get('whatsapp') != null ? 'whatsapp' : 'team');
  const tab = firstAllowed(tabs, pref);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [newChat, setNewChat] = useState(false);
  const endRef = useRef(null);

  const teamIds = useMemo(() => new Set(db.users.filter((u) => u.teamId && u.teamId === me.teamId).map((u) => u.id)), [db.users, me.teamId]);
  const sc = scopeOf('messages');
  const visible = db.conversations.filter((c) => (c.kind === 'team' ? c.members.includes(me.id) : (sc === 'all' || c.ownerId === me.id || (sc === 'team' && teamIds.has(c.ownerId)))));
  const nameOf = (c) => (c.kind === 'team' ? userName(c.members.find((m) => m !== me.id)) : c.name);
  const lastAt = (c) => c.messages[c.messages.length - 1]?.at || c.createdAt || '';
  const list = visible.filter((c) => c.kind === tab && nameOf(c).toLowerCase().includes(q.toLowerCase())).sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  const cur = visible.find((c) => c.id === openId && c.kind === tab);

  const open = (kind, x) => {
    const id = openConversation(kind, x);
    setTab(kind);
    setOpenId(id);
    setNewChat(false);
  };
  useEffect(() => {
    const phone = params.get('phone');
    if (phone && canWhatsapp) {
      open('whatsapp', { id: params.get('whatsapp') || '', name: params.get('name') || phone, phone });
      setParams({}, { replace: true });
    }
  }, [params]);
  useEffect(() => { if (cur && unreadOf(cur, me.id)) markConversationRead(cur.id); }, [cur?.id, cur?.messages.length]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [cur?.id, cur?.messages.length]);

  const canSend = can('messages', 'create');
  const send = (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !cur) return;
    if (cur.kind === 'whatsapp') {
      sendMessage(cur.id, body, 'Opened in WhatsApp');
      window.open(whatsappUrl(cur.phone, body), '_blank', 'noopener');
      toast('WhatsApp opened with your message. Press send there.');
    } else {
      sendMessage(cur.id, body, 'Sent');
    }
    setText('');
  };
  if (!tab) return <div><PageHead title={t('messages')} /><NoSections /></div>;
  return (
    <div>
      <PageHead title={t('messages')} sub={tab === 'team' ? 'Chat with your colleagues' : 'WhatsApp conversations with your contacts'}>
        {canSend && <Btn kind="primary" icon="Plus" onClick={() => setNewChat(true)}>New conversation</Btn>}
      </PageHead>
      <div className={`chat-layout ${cur ? 'has-thread' : ''}`}>
        <div className="card chat-list">
          <div style={{ padding: 10 }} className="stack-s">
            {tabs.length > 1 && <Pills value={tab} onChange={(k) => { setTab(k); setOpenId(null); }} options={tabs.map((x) => ({ ...x, count: visible.filter((c) => c.kind === x.k).reduce((a, c) => a + unreadOf(c, me.id), 0) || undefined }))} />}
            <div className="tb-search" style={{ maxWidth: 'none' }}><Search size={15} /><input className="input" aria-label="Search conversations" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="chat-rows">
            {list.map((c) => {
              const last = c.messages[c.messages.length - 1];
              const n = unreadOf(c, me.id);
              return (
                <button key={c.id} type="button" className={`chat-row ${c.id === openId ? 'on' : ''}`} onClick={() => setOpenId(c.id)}>
                  <Avatar name={nameOf(c)} size={36} />
                  <span className="grow">
                    <span className="row between"><span className={`trunc ${n ? 'strong' : ''}`} style={{ fontWeight: n ? 650 : 550 }}>{nameOf(c)}</span>{last && <span className="small muted nowrap">{relTime(last.at)}</span>}</span>
                    <span className="row between"><span className="small muted trunc">{last ? last.text : 'No messages yet'}</span>{n > 0 && <span className="unread">{n}</span>}</span>
                  </span>
                </button>
              );
            })}
            {!list.length && <Empty icon="MessagesSquare" text="No conversations yet." />}
          </div>
        </div>
        <div className="card chat-thread">
          {!cur ? <Empty icon="MessageSquare" text="Pick a conversation to start." /> : (
            <>
              <div className="chat-head">
                <Btn sm kind="ghost" icon="ArrowLeft" className="chat-back" aria-label="Back to conversations" onClick={() => setOpenId(null)} />
                <Avatar name={nameOf(cur)} size={32} />
                <div className="grow"><div className="strong trunc">{nameOf(cur)}</div><div className="small muted trunc">{cur.kind === 'team' ? 'Team chat' : `${cur.phone}${sc !== 'own' ? ` · ${userName(cur.ownerId)}` : ''}`}</div></div>
                {cur.kind === 'whatsapp' && cur.contactId && can('contacts') && <Link className="btn sm" to={`/contacts?open=${cur.contactId}`}>Contact</Link>}
              </div>
              {cur.kind === 'whatsapp' && <div className="notice" style={{ margin: 10, marginBottom: 0 }}>Sending opens WhatsApp with your message ready. Incoming replies appear here only after WhatsApp Business is connected. Earlier messages shown are samples.</div>}
              <div className="chat-msgs">
                {cur.messages.map((m) => {
                  const mine = m.by === me.id;
                  const name = m.by ? userName(m.by) : cur.name;
                  return (
                    <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
                      <div className="bubble">
                        {!mine && cur.kind === 'whatsapp' && m.by && <div className="small strong">{name}</div>}
                        <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{m.text}</div>
                        <div className="bubble-meta">{fmtTime(m.at)}{m.status && mine ? ` · ${m.status}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
                {!cur.messages.length && <div className="sub muted" style={{ textAlign: 'center', padding: 20 }}>Say hello.</div>}
                <div ref={endRef} />
              </div>
              {canSend && (!(cur.kind === 'whatsapp') || canWhatsapp) && (
                <form className="chat-compose" onSubmit={send}>
                  {cur.kind === 'whatsapp' && (
                    <div style={{ marginBottom: 6 }}><ListField f={{ k: 'template', label: 'Template', ariaLabel: 'Message template', type: 'select', list: 'messageTemplate', blankLabel: 'Use a template…', format: (x) => x.replace('{name}', cur.name.split(' ')[0]) }} value="" onChange={(_, x) => { if (x) setText(x.replace('{name}', cur.name.split(' ')[0])); }} /></div>
                  )}
                  <div className="row">
                    <input className="input" aria-label="Type a message" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} />
                    <button className="btn primary" type="submit" disabled={!text.trim()} aria-label="Send message"><Send size={15} /></button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
      {newChat && <NewChat onClose={() => setNewChat(false)} onOpen={open} />}
    </div>
  );
}
