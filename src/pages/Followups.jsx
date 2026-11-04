import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, Empty, Icon, Kpi, PageHead, Pills } from '../ui';
import { CHANNELS, FollowupDialog, useComms, whatsappUrl } from '../comms';
import { fmtDT, today } from '../util';

const dayOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const linkOf = (f) => ({ contact: `/contacts?open=${f.relatedId}`, deal: `/pipeline/${f.relatedId}`, company: `/customers/${f.relatedId}`, lead: `/leads?open=${f.relatedId}` }[f.relatedType]);

function Row({ f, onEdit, onDelete }) {
  const { db, can, scopeOf, update, toast, userName } = useStore();
  const { startCall, canCall, canVideo, canWhatsapp, snooze, inCall } = useComms();
  const open = f.status === 'open';
  const late = open && f.at < new Date().toISOString();
  const person = { name: f.name, phone: f.phone, relatedType: f.relatedType, relatedId: f.relatedId, contactId: f.contactId, companyId: db.contacts.find((c) => c.id === f.contactId)?.companyId };
  const to = linkOf(f);
  return (
    <div className={`task-row ${open ? '' : 'done'}`}>
      <input type="checkbox" aria-label={`Complete ${f.title}`} checked={!open} disabled={!can('followups', 'edit')} onChange={(e) => { update('followups', f.id, { status: e.target.checked ? 'done' : 'open' }); toast(e.target.checked ? 'Follow-up done' : 'Follow-up reopened'); }} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
      <span className="kpi-ico" style={{ width: 30, height: 30 }}><Icon name={CHANNELS[f.channel]} size={15} /></span>
      <button type="button" className="grow" disabled={!can('followups', 'edit')} onClick={() => onEdit(f)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'start', color: 'inherit' }}>
        <div className="task-t strong trunc">{f.title}</div>
        <div className="small trunc" style={{ color: late ? 'var(--bad)' : 'var(--ink-3)' }}>{late ? 'Overdue · ' : ''}{fmtDT(f.at)}{f.snoozedUntil && open ? ` · snoozed until ${fmtDT(f.snoozedUntil)}` : ''}</div>
      </button>
      {f.name && (to ? <Link to={to} className="small nowrap">{f.name}</Link> : <span className="small nowrap">{f.name}</span>)}
      <Badge tone="muted" dot={false}>{f.channel}</Badge>
      {open && f.phone && f.channel === 'Call' && canCall && <Btn sm icon="Phone" aria-label={`Call ${f.name}`} disabled={inCall} onClick={() => startCall('voice', person)} />}
      {open && f.phone && f.channel === 'Video' && canVideo && <Btn sm icon="Video" aria-label={`Video call ${f.name}`} disabled={inCall} onClick={() => startCall('video', person)} />}
      {open && f.phone && f.channel === 'WhatsApp' && canWhatsapp && <a className="btn sm icon" href={whatsappUrl(f.phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${f.name}`}><Icon name="MessageCircle" size={14} /></a>}
      {open && can('followups', 'edit') && <Btn sm onClick={() => snooze(f, 60)}>Snooze</Btn>}
      {scopeOf('followups') !== 'own' && <Avatar name={userName(f.ownerId)} size={24} />}
      {can('followups', 'delete') && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${f.title}`} onClick={() => onDelete(f)} />}
    </div>
  );
}

export default function Followups() {
  const { db, me, t, sec, can, scope, scopeOf, assignable, remove, toast } = useStore();
  const [tab, setTab] = useState('today');
  const [owner, setOwner] = useState('');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const rows = useMemo(() => scope(db.followups).filter((f) => !owner || f.ownerId === owner), [db.followups, me.id, owner]);
  const now = new Date().toISOString();
  const d = today();
  const groups = {
    overdue: rows.filter((f) => f.status === 'open' && f.at < now && dayOf(f.at) < d),
    today: rows.filter((f) => f.status === 'open' && dayOf(f.at) === d),
    upcoming: rows.filter((f) => f.status === 'open' && dayOf(f.at) > d),
    done: rows.filter((f) => f.status === 'done'),
  };
  const shown = [...groups[tab]].sort((a, b) => (tab === 'done' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
  const askDesktop = async () => {
    try { const r = await Notification.requestPermission(); setPerm(r); toast(r === 'granted' ? 'Desktop alerts turned on' : 'Desktop alerts stay off'); } catch { setPerm('unsupported'); }
  };
  return (
    <div>
      <PageHead title={t('followups')} sub="Reminders pop up while the CRM is open">
        {perm === 'default' && <Btn icon="BellRing" onClick={askDesktop}>Turn on desktop alerts</Btn>}
        {can('followups', 'create') && <Btn kind="primary" icon="BellPlus" onClick={() => setEdit({})}>Schedule follow-up</Btn>}
      </PageHead>
      {sec('followups', 'kpis') && (
        <div className="g4" style={{ marginBottom: 14 }}>
          <Kpi label="Overdue" value={groups.overdue.length} note="From earlier days" icon="AlarmClockOff" />
          <Kpi label="Today" value={groups.today.length} icon="AlarmClock" />
          <Kpi label="Upcoming" value={groups.upcoming.length} icon="CalendarClock" />
          <Kpi label="Done" value={groups.done.length} icon="CircleCheck" />
        </div>
      )}
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Pills value={tab} onChange={setTab} options={[['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Done']].map(([k, label]) => ({ k, label, count: groups[k].length }))} />
        {scopeOf('followups') !== 'own' && <select className="select tb-filter" aria-label="Salesperson" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Everyone</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      </div>
      <div className="stack-s">
        {shown.map((f) => <Row key={f.id} f={f} onEdit={setEdit} onDelete={setDel} />)}
        {!shown.length && <div className="card"><Empty icon="BellOff" text="Nothing here." /></div>}
      </div>
      {edit && <FollowupDialog initial={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete follow-up?" text={`“${del.title}” will be removed.`} onClose={() => setDel(null)} onConfirm={() => { remove('followups', del.id); toast('Follow-up deleted'); }} />}
    </div>
  );
}
