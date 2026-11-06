import React, { useState } from 'react';
import { useStore } from '../store';
import { Link } from 'react-router-dom';
import { Badge, Btn, Card, DataTable, Empty, FormFields, Kpi, Modal, NoSections, PageHead, Progress, RecordModal, Tabs, firstAllowed, validate } from '../ui';
import { Bars } from '../charts';
import { stockStatus } from './Commerce';
import { NotifyButton, OpsNote } from '../shared';
import { DeliveryCheck, OpsSource, RequestButton, WatchButton } from './OpsExtras';

import { fmtDate, money, moneyK, num, sum, today } from '../util';
import { splitOf, stockAt } from '../stock';

function AdjustDialog({ product, onClose }) {
  const { db, adjustStock, toast } = useStore();
  const [v, setV] = useState({ type: 'Receipt', qty: 10, reason: '', warehouseId: product.warehouseId || db.warehouses[0]?.id });
  const here = stockAt(product, v.warehouseId);
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'type', label: 'Movement', type: 'radio', list: 'stockMovement', full: true },
    { k: 'qty', label: v.type === 'Adjustment' ? 'Change (+ or −)' : 'Quantity', type: 'number', req: true, hint: v.type === 'Adjustment' ? 'Use a negative number to reduce stock' : undefined },
    { k: 'warehouseId', label: 'Warehouse', type: 'select', noBlank: true, options: db.warehouses.map((w) => ({ value: w.id, label: `${w.name} (${stockAt(product, w.id)})` })) },
    { k: 'reason', label: 'Reason', req: true, placeholder: 'e.g. Cycle count' },
  ];
  const delta = v.type === 'Delivery' ? -Math.abs(Number(v.qty) || 0) : v.type === 'Receipt' ? Math.abs(Number(v.qty) || 0) : Number(v.qty) || 0;
  const save = () => {
    const e = validate(fields, v);
    if (!delta) e.qty = 'Enter a quantity other than zero';
    else if (here + delta < 0) e.qty = `Only ${here} in this warehouse`;
    setErrors(e);
    if (Object.keys(e).length) return;
    adjustStock(product.id, delta, v.type, v.reason, v.warehouseId);
    toast('Stock updated');
    onClose();
  };
  return (
    <Modal size="sm" title={`Update stock: ${product.name}`} onClose={onClose} footer={<><span className="grow sub num">New stock: <strong>{Math.max(0, product.stock + delta)}</strong></span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
    </Modal>
  );
}

function TransferDialog({ onClose }) {
  const { db, transferStock, toast } = useStore();
  const tracked = db.products.filter((p) => p.tracked);
  const [v, setV] = useState({ productId: '', from: db.warehouses[0]?.id || '', to: db.warehouses[1]?.id || '', qty: 1, date: today(), note: '' });
  const [errors, setErrors] = useState({});
  const product = tracked.find((p) => p.id === v.productId);
  const held = product ? stockAt(product, v.from) : 0;
  const fields = [
    { k: 'productId', label: 'Product', type: 'select', req: true, full: true, options: tracked.map((p) => ({ value: p.id, label: `${p.name} (${p.stock} in total)` })) },
    { k: 'from', label: 'From', type: 'select', req: true, options: db.warehouses.map((w) => ({ value: w.id, label: product ? `${w.name} (${stockAt(product, w.id)})` : w.name })) },
    { k: 'to', label: 'To', type: 'select', req: true, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) },
    { k: 'qty', label: 'Quantity', type: 'number', min: 1, req: true, hint: product ? `${held} available to move` : undefined },
    { k: 'date', label: 'Date', type: 'date', req: true },
    { k: 'note', label: 'Note', full: true },
  ];
  const save = () => {
    const e = validate(fields, v);
    if (v.from && v.from === v.to) e.to = 'Choose a different warehouse';
    if (product && Number(v.qty) > held) e.qty = `Only ${held} in this warehouse`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const n = transferStock({ ...v, qty: Number(v.qty) });
    toast(`Transfer ${n} done. Stock moved.`);
    onClose();
  };
  return (
    <Modal title="Move stock between warehouses" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="ArrowRightLeft" onClick={save}>Move stock</Btn></>}>
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
    </Modal>
  );
}

function CountDialog({ onClose }) {
  const { db, postStockCount, toast } = useStore();
  const [wh, setWh] = useState(db.warehouses[0]?.id || '');
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState({});
  const [error, setError] = useState('');
  const rows = db.products.filter((p) => p.tracked && (p.warehouseId === wh || stockAt(p, wh) > 0));
  const lines = rows.filter((p) => counted[p.id] !== undefined && counted[p.id] !== '').map((p) => ({ productId: p.id, name: p.name, system: stockAt(p, wh), counted: Math.max(0, Number(counted[p.id]) || 0) }));
  const off = lines.filter((l) => l.counted !== l.system);
  const save = () => {
    if (!lines.length) { setError('Enter what you counted for at least one product.'); return; }
    const n = postStockCount(wh, lines, note);
    toast(off.length ? `Count ${n} posted. ${off.length} ${off.length === 1 ? 'product' : 'products'} corrected.` : `Count ${n} posted. Everything matched.`);
    onClose();
  };
  return (
    <Modal size="lg" title="New stock count" onClose={onClose} footer={<><span className="grow small muted">{lines.length} counted, {off.length} different</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Post count</Btn></>}>
      <div className="stack">
        <div className="form-grid">
          <div className="field"><label className="label" htmlFor="sc-wh">Warehouse</label><select id="sc-wh" className="select" value={wh} onChange={(e) => { setWh(e.target.value); setCounted({}); }}>{db.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="sc-note">Note</label><input id="sc-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Month-end count" /></div>
        </div>
        <div className="small muted">Leave a product blank to skip it. Posting corrects the stock and logs the difference.</div>
        {rows.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Product</th><th className="r">System says</th><th className="r">You counted</th><th className="r">Difference</th></tr></thead>
          <tbody>{rows.map((p) => { const sys = stockAt(p, wh); const c = counted[p.id]; const has = c !== undefined && c !== ''; const diff = has ? Number(c) - sys : 0; return <tr key={p.id}>
            <td><div className="strong">{p.name}</div><div className="small muted">{p.sku}</div></td>
            <td className="r num">{sys}</td>
            <td className="r"><input className="input" style={{ width: 84, textAlign: 'right', marginInlineStart: 'auto' }} type="number" min="0" aria-label={`Counted: ${p.name}`} value={c ?? ''} onChange={(e) => { setCounted((x) => ({ ...x, [p.id]: e.target.value })); setError(''); }} /></td>
            <td className="r num strong">{has ? (diff > 0 ? `+${diff}` : diff) : '—'}</td>
          </tr>; })}</tbody></table></div> : <Empty icon="Boxes" text="This warehouse has no tracked products." />}
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

const warehouseFields = [
  { k: 'name', label: 'Warehouse name', req: true, full: true },
  { k: 'code', label: 'Short code' },
  { k: 'city', label: 'City' },
  { k: 'capacity', label: 'Capacity in units', type: 'number', min: 1, req: true },
];

export default function Inventory() {
  const { db, t, can, sec, userName, create, update, toast, opsReadOnly } = useStore();
  const [checking, setChecking] = useState(false);
  const [modal, setModal] = useState(null);
  const [editWh, setEditWh] = useState(null);
  const [pref, setTab] = useState('stock');
  const [adjust, setAdjust] = useState(null);
  const tracked = db.products.filter((p) => p.tracked);
  const whName = (id) => db.warehouses.find((w) => w.id === id)?.name || '—';
  const heldAt = (p) => Object.entries(splitOf(p)).filter(([, q]) => q > 0).map(([w, q]) => `${db.warehouses.find((x) => x.id === w)?.code || whName(w)} ${q}`).join(', ') || 'None';
  const prodName = (id) => db.products.find((p) => p.id === id)?.name || 'Removed product';
  const low = tracked.filter((p) => p.stock > 0 && p.stock <= p.reorder);
  const out = tracked.filter((p) => p.stock <= 0);
  const editable = can('inventory', 'edit');
  const invTabs = [{ k: 'stock', label: 'Stock levels', count: tracked.length }, { k: 'moves', label: 'Movements', count: db.stockMoves.length }, { k: 'transfers', label: 'Transfers', count: (db.stockTransfers || []).length }, { k: 'counts', label: 'Stock counts', count: (db.stockCounts || []).length }, { k: 'wh', label: 'Warehouses', count: db.warehouses.length }].filter((x) => sec('inventory', x.k));
  const tab = firstAllowed(invTabs, pref);
  return (
    <div>
      <PageHead title={t('inventory')} sub={editable || opsReadOnly ? 'Stock levels, movements and warehouses' : 'Check availability before you quote. Changes are made by managers.'}>
        <Btn icon="PackageSearch" onClick={() => setChecking(true)}>Can we deliver?</Btn>
        {tab === 'stock' && can('purchasing', 'view') && (low.length + out.length > 0) && <Link className="btn" to="/purchasing">Reorder {low.length + out.length} {low.length + out.length === 1 ? 'product' : 'products'}</Link>}
        {tab === 'transfers' && editable && <Btn kind="primary" icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Move stock</Btn>}
        {tab === 'counts' && editable && <Btn kind="primary" icon="ClipboardCheck" onClick={() => setModal('count')}>New stock count</Btn>}
        {tab === 'wh' && editable && <Btn kind="primary" icon="Plus" onClick={() => setEditWh({ capacity: 10000 })}>New warehouse</Btn>}
      </PageHead>
      <OpsSource entities={['products']} what="Stock levels" />
      {checking && <DeliveryCheck onClose={() => setChecking(false)} />}
      {sec('inventory', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Tracked products" value={num(tracked.length)} note={`${num(sum(tracked, (p) => p.stock))} units on hand`} icon="Boxes" />
        <Kpi label="Stock value at cost" value={moneyK(sum(tracked, (p) => p.stock * p.cost))} icon="Landmark" />
        <Kpi label="Low stock" value={low.length} note="At or below reorder level" icon="TriangleAlert" />
        <Kpi label="Out of stock" value={out.length} note="Can't fulfil new orders" icon="PackageX" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={invTabs} />
      <OpsNote>Stock is updated outside this CRM. You can view it here, and notify the team if a product needs reordering or a number looks wrong.</OpsNote>
      {!tab && <NoSections />}
      {tab === 'stock' && (
        <DataTable rows={tracked} exportName="inventory" initialSort={{ k: 'stock', dir: 'asc' }}
          statusTabs={{ options: ['In stock', 'Low stock', 'Out of stock'], get: stockStatus }}
          filters={[{ k: 'wh', label: 'Home warehouse', get: (p) => p.warehouseId, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) }]}
          columns={[
            { k: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div><div className="small muted">{p.sku}</div></div> },
            { k: 'category', label: 'Category' },
            { k: 'warehouse', label: 'Held at', value: (p) => heldAt(p) },
            { k: 'status', label: 'Status', value: stockStatus, render: (p) => <Badge>{stockStatus(p)}</Badge> },
            { k: 'level', label: 'Level', sort: false, value: () => '', render: (p) => <div style={{ width: 100 }} title={`Reorder at ${p.reorder}`}><Progress value={(p.stock / Math.max(p.reorder * 3, 1)) * 100} color={p.stock <= p.reorder ? 'var(--bad)' : undefined} /></div> },
            { k: 'stock', label: 'On hand', align: 'r' },
            { k: 'reorder', label: 'Reorder at', align: 'r' },
            { k: 'value', label: 'Value', align: 'r', value: (p) => p.stock * p.cost, render: (p) => money(p.stock * p.cost) },
            ...(editable ? [{ k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (p) => <Btn sm icon="ArrowUpDown" onClick={() => setAdjust(p)}>Update</Btn> }] : opsReadOnly ? [{ k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (p) => <RequestButton sm area="inventory" type="stock" record={{ entity: 'products', id: p.id, label: p.name, route: '/inventory' }} label="Ask" link="/inventory" message={`About ${p.name} (${p.sku}): ${p.stock} in stock, reorder level ${p.reorder}. `} /> }] : []),
          ]} />
      )}
      {tab === 'moves' && (
        <DataTable rows={db.stockMoves} rowKey="id" exportName="stock-movements" dateOf={(m) => m.date} initialSort={{ k: 'date', dir: 'desc' }}
          statusTabs={{ options: ['Receipt', 'Delivery', 'Adjustment', 'Transfer', 'Count', 'Return', 'Sync'], get: (m) => m.type }}
          columns={[
            { k: 'date', label: 'Date', nowrap: true, render: (m) => fmtDate(m.date) },
            { k: 'product', label: 'Product', value: (m) => prodName(m.productId) },
            { k: 'type', label: 'Type', render: (m) => <Badge tone={m.type === 'Receipt' || m.type === 'Return' ? 'good' : m.type === 'Delivery' || m.type === 'Transfer' ? 'info' : 'warn'}>{m.type}</Badge> },
            { k: 'qty', label: 'Quantity', align: 'r', render: (m) => (m.qty > 0 ? `+${m.qty}` : m.qty) },
            { k: 'warehouse', label: 'Warehouse', value: (m) => whName(m.warehouseId) },
            { k: 'reason', label: 'Reason' },
            { k: 'user', label: 'By', value: (m) => userName(m.userId) },
          ]} />
      )}
      {tab === 'transfers' && <DataTable key="tr" rows={db.stockTransfers || []} exportName="stock-transfers" dateOf={(x) => x.date} initialSort={{ k: 'date', dir: 'desc' }} searchPlaceholder="Search transfers…"
        columns={[
          { k: 'number', label: 'Transfer', render: (x) => <span className="strong">{x.number}</span> },
          { k: 'date', label: 'Date', nowrap: true, render: (x) => fmtDate(x.date) },
          { k: 'name', label: 'Product' },
          { k: 'from', label: 'From', value: (x) => whName(x.from) },
          { k: 'to', label: 'To', value: (x) => whName(x.to) },
          { k: 'qty', label: 'Quantity', align: 'r' },
          { k: 'note', label: 'Note' },
          { k: 'user', label: 'By', value: (x) => userName(x.userId) },
        ]} />}
      {tab === 'counts' && <DataTable key="sc" rows={db.stockCounts || []} exportName="stock-counts" dateOf={(x) => x.date} initialSort={{ k: 'date', dir: 'desc' }} searchPlaceholder="Search stock counts…"
        columns={[
          { k: 'number', label: 'Count', render: (x) => <span className="strong">{x.number}</span> },
          { k: 'date', label: 'Date', nowrap: true, render: (x) => fmtDate(x.date) },
          { k: 'warehouse', label: 'Warehouse', value: (x) => whName(x.warehouseId) },
          { k: 'counted', label: 'Products counted', align: 'r' },
          { k: 'changed', label: 'Different', align: 'r' },
          { k: 'units', label: 'Units changed', align: 'r', render: (x) => (x.units > 0 ? `+${x.units}` : x.units) },
          { k: 'value', label: 'Value changed', align: 'r', render: (x) => money(x.value) },
          { k: 'note', label: 'Note' },
          { k: 'user', label: 'By', value: (x) => userName(x.userId) },
        ]} />}
      {tab === 'wh' && (
        <div className="stack">
          <div className="g3">
            {db.warehouses.map((w) => {
              const items = tracked.filter((p) => stockAt(p, w.id) > 0);
              const units = sum(items, (p) => stockAt(p, w.id));
              return (
                <Card key={w.id} title={w.name} sub={[w.code, w.city].filter(Boolean).join(' · ')} action={editable && <Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${w.name}`} onClick={() => setEditWh(w)} />}>
                  <div className="stack-s">
                    <div className="row between"><span className="muted small">Capacity used</span><span className="num strong">{num(units)} / {num(w.capacity)}</span></div>
                    <Progress value={(units / w.capacity) * 100} />
                    <div className="row between"><span className="muted small">Products</span><span className="num">{items.length}</span></div>
                    <div className="row between"><span className="muted small">Stock value</span><span className="num">{moneyK(sum(items, (p) => stockAt(p, w.id) * p.cost))}</span></div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card title="Units by warehouse"><Bars height={220} format={num} horizontal data={db.warehouses.map((w) => ({ label: w.name, Units: sum(tracked, (p) => stockAt(p, w.id)) }))} series={[{ key: 'Units', name: 'Units on hand' }]} /></Card>
        </div>
      )}
      {adjust && <AdjustDialog product={adjust} onClose={() => setAdjust(null)} />}
      {modal === 'transfer' && <TransferDialog onClose={() => setModal(null)} />}
      {modal === 'count' && <CountDialog onClose={() => setModal(null)} />}
      {editWh && <RecordModal size="sm" title={editWh.id ? 'Edit warehouse' : 'New warehouse'} fields={warehouseFields} initial={editWh} onClose={() => setEditWh(null)} onSave={(v) => {
        const rec = { ...v, capacity: Number(v.capacity) || 1, code: v.code || v.name.replace(/\s/g, '').slice(0, 3).toUpperCase() };
        if (editWh.id) update('warehouses', editWh.id, rec); else create('warehouses', rec);
        toast(editWh.id ? 'Warehouse updated' : 'Warehouse added');
        setEditWh(null);
      }} />}
    </div>
  );
}
