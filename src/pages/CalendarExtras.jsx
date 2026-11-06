import React, { useState } from 'react';
import { useStore } from '../store';
import { Avatar, Btn, Card, Empty, FormFields, Icon } from '../ui';
import { bookingOf, bookingSlots, clashes, eventsFor, firstFree } from '../calendarTools';
import { fmtDT, fmtTime, getLocale, iso, uid } from '../util';

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

// Who is free when. People you can't see in full show as Busy, with no details.
export function TeamView({ day, onPick }) {
  const { db, me, scope } = useStore();
  const people = db.users.filter((u) => u.active);
  const team = people.filter((u) => u.teamId && u.teamId === me.teamId && u.id !== me.id);
  const [picked, setPicked] = useState(() => [me.id, ...team.slice(0, 3).map((u) => u.id)]);
  const [minutes, setMinutes] = useState(30);
  const [found, setFound] = useState(undefined);
  const visible = new Set(scope(db.events).map((e) => e.id));
  const shown = people.filter((u) => picked.includes(u.id));
  const at = (h) => { const d = new Date(day); d.setHours(h, 0, 0, 0); return d; };
  const find = () => setFound(firstFree(db.events, picked, minutes) || null);
  return (
    <div className="stack" style={{ padding: 12 }}>
      <div className="row wrap">
        <select className="select tb-filter" aria-label="Add a person" value="" onChange={(e) => { if (e.target.value) { setPicked([...picked, e.target.value]); setFound(undefined); } }}><option value="">Add a person…</option>{people.filter((u) => !picked.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select className="select tb-filter" aria-label="Meeting length" value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); setFound(undefined); }}>{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
        <Btn icon="Search" disabled={!picked.length} onClick={find}>Find a time</Btn>
        {found && <span className="row small"><strong>{fmtDT(found.toISOString())}</strong> works for everyone<Btn sm kind="primary" onClick={() => onPick(found, picked, minutes)}>Book it</Btn></span>}
        {found === null && <span className="small muted">No shared time in the next two weeks.</span>}
      </div>
      <div className="tb-wrap">
        <table className="table team-grid">
          <thead><tr><th>Person</th>{HOURS.map((h) => <th key={h} className="c">{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</th>)}</tr></thead>
          <tbody>{shown.map((u) => (
            <tr key={u.id}>
              <td className="nowrap"><span className="row" style={{ gap: 6 }}><Avatar name={u.name} size={22} /><span className="small trunc" style={{ maxWidth: 110 }}>{u.name}</span>{picked.length > 1 && <button type="button" className="link-btn" aria-label={`Remove ${u.name}`} onClick={() => { setPicked(picked.filter((x) => x !== u.id)); setFound(undefined); }}><Icon name="X" size={12} /></button>}</span></td>
              {HOURS.map((h) => {
                const list = clashes(eventsFor(db.events, u.id), [u.id], at(h), at(h + 1));
                const busy = list.length > 0;
                const label = busy ? list.map((e) => (visible.has(e.id) ? e.title : 'Busy')).join(', ') : 'Free';
                return <td key={h} className="c" style={{ padding: 2 }}><button type="button" aria-label={`${u.name}, ${h}:00, ${label}`} title={label} className={`team-cell ${busy ? 'busy' : ''}`} onClick={() => !busy && onPick(at(h), picked, 60)} /></td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="small muted">Shaded means busy. Pick a free hour to book it with everyone listed. Details only show for appointments you can already see.</div>
    </div>
  );
}

export function BookingCard() {
  const { db, me, savePrefs, toast } = useStore();
  const b = bookingOf(db.prefs?.[me.id]);
  const url = `${location.origin}${location.pathname}#/book/${me.id}`;
  const put = (k, x) => savePrefs({ booking: { ...b, [k]: k === 'length' ? Number(x) : x } });
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Booking link copied'); } catch { toast(url); } };
  return (
    <Card title="My booking page" sub="Let customers pick a free time with you.">
      <div className="stack-s">
        <FormFields values={b} onChange={put} fields={[
          { k: 'on', label: 'Booking', type: 'check', text: 'Turn on my booking page', full: true },
          ...(b.on ? [{ k: 'from', label: 'From', type: 'time' }, { k: 'to', label: 'Until', type: 'time' }, { k: 'length', label: 'Meeting length', type: 'select', noBlank: true, full: true, options: [15, 30, 45, 60].map((m) => ({ value: m, label: `${m} minutes` })) }] : []),
        ]} />
        {b.on && <div className="row wrap"><Btn sm icon="Link" onClick={copy}>Copy link</Btn><a className="btn sm" href={`#/book/${me.id}`} target="_blank" rel="noreferrer">Open page</a></div>}
      </div>
    </Card>
  );
}

// The public page a customer opens from a booking link.
export function BookPage({ userId }) {
  const { db, setDbFromPublic } = useStore();
  const user = db.users.find((u) => u.id === userId && u.active);
  const b = bookingOf(db.prefs?.[userId]);
  const [slot, setSlot] = useState(null);
  const [v, setV] = useState({ name: '', email: '', note: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const days = Array.from({ length: 10 }, (_, i) => new Date(Date.now() + i * 864e5));
  const grouped = user ? days.map((d) => ({ d, slots: bookingSlots(db.events, userId, b, d) })).filter((x) => x.slots.length).slice(0, 5) : [];
  const book = () => {
    if (!v.name.trim()) { setError('Please enter your name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(v.email)) { setError('Please enter a valid email address.'); return; }
    setDbFromPublic((d) => {
      const at = new Date().toISOString();
      const end = new Date(slot.getTime() + b.length * 6e4).toISOString();
      const known = d.contacts.find((c) => c.email?.toLowerCase() === v.email.trim().toLowerCase());
      const next = { ...d, events: [{ id: uid('ev'), title: `Meeting with ${v.name.trim()}`, category: 'Meeting', start: slot.toISOString(), end, ownerId: userId, location: 'Video call', notes: v.note, booked: true, companyId: known?.companyId || '', createdAt: at }, ...d.events], notifications: [{ id: uid('n'), to: userId, at, text: `${v.name.trim()} booked a meeting for ${fmtDT(slot.toISOString())}`, link: '/calendar', read: false }, ...d.notifications] };
      if (!known && !d.leads.some((l) => l.email?.toLowerCase() === v.email.trim().toLowerCase())) next.leads = [{ id: uid('le'), name: v.name.trim(), company: '', email: v.email.trim(), phone: '', status: 'New', source: 'Booking page', ownerId: userId, expected: 0, score: 40, createdAt: at }, ...d.leads];
      return next;
    });
    setDone(slot);
  };
  return (
    <div className="public-form">
      <div className="card card-b" style={{ maxWidth: 560, margin: '24px auto' }}>
        <div className="small muted">{db.settings.companyName}</div>
        {!user || !b.on ? <Empty icon="CalendarOff" text="This booking page isn't available." /> : done ? (
          <div className="stack-s" style={{ marginTop: 8 }}><h1 style={{ fontSize: 22, fontWeight: 680 }}>You're booked</h1><div>{fmtDT(done.toISOString())} with {user.name}.</div><div className="small muted">Simulated: no confirmation email was sent.</div></div>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 680 }}>Book a time with {user.name}</h1>
            {!grouped.length && <Empty icon="CalendarOff" text="No free times in the next few days." />}
            {grouped.map(({ d, slots }) => (
              <div key={iso(d)}>
                <div className="label" style={{ marginBottom: 4 }}>{d.toLocaleDateString(getLocale(), { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                <div className="row wrap" style={{ gap: 6 }}>{slots.slice(0, 8).map((s) => <Btn key={s.toISOString()} sm kind={slot?.getTime() === s.getTime() ? 'primary' : ''} onClick={() => { setSlot(s); setError(''); }}>{fmtTime(s.toISOString())}</Btn>)}</div>
              </div>
            ))}
            {slot && <div className="stack-s">
              <div className="field"><label className="label" htmlFor="bk-name">Your name</label><input id="bk-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="bk-email">Your email</label><input id="bk-email" className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="bk-note">Anything we should know?</label><textarea id="bk-note" className="textarea" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
              {error && <div className="error-text">{error}</div>}
              <div><Btn kind="primary" onClick={book}>Confirm for {fmtDT(slot.toISOString())}</Btn></div>
            </div>}
            <div className="small muted">Simulated. It only works in the browser that holds this data, until there's a server.</div>
          </div>
        )}
      </div>
    </div>
  );
}
