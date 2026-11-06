import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { Badge, Btn, Confirm, DataTable, Drawer, FormFields, Kpi, Modal } from '../ui';
import { NotifyButton, QtyLines } from '../shared';
import { RequestButton } from './OpsExtras';
import { AGE_BANDS, pickLines, receivablesOf, remaining, statementOf } from '../stock';
import { DocPrint } from '../extras';
import { addDays, docCur, docMoney, fmtDate, lineTotal, moneyIn, moneyK, rateFor, sum, today } from '../util';

// A credit note for returned goods or a billing correction.
export function CreditDialog({ invoice, onClose }) {
  const { db, issueCredit, toast } = useStore();
  const dm = (n) => docMoney(invoice, n);
  const earlier = (db.creditNotes || []).filter((c) => c.invoiceId === invoice.id);
  const rows = remaining(invoice.items || [], earlier.flatMap((c) => c.items || []));
  const hasLines = rows.length > 0;
  const creditedSoFar = sum(earlier, (c) => c.total);
  const [qtys, setQtys] = useState({});
  const [v, setV] = useState({ reason: '', date: today(), restock: true, warehouseId: db.warehouses[0]?.id || '', amount: '', note: '' });
  const [error, setError] = useState('');
  const lines = pickLines(rows, qtys);
  // Invoice totals include tax, so each line is credited with its share of the tax.
  const net = sum(invoice.items || [], lineTotal);
  const rate = net > 0 ? invoice.total / net : 1;
  const left = invoice.total - creditedSoFar;
  const amount = Math.min(left, hasLines ? Math.round(sum(lines, lineTotal) * rate * 100) / 100 : (Number(v.amount) || 0) / rateFor(invoice));
  const fields = [
    { k: 'reason', label: 'Reason', type: 'select', req: true, list: 'returnReason' },
    { k: 'date', label: 'Date', type: 'date', req: true },
    ...(hasLines ? [{ k: 'restock', label: 'Stock', type: 'check', text: 'Put the returned goods back into stock' }] : [{ k: 'amount', label: `Credit amount in ${docCur(invoice)}`, type: 'number', min: 0.01, req: true, hint: `Up to ${dm(left)}` }]),
    ...(hasLines && v.restock ? [{ k: 'warehouseId', label: 'Return to', type: 'select', noBlank: true, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) }] : []),
    { k: 'note', label: 'Note', type: 'textarea', full: true },
  ];
  const save = () => {
    if (!v.reason) { setError('Choose a reason.'); return; }
    if (amount <= 0) { setError(hasLines ? 'Enter a quantity to credit on at least one line.' : 'Enter an amount to credit.'); return; }
    const rec = issueCredit({ invoice, lines, amount, reason: v.reason, note: v.note, restock: hasLines && v.restock, warehouseId: v.warehouseId, date: v.date });
    toast(`Credit note ${rec.number} issued`);
    onClose();
  };
  return (
    <Modal title={`Credit note for ${invoice.number}`} onClose={onClose} footer={<><span className="grow strong num">Credit {dm(amount)}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Issue credit note</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={{}} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setError(''); }} />
        {hasLines && <QtyLines rows={rows} values={qtys} onChange={(x) => { setQtys(x); setError(''); }} doneLabel="Credited" inputLabel="Credit now" />}
        {invoice.total - (invoice.paid || 0) < amount && amount > 0 && <div className="small muted">{dm(amount - Math.max(0, invoice.total - (invoice.paid || 0)))} is more than the balance due, so it will show as a refund to pay.</div>}
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

function CreditDrawer({ note, onClose }) {
  const { update, can, toast, companyName, opsReadOnly } = useStore();
  const dm = (n) => docMoney(note, n);
  return (
    <Drawer title={note.number} onClose={onClose} actions={<Btn sm icon="Printer" onClick={() => window.print()}>Print or save PDF</Btn>} footer={opsReadOnly ? <RequestButton area="billing" type="credit" record={{ entity: 'creditNotes', id: note.id, label: note.number, route: '/billing', companyId: note.companyId }} kind="primary" label="Ask the billing team" link="/billing" message={`About credit note ${note.number} for ${companyName(note.companyId)}: `} /> : note.status === 'Refund due' && can('billing', 'invoice') && <Btn kind="primary" icon="Banknote" onClick={() => { update('creditNotes', note.id, { status: 'Refunded', refundedAt: today() }); toast('Marked as refunded. No money was moved.'); }}>Mark as refunded</Btn>}>
      <DocPrint doc={note} kind="credit" />
      <div className="stack">
        <div className="row between"><Badge>{note.status}</Badge><span className="strong num" style={{ fontSize: 18 }}>{dm(note.total)}</span></div>
        <dl className="dl">
          <dt>Customer</dt><dd>{companyName(note.companyId)}</dd>
          <dt>Invoice</dt><dd>{note.invoiceNumber}</dd>
          <dt>Date</dt><dd>{fmtDate(note.date)}</dd>
          <dt>Reason</dt><dd>{note.reason}</dd>
          <dt>Taken off the invoice</dt><dd className="num">{dm(note.applied)}</dd>
          <dt>To refund</dt><dd className="num">{dm(note.refundDue)}</dd>
          <dt>Goods</dt><dd>{note.restocked ? 'Returned to stock' : 'Not returned to stock'}</dd>
        </dl>
        {!!note.items?.length && <div className="tb-wrap"><table className="table"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Before tax</th></tr></thead><tbody>{note.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{dm(lineTotal(i))}</td></tr>)}</tbody></table></div>}
        {note.note && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{note.note}</div>}
      </div>
    </Drawer>
  );
}

export function CreditNotes() {
  const { db, scope, companyName, optionsOf } = useStore();
  const [openId, setOpenId] = useState(null);
  const rows = scope(db.creditNotes || [], 'billing');
  const open = rows.find((r) => r.id === openId);
  return (
    <>
      <DataTable key="cn" rows={rows} exportName="credit-notes" dateOf={(c) => c.date} initialSort={{ k: 'date', dir: 'desc' }} onRow={(c) => setOpenId(c.id)} searchPlaceholder="Search credit notes…"
        statusTabs={{ options: ['Applied', 'Refund due', 'Refunded'], get: (c) => c.status }}
        filters={[{ k: 'reason', label: 'Reason', get: (c) => c.reason, options: optionsOf('returnReason') }]}
        columns={[
          { k: 'number', label: 'Credit note', render: (c) => <span className="strong">{c.number}</span> },
          { k: 'customer', label: 'Customer', value: (c) => companyName(c.companyId) },
          { k: 'invoiceNumber', label: 'Invoice' },
          { k: 'date', label: 'Date', nowrap: true, render: (c) => fmtDate(c.date) },
          { k: 'reason', label: 'Reason' },
          { k: 'status', label: 'Status', render: (c) => <Badge>{c.status}</Badge> },
          { k: 'total', label: 'Amount', align: 'r', render: (c) => docMoney(c, c.total) },
        ]} />
      {open && <CreditDrawer note={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

export function RecurringTab() {
  const { db, can, scope, update, remove, runRecurringNow, toast, companyName } = useStore();
  const [del, setDel] = useState(null);
  const rows = scope(db.recurringInvoices || [], 'billing');
  const editable = can('billing', 'invoice');
  return (
    <>
      <DataTable key="rec" rows={rows} exportName="recurring-invoices" initialSort={{ k: 'next', dir: 'asc' }} searchPlaceholder="Search recurring invoices…"
        columns={[
          { k: 'title', label: 'Plan', render: (r) => <span className="strong">{r.title}</span> },
          { k: 'customer', label: 'Customer', value: (r) => companyName(r.companyId) },
          { k: 'freq', label: 'Repeats' },
          { k: 'next', label: 'Next invoice', nowrap: true, render: (r) => (r.active ? fmtDate(r.next) : 'Paused') },
          { k: 'count', label: 'Sent so far', align: 'r', value: (r) => r.count || 0 },
          { k: 'total', label: 'Before tax', align: 'r', value: (r) => sum(r.items, lineTotal), render: (r) => docMoney(r, sum(r.items, lineTotal)) },
          ...(editable ? [{ k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (r) => <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Btn sm onClick={() => { runRecurringNow(r.id); toast('Invoice created'); }}>Invoice now</Btn>
            <Btn sm onClick={() => { update('recurringInvoices', r.id, { active: !r.active }); toast(r.active ? 'Plan paused' : 'Plan resumed'); }}>{r.active ? 'Pause' : 'Resume'}</Btn>
            <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${r.title}`} onClick={() => setDel(r)} />
          </div> }] : []),
        ]} />
      {del && <Confirm title={`Delete ${del.title}?`} text="Invoices it already created stay. No more will be created." onClose={() => setDel(null)} onConfirm={() => { remove('recurringInvoices', del.id); toast('Plan deleted'); }} />}
    </>
  );
}

export function StatementModal({ companyId, onClose }) {
  const { db, scope, can, companyName, sendEmail, toast } = useStore();
  const [from, setFrom] = useState(addDays(-365));
  const [to, setTo] = useState(today());
  const c = db.companies.find((x) => x.id === companyId);
  const s = statementOf(db, scope(db.invoices), companyId, from, to);
  const mn = (n) => moneyIn(s.cur, n);
  const rowsOf = s.rows.map((r) => <tr key={r.key}><td>{fmtDate(r.date)}</td><td>{r.label}</td><td className="r num">{r.charge ? mn(r.charge) : ''}</td><td className="r num">{r.credit ? mn(r.credit) : ''}</td><td className="r num">{mn(r.balance)}</td></tr>);
  return (
    <Modal size="lg" title={`Statement: ${companyName(companyId)}`} onClose={onClose} footer={<>
      <span className="grow strong num">Balance {mn(s.closing)}</span>
      {can('emails', 'create') && c?.email && <Btn icon="Send" onClick={() => { sendEmail({ to: c.email, subject: `Statement of account: ${c.name}`, body: `Your balance on ${fmtDate(to)} is ${mn(s.closing)}.`, ownerId: c.ownerId, relatedType: 'company', relatedId: c.id }); toast(`Saved as sent to ${c.email}. No real email was sent.`); }}>Email</Btn>}
      <Btn icon="Printer" onClick={() => window.print()}>Print or save PDF</Btn>
      <Btn kind="primary" onClick={onClose}>Done</Btn>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <div className="field"><label className="label" htmlFor="st-from">From</label><input id="st-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="st-to">To</label><input id="st-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="tb-wrap">
          <table className="table"><thead><tr><th>Date</th><th>Details</th><th className="r">Charged</th><th className="r">Paid or credited</th><th className="r">Balance</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="muted">Balance before {fmtDate(from)}</td><td className="r num">{mn(s.opening)}</td></tr>
              {rowsOf}
              <tr><td colSpan={4} className="strong">Balance on {fmtDate(to)}</td><td className="r num strong">{mn(s.closing)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      {createPortal(
        <div className="print-doc">
          <div className="pd-head">
            <div><div className="pd-co">{db.settings.companyName}</div><div>{db.settings.address}</div></div>
            <div style={{ textAlign: 'right' }}><div className="pd-title">Statement of account</div><div>{fmtDate(from)} to {fmtDate(to)}</div></div>
          </div>
          <div className="pd-to"><strong>Customer</strong><div>{companyName(companyId)}</div><div>{[c?.address, c?.city, c?.country].filter(Boolean).join(', ')}</div></div>
          <table className="pd-table"><thead><tr><th>Date</th><th>Details</th><th className="r">Charged</th><th className="r">Paid or credited</th><th className="r">Balance</th></tr></thead>
            <tbody><tr><td colSpan={4}>Balance before {fmtDate(from)}</td><td className="r">{mn(s.opening)}</td></tr>{rowsOf}</tbody>
          </table>
          <div className="pd-totals"><div className="pd-grand"><span>Balance</span><span>{mn(s.closing)}</span></div></div>
          <div className="pd-foot">Generated by {db.settings.companyName} CRM. This is a demo document.</div>
        </div>,
        document.body,
      )}
    </Modal>
  );
}

export function Receivables() {
  const { db, scope, companyName } = useStore();
  const [openId, setOpenId] = useState(null);
  const rows = receivablesOf(scope(db.invoices));
  return (
    <div className="stack">
      <div className="g5 ar-bands">
        {AGE_BANDS.map(([k, label]) => <Kpi key={k} label={label} value={moneyK(sum(rows, (r) => r[k]))} note={`${rows.filter((r) => r[k] > 0).length} customers`} icon={k === 'current' ? 'CalendarCheck' : 'Hourglass'} />)}
      </div>
      <DataTable key="ar" rows={rows} exportName="receivables" initialSort={{ k: 'total', dir: 'desc' }} onRow={(r) => setOpenId(r.companyId)} searchPlaceholder="Search customers…"
        columns={[
          { k: 'customer', label: 'Customer', value: (r) => companyName(r.companyId), render: (r) => <span className="strong">{companyName(r.companyId)}</span> },
          { k: 'count', label: 'Open invoices', align: 'r' },
          ...AGE_BANDS.map(([k, label]) => ({ k, label, align: 'r', render: (r) => (r[k] ? moneyIn(undefined, r[k]) : '—') })),
          { k: 'total', label: 'Total due', align: 'r', render: (r) => <span className="strong">{moneyIn(undefined, r.total)}</span> },
        ]} />
      {openId && <StatementModal companyId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
