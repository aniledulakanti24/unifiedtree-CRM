import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, DataTable, Empty, Kpi, Pills, Progress } from '../ui';
import { Bars } from '../charts';
import { NotifyButton } from '../shared';
import { STATE_TONE, capacityOf, deliveredOn, deliveryState, groupStats, needsAttention, promisedOf, trackUrl } from '../logistics';
import { fmtDate, fmtDT, money, moneyK, num, today } from '../util';

export function ShipmentDetails({ s }) {
  const { db, can, companyName, sendEmail, toast } = useStore();
  const c = db.companies.find((x) => x.id === s.companyId);
  const person = db.contacts.find((x) => x.companyId === s.companyId && x.email);
  const email = person?.email || c?.email;
  const state = deliveryState(s);
  const tell = () => {
    sendEmail({ to: email, subject: `Update on your delivery ${s.tracking}`, body: `Your delivery is ${s.status.toLowerCase()}. Expected on ${fmtDate(s.eta)}. Track it here: ${trackUrl(s.tracking)}`, ownerId: s.ownerId, relatedType: 'company', relatedId: s.companyId });
    toast(`Saved as sent to ${email}. No real email was sent.`);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(trackUrl(s.tracking)); toast('Tracking link copied'); } catch { toast(trackUrl(s.tracking)); }
  };
  return (
    <div className="stack-s" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div className="row between"><span className="label">Promised for {fmtDate(promisedOf(s))}</span><Badge tone={STATE_TONE[state]}>{state}</Badge></div>
      <dl className="dl">
        <dt>Customer</dt><dd>{companyName(s.companyId)}</dd>
        <dt>Carrier</dt><dd>{s.carrier}</dd>
        {s.weightKg && <><dt>Weight</dt><dd className="num">{num(s.weightKg)} kg</dd></>}
        {s.cost != null && <><dt>Freight cost</dt><dd className="num">{money(s.cost)}</dd></>}
        {s.delayReason && <><dt>Delay reason</dt><dd>{s.delayReason}</dd></>}
        {!!s.items?.length && <><dt>Items</dt><dd>{s.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}</dd></>}
        {s.pod && <><dt>Proof of delivery</dt><dd>Signed by {s.pod.signedBy} on {fmtDate(s.pod.at)}{s.pod.note ? `. ${s.pod.note}` : ''}</dd></>}
      </dl>
      <div className="row wrap">
        <Btn sm icon="Link" onClick={copy}>Copy tracking link</Btn>
        <a className="btn sm" href={`#/track/${s.tracking}`} target="_blank" rel="noreferrer">Open tracking page</a>
        {can('emails', 'create') && email && s.status !== 'Delivered' && <Btn sm icon="Send" onClick={tell}>Update the customer</Btn>}
      </div>
    </div>
  );
}

export function Exceptions({ rows, onOpen }) {
  const { db, can, companyName, userName, sendEmail, toast } = useStore();
  const list = rows.filter(needsAttention);
  const count = (x) => list.filter((s) => deliveryState(s) === x).length;
  return (
    <div className="stack">
      <div className="g3">
        <Kpi label="Delayed" value={count('Delayed')} note="Reported by the carrier" icon="TriangleAlert" />
        <Kpi label="Overdue" value={count('Overdue')} note="Past the promised date" icon="AlarmClock" />
        <Kpi label="At risk" value={count('At risk')} note="Due soon, barely started" icon="Clock" />
      </div>
      {!list.length ? <Empty icon="PackageCheck" text="All deliveries are on track." /> : <DataTable key="ex" rows={list} exportName="delivery-exceptions" onRow={(s) => onOpen(s.id)} searchPlaceholder="Search deliveries…" initialSort={{ k: 'promised', dir: 'asc' }}
        columns={[
          { k: 'tracking', label: 'Tracking', render: (s) => <span className="strong nowrap">{s.tracking}</span> },
          { k: 'customer', label: 'Customer', value: (s) => companyName(s.companyId) },
          { k: 'state', label: 'Problem', value: (s) => deliveryState(s), render: (s) => <Badge tone={STATE_TONE[deliveryState(s)]}>{deliveryState(s)}</Badge> },
          { k: 'delayReason', label: 'Reason' },
          { k: 'promised', label: 'Promised', nowrap: true, value: (s) => promisedOf(s), render: (s) => fmtDate(promisedOf(s)) },
          { k: 'owner', label: 'Salesperson', value: (s) => userName(s.ownerId) },
          { k: 'act', label: '', sort: false, stop: true, value: () => '', render: (s) => { const email = db.contacts.find((x) => x.companyId === s.companyId && x.email)?.email; return <div className="row" style={{ justifyContent: 'flex-end' }}>
            {can('emails', 'create') && email && <Btn sm onClick={() => { sendEmail({ to: email, subject: `Update on your delivery ${s.tracking}`, body: `We're sorry, your delivery is running late. Track it here: ${trackUrl(s.tracking)}`, ownerId: s.ownerId, relatedType: 'company', relatedId: s.companyId }); toast(`Saved as sent to ${email}. No real email was sent.`); }}>Tell customer</Btn>}
            <NotifyButton sm label="Notify team" link="/logistics" message={`Delivery ${s.tracking} for ${companyName(s.companyId)} is ${deliveryState(s).toLowerCase()}. `} />
          </div>; } },
        ]} />}
    </div>
  );
}

export function Performance({ rows }) {
  const [span, setSpan] = useState('90 days');
  const since = span === 'All time' ? '' : new Date(Date.now() - (span === '30 days' ? 30 : 90) * 864e5).toISOString().slice(0, 10);
  const list = useMemo(() => rows.filter((s) => (s.shipDate || '') >= since), [rows, since]);
  const [all] = groupStats(list.map((s) => ({ ...s, _: 1 })), () => 'All');
  const carriers = groupStats(list, (s) => s.carrier);
  const places = groupStats(list, (s) => s.destination).sort((a, b) => b.count - a.count).slice(0, 8);
  const statColumns = (label) => [
    { k: 'name', label, render: (r) => <span className="strong">{r.name}</span> },
    { k: 'count', label: 'Shipments', align: 'r' },
    { k: 'onTimeRate', label: 'On time', align: 'r', value: (r) => r.onTimeRate ?? -1, render: (r) => (r.onTimeRate == null ? '—' : `${r.onTimeRate}%`) },
    { k: 'avgDays', label: 'Average days', align: 'r', value: (r) => r.avgDays ?? -1, render: (r) => (r.avgDays == null ? '—' : r.avgDays.toFixed(1)) },
    { k: 'costEach', label: 'Cost each', align: 'r', render: (r) => money(Math.round(r.costEach)) },
    { k: 'cost', label: 'Total cost', align: 'r', render: (r) => moneyK(r.cost) },
  ];
  return (
    <div className="stack">
      <div><Pills value={span} onChange={setSpan} options={['30 days', '90 days', 'All time']} /></div>
      <div className="g4">
        <Kpi label="On time" value={all?.onTimeRate == null ? '—' : `${all.onTimeRate}%`} note={`${all?.delivered || 0} delivered`} icon="Target" />
        <Kpi label="Average delivery" value={all?.avgDays == null ? '—' : `${all.avgDays.toFixed(1)} days`} icon="Timer" />
        <Kpi label="Freight cost" value={moneyK(all?.cost || 0)} note={`${money(Math.round(all?.costEach || 0))} each`} icon="Receipt" />
        <Kpi label="On the road" value={all?.open || 0} note="Not delivered yet" icon="Truck" />
      </div>
      <Card title="On-time delivery by carrier"><Bars height={220} horizontal format={(n) => `${n}%`} data={carriers.filter((c) => c.onTimeRate != null).map((c) => ({ label: c.name, Rate: c.onTimeRate }))} series={[{ key: 'Rate', name: 'On time' }]} /></Card>
      <DataTable key={`c-${span}`} rows={carriers} exportName="carrier-performance" noSearch initialSort={{ k: 'count', dir: 'desc' }} columns={statColumns('Carrier')} />
      <DataTable key={`p-${span}`} rows={places} exportName="destination-performance" noSearch initialSort={{ k: 'count', dir: 'desc' }} columns={statColumns('Destination')} />
    </div>
  );
}

// Choose a vehicle and a day, then which deliveries go on it and in what order.
export function RoutePlanner({ rows }) {
  const { db, can, update, toast, companyName } = useStore();
  const editable = can('logistics', 'edit');
  const [vehicleId, setVehicleId] = useState(db.vehicles[0]?.id || '');
  const [date, setDate] = useState(today());
  const v = db.vehicles.find((x) => x.id === vehicleId);
  const open = rows.filter((s) => s.status !== 'Delivered');
  const onThis = open.filter((s) => s.vehicleId === vehicleId).sort((a, b) => (a.stopNo || 99) - (b.stopNo || 99)).map((s) => s.id);
  const [stops, setStops] = useState(onThis);
  const pickVehicle = (id) => {
    setVehicleId(id);
    setStops(open.filter((s) => s.vehicleId === id).sort((a, b) => (a.stopNo || 99) - (b.stopNo || 99)).map((s) => s.id));
  };
  const planned = stops.map((id) => open.find((s) => s.id === id)).filter(Boolean);
  const weight = planned.reduce((a, s) => a + (s.weightKg || 0), 0);
  const cap = capacityOf(v);
  const others = open.filter((s) => !stops.includes(s.id));
  const move = (i, by) => { const next = [...stops]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); setStops(next); };
  const groupCities = () => {
    const seen = [];
    planned.forEach((s) => { if (!seen.includes(s.destination)) seen.push(s.destination); });
    setStops([...planned].sort((a, b) => seen.indexOf(a.destination) - seen.indexOf(b.destination)).map((s) => s.id));
    toast('Stops in the same city are now together');
  };
  const save = () => {
    planned.forEach((s, i) => update('shipments', s.id, { vehicleId, stopNo: i + 1, routeDate: date }));
    update('vehicles', vehicleId, { load: Math.min(100, Math.round((weight / cap) * 100)) });
    toast(`Route saved with ${planned.length} stops`);
  };
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Route" sub={editable ? 'Add deliveries, then put them in order.' : 'Routes are planned outside this CRM. You can see each vehicle\'s stops here.'}>
        <div className="stack">
          <div className="form-grid">
            <div className="field"><label className="label" htmlFor="route-v">Vehicle</label><select id="route-v" className="select" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>{db.vehicles.map((x) => <option key={x.id} value={x.id}>{x.plate} · {x.driver}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="route-d">Day</label><input id="route-d" className="input" type="date" disabled={!editable} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <div className="row between small"><span className="muted">Load</span><span className={`num ${weight > cap ? 'strong' : ''}`} style={weight > cap ? { color: 'var(--bad)' } : undefined}>{num(weight)} of {num(cap)} kg</span></div>
            <Progress value={(weight / cap) * 100} color={weight > cap ? 'var(--bad)' : undefined} />
            {weight > cap && <div className="error-text">This is too much for this vehicle.</div>}
          </div>
          {!planned.length && <div className="sub">No deliveries on this vehicle.</div>}
          {planned.map((s, i) => (
            <div key={s.id} className="dashlet">
              <span className="strong num" style={{ width: 22 }}>{i + 1}</span>
              <span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{s.destination} · {companyName(s.companyId)}</div><div className="small muted">{s.tracking} · {num(s.weightKg || 0)} kg</div></span>
              {editable && <><Btn sm kind="ghost" icon="ArrowUp" aria-label={`Move ${s.tracking} up`} disabled={i === 0} onClick={() => move(i, -1)} /><Btn sm kind="ghost" icon="ArrowDown" aria-label={`Move ${s.tracking} down`} disabled={i === planned.length - 1} onClick={() => move(i, 1)} /><Btn sm kind="ghost" icon="X" aria-label={`Take ${s.tracking} off`} onClick={() => setStops(stops.filter((x) => x !== s.id))} /></>}
            </div>
          ))}
          {editable && <div className="row wrap"><Btn onClick={groupCities} disabled={planned.length < 2}>Group by city</Btn><Btn kind="primary" onClick={save} disabled={weight > cap}>Save route</Btn></div>}
        </div>
      </Card>
      <Card title="Other open deliveries" sub={`${others.length} not on this vehicle`} pad={false}>
        {others.length ? others.map((s) => {
          const on = db.vehicles.find((x) => x.id === s.vehicleId);
          return <div key={s.id} className="dashlet" style={{ padding: '6px 12px' }}><span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{s.destination} · {companyName(s.companyId)}</div><div className="small muted">{s.tracking} · {on ? on.plate : 'No vehicle'}</div></span>{editable && <Btn sm icon="Plus" onClick={() => setStops([...stops, s.id])}>Add</Btn>}</div>;
        }) : <Empty icon="PackageCheck" text="Everything is on this vehicle." />}
      </Card>
    </div>
  );
}

// The public page a customer opens from a tracking link. It shows only this delivery's progress.
export function TrackPage({ tracking }) {
  const { db } = useStore();
  const s = (db.shipments || []).find((x) => x.tracking === tracking);
  const steps = s ? ['Picked up', 'In Transit', s.status === 'Delayed' ? 'Delayed' : null, 'Delivered'].filter(Boolean) : [];
  return (
    <div className="public-form">
      <div className="card card-b" style={{ maxWidth: 520, margin: '32px auto' }}>
        <div className="small muted">{db.settings.companyName} delivery tracking</div>
        {!s ? <Empty icon="SearchX" text="We can't find that tracking number." /> : <div className="stack" style={{ marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 680 }}>{s.tracking}</h1>
          <div className="row between"><Badge>{s.status}</Badge><span className="small muted">{s.status === 'Delivered' ? `Delivered ${fmtDate(deliveredOn(s))}` : `Expected ${fmtDate(s.eta)}`}</span></div>
          <div className="small">{s.origin} to {s.destination} with {s.carrier}</div>
          <div className="tl">{steps.map((x) => { const e = (s.log || []).find((l) => l.label === x); return <div key={x} className={`tl-item ${e ? 'on' : ''}`}><div className="strong">{x}</div><div className="small muted">{e ? fmtDate(e.at) : 'Pending'}</div></div>; })}</div>
          {s.delayReason && s.status === 'Delayed' && <div className="notice">Reason for the delay: {s.delayReason}</div>}
          {s.pod && <div className="small muted">Signed for by {s.pod.signedBy}.</div>}
          <div className="small muted">Simulated tracking. It only works in the browser that holds this data, until there's a server. Updated {fmtDT(new Date().toISOString())}.</div>
        </div>}
      </div>
    </div>
  );
}
