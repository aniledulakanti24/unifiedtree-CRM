import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Icon, DataTable, Drawer, Empty, FormFields, Kpi, Modal, NoSections, PageHead, Pills, UserChip } from '../ui';
import { AREAS, OPEN, PRIORITY_HOURS, REQUEST_TYPES, STATUSES, deliveryCheck, dueOf, isLate, sourceFor, teamFor, typeLabel } from '../opsTools';
import { fmtDate, fmtDT, num, relTime } from '../util';

const STATUS_TONE = { Open: 'info', 'In progress': 'warn', 'Waiting for you': 'warn', Done: 'good', Declined: 'muted' };
const PRI_TONE = { Urgent: 'bad', High: 'warn', Normal: 'muted', Low: 'muted' };

// Asks another team to change something the CRM can only read, and keeps track of it until it's done.
export function RequestButton({ area = 'other', type, record, label = 'Ask for a change', message = '', kind, sm, icon = 'Send', disabled }) {
  const { db, can, createRequest, toast } = useStore();
  const [open, setOpen] = useState(false);
  const types = REQUEST_TYPES.filter((t) => t.area === area || t.k === 'other');
  const [v, setV] = useState(null);
  if (!can('requests', 'create')) return null;
  const start = () => { setV({ type: type || types[0].k, details: message, priority: 'Normal', neededBy: '', assigneeId: teamFor(db, area)[0] || '' }); setOpen(true); };
  const send = () => {
    if (!v.details.trim()) { toast('Say what you need.', 'bad'); return; }
    createRequest({ type: v.type, area, details: v.details.trim(), priority: v.priority, neededBy: v.neededBy, assigneeId: v.assigneeId, ...(record ? { entity: record.entity, recordId: record.id, recordLabel: record.label, route: record.route, companyId: record.companyId || '' } : {}) });
    toast(`Sent to ${db.users.find((u) => u.id === v.assigneeId)?.name || 'the team'}. You can follow it in Requests.`);
    setOpen(false);
  };
  return (
    <>
      <Btn kind={kind} sm={sm} icon={icon} disabled={disabled} onClick={start}>{label}</Btn>
      {open && <Modal title={label} onClose={() => setOpen(false)} footer={<><Btn onClick={() => setOpen(false)}>Cancel</Btn><Btn kind="primary" icon="Send" onClick={send}>Send request</Btn></>}>
        <div className="stack-s">
          {record && <div className="sub">About <strong>{record.label}</strong></div>}
          <FormFields values={v} onChange={(k, x) => setV({ ...v, [k]: x })} fields={[
            { k: 'type', label: 'What do you need?', type: 'select', noBlank: true, full: true, options: types.map((t) => ({ value: t.k, label: t.label })) },
            { k: 'details', label: 'Details', type: 'textarea', rows: 5, req: true, full: true },
            { k: 'priority', label: 'How urgent?', type: 'select', noBlank: true, options: Object.keys(PRIORITY_HOURS).map((p) => ({ value: p, label: `${p}, answer within ${PRIORITY_HOURS[p] < 24 ? `${PRIORITY_HOURS[p]} hours` : `${PRIORITY_HOURS[p] / 24} days`}` })) },
            { k: 'neededBy', label: 'Needed by', type: 'date', hint: 'Optional' },
            { k: 'assigneeId', label: 'Send to', type: 'select', noBlank: true, full: true, options: db.users.filter((u) => u.active).map((u) => ({ value: u.id, label: `${u.name}${teamFor(db, area).includes(u.id) ? ` (${AREAS[area]} team)` : ''}` })) },
          ]} />
        </div>
      </Modal>}
    </>
  );
}

// Tells you when a record you care about changes, for example when an invoice is paid.
export function WatchButton({ entity, id }) {
  const { prefs, savePrefs, toast } = useStore();
  const key = `${entity}:${id}`;
  const on = (prefs.watch || []).includes(key);
  return <Btn sm kind={on ? 'primary' : ''} icon={on ? 'BellRing' : 'Bell'} aria-pressed={on} title={on ? 'Stop watching' : 'Tell me when this changes'} onClick={() => { savePrefs({ watch: on ? (prefs.watch || []).filter((x) => x !== key) : [...(prefs.watch || []), key] }); toast(on ? 'You will no longer be told about changes' : 'You will be told when this changes'); }}>{on ? 'Watching' : 'Watch'}</Btn>;
}

// Shows where this data comes from and how fresh it is, with a way to check for updates.
export function OpsSource({ entities, what }) {
  const { db, opsReadOnly, runSync, can, toast } = useStore();
  if (!opsReadOnly) return null;
  const s = sourceFor(db, entities);
  return (
    <div className="ops-source">
      <span className="kpi-ico" style={{ width: 28, height: 28 }}><Icon name={s.app?.icon || 'Database'} size={15} /></span>
      <span className="grow small">
        {s.conn ? <>{what} come from <strong>{s.conn.provider || s.app.name}</strong>{s.conn.lastSync ? <>, last updated {relTime(s.conn.lastSync)}</> : ', not updated yet'}. Read-only here: ask the team for changes.</>
          : <>{what} are kept in another system{s.app ? ` (${s.app.name})` : ''}, which isn't connected yet, so these are the last copies saved here. Read-only.</>}
      </span>
      {s.conn && <Btn sm icon="RefreshCw" onClick={() => { runSync(s.app.k); toast(`Checking ${s.conn.provider || s.app.name} for updates (simulated)`); }}>Check for updates</Btn>}
      {!s.conn && can('connections') && <Link className="btn sm" to="/connections">Connect</Link>}
    </div>
  );
}

// "Can we deliver?" for a salesperson, before promising a date.
export function DeliveryCheck({ onClose, productId = '' }) {
  const { db } = useStore();
  const [v, setV] = useState({ productId: productId || db.products.find((p) => p.tracked)?.id || '', qty: 10, warehouseId: '' });
  const r = v.productId ? deliveryCheck(db, v.productId, v.qty, v.warehouseId) : null;
  return (
    <Modal title="Can we deliver?" onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
      <div className="stack">
        <FormFields values={v} onChange={(k, x) => setV({ ...v, [k]: x })} fields={[
          { k: 'productId', label: 'Product', type: 'select', noBlank: true, full: true, options: [...db.products].filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` })) },
          { k: 'qty', label: 'How many?', type: 'number', min: 1 },
          { k: 'warehouseId', label: 'From', type: 'select', blankLabel: 'Any warehouse', options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) },
        ]} />
        {r && (r.untracked ? <div className="notice">{r.text}</div> : <>
          <div className={`ops-answer ${r.ok ? 'good' : r.date ? 'warn' : 'bad'}`} role="status">
            <strong>{r.ok ? `Yes, ${num(r.want)} can go now.` : r.date ? (r.date < new Date().toISOString().slice(0, 10) ? `Not all now. All ${num(r.want)} once ${r.via} arrives. It was due ${fmtDate(r.date)} and is late.` : `Not all now. All ${num(r.want)} by ${fmtDate(r.date)}.`) : `Not enough. ${num(r.short)} short, even with what is on order.`}</strong>
            {!r.ok && r.date && <div className="small">{num(r.free)} can go now, the rest when {r.via} arrives.</div>}
          </div>
          <dl className="dl"><dt>In stock</dt><dd>{num(r.onHand)}</dd><dt>Needed by open orders</dt><dd>{num(r.reserved)}</dd><dt>Free to sell</dt><dd><strong>{num(r.free)}</strong></dd><dt>On order</dt><dd>{r.incoming.length ? r.incoming.map((x) => `${num(x.qty)} on ${x.number}, due ${fmtDate(x.date)}${x.date < new Date().toISOString().slice(0, 10) ? ' (late)' : ''}`).join('; ') : 'Nothing on order'}</dd></dl>
          <div className="small muted">Counts open orders that are pending or being processed. Figures are the last copy from the stock system.</div>
        </>)}
      </div>
    </Modal>
  );
}

function RequestDrawer({ req, onClose }) {
  const { db, me, can, userName, companyName, updateRequest, commentRequest, toast } = useStore();
  const [text, setText] = useState('');
  const [resolution, setResolution] = useState(req.resolution || '');
  const handler = can('requests', 'edit') || req.assigneeId === me.id;
  const mine = req.requestedBy === me.id;
  const set = (status) => {
    if (['Done', 'Declined'].includes(status) && !resolution.trim()) { toast('Say what was done, so they know.', 'bad'); return; }
    updateRequest(req.id, { status, resolution: resolution.trim(), ...(['Done', 'Declined'].includes(status) ? { doneAt: new Date().toISOString() } : {}) });
    toast(`Marked ${status.toLowerCase()}`);
  };
  return (
    <Drawer title={typeLabel(req.type)} onClose={onClose}>
      <div className="stack">
        <div className="row wrap"><Badge tone={STATUS_TONE[req.status]}>{req.status}</Badge><Badge tone={PRI_TONE[req.priority]} dot={false}>{req.priority}</Badge>{isLate(req) && <Badge tone="bad">Late</Badge>}</div>
        <dl className="dl">
          <dt>Asked by</dt><dd>{userName(req.requestedBy)} · {fmtDT(req.createdAt)}</dd>
          <dt>With</dt><dd>{userName(req.assigneeId)} ({AREAS[req.area] || 'Other'})</dd>
          <dt>Due</dt><dd>{fmtDT(dueOf(req))}</dd>
          {req.recordLabel && <><dt>About</dt><dd>{req.route ? <Link to={req.route}>{req.recordLabel}</Link> : req.recordLabel}</dd></>}
          {req.companyId && <><dt>Customer</dt><dd>{companyName(req.companyId)}</dd></>}
        </dl>
        <div className="em-msg" style={{ whiteSpace: 'pre-wrap' }}>{req.details}</div>
        {(req.comments || []).map((c, i) => <div key={i} className={`em-msg ${c.by === req.requestedBy ? '' : 'in'}`}><div className="small muted">{userName(c.by)} · {fmtDT(c.at)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div></div>)}
        {req.resolution && !OPEN.includes(req.status) && <div className="notice"><strong>{req.status}:</strong> {req.resolution}</div>}
        {(handler || mine) && OPEN.includes(req.status) && <div className="stack-s">
          <textarea className="textarea" rows={2} aria-label="Add a comment" placeholder={mine ? 'Add more detail or answer a question…' : 'Ask a question or give an update…'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row wrap"><Btn icon="MessageSquare" disabled={!text.trim()} onClick={() => { commentRequest(req.id, text.trim(), handler && !mine ? 'Waiting for you' : mine && req.status === 'Waiting for you' ? 'In progress' : null); setText(''); toast('Comment added'); }}>{handler && !mine ? 'Ask them' : 'Reply'}</Btn></div>
        </div>}
        {handler && OPEN.includes(req.status) && <div className="stack-s">
          <div className="label">Update</div>
          <textarea className="textarea" rows={2} aria-label="What was done" placeholder="What was done (needed to finish)" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <div className="row wrap">
            {req.status !== 'In progress' && <Btn icon="Play" onClick={() => set('In progress')}>Start</Btn>}
            <Btn kind="primary" icon="Check" onClick={() => set('Done')}>Done</Btn>
            <Btn kind="ghost" icon="X" onClick={() => set('Declined')}>Decline</Btn>
            <select className="select tb-filter" aria-label="Pass to someone else" value="" onChange={(e) => { if (e.target.value) { updateRequest(req.id, { assigneeId: e.target.value }); toast(`Passed to ${userName(e.target.value)}`); } }}><option value="">Pass to…</option>{db.users.filter((u) => u.active && u.id !== req.assigneeId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
        </div>}
        {mine && OPEN.includes(req.status) && !handler && <div><Btn kind="ghost" icon="X" onClick={() => { updateRequest(req.id, { status: 'Declined', resolution: 'Withdrawn by the person who asked.', doneAt: new Date().toISOString() }); toast('Request withdrawn'); }}>Withdraw</Btn></div>}
        <p className="small muted">The other team works in their own system. This keeps track of what you asked and what they said.</p>
      </div>
    </Drawer>
  );
}

export function Requests() {
  const { db, me, t, can, userName } = useStore();
  const all = can('requests', 'edit');
  const [show, setShow] = useState(all ? 'toMe' : 'mine');
  const [open, setOpen] = useState(null);
  const [checking, setChecking] = useState(false);
  if (!can('requests')) return <NoSections />;
  const visible = (db.opsRequests || []).filter((r) => all || r.requestedBy === me.id || r.assigneeId === me.id);
  const lists = {
    toMe: visible.filter((r) => (r.assigneeId === me.id && ['Open', 'In progress'].includes(r.status)) || (r.requestedBy === me.id && r.status === 'Waiting for you')),
    mine: visible.filter((r) => r.requestedBy === me.id),
    open: visible.filter((r) => OPEN.includes(r.status)),
    late: visible.filter((r) => isLate(r)),
    done: visible.filter((r) => !OPEN.includes(r.status)),
  };
  const rows = lists[show];
  const done30 = visible.filter((r) => r.doneAt && r.doneAt >= new Date(Date.now() - 30 * 864e5).toISOString());
  const avgH = done30.length ? done30.reduce((a, r) => a + (new Date(r.doneAt) - new Date(r.createdAt)) / 36e5, 0) / done30.length : 0;
  const cur = open && visible.find((r) => r.id === open);
  return (
    <div>
      <PageHead title={t('requests')} sub="What you asked the billing, order, stock and buying teams to do, and what they said.">
        <Btn icon="PackageSearch" onClick={() => setChecking(true)}>Can we deliver?</Btn>
        <RequestButton kind="primary" icon="Plus" label="New request" area="other" />
      </PageHead>
      <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Open" value={num(lists.open.length)} note={`${lists.toMe.length} for you to do`} icon="Inbox" />
        <Kpi label="Late" value={num(lists.late.length)} note="Past the time asked for" icon="AlarmClock" />
        <Kpi label="Finished, 30 days" value={num(done30.length)} note={`${done30.filter((r) => r.status === 'Declined').length} declined`} icon="CheckCircle2" />
        <Kpi label="Average time" value={done30.length ? (avgH < 24 ? `${Math.round(avgH)} h` : `${Math.round(avgH / 24 * 10) / 10} days`) : '—'} note="From asking to finished" icon="Timer" />
      </div>
      <div style={{ marginBottom: 10 }}><Pills value={show} onChange={setShow} options={[['toMe', 'For me to do'], ['mine', 'I asked'], ['open', 'All open'], ['late', 'Late'], ['done', 'Finished']].map(([k, label]) => ({ k, label, count: lists[k].length }))} /></div>
      {!rows.length ? <div className="card"><Empty icon="Send" text={show === 'toMe' ? 'Nothing waiting for you.' : 'No requests here.'} /></div> : (
        <DataTable rows={rows} exportName="requests" initialSort={{ k: 'createdAt', dir: 'desc' }} onRow={(r) => setOpen(r.id)} columns={[
          { k: 'type', label: 'Request', value: (r) => typeLabel(r.type), render: (r) => <div><div className="strong">{typeLabel(r.type)}</div><div className="small muted trunc" style={{ maxWidth: 320 }}>{r.recordLabel ? `${r.recordLabel} · ` : ''}{r.details}</div></div> },
          { k: 'area', label: 'Team', value: (r) => AREAS[r.area] || 'Other' },
          { k: 'requestedBy', label: 'Asked by', value: (r) => userName(r.requestedBy), render: (r) => <UserChip id={r.requestedBy} /> },
          { k: 'assigneeId', label: 'With', value: (r) => userName(r.assigneeId), render: (r) => <UserChip id={r.assigneeId} /> },
          { k: 'priority', label: 'Urgency', render: (r) => <Badge tone={PRI_TONE[r.priority]} dot={false}>{r.priority}</Badge> },
          { k: 'status', label: 'Status', render: (r) => <span className="row" style={{ gap: 4 }}><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>{isLate(r) && <Badge tone="bad" dot={false}>Late</Badge>}</span> },
          { k: 'createdAt', label: 'Asked', nowrap: true, render: (r) => relTime(r.createdAt) },
        ]} />
      )}
      {cur && <RequestDrawer req={cur} onClose={() => setOpen(null)} />}
      {checking && <DeliveryCheck onClose={() => setChecking(false)} />}
    </div>
  );
}
