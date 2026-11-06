import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, Confirm, Empty, FormFields, Kpi, Modal, Pills, Progress } from '../ui';
import { Bars } from '../charts';
import { speak, stopSpeaking } from '../aiVoice';
import { useComms, fmtDuration, localInput } from '../comms';
import { COUNTRY_NAMES, coaching, countryOf, localTime, phoneOf } from '../callTools';
import { fmtDT, num, pct, uid } from '../util';

const personOfCall = (c) => ({ name: c.name, phone: c.phone, relatedType: c.relatedType, relatedId: c.relatedId, contactId: c.relatedType === 'contact' ? c.relatedId : '', companyId: c.companyId });
export const LocalTime = ({ phone }) => {
  const t = localTime(phone);
  return t ? <span className="small muted nowrap" title={t.country}>{t.time} their time · {t.country}</span> : null;
};

// Missed incoming calls, with any voicemail, so nobody is left without a call back.
export function Missed({ onOpen }) {
  const { db, scope, patchQuiet, toast, userName, scopeOf } = useStore();
  const { startCall, canCall, inCall } = useComms();
  const [show, setShow] = useState('todo');
  const [playing, setPlaying] = useState(null);
  useEffect(() => stopSpeaking, []);
  const all = scope(db.calls).filter((c) => c.direction === 'Incoming' && ['No answer', 'Left voicemail'].includes(c.outcome)).sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((c) => (show === 'todo' ? !c.handled : c.handled));
  const play = (c) => { if (playing === c.id) { stopSpeaking(); setPlaying(null); return; } speak(c.voicemail.text, { language: 'English', voice: 'Asha (female)' }); setPlaying(c.id); setTimeout(() => setPlaying((x) => (x === c.id ? null : x)), c.voicemail.seconds * 1000); };
  return (
    <Card title="Missed calls and voicemail" sub="Call each person back, then mark it done." action={<Pills value={show} onChange={setShow} options={[{ k: 'todo', label: 'To call back', count: all.filter((c) => !c.handled).length }, { k: 'done', label: 'Done', count: all.filter((c) => c.handled).length }]} />}>
      {!rows.length ? <Empty icon="PhoneMissed" text={show === 'todo' ? 'Nobody is waiting for a call back.' : 'Nothing marked done yet.'} /> : (
        <div className="stack-s">{rows.map((c) => (
          <div key={c.id} className="vm-row">
            <Avatar name={c.name} size={32} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 8 }}><button type="button" className="link-btn strong" onClick={() => onOpen(c.id)}>{c.name}</button><span className="small muted">{fmtDT(c.at)}</span>{scopeOf('calls') !== 'own' && <span className="small muted">for {userName(c.ownerId)}</span>}<LocalTime phone={c.phone} /></div>
              {c.voicemail ? <div className="vm-text">“{c.voicemail.text}”<span className="small muted"> · {c.voicemail.seconds}s</span></div> : <div className="small muted">No message left.</div>}
            </div>
            <span className="row wrap" style={{ justifyContent: 'flex-end' }}>
              {c.voicemail && <Btn sm icon={playing === c.id ? 'Square' : 'Play'} onClick={() => play(c)}>{playing === c.id ? 'Stop' : 'Listen'}</Btn>}
              {canCall && c.phone && <Btn sm kind="primary" icon="Phone" disabled={inCall} onClick={() => startCall('voice', personOfCall(c))}>Call back</Btn>}
              <Btn sm kind="ghost" icon={c.handled ? 'Undo2' : 'Check'} onClick={() => { patchQuiet('calls', c.id, { handled: !c.handled }); toast(c.handled ? 'Back on the list' : 'Marked done'); }}>{c.handled ? 'Undo' : 'Done'}</Btn>
            </span>
          </div>
        ))}</div>
      )}
      <div className="small muted" style={{ marginTop: 10 }}>Simulated: voicemails are sample text, read aloud by your browser's voice.</div>
    </Card>
  );
}

export function CoachingCard({ call }) {
  const { db } = useStore();
  const c = coaching(call.lines, phoneOf(db.settings).keywords);
  if (!c) return null;
  return (
    <div className="stack-s">
      <div className="label">Coaching</div>
      <div><div className="row between small"><span>You talked</span><strong>{c.share}%</strong></div><Progress value={c.share} color={c.share > 65 ? 'var(--warn)' : undefined} /></div>
      <dl className="dl"><dt>Questions you asked</dt><dd>{c.questions}</dd><dt>Longest stretch</dt><dd>{c.longest} words</dd><dt>Their mood</dt><dd>{c.mood}</dd><dt>Words heard</dt><dd>{c.keywords.length ? c.keywords.join(', ') : 'None of your tracked words'}</dd></dl>
      <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>{c.tips.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

const RANGES = [{ k: '7', label: '7 days' }, { k: '30', label: '30 days' }, { k: '90', label: '90 days' }];
export function CallInsights({ onOpen }) {
  const { db, scope, scopeOf, userName } = useStore();
  const [days, setDays] = useState('30');
  const since = new Date(Date.now() - Number(days) * 864e5).toISOString();
  const rows = scope(db.calls).filter((c) => c.at >= since);
  const connected = rows.filter((c) => c.outcome === 'Connected');
  const keywords = phoneOf(db.settings).keywords;
  const recorded = rows.filter((c) => c.recording && c.lines?.length).map((c) => ({ c, k: coaching(c.lines, keywords) }));
  const avgShare = recorded.length ? recorded.reduce((a, x) => a + x.k.share, 0) / recorded.length : 0;
  const count = (n) => String(Math.round(n));
  const people = [...new Set(rows.map((c) => c.ownerId))].map((id) => ({ label: userName(id), calls: rows.filter((c) => c.ownerId === id).length, connected: connected.filter((c) => c.ownerId === id).length })).sort((a, b) => b.calls - a.calls).slice(0, 10);
  const hours = Array.from({ length: 12 }, (_, i) => i + 8).map((h) => { const at = rows.filter((c) => c.direction === 'Outgoing' && new Date(c.at).getHours() === h); return { label: `${h}:00`, value: at.length ? (at.filter((c) => c.outcome === 'Connected').length / at.length) * 100 : 0, n: at.length }; }).filter((x) => x.n);
  const outcomes = Object.entries(rows.reduce((a, c) => { a[c.outcome] = (a[c.outcome] || 0) + 1; return a; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const heard = keywords.map((k) => ({ label: k, value: recorded.filter((x) => x.k.keywords.includes(k)).length })).filter((x) => x.value).sort((a, b) => b.value - a.value);
  return (
    <div className="stack">
      <Pills value={days} onChange={setDays} options={RANGES} />
      <div className="g4">
        <Kpi label="Calls" value={num(rows.length)} note={`${rows.filter((c) => c.direction === 'Incoming').length} incoming`} icon="PhoneCall" />
        <Kpi label="Connect rate" value={pct(rows.length ? (connected.length / rows.length) * 100 : 0)} note={`${connected.length} answered`} icon="Target" />
        <Kpi label="Average call" value={fmtDuration(Math.round(connected.length ? connected.reduce((a, c) => a + c.duration, 0) / connected.length : 0))} note="Answered calls only" icon="Timer" />
        <Kpi label="You talked" value={recorded.length ? `${Math.round(avgShare)}%` : '—'} note={recorded.length ? `Across ${recorded.length} recorded calls. Aim for under 60%.` : 'Record calls to see this'} icon="Mic" />
      </div>
      <div className="g2">
        {scopeOf('calls') !== 'own' && <Card title="Calls by person" sub="Made and answered, same scale">{people.length ? <Bars horizontal data={people} series={[{ key: 'calls', name: 'Calls' }, { key: 'connected', name: 'Answered' }]} format={count} height={Math.max(160, people.length * 44)} /> : <Empty icon="Users" text="No calls in this period." />}</Card>}
        <Card title="Best time to call" sub="Share of outgoing calls answered, by hour">{hours.length ? <Bars data={hours} series={[{ key: 'value', name: 'Answered' }]} format={(v) => pct(v)} height={220} /> : <Empty icon="Clock" text="No outgoing calls in this period." />}</Card>
        <Card title="How calls ended">{outcomes.length ? <Bars horizontal data={outcomes} series={[{ key: 'value', name: 'Calls' }]} format={count} height={Math.max(150, outcomes.length * 38)} /> : <Empty icon="Phone" text="No calls in this period." />}</Card>
        <Card title="Words heard on calls" sub="Your tracked words, in recorded calls">{heard.length ? <Bars horizontal data={heard} series={[{ key: 'value', name: 'Calls' }]} format={count} height={Math.max(150, heard.length * 38)} /> : <Empty icon="Mic" text="None heard yet. Record calls, or change the words in Phone setup." />}</Card>
      </div>
      <Card title="Recent recorded calls" sub="Open one to read the transcript and coaching tips">
        {!recorded.length ? <Empty icon="Mic" text="No recorded calls in this period." /> : <div className="stack-s">{recorded.slice(0, 6).map(({ c, k }) => (
          <button key={c.id} type="button" className="dashlet vm-pick" onClick={() => onOpen(c.id)}>
            <Avatar name={c.name} size={28} /><span className="grow trunc" style={{ textAlign: 'start' }}><strong>{c.name}</strong><span className="small muted"> · {fmtDT(c.at)}</span></span>
            <Badge tone={k.share > 65 ? 'warn' : 'good'} dot={false}>Talked {k.share}%</Badge><Badge tone={k.mood === 'Concerned' ? 'warn' : k.mood === 'Positive' ? 'good' : 'muted'} dot={false}>{k.mood}</Badge>
          </button>
        ))}</div>}
      </Card>
      <p className="small muted">Simulated: transcripts are sample text, so coaching shows how it works rather than real calls.</p>
    </div>
  );
}

// A video meeting link a customer can open, wait in, and be let in from the call screen.
export function VideoMeetings() {
  const { db, me, can, scope, create, toast, companyName } = useStore();
  const { startCall, canVideo, inCall } = useComms();
  const [adding, setAdding] = useState(false);
  const contacts = can('contacts') ? [...scope(db.contacts)].sort((a, b) => a.first.localeCompare(b.first)) : [];
  const list = db.events.filter((e) => e.meetLink && (e.ownerId === me.id || e.attendeeIds?.includes(me.id)) && e.end >= new Date(Date.now() - 864e5).toISOString()).sort((a, b) => a.start.localeCompare(b.start));
  const link = (e) => `${location.origin}${location.pathname}#/meet/${e.id}`;
  const copy = async (e) => { try { await navigator.clipboard.writeText(link(e)); toast('Meeting link copied'); } catch { toast(link(e)); } };
  const fields = [
    { k: 'title', label: 'Meeting name', req: true, full: true },
    { k: 'start', label: 'Starts', type: 'datetime-local', req: true },
    { k: 'minutes', label: 'Length', type: 'select', noBlank: true, options: [15, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m} minutes` })) },
    { k: 'contactId', label: 'With', type: 'select', full: true, blankLabel: 'Anyone with the link', options: contacts.map((c) => ({ value: c.id, label: `${c.first} ${c.last}` })) },
  ];
  const [v, setV] = useState({ title: 'Video meeting', start: localInput(Date.now() + 36e5), minutes: 30, contactId: '' });
  const save = () => {
    if (!v.title.trim() || !v.start) { toast('Add a name and a start time.', 'bad'); return; }
    const c = db.contacts.find((x) => x.id === v.contactId);
    const start = new Date(v.start);
    const ev = create('events', { id: uid('ev'), title: v.title.trim(), category: 'Meeting', start: start.toISOString(), end: new Date(start.getTime() + Number(v.minutes) * 6e4).toISOString(), ownerId: me.id, location: 'Video meeting', meetLink: true, contactId: c?.id || '', companyId: c?.companyId || '', notes: c ? `With ${c.first} ${c.last}` : '' });
    setAdding(false);
    copy(ev);
  };
  return (
    <Card title="Video meetings" sub="Send a link. People wait in a waiting room until you let them in." action={canVideo && <Btn sm kind="primary" icon="Plus" onClick={() => setAdding(true)}>New meeting link</Btn>}>
      {!list.length ? <Empty icon="Video" text="No upcoming video meetings." /> : <div className="stack-s">{list.map((e) => {
        const waiting = (e.waiting || []).filter((w) => !w.admitted);
        const c = db.contacts.find((x) => x.id === e.contactId);
        return (
          <div key={e.id} className="vm-row">
            <span className="kpi-ico" style={{ width: 32, height: 32 }}><Avatar name={e.title} size={32} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="strong trunc">{e.title}</div>
              <div className="small muted">{fmtDT(e.start)}{c ? ` · ${c.first} ${c.last}, ${companyName(c.companyId)}` : ''}</div>
              {waiting.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 4 }}><Badge tone="warn">{waiting.map((w) => w.name).join(', ')} waiting</Badge></div>}
            </div>
            <span className="row wrap" style={{ justifyContent: 'flex-end' }}>
              <Btn sm icon="Link" onClick={() => copy(e)}>Copy link</Btn>
              <a className="btn sm" href={`#/meet/${e.id}`} target="_blank" rel="noreferrer">Open as guest</a>
              {canVideo && <Btn sm kind={waiting.length ? 'primary' : ''} icon="Video" disabled={inCall} onClick={() => startCall('video', { name: waiting[0]?.name || (c ? `${c.first} ${c.last}` : e.title), phone: c?.phone || '', relatedType: c ? 'contact' : '', relatedId: c?.id || '', contactId: c?.id || '', companyId: c?.companyId || '', meetingId: e.id })}>{waiting.length ? 'Let in and start' : 'Start'}</Btn>}
            </span>
          </div>
        );
      })}</div>}
      <div className="small muted" style={{ marginTop: 10 }}>Simulated: the guest page works in this browser only, and no video travels between people.</div>
      {adding && <Modal title="New meeting link" onClose={() => setAdding(false)} footer={<><Btn onClick={() => setAdding(false)}>Cancel</Btn><Btn kind="primary" onClick={save}>Create and copy link</Btn></>}>
        <FormFields fields={fields} values={v} onChange={(k, x) => setV({ ...v, [k]: x })} />
      </Modal>}
    </Card>
  );
}

// The guest's side of a meeting link. Checks their camera, then waits to be let in.
export function MeetPage({ id }) {
  const { db, setDbFromPublic } = useStore();
  const ev = db.events.find((e) => e.id === id && e.meetLink);
  const host = ev && db.users.find((u) => u.id === ev.ownerId);
  const [name, setName] = useState('');
  const [cam, setCam] = useState('off');
  const [joined, setJoined] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  const check = async () => {
    try { stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); if (video.current) video.current.srcObject = stream.current; setCam('on'); } catch { setCam('blocked'); }
  };
  const join = () => {
    if (!name.trim()) return;
    const at = new Date().toISOString();
    setDbFromPublic((d) => ({ ...d, events: d.events.map((e) => (e.id === id ? { ...e, waiting: [...(e.waiting || []), { id: uid('w'), name: name.trim().slice(0, 60), at }] } : e)), notifications: [{ id: uid('n'), to: ev.ownerId, at, text: `${name.trim()} is waiting in ${ev.title}.`, link: '/calls?tab=meetings', read: false }, ...d.notifications] }));
    setJoined(true);
  };
  return (
    <div className="public-form">
      <div className="card card-b stack">
        <div className="small muted">{db.settings.companyName}</div>
        {!ev ? <Empty icon="VideoOff" text="This meeting link isn't available." /> : <>
          <h1 style={{ fontSize: 22, fontWeight: 680, margin: 0 }}>{ev.title}</h1>
          <div className="sub">{fmtDT(ev.start)}{host ? ` with ${host.name}` : ''}</div>
          <div className="meet-preview">{cam === 'on' ? <video ref={video} autoPlay muted playsInline aria-label="Your camera" /> : <div className="small">{cam === 'blocked' ? 'Your camera is blocked or not available. You can still join.' : 'Camera off'}</div>}</div>
          {joined ? <div className="notice" role="status">You're in the waiting room. {host ? host.name : 'The host'} has been told and will let you in.</div> : <>
            <div className="field"><label className="label" htmlFor="meet-name">Your name</label><input id="meet-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="row wrap">{cam !== 'on' && <Btn icon="Camera" onClick={check}>Check my camera</Btn>}<Btn kind="primary" icon="LogIn" disabled={!name.trim()} onClick={join}>Join</Btn></div>
          </>}
          <div className="small muted">Simulated. It only works in the browser that holds this data, and no video is sent until there's a video service.</div>
        </>}
      </div>
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function PhoneSetup() {
  const { db, can, create, remove, updateSettings, toast } = useStore();
  const editable = can('calls', 'setup');
  const [v, setV] = useState(() => phoneOf(db.settings));
  const [dnc, setDnc] = useState({ name: '', phone: '' });
  const [del, setDel] = useState(null);
  const changed = JSON.stringify(v) !== JSON.stringify(phoneOf(db.settings));
  const put = (patch) => setV((p) => ({ ...p, ...patch }));
  const targets = [{ value: 'owner', label: "The caller's account owner" }, ...db.teams.map((t) => ({ value: `team:${t.id}`, label: `Team: ${t.name}` })), ...db.users.filter((u) => u.active).map((u) => ({ value: `user:${u.id}`, label: u.name }))];
  const save = () => {
    const numbers = v.numbers.filter((n) => n.number.trim());
    if (numbers.some((n) => !countryOf(n.number))) { toast('Write each number with its country code, like +44 20 7946 0000.', 'bad'); return; }
    if (v.menu.on && new Set(v.menu.options.map((o) => o.key)).size !== v.menu.options.length) { toast('Each menu option needs its own key.', 'bad'); return; }
    updateSettings({ phone: { ...v, numbers, keywords: v.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean) } });
    toast('Phone setup saved');
  };
  const dncList = db.aiDnc || [];
  return (
    <div className="stack">
      {!editable && <div className="notice">You can see the phone setup. Ask your Admin to change it.</div>}
      <fieldset disabled={!editable} className="plain-fieldset stack">
        <div className="g2">
          <Card title="Numbers" sub="A number from the customer's country is shown when you have one">
            <div className="stack-s">
              <div className="small">Main number: <strong>{db.settings.businessNumber}</strong> <span className="muted">(change it in Settings)</span></div>
              {v.numbers.map((n, i) => (
                <div key={i} className="row">
                  <input className="input" aria-label={`Local number ${i + 1}`} placeholder="+44 20 7946 0000" value={n.number} onChange={(e) => put({ numbers: v.numbers.map((x, j) => (j === i ? { number: e.target.value } : x)) })} />
                  <span className="small muted nowrap" style={{ minWidth: 90 }}>{countryOf(n.number)?.country || 'Add country code'}</span>
                  <Btn sm kind="ghost" icon="X" aria-label={`Remove number ${i + 1}`} onClick={() => put({ numbers: v.numbers.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <div><Btn sm icon="Plus" onClick={() => put({ numbers: [...v.numbers, { number: '' }] })}>Add a local number</Btn></div>
              <div className="small muted">Countries known: {COUNTRY_NAMES.length}, from the number's code.</div>
            </div>
          </Card>
          <Card title="When to call" sub="Calls outside these hours, in the customer's own time, ask first">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[{ k: 'callFrom', label: 'From', type: 'time' }, { k: 'callTo', label: 'Until', type: 'time' }]} />
          </Card>
          <Card title="Opening hours" sub={`Incoming calls outside these go to voicemail. Uses ${db.settings.timezone || 'UTC'}.`}>
            <div className="stack-s">
              <label className="check"><input type="checkbox" checked={v.hours.on} onChange={(e) => put({ hours: { ...v.hours, on: e.target.checked } })} />Use opening hours</label>
              {v.hours.on && <>
                <div className="row wrap" role="group" aria-label="Open on">{DAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={v.hours.days.includes(i)} onChange={(e) => put({ hours: { ...v.hours, days: e.target.checked ? [...v.hours.days, i].sort() : v.hours.days.filter((x) => x !== i) } })} />{d}</label>)}</div>
                <FormFields values={v.hours} onChange={(k, x) => put({ hours: { ...v.hours, [k]: x } })} fields={[{ k: 'from', label: 'Opens', type: 'time' }, { k: 'to', label: 'Closes', type: 'time' }]} />
              </>}
            </div>
          </Card>
          <Card title="Voicemail">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[{ k: 'voicemail', label: 'Voicemail', type: 'check', text: 'Let callers leave a message when nobody answers', full: true }, { k: 'voicemailGreeting', label: 'Greeting', type: 'textarea', full: true, hide: !v.voicemail }]} />
          </Card>
        </div>
        <Card title="Phone menu" sub="Callers press a key to reach the right people">
          <div className="stack-s">
            <label className="check"><input type="checkbox" checked={v.menu.on} onChange={(e) => put({ menu: { ...v.menu, on: e.target.checked } })} />Play a menu to callers</label>
            {v.menu.on && <>
              <div className="field"><label className="label" htmlFor="menu-greet">What callers hear</label><textarea id="menu-greet" className="textarea" rows={2} value={v.menu.greeting} onChange={(e) => put({ menu: { ...v.menu, greeting: e.target.value } })} /></div>
              {v.menu.options.map((o, i) => (
                <div key={i} className="menu-row">
                  <select className="select" aria-label={`Option ${i + 1} key`} value={o.key} onChange={(e) => put({ menu: { ...v.menu, options: v.menu.options.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) } })}>{['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => <option key={k} value={k}>Press {k}</option>)}</select>
                  <input className="input" aria-label={`Option ${i + 1} name`} value={o.label} onChange={(e) => put({ menu: { ...v.menu, options: v.menu.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
                  <select className="select" aria-label={`Option ${i + 1} rings`} value={o.to || 'owner'} onChange={(e) => put({ menu: { ...v.menu, options: v.menu.options.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) } })}>{targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                  <Btn sm kind="ghost" icon="X" aria-label={`Remove option ${i + 1}`} onClick={() => put({ menu: { ...v.menu, options: v.menu.options.filter((_, j) => j !== i) } })} />
                </div>
              ))}
              <div><Btn sm icon="Plus" disabled={v.menu.options.length >= 9} onClick={() => put({ menu: { ...v.menu, options: [...v.menu.options, { key: String(v.menu.options.length + 1), label: '', to: 'owner' }] } })}>Add an option</Btn></div>
            </>}
          </div>
        </Card>
        <div className="g2">
          <Card title="Recording" sub="Check the consent rules in each country you call">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[
              { k: 'autoRecord', label: 'Record', type: 'check', text: 'Record every call automatically', full: true },
              { k: 'announce', label: 'Announce', type: 'check', text: 'Tell both sides when recording starts', full: true },
              { k: 'announceText', label: 'What they hear', full: true, hide: !v.announce },
            ]} />
          </Card>
          <Card title="Words to track" sub="Counted in recorded calls, for coaching">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[{ k: 'keywords', label: 'Words', type: 'tags', full: true }]} />
          </Card>
        </div>
        {editable && <div className="row"><Btn kind="primary" disabled={!changed} onClick={save}>Save phone setup</Btn>{changed && <Btn kind="ghost" onClick={() => setV(phoneOf(db.settings))}>Undo changes</Btn>}</div>}
      </fieldset>
      <Card title="Do-not-call list" sub="Nobody can call these numbers from the CRM. AI Voice uses the same list.">
        <div className="stack-s">
          {editable && <div className="row wrap">
            <input className="input" style={{ maxWidth: 200 }} aria-label="Name" placeholder="Name" value={dnc.name} onChange={(e) => setDnc({ ...dnc, name: e.target.value })} />
            <input className="input" style={{ maxWidth: 200 }} aria-label="Phone number to block" placeholder="+1 555 0100" value={dnc.phone} onChange={(e) => setDnc({ ...dnc, phone: e.target.value })} />
            <Btn icon="Ban" onClick={() => { if (dnc.phone.replace(/\D/g, '').length < 6) { toast('Enter a phone number.', 'bad'); return; } create('aiDnc', { name: dnc.name.trim() || 'Added by hand', phone: dnc.phone.trim(), source: 'Added by hand' }); setDnc({ name: '', phone: '' }); toast('Number blocked'); }}>Block number</Btn>
          </div>}
          {!dncList.length ? <Empty icon="Ban" text="No numbers blocked." /> : dncList.slice(0, 30).map((x) => (
            <div key={x.id} className="dashlet"><span className="grow trunc"><strong>{x.name}</strong> <span className="small muted">{x.phone} · {x.source}</span></span>{editable && <Btn sm kind="ghost" icon="Trash2" aria-label={`Unblock ${x.phone}`} onClick={() => setDel(x)} />}</div>
          ))}
        </div>
      </Card>
      {del && <Confirm title={`Unblock ${del.phone}?`} text="People and AI agents could call this number again." confirmLabel="Unblock" onClose={() => setDel(null)} onConfirm={() => { remove('aiDnc', del.id); toast('Number unblocked'); }} />}
    </div>
  );
}
