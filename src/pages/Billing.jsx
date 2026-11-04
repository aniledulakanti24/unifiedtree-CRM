import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, DataTable, Drawer, FormFields, Kpi, Modal, NoSections, PageHead, Tabs, UserChip, firstAllowed, validate } from '../ui';
import { NewOrderItems, cleanItems, newLine } from '../shared';
import { addDays, fmtDate, money, moneyK, sum, today } from '../util';

function DocForm({ kind, onClose }) {
  const { db, me, role, create, toast, scope } = useStore();
  const isQuote = kind === 'quote';
  const [v, setV] = useState({ companyId: '', date: today(), [isQuote ? 'expiry' : 'due']: addDays(30), ownerId: me.id, dealId: '' });
  const [items, setItems] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'companyId', label: 'Customer', type: 'company', req: true },
    { k: 'date', label: 'Date', type: 'date', req: true },
    { k: isQuote ? 'expiry' : 'due', label: isQuote ? 'Valid until' : 'Due date', type: 'date', req: true },
    { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: role === 'sales' },
  ];
  const lines = cleanItems(items);
  const total = sum(lines, (x) => x.qty * x.price);
  const tax = Math.round(total * (db.settings.taxRate / 100));
  const save = () => {
    const e = validate(fields, v);
    if (!lines.length) e.items = 'Add at least one product';
    setErrors(e);
    if (Object.keys(e).length) return;
    const rec = isQuote
      ? { ...v, number: `QT-${4500 + db.quotes.length}`, items: lines, total: total + tax, status: 'Draft' }
      : { ...v, number: `${db.settings.invoicePrefix}${5300 + db.invoices.length}`, items: lines, total: total + tax, paid: 0, status: 'Sent', orderId: '' };
    create(isQuote ? 'quotes' : 'invoices', rec);
    toast(`${isQuote ? 'Quote' : 'Invoice'} ${rec.number} created`);
    onClose();
  };
  return (
    <Modal size="lg" title={isQuote ? 'New quote' : 'New invoice'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
        <NewOrderItems items={items} setItems={setItems} />
        {errors.items && <div className="error-text">{errors.items}</div>}
        <div style={{ marginInlineStart: 'auto', width: 240 }} className="stack-s num">
          <div className="row between"><span className="muted">Subtotal</span><span>{money(total)}</span></div>
          <div className="row between"><span className="muted">Tax ({db.settings.taxRate}%)</span><span>{money(tax)}</span></div>
          <div className="row between strong"><span>Total</span><span>{money(total + tax)}</span></div>
        </div>
      </div>
    </Modal>
  );
}
function PaymentDialog({ invoice, onClose }) {
  const { recordPayment, toast } = useStore();
  const due = invoice.total - (invoice.paid || 0);
  const [v, setV] = useState({ amount: due, method: 'Bank transfer', date: today() });
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'amount', label: 'Amount', type: 'number', min: 0.01, req: true, hint: `${money(due)} due` },
    { k: 'date', label: 'Payment date', type: 'date', req: true },
    { k: 'method', label: 'Method', type: 'select', noBlank: true, list: 'paymentMethod' },
  ];
  const save = () => {
    const e = validate(fields, v);
    if (v.amount > due) e.amount = `Can't be more than the ${money(due)} due`;
    setErrors(e);
    if (Object.keys(e).length) return;
    recordPayment(invoice.id, Number(v.amount), v.method, v.date);
    toast('Payment recorded');
    onClose();
  };
  return (
    <Modal size="sm" title={`Record payment for ${invoice.number}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Record payment</Btn></>}>
      <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
    </Modal>
  );
}
function DocDrawer({ doc, kind, onClose, onPay }) {
  const { db, update, placeOrder, can, toast, companyName } = useStore();
  const isQuote = kind === 'quote';
  const c = db.companies.find((x) => x.id === doc.companyId);
  const toOrder = () => {
    if (!doc.items.length) { toast('Add line items to this quote before converting it.'); return; }
    const o = placeOrder({ companyId: doc.companyId, ownerId: doc.ownerId, date: today(), channel: 'Direct', items: doc.items, total: doc.total, status: 'Pending' });
    update('quotes', doc.id, { status: 'Accepted' });
    toast(`Quote converted to order ${o.number}`);
    onClose();
  };
  return (
    <Drawer title={doc.number} onClose={onClose} actions={<Btn sm icon="Printer" onClick={() => window.print()}>Print</Btn>} footer={isQuote ? (
      can('billing', 'edit') && doc.status !== 'Accepted' && <>
        {doc.status === 'Draft' && <Btn onClick={() => { update('quotes', doc.id, { status: 'Sent' }); toast('Marked as sent'); }}>Mark as sent</Btn>}
        {doc.status !== 'Rejected' && <Btn onClick={() => { update('quotes', doc.id, { status: 'Rejected' }); toast('Quote rejected'); }}>Reject</Btn>}
        <Btn kind="primary" onClick={toOrder}>Convert to order</Btn>
      </>
    ) : (doc.status !== 'Paid' && can('billing', 'invoice') && <Btn kind="primary" icon="Banknote" onClick={onPay}>Record payment</Btn>)}>
      <div className="stack">
        <div className="row between"><Badge>{doc.status}</Badge><span className="strong num" style={{ fontSize: 18 }}>{money(doc.total)}</span></div>
        <dl className="dl">
          <dt>Bill to</dt><dd><Link to={`/customers/${doc.companyId}`}>{companyName(doc.companyId)}</Link><div className="small muted">{[c?.address, c?.city, c?.country].filter(Boolean).join(', ')}</div></dd>
          <dt>Date</dt><dd>{fmtDate(doc.date)}</dd>
          <dt>{isQuote ? 'Valid until' : 'Due date'}</dt><dd>{fmtDate(isQuote ? doc.expiry : doc.due)}</dd>
          <dt>Salesperson</dt><dd><UserChip id={doc.ownerId} /></dd>
          {!isQuote && <><dt>Paid</dt><dd className="num">{money(doc.paid || 0)}</dd><dt>Balance</dt><dd className="num strong">{money(doc.total - (doc.paid || 0))}</dd></>}
        </dl>
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Subtotal</th></tr></thead>
            <tbody>{doc.items.length ? doc.items.map((i) => <tr key={i.productId + i.qty}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{money(i.price)}</td><td className="r num">{money(i.qty * i.price)}</td></tr>) : <tr><td colSpan={4} className="muted">No line items yet.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

export default function Billing() {
  const { db, role, t, sec, scope, can, companyName, userName, optionsOf } = useStore();
  const [pref, setTab] = useState(role === 'sales' ? 'quotes' : 'invoices');
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState(null);
  const quotes = scope(db.quotes);
  const invoices = scope(db.invoices);
  const payments = scope(db.payments);
  const unpaid = sum(invoices, (i) => i.total - (i.paid || 0));
  const billTabs = [{ k: 'invoices', label: 'Invoices', count: invoices.length }, { k: 'quotes', label: 'Quotes', count: quotes.length }, ...(can('billing', 'invoice') ? [{ k: 'payments', label: 'Payments', count: payments.length }] : [])].filter((x) => sec('billing', x.k));
  const tab = firstAllowed(billTabs, pref);
  const curDoc = open && (open.kind === 'quote' ? db.quotes : db.invoices).find((x) => x.id === open.id);
  const statusCol = { k: 'status', label: 'Status', render: (x) => <Badge>{x.status}</Badge> };
  const custCol = { k: 'customer', label: 'Customer', value: (x) => companyName(x.companyId) };
  const ownerCol = { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (x) => userName(x.ownerId), render: (x) => <UserChip id={x.ownerId} /> };
  return (
    <div>
      <PageHead title={t('billing')} >
        {tab === 'quotes' && can('billing', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('quote')}>New quote</Btn>}
        {tab === 'invoices' && can('billing', 'invoice') && <Btn kind="primary" icon="Plus" onClick={() => setModal('invoice')}>New invoice</Btn>}
      </PageHead>
      {sec('billing', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Invoiced" value={moneyK(sum(invoices, (i) => i.total))} note={`${invoices.length} invoices`} icon="Receipt" />
        <Kpi label="Collected" value={moneyK(sum(invoices, (i) => i.paid || 0))} icon="Banknote" />
        <Kpi label="Outstanding" value={moneyK(unpaid)} note={`${invoices.filter((i) => i.status === 'Overdue').length} overdue`} icon="Hourglass" />
        <Kpi label="Open quotes" value={moneyK(sum(quotes.filter((q) => ['Draft', 'Sent'].includes(q.status)), (q) => q.total))} note={`${quotes.filter((q) => ['Draft', 'Sent'].includes(q.status)).length} quotes`} icon="FileText" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={billTabs} />
      {!tab && <NoSections />}
      {tab === 'invoices' && <DataTable key="i" rows={invoices} exportName="invoices" initialSort={{ k: 'date', dir: 'desc' }} onRow={(i) => setOpen({ kind: 'invoice', id: i.id })}
        statusTabs={{ options: ['Sent', 'Partially paid', 'Paid', 'Overdue'], get: (i) => i.status }}
        columns={[{ k: 'number', label: 'Invoice', render: (i) => <span className="strong">{i.number}</span> }, custCol, { k: 'date', label: 'Date', nowrap: true, render: (i) => fmtDate(i.date) }, { k: 'due', label: 'Due', nowrap: true, render: (i) => fmtDate(i.due) }, statusCol, ownerCol, { k: 'total', label: 'Total', align: 'r', render: (i) => money(i.total) }, { k: 'balance', label: 'Balance', align: 'r', value: (i) => i.total - (i.paid || 0), render: (i) => money(i.total - (i.paid || 0)) }]} />}
      {tab === 'quotes' && <DataTable key="q" rows={quotes} exportName="quotes" initialSort={{ k: 'date', dir: 'desc' }} onRow={(q) => setOpen({ kind: 'quote', id: q.id })}
        statusTabs={{ options: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'], get: (q) => q.status }}
        columns={[{ k: 'number', label: 'Quote', render: (q) => <span className="strong">{q.number}</span> }, custCol, { k: 'date', label: 'Date', nowrap: true, render: (q) => fmtDate(q.date) }, { k: 'expiry', label: 'Valid until', nowrap: true, render: (q) => fmtDate(q.expiry) }, statusCol, ownerCol, { k: 'total', label: 'Total', align: 'r', render: (q) => money(q.total) }]} />}
      {tab === 'payments' && <DataTable key="p" rows={payments} exportName="payments" initialSort={{ k: 'date', dir: 'desc' }}
        filters={[{ k: 'method', label: 'Method', get: (p) => p.method, options: optionsOf('paymentMethod') }]}
        columns={[{ k: 'number', label: 'Payment', render: (p) => <span className="strong">{p.number}</span> }, custCol, { k: 'invoice', label: 'Invoice', value: (p) => db.invoices.find((i) => i.id === p.invoiceId)?.number }, { k: 'date', label: 'Date', nowrap: true, render: (p) => fmtDate(p.date) }, { k: 'method', label: 'Method' }, { k: 'amount', label: 'Amount', align: 'r', render: (p) => money(p.amount) }]} />}
      {modal && <DocForm kind={modal} onClose={() => setModal(null)} />}
      {curDoc && <DocDrawer doc={curDoc} kind={open.kind} onClose={() => setOpen(null)} onPay={() => setPay(curDoc)} />}
      {pay && <PaymentDialog invoice={pay} onClose={() => setPay(null)} />}
    </div>
  );
}
