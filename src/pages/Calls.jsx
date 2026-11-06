import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Delete, Phone, Video } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, DataTable, Drawer, Empty, Icon, Kpi, Modal, NoSections, PageHead, RecordModal, Tabs, UserChip, firstAllowed } from '../ui';
import { speak, stopSpeaking } from '../aiVoice';
import { actionItems } from '../assistant';
import { fmtDuration, personOfContact, useComms } from '../comms';
import { fmtDT, num, pct, sum } from '../util';
import { contactCaller, matchCaller } from '../mockBackend';
import { phoneOf } from '../callTools';
import { CallInsights, CoachingCard, LocalTime, Missed, PhoneSetup, VideoMeetings } from './CallExtras';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function Dialer() {
  const { db, can, scope, companyName } = useStore();
  const { startCall, canCall, canVideo, inCall } = useComms();
  const [number, setNumber] = useState('');
  const [q, setQ] = useState('');
  const contacts = can('contacts') ? scope(db.contacts) : [];
  const matches = q.trim() ? contacts.filter((c) => `${c.first} ${c.last} ${companyName(c.companyId)}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  const dialed = { name: number, phone: number, relatedType: '', relatedId: '' };
  return (
    <Card title="Dialer" sub={canCall ? 'Pick a contact or dial a number' : "Calling isn't enabled for you"}>
      <div className="stack-s">
        {can('contacts') && <input className="input" aria-label="Search contacts" placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {matches.map((c) => {
          const p = personOfContact(c, companyName(c.companyId));
          return (
            <div key={c.id} className="dashlet" style={{ padding: '6px 0' }}>
              <Avatar name={p.name} size={28} />
              <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{p.name}</div><div className="small muted trunc">{p.sub}</div><LocalTime phone={p.phone} /></div>
              {canCall && <Btn sm icon="Phone" aria-label={`Call ${p.name}`} disabled={inCall} onClick={() => { startCall('voice', p); setQ(''); }} />}
              {canVideo && <Btn sm icon="Video" aria-label={`Video call ${p.name}`} disabled={inCall} onClick={() => { startCall('video', p); setQ(''); }} />}
            </div>
          );
        })}
        <div className="row">
          <input className="input num dial-input" aria-label="Phone number" placeholder="+1 555 0100" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#\s-]/g, ''))} />
          <Btn kind="ghost" aria-label="Delete last digit" onClick={() => setNumber((n) => n.slice(0, -1))}><Delete size={16} /></Btn>
        </div>
        <LocalTime phone={number} />
        <div className="keypad">
          {KEYS.map((k) => <button key={k} type="button" className="key" onClick={() => setNumber((n) => n + k)}>{k}</button>)}
        </div>
        <div className="row">
          {canCall && <Btn kind="primary" className="grow" icon="Phone" disabled={!number.trim() || inCall} onClick={() => startCall('voice', dialed)}>Call</Btn>}
          {canVideo && <Btn className="grow" icon="Video" disabled={!number.trim() || inCall} onClick={() => startCall('video', dialed)}>Video</Btn>}
        </div>
      </div>
    </Card>
  );
}

// Plays the part of a customer ringing the business number.
function SimulateDialog({ onClose }) {
  const { db, can, scope } = useStore();
  const { simulateIncoming } = useComms();
  const contacts = can('contacts') ? [...scope(db.contacts)].sort((a, b) => a.first.localeCompare(b.first)) : [];
  const menu = phoneOf(db.settings).menu;
  const fields = [
    ...(menu.on ? [{ k: 'menuKey', label: 'In the phone menu, they press', type: 'select', full: true, blankLabel: 'Nothing', options: menu.options.map((o) => ({ value: o.key, label: `${o.key}: ${o.label}` })) }] : []),
    { k: 'contactId', label: 'Customer calling', type: 'select', full: true, blankLabel: 'Pick a contact…', options: contacts.map((c) => ({ value: c.id, label: `${c.first} ${c.last}` })) },
    { k: 'phone', label: 'Or a phone number', full: true, placeholder: '+1 555 010 0000', hint: 'A number not in the CRM rings the managers first.' },
  ];
  return (
    <RecordModal size="sm" title="Simulate a customer calling" saveLabel="Start the call" fields={fields} onClose={onClose} check={(v) => (v.contactId || v.phone?.trim() ? {} : { phone: 'Pick a contact or enter a number.' })}
      onSave={(v) => { const c = db.contacts.find((x) => x.id === v.contactId); simulateIncoming(c ? contactCaller(db, c) : matchCaller(db, v.phone.trim()), v.menuKey); }} />
  );
}

// Builds a list to work through: new leads, late follow-ups or contacts.
function CallList({ onClose }) {
  const { db, can, scope, companyName } = useStore();
  const { startDialer } = useComms();
  const lists = {
    ...(can('followups') ? { follow: ['Follow-ups due', scope(db.followups).filter((f) => f.status === 'open' && f.phone && f.at <= new Date().toISOString()).map((f) => ({ name: f.name, phone: f.phone, relatedType: f.relatedType, relatedId: f.relatedId, contactId: f.contactId, reason: f.title }))] } : {}),
    ...(can('leads') ? { leads: ['New leads, highest score first', scope(db.leads).filter((l) => l.status === 'New' && l.phone).sort((a, b) => b.score - a.score).map((l) => ({ name: l.name, phone: l.phone, sub: l.company, relatedType: 'lead', relatedId: l.id, reason: `${l.company}, score ${l.score}` }))] } : {}),
    ...(can('contacts') ? { warm: ['Warm contacts', scope(db.contacts).filter((c) => c.status === 'Warm' && c.phone).map((c) => personOfContact(c, companyName(c.companyId)))] } : {}),
  };
  const [pick, setPick] = useState(Object.keys(lists)[0]);
  const rows = lists[pick]?.[1] || [];
  return (
    <Modal size="sm" title="Start a call list" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Play" disabled={!rows.length} onClick={() => { startDialer(rows.slice(0, 50)); onClose(); }}>Start with {Math.min(rows.length, 50)}</Btn></>}>
      <div className="stack-s">
        <p className="sub" style={{ margin: 0 }}>Work through people one by one. After you log each call, the next person comes up.</p>
        <select className="select" aria-label="Who to call" value={pick} onChange={(e) => setPick(e.target.value)}>{Object.entries(lists).map(([k, [l, r]]) => <option key={k} value={k}>{l} ({r.length})</option>)}</select>
        {rows.slice(0, 5).map((p) => <div key={p.relatedId || p.phone} className="dashlet"><Avatar name={p.name} size={26} /><span className="grow trunc">{p.name}</span><span className="small muted nowrap">{p.phone}</span></div>)}
        {rows.length > 5 && <div className="small muted">And {rows.length - 5} more.</div>}
      </div>
    </Modal>
  );
}

function CallDetail({ call, onClose }) {
  const { userName, companyName, can, create, db, me, toast } = useStore();
  const [added, setAdded] = useState([]);
  useEffect(() => stopSpeaking, []);
  const items = actionItems(call.lines, call.note);
  const addTask = (text) => { create('activities', { typeId: db.activityTypes[0]?.id, summary: `${text}: ${call.name}`, due: new Date(Date.now() + 864e5).toISOString().slice(0, 10), ownerId: call.ownerId || me.id, note: 'Suggested from a call.', status: 'todo', priority: 'Medium', tag: 'Sales', relatedType: call.relatedType || '', relatedId: call.relatedId || '', relatedLabel: call.name }); setAdded((p) => [...p, text]); toast('Task added'); };
  const voice = { language: 'English', voice: 'Asha (female)' };
  return (
    <Drawer title={call.name} onClose={onClose}>
      <div className="stack">
        <div className="row wrap"><Badge tone={call.outcome === 'Connected' ? 'good' : 'warn'}>{call.outcome}</Badge><Badge tone="muted" dot={false}>{call.direction}</Badge>{call.recording && <Badge tone="info" dot={false}>Recorded</Badge>}</div>
        <dl className="dl"><dt>Phone</dt><dd>{call.phone}</dd>{call.companyId && <><dt>Customer</dt><dd>{companyName(call.companyId)}</dd></>}<dt>When</dt><dd>{fmtDT(call.at)}</dd><dt>Length</dt><dd>{fmtDuration(call.duration)}</dd>{call.businessNumber && <><dt>{call.direction === 'Incoming' ? 'They dialled' : 'They saw'}</dt><dd>{call.businessNumber}</dd></>}<dt>By</dt><dd>{userName(call.ownerId)}</dd>{call.transferredTo && <><dt>Transferred to</dt><dd>{userName(call.transferredTo)}</dd></>}<dt>Notes</dt><dd>{call.note || '—'}</dd></dl>
        {call.voicemail && <div><div className="label">Voicemail, {call.voicemail.seconds} seconds</div><p style={{ margin: '4px 0 0' }}>“{call.voicemail.text}”</p></div>}
        {can('tasks', 'create') && db.settings.aiWriter !== false && <div><div className="label" style={{ marginBottom: 6 }}>Suggested next steps</div>{items.map((x) => <div key={x} className="dashlet"><span className="grow small">{x}</span>{added.includes(x) ? <Badge tone="good" dot={false}>Added</Badge> : <Btn sm icon="Plus" onClick={() => addTask(x)}>Add task</Btn>}</div>)}</div>}
        {call.recording ? (
          <>
            <div><div className="label">Summary</div><p style={{ margin: '4px 0 0' }}>{call.summary}</p></div>
            {call.announced && <div className="small muted">Recording was announced to both sides.</div>}
            <CoachingCard call={call} />
            <div>
              <div className="row between" style={{ marginBottom: 6 }}><div className="label">Transcript</div><span className="row"><Btn sm icon="Play" onClick={() => speak(call.lines.map((l) => l.text).join(' '), voice)}>Play</Btn><Btn sm icon="Square" aria-label="Stop playing" onClick={stopSpeaking} /></span></div>
              <div className="ai-transcript">{call.lines.map((l, i) => <div key={i} className={`ai-line ${l.who === 'you' ? '' : 'person'}`}><span className="small strong">{l.who === 'you' ? userName(call.ownerId) : call.name}</span><div>{l.text}</div></div>)}</div>
            </div>
            <div className="notice">Simulated recording. No audio was captured, the words are sample text, and Play reads them with your browser's voice.</div>
          </>
        ) : <Empty icon="Mic" text="This call wasn't recorded. Press Record during a call." />}
      </div>
    </Drawer>
  );
}

export default function Calls() {
  const { db, me, t, sec, scope, scopeOf, companyName, userName, optionsOf } = useStore();
  const { startCall, simulateIncoming, canCall, canVideo, inCall } = useComms();
  const [simulating, setSimulating] = useState(false);
  const [listing, setListing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const rows = useMemo(() => scope(db.calls), [db.calls, me.id]);
  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.filter((c) => c.at.slice(0, 10) === today);
  const connected = rows.filter((c) => c.outcome === 'Connected');
  const showDialer = sec('calls', 'dialer');
  const showLog = sec('calls', 'log');
  const { prefs, savePrefs } = useStore();
  const asked = new URLSearchParams(useLocation().search).get('tab');
  const tabs = [{ k: 'calls', label: 'Calls', icon: 'Phone', show: showDialer || showLog || sec('calls', 'kpis') }, { k: 'voicemail', label: 'Missed and voicemail', icon: 'Voicemail', count: rows.filter((c) => c.direction === 'Incoming' && ['No answer', 'Left voicemail'].includes(c.outcome) && !c.handled).length || undefined }, { k: 'meetings', label: 'Video meetings', icon: 'Video' }, { k: 'insights', label: 'Coaching and results', icon: 'BarChart3' }, { k: 'setup', label: 'Phone setup', icon: 'Settings2' }].filter((x) => x.show !== false && (x.k === 'calls' || sec('calls', x.k)));
  const [picked, setPicked] = useState(asked || prefs.callsTab);
  useEffect(() => { if (asked) setPicked(asked); }, [asked]);
  const tab = firstAllowed(tabs, picked);
  return (
    <div>
      <PageHead title={t('calls')} sub={`Demo calling. Your business number is ${db.settings.businessNumber}`}>
        <Btn icon="PhoneIncoming" disabled={inCall} onClick={() => setSimulating(true)}>Simulate a customer calling</Btn>
        {canCall && <Btn kind="primary" icon="ListOrdered" disabled={inCall} onClick={() => setListing(true)}>Start a call list</Btn>}
      </PageHead>
      {simulating && <SimulateDialog onClose={() => setSimulating(false)} />}
      {listing && <CallList onClose={() => setListing(false)} />}
      {rows.find((c) => c.id === openId) && <CallDetail call={rows.find((c) => c.id === openId)} onClose={() => setOpenId(null)} />}
      {!tabs.length && <NoSections />}
      {tabs.length > 1 && <div style={{ marginBottom: 14 }}><Tabs value={tab} onChange={(k) => { setPicked(k); savePrefs({ callsTab: k }); }} tabs={tabs} /></div>}
      {tab === 'calls' && <>
      {sec('calls', 'kpis') && (
        <div className="g4" style={{ marginBottom: 14 }}>
          <Kpi label="Calls today" value={num(todays.length)} icon="PhoneCall" />
          <Kpi label="Connect rate" value={pct(rows.length ? (connected.length / rows.length) * 100 : 0)} note={`${connected.length} of ${rows.length} calls`} icon="Target" />
          <Kpi label="Talk time" value={`${Math.round(sum(rows, (c) => c.duration) / 60)} min`} note="All logged calls" icon="Timer" />
          <Kpi label="Missed incoming" value={num(rows.filter((c) => c.direction === 'Incoming' && c.outcome === 'No answer').length)} note="Call these people back" icon="PhoneMissed" />
        </div>
      )}
      <div className="g-12" style={{ alignItems: 'start', gridTemplateColumns: showDialer && showLog ? 'minmax(260px, 320px) minmax(0, 1fr)' : undefined }}>
        {showDialer && <Dialer />}
        {showLog && (
          <DataTable rows={rows} exportName="calls" dateOf={(c) => c.at} onRow={(c) => setOpenId(c.id)} initialSort={{ k: 'at', dir: 'desc' }}
            statusTabs={{ options: ['Outgoing', 'Incoming'], get: (c) => c.direction }}
            filters={[{ k: 'outcome', label: 'Outcome', get: (c) => c.outcome, options: optionsOf('callOutcome') }, { k: 'type', label: 'Type', get: (c) => (c.type === 'video' ? 'Video' : 'Voice'), options: ['Voice', 'Video'] }]}
            columns={[
              { k: 'name', label: 'Contact', render: (c) => <div><div className="strong">{c.name}</div><div className="small muted">{c.companyId ? companyName(c.companyId) : c.phone}</div></div> },
              { k: 'kind', label: 'Type', value: (c) => `${c.direction} ${c.type}`, render: (c) => <span className="row small">{c.type === 'video' ? <Video size={14} /> : <Phone size={14} />}{c.direction}</span> },
              { k: 'outcome', label: 'Outcome', render: (c) => <span className="row" style={{ gap: 6 }}><Badge tone={c.outcome === 'Connected' ? 'good' : c.outcome === 'Wrong number' ? 'bad' : 'warn'}>{c.outcome}</Badge>{c.recording && <Icon name="CircleDot" size={13} color="var(--bad)" aria-label="Recorded" />}</span> },
              { k: 'duration', label: 'Length', align: 'r', render: (c) => fmtDuration(c.duration) },
              { k: 'note', label: 'Notes', hidden: true },
              { k: 'businessNumber', label: 'Business number', hidden: true },
              { k: 'owner', label: 'Salesperson', omit: scopeOf('calls') === 'own', value: (c) => userName(c.ownerId), render: (c) => <UserChip id={c.ownerId} /> },
              { k: 'at', label: 'When', nowrap: true, render: (c) => fmtDT(c.at) },
              { k: 'back', label: '', sort: false, stop: true, value: () => '', render: (c) => <span className="row" style={{ justifyContent: 'flex-end' }}>
                {c.phone && <Btn sm icon="PhoneIncoming" title="Simulate this customer calling back" aria-label={`Simulate ${c.name} calling back`} disabled={inCall} onClick={() => simulateIncoming(c.relatedType === 'contact' && db.contacts.some((x) => x.id === c.relatedId) ? contactCaller(db, db.contacts.find((x) => x.id === c.relatedId)) : matchCaller(db, c.phone))} />}
                {canCall && <Btn sm icon="Phone" aria-label={`Call ${c.name} back`} disabled={inCall} onClick={() => startCall('voice', { name: c.name, phone: c.phone, relatedType: c.relatedType, relatedId: c.relatedId, contactId: c.relatedType === 'contact' ? c.relatedId : '', companyId: c.companyId })} />}
                {canVideo && <Btn sm icon="Video" aria-label={`Video call ${c.name}`} disabled={inCall} onClick={() => startCall('video', { name: c.name, phone: c.phone, relatedType: c.relatedType, relatedId: c.relatedId, contactId: c.relatedType === 'contact' ? c.relatedId : '', companyId: c.companyId })} />}
              </span> },
            ]} />
        )}
      </div>
      </>}
      {tab === 'voicemail' && <Missed onOpen={setOpenId} />}
      {tab === 'meetings' && <VideoMeetings />}
      {tab === 'insights' && <CallInsights onOpen={setOpenId} />}
      {tab === 'setup' && <PhoneSetup />}
    </div>
  );
}
