import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Btn, Icon, Modal } from '../ui';
import { getLocale, today } from '../util';

// Records you can attach a note or visit to, from what you can see.
function useTargets() {
  const { db, can, scope, companyName } = useStore();
  return useMemo(() => [
    ...(can('customers') ? scope(db.companies).map((c) => ({ key: `company:${c.id}`, type: 'company', id: c.id, label: c.name, sub: 'Customer' })) : []),
    ...(can('contacts') ? scope(db.contacts).map((c) => ({ key: `contact:${c.id}`, type: 'contact', id: c.id, label: `${c.first} ${c.last}`, sub: companyName(c.companyId), companyId: c.companyId })) : []),
    ...(can('leads') ? scope(db.leads).map((l) => ({ key: `lead:${l.id}`, type: 'lead', id: l.id, label: l.name, sub: `Lead · ${l.company || ''}` })) : []),
    ...(can('pipeline') ? scope(db.deals).filter((d) => d.status === 'open').map((d) => ({ key: `deal:${d.id}`, type: 'deal', id: d.id, label: d.title, sub: 'Opportunity', companyId: d.companyId })) : []),
  ], [db.companies, db.contacts, db.leads, db.deals]);
}
function Picker({ value, onChange, only }) {
  const all = useTargets().filter((t) => !only || only.includes(t.type));
  const [q, setQ] = useState('');
  const hits = q.trim().length > 1 ? all.filter((t) => `${t.label} ${t.sub}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const cur = all.find((t) => t.key === value);
  return (
    <div className="field">
      <label className="label" htmlFor="pick-rec">About</label>
      {cur ? <div className="row"><span className="grow strong trunc">{cur.label}</span><span className="small muted">{cur.sub}</span><Btn sm kind="ghost" onClick={() => onChange('')}>Change</Btn></div> : <>
        <input id="pick-rec" className="input" placeholder="Search a name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.map((t) => <button key={t.key} type="button" className="pop-item" onClick={() => { onChange(t.key); setQ(''); }}><span className="grow trunc">{t.label}</span><span className="small muted">{t.sub}</span></button>)}
      </>}
    </div>
  );
}

// Speak a note, then save it on the record. Uses the browser's own speech recognition where it has one.
function VoiceNote({ onClose }) {
  const { addChatter, toast } = useStore();
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const [text, setText] = useState('');
  const [live, setLive] = useState('');
  const [on, setOn] = useState(false);
  const [target, setTarget] = useState('');
  const [err, setErr] = useState('');
  const rec = useRef(null);
  useEffect(() => () => rec.current?.stop?.(), []);
  const start = () => {
    if (!Rec) return;
    const r = new Rec();
    r.lang = getLocale();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let final = ''; let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (final += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
      if (final) setText((p) => `${p}${p && !p.endsWith(' ') ? ' ' : ''}${final.trim()}`);
      setLive(interim);
    };
    r.onerror = (e) => { setErr(e.error === 'not-allowed' ? 'The microphone is blocked. Allow it in your browser, or type the note.' : "Speech couldn't be heard. Try again, or type the note."); setOn(false); };
    r.onend = () => { setOn(false); setLive(''); };
    rec.current = r;
    try { r.start(); setOn(true); setErr(''); } catch { setErr("Speech couldn't start. Type the note instead."); }
  };
  const stop = () => rec.current?.stop();
  const save = () => {
    if (!target) { setErr('Choose who the note is about.'); return; }
    if (!text.trim()) { setErr('The note is empty.'); return; }
    addChatter(target, 'note', text.trim());
    toast('Note saved on the record');
    onClose();
  };
  return (
    <Modal title="Voice note" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save note</Btn></>}>
      <div className="stack-s">
        <Picker value={target} onChange={setTarget} />
        {Rec ? <div className="row"><Btn kind={on ? 'danger' : 'primary'} icon={on ? 'Square' : 'Mic'} onClick={on ? stop : start}>{on ? 'Stop' : 'Start speaking'}</Btn>{on && <span className="small"><span className="live-dot" /> Listening…</span>}</div>
          : <div className="notice">This browser can't turn speech into text. Type the note, or use your phone keyboard's microphone.</div>}
        <textarea className="textarea" rows={5} aria-label="Note" value={text + (live ? ` ${live}` : '')} onChange={(e) => { setText(e.target.value); setLive(''); }} placeholder="What happened?" />
        {err && <span className="error-text">{err}</span>}
        <div className="small muted">Speech is turned into text by your browser. Some browsers send the sound to their maker's service to do it.</div>
      </div>
    </Modal>
  );
}

// Record a customer visit, with where you are if the phone allows it.
function CheckIn({ onClose }) {
  const { db, me, create, addChatter, toast } = useStore();
  const [target, setTarget] = useState('');
  const [pos, setPos] = useState(null);
  const [state, setState] = useState('idle');
  const [note, setNote] = useState('');
  const locate = () => {
    if (!navigator.geolocation) { setState('none'); return; }
    setState('asking');
    navigator.geolocation.getCurrentPosition((p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setState('done'); }, (e) => setState(e.code === 1 ? 'denied' : 'failed'), { enableHighAccuracy: true, timeout: 15000 });
  };
  useEffect(() => { locate(); }, []);
  const save = () => {
    if (!target) { toast('Choose the customer you visited.', 'bad'); return; }
    const [type, id] = target.split(':');
    const label = type === 'company' ? db.companies.find((c) => c.id === id)?.name : type === 'contact' ? (() => { const c = db.contacts.find((x) => x.id === id); return c ? `${c.first} ${c.last}` : ''; })() : '';
    const where = pos ? `at ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (within ${pos.acc} m). Map: https://www.openstreetmap.org/?mlat=${pos.lat.toFixed(5)}&mlon=${pos.lng.toFixed(5)}#map=17/${pos.lat.toFixed(5)}/${pos.lng.toFixed(5)}` : 'without a location';
    const text = `Visited ${label} ${where}${note.trim() ? `. ${note.trim()}` : ''}`;
    create('activities', { typeId: db.activityTypes.find((t) => /meet|visit/i.test(t.name))?.id || db.activityTypes[0]?.id, summary: `Visit: ${label}`, due: today(), ownerId: me.id, note: text, status: 'done', priority: 'Medium', tag: 'Sales', relatedType: type, relatedId: id, relatedLabel: label, checkIn: pos || null });
    addChatter(target, 'activity', text);
    toast('Visit recorded');
    onClose();
  };
  const msg = { asking: 'Finding where you are…', done: pos && `Found you, within ${pos.acc} m.`, denied: "Location is blocked. You can still record the visit without it.", failed: "Your location couldn't be found. You can still record the visit.", none: "This device can't share its location.", idle: '' }[state];
  return (
    <Modal title="Check in at a visit" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="MapPin" onClick={save}>Record visit</Btn></>}>
      <div className="stack-s">
        <Picker value={target} onChange={setTarget} only={['company', 'contact']} />
        <div className={`notice ${state === 'denied' || state === 'failed' ? 'warn' : ''}`} role="status">{msg}{pos && <> <a href={`https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lng}#map=17/${pos.lat}/${pos.lng}`} target="_blank" rel="noreferrer">See on a map</a></>}</div>
        {(state === 'denied' || state === 'failed') && <div><Btn sm onClick={locate}>Try again</Btn></div>}
        <textarea className="textarea" rows={3} aria-label="What happened" placeholder="What happened? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="small muted">Your location is only read when you open this, and is saved on the visit.</div>
      </div>
    </Modal>
  );
}

// The round button on a phone: add a record, a voice note or a visit, with one thumb.
export function QuickActions({ quickItems = [], onCreate }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState(null);
  return (
    <>
      <button type="button" className="fab" aria-label="Quick actions" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'X' : 'Plus'} size={22} /></button>
      {open && <div className="fab-sheet" role="menu">
        <button type="button" role="menuitem" className="fab-item" onClick={() => { setTool('voice'); setOpen(false); }}><Icon name="Mic" size={18} />Voice note</button>
        <button type="button" role="menuitem" className="fab-item" onClick={() => { setTool('visit'); setOpen(false); }}><Icon name="MapPin" size={18} />Check in at a visit</button>
        {quickItems.slice(0, 5).map((q) => <button key={q.k} type="button" role="menuitem" className="fab-item" onClick={() => { onCreate(q.k); setOpen(false); }}><Icon name={q.icon || 'Plus'} size={18} />{q.label}</button>)}
      </div>}
      {tool === 'voice' && <VoiceNote onClose={() => setTool(null)} />}
      {tool === 'visit' && <CheckIn onClose={() => setTool(null)} />}
    </>
  );
}
