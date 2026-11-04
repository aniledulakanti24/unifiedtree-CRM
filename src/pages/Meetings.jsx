import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROLES, meetingPeople, useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, Drawer, Empty, PageHead, Pills, RecordModal } from '../ui';
import { localInput } from '../comms';
import { fmtDT, relTime } from '../util';

const VERB = { Requested: 'asked to meet', Passed: 'passed it', Accepted: 'accepted', Declined: 'declined', Withdrawn: 'withdrew the request', Rescheduled: 'moved the meeting', Cancelled: 'cancelled the meeting' };
const futureOnly = (k) => (v) => (v[k] && new Date(v[k]) <= new Date() ? { [k]: 'Choose a time in the future' } : {});
const tomorrowAt10 = () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return localInput(d); };

function RequestDialog({ onClose, onCreated }) {
  const { db, me, requestMeeting, toast } = useStore();
  const myManager = db.teams.find((x) => x.id === me.teamId)?.managerId;
  const rank = (u) => (u.id === myManager ? 0 : u.role === 'admin' ? 1 : u.role === 'manager' ? 2 : 3);
  const people = db.users.filter((u) => u.active && u.id !== me.id).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const fields = [
    { k: 'toId', label: 'Who do you want to meet?', type: 'select', req: true, full: true, hint: people.length ? '' : 'Nobody else is in this company yet. Add people in Users & roles.', options: people.map((u) => ({ value: u.id, label: `${u.name} (${u.id === myManager ? 'your manager' : ROLES[u.role]})` })) },
    { k: 'topic', label: 'Topic', req: true, full: true },
    { k: 'preferredAt', label: 'Preferred time', type: 'datetime-local', req: true },
    { k: 'minutes', label: 'Length', type: 'select', noBlank: true, list: 'meetingLength' },
    { k: 'note', label: 'Anything they should know', type: 'textarea' },
  ];
  return (
    <RecordModal title="Request a meeting" saveLabel="Send request" fields={fields} initial={{ preferredAt: tomorrowAt10(), minutes: 30 }} check={futureOnly('preferredAt')} onClose={onClose}
      onSave={(v) => { const r = requestMeeting({ toId: v.toId, topic: v.topic.trim(), note: v.note, preferredAt: new Date(v.preferredAt).toISOString(), minutes: Number(v.minutes) }); toast('Request sent'); onCreated(r.id); }} />
  );
}

function AcceptDialog({ request, onClose }) {
  const { acceptMeeting, toast } = useStore();
  const fields = [
    { k: 'start', label: 'Meeting time', type: 'datetime-local', req: true },
    { k: 'minutes', label: 'Length', type: 'select', noBlank: true, list: 'meetingLength' },
    { k: 'location', label: 'Location', full: true },
    { k: 'note', label: 'Note', type: 'textarea' },
  ];
  const later = new Date(request.preferredAt) > new Date();
  return (
    <RecordModal title="Accept meeting" saveLabel="Accept and schedule" fields={fields} initial={{ start: later ? localInput(request.preferredAt) : '', minutes: request.minutes, location: 'Video call' }} check={futureOnly('start')} onClose={onClose}
      onSave={(v) => { const start = new Date(v.start); acceptMeeting(request.id, { start: start.toISOString(), end: new Date(start.getTime() + Number(v.minutes) * 6e4).toISOString(), location: v.location, note: v.note }); toast('Meeting scheduled'); }} />
  );
}

function PassDialog({ request, onClose }) {
  const { db, me, passMeeting, userName, toast } = useStore();
  const asker = db.users.find((u) => u.id === request.requestedBy);
  const asksManager = db.teams.find((x) => x.id === asker?.teamId)?.managerId;
  const people = db.users.filter((u) => u.active && u.id !== me.id && u.id !== request.requestedBy);
  const fields = [
    { k: 'toId', label: 'Pass to', type: 'select', req: true, full: true, options: people.map((u) => ({ value: u.id, label: `${u.name} (${u.id === asksManager ? `${asker.name.split(' ')[0]}'s manager` : ROLES[u.role]})` })) },
    { k: 'note', label: `Note for them and ${userName(request.requestedBy)}`, type: 'textarea' },
  ];
  return (
    <RecordModal size="sm" title="Pass to someone else" saveLabel="Pass request" fields={fields} initial={{ toId: people.some((u) => u.id === asksManager) ? asksManager : '' }} onClose={onClose}
      onSave={(v) => { passMeeting(request.id, v.toId, v.note); toast(`Passed to ${userName(v.toId)}`); }} />
  );
}

function DeclineDialog({ request, onClose }) {
  const { declineMeeting, toast } = useStore();
  return (
    <RecordModal size="sm" title="Decline meeting" saveLabel="Decline" fields={[{ k: 'note', label: 'Reason', type: 'textarea', hint: 'Shared with everyone on this request.' }]} onClose={onClose}
      onSave={(v) => { declineMeeting(request.id, v.note); toast('Request declined'); }} />
  );
}

function RequestDrawer({ request: r, onClose }) {
  const { db, me, can, userName, withdrawMeeting, toast } = useStore();
  const [dialog, setDialog] = useState(null);
  const mine = r.status === 'Pending' && r.toId === me.id && can('meetings', 'respond');
  const canPass = db.users.some((u) => u.active && u.id !== me.id && u.id !== r.requestedBy);
  const footer = mine
    ? <>{canPass && <Btn icon="Forward" onClick={() => setDialog('pass')}>Pass</Btn>}<Btn kind="danger" onClick={() => setDialog('decline')}>Decline</Btn><Btn kind="primary" icon="Check" onClick={() => setDialog('accept')}>Accept</Btn></>
    : r.status === 'Pending' && r.requestedBy === me.id ? <Btn kind="danger" onClick={() => setDialog('withdraw')}>Withdraw request</Btn> : null;
  return (
    <>
      <Drawer title={r.topic} onClose={onClose} footer={footer}>
        <div className="stack">
          <div><Badge>{r.status}</Badge></div>
          <dl className="dl">
            <dt>Asked by</dt><dd>{userName(r.requestedBy)}</dd>
            {r.status === 'Pending' && <><dt>Waiting on</dt><dd className="strong">{r.toId === me.id ? 'You' : userName(r.toId)}</dd></>}
            {r.status === 'Pending' && <><dt>Preferred time</dt><dd>{fmtDT(r.preferredAt)}</dd></>}
            {r.status === 'Accepted' && <><dt>Meeting time</dt><dd className="strong">{fmtDT(r.scheduledAt)}</dd><dt>With</dt><dd>{userName(r.acceptedBy)} and {userName(r.requestedBy)}</dd></>}
            <dt>Length</dt><dd>{r.minutes} minutes</dd>
            {r.note && <><dt>Note</dt><dd>{r.note}</dd></>}
          </dl>
          {r.status === 'Accepted' && can('calendar') && <div><Link className="btn sm" to="/calendar">Open calendar</Link></div>}
          <div>
            <div className="pop-head" style={{ paddingInlineStart: 0 }}>History</div>
            <div className="stack-s">
              {r.history.map((h, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                  <Avatar name={userName(h.by)} size={26} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}><strong>{userName(h.by)}</strong> {VERB[h.action] || h.action}{h.toId && ` ${h.action === 'Passed' ? 'to ' : ''}${userName(h.toId)}`}</div>
                    {h.note && <div className="small" style={{ overflowWrap: 'anywhere' }}>“{h.note}”</div>}
                    <div className="small muted">{fmtDT(h.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
      {dialog === 'accept' && <AcceptDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'pass' && <PassDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'decline' && <DeclineDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'withdraw' && <Confirm title="Withdraw this request?" text="Everyone on this request will be told." confirmLabel="Withdraw" onClose={() => setDialog(null)} onConfirm={() => { withdrawMeeting(r.id); toast('Request withdrawn'); }} />}
    </>
  );
}

export default function Meetings() {
  const { db, me, t, can, scopeOf, userName } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const visible = db.meetingRequests.filter((r) => scopeOf('meetings') === 'all' || meetingPeople(r).includes(me.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waiting = visible.filter((r) => r.status === 'Pending' && r.toId === me.id);
  const sent = visible.filter((r) => r.requestedBy === me.id);
  const [tab, setTab] = useState(waiting.length ? 'waiting' : 'all');
  const rows = { waiting, sent, all: visible }[tab];
  const open = visible.find((r) => r.id === openId);

  // Bell entries and the home screen link here with ?open=id or ?new=1.
  useEffect(() => {
    if (params.get('open')) setOpenId(params.get('open'));
    if (params.get('new') && can('meetings', 'create')) setCreating(true);
    if (params.get('open') || params.get('new')) setParams({}, { replace: true });
  }, [params]);

  return (
    <div>
      <PageHead title={t('meetings')} sub="Ask to meet anyone, and see who has answered">
        {can('meetings', 'create') && <Btn kind="primary" icon="CalendarPlus" onClick={() => setCreating(true)}>Request a meeting</Btn>}
      </PageHead>
      <div style={{ marginBottom: 12 }}>
        <Pills value={tab} onChange={setTab} options={[{ k: 'waiting', label: `Needs my answer (${waiting.length})` }, { k: 'sent', label: `My requests (${sent.length})` }, { k: 'all', label: `All (${visible.length})` }]} />
      </div>
      <div className="stack-s">
        {!rows.length && <div className="card"><Empty icon="CalendarClock" text={tab === 'waiting' ? 'Nothing is waiting on you.' : 'No meeting requests yet.'} /></div>}
        {rows.map((r) => (
          <button key={r.id} type="button" className="task-row" style={{ width: '100%', textAlign: 'start', color: 'inherit' }} onClick={() => setOpenId(r.id)}>
            <Avatar name={userName(r.requestedBy)} size={32} />
            <span className="grow" style={{ minWidth: 0 }}>
              <div className="strong trunc">{r.topic}</div>
              <div className="small muted trunc">{r.requestedBy === me.id ? 'You' : userName(r.requestedBy)} · {r.status === 'Pending' ? `waiting on ${r.toId === me.id ? 'you' : userName(r.toId)}` : r.status === 'Accepted' ? `meeting ${fmtDT(r.scheduledAt)}` : relTime(r.history[r.history.length - 1].at)}</div>
            </span>
            <Badge>{r.status}</Badge>
          </button>
        ))}
      </div>
      {creating && <RequestDialog onClose={() => setCreating(false)} onCreated={(id) => { setTab('sent'); setOpenId(id); }} />}
      {open && <RequestDrawer key={open.id} request={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
