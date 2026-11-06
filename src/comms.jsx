import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, PhoneIncoming, Mic, MicOff, Pause, Phone, PhoneOff, Play, Video, VideoOff, Minus, Maximize2, MonitorUp } from 'lucide-react';
import { useStore } from './store';
import { Avatar, Btn, Confirm, FormFields, Icon, ListField, Modal, validate } from './ui';
import { callCheck, callerIdFor, isOpen, menuChain, phoneOf, voicemailFor } from './callTools';
import { fmtDT, pad, uid } from './util';
import { RING_SECONDS, callOutcomeRoll, fakeTranscript, ringOrder } from './mockBackend';

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

function WrapUp({ call, onDone, hasNext }) {
  const { me, db, create, update, addChatter, toast } = useStore();
  const [outcome, setOutcome] = useState(call.endReason || (call.seconds > 0 || call.direction === 'Incoming' ? 'Connected' : 'No answer'));
  const [note, setNote] = useState(call.liveNote || '');
  const [follow, setFollow] = useState(false);
  const [at, setAt] = useState(localInput(Date.now() + 864e5));
  const save = () => {
    const p = call.person;
    create('calls', { type: call.type, direction: call.direction || 'Outgoing', businessNumber: call.direction === 'Incoming' ? db.settings.businessNumber : call.from?.number || db.settings.businessNumber, name: p.name, phone: p.phone, companyId: p.companyId || '', relatedType: p.relatedType || '', relatedId: p.relatedId || '', ownerId: me.id, at: call.startedAt, duration: call.seconds, outcome, note, demo: true, ...(call.recording && call.seconds > 0 ? { recording: true, announced: !!call.announced, ...fakeTranscript(me.name, p.name, note) } : {}), ...(call.transferredTo ? { transferredTo: call.transferredTo } : {}) });
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
      <Btn kind="primary" onClick={save}>{hasNext ? 'Save and call the next person' : 'Save call'}</Btn>
    </div>
  );
}

function CallWindow({ call, setCall, businessNumber, hasNext, onLogged }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camError, setCamError] = useState('');
  // Screen sharing uses the browser's real screen picker. Nobody else receives it in this demo.
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef(null);
  const shareStream = useRef(null);
  const stopShare = () => { shareStream.current?.getTracks().forEach((t) => t.stop()); shareStream.current = null; setSharing(false); };
  const startShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      shareStream.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { shareStream.current = null; setSharing(false); });
      setSharing(true);
    } catch { /* the person closed the picker */ }
  };
  useEffect(() => { if (sharing && shareRef.current) shareRef.current.srcObject = shareStream.current; }, [sharing]);
  useEffect(() => () => shareStream.current?.getTracks().forEach((t) => t.stop()), []);
  const set = (patch) => setCall((c) => (c ? { ...c, ...patch } : c));

  useEffect(() => {
    if (call.status !== 'ringing') return undefined;
    // The simulated network decides: most calls connect, some ring out or are busy.
    // Someone already waiting in a meeting room is there, so the call always connects.
    const result = call.direction === 'Incoming' || call.person.meetingId ? 'connected' : callOutcomeRoll();
    const legs = [setTimeout(() => set({ leg: 'customer' }), 1200), setTimeout(() => set(result === 'connected' ? { status: 'connected' } : { status: 'failed', failed: result }), result === 'connected' ? 2500 : 5000)];
    return () => legs.forEach(clearTimeout);
  }, [call.status]);
  useEffect(() => {
    if (call.status !== 'connected' || call.hold) return undefined;
    const id = setInterval(() => setCall((c) => (c ? { ...c, seconds: c.seconds + 1 } : c)), 1000);
    return () => clearInterval(id);
  }, [call.status, call.hold]);

  const { db, can, me, userName, toast } = useStore();
  const [panel, setPanel] = useState(null);
  const [digits, setDigits] = useState('');
  const scripts = db.picklists?.callScript || ['Introduce yourself and ask if it is a good time.', 'Ask what they are using today, and what is not working.', 'Agree the next step and a date.'];
  const team = db.users.filter((u) => u.active && u.id !== me.id);
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

  const end = () => { stopShare(); set({ status: 'wrapup' }); };
  const failedText = call.failed === 'busy' ? 'The line is busy.' : 'No answer.';
  return (
    <div className={`call-window ${call.minimized ? 'min' : ''} ${call.type === 'video' && live ? 'video' : ''}`} role="dialog" aria-label={`Call with ${call.person.name}`}>
      <div className="call-head">
        <span className="row"><span className="live-dot" />{call.status === 'failed' ? failedText : call.status === 'ringing' ? (call.type === 'voice' && call.leg !== 'customer' ? 'Ringing your mobile…' : 'Calling customer…') : call.status === 'connected' ? (call.hold ? 'On hold' : fmtDuration(call.seconds)) : 'Call ended'}</span>
        <span className="grow trunc" style={{ textAlign: 'center' }}>{call.minimized ? call.person.name : ''}</span>
        <button type="button" className="call-mini" aria-label={call.minimized ? 'Expand call' : 'Minimize call'} onClick={() => set({ minimized: !call.minimized })}>{call.minimized ? <Maximize2 size={14} /> : <Minus size={14} />}</button>
      </div>
      {!call.minimized && (call.status === 'wrapup' ? <WrapUp call={call} hasNext={hasNext} onDone={() => { setCall(null); onLogged?.(); }} /> : (
        <>
          {call.type === 'video' ? (
            <div className="video-stage">
              {sharing && <video ref={shareRef} className="video-share" autoPlay muted playsInline aria-label="Your shared screen" />}<div className="video-remote" hidden={sharing}><Avatar name={call.person.name} size={72} /><div className="strong" style={{ marginTop: 8 }}>{call.person.name}</div><div className="small" style={{ opacity: 0.75 }}>{call.status === 'ringing' ? 'Ringing…' : 'Waiting for video'}</div></div>
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
          {call.status === 'failed' && (
            <div className="call-body stack-s" style={{ paddingTop: 0 }}>
              <div className="small muted" style={{ textAlign: 'center' }}>{failedText} What would you like to do?</div>
              <Btn icon="Voicemail" onClick={() => { toast('Voicemail left (simulated)'); set({ status: 'wrapup', endReason: 'Left voicemail' }); }}>Leave a voicemail</Btn>
              <Btn icon="PhoneOff" onClick={() => set({ status: 'wrapup', endReason: call.failed === 'busy' ? 'Busy' : 'No answer' })}>End and log it</Btn>
            </div>
          )}
          {call.status === 'connected' && call.type === 'voice' && (
            <div className="call-tools">
              <button type="button" className={`call-tool ${call.recording ? 'rec' : ''}`} aria-pressed={!!call.recording} onClick={() => set({ recording: !call.recording, announced: call.announced || (!call.recording && phoneOf(db.settings).announce) })}><Icon name="CircleDot" size={14} />{call.recording ? 'Recording' : 'Record'}</button>
              {[['script', 'ScrollText', 'Script'], ['notes', 'NotebookPen', 'Notes'], ['keys', 'Grid3x3', 'Keypad'], ['transfer', 'PhoneForwarded', 'Transfer']].map(([k, ic, l]) => <button key={k} type="button" className={`call-tool ${panel === k ? 'on' : ''}`} aria-pressed={panel === k} onClick={() => setPanel(panel === k ? null : k)}><Icon name={ic} size={14} />{l}</button>)}
            </div>
          )}
          {call.status === 'connected' && call.recording && call.announced && <div className="call-panel small muted">Both sides heard: “{phoneOf(db.settings).announceText}”</div>}
          {call.status === 'connected' && panel === 'script' && <ol className="call-panel call-script">{scripts.map((x) => <li key={x}>{x}</li>)}</ol>}
          {call.status === 'connected' && panel === 'notes' && <div className="call-panel"><textarea className="textarea" rows={3} autoFocus aria-label="Notes during the call" placeholder="These carry over when you log the call." value={call.liveNote || ''} onChange={(e) => set({ liveNote: e.target.value })} /></div>}
          {call.status === 'connected' && panel === 'keys' && <div className="call-panel"><div className="num small" style={{ minHeight: 18, textAlign: 'center' }}>{digits}</div><div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => <button key={k} type="button" className="key" onClick={() => setDigits((d) => d + k)}>{k}</button>)}</div></div>}
          {call.status === 'connected' && panel === 'transfer' && <div className="call-panel stack-s"><select className="select" aria-label="Transfer to" value="" onChange={(e) => { if (!e.target.value) return; set({ transferredTo: e.target.value, liveNote: `${call.liveNote ? `${call.liveNote} ` : ''}Transferred to ${userName(e.target.value)}.`, status: 'wrapup' }); toast(`Call transferred to ${userName(e.target.value)} (simulated)`); }}><option value="">Transfer to…</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
          {call.status !== 'failed' && <div className="call-controls">
            <button type="button" className={`call-btn ${call.muted ? 'on' : ''}`} aria-pressed={!!call.muted} aria-label={call.muted ? 'Unmute' : 'Mute'} onClick={() => set({ muted: !call.muted })}>{call.muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
            {call.type === 'video'
              ? <button type="button" className={`call-btn ${!call.camera ? 'on' : ''}`} aria-pressed={!call.camera} aria-label={call.camera ? 'Turn camera off' : 'Turn camera on'} onClick={() => set({ camera: !call.camera })}>{call.camera ? <Video size={18} /> : <VideoOff size={18} />}</button>
              : <button type="button" className={`call-btn ${call.hold ? 'on' : ''}`} aria-pressed={!!call.hold} aria-label={call.hold ? 'Resume' : 'Hold'} disabled={call.status !== 'connected'} onClick={() => set({ hold: !call.hold })}>{call.hold ? <Play size={18} /> : <Pause size={18} />}</button>}
            {call.type === 'video' && <button type="button" className={`call-btn ${sharing ? 'on' : ''}`} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing your screen' : 'Share your screen'} disabled={call.status !== 'connected'} onClick={sharing ? stopShare : startShare}><MonitorUp size={18} /></button>}
            <button type="button" className="call-btn end" aria-label="End call" onClick={end}><PhoneOff size={18} /></button>
          </div>}
          <div className="call-note">
            Simulated call: no real audio is sent. {call.direction === 'Incoming' ? 'They dialled' : 'They would see'} {call.direction === 'Incoming' ? businessNumber : call.from?.number || businessNumber}{call.direction !== 'Incoming' && call.from?.why ? `, ${call.from.why}` : ''}. {call.person.phone && call.direction !== 'Incoming' && <a href={`tel:${call.person.phone}`}>Call on my phone</a>}
          </div>
        </>
      ))}
    </div>
  );
}

function DialerBar({ dialer, onCall, onSkip, onStop }) {
  const p = dialer.queue[dialer.index];
  return (
    <div className="call-window" role="region" aria-label="Call list">
      <div className="call-head"><span>Call list · {dialer.index + 1} of {dialer.queue.length}</span></div>
      <div className="call-body stack-s">
        <div className="row"><Avatar name={p.name} size={36} /><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc notranslate" translate="no">{p.name}</div><div className="small muted trunc">{p.reason || p.sub || p.phone}</div></div></div>
        <div className="row"><Btn kind="primary" className="grow" icon="Phone" onClick={onCall}>Call</Btn><Btn onClick={onSkip}>Skip</Btn><Btn kind="ghost" onClick={onStop}>Stop</Btn></div>
      </div>
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
        {inbound.menu && <div className="small">Phone menu: {inbound.menu}</div>}
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
  // One card at a time on a phone, so reminders don't cover the screen.
  const show = due.slice(0, window.matchMedia('(max-width: 560px)').matches ? 1 : 2);
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
  const { aiAnswerMissed, db, me, can, sec, create, update, login, addChatter, userName, patchQuiet, pushNotification, toast } = useStore();
  const [call, setCall] = useState(null);
  const [inbound, setInbound] = useState(null);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 15000); return () => clearInterval(id); }, []);

  // A list of people to work through, one call after another.
  const [dialer, setDialer] = useState(null);
  const startDialer = (queue) => { if (queue.length) setDialer({ queue, index: 0 }); };
  const callInList = (i) => { const p = dialer?.queue[i]; if (p) startCall('voice', p); };
  const skipInList = () => setDialer((x) => (x && x.index + 1 < x.queue.length ? { ...x, index: x.index + 1 } : null));
  const nextInList = () => {
    if (!dialer) return;
    if (dialer.index + 1 >= dialer.queue.length) { setDialer(null); toast('Call list finished'); return; }
    setDialer({ ...dialer, index: dialer.index + 1 });
  };
  const [pending, setPending] = useState(null);
  const beginCall = (type, person) => {
    const ph = phoneOf(db.settings);
    const rec = type === 'voice' && ph.autoRecord;
    setCall({ id: uid('call'), type, person, status: 'ringing', seconds: 0, startedAt: new Date().toISOString(), camera: true, from: callerIdFor(db.settings, person.phone), recording: rec, announced: rec && ph.announce });
    const ev = person.meetingId && db.events.find((e) => e.id === person.meetingId);
    if (ev?.waiting?.length) patchQuiet('events', ev.id, { waiting: ev.waiting.map((w) => ({ ...w, admitted: true })) });
  };
  // Do-not-call numbers are blocked. A call outside the customer's hours asks first.
  const startCall = (type, person) => {
    if (call || inbound) { toast('Finish your current call first.'); return; }
    const check = person.phone ? callCheck(db, person.phone) : {};
    if (check.block) { toast(check.block, 'bad'); return; }
    if (check.warn) { setPending({ type, person, warn: check.warn }); return; }
    beginCall(type, person);
  };
  const simulateIncoming = (person, menuKey) => {
    if (call || inbound) { toast('Finish your current call first.'); return; }
    const ph = phoneOf(db.settings);
    const base = ringOrder(db, person);
    const option = ph.menu.on ? ph.menu.options.find((o) => o.key === menuKey) : null;
    const chain = option ? menuChain(db, option, base) : base;
    const startedAt = new Date().toISOString();
    if (!isOpen(db.settings)) { missInbound({ person, chain, startedAt, closed: true }); return; }
    if (!chain.length) { toast('Nobody is available to take this call.'); return; }
    setInbound({ person, chain, step: 0, startedAt, menu: option ? `pressed ${option.key} for ${option.label || 'an option'}` : '' });
  };
  const missInbound = ({ person: p, chain, startedAt, closed }) => {
    const owner = chain[0] || db.users.find((u) => u.role === 'admin' && u.active)?.id;
    const ph = phoneOf(db.settings);
    const vm = ph.voicemail ? voicemailFor(p.name) : null;
    const answering = db.aiAgents?.find((a) => a.active && a.inbound);
    if (answering) { aiAnswerMissed(answering, p, owner); toast(`${answering.name} answered the call (simulated)`); return; }
    const note = closed ? `Called outside opening hours.${vm ? ' Left a voicemail.' : ''}` : `Rang ${chain.map((u) => userName(u)).join(', ')}. Nobody answered.${vm ? ' Left a voicemail.' : ''}`;
    create('calls', { type: 'voice', direction: 'Incoming', businessNumber: db.settings.businessNumber, name: p.name, phone: p.phone, companyId: p.companyId || '', relatedType: p.relatedType || '', relatedId: p.relatedId || '', ownerId: owner, at: startedAt, duration: 0, outcome: 'No answer', note, demo: true, ...(vm ? { voicemail: vm } : {}), ...(closed ? { outOfHours: true } : {}) });
    create('followups', { title: `Call back ${p.name}`, at: new Date().toISOString(), channel: 'Call', remindBefore: 0, ownerId: owner, contactId: p.contactId || '', name: p.name, phone: p.phone, relatedType: p.relatedType || '', relatedId: p.relatedId || '', status: 'open', note });
    if (p.relatedType && p.relatedId) addChatter(`${p.relatedType}:${p.relatedId}`, 'activity', `Missed incoming call. ${note}`);
    pushNotification(owner, `Missed call from ${p.name}${vm ? ', with a voicemail' : ''}. A callback follow-up was added.`, vm ? '/calls?tab=voicemail' : '/followups');
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
  const canWhatsapp = can('whatsapp') && s.whatsappEnabled !== false;

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

  const value = { startDialer, dialing: !!dialer, startCall, simulateIncoming, inCall: !!call || !!inbound, canCall, canVideo, canWhatsapp, snooze, ack, done };
  return (
    <Ctx.Provider value={value}>
      {children}
      <ReminderStack due={due} meetings={meetingsDue} onMeetingAck={ackMeeting} onSnooze={snooze} onAck={ack} onDone={done} />
      {call && <CallWindow call={call} setCall={setCall} businessNumber={s.businessNumber} hasNext={dialer && dialer.index + 1 < dialer.queue.length} onLogged={nextInList} />}
      {dialer && !call && <DialerBar dialer={dialer} onCall={() => callInList(dialer.index)} onSkip={() => skipInList()} onStop={() => setDialer(null)} />}
      {inbound && <IncomingPanel inbound={inbound} onAnswer={answerInbound} onSkip={nextRing} />}
      {pending && <Confirm title="Call outside their hours?" text={pending.warn} confirmLabel="Call anyway" danger={false} onClose={() => setPending(null)} onConfirm={() => beginCall(pending.type, pending.person)} />}
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
      {comms.canWhatsapp && hasPhone && <Btn sm={showLabels} icon="MessageCircle" title={`WhatsApp ${person.name}`} aria-label={`WhatsApp ${person.name}`} onClick={() => nav(`/whatsapp?whatsapp=${person.contactId || ''}&phone=${encodeURIComponent(person.phone)}&name=${encodeURIComponent(person.name)}`)}>{L('WhatsApp')}</Btn>}
      {can('followups', 'create') && <Btn sm={showLabels} icon="BellPlus" title="Schedule follow-up" aria-label={`Schedule follow-up with ${person.name}`} onClick={() => setFollow(true)}>{L('Follow-up')}</Btn>}
      {follow && <FollowupDialog person={person} onClose={() => setFollow(false)} />}
    </>
  );
}
