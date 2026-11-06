import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, FormFields, Kpi, Modal, NoSections, PageHead, Progress, RecordModal, Tabs, firstAllowed, validate } from '../ui';
import { DeliveryCheck, OpsSource, RequestButton, WatchButton } from './OpsExtras';
import { NewOrderItems, NotifyButton, OpsNote, QtyLines, cleanItems, newLine } from '../shared';
import { OPEN_PO, reorderPlan } from '../stock';
import { addDays, fmtDate, money, moneyK, nextNo, num, sum, today } from '../util';

const poTotal = (items) => sum(items, (i) => i.qty * i.price);
const supplierFields = [
  { k: 'name', label: 'Supplier name', req: true, full: true },
  { k: 'contact', label: 'Contact person' },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'city', label: 'City' },
  { k: 'taxId', label: 'Tax ID' },
  { k: 'leadDays', label: 'Delivery time in days', type: 'number', min: 0 },
  { k: 'terms', label: 'Payment terms', type: 'select', list: 'paymentTerms' },
];

function PoForm({ onClose, onCreated }) {
  const { db, me, create, toast, can } = useStore();
  const [v, setV] = useState({ supplierId: '', date: today(), expected: addDays(14), warehouseId: db.warehouses[0]?.id || '', notes: '' });
  const [items, setItems] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'supplierId', label: 'Supplier', type: 'select', req: true, options: (db.suppliers || []).map((s) => ({ value: s.id, label: s.name })), onAdd: can('purchasing', 'create') ? (name) => create('suppliers', { name, leadDays: 7 }).id : undefined, addText: '+ Add new supplier…' },
    { k: 'warehouseId', label: 'Deliver to', type: 'select', noBlank: true, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) },
    { k: 'date', label: 'Order date', type: 'date', req: true },
    { k: 'expected', label: 'Expected delivery', type: 'date', req: true },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  const lines = cleanItems(items);
  const save = () => {
    const e = validate(fields, v);
    if (!lines.length) e.items = 'Add at least one product';
    setErrors(e);
    if (Object.keys(e).length) return;
    const merged = lines.map((l) => ({ ...l, received: 0 }));
    const po = create('purchaseOrders', { ...v, number: nextNo(db.purchaseOrders || [], 'PO-', 2100), items: merged, total: poTotal(merged), status: 'Draft', createdBy: me.id });
    toast(`Purchase order ${po.number} saved as a draft`);
    onCreated?.(po.id);
    onClose();
  };
  return (
    <Modal size="lg" title="New purchase order" onClose={onClose} footer={<><span className="grow strong num">Total {money(poTotal(lines))}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save draft</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
        <NewOrderItems items={items} setItems={setItems} purchase />
        {errors.items && <div className="error-text">{errors.items}</div>}
      </div>
    </Modal>
  );
}

function ReceiveDialog({ po, onClose }) {
  const { db, receivePO, toast } = useStore();
  const rows = po.items.map((i) => ({ ...i, key: i.productId, ordered: i.qty, done: i.received || 0, max: i.qty - (i.received || 0) }));
  const [qtys, setQtys] = useState(Object.fromEntries(rows.map((r) => [r.key, r.max])));
  const [v, setV] = useState({ warehouseId: po.warehouseId || db.warehouses[0]?.id || '', date: today() });
  const [error, setError] = useState('');
  const fields = [
    { k: 'warehouseId', label: 'Receive into', type: 'select', noBlank: true, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) },
    { k: 'date', label: 'Date received', type: 'date', req: true },
  ];
  const save = () => {
    const picked = rows.filter((r) => Number(qtys[r.key]) > 0);
    if (!picked.length) { setError('Enter the quantity that arrived for at least one line.'); return; }
    receivePO(po.id, qtys, v.warehouseId, v.date);
    toast('Goods received. Stock and cost updated.');
    onClose();
  };
  return (
    <Modal title={`Receive goods: ${po.number}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="PackageCheck" onClick={save}>Receive goods</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={{}} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} />
        <QtyLines rows={rows} values={qtys} onChange={(x) => { setQtys(x); setError(''); }} doneLabel="Received" inputLabel="Arrived now" />
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

function PoPrint({ po, supplier }) {
  const { db } = useStore();
  const s = db.settings;
  return createPortal(
    <div className="print-doc">
      <div className="pd-head">
        <div><div className="pd-co">{s.companyName}</div><div>{s.address}</div>{(s.taxId || s.gstin) && <div>{s.taxIdLabel || 'Tax ID'}: {s.taxId || s.gstin}</div>}</div>
        <div style={{ textAlign: 'right' }}><div className="pd-title">Purchase order</div><div>{po.number}</div><div>Date: {fmtDate(po.date)}</div><div>Expected: {fmtDate(po.expected)}</div></div>
      </div>
      <div className="pd-to"><strong>Supplier</strong><div>{supplier?.name}</div><div>{supplier?.city}</div>{supplier?.taxId && <div>Tax ID: {supplier.taxId}</div>}</div>
      <table className="pd-table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Unit cost</th><th className="r">Amount</th></tr></thead>
        <tbody>{po.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="r">{i.qty}</td><td className="r">{money(i.price)}</td><td className="r">{money(i.qty * i.price)}</td></tr>)}</tbody>
      </table>
      <div className="pd-totals"><div className="pd-grand"><span>Total</span><span>{money(po.total)}</span></div></div>
      {po.notes && <div className="pd-words">{po.notes}</div>}
      <div className="pd-foot">Generated by {s.companyName} CRM. This is a demo document.</div>
    </div>,
    document.body,
  );
}

function PoDrawer({ po, onClose }) {
  const { db, can, update, toast, askPoApproval, userName, opsReadOnly } = useStore();
  const [receiving, setReceiving] = useState(false);
  const [cancel, setCancel] = useState(false);
  const supplier = (db.suppliers || []).find((s) => s.id === po.supplierId);
  const wh = db.warehouses.find((w) => w.id === po.warehouseId);
  const limit = db.settings.poApprovalLimit ?? 5000;
  const needsApproval = po.total > limit && !can('purchasing', 'approve');
  const editable = can('purchasing', 'edit');
  const ordered = sum(po.items, (i) => i.qty);
  const received = sum(po.items, (i) => i.received || 0);
  const setStatus = (status, text) => { update('purchaseOrders', po.id, { status }); toast(text); };
  return (
    <Drawer title={po.number} onClose={onClose} actions={<><WatchButton entity="purchaseOrders" id={po.id} /><Btn sm icon="Printer" onClick={() => window.print()}>Print or save PDF</Btn></>} footer={<>
      {opsReadOnly && <RequestButton area="purchasing" type="po" record={{ entity: 'purchaseOrders', id: po.id, label: po.number, route: '/purchasing' }} kind="primary" label="Ask the purchasing team" link="/purchasing" message={`About purchase order ${po.number} (${po.status}, ${supplier?.name || 'no supplier'}): `} />}
      {editable && ['Draft', 'Awaiting approval', 'Approved', 'Sent'].includes(po.status) && !received && <Btn kind="danger" style={{ marginInlineEnd: 'auto' }} onClick={() => setCancel(true)}>Cancel order</Btn>}
      {editable && po.status === 'Draft' && (needsApproval
        ? <Btn kind="primary" icon="ShieldCheck" onClick={() => { askPoApproval(po.id); toast('Sent to admins for approval'); }}>Ask for approval</Btn>
        : <Btn kind="primary" icon="Send" onClick={() => setStatus('Sent', 'Marked as sent. No real email was sent.')}>Mark as sent</Btn>)}
      {po.status === 'Awaiting approval' && can('purchasing', 'approve') && <>
        <Btn onClick={() => setStatus('Draft', 'Sent back to draft')}>Send back</Btn>
        <Btn kind="primary" icon="Check" onClick={() => setStatus('Approved', 'Purchase order approved')}>Approve</Btn>
      </>}
      {editable && po.status === 'Approved' && <Btn kind="primary" icon="Send" onClick={() => setStatus('Sent', 'Marked as sent. No real email was sent.')}>Mark as sent</Btn>}
      {editable && ['Sent', 'Partly received'].includes(po.status) && <Btn kind="primary" icon="PackageCheck" onClick={() => setReceiving(true)}>Receive goods</Btn>}
    </>}>
      <PoPrint po={po} supplier={supplier} />
      <div className="stack">
        <div className="row between"><Badge>{po.status}</Badge><span className="strong num" style={{ fontSize: 18 }}>{money(po.total)}</span></div>
        {editable && po.status === 'Draft' && needsApproval && <div className="small muted">Orders above {money(limit)} need an admin to approve them.</div>}
        <dl className="dl">
          <dt>Supplier</dt><dd>{supplier?.name || 'Removed supplier'}{supplier?.email && <div className="small muted">{supplier.email}</div>}</dd>
          <dt>Deliver to</dt><dd>{wh?.name || '—'}</dd>
          <dt>Order date</dt><dd>{fmtDate(po.date)}</dd>
          <dt>Expected</dt><dd>{fmtDate(po.expected)}</dd>
          <dt>Raised by</dt><dd>{userName(po.createdBy)}</dd>
        </dl>
        <div>
          <div className="row between small" style={{ marginBottom: 4 }}><span className="muted">Received</span><span className="num strong">{received} of {ordered}</span></div>
          <Progress value={(received / Math.max(ordered, 1)) * 100} />
        </div>
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Item</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Unit cost</th><th className="r">Amount</th></tr></thead>
            <tbody>{po.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{i.received || 0}</td><td className="r num">{money(i.price)}</td><td className="r num">{money(i.qty * i.price)}</td></tr>)}</tbody>
          </table>
        </div>
        {po.notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{po.notes}</div>}
      </div>
      {receiving && <ReceiveDialog po={po} onClose={() => setReceiving(false)} />}
      {cancel && <Confirm title="Cancel this purchase order?" text="It stays on file as cancelled. Stock doesn't change." confirmLabel="Cancel order" onClose={() => setCancel(false)} onConfirm={() => setStatus('Cancelled', 'Purchase order cancelled')} />}
    </Drawer>
  );
}

function ReorderTab({ onCreated }) {
  const { db, me, can, create, toast, opsReadOnly } = useStore();
  const plan = useMemo(() => reorderPlan(db), [db.products, db.purchaseOrders, db.stockMoves, db.suppliers]);
  const [qtys, setQtys] = useState({});
  const [off, setOff] = useState({});
  const [chosen, setChosen] = useState({});
  const qtyOf = (r) => Number(qtys[r.product.id] ?? r.qty) || 0;
  const supOf = (r) => chosen[r.product.id] ?? r.supplierId;
  const picked = plan.filter((r) => !off[r.product.id] && qtyOf(r) > 0);
  const missing = picked.filter((r) => !supOf(r));
  const build = () => {
    if (missing.length) { toast(`Choose a supplier for ${missing[0].product.name}`); return; }
    const groups = new Map();
    picked.forEach((r) => groups.set(supOf(r), [...(groups.get(supOf(r)) || []), r]));
    let n = 0;
    const list = [...(db.purchaseOrders || [])];
    groups.forEach((rows, supplierId) => {
      const sup = db.suppliers.find((s) => s.id === supplierId);
      const items = rows.map((r) => ({ productId: r.product.id, name: r.product.name, qty: qtyOf(r), price: r.product.cost, received: 0 }));
      const number = nextNo(list, 'PO-', 2100);
      list.push({ number });
      create('purchaseOrders', { number, supplierId, date: today(), expected: addDays(Number(sup?.leadDays) || 14), warehouseId: rows[0].product.warehouseId, notes: 'Created from reorder suggestions', items, total: poTotal(items), status: 'Draft', createdBy: me.id });
      n += 1;
    });
    toast(`${n} draft purchase ${n === 1 ? 'order' : 'orders'} created`);
    setQtys({});
    onCreated();
  };
  if (!plan.length) return <Empty icon="PackageCheck" text="Nothing to reorder. Every tracked product is above its reorder level." />;
  return (
    <Card title="Suggested purchases" sub="Products at or below their reorder level. The quantity covers twice the reorder level or the last 30 days of sales, less stock and open orders." action={opsReadOnly ? <RequestButton area="purchasing" type="reorder" kind="primary" label="Ask to reorder" link="/purchasing" disabled={!picked.length} message={`Please reorder these products:\n${picked.map((r) => `- ${r.product.name}: ${qtyOf(r)} units${supOf(r) ? ` from ${db.suppliers.find((s) => s.id === supOf(r))?.name}` : ''}`).join('\n')}`} /> : can('purchasing', 'create') && <Btn kind="primary" icon="ClipboardPlus" disabled={!picked.length} onClick={build}>Create {picked.length ? `${picked.length} ${picked.length === 1 ? 'line' : 'lines'} as` : ''} draft orders</Btn>}>
      <div className="tb-wrap">
        <table className="table">
          <thead><tr><th aria-label="Include" /><th>Product</th><th className="r">In stock</th><th className="r">Reorder at</th><th className="r">On order</th><th className="r">Sold in 30 days</th><th className="r">Days left</th><th>Supplier</th><th className="r">Buy</th></tr></thead>
          <tbody>
            {plan.map((r) => (
              <tr key={r.product.id}>
                <td><input type="checkbox" aria-label={`Include ${r.product.name}`} checked={!off[r.product.id] && qtyOf(r) > 0} disabled={qtyOf(r) <= 0} onChange={(e) => setOff((p) => ({ ...p, [r.product.id]: !e.target.checked }))} /></td>
                <td><div className="strong">{r.product.name}</div><div className="small muted">{r.product.sku}</div></td>
                <td className="r num">{r.product.stock}</td>
                <td className="r num">{r.product.reorder}</td>
                <td className="r num">{r.onOrder || '—'}</td>
                <td className="r num">{r.sold || '—'}</td>
                <td className="r num">{r.daysLeft == null ? '—' : r.daysLeft}</td>
                <td><select className="select" disabled={!opsReadOnly && !can('purchasing', 'create')} aria-label={`Supplier for ${r.product.name}`} value={supOf(r)} onChange={(e) => setChosen((p) => ({ ...p, [r.product.id]: e.target.value }))}><option value="">Choose…</option>{(db.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td className="r"><input className="input" style={{ width: 76, textAlign: 'right' }} type="number" min="0" aria-label={`Quantity of ${r.product.name}`} value={qtys[r.product.id] ?? r.qty} onChange={(e) => setQtys((p) => ({ ...p, [r.product.id]: Math.max(0, Number(e.target.value) || 0) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Purchasing() {
  const { db, t, can, sec, create, update, remove, toast, opsReadOnly } = useStore();
  const [pref, setTab] = useState('orders');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const orders = db.purchaseOrders || [];
  const suppliers = db.suppliers || [];
  const plan = reorderPlan(db);
  const open = orders.filter((o) => OPEN_PO.includes(o.status));
  const late = orders.filter((o) => ['Sent', 'Partly received'].includes(o.status) && o.expected < today());
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || 'Removed supplier';
  const tabs = [{ k: 'orders', label: 'Purchase orders', count: orders.length }, { k: 'reorder', label: 'Reorder suggestions', count: plan.length }, { k: 'suppliers', label: 'Suppliers', count: suppliers.length }].filter((x) => sec('purchasing', x.k));
  const tab = firstAllowed(tabs, pref);
  const current = orders.find((o) => o.id === openId);
  return (
    <div>
      <PageHead title={t('purchasing')} sub={opsReadOnly ? 'See purchase orders, suppliers and what needs reordering' : 'Buy stock from suppliers, receive it and see what to reorder'}>
        {tab === 'suppliers' && can('purchasing', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({ leadDays: 7 })}>New supplier</Btn>}
        {tab !== 'suppliers' && can('purchasing', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setCreating(true)}>New purchase order</Btn>}
      </PageHead>
      <OpsSource entities={['purchaseOrders', 'products']} what="Purchase orders" />
      {sec('purchasing', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Open orders" value={moneyK(sum(open, (o) => o.total))} note={`${open.length} orders`} icon="ClipboardList" />
        <Kpi label="Units on the way" value={num(sum(open.flatMap((o) => o.items), (i) => i.qty - (i.received || 0)))} icon="Truck" />
        <Kpi label="Late deliveries" value={late.length} note="Past the expected date" icon="Clock" />
        <Kpi label="To reorder" value={plan.length} note="At or below reorder level" icon="TriangleAlert" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <OpsNote>Reordering is done outside this CRM. You can view it here, choose what's needed and notify the purchasing team. The quantities and suppliers you pick only go into the message.</OpsNote>
      {!tab && <NoSections />}
      {tab === 'orders' && <DataTable key="po" rows={orders} exportName="purchase-orders" dateOf={(o) => o.date} initialSort={{ k: 'date', dir: 'desc' }} onRow={(o) => setOpenId(o.id)} searchPlaceholder="Search purchase orders…"
        statusTabs={{ options: ['Draft', 'Awaiting approval', 'Approved', 'Sent', 'Partly received', 'Received', 'Cancelled'], get: (o) => o.status }}
        filters={[{ k: 'supplier', label: 'Supplier', get: (o) => o.supplierId, options: suppliers.map((s) => ({ value: s.id, label: s.name })) }]}
        columns={[
          { k: 'number', label: 'Order', render: (o) => <span className="strong">{o.number}</span> },
          { k: 'supplier', label: 'Supplier', value: (o) => supName(o.supplierId) },
          { k: 'status', label: 'Status', render: (o) => <Badge>{o.status}</Badge> },
          { k: 'date', label: 'Date', nowrap: true, render: (o) => fmtDate(o.date) },
          { k: 'expected', label: 'Expected', nowrap: true, render: (o) => fmtDate(o.expected) },
          { k: 'got', label: 'Received', align: 'r', value: (o) => sum(o.items, (i) => i.received || 0), render: (o) => `${sum(o.items, (i) => i.received || 0)} / ${sum(o.items, (i) => i.qty)}` },
          { k: 'total', label: 'Amount', align: 'r', render: (o) => money(o.total) },
        ]} />}
      {tab === 'reorder' && <ReorderTab onCreated={() => setTab('orders')} />}
      {tab === 'suppliers' && <DataTable key="sup" rows={suppliers} exportName="suppliers" onRow={can('purchasing', 'edit') ? (s) => setEdit(s) : undefined} searchPlaceholder="Search suppliers…"
        columns={[
          { k: 'name', label: 'Supplier', render: (s) => <div><div className="strong">{s.name}</div><div className="small muted">{s.contact}</div></div> },
          { k: 'email', label: 'Email' },
          { k: 'phone', label: 'Phone' },
          { k: 'city', label: 'City' },
          { k: 'leadDays', label: 'Delivery days', align: 'r' },
          { k: 'products', label: 'Products', align: 'r', value: (s) => db.products.filter((p) => p.supplier === s.name).length },
          { k: 'open', label: 'Open orders', align: 'r', value: (s) => sum(open.filter((o) => o.supplierId === s.id), (o) => o.total), render: (s) => money(sum(open.filter((o) => o.supplierId === s.id), (o) => o.total)) },
          ...(can('purchasing', 'edit') ? [{ k: 'del', label: '', sort: false, stop: true, value: () => '', render: (s) => <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${s.name}`} onClick={() => setDel(s)} /> }] : []),
        ]} />}
      {creating && <PoForm onClose={() => setCreating(false)} onCreated={(id) => { setTab('orders'); setOpenId(id); }} />}
      {current && <PoDrawer po={current} onClose={() => setOpenId(null)} />}
      {edit && <RecordModal title={edit.id ? 'Edit supplier' : 'New supplier'} fields={supplierFields} initial={edit} onClose={() => setEdit(null)} onSave={(v) => {
        if (edit.id) update('suppliers', edit.id, v); else create('suppliers', v);
        toast(edit.id ? 'Supplier updated' : 'Supplier added');
        setEdit(null);
      }} />}
      {del && <Confirm title={`Delete ${del.name}?`} text={orders.some((o) => o.supplierId === del.id) ? 'Past purchase orders stay, but will show this supplier as removed.' : 'This supplier has no purchase orders.'} onClose={() => setDel(null)} onConfirm={() => { remove('suppliers', del.id); toast('Supplier deleted'); }} />}
    </div>
  );
}
