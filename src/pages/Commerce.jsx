import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, FormFields, ListField, Icon, Kpi, Modal, NoSections, PageHead, Pills, RecordModal, UserChip, firstAllowed, validate } from '../ui';
import { DeliveryCheck, OpsSource, RequestButton, WatchButton } from './OpsExtras';
import { NewOrderItems, NotifyButton, OpsNote, QtyLines, cleanItems, docColumns, newLine } from '../shared';
import { NO_RATE, addDays, discountIssue, docMoney, fmtDate, fxFields, lineTotal, money, moneyIn, moneyK, nextNo, rateOf, repriceItems, sum, today } from '../util';
import { pickLines, remaining } from '../stock';
import { taxesFor } from '../engine';

const CATEGORY_ICON = { Hardware: 'Cpu', Accessories: 'Cable', Software: 'AppWindow', Services: 'Wrench', Consumables: 'Boxes' };
const CATEGORY_TONE = { Hardware: 'info', Accessories: 'violet', Software: 'good', Services: 'warn', Consumables: 'muted' };
export const stockStatus = (p) => (!p.tracked ? 'Available' : p.stock <= 0 ? 'Out of stock' : p.stock <= p.reorder ? 'Low stock' : 'In stock');

function NewOrder({ onClose }) {
  const { me, db, role, placeOrder, toast, scope } = useStore();
  const [v, setV] = useState({ companyId: '', date: today(), channel: 'Direct', ownerId: me.id, currency: db.settings.currency || 'USD' });
  const [items, setItems] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'companyId', label: 'Customer', type: 'company', req: true },
    { k: 'date', label: 'Order date', type: 'date', req: true },
    { k: 'channel', label: 'Channel', type: 'select', noBlank: true, list: 'orderChannel' },
    { k: 'currency', label: 'Currency', type: 'select', noBlank: true, list: 'currency' },
    { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: role === 'sales' },
  ];
  const mi = (n) => moneyIn(v.currency, n);
  const change = (k, x) => {
    const patch = { [k]: x };
    if (k === 'companyId') patch.currency = db.companies.find((c) => c.id === x)?.currency || db.settings.currency || 'USD';
    if (patch.currency && patch.currency !== v.currency) setItems(repriceItems(items, v.currency, patch.currency));
    setV((p) => ({ ...p, ...patch }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const lines = cleanItems(items);
  const total = sum(lines, lineTotal);
  const short = lines.filter((x) => { const p = db.products.find((y) => y.id === x.productId); return p?.tracked && p.stock < x.qty; });
  const save = () => {
    const e = validate(fields, v);
    if (!rateOf(v.currency)) e.currency = NO_RATE;
    if (!lines.length) e.items = 'Add at least one product';
    const over = discountIssue(lines, db.settings, role);
    if (over) e.items = over;
    else if (short.length && !db.settings.allowBackorder) e.items = `Not enough stock for ${short.map((x) => x.name).join(', ')}. Allow backorders in Settings, or lower the quantity.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const fx = fxFields(v.currency);
    const baseLines = lines.map((l) => ({ ...l, price: l.price / (fx.fxRate || 1) }));
    const o = placeOrder({ ...v, ...fx, items: baseLines, total: sum(baseLines, lineTotal), status: 'Pending' });
    toast(`Order ${o.number} placed. Stock updated.`);
    onClose();
  };
  return (
    <Modal size="lg" title="New order" onClose={onClose} footer={<><span className="grow strong num">Total {mi(total)}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Place order</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={change} />
        <NewOrderItems items={items} setItems={setItems} customer={db.companies.find((c) => c.id === v.companyId)} rate={rateOf(v.currency)} />
        {errors.items && <div className="error-text">{errors.items}</div>}
      </div>
    </Modal>
  );
}

// Pick how much of the order to ship or invoice now.
function PartDialog({ title, rows, doneLabel, inputLabel, note, confirm, onConfirm, onClose }) {
  const [qtys, setQtys] = useState(Object.fromEntries(rows.map((r) => [r.key, r.max])));
  const [error, setError] = useState('');
  const lines = pickLines(rows, qtys);
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={() => { if (!lines.length) { setError('Enter a quantity on at least one line.'); return; } onConfirm(lines); onClose(); }}>{confirm}</Btn></>}>
      <div className="stack">
        <QtyLines rows={rows} values={qtys} onChange={(x) => { setQtys(x); setError(''); }} doneLabel={doneLabel} inputLabel={inputLabel} />
        {note && <div className="small muted">{note(lines)}</div>}
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

function OrderDrawer({ order, onClose }) {
  const { db, update, cancelOrder, create, toast, companyName, can, opsReadOnly } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [part, setPart] = useState(null);
  const dm = (n) => docMoney(order, n);
  const invs = db.invoices.filter((i) => i.orderId === order.id);
  const ships = db.shipments.filter((s) => s.orderId === order.id);
  const customer = db.companies.find((x) => x.id === order.companyId);
  const toBill = remaining(order.items, invs.flatMap((i) => i.items || []));
  const toShip = remaining(order.items, ships.flatMap((s) => s.items || order.items));
  const units = sum(order.items, (i) => i.qty);
  const billed = sum(toBill, (l) => Math.min(l.done, l.ordered));
  const shipped = sum(toShip, (l) => Math.min(l.done, l.ordered));
  const makeInvoice = (lines) => {
    const taxes = taxesFor(lines, db, customer);
    const n = create('invoices', { number: nextNo(db.invoices, db.settings.invoicePrefix, 5200), orderId: order.id, currency: order.currency || '', fxRate: order.fxRate || 1, companyId: order.companyId, ownerId: order.ownerId, date: today(), due: addDays(30), items: lines, taxes, total: taxes.taxable + taxes.tax, paid: 0, status: 'Sent' });
    toast(`Invoice ${n.number} created`);
  };
  const makeShipment = (lines) => {
    create('shipments', { tracking: `UT-${10000 + db.shipments.length}-${1000 + db.orders.length}`, orderId: order.id, orderNumber: order.number, companyId: order.companyId, origin: db.warehouses[0]?.city || '', destination: customer?.city || '', carrier: `${db.settings.companyName} Fleet`, vehicleId: db.vehicles[0]?.id || '', status: 'Picked up', shipDate: today(), eta: addDays(5), log: [{ label: 'Picked up', at: today() }], ownerId: order.ownerId, items: lines });
    const left = sum(toShip, (l) => l.max) - sum(lines, (l) => l.qty);
    update('orders', order.id, { status: left > 0 ? 'Processing' : 'Shipped' });
    toast(left > 0 ? `Shipment created. ${left} still to ship.` : 'Shipment created');
  };
  const active = order.status !== 'Cancelled';
  const locked = invs.length > 0 || ships.length > 0;
  const askCancel = () => { if (locked) toast('This order has an invoice or shipment. Use a credit note on the invoice to take goods back.'); else setConfirm(true); };
  return (
    <Drawer title={order.number} onClose={onClose} actions={<WatchButton entity="orders" id={order.id} />} footer={active && (opsReadOnly || can('orders', 'edit') || can('billing', 'invoice') || can('logistics', 'edit')) && <>
      {can('orders', 'edit') && order.status !== 'Completed' && !locked && <Btn kind="danger" onClick={askCancel} style={{ marginInlineEnd: 'auto' }}>Cancel order</Btn>}
      {opsReadOnly && <RequestButton area="orders" type="order" record={{ entity: 'orders', id: order.id, label: order.number, route: '/orders', companyId: order.companyId }} kind="primary" label="Ask for a change" link="/orders" message={[`About order ${order.number} for ${companyName(order.companyId)}.`, toBill.some((l) => l.max > 0) && `Still to invoice: ${toBill.filter((l) => l.max > 0).map((l) => `${l.max} x ${l.name}`).join(', ')}.`, toShip.some((l) => l.max > 0) && `Still to ship: ${toShip.filter((l) => l.max > 0).map((l) => `${l.max} x ${l.name}`).join(', ')}.`].filter(Boolean).join('\n')} />}
      {toBill.some((l) => l.max > 0) && can('billing', 'invoice') && <Btn icon="Receipt" onClick={() => setPart('invoice')}>{invs.length ? 'Invoice the rest' : 'Create invoice'}</Btn>}
      {toShip.some((l) => l.max > 0) && can('logistics', 'edit') && <Btn icon="Truck" onClick={() => setPart('ship')}>{ships.length ? 'Ship the rest' : 'Ship'}</Btn>}
      {can('orders', 'edit') && order.status !== 'Completed' && <Btn kind="primary" onClick={() => { update('orders', order.id, { status: 'Completed' }); toast('Order completed'); }}>Mark completed</Btn>}
    </>}>
      <div className="stack">
        <div className="row wrap"><Badge>{order.status}</Badge>{invs.map((i) => <Badge key={i.id}>{i.status}</Badge>)}{ships.map((s) => <Badge key={s.id}>{s.status}</Badge>)}</div>
        {can('orders', 'edit') && active && <div className="field"><label className="label">Order step</label><ListField f={{ k: 'status', label: 'Order step', type: 'select', noBlank: true, list: 'orderStatus' }} value={order.status} onChange={(_, x) => { if (x === 'Cancelled') { askCancel(); return; } update('orders', order.id, { status: x }); toast(`Order moved to ${x}`); }} /></div>}
        <dl className="dl">
          <dt>Customer</dt><dd><Link to={`/customers/${order.companyId}`}>{companyName(order.companyId)}</Link></dd>
          <dt>Date</dt><dd>{fmtDate(order.date)}</dd>
          <dt>Channel</dt><dd>{order.channel}</dd>
          <dt>Salesperson</dt><dd><UserChip id={order.ownerId} /></dd>
          <dt>Shipped</dt><dd className="num">{shipped} of {units}</dd>
          <dt>Invoiced</dt><dd className="num">{billed} of {units}</dd>
          {!!invs.length && <><dt>{invs.length > 1 ? 'Invoices' : 'Invoice'}</dt><dd><Link to="/billing">{invs.map((i) => i.number).join(', ')}</Link></dd></>}
          {!!ships.length && <><dt>Tracking</dt><dd>{ships.map((s) => s.tracking).join(', ')}</dd></>}
        </dl>
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Off</th><th className="r">Subtotal</th></tr></thead>
            <tbody>
              {order.items.map((i) => <tr key={i.productId + i.qty}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{dm(i.price)}</td><td className="r num">{i.discount ? `${i.discount}%` : '—'}</td><td className="r num">{dm(lineTotal(i))}</td></tr>)}
              <tr><td colSpan={4} className="strong">Total before tax</td><td className="r num strong">{dm(sum(order.items, lineTotal))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      {part === 'invoice' && <PartDialog title={`Invoice ${order.number}`} rows={toBill.filter((l) => l.max > 0)} doneLabel="Invoiced" inputLabel="Invoice now" confirm="Create invoice" note={(lines) => { const x = taxesFor(lines, db, customer); return `${dm(x.taxable)} plus ${dm(x.tax)} tax. Total ${dm(x.taxable + x.tax)}.`; }} onConfirm={makeInvoice} onClose={() => setPart(null)} />}
      {part === 'ship' && <PartDialog title={`Ship ${order.number}`} rows={toShip.filter((l) => l.max > 0)} doneLabel="Shipped" inputLabel="Ship now" confirm="Create shipment" onConfirm={makeShipment} onClose={() => setPart(null)} />}
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
      <PageHead title={t('orders')} sub={`Totals are in ${db.settings.currency}. Each order shows its own currency.`}>
        {can('orders', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setCreating(true)}>New order</Btn>}
      </PageHead>
      <OpsSource entities={['orders']} what="Orders" />
      <OpsNote>Orders are handled outside this CRM. You can view them here, and open one to notify the team if something needs changing.</OpsNote>
      {sec('orders', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Total revenue" value={moneyK(sum(live, (o) => o.total))} note={`${live.length} orders`} icon="CircleDollarSign" />
        <Kpi label="Average order" value={moneyK(sum(live, (o) => o.total) / (live.length || 1))} icon="ChartNoAxesColumn" />
        <Kpi label="To fulfil" value={rows.filter((o) => ['Pending', 'Processing'].includes(o.status)).length} note="Pending or processing" icon="PackageOpen" />
        <Kpi label="Cancelled" value={rows.filter((o) => o.status === 'Cancelled').length} icon="CircleX" />
      </div>}
      <DataTable rows={rows} exportName="orders" dateOf={(o) => o.date} onRow={(o) => setOpenId(o.id)} isSelected={(o) => o.id === openId} initialSort={{ k: 'date', dir: 'desc' }}
        searchPlaceholder="Search orders…"
        statusTabs={{ options: optionsOf('orderStatus'), get: (o) => o.status }}
        filters={[{ k: 'channel', label: 'Channel', get: (o) => o.channel, options: optionsOf('orderChannel') }]}
        columns={[
          { k: 'number', label: 'Order', render: (o) => <span className="strong">{o.number}</span> },
          { k: 'customer', label: 'Customer', value: (o) => companyName(o.companyId) },
          { k: 'product', label: 'Products', value: (o) => o.items.map((i) => i.name).join(', '), render: (o) => <div className="trunc" style={{ maxWidth: 220 }}>{o.items[0]?.name}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}</div> },
          { k: 'status', label: 'Status', render: (o) => <Badge>{o.status}</Badge> },
          { k: 'date', label: 'Date', nowrap: true, render: (o) => fmtDate(o.date) },
          { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (o) => userName(o.ownerId), render: (o) => <UserChip id={o.ownerId} /> },
          { k: 'total', label: 'Amount', align: 'r', render: (o) => docMoney(o, o.total) },
          ...docColumns((o) => o.total),
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
  { k: 'taxCode', label: 'Tax code' },
  { k: 'taxRate', label: 'Tax rate', type: 'select', list: 'taxRate', blankLabel: 'Use the default rate' },
  { k: 'supplier', label: 'Supplier' },
  { k: 'active', label: 'Status', type: 'check', text: 'Active and available to sell' },
  { k: 'description', label: 'Description', type: 'textarea' },
];
export function Products() {
  const { db, t, sec, can, create, update, remove, toast, optionsOf, formFields, opsReadOnly } = useStore();
  const [checking, setChecking] = useState(false);
  const lowItems = db.products.filter((p) => p.tracked && p.active !== false && p.stock <= p.reorder);
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
        <Btn icon="PackageSearch" onClick={() => setChecking(true)}>Can we deliver?</Btn>
        <Pills value={view} onChange={setView} options={views} />
        {opsReadOnly && lowItems.length > 0 && <RequestButton area="purchasing" type="reorder" label={`Ask to reorder (${lowItems.length})`} link="/products" message={`Please reorder these products:\n${lowItems.map((p) => `- ${p.name}: ${p.stock} in stock, reorder level ${p.reorder}`).join('\n')}`} />}
        {can('products', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({ tracked: true, active: true, price: 0, cost: 0, stock: 0, reorder: 10, warehouseId: db.warehouses[0]?.id, sku: `UT-${2000 + db.products.length}` })}>New product</Btn>}
      </PageHead>
      <OpsSource entities={['products']} what="Products, prices and stock" />
      {checking && <DeliveryCheck onClose={() => setChecking(false)} />}
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
        <DataTable fieldKind="product" rows={db.products} exportName="products" onRow={editable ? (p) => setEdit(p) : undefined} initialSort={{ k: 'name', dir: 'asc' }}
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
      {edit && <RecordModal size="lg" title={edit.id ? 'Edit product' : 'New product'} fields={formFields('product', productFields(db.warehouses, can('options', 'add') && !opsReadOnly ? (name) => create('warehouses', { name, code: name.replace(/\s/g, '').slice(0, 3).toUpperCase(), city: '', capacity: 10000 }).id : undefined)).map((f) => (f.k === 'stock' && (edit.id || opsReadOnly) ? { ...f, hide: true } : f.k === 'supplier' ? { ...f, type: 'select', options: (db.suppliers || []).map((s) => ({ value: s.name, label: s.name })), onAdd: can('options', 'add') && !opsReadOnly ? (name) => { create('suppliers', { name, leadDays: 7 }); return name; } : undefined, addText: '+ Add new supplier…' } : f))} initial={edit} onClose={() => setEdit(null)} onSave={save} />}
      {del && <Confirm title="Delete product?" text={`${del.name} will leave the catalogue. Past orders keep their line items.`} onClose={() => setDel(null)} onConfirm={() => { remove('products', del.id); toast('Product deleted'); }} />}
    </div>
  );
}
