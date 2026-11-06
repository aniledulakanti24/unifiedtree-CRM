import { getLocale, getWeekStart } from '../util';
import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Empty, FormFields, Modal, PageHead, Pills, UserChip, firstAllowed, validate } from '../ui';
import { downloadBlob, fmtDT, fmtTime, iso, pad, uid } from '../util';
import { REPEATS, clashes, icsFile, seriesStarts } from '../calendarTools';
import { BookingCard, TeamView } from './CalendarExtras';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const sameDay = (a, b) => iso(a) === iso(b);
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() - getWeekStart() + 7) % 7)); x.setHours(0, 0, 0, 0); return x; };
const local = (d) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function EventDialog({ initial, onClose }) {
  const { db, me, role, create, update, remove, toast, can, userName, pushNotification, meetingEventChanged, formFields } = useStore();
  const editing = !!initial.id;
  const canSave = can('calendar', editing ? 'edit' : 'create');
  const [v, setV] = useState({ ...initial, start: local(new Date(initial.start)), end: local(new Date(initial.end)) });
  const [errors, setErrors] = useState({});
  const [warned, setWarned] = useState('');
  const [asking, setAsking] = useState(false);
  const eventFields = [
    { k: 'title', label: 'Title', req: true, full: true },
    { k: 'category', label: 'Category', type: 'select', noBlank: true, list: 'eventCategory' },
    { k: 'companyId', label: 'Client', type: 'company' },
    { k: 'start', label: 'Starts', type: 'datetime-local', req: true },
    { k: 'end', label: 'Ends', type: 'datetime-local', req: true },
    { k: 'location', label: 'Location' },
    { k: 'ownerId', label: 'Assigned to', type: 'user', req: true, hide: role === 'sales' },
    ...(editing ? [] : [{ k: 'repeat', label: 'Repeats', type: 'select', noBlank: true, options: REPEATS }, ...(v.repeat && v.repeat !== 'Never' ? [{ k: 'until', label: 'Until', type: 'date', hint: 'Up to 26 appointments.' }] : [])]),
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const fields = formFields('event', eventFields);
  const people = [v.ownerId || me.id, ...(v.attendeeIds || [])];
  const clash = v.start && v.end && v.end > v.start ? clashes(db.events, people, new Date(v.start), new Date(v.end), initial.id) : [];
  const save = () => {
    const e = validate(fields, v);
    if (v.start && v.end && v.end <= v.start) e.end = 'End must be after the start';
    setErrors(e);
    if (Object.keys(e).length) return;
    // A clash warns once. Saving again means they meant it.
    const key = clash.map((x) => x.id).join();
    if (clash.length && warned !== key) { setWarned(key); return; }
    const rec = { ...v, start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString(), ownerId: v.ownerId || me.id };
    const moved = editing && rec.start !== initial.start;
    if (moved) rec.reminders = {};
    if (editing) { const { id, ...rest } = rec; update('events', id, rest); toast('Appointment saved'); } else {
      const starts = seriesStarts(rec.start, rec.repeat, rec.until);
      const length = new Date(rec.end) - new Date(rec.start);
      const seriesId = starts.length > 1 ? uid('sr') : '';
      starts.forEach((s) => create('events', { ...rec, start: s.toISOString(), end: new Date(s.getTime() + length).toISOString(), ...(seriesId ? { seriesId } : {}) }));
      toast(starts.length > 1 ? `${starts.length} appointments created` : 'Appointment created');
    }
    (rec.attendeeIds || []).filter((u) => u !== me.id && !initial.attendeeIds?.includes(u)).forEach((u) => pushNotification(u, `${me.name} invited you to "${rec.title}" on ${fmtDT(rec.start)}.`, '/calendar'));
    if (moved) meetingEventChanged(rec, rec.start);
    if (rec.ownerId !== me.id && rec.ownerId !== initial.ownerId) pushNotification(rec.ownerId, `${me.name} added "${rec.title}" to your calendar for ${fmtDT(rec.start)}.`, '/calendar');
    onClose();
  };
  return (
    <Modal title={editing ? 'Edit appointment' : 'New appointment'} onClose={onClose} footer={<>
      {editing && can('calendar', 'delete') && <Btn kind="danger" icon="Trash2" style={{ marginInlineEnd: 'auto' }} onClick={() => { if (initial.seriesId) { setAsking(true); return; } remove('events', v.id); meetingEventChanged(initial); toast('Appointment deleted'); onClose(); }}>Delete</Btn>}
      {editing && <Btn icon="CalendarArrowDown" onClick={() => downloadBlob(new Blob([icsFile([initial], db.settings.companyName)], { type: 'text/calendar' }), 'appointment.ics')}>Add to my calendar</Btn>}
      <Btn onClick={onClose}>{canSave ? 'Cancel' : 'Close'}</Btn>{canSave && <Btn kind="primary" onClick={save}>Save</Btn>}
    </>}>
      {v.attendeeIds?.length > 0 && <p className="sub" style={{ margin: '0 0 12px' }}>With {[v.ownerId, ...v.attendeeIds].filter((u) => u !== me.id).map((u) => userName(u)).join(', ')}</p>}
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
      <div className="field" style={{ marginTop: 12 }}>
        <div className="label">Invite people</div>
        <select className="select" aria-label="Invite someone" value="" disabled={!canSave} onChange={(e) => { if (e.target.value) setV((p) => ({ ...p, attendeeIds: [...(p.attendeeIds || []), e.target.value] })); }}><option value="">Add a person…</option>{db.users.filter((u) => u.active && !people.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        {!!v.attendeeIds?.length && <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>{v.attendeeIds.map((u) => <span key={u} className="wa-chip">{userName(u)}{canSave && <button type="button" className="link-btn" aria-label={`Remove ${userName(u)}`} onClick={() => setV((p) => ({ ...p, attendeeIds: p.attendeeIds.filter((x) => x !== u) }))}> ×</button>}</span>)}</div>}
      </div>
      {clash.length > 0 && <div className="notice" style={{ marginTop: 12 }}>This overlaps {clash.slice(0, 2).map((x) => `"${x.title}" for ${userName(x.ownerId)}`).join(' and ')}{clash.length > 2 ? ` and ${clash.length - 2} more` : ''}.{warned ? ' Press Save again to book it anyway.' : ''}</div>}
      {asking && <Modal size="sm" title="Delete this repeating appointment?" onClose={() => setAsking(false)} footer={<><Btn onClick={() => setAsking(false)}>Cancel</Btn><Btn onClick={() => { remove('events', v.id); toast('This one deleted'); onClose(); }}>Just this one</Btn><Btn kind="danger" onClick={() => { const later = db.events.filter((x) => x.seriesId === initial.seriesId && x.start >= initial.start); later.forEach((x) => remove('events', x.id)); toast(`${later.length} appointments deleted`); onClose(); }}>This and later ones</Btn></>}><p style={{ margin: 0 }}>This appointment is part of a series.</p></Modal>}
    </Modal>
  );
}

export default function CalendarPage() {
  const { db, me, can, sec, scopeOf, t, assignable, scope, companyName, optionsOf, labelOf, update, toast, meetingEventChanged } = useStore();
  const [owner, setOwner] = useState('');
  const [cur, setCur] = useState(new Date());
  const [pref, setView] = useState('Month');
  const views = ['Month', 'Week', 'Day', 'List', 'Team'].filter((v) => sec('calendar', v.toLowerCase()));
  const view = firstAllowed(views, pref);
  const [hiddenCats, setHiddenCats] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const now = new Date();
  const events = useMemo(() => scope(db.events).filter((e) => !hiddenCats.has(e.category) && (!owner || e.ownerId === owner)).sort((a, b) => a.start.localeCompare(b.start)), [db.events, hiddenCats, me.id, owner]);
  const onDay = (d) => events.filter((e) => sameDay(new Date(e.start), d));
  const upcoming = events.filter((e) => e.start >= now.toISOString()).slice(0, 5);
  const newAt = (d, h = 10) => { if (!can('calendar', 'create')) return; const s = new Date(d); s.setHours(h, 0, 0, 0); setEdit({ title: '', category: 'Meeting', start: s.toISOString(), end: new Date(s.getTime() + 36e5).toISOString(), ownerId: me.id, location: 'Video call', companyId: '', notes: '' }); };
  // Drag an appointment to another day or hour. It keeps its length.
  const dragStart = (e, x) => { e.dataTransfer?.setData('text/plain', x.id); };
  const dropOn = (e, day, hour) => {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain');
    const ev = db.events.find((x) => x.id === id);
    if (!ev || !can('calendar', 'edit')) return;
    const from = new Date(ev.start);
    const at = new Date(day);
    at.setHours(hour ?? from.getHours(), hour == null ? from.getMinutes() : 0, 0, 0);
    if (at.getTime() === from.getTime()) return;
    const start = at.toISOString();
    const rec = { start, end: new Date(at.getTime() + (new Date(ev.end) - from)).toISOString(), reminders: {} };
    update('events', id, rec);
    meetingEventChanged({ ...ev, ...rec }, start);
    toast(`Moved to ${fmtDT(start)}`);
  };
  const canMove = can('calendar', 'edit');
  const bookWith = (at, ids, minutes) => { setEdit({ title: '', category: 'Meeting', start: at.toISOString(), end: new Date(at.getTime() + minutes * 6e4).toISOString(), ownerId: me.id, attendeeIds: ids.filter((u) => u !== me.id), location: 'Video call', companyId: '', notes: '', repeat: 'Never' }); };
  const step = (n) => {
    const d = new Date(cur);
    if (view === 'Month' || view === 'List') d.setMonth(d.getMonth() + n, 1);
    else if (view === 'Team') d.setDate(d.getDate() + n);
    else if (view === 'Week') d.setDate(d.getDate() + 7 * n);
    else d.setDate(d.getDate() + n);
    setCur(d);
  };
  const title = view === 'Day' || view === 'Team' ? cur.toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'Week' ? `Week of ${startOfWeek(cur).toLocaleDateString(getLocale(), { month: 'long', day: 'numeric', year: 'numeric' })}`
      : cur.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });

  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const days = view === 'Day' ? [cur] : Array.from({ length: 7 }, (_, i) => { const s = startOfWeek(cur); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i); });
  const monthEvents = events.filter((e) => { const d = new Date(e.start); return d.getMonth() === cur.getMonth() && d.getFullYear() === cur.getFullYear(); });

  return (
    <div>
      <PageHead title={t('calendar')} />
      <div className="cal-layout">
        <div className="stack">
          {can('calendar', 'create') && <Btn kind="primary" icon="Plus" style={{ width: '100%' }} onClick={() => newAt(new Date())}>Create appointment</Btn>}
          {can('calendar', 'create') && <BookingCard />}
          {sec('calendar', 'upcoming') && <Card title="Upcoming">
            {!upcoming.length && <div className="sub muted">Nothing scheduled.</div>}
            {upcoming.map((e) => (
              <button key={e.id} type="button" className="dashlet" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'start', padding: '7px 0' }} onClick={() => setEdit(e)}>
                <span className="grow"><div className="small muted">{new Date(e.start).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(e.start)}</div><div className="trunc strong" style={{ fontSize: 13 }}>{e.title}</div></span>
              </button>
            ))}
          </Card>}
          {sec('calendar', 'categories') && <Card title="Categories">
            <div className="stack-s">
              {optionsOf('eventCategory').map((c) => (
                <label key={c} className="check">
                  <input type="checkbox" checked={!hiddenCats.has(c)} onChange={() => setHiddenCats((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />
                  <span className={`ev ${c}`} style={{ width: 'auto' }}>{labelOf(c)}</span>
                </label>
              ))}
            </div>
          </Card>}
        </div>
        <div className="card">
          <div className="tb-toolbar">
            <Btn icon="ChevronLeft" aria-label="Previous" onClick={() => step(-1)} />
            <Btn icon="ChevronRight" aria-label="Next" onClick={() => step(1)} />
            <Btn onClick={() => setCur(new Date())}>Today</Btn>
            <h2 className="card-t" style={{ fontSize: 16 }}>{title}</h2>
            <div className="grow" />
            <Btn icon="CalendarArrowDown" aria-label="Download calendar file" title="Download my appointments as a calendar file" onClick={() => { downloadBlob(new Blob([icsFile(events, db.settings.companyName)], { type: 'text/calendar' }), 'appointments.ics'); toast(`${events.length} appointments downloaded`); }} />
            {scopeOf('calendar') !== 'own' && <select className="select tb-filter" aria-label="Salesperson" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Whole team</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
            <Pills value={view} onChange={setView} options={views} />
          </div>
          {view === 'Month' && (
            <div style={{ overflowX: 'auto' }}>
              <div className="cal-grid" style={{ minWidth: 340 }}>
                {cells.slice(0, 7).map((d) => <div key={iso(d)} className="cal-dow">{d.toLocaleDateString(getLocale(), { weekday: 'short' })}</div>)}
                {cells.map((d) => {
                  const list = onDay(d);
                  return (
                    <div key={iso(d)} role="button" tabIndex={0} aria-label={`Add appointment on ${d.toDateString()}`} className={`cal-cell ${d.getMonth() !== cur.getMonth() ? 'off' : ''} ${sameDay(d, now) ? 'today' : ''}`} onDragOver={canMove ? (e) => e.preventDefault() : undefined} onDrop={canMove ? (e) => dropOn(e, d) : undefined} onClick={() => newAt(d)} onKeyDown={(e) => { if (e.key === 'Enter') newAt(d); }}>
                      <span className="cal-num num">{d.getDate()}</span>
                      {list.slice(0, 3).map((e) => <button key={e.id} type="button" draggable={canMove} onDragStart={(x) => dragStart(x, e)} title={e.title} className={`ev ${e.category}`} onClick={(x) => { x.stopPropagation(); setEdit(e); }}>{fmtTime(e.start).replace(':00', '')} {e.title}</button>)}
                      {list.length > 3 && <button type="button" className="small muted" style={{ border: 0, background: 'none', textAlign: 'start', padding: '0 4px' }} onClick={(x) => { x.stopPropagation(); setCur(d); setView('Day'); }}>+{list.length - 3} more</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(view === 'Week' || view === 'Day') && (
            <div className="week" style={{ '--days': days.length }}>
              <div className="wh" />
              {days.map((d) => <div key={iso(d)} className={`wh ${sameDay(d, now) ? 'today' : ''}`}>{d.toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric' })}</div>)}
              {HOURS.map((h) => (
                <React.Fragment key={h}>
                  <div className="hr">{h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}</div>
                  {days.map((d) => (
                    <div key={iso(d)} className="slot" role="button" tabIndex={0} aria-label={`Add at ${h}:00 on ${d.toDateString()}`} onDragOver={canMove ? (x) => x.preventDefault() : undefined} onDrop={canMove ? (x) => dropOn(x, d, h) : undefined} onClick={() => newAt(d, h)} onKeyDown={(e) => { if (e.key === 'Enter') newAt(d, h); }}>
                      {onDay(d).filter((e) => new Date(e.start).getHours() === h).map((e) => <button key={e.id} type="button" draggable={canMove} onDragStart={(x) => dragStart(x, e)} title={e.title} className={`ev ${e.category}`} onClick={(x) => { x.stopPropagation(); setEdit(e); }}>{e.title}</button>)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          )}
          {view === 'Team' && <TeamView day={cur} onPick={bookWith} />}
          {view === 'List' && (
            <div className="tb-wrap">
              {!monthEvents.length ? <Empty icon="CalendarOff" text="No appointments this month." /> : (
                <table className="table"><thead><tr><th>When</th><th>Appointment</th><th>Client</th><th>Category</th><th>Assigned</th></tr></thead><tbody>
                  {monthEvents.map((e) => <tr key={e.id} className="clickable" onClick={() => setEdit(e)}><td className="nowrap">{fmtDT(e.start)}</td><td className="strong">{e.title}</td><td>{companyName(e.companyId)}</td><td><Badge tone="muted" dot={false}>{e.category}</Badge></td><td><UserChip id={e.ownerId} /></td></tr>)}
                </tbody></table>
              )}
            </div>
          )}
        </div>
      </div>
      {edit && <EventDialog initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
