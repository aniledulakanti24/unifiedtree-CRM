// Shows the records behind a number or a chart segment, each one linking to its own page.
import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from './store';
import { Badge, Btn, Drawer, Empty } from './ui';
import { downloadCsv, fmtDate, money, sum } from './util';

const VIEWS = {
  deal: (r, n) => ({ title: r.title, sub: `${n.companyName(r.companyId)} · ${n.userName(r.ownerId)}`, badge: r.status === 'lost' ? 'Lost' : r.status === 'won' ? 'Won' : n.stageName(r.stage), date: r.closeDate, value: r.value, to: `/pipeline/${r.id}` }),
  lead: (r, n) => ({ title: r.name, sub: `${r.company} · ${n.userName(r.ownerId)}`, badge: r.status, date: r.createdAt, value: r.expected, to: `/leads?open=${r.id}` }),
  order: (r, n) => ({ title: r.number, sub: n.companyName(r.companyId), badge: r.status, date: r.date, value: r.total, to: `/orders?open=${r.id}` }),
  invoice: (r, n) => ({ title: r.number, sub: n.companyName(r.companyId), badge: r.status, date: r.due, value: r.total - (r.paid || 0), to: '/billing' }),
  quote: (r, n) => ({ title: r.number, sub: n.companyName(r.companyId), badge: r.status, date: r.date, value: r.total, to: '/billing' }),
  payment: (r, n) => ({ title: r.number, sub: `${n.companyName(r.companyId)} · ${r.method || ''}`, date: r.date, value: r.amount, to: '/billing' }),
  case: (r, n) => ({ title: `#${r.number} ${r.subject}`, sub: n.companyName(r.companyId), badge: r.status, date: r.createdAt, to: `/cases?open=${r.id}` }),
  call: (r, n) => ({ title: r.name, sub: `${r.direction} · ${n.userName(r.ownerId)}`, badge: r.outcome, date: r.at, to: '/calls' }),
  ai: (r) => ({ title: r.name, sub: r.agentName, badge: r.outcome, date: r.at, to: '/ai-voice' }),
  shipment: (r) => ({ title: r.tracking, sub: `${r.orderNumber || ''} · ${r.destination || ''}`, badge: r.status, date: r.eta, to: '/logistics' }),
  product: (r) => ({ title: r.name, sub: `${r.category} · ${r.stock} in stock`, value: r.stock * (r.cost || 0), to: '/products' }),
  task: (r, n) => ({ title: r.summary, sub: `${r.relatedLabel || ''} · ${n.userName(r.ownerId)}`, badge: r.status, date: r.due, to: '/tasks' }),
  followup: (r, n) => ({ title: r.title, sub: `${r.name || ''} · ${n.userName(r.ownerId)}`, date: r.at, to: '/followups' }),
  contact: (r, n) => ({ title: `${r.first} ${r.last}`, sub: n.companyName(r.companyId), badge: r.status, to: `/contacts?open=${r.id}` }),
  company: (r, n) => ({ title: r.name, sub: n.userName(r.ownerId), badge: r.status, to: `/customers/${r.id}` }),
};

export function RecordsDrawer({ title, kind, rows, onClose }) {
  const { db, companyName, userName, canRoute } = useStore();
  const names = { companyName, userName, stageName: (id) => db.stages.find((s) => s.id === id)?.name || id };
  const view = VIEWS[kind] || VIEWS.deal;
  const items = rows.map((r) => ({ id: r.id, ...view(r, names) }));
  const hasValue = items.some((x) => x.value != null);
  const total = sum(items, (x) => x.value);
  const csv = () => downloadCsv(title.toLowerCase().replace(/\W+/g, '-'), [['Record', 'Details', 'Status', 'Date', 'Value'], ...items.map((x) => [x.title, x.sub, x.badge || '', x.date ? fmtDate(x.date) : '', x.value ?? ''])]);
  return (
    <Drawer title={title} onClose={onClose} actions={items.length > 0 && <Btn sm icon="Download" onClick={csv}>Export</Btn>}>
      <div className="stack-s">
        <div className="small muted">{items.length} {items.length === 1 ? 'record' : 'records'}{hasValue ? ` · ${money(total)}` : ''}</div>
        {!items.length && <Empty icon="Inbox" text="No records here." />}
        {items.slice(0, 200).map((x) => {
          const body = <><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{x.title}</div><div className="small muted trunc">{x.sub}</div></div><span className="drill-end">{x.badge && <Badge>{x.badge}</Badge>}{x.value != null && <span className="num strong">{money(x.value)}</span>}{x.date && <span className="small muted nowrap">{fmtDate(x.date)}</span>}</span></>;
          return canRoute(x.to.split('?')[0]) ? <Link key={x.id} to={x.to} className="dashlet" style={{ color: 'inherit', textDecoration: 'none' }} onClick={onClose}>{body}</Link> : <div key={x.id} className="dashlet">{body}</div>;
        })}
        {items.length > 200 && <div className="small muted">Showing the first 200. Export gives you all of them.</div>}
      </div>
    </Drawer>
  );
}

export const printPage = () => {
  document.body.classList.add('print-page');
  window.print();
  document.body.classList.remove('print-page');
};
