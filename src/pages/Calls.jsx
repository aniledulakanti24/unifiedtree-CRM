import React, { useMemo, useState } from 'react';
import { Delete, Phone, Video } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, DataTable, Kpi, PageHead, RecordModal, UserChip } from '../ui';
import { fmtDuration, personOfContact, useComms } from '../comms';
import { fmtDT, num, pct, sum } from '../util';
import { contactCaller, matchCaller } from '../mockBackend';

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
              <div className="grow"><div className="strong trunc">{p.name}</div><div className="small muted trunc">{p.sub}</div></div>
              {canCall && <Btn sm icon="Phone" aria-label={`Call ${p.name}`} disabled={inCall} onClick={() => { startCall('voice', p); setQ(''); }} />}
              {canVideo && <Btn sm icon="Video" aria-label={`Video call ${p.name}`} disabled={inCall} onClick={() => { startCall('video', p); setQ(''); }} />}
            </div>
          );
        })}
        <div className="row">
          <input className="input num dial-input" aria-label="Phone number" placeholder="+1 555 0100" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#\s-]/g, ''))} />
          <Btn kind="ghost" aria-label="Delete last digit" onClick={() => setNumber((n) => n.slice(0, -1))}><Delete size={16} /></Btn>
        </div>
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
  const fields = [
    { k: 'contactId', label: 'Customer calling', type: 'select', full: true, blankLabel: 'Pick a contact…', options: contacts.map((c) => ({ value: c.id, label: `${c.first} ${c.last}` })) },
    { k: 'phone', label: 'Or a phone number', full: true, placeholder: '+91 98000 00000', hint: 'A number not in the CRM rings the managers first.' },
  ];
  return (
    <RecordModal size="sm" title="Simulate a customer calling" saveLabel="Start the call" fields={fields} onClose={onClose} check={(v) => (v.contactId || v.phone?.trim() ? {} : { phone: 'Pick a contact or enter a number.' })}
      onSave={(v) => { const c = db.contacts.find((x) => x.id === v.contactId); simulateIncoming(c ? contactCaller(db, c) : matchCaller(db, v.phone.trim())); }} />
  );
}

export default function Calls() {
  const { db, me, t, sec, scope, scopeOf, companyName, userName, optionsOf } = useStore();
  const { startCall, simulateIncoming, canCall, canVideo, inCall } = useComms();
  const [simulating, setSimulating] = useState(false);
  const rows = useMemo(() => scope(db.calls), [db.calls, me.id]);
  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.filter((c) => c.at.slice(0, 10) === today);
  const connected = rows.filter((c) => c.outcome === 'Connected');
  const showDialer = sec('calls', 'dialer');
  const showLog = sec('calls', 'log');
  return (
    <div>
      <PageHead title={t('calls')} sub={`Demo calling. Your business number is ${db.settings.businessNumber}`}>
        <Btn icon="PhoneIncoming" disabled={inCall} onClick={() => setSimulating(true)}>Simulate a customer calling</Btn>
      </PageHead>
      {simulating && <SimulateDialog onClose={() => setSimulating(false)} />}
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
          <DataTable rows={rows} exportName="calls" initialSort={{ k: 'at', dir: 'desc' }}
            statusTabs={{ options: ['Outgoing', 'Incoming'], get: (c) => c.direction }}
            filters={[{ k: 'outcome', label: 'Outcome', get: (c) => c.outcome, options: optionsOf('callOutcome') }, { k: 'type', label: 'Type', get: (c) => (c.type === 'video' ? 'Video' : 'Voice'), options: ['Voice', 'Video'] }]}
            columns={[
              { k: 'name', label: 'Contact', render: (c) => <div><div className="strong">{c.name}</div><div className="small muted">{c.companyId ? companyName(c.companyId) : c.phone}</div></div> },
              { k: 'kind', label: 'Type', value: (c) => `${c.direction} ${c.type}`, render: (c) => <span className="row small">{c.type === 'video' ? <Video size={14} /> : <Phone size={14} />}{c.direction}</span> },
              { k: 'outcome', label: 'Outcome', render: (c) => <Badge tone={c.outcome === 'Connected' ? 'good' : c.outcome === 'Wrong number' ? 'bad' : 'warn'}>{c.outcome}</Badge> },
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
    </div>
  );
}
