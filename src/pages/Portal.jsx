import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Empty, FormFields, Kpi, Modal, validate } from '../ui';
import { PortalHelp, PortalSupport } from './CaseExtras';
import { nextCaseNumber } from '../cases';
import { docMoney, fmtDate, sum, today } from '../util';

const List = ({ head, rows, empty }) => (rows.length
  ? <div className="tb-wrap"><table className="table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>
  : <div className="sub">{empty}</div>);

// What a customer sees through their private link. It only reads this one customer's records.
export default function Portal({ token }) {
  const { db, create, update, recordPayment, pushNotification } = useStore();
  const c = db.companies.find((x) => x.portalToken === token);
  const [asking, setAsking] = useState(false);
  const [v, setV] = useState({ priority: 'Normal', type: 'Question' });
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState('');
  if (!c) return <div className="public-form"><div className="card card-b"><Empty icon="Link2Off" text="This portal link isn't valid. Ask your account manager for a new one." /></div></div>;
  const mine = (list) => list.filter((r) => r.companyId === c.id);
  const quotes = mine(db.quotes); const orders = mine(db.orders); const ships = mine(db.shipments); const invoices = mine(db.invoices); const cases = mine(db.cases);
  const open = invoices.filter((i) => i.total > (i.paid || 0));
  const tell = (text) => pushNotification(c.ownerId, `${c.name}: ${text}`, `/customers/${c.id}`);
  const answer = (q, status) => { update('quotes', q.id, { status }); tell(`${status === 'Accepted' ? 'accepted' : 'declined'} quote ${q.number} in the portal.`); setNote(`Quote ${q.number} ${status.toLowerCase()}.`); };
  const pay = (i) => { const due = i.total - (i.paid || 0); recordPayment(i.id, due, 'Portal (simulated)', today()); tell(`paid invoice ${i.number} in the portal (simulated).`); setNote(`Simulated payment of ${docMoney(i, due)} recorded. No money moved.`); };
  const fields = [{ k: 'subject', label: 'What do you need help with?', req: true, full: true }, { k: 'description', label: 'Details', type: 'textarea' }];
  const raise = () => {
    const er = validate(fields, v);
    setErrors(er);
    if (Object.keys(er).length) return;
    const contact = db.contacts.find((p) => p.companyId === c.id);
    create('cases', { subject: v.subject.trim(), description: v.description || '', companyId: c.id, contactId: contact?.id || '', ownerId: c.ownerId, status: 'New', priority: 'Normal', type: 'Question', channel: 'Portal', queue: 'General', number: nextCaseNumber(db.cases), stream: [{ at: new Date().toISOString(), by: c.ownerId, text: 'Raised by the customer in the portal.' }] });
    tell(`raised a support request: ${v.subject.trim()}`);
    setAsking(false); setV({}); setNote('Your request was sent.');
  };
  return (
    <div className="portal">
      <div className="portal-head">
        <div><div className="small muted">{db.settings.companyName} customer portal</div><h1 style={{ fontSize: 22, fontWeight: 680 }}>{c.name}</h1></div>
        <Btn kind="primary" icon="LifeBuoy" onClick={() => setAsking(true)}>Ask for help</Btn>
      </div>
      <p className="notice">Simulated portal. It only works in this browser, and payments here don't move any money.</p>
      {note && <p className="notice" role="status">{note}</p>}
      <div className="g4" style={{ margin: '14px 0' }}>
        <Kpi label="To pay" value={docMoney(open[0], sum(open, (i) => i.total - (i.paid || 0)))} note={`${open.length} open invoices`} icon="Receipt" />
        <Kpi label="Orders" value={orders.length} icon="ShoppingCart" />
        <Kpi label="In delivery" value={ships.filter((s) => s.status !== 'Delivered').length} icon="Truck" />
        <Kpi label="Open requests" value={cases.filter((x) => !['Closed', 'Rejected'].includes(x.status)).length} icon="LifeBuoy" />
      </div>
      <div className="stack">
        <Card title="Quotes" pad={false}><List head={['Quote', 'Valid until', 'Total', 'Status', '']} empty="No quotes." rows={quotes.map((q) => <tr key={q.id}><td className="strong">{q.number}</td><td>{fmtDate(q.expiry)}</td><td className="num">{docMoney(q, q.total)}</td><td><Badge>{q.status}</Badge></td><td className="row">{db.settings.opsReadOnly === false && ['Draft', 'Sent'].includes(q.status) && <><Btn sm kind="primary" onClick={() => answer(q, 'Accepted')}>Accept</Btn><Btn sm onClick={() => answer(q, 'Rejected')}>Decline</Btn></>}</td></tr>)} /></Card>
        <Card title="Invoices" pad={false}><List head={['Invoice', 'Due', 'Total', 'Paid', 'Status', '']} empty="No invoices." rows={invoices.map((i) => <tr key={i.id}><td className="strong">{i.number}</td><td>{fmtDate(i.due)}</td><td className="num">{docMoney(i, i.total)}</td><td className="num">{docMoney(i, i.paid || 0)}</td><td><Badge>{i.status}</Badge></td><td>{db.settings.opsReadOnly === false && i.total > (i.paid || 0) && <Btn sm kind="primary" onClick={() => pay(i)}>Pay (simulated)</Btn>}</td></tr>)} /></Card>
        <Card title="Orders and deliveries" pad={false}><List head={['Order', 'Date', 'Total', 'Status', 'Delivery']} empty="No orders." rows={orders.map((o) => { const s = ships.find((x) => x.orderId === o.id); return <tr key={o.id}><td className="strong">{o.number}</td><td>{fmtDate(o.date)}</td><td className="num">{docMoney(o, o.total)}</td><td><Badge>{o.status}</Badge></td><td>{s ? <><Badge>{s.status}</Badge><div className="small muted"><a href={`#/track/${s.tracking}`} target="_blank" rel="noreferrer">{s.tracking}</a>, due {fmtDate(s.eta)}</div></> : '—'}</td></tr>; })} /></Card>
        <PortalSupport company={c} cases={cases} tell={tell} />
        <PortalHelp />
      </div>
      {asking && <Modal size="sm" title="Ask for help" onClose={() => setAsking(false)} footer={<><Btn onClick={() => setAsking(false)}>Cancel</Btn><Btn kind="primary" onClick={raise}>Send</Btn></>}><FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} /></Modal>}
    </div>
  );
}
