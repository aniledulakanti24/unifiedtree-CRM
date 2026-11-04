import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, DataTable, FormFields, Kpi, Modal, NoSections, PageHead, Progress, Tabs, firstAllowed, validate } from '../ui';
import { Bars } from '../charts';
import { stockStatus } from './Commerce';
import { fmtDate, money, moneyK, num, sum } from '../util';

function AdjustDialog({ product, onClose }) {
  const { adjustStock, toast } = useStore();
  const [v, setV] = useState({ type: 'Receipt', qty: 10, reason: '' });
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'type', label: 'Movement', type: 'radio', list: 'stockMovement', full: true },
    { k: 'qty', label: v.type === 'Adjustment' ? 'Change (+ or −)' : 'Quantity', type: 'number', req: true, hint: v.type === 'Adjustment' ? 'Use a negative number to reduce stock' : undefined },
    { k: 'reason', label: 'Reason', req: true, placeholder: 'e.g. Cycle count' },
  ];
  const delta = v.type === 'Delivery' ? -Math.abs(Number(v.qty) || 0) : v.type === 'Receipt' ? Math.abs(Number(v.qty) || 0) : Number(v.qty) || 0;
  const save = () => {
    const e = validate(fields, v);
    if (!delta) e.qty = 'Enter a quantity other than zero';
    else if (product.stock + delta < 0) e.qty = `Only ${product.stock} in stock`;
    setErrors(e);
    if (Object.keys(e).length) return;
    adjustStock(product.id, delta, v.type, v.reason);
    toast('Stock updated');
    onClose();
  };
  return (
    <Modal size="sm" title={`Update stock: ${product.name}`} onClose={onClose} footer={<><span className="grow sub num">New stock: <strong>{Math.max(0, product.stock + delta)}</strong></span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
    </Modal>
  );
}

export default function Inventory() {
  const { db, t, can, sec, userName } = useStore();
  const [pref, setTab] = useState('stock');
  const [adjust, setAdjust] = useState(null);
  const tracked = db.products.filter((p) => p.tracked);
  const whName = (id) => db.warehouses.find((w) => w.id === id)?.name || '—';
  const prodName = (id) => db.products.find((p) => p.id === id)?.name || 'Removed product';
  const low = tracked.filter((p) => p.stock > 0 && p.stock <= p.reorder);
  const out = tracked.filter((p) => p.stock <= 0);
  const editable = can('inventory', 'edit');
  const invTabs = [{ k: 'stock', label: 'Stock levels', count: tracked.length }, { k: 'moves', label: 'Movements', count: db.stockMoves.length }, { k: 'wh', label: 'Warehouses', count: db.warehouses.length }].filter((x) => sec('inventory', x.k));
  const tab = firstAllowed(invTabs, pref);
  return (
    <div>
      <PageHead title={t('inventory')} sub={editable ? 'Stock levels, movements and warehouses' : 'Check availability before you quote. Changes are made by managers.'} />
      {sec('inventory', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Tracked products" value={num(tracked.length)} note={`${num(sum(tracked, (p) => p.stock))} units on hand`} icon="Boxes" />
        <Kpi label="Stock value at cost" value={moneyK(sum(tracked, (p) => p.stock * p.cost))} icon="Landmark" />
        <Kpi label="Low stock" value={low.length} note="At or below reorder level" icon="TriangleAlert" />
        <Kpi label="Out of stock" value={out.length} note="Can't fulfil new orders" icon="PackageX" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={invTabs} />
      {!tab && <NoSections />}
      {tab === 'stock' && (
        <DataTable rows={tracked} exportName="inventory" initialSort={{ k: 'stock', dir: 'asc' }}
          statusTabs={{ options: ['In stock', 'Low stock', 'Out of stock'], get: stockStatus }}
          filters={[{ k: 'wh', label: 'Warehouse', get: (p) => p.warehouseId, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) }]}
          columns={[
            { k: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div><div className="small muted">{p.sku}</div></div> },
            { k: 'category', label: 'Category' },
            { k: 'warehouse', label: 'Warehouse', value: (p) => whName(p.warehouseId) },
            { k: 'status', label: 'Status', value: stockStatus, render: (p) => <Badge>{stockStatus(p)}</Badge> },
            { k: 'level', label: 'Level', sort: false, value: () => '', render: (p) => <div style={{ width: 100 }} title={`Reorder at ${p.reorder}`}><Progress value={(p.stock / Math.max(p.reorder * 3, 1)) * 100} color={p.stock <= p.reorder ? 'var(--bad)' : undefined} /></div> },
            { k: 'stock', label: 'On hand', align: 'r' },
            { k: 'reorder', label: 'Reorder at', align: 'r' },
            { k: 'value', label: 'Value', align: 'r', value: (p) => p.stock * p.cost, render: (p) => money(p.stock * p.cost) },
            ...(editable ? [{ k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (p) => <Btn sm icon="ArrowUpDown" onClick={() => setAdjust(p)}>Update</Btn> }] : []),
          ]} />
      )}
      {tab === 'moves' && (
        <DataTable rows={db.stockMoves} rowKey="id" exportName="stock-movements" initialSort={{ k: 'date', dir: 'desc' }}
          statusTabs={{ options: ['Receipt', 'Delivery', 'Adjustment'], get: (m) => m.type }}
          columns={[
            { k: 'date', label: 'Date', nowrap: true, render: (m) => fmtDate(m.date) },
            { k: 'product', label: 'Product', value: (m) => prodName(m.productId) },
            { k: 'type', label: 'Type', render: (m) => <Badge tone={m.type === 'Receipt' ? 'good' : m.type === 'Delivery' ? 'info' : 'warn'}>{m.type}</Badge> },
            { k: 'qty', label: 'Quantity', align: 'r', render: (m) => (m.qty > 0 ? `+${m.qty}` : m.qty) },
            { k: 'warehouse', label: 'Warehouse', value: (m) => whName(m.warehouseId) },
            { k: 'reason', label: 'Reason' },
            { k: 'user', label: 'By', value: (m) => userName(m.userId) },
          ]} />
      )}
      {tab === 'wh' && (
        <div className="stack">
          <div className="g3">
            {db.warehouses.map((w) => {
              const items = tracked.filter((p) => p.warehouseId === w.id);
              const units = sum(items, (p) => p.stock);
              return (
                <Card key={w.id} title={w.name} sub={`${w.code} · ${w.city}`}>
                  <div className="stack-s">
                    <div className="row between"><span className="muted small">Capacity used</span><span className="num strong">{num(units)} / {num(w.capacity)}</span></div>
                    <Progress value={(units / w.capacity) * 100} />
                    <div className="row between"><span className="muted small">Products</span><span className="num">{items.length}</span></div>
                    <div className="row between"><span className="muted small">Stock value</span><span className="num">{moneyK(sum(items, (p) => p.stock * p.cost))}</span></div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card title="Units by warehouse"><Bars height={220} format={num} horizontal data={db.warehouses.map((w) => ({ label: w.name, Units: sum(tracked.filter((p) => p.warehouseId === w.id), (p) => p.stock) }))} series={[{ key: 'Units', name: 'Units on hand' }]} /></Card>
        </div>
      )}
      {adjust && <AdjustDialog product={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}
