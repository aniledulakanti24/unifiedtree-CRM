import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, FormFields, Icon, Kpi, Modal, NoSections, PageHead, Pills, RecordModal, UserChip, firstAllowed, validate } from '../ui';
import { NewOrderItems, cleanItems, newLine } from '../shared';
import { addDays, fmtDate, money, moneyK, sum, today } from '../util';

const CATEGORY_ICON = { Hardware: 'Cpu', Accessories: 'Cable', Software: 'AppWindow', Services: 'Wrench', Consumables: 'Boxes' };
const CATEGORY_TONE = { Hardware: 'info', Accessories: 'violet', Software: 'good', Services: 'warn', Consumables: 'muted' };
export const stockStatus = (p) => (!p.tracked ? 'Available' : p.stock <= 0 ? 'Out of stock' : p.stock <= p.reorder ? 'Low stock' : 'In stock');

function NewOrder({ onClose }) {
  const { me, db, role, placeOrder, toast, scope } = useStore();
  const [v, setV] = useState({ companyId: '', date: today(), channel: 'Direct', ownerId: me.id });
  const [items, setItems] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'companyId', label: 'Customer', type: 'company', req: true },
    { k: 'date', label: 'Order date', type: 'date', req: true },
    { k: 'channel', label: 'Channel', type: 'select', noBlank: true, list: 'orderChannel' },
    { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: role === 'sales' },
  ];
  const lines = cleanItems(items);
  const total = sum(lines, (x) => x.qty * x.price);
  const short = lines.filter((x) => { const p = db.products.find((y) => y.id === x.productId); return p?.tracked && p.stock < x.qty; });
  const save = () => {
    const e = validate(fields, v);
    if (!lines.length) e.items = 'Add at least one product';
    if (short.length && !db.settings.allowBackorder) e.items = `Not enough stock for ${short.map((x) => x.name).join(', ')}. Allow backorders in Settings, or lower the quantity.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const o = placeOrder({ ...v, items: lines, total, status: 'Pending' });
    toast(`Order ${o.number} placed. Stock updated.`);
    onClose();
  };
  return (
    <Modal size="lg" title="New order" onClose={onClose} footer={<><span className="grow strong num">Total {money(total)}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Place order</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
        <NewOrderItems items={items} setItems={setItems} />
        {errors.items && <div className="error-text">{errors.items}</div>}
      </div>
    </Modal>
  );
}

function OrderDrawer({ order, onClose }) {
  const { db, update, cancelOrder, create, toast, companyName, can } = useStore();
  const [confirm, setConfirm] = useState(false);
  const inv = db.invoices.find((i) => i.orderId === order.id);
  const ship = db.shipments.find((s) => s.orderId === order.id);
  const makeInvoice = () => {
    const n = create('invoices', { number: `${db.settings.invoicePrefix}${5200 + db.invoices.length}`, orderId: order.id, companyId: order.companyId, ownerId: order.ownerId, date: today(), due: addDays(30), items: order.items, total: order.total, paid: 0, status: 'Sent' });
    toast(`Invoice ${n.number} created`);
  };
  const makeShipment = () => {
    const c = db.companies.find((x) => x.id === order.companyId);
    create('shipments', { tracking: `UT-${10000 + db.shipments.length}-${1000 + db.orders.length}`, orderId: order.id, orderNumber: order.number, companyId: order.companyId, origin: db.warehouses[0]?.city || '', destination: c?.city || '', carrier: `${db.settings.companyName} Fleet`, vehicleId: db.vehicles[0]?.id || '', status: 'Picked up', shipDate: today(), eta: addDays(5), log: [{ label: 'Picked up', at: today() }], ownerId: order.ownerId });
    update('orders', order.id, { status: 'Shipped' });
    toast('Shipment created');
  };
  const active = order.status !== 'Cancelled';
  return (
    <Drawer title={order.number} onClose={onClose} footer={active && (can('orders', 'edit') || can('billing', 'invoice') || can('logistics', 'edit')) && <>
      {can('orders', 'edit') && order.status !== 'Completed' && <Btn kind="danger" onClick={() => setConfirm(true)} style={{ marginInlineEnd: 'auto' }}>Cancel order</Btn>}
      {!inv && can('billing', 'invoice') && <Btn icon="Receipt" onClick={makeInvoice}>Create invoice</Btn>}
      {!ship && can('logistics', 'edit') && <Btn icon="Truck" onClick={makeShipment}>Ship</Btn>}
      {can('orders', 'edit') && order.status !== 'Completed' && <Btn kind="primary" onClick={() => { update('orders', order.id, { status: 'Completed' }); toast('Order completed'); }}>Mark completed</Btn>}
    </>}>
      <div className="stack">
        <div className="row wrap"><Badge>{order.status}</Badge>{inv && <Badge>{inv.status}</Badge>}{ship && <Badge>{ship.status}</Badge>}</div>
        <dl className="dl">
          <dt>Customer</dt><dd><Link to={`/customers/${order.companyId}`}>{companyName(order.companyId)}</Link></dd>
          <dt>Date</dt><dd>{fmtDate(order.date)}</dd>
          <dt>Channel</dt><dd>{order.channel}</dd>
          <dt>Salesperson</dt><dd><UserChip id={order.ownerId} /></dd>
          {inv && <><dt>Invoice</dt><dd><Link to="/billing">{inv.number}</Link></dd></>}
          {ship && <><dt>Tracking</dt><dd>{ship.tracking}</dd></>}
        </dl>
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Subtotal</th></tr></thead>
            <tbody>
              {order.items.map((i) => <tr key={i.productId + i.qty}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{money(i.price)}</td><td className="r num">{money(i.qty * i.price)}</td></tr>)}
              <tr><td colSpan={3} className="strong">Total</td><td className="r num strong">{money(order.total)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      {confirm && <Confirm title="Cancel this order?" text="Items go back into stock." confirmLabel="Cancel order" onClose={() => setConfirm(false)} onConfirm={() => { cancelOrder(order.id); toast('Order cancelled. Stock restored.'); }} />}
    </Drawer>
  );
}

export function Orders() {
  const { db, role, t, sec, can, scope, companyName, userName, optionsOf } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [creating, setCreating] = useState(false);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);
  const rows = scope(db.orders);
  const live = rows.filter((o) => o.status !== 'Cancelled');
  const order = rows.find((o) => o.id === openId);
  return (
    <div>
      <PageHead title={t('orders')} sub="Manage and track customer orders">
        {can('orders', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setCreating(true)}>New order</Btn>}
      </PageHead>
      {sec('orders', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Total revenue" value={moneyK(sum(live, (o) => o.total))} note={`${live.length} orders`} icon="CircleDollarSign" />
        <Kpi label="Average order" value={moneyK(sum(live, (o) => o.total) / (live.length || 1))} icon="ChartNoAxesColumn" />
        <Kpi label="To fulfil" value={rows.filter((o) => ['Pending', 'Processing'].includes(o.status)).length} note="Pending or processing" icon="PackageOpen" />
        <Kpi label="Cancelled" value={rows.filter((o) => o.status === 'Cancelled').length} icon="CircleX" />
      </div>}
      <DataTable rows={rows} exportName="orders" onRow={(o) => setOpenId(o.id)} isSelected={(o) => o.id === openId} initialSort={{ k: 'date', dir: 'desc' }}
        searchPlaceholder="Search orders…"
        statusTabs={{ options: ['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'], get: (o) => o.status }}
        filters={[{ k: 'channel', label: 'Channel', get: (o) => o.channel, options: optionsOf('orderChannel') }]}
        columns={[
          { k: 'number', label: 'Order', render: (o) => <span className="strong">{o.number}</span> },
          { k: 'customer', label: 'Customer', value: (o) => companyName(o.companyId) },
          { k: 'product', label: 'Products', value: (o) => o.items.map((i) => i.name).join(', '), render: (o) => <div className="trunc" style={{ maxWidth: 220 }}>{o.items[0]?.name}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}</div> },
          { k: 'status', label: 'Status', render: (o) => <Badge>{o.status}</Badge> },
          { k: 'date', label: 'Date', nowrap: true, render: (o) => fmtDate(o.date) },
          { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (o) => userName(o.ownerId), render: (o) => <UserChip id={o.ownerId} /> },
          { k: 'total', label: 'Amount', align: 'r', render: (o) => money(o.total) },
        ]} />
      {order && <OrderDrawer order={order} onClose={() => setOpenId(null)} />}
      {creating && <NewOrder onClose={() => setCreating(false)} />}
    </div>
  );
}

const productFields = (wh, addWarehouse) => [
  { k: 'name', label: 'Product name', req: true, full: true },
  { k: 'sku', label: 'SKU', req: true },
  { k: 'category', label: 'Category', type: 'select', req: true, list: 'productCategory' },
  { k: 'price', label: 'Sale price', type: 'number', min: 0, req: true },
  { k: 'cost', label: 'Cost', type: 'number', min: 0 },
  { k: 'tracked', label: 'Inventory', type: 'check', text: 'Track stock for this product' },
  { k: 'reorder', label: 'Reorder level', type: 'number', min: 0 },
  { k: 'stock', label: 'Stock on hand', type: 'number', min: 0, hint: 'Later changes go through Inventory, so they are logged' },
  { k: 'warehouseId', label: 'Warehouse', type: 'select', options: wh.map((w) => ({ value: w.id, label: w.name })), onAdd: addWarehouse, addText: '+ Add new warehouse…' },
  { k: 'supplier', label: 'Supplier' },
  { k: 'active', label: 'Status', type: 'check', text: 'Active and available to sell' },
  { k: 'description', label: 'Description', type: 'textarea' },
];
export function Products() {
  const { db, t, sec, can, create, update, remove, toast, optionsOf } = useStore();
  const [pref, setView] = useState('grid');
  const views = [{ k: 'grid', icon: 'LayoutGrid', label: 'Grid' }, { k: 'list', icon: 'List', label: 'List' }].filter((v) => sec('products', v.k));
  const view = firstAllowed(views, pref);
  const [cat, setCat] = useState('All');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const editable = can('products', 'edit');
  const shown = db.products.filter((p) => cat === 'All' || p.category === cat);
  const save = (v) => {
    if (edit.id) { const { id, ...rest } = v; update('products', id, rest); toast('Product saved'); } else { create('products', v); toast('Product created'); }
  };
  return (
    <div>
      <PageHead title={t('products')} sub={`${db.products.length} products in the catalogue`}>
        <Pills value={view} onChange={setView} options={views} />
        {can('products', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({ tracked: true, active: true, price: 0, cost: 0, stock: 0, reorder: 10, warehouseId: db.warehouses[0]?.id, sku: `UT-${2000 + db.products.length}` })}>New product</Btn>}
      </PageHead>
      {!view ? <NoSections /> : view === 'grid' ? (
        <>
          <div style={{ marginBottom: 12 }}><Pills value={cat} onChange={setCat} options={['All', ...optionsOf('productCategory')]} /></div>
          <div className="prod-grid">
            {shown.map((p) => (
              <button key={p.id} type="button" className="prod-card" onClick={() => setEdit(p)} disabled={!editable} style={!editable ? { cursor: 'default', color: 'inherit' } : undefined}>
                <span className={`prod-img ${CATEGORY_TONE[p.category] || ''}`}><Icon name={CATEGORY_ICON[p.category] || 'Package'} size={34} /></span>
                <span style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="strong trunc">{p.name}</span>
                  <span className="small muted">{p.sku} · {p.category}</span>
                  <span className="row between" style={{ marginTop: 4 }}><span className="strong num">{money(p.price)}</span><Badge>{stockStatus(p)}</Badge></span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <DataTable rows={db.products} exportName="products" onRow={editable ? (p) => setEdit(p) : undefined} initialSort={{ k: 'name', dir: 'asc' }}
          filters={[{ k: 'category', label: 'Category', get: (p) => p.category, options: optionsOf('productCategory') }]}
          columns={[
            { k: 'name', label: 'Product', render: (p) => <span className="strong">{p.name}</span> },
            { k: 'sku', label: 'SKU' },
            { k: 'category', label: 'Category' },
            { k: 'stockStatus', label: 'Availability', value: (p) => stockStatus(p), render: (p) => <Badge>{stockStatus(p)}</Badge> },
            { k: 'stock', label: 'Stock', align: 'r', value: (p) => (p.tracked ? p.stock : ''), render: (p) => (p.tracked ? p.stock : '—') },
            { k: 'cost', label: 'Cost', align: 'r', render: (p) => money(p.cost) },
            { k: 'price', label: 'Price', align: 'r', render: (p) => money(p.price) },
            { k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (p) => can('products', 'delete') && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${p.name}`} onClick={() => setDel(p)} /> },
          ]} />
      )}
      {edit && <RecordModal size="lg" title={edit.id ? 'Edit product' : 'New product'} fields={productFields(db.warehouses, can('options', 'add') ? (name) => create('warehouses', { name, code: name.replace(/\s/g, '').slice(0, 3).toUpperCase(), city: '', capacity: 10000 }).id : undefined).map((f) => (f.k === 'stock' && edit.id ? { ...f, hide: true } : f))} initial={edit} onClose={() => setEdit(null)} onSave={save} />}
      {del && <Confirm title="Delete product?" text={`${del.name} will leave the catalogue. Past orders keep their line items.`} onClose={() => setDel(null)} onConfirm={() => { remove('products', del.id); toast('Product deleted'); }} />}
    </div>
  );
}
