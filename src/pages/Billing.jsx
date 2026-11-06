import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, DataTable, Drawer, FormFields, Kpi, Modal, NoSections, PageHead, Tabs, UserChip, firstAllowed, validate } from '../ui';
import { DeliveryCheck, OpsSource, RequestButton, WatchButton } from './OpsExtras';
import { NewOrderItems, NotifyButton, OpsNote, cleanItems, newLine } from '../shared';
import { NO_RATE, addDays, discountIssue, docCur, docMoney, fmtDate, fxFields, inDoc, lineTotal, money, moneyIn, moneyK, nextNo, rateOf, repriceItems, round2, sum, today } from '../util';
import { CreditDialog, CreditNotes, Receivables, RecurringTab, StatementModal } from './BillingExtras';
import { TaxSummary } from './TaxExtras';
import { docColumns } from '../shared';
import { taxesFor } from '../engine';
import { DocPrint } from '../extras';


function DocForm({ kind, onClose }) {
  const { db, me, role, create, toast, scope } = useStore();
  const isQuote = kind === 'quote';
  const isPlan = kind === 'recurring';
  const [v, setV] = useState(isPlan ? { title: '', companyId: '', next: today(), freq: 'Monthly', dueDays: 30, ownerId: me.id, currency: db.settings.currency || 'USD' } : { companyId: '', date: today(), [isQuote ? 'expiry' : 'due']: addDays(30), ownerId: me.id, dealId: '', currency: db.settings.currency || 'USD' });
  const [items, setItems] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const fields = isPlan ? [
    { k: 'title', label: 'Plan name', req: true, full: true, placeholder: 'e.g. Monthly support' },
    { k: 'companyId', label: 'Customer', type: 'company', req: true },
    { k: 'freq', label: 'Repeats', type: 'select', noBlank: true, options: ['Monthly', 'Quarterly', 'Yearly'] },
    { k: 'next', label: 'First invoice date', type: 'date', req: true },
    { k: 'dueDays', label: 'Payment due after (days)', type: 'number', min: 0 },
    { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: role === 'sales' },
  ] : [
    { k: 'companyId', label: 'Customer', type: 'company', req: true },
    { k: 'date', label: 'Date', type: 'date', req: true },
    { k: isQuote ? 'expiry' : 'due', label: isQuote ? 'Valid until' : 'Due date', type: 'date', req: true },
    { k: 'ownerId', label: 'Salesperson', type: 'user', req: true, hide: role === 'sales' },
  ];
  fields.splice(isPlan ? 2 : 1, 0, { k: 'currency', label: 'Currency', type: 'select', noBlank: true, list: 'currency' });
  const mi = (n) => moneyIn(v.currency, n);
  const change = (k, x) => {
    const patch = { [k]: x };
    if (k === 'companyId') patch.currency = db.companies.find((c) => c.id === x)?.currency || db.settings.currency || 'USD';
    if (patch.currency && patch.currency !== v.currency) setItems(repriceItems(items, v.currency, patch.currency));
    setV((p) => ({ ...p, ...patch }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const lines = cleanItems(items);
  const customer = db.companies.find((c) => c.id === v.companyId);
  const taxes = taxesFor(lines, db, customer);
  const total = taxes.taxable;
  const tax = taxes.tax;
  const save = () => {
    const e = validate(fields, v);
    if (!rateOf(v.currency)) e.currency = NO_RATE;
    if (!lines.length) e.items = 'Add at least one product';
    else if (discountIssue(lines, db.settings, role)) e.items = discountIssue(lines, db.settings, role);
    setErrors(e);
    if (Object.keys(e).length) return;
    const fx = fxFields(v.currency);
    const baseLines = lines.map((l) => ({ ...l, price: l.price / (fx.fxRate || 1) }));
    const baseTaxes = taxesFor(baseLines, db, customer);
    const baseTotal = baseTaxes.taxable + baseTaxes.tax;
    if (isPlan) {
      create('recurringInvoices', { ...v, ...fx, dueDays: Number(v.dueDays) || 30, items: baseLines, active: true, count: 0 });
      toast(`${v.title} will invoice ${v.freq.toLowerCase()} from ${fmtDate(v.next)}`);
      onClose();
      return;
    }
    const rec = isQuote
      ? { ...v, ...fx, number: nextNo(db.quotes, 'QT-', 4500), items: baseLines, taxes: baseTaxes, total: baseTotal, status: 'Draft' }
      : { ...v, ...fx, number: nextNo(db.invoices, db.settings.invoicePrefix, 5200), items: baseLines, taxes: baseTaxes, total: baseTotal, paid: 0, status: 'Sent', orderId: '' };
    create(isQuote ? 'quotes' : 'invoices', rec);
    toast(`${isQuote ? 'Quote' : 'Invoice'} ${rec.number} created`);
    onClose();
  };
  return (
    <Modal size="lg" title={isPlan ? 'New recurring invoice' : isQuote ? 'New quote' : 'New invoice'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={change} />
        <NewOrderItems items={items} setItems={setItems} customer={customer} rate={rateOf(v.currency)} />
        {errors.items && <div className="error-text">{errors.items}</div>}
        <div style={{ marginInlineStart: 'auto', width: 240 }} className="stack-s num">
          <div className="row between"><span className="muted">Subtotal</span><span>{mi(total)}</span></div>
          <div className="row between"><span className="muted">{db.settings.taxName || 'Tax'}{taxes.rate != null ? ` (${taxes.rate}%)` : ''}</span><span>{mi(tax)}</span></div>
          {taxes.reverseCharge && <div className="small muted">Reverse charge, so no tax</div>}
          {taxes.inclusive && <div className="small muted">Prices include tax</div>}
          <div className="row between strong"><span>Total</span><span>{mi(total + tax)}</span></div>
        </div>
      </div>
    </Modal>
  );
}
function PaymentDialog({ invoice, onClose }) {
  const { recordPayment, toast } = useStore();
  const due = invoice.total - (invoice.paid || 0);
  const dueDoc = round2(inDoc(invoice, due));
  const [v, setV] = useState({ amount: dueDoc, method: 'Bank transfer', date: today() });
  const [errors, setErrors] = useState({});
  const fields = [
    { k: 'amount', label: `Amount in ${docCur(invoice)}`, type: 'number', min: 0.01, req: true, hint: `${docMoney(invoice, due)} due` },
    { k: 'date', label: 'Payment date', type: 'date', req: true },
    { k: 'method', label: 'Method', type: 'select', noBlank: true, list: 'paymentMethod' },
  ];
  const save = () => {
    const e = validate(fields, v);
    if (Number(v.amount) > dueDoc) e.amount = `Can't be more than the ${docMoney(invoice, due)} due`;
    setErrors(e);
    if (Object.keys(e).length) return;
    recordPayment(invoice.id, Math.abs(Number(v.amount) - dueDoc) < 0.005 ? due : (Number(v.amount) / dueDoc) * due, v.method, v.date);
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
  const { db, update, placeOrder, create, can, toast, companyName, sendEmail, opsReadOnly } = useStore();
  const [credit, setCredit] = useState(false);
  const dm = (n) => docMoney(doc, n);
  const isQuote = kind === 'quote';
  const credits = isQuote ? [] : (db.creditNotes || []).filter((x) => x.invoiceId === doc.id);
  const duplicate = () => { const n = create('quotes', { ...doc, id: undefined, createdAt: undefined, number: nextNo(db.quotes, 'QT-', 4500), date: today(), expiry: addDays(30), status: 'Draft' }); toast(`Copied to ${n.number}`); onClose(); };
  const c = db.companies.find((x) => x.id === doc.companyId);
  const toOrder = () => {
    if (!doc.items.length) { toast('Add line items to this quote before converting it.'); return; }
    const o = placeOrder({ companyId: doc.companyId, ownerId: doc.ownerId, date: today(), channel: 'Direct', currency: doc.currency || '', fxRate: doc.fxRate || 1, items: doc.items, total: sum(doc.items, lineTotal), status: 'Pending' });
    update('quotes', doc.id, { status: 'Accepted' });
    toast(`Quote converted to order ${o.number}`);
    onClose();
  };
  return (
    <Drawer title={doc.number} onClose={onClose} actions={<><WatchButton entity={isQuote ? 'quotes' : 'invoices'} id={doc.id} />{isQuote && can('billing', 'create') && <Btn sm icon="Copy" onClick={duplicate}>Copy</Btn>}<Btn sm icon="Printer" onClick={() => window.print()}>Print or save PDF</Btn>{can('emails', 'create') && c?.email && <Btn sm icon="Send" onClick={() => { sendEmail({ to: c.email, subject: `${isQuote ? 'Quote' : 'Invoice'} ${doc.number}`, body: `Please find ${doc.number} for ${dm(doc.total)}.`, ownerId: doc.ownerId, relatedType: 'company', relatedId: c.id }); toast(`Saved as sent to ${c.email}. No real email was sent.`); }}>Email</Btn>}</>} footer={isQuote ? (opsReadOnly ? <RequestButton area="billing" type="quote" record={{ entity: isQuote ? 'quotes' : 'invoices', id: doc.id, label: doc.number, route: '/billing', companyId: doc.companyId }} kind="primary" label="Ask for a change" link="/billing" message={`About quote ${doc.number} for ${companyName(doc.companyId)} (${doc.status}): `} /> :
      can('billing', 'edit') && doc.status !== 'Accepted' && <>
        {doc.status === 'Draft' && <Btn onClick={() => { update('quotes', doc.id, { status: 'Sent' }); toast('Marked as sent'); }}>Mark as sent</Btn>}
        {doc.status !== 'Rejected' && <Btn onClick={() => { update('quotes', doc.id, { status: 'Rejected' }); toast('Quote rejected'); }}>Reject</Btn>}
        <Btn kind="primary" onClick={toOrder}>Convert to order</Btn>
      </>
    ) : opsReadOnly ? <RequestButton area="billing" type="chase" record={{ entity: isQuote ? 'quotes' : 'invoices', id: doc.id, label: doc.number, route: '/billing', companyId: doc.companyId }} kind="primary" label="Ask the billing team" link="/billing" message={`About invoice ${doc.number} for ${companyName(doc.companyId)} (balance ${dm(doc.total - (doc.paid || 0))}): `} /> : (can('billing', 'invoice') && <>
      {doc.status !== 'Credited' && sum(credits, (x) => x.total) < doc.total && <Btn icon="Undo2" onClick={() => setCredit(true)}>Return or credit</Btn>}
      {doc.status !== 'Paid' && doc.status !== 'Credited' && <Btn kind="primary" icon="Banknote" onClick={onPay}>Record payment</Btn>}
    </>)}>
      <DocPrint doc={doc} kind={kind} />
      <div className="stack">
        <div className="row between"><Badge>{doc.status}</Badge><span className="strong num" style={{ fontSize: 18 }}>{dm(doc.total)}</span></div>
        <dl className="dl">
          <dt>Bill to</dt><dd><Link to={`/customers/${doc.companyId}`}>{companyName(doc.companyId)}</Link><div className="small muted">{[c?.address, c?.city, c?.country].filter(Boolean).join(', ')}</div></dd>
          <dt>Date</dt><dd>{fmtDate(doc.date)}</dd>
          <dt>{isQuote ? 'Valid until' : 'Due date'}</dt><dd>{fmtDate(isQuote ? doc.expiry : doc.due)}</dd>
          <dt>Salesperson</dt><dd><UserChip id={doc.ownerId} /></dd>
          {doc.currency && doc.currency !== db.settings.currency && <><dt>In main currency</dt><dd className="num">{money(doc.total)}<div className="small muted">Rate on this document: {db.settings.currency} 1 = {doc.currency} {Number((doc.fxRate || 1).toPrecision(6))}</div></dd></>}
          {!isQuote && <><dt>Paid</dt><dd className="num">{dm(doc.paid || 0)}</dd><dt>Balance</dt><dd className="num strong">{dm(doc.total - (doc.paid || 0))}</dd></>}
          {!!doc.credited && <><dt>Paid includes credit</dt><dd className="num">{dm(doc.credited)}</dd></>}
          {!!credits.length && <><dt>Credit notes</dt><dd>{credits.map((x) => x.number).join(', ')}</dd></>}
        </dl>
        {!isQuote && doc.total > (doc.paid || 0) && can('emails', 'create') && c?.email && <div><Btn sm icon="BellRing" onClick={() => { sendEmail({ to: c.email, subject: `Payment reminder: ${doc.number}`, body: `${dm(doc.total - (doc.paid || 0))} is due on ${fmtDate(doc.due)} for ${doc.number}.`, ownerId: doc.ownerId, relatedType: 'company', relatedId: c.id }); toast(`Reminder saved as sent to ${c.email}. No real email was sent.`); }}>Send payment reminder</Btn></div>}
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Off</th><th className="r">Subtotal</th></tr></thead>
            <tbody>{doc.items.length ? doc.items.map((i) => <tr key={i.productId + i.qty}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{dm(i.price)}</td><td className="r num">{i.discount ? `${i.discount}%` : '—'}</td><td className="r num">{dm(lineTotal(i))}</td></tr>) : <tr><td colSpan={5} className="muted">No line items yet.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      {credit && <CreditDialog invoice={doc} onClose={() => setCredit(false)} />}
    </Drawer>
  );
}

export default function Billing() {
  const { db, role, t, sec, scope, can, companyName, userName, optionsOf } = useStore();
  const [pref, setTab] = useState(role === 'sales' ? 'quotes' : 'invoices');
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState(null);
  const [statement, setStatement] = useState(false);
  const [stCustomer, setStCustomer] = useState('');
  const quotes = scope(db.quotes);
  const invoices = scope(db.invoices);
  const payments = scope(db.payments);
  const unpaid = sum(invoices, (i) => i.total - (i.paid || 0));
  const billTabs = [{ k: 'invoices', label: 'Invoices', count: invoices.length }, { k: 'quotes', label: 'Quotes', count: quotes.length }, ...(can('billing', 'invoice', true) ? [{ k: 'payments', label: 'Payments', count: payments.length }, { k: 'credits', label: 'Credit notes', count: scope(db.creditNotes || [], 'billing').length }, { k: 'recurring', label: 'Recurring', count: scope(db.recurringInvoices || [], 'billing').length }, { k: 'receivables', label: 'Receivables' }, { k: 'taxes', label: 'Tax summary' }] : [])].filter((x) => sec('billing', x.k));
  const tab = firstAllowed(billTabs, pref);
  const curDoc = open && (open.kind === 'quote' ? db.quotes : db.invoices).find((x) => x.id === open.id);
  const statusCol = { k: 'status', label: 'Status', render: (x) => <Badge>{x.status}</Badge> };
  const custCol = { k: 'customer', label: 'Customer', value: (x) => companyName(x.companyId) };
  const ownerCol = { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (x) => userName(x.ownerId), render: (x) => <UserChip id={x.ownerId} /> };
  return (
    <div>
      <PageHead title={t('billing')} sub={`Totals are in ${db.settings.currency}. Each document shows its own currency.`}>
        {tab === 'quotes' && can('billing', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('quote')}>New quote</Btn>}
        {tab === 'invoices' && can('billing', 'invoice') && <Btn kind="primary" icon="Plus" onClick={() => setModal('invoice')}>New invoice</Btn>}
        {tab === 'recurring' && can('billing', 'invoice') && <Btn kind="primary" icon="Plus" onClick={() => setModal('recurring')}>New recurring invoice</Btn>}
        {tab === 'receivables' && <Btn icon="FileText" onClick={() => setStatement(true)}>Customer statement</Btn>}
      </PageHead>
      <OpsSource entities={['payments', 'invoices']} what="Quotes, invoices and payments" />
      {sec('billing', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Invoiced" value={moneyK(sum(invoices, (i) => i.total))} note={`${invoices.length} invoices`} icon="Receipt" />
        <Kpi label="Collected" value={moneyK(sum(invoices, (i) => (i.paid || 0) - (i.credited || 0)))} icon="Banknote" />
        <Kpi label="Outstanding" value={moneyK(unpaid)} note={`${invoices.filter((i) => i.status === 'Overdue').length} overdue`} icon="Hourglass" />
        <Kpi label="Open quotes" value={moneyK(sum(quotes.filter((q) => ['Draft', 'Sent'].includes(q.status)), (q) => q.total))} note={`${quotes.filter((q) => ['Draft', 'Sent'].includes(q.status)).length} quotes`} icon="FileText" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={billTabs} />
      <OpsNote>Quotes, invoices and payments are handled outside this CRM. You can view them here, and open one to notify the team if something needs changing.</OpsNote>
      {!tab && <NoSections />}
      {tab === 'invoices' && <DataTable key="i" rows={invoices} exportName="invoices" dateOf={(i) => i.date} initialSort={{ k: 'date', dir: 'desc' }} onRow={(i) => setOpen({ kind: 'invoice', id: i.id })}
        statusTabs={{ options: ['Sent', 'Partially paid', 'Paid', 'Overdue', 'Credited'], get: (i) => i.status }}
        columns={[{ k: 'number', label: 'Invoice', render: (i) => <span className="strong">{i.number}</span> }, custCol, { k: 'date', label: 'Date', nowrap: true, render: (i) => fmtDate(i.date) }, { k: 'due', label: 'Due', nowrap: true, render: (i) => fmtDate(i.due) }, statusCol, ownerCol, { k: 'total', label: 'Total', align: 'r', render: (i) => docMoney(i, i.total) }, { k: 'balance', label: 'Balance', align: 'r', value: (i) => i.total - (i.paid || 0), render: (i) => docMoney(i, i.total - (i.paid || 0)) }, ...docColumns((i) => i.total)]} />}
      {tab === 'quotes' && <DataTable key="q" rows={quotes} exportName="quotes" dateOf={(q) => q.date} initialSort={{ k: 'date', dir: 'desc' }} onRow={(q) => setOpen({ kind: 'quote', id: q.id })}
        statusTabs={{ options: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'], get: (q) => q.status }}
        columns={[{ k: 'number', label: 'Quote', render: (q) => <span className="strong">{q.number}</span> }, custCol, { k: 'date', label: 'Date', nowrap: true, render: (q) => fmtDate(q.date) }, { k: 'expiry', label: 'Valid until', nowrap: true, render: (q) => fmtDate(q.expiry) }, statusCol, ownerCol, { k: 'total', label: 'Total', align: 'r', render: (q) => docMoney(q, q.total) }, ...docColumns((q) => q.total)]} />}
      {tab === 'payments' && <DataTable key="p" rows={payments} exportName="payments" dateOf={(p) => p.date} initialSort={{ k: 'date', dir: 'desc' }}
        filters={[{ k: 'method', label: 'Method', get: (p) => p.method, options: optionsOf('paymentMethod') }]}
        columns={[{ k: 'number', label: 'Payment', render: (p) => <span className="strong">{p.number}</span> }, custCol, { k: 'invoice', label: 'Invoice', value: (p) => db.invoices.find((i) => i.id === p.invoiceId)?.number }, { k: 'date', label: 'Date', nowrap: true, render: (p) => fmtDate(p.date) }, { k: 'method', label: 'Method' }, { k: 'amount', label: 'Amount', align: 'r', render: (p) => docMoney(p, p.amount) }]} />}
      {tab === 'credits' && <CreditNotes />}
      {tab === 'recurring' && <RecurringTab />}
      {tab === 'receivables' && <Receivables />}
      {tab === 'taxes' && <TaxSummary />}
      {statement && !stCustomer && <Modal size="sm" title="Customer statement" onClose={() => setStatement(false)}>
        <div className="field"><label className="label" htmlFor="st-customer">Customer</label><select id="st-customer" className="select" value="" onChange={(e) => setStCustomer(e.target.value)}><option value="">Choose a customer…</option>{scope(db.companies, 'customers').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </Modal>}
      {statement && stCustomer && <StatementModal companyId={stCustomer} onClose={() => { setStatement(false); setStCustomer(''); }} />}
      {modal && <DocForm kind={modal} onClose={() => setModal(null)} />}
      {curDoc && <DocDrawer doc={curDoc} kind={open.kind} onClose={() => setOpen(null)} onPay={() => setPay(curDoc)} />}
      {pay && <PaymentDialog invoice={pay} onClose={() => setPay(null)} />}
    </div>
  );
}
