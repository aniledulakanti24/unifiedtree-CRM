import React, { useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, DataTable, Empty, FormFields, Kpi, Modal, PageHead, Progress, RecordModal } from '../ui';
import { Bars } from '../charts';
import { fmtDate, lastMonths, monthKey, monthLabel, num, today } from '../util';

const NEXT = { 'Picked up': 'In Transit', 'In Transit': 'Delivered', Delayed: 'In Transit' };

function RouteMap({ ship }) {
  const progress = { 'Picked up': 0.12, 'In Transit': 0.58, Delayed: 0.45, Delivered: 1 }[ship.status] ?? 0;
  const path = 'M40 150 C 120 40, 210 180, 300 90 S 440 40, 480 60';
  return (
    <svg className="route-map" viewBox="0 0 520 190" role="img" aria-label={`Route from ${ship.origin} to ${ship.destination}, status ${ship.status}`}>
      <g stroke="var(--line)" strokeWidth="1">{Array.from({ length: 12 }, (_, i) => <line key={i} x1={i * 48} y1="0" x2={i * 48 - 40} y2="190" />)}{Array.from({ length: 5 }, (_, i) => <line key={i} x1="0" y1={i * 44 + 10} x2="520" y2={i * 44 - 12} />)}</g>
      <path d={path} fill="none" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
      <path d={path} fill="none" stroke={ship.status === 'Delayed' ? 'var(--bad)' : 'var(--brand)'} strokeWidth="4" strokeLinecap="round" pathLength="1" strokeDasharray={`${progress} 1`} />
      <circle cx="40" cy="150" r="7" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />
      <circle cx="480" cy="60" r="7" fill={ship.status === 'Delivered' ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth="2" />
      <text x="30" y="178" fontSize="13" fontWeight="600" fill="var(--ink)">{ship.origin}</text>
      <text x="490" y="36" textAnchor="end" fontSize="13" fontWeight="600" fill="var(--ink)">{ship.destination}</text>
    </svg>
  );
}

export default function Logistics() {
  const { db, t, scope, sec, can, update, toast, companyName, labelOf } = useStore();
  const rows = useMemo(() => scope(db.shipments), [db.shipments]);
  const active = rows.filter((s) => s.status !== 'Delivered');
  const [selId, setSelId] = useState(null);
  const [edit, setEdit] = useState(null);
  const sel = rows.find((s) => s.id === selId) || active[0] || rows[0];
  const veh = db.vehicles.find((v) => v.id === sel?.vehicleId);
  const months = lastMonths(10);
  const chart = months.map((m) => {
    const list = rows.filter((s) => monthKey(s.shipDate) === m);
    return { label: monthLabel(m), Shipped: list.length, Delivered: list.filter((s) => s.status === 'Delivered').length };
  });
  const advance = (s) => {
    const next = NEXT[s.status];
    if (!next) return;
    update('shipments', s.id, { status: next, log: [...s.log, { label: next, at: today() }] });
    if (next === 'Delivered') update('orders', s.orderId, { status: 'Completed' });
    toast(`Shipment ${next.toLowerCase()}`);
  };
  const onRoad = db.vehicles.filter((v) => v.status === 'On route').length;
  const onTime = rows.filter((s) => s.status === 'Delivered').length;
  return (
    <div>
      <PageHead title={t('logistics')} sub="Shipments, tracking and fleet" />
      {sec('logistics', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Total shipments" value={num(rows.length)} icon="Boxes" />
        <Kpi label="In transit" value={num(rows.filter((s) => s.status === 'In Transit').length)} icon="Truck" />
        <Kpi label="Delayed" value={num(rows.filter((s) => s.status === 'Delayed').length)} note="Needs follow-up" icon="TriangleAlert" />
        <Kpi label="Delivered" value={num(onTime)} note={`${rows.length ? Math.round((onTime / rows.length) * 100) : 0}% of all shipments`} icon="PackageCheck" />
      </div>}
      <div className="g-21" style={{ marginBottom: 14, alignItems: 'start' }}>
        <div className="stack">
          {sec('logistics', 'stats') && <Card title="Delivery statistics" sub="Shipments per month"><Bars format={num} height={270} data={chart} series={[{ key: 'Shipped', name: 'Shipped' }, { key: 'Delivered', name: 'Delivered', color: 'var(--s3)' }]} /></Card>}
          {sec('logistics', 'vehicles') && <Card title="Delivery vehicles" sub={`${onRoad} of ${db.vehicles.length} on the road`} pad={false}>
            <div className="tb-wrap" style={{ marginTop: 12 }}>
              <table className="table"><thead><tr><th>Plate</th><th>Type</th><th>Driver</th><th>Status</th><th style={{ width: 130 }}>Load</th>{can('logistics', 'edit') && <th />}</tr></thead>
                <tbody>{db.vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="strong nowrap">{v.plate}</td><td>{v.type}</td><td>{v.driver}</td><td><Badge>{v.status}</Badge></td>
                    <td><div className="row"><div className="grow"><Progress value={v.load} /></div><span className="small num">{v.load}%</span></div></td>
                    {can('logistics', 'edit') && <td><Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${v.plate}`} onClick={() => setEdit(v)} /></td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>}
        </div>
        {sec('logistics', 'tracking') && <Card title="Tracking delivery" sub={sel ? `${sel.tracking} · ${companyName(sel.companyId)}` : ''}>
          {!sel ? <Empty icon="Truck" text="No shipments yet." /> : (
            <div className="stack">
              <RouteMap ship={sel} />
              <div className="row between"><Badge>{sel.status}</Badge><span className="small muted">ETA {fmtDate(sel.eta)}</span></div>
              <div className="tl">
                {['Picked up', 'In Transit', sel.status === 'Delayed' ? 'Delayed' : null, 'Delivered'].filter(Boolean).map((s) => {
                  const e = sel.log.find((x) => x.label === s);
                  return <div key={s} className={`tl-item ${e ? 'on' : ''}`}><div className="strong">{s}</div><div className="small muted">{e ? fmtDate(e.at) : 'Pending'}</div></div>;
                })}
              </div>
              {veh && <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}><Avatar name={veh.driver} size={32} /><div className="grow"><div className="strong">{veh.driver}</div><div className="small muted">Driver · {veh.plate}</div></div></div>}
              {NEXT[sel.status] && can('logistics', 'edit') && <Btn kind="primary" icon="ArrowRight" onClick={() => advance(sel)}>Mark {NEXT[sel.status].toLowerCase()}</Btn>}
              {sel.status === 'In Transit' && can('logistics', 'edit') && <Btn onClick={() => { update('shipments', sel.id, { status: 'Delayed', log: [...sel.log, { label: 'Delayed', at: today() }] }); toast('Shipment flagged as delayed'); }}>Flag as delayed</Btn>}
            </div>
          )}
        </Card>}
      </div>
      {sec('logistics', 'shipments') && <DataTable rows={rows} exportName="shipments" onRow={(s) => { setSelId(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} isSelected={(s) => s.id === sel?.id} initialSort={{ k: 'shipDate', dir: 'desc' }}
        statusTabs={{ options: ['Picked up', 'In Transit', 'Delayed', 'Delivered'], get: (s) => s.status }}
        filters={[{ k: 'carrier', label: 'Carrier', get: (s) => s.carrier, options: [`${db.settings.companyName} Fleet`, 'NorthStar Freight', 'BlueLine Express'] }]}
        columns={[
          { k: 'tracking', label: 'Tracking', render: (s) => <span className="strong nowrap">{s.tracking}</span> },
          { k: 'orderNumber', label: 'Order' },
          { k: 'customer', label: 'Customer', value: (s) => companyName(s.companyId) },
          { k: 'route', label: 'Route', value: (s) => `${s.origin} to ${s.destination}`, render: (s) => <span className="nowrap">{s.origin} → {s.destination}</span> },
          { k: 'carrier', label: 'Carrier' },
          { k: 'status', label: 'Status', render: (s) => <Badge>{s.status}</Badge> },
          { k: 'shipDate', label: 'Shipped', nowrap: true, render: (s) => fmtDate(s.shipDate) },
          { k: 'eta', label: 'ETA', nowrap: true, render: (s) => fmtDate(s.eta) },
        ]} />}
      {edit && <RecordModal size="sm" title={`Edit ${edit.plate}`} initial={edit} onClose={() => setEdit(null)} onSave={(v) => { const { id, ...rest } = v; update('vehicles', edit.id, rest); toast('Vehicle saved'); }} fields={[
        { k: 'driver', label: 'Driver', req: true, full: true },
        { k: 'status', label: 'Status', type: 'select', noBlank: true, list: 'vehicleStatus' },
        { k: 'load', label: 'Load %', type: 'number', min: 0 },
      ]} />}
    </div>
  );
}
