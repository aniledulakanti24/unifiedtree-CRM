import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, PhoneIncoming, Mic, MicOff, Pause, Phone, PhoneOff, Play, Video, VideoOff, Minus, Maximize2 } from 'lucide-react';
import { useStore } from './store';
import { Avatar, Btn, FormFields, ListField, Modal, validate } from './ui';
import { fmtDT, pad, uid } from './util';
import { RING_SECONDS, ringOrder } from './mockBackend';

export const CHANNELS = { Call: 'Phone', Video: 'Video', WhatsApp: 'MessageCircle', Email: 'Mail', Meeting: 'Users' };
export const fmtDuration = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;
export const whatsappUrl = (phone, text = '') => `https://wa.me/${(phone || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const localInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };

export const personOfContact = (c, companyName) => ({ name: `${c.first} ${c.last}`, phone: c.phone, relatedType: 'contact', relatedId: c.id, label: `${c.first} ${c.last}`, companyId: c.companyId, sub: companyName, contactId: c.id });
export const reminderTrigger = (f) => f.snoozedUntil || new Date(new Date(f.at).getTime() - (f.remindBefore || 0) * 6e4).toISOString();

const MEETING_LEAD = 15 * 6e4;
const Ctx = createContext(null);
export const useComms = () => useContext(Ctx);

export function FollowupDialog({ initial, person, onClose }) {
  const { me, db, can, scope, create, update, toast } = useStore();
  const editing = !!initial?.id;
  const [v, setV] = useState(() => initial ? { ...initial, at: localInput(initial.at) } : { title: person ? `Follow up with ${person.name}` : '', at: localInput(Date.now() + 864e5), channel: 'Call', remindBefore: 15, ownerId: me.id, contactId: person?.contactId || '', note: '' });
  const [errors, setErrors] = useState({});
  const contacts = can('contacts') ? [...scope(db.contacts)].sort((a, b) => a.first.localeCompare(b.first)) : [];
  const fields = [
    { k: 'title', label: 'What to follow up on', req: true, full: true },
    { k: 'at', label: 'When', type: 'datetime-local', req: true },
    { k: 'channel', label: 'How', type: 'select', noBlank: true, list: 'followupChannel' },
    { k: 'remindBefore', label: 'Remind me', type: 'select', noBlank: true, list: 'reminderTime' },
    { k: 'ownerId', label: 'Assigned to', type: 'user', req: true },
    { k: 'contactId', label: 'Contact', type: 'select', hide: !!person, options: contacts.map((c) => ({ value: c.id, label: `${c.first} ${c.last}` })) },
    { k: 'note', label: 'Notes', type: 'textarea' },
  ];
  const save = () => {
    const e = validate(fields, v);
    setErrors(e);
    if (Object.keys(e).length) return;
    const c = db.contacts.find((x) => x.id === v.contactId);
    const rec = { ...v, at: new Date(v.at).toISOString(), remindBefore: Number(v.remindBefore), status: v.status || 'open', name: person?.name || (c ? `${c.first} ${c.last}` : v.name || ''), phone: person?.phone || c?.phone || v.phone || '', relatedType: person?.relatedType || (c ? 'contact' : v.relatedType || ''), relatedId: person?.relatedId || c?.id || v.relatedId || '', snoozedUntil: null, ackFor: null, notifiedFor: null };
    if (editing) { const { id, ...rest } = rec; update('followups', id, rest); toast('Follow-up saved'); } else { create('followups', rec); toast('Follow-up scheduled. You will get a reminder.'); }
    onClose();
  };
  return (
    <Modal title={editing ? 'Edit follow-up' : 'Schedule follow-up'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      {person && <div className="sub" style={{ marginBottom: 12 }}>With <strong>{person.name}</strong></div>}
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
    </Modal>
  );
}

function WrapUp({ call, onDone }) {
  const { me, db, create, update, addChatter, toast } = useStore();
  const [outcome, setOutcome] = useState(call.seconds > 0 || call.direction === 'Incoming' ? 'Connected' : 'No answer');
  const [note, setNote] = useState('');
  const [follow, setFollow] = useState(false);
  const [at, setAt] = useState(localInput(Date.now() + 864e5));
  const save = () => {
    const p = call.person;
    create('calls', { type: call.type, direction: call.direction || 'Outgoing', businessNumber: db.settings.businessNumber, name: p.name, phone: p.phone, companyId: p.companyId || '', relatedType: p.relatedType || '', relatedId: p.relatedId || '', ownerId: me.id, at: call.startedAt, duration: call.seconds, outcome, note, demo: true });
    if (p.relatedType && p.relatedId) addChatter(`${p.relatedType}:${p.relatedId}`, 'activity', `${call.direction === 'Incoming' ? 'Incoming call' : call.type === 'video' ? 'Video call' : 'Call'}, ${outcome.toLowerCase()}, ${fmtDuration(call.seconds)}${note ? `: ${note}` : ''}`);
    if (p.relatedType === 'contact' && db.contacts.some((c) => c.id === p.relatedId)) update('contacts', p.relatedId, { lastActivity: new Date().toISOString() });
    if (follow) create('followups', { title: `Follow up with ${p.name}`, at: new Date(at).toISOString(), channel: 'Call', remindBefore: 15, ownerId: me.id, contactId: p.contactId || '', name: p.name, phone: p.phone, relatedType: p.relatedType || '', relatedId: p.relatedId || '', status: 'open', note });
    toast(follow ? 'Call logged and follow-up scheduled' : 'Call logged');
    onDone();
  };
  return (
    <div className="call-body stack-s">
      <div className="strong">Log this {call.type === 'video' ? 'video call' : 'call'}</div>
      <div className="small muted">{call.person.name} · {fmtDuration(call.seconds)}</div>
      <div className="field"><label className="label">Outcome</label><ListField f={{ k: 'outcome', label: 'Outcome', type: 'select', noBlank: true, list: 'callOutcome' }} value={outcome} onChange={(_, x) => setOutcome(x)} /></div>
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was discussed?" /></div>
      <label className="check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />Schedule a follow-up</label>
      {follow && <input className="input" type="datetime-local" aria-label="Follow-up time" value={at} onChange={(e) => setAt(e.target.value)} />}
      <Btn kind="primary" onClick={save}>Save call</Btn>
    </div>
  );
}

function CallWindow({ call, setCall, businessNumber }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camError, setCamError] = useState('');
  const set = (patch) => setCall((c) => (c ? { ...c, ...patch } : c));

  useEffect(() => {
    if (call.status !== 'ringing') return undefined;
    const legs = [setTimeout(() => set({ leg: 'customer' }), 1200), setTimeout(() => set({ status: 'connected' }), 2500)];
    return () => legs.forEach(clearTimeout);
  }, [call.status]);
  useEffect(() => {
    if (call.status !== 'connected' || call.hold) return undefined;
    const id = setInterval(() => setCall((c) => (c ? { ...c, seconds: c.seconds + 1 } : c)), 1000);
    return () => clearInterval(id);
  }, [call.status, call.hold]);

  const live = call.status === 'ringing' || call.status === 'connected';
  const wantCamera = call.type === 'video' && live && call.camera;
  useEffect(() => {
    if (!wantCamera) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCamError('');
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { setCamError('Camera is blocked or not available.'); }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [wantCamera]);

  const end = () => set({ status: 'wrapup' });
  return (
    <div className={`call-window ${call.minimized ? 'min' : ''} ${call.type === 'video' && live ? 'video' : ''}`} role="dialog" aria-label={`Call with ${call.person.name}`}>
      <div className="call-head">
        <span className="row"><span className="live-dot" />{call.status === 'ringing' ? (call.type === 'voice' && call.leg !== 'customer' ? 'Ringing your mobile…' : 'Calling customer…') : call.status === 'connected' ? (call.hold ? 'On hold' : fmtDuration(call.seconds)) : 'Call ended'}</span>
        <span className="grow trunc" style={{ textAlign: 'center' }}>{call.minimized ? call.person.name : ''}</span>
        <button type="button" className="call-mini" aria-label={call.minimized ? 'Expand call' : 'Minimize call'} onClick={() => set({ minimized: !call.minimized })}>{call.minimized ? <Maximize2 size={14} /> : <Minus size={14} />}</button>
      </div>
      {!call.minimized && (call.status === 'wrapup' ? <WrapUp call={call} onDone={() => setCall(null)} /> : (
        <>
          {call.type === 'video' ? (
            <div className="video-stage">
              <div className="video-remote"><Avatar name={call.person.name} size={72} /><div className="strong" style={{ marginTop: 8 }}>{call.person.name}</div><div className="small" style={{ opacity: 0.75 }}>{call.status === 'ringing' ? 'Ringing…' : 'Waiting for video'}</div></div>
              <div className="video-self">
                {call.camera && !camError ? <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera" /> : <div className="small" style={{ padding: 6, textAlign: 'center' }}>{camError || 'Camera off'}</div>}
              </div>
            </div>
          ) : (
            <div className="call-body" style={{ textAlign: 'center' }}>
              <Avatar name={call.person.name} size={64} />
              <div className="strong" style={{ marginTop: 8, fontSize: 15 }}>{call.person.name}</div>
              <div className="small muted">{call.person.phone}{call.person.sub ? ` · ${call.person.sub}` : ''}</div>
            </div>
          )}
          <div className="call-controls">
            <button type="button" className={`call-btn ${call.muted ? 'on' : ''}`} aria-pressed={!!call.muted} aria-label={call.muted ? 'Unmute' : 'Mute'} onClick={() => set({ muted: !call.muted })}>{call.muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
            {call.type === 'video'
              ? <button type="button" className={`call-btn ${!call.camera ? 'on' : ''}`} aria-pressed={!call.camera} aria-label={call.camera ? 'Turn camera off' : 'Turn camera on'} onClick={() => set({ camera: !call.camera })}>{call.camera ? <Video size={18} /> : <VideoOff size={18} />}</button>
              : <button type="button" className={`call-btn ${call.hold ? 'on' : ''}`} aria-pressed={!!call.hold} aria-label={call.hold ? 'Resume' : 'Hold'} disabled={call.status !== 'connected'} onClick={() => set({ hold: !call.hold })}>{call.hold ? <Play size={18} /> : <Pause size={18} />}</button>}
            <button type="button" className="call-btn end" aria-label="End call" onClick={end}><PhoneOff size={18} /></button>
          </div>
          <div className="call-note">
            Demo call: no real audio is sent. {call.direction === 'Incoming' ? 'They dialled' : 'They would see'} {businessNumber}. {call.person.phone && call.direction !== 'Incoming' && <a href={`tel:${call.person.phone}`}>Call on my phone</a>}
          </div>
        </>
      ))}
    </div>
  );
}

// Shows the routing a real provider would do out of sight, so it can be tried with one person at the screen.
function IncomingPanel({ inbound, onAnswer, onSkip }) {
  const { db, me, userName } = useStore();
  const [left, setLeft] = useState(RING_SECONDS);
  useEffect(() => {
    setLeft(RING_SECONDS);
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [inbound.step]);
  const { person, chain, step } = inbound;
  const ringing = chain[step];
  const first = userName(ringing).split(' ')[0];
  return (
    <div className="call-window" role="alertdialog" aria-label={`Incoming call from ${person.name}`}>
      <div className="call-head"><span className="row"><span className="live-dot" />Incoming call · demo</span></div>
      <div className="call-body stack-s">
        <div className="row"><span className="kpi-ico" style={{ width: 36, height: 36 }}><PhoneIncoming size={18} /></span>
          <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc notranslate" translate="no">{person.name}</div><div className="small muted trunc">{person.known ? [person.sub, person.phone].filter(Boolean).join(' · ') : 'Unknown number'}</div></div>
        </div>
        <div className="small muted">Dialled {db.settings.businessNumber}</div>
        <ol className="ring-list">
          {chain.map((u, i) => <li key={u} className={i === step ? 'now' : i < step ? 'past' : ''}><span className="grow trunc notranslate" translate="no">{userName(u)}</span><span key={i === step ? 'now' : i < step ? 'past' : 'next'} className="small nowrap">{i === step ? `Ringing · ${left}s` : i < step ? 'No answer' : 'Next'}</span></li>)}
        </ol>
        {/* Keyed by person: a page translator leaves stale text in place, which would name the wrong person here. */}
        <div className="row" key={ringing}>
          <Btn kind="primary" className="grow" icon="Phone" onClick={onAnswer}>{ringing === me.id ? 'Answer' : `Answer as ${first}`}</Btn>
          <Btn onClick={onSkip}>{ringing === me.id ? 'Decline' : 'No answer'}</Btn>
        </div>
      </div>
    </div>
  );
}

function ReminderStack({ due, meetings, onMeetingAck, onSnooze, onAck, onDone }) {
  const comms = useComms();
  const nav = useNavigate();
  const { db } = useStore();
  if (!due.length && !meetings.length) return null;
  const show = due.slice(0, 2);
  return (
    <div className="reminders" role="status" aria-live="polite">
      {meetings.slice(0, 2).map((e) => (
        <div key={e.id} className="reminder">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="kpi-ico" style={{ width: 30, height: 30, background: 'var(--warn-bg)', color: 'var(--warn)' }}><BellRing size={15} /></span>
            <div className="grow"><div className="strong">{e.title}</div><div className="small muted">Meeting {new Date(e.start) > new Date() ? 'starts' : 'started'} {fmtDT(e.start)}{e.location ? ` · ${e.location}` : ''}</div></div>
            <Btn sm kind="ghost" icon="X" aria-label="Dismiss meeting reminder" onClick={() => onMeetingAck(e)} />
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}><Btn sm kind="primary" onClick={() => { onMeetingAck(e); nav(e.requestId ? `/meetings?open=${e.requestId}` : '/calendar'); }}>Open</Btn></div>
        </div>
      ))}
      {show.map((f) => {
        const lateMs = Date.now() - new Date(f.at).getTime();
        const person = f.phone ? { name: f.name, phone: f.phone, relatedType: f.relatedType, relatedId: f.relatedId, contactId: f.contactId, companyId: db.contacts.find((c) => c.id === f.contactId)?.companyId } : null;
        return (
          <div key={f.id} className="reminder">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="kpi-ico" style={{ width: 30, height: 30, background: 'var(--warn-bg)', color: 'var(--warn)' }}><BellRing size={15} /></span>
              <div className="grow"><div className="strong">{f.title}</div><div className="small" style={{ color: lateMs > 0 ? 'var(--bad)' : 'var(--ink-3)' }}>{lateMs > 0 ? 'Was due' : 'Due'} {fmtDT(f.at)} · {f.channel}</div></div>
              <Btn sm kind="ghost" icon="X" aria-label="Dismiss reminder" onClick={() => onAck(f)} />
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {person && f.channel === 'Call' && comms.canCall && <Btn sm kind="primary" icon="Phone" onClick={() => { comms.startCall('voice', person); onAck(f); }}>Call</Btn>}
              {person && f.channel === 'Video' && comms.canVideo && <Btn sm kind="primary" icon="Video" onClick={() => { comms.startCall('video', person); onAck(f); }}>Video</Btn>}
              {person && f.channel === 'WhatsApp' && comms.canWhatsapp && <a className="btn sm primary" href={whatsappUrl(f.phone)} target="_blank" rel="noreferrer" onClick={() => onAck(f)}>WhatsApp</a>}
              <Btn sm onClick={() => onSnooze(f, 60)}>Snooze 1h</Btn>
              <Btn sm onClick={() => onSnooze(f, 1440)}>Tomorrow</Btn>
              <Btn sm icon="Check" onClick={() => onDone(f)}>Done</Btn>
            </div>
          </div>
        );
      })}
      {due.length > show.length && <button type="button" className="reminder more" onClick={() => nav('/followups')}>+{due.length - show.length} more reminders</button>}
    </div>
  );
}

export function CommsProvider({ children }) {
  const { db, me, can, sec, create, update, login, addChatter, userName, patchQuiet, pushNotification, toast } = useStore();
  const [call, setCall] = useState(null);
  const [inbound, setInbound] = useState(null);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 15000); return () => clearInterval(id); }, []);

  const startCall = (type, person) => {
    if (call || inbound) { toast('Finish your current call first.'); return; }
    setCall({ id: uid('call'), type, person, status: 'ringing', seconds: 0, startedAt: new Date().toISOString(), camera: true });
  };
  const simulateIncoming = (person) => {
    if (call || inbound) { toast('Finish your current call first.'); return; }
    const chain = ringOrder(db, person);
    if (!chain.length) { toast('Nobody is available to take this call.'); return; }
    setInbound({ person, chain, step: 0, startedAt: new Date().toISOString() });
  };
  const missInbound = ({ person: p, chain, startedAt }) => {
    const owner = chain[0];
    const note = `Rang ${chain.map((u) => userName(u)).join(', ')}. Nobody answered.`;
    create('calls', { type: 'voice', direction: 'Incoming', businessNumber: db.settings.businessNumber, name: p.name, phone: p.phone, companyId: p.companyId || '', relatedType: p.relatedType || '', relatedId: p.relatedId || '', ownerId: owner, at: startedAt, duration: 0, outcome: 'No answer', note, demo: true });
    create('followups', { title: `Call back ${p.name}`, at: new Date().toISOString(), channel: 'Call', remindBefore: 0, ownerId: owner, contactId: p.contactId || '', name: p.name, phone: p.phone, relatedType: p.relatedType || '', relatedId: p.relatedId || '', status: 'open', note });
    if (p.relatedType && p.relatedId) addChatter(`${p.relatedType}:${p.relatedId}`, 'activity', `Missed incoming call. ${note}`);
    pushNotification(owner, `Missed call from ${p.name}. A callback follow-up was added.`, '/followups');
    toast(`Missed call logged for ${userName(owner)}`);
  };
  const nextRing = () => {
    if (!inbound) return;
    if (inbound.step + 1 < inbound.chain.length) setInbound({ ...inbound, step: inbound.step + 1 });
    else { missInbound(inbound); setInbound(null); }
  };
  const answerInbound = () => {
    const { person, chain, step } = inbound;
    if (chain[step] !== me.id) login(chain[step]);
    setInbound(null);
    setCall({ id: uid('call'), type: 'voice', direction: 'Incoming', person, status: 'connected', seconds: 0, startedAt: new Date().toISOString(), camera: false });
  };
  useEffect(() => {
    if (!inbound) return undefined;
    const id = setTimeout(nextRing, RING_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [inbound?.startedAt, inbound?.step]);

  const s = db.settings;
  const canCall = can('calls', 'create') && s.voiceEnabled !== false;
  const canVideo = can('calls', 'video') && s.videoEnabled !== false;
  const canWhatsapp = can('messages', 'whatsapp') && s.whatsappEnabled !== false;

  const nowIso = new Date(tick).toISOString();
  const due = can('followups') ? db.followups.filter((f) => f.ownerId === me.id && f.status === 'open' && reminderTrigger(f) <= nowIso && f.ackFor !== reminderTrigger(f)).sort((a, b) => b.at.localeCompare(a.at)) : [];

  // Each reminder fires once per trigger time: a bell entry, plus a desktop alert if allowed.
  const dueKey = due.map((f) => f.id + reminderTrigger(f)).join();
  useEffect(() => {
    due.filter((f) => f.notifiedFor !== reminderTrigger(f)).forEach((f) => {
      patchQuiet('followups', f.id, { notifiedFor: reminderTrigger(f) });
      pushNotification(me.id, `Follow-up reminder: ${f.title}`, '/followups');
      try { if (window.Notification?.permission === 'granted') new Notification('Follow-up reminder', { body: f.title }); } catch { /* desktop alerts may be unavailable */ }
    });
  }, [dueKey]);

  // Everyone in a meeting gets one reminder, 15 minutes before it starts.
  const meetingsDue = db.events.filter((e) => (e.ownerId === me.id || e.attendeeIds?.includes(me.id)) && e.category !== 'Holiday' && new Date(e.start).getTime() - MEETING_LEAD <= tick && new Date(e.end).getTime() > tick && e.reminders?.[me.id] !== 'seen');
  const meetingKey = meetingsDue.map((e) => e.id).join();
  useEffect(() => {
    meetingsDue.filter((e) => !e.reminders?.[me.id]).forEach((e) => {
      patchQuiet('events', e.id, { reminders: { ...e.reminders, [me.id]: 'notified' } });
      pushNotification(me.id, `Meeting at ${fmtDT(e.start)}: ${e.title}`, e.requestId ? `/meetings?open=${e.requestId}` : '/calendar');
      try { if (window.Notification?.permission === 'granted') new Notification('Meeting soon', { body: e.title }); } catch { /* desktop alerts may be unavailable */ }
    });
  }, [meetingKey]);
  const ackMeeting = (e) => patchQuiet('events', e.id, { reminders: { ...e.reminders, [me.id]: 'seen' } });

  const snooze = (f, mins) => { patchQuiet('followups', f.id, { snoozedUntil: new Date(Date.now() + mins * 6e4).toISOString(), ackFor: null, notifiedFor: null }); toast(mins >= 1440 ? 'Reminder moved to tomorrow' : 'Snoozed for 1 hour'); };
  const ack = (f) => patchQuiet('followups', f.id, { ackFor: reminderTrigger(f) });
  const done = (f) => { update('followups', f.id, { status: 'done' }); toast('Follow-up done'); };

  const value = { startCall, simulateIncoming, inCall: !!call || !!inbound, canCall, canVideo, canWhatsapp, snooze, ack, done };
  return (
    <Ctx.Provider value={value}>
      {children}
      <ReminderStack due={due} meetings={meetingsDue} onMeetingAck={ackMeeting} onSnooze={snooze} onAck={ack} onDone={done} />
      {call && <CallWindow call={call} setCall={setCall} businessNumber={s.businessNumber} />}
      {inbound && <IncomingPanel inbound={inbound} onAnswer={answerInbound} onSkip={nextRing} />}
    </Ctx.Provider>
  );
}

// The Call, Video, WhatsApp, Chat and Follow-up buttons shown on records.
export function ContactActions({ person, showLabels }) {
  const comms = useComms();
  const { can, scope, db, me, sec } = useStore();
  const [follow, setFollow] = useState(false);
  const nav = useNavigate();
  if (!person) return null;
  const hasPhone = !!person.phone;
  const L = (t) => (showLabels ? t : null);
  return (
    <>
      {comms.canCall && hasPhone && <Btn sm={showLabels} icon="Phone" title={`Call ${person.name}`} aria-label={`Call ${person.name}`} onClick={() => comms.startCall('voice', person)}>{L('Call')}</Btn>}
      {comms.canVideo && hasPhone && <Btn sm={showLabels} icon="Video" title={`Video call ${person.name}`} aria-label={`Video call ${person.name}`} onClick={() => comms.startCall('video', person)}>{L('Video')}</Btn>}
      {comms.canWhatsapp && hasPhone && sec('messages', 'whatsapp') && <Btn sm={showLabels} icon="MessageCircle" title={`WhatsApp ${person.name}`} aria-label={`WhatsApp ${person.name}`} onClick={() => nav(`/messages?whatsapp=${person.contactId || ''}&phone=${encodeURIComponent(person.phone)}&name=${encodeURIComponent(person.name)}`)}>{L('WhatsApp')}</Btn>}
      {can('followups', 'create') && <Btn sm={showLabels} icon="BellPlus" title="Schedule follow-up" aria-label={`Schedule follow-up with ${person.name}`} onClick={() => setFollow(true)}>{L('Follow-up')}</Btn>}
      {follow && <FollowupDialog person={person} onClose={() => setFollow(false)} />}
    </>
  );
}
