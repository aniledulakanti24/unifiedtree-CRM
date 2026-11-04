import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, DataTable, Empty, Icon, NoSections, PageHead, Pills, RecordModal, Tabs, UserChip, firstAllowed } from '../ui';
import { ContactActions, personOfContact } from '../comms';
import { Chatter, RecordQuickCreate, TransferDialog, companyFields, relatedOf } from '../shared';
import { fmtDate, fmtDT, initials, money, sum } from '../util';

export function Customers() {
  const { db, role, t, sec, scope, can, remove, toast, userName, optionsOf } = useStore();
  const nav = useNavigate();
  const [pref, setView] = useState('list');
  const views = [{ k: 'list', icon: 'List', label: 'List' }, { k: 'cards', icon: 'LayoutGrid', label: 'Cards' }].filter((v) => sec('customers', v.k));
  const view = firstAllowed(views, pref);
  const [creating, setCreating] = useState(false);
  const rows = scope(db.companies);
  const revenue = (id) => sum(db.orders.filter((o) => o.companyId === id && o.status !== 'Cancelled'), (o) => o.total);
  return (
    <div>
      <PageHead title={t('customers')} sub={`${rows.filter((c) => c.status === 'Customer').length} customers, ${rows.filter((c) => c.status === 'Prospect').length} prospects`}>
        <Pills value={view} onChange={setView} options={views} />
        {can('customers', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setCreating(true)}>New customer</Btn>}
      </PageHead>
      {!view ? <NoSections /> : view === 'list' ? (
        <DataTable rows={rows} exportName="customers" onRow={(c) => nav(`/customers/${c.id}`)} initialSort={{ k: 'name', dir: 'asc' }}
          statusTabs={{ options: optionsOf('customerType'), get: (c) => c.status }}
          filters={[{ k: 'industry', label: 'Industry', get: (c) => c.industry, options: optionsOf('industry') }]}
          bulk={can('customers', 'delete') ? (sel, clear) => <Btn sm kind="danger" icon="Trash2" onClick={() => { sel.forEach((r) => remove('companies', r.id)); clear(); toast('Deleted'); }}>Delete</Btn> : undefined}
          columns={[
            { k: 'name', label: 'Name', render: (c) => <span className="row"><Avatar name={c.name} size={28} /><span className="strong trunc">{c.name}</span></span> },
            { k: 'phone', label: 'Phone', nowrap: true },
            { k: 'email', label: 'Email' },
            { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (c) => userName(c.ownerId), render: (c) => <UserChip id={c.ownerId} /> },
            { k: 'city', label: 'City' },
            { k: 'country', label: 'Country' },
            { k: 'industry', label: 'Industry', hidden: true },
            { k: 'status', label: 'Type', render: (c) => <Badge>{c.status}</Badge> },
            { k: 'revenue', label: 'Revenue', align: 'r', value: (c) => revenue(c.id), render: (c) => money(revenue(c.id)) },
          ]} />
      ) : (
        <div className="prod-grid">
          {rows.map((c) => (
            <button key={c.id} type="button" className="prod-card" style={{ padding: 14, gap: 8 }} onClick={() => nav(`/customers/${c.id}`)}>
              <span className="row"><Avatar name={c.name} size={36} /><span className="grow"><div className="strong trunc">{c.name}</div><div className="small muted trunc">{c.industry}</div></span></span>
              <span className="small sub trunc">{c.city}, {c.country}</span>
              <span className="row between"><Badge>{c.status}</Badge><span className="num strong">{money(revenue(c.id))}</span></span>
            </button>
          ))}
        </div>
      )}
      {creating && <RecordQuickCreate kind="company" onClose={() => setCreating(false)} />}
    </div>
  );
}

const Table = ({ head, children }) => <div className="tb-wrap"><table className="table"><thead><tr>{head.map((h) => <th key={h.t || h} className={h.r ? 'r' : ''}>{h.t || h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;

export function CustomerRecord() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, role, t, sec, scope, can, update, remove, toast, userName } = useStore();
  const c = db.companies.find((x) => x.id === id);
  const [tabPref, setTab] = useState('contacts');
  const [modal, setModal] = useState(null);
  if (!c || !scope([c], 'customers').length) return <div className="card"><Empty icon="SearchX" text="This customer doesn't exist, or it isn't in your book."><Link className="btn" to="/customers">Back to customers</Link></Empty></div>;
  const contacts = db.contacts.filter((x) => x.companyId === id);
  const deals = db.deals.filter((x) => x.companyId === id);
  const open = deals.filter((d) => d.status === 'open');
  const orders = db.orders.filter((x) => x.companyId === id);
  const invoices = db.invoices.filter((x) => x.companyId === id);
  const cases = db.cases.filter((x) => x.companyId === id);
  const meetings = db.events.filter((x) => x.companyId === id);
  const revenue = sum(orders.filter((o) => o.status !== 'Cancelled'), (o) => o.total);
  const due = sum(invoices, (i) => i.total - (i.paid || 0));
  const SMART = [
    ['deals', 'Handshake', open.length, 'Opportunities'], ['meetings', 'CalendarDays', meetings.length, 'Meetings'], ['orders', 'ShoppingCart', orders.length, 'Sales'],
    ['invoices', 'Receipt', money(revenue), 'Invoiced'], ['cases', 'LifeBuoy', cases.filter((x) => !['Closed', 'Rejected'].includes(x.status)).length, 'Open cases'],
  ].filter(([k]) => sec('customers', k));
  const TABS = [{ k: 'contacts', label: `Contacts (${contacts.length})` }, { k: 'sales', label: 'Sales & Purchase' }, { k: 'accounting', label: 'Accounting' }, { k: 'notes', label: 'Internal notes' }].filter((x) => sec('customers', x.k));
  const tab = firstAllowed([...TABS, ...SMART.map(([k]) => k)], tabPref);
  const related = relatedOf('company', c);
  return (
    <div className="stack">
      <PageHead title={c.name} crumbs={[t('customers'), c.name]}>
        <ContactActions person={contacts[0] ? { ...personOfContact(contacts[0], c.name), relatedType: 'company', relatedId: c.id } : { name: c.name, phone: c.phone, relatedType: 'company', relatedId: c.id, companyId: c.id }} />
        {can('transfers', 'create') && <Btn icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}
        {can('customers', 'edit') && <Btn icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}
        {can('customers', 'delete') && <Btn icon="Trash2" kind="danger" aria-label="Delete" onClick={() => setModal('delete')} />}
      </PageHead>
      <div className="card card-b stack">
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={c.name} size={52} />
          <div className="grow">
            <div className="row wrap"><Badge>{c.status}</Badge>{(c.tags || []).map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>)}</div>
            <div className="highlights" style={{ marginTop: 8 }}>
              <div className="hl"><div className="k">Industry</div><div className="v">{c.industry || '—'}</div></div>
              <div className="hl"><div className="k">Phone</div><div className="v">{c.phone || '—'}</div></div>
              <div className="hl"><div className="k">Website</div><div className="v">{c.website || '—'}</div></div>
              <div className="hl"><div className="k">Salesperson</div><div className="v">{userName(c.ownerId)}</div></div>
              {sec('customers', 'accounting') && <div className="hl"><div className="k">Amount due</div><div className="v num" style={due > 0 ? { color: 'var(--bad)' } : undefined}>{money(due)}</div></div>}
            </div>
          </div>
        </div>
        <div className="smart">
          {SMART.map(([k, ic, v, l]) => (
            <button key={k} type="button" className={`smart-btn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              <Icon name={ic} size={17} color="var(--brand-ink)" /><span><b>{v}</b><span>{l}</span></span>
            </button>
          ))}
        </div>
      </div>
      <div className="g-21" style={{ alignItems: 'start' }}>
        {tab && <div className="card card-b">
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          {tab === 'contacts' && (contacts.length ? <Table head={['Name', 'Job title', 'Email', 'Phone']}>{contacts.map((p) => <tr key={p.id}><td><Link className="strong" to={`/contacts?open=${p.id}`}>{p.first} {p.last}</Link></td><td>{p.title}</td><td>{p.email}</td><td className="nowrap">{p.phone}</td></tr>)}</Table> : <Empty icon="Contact" text="No contacts yet." />)}
          {tab === 'sales' && (
            <dl className="dl">
              <dt>Salesperson</dt><dd><UserChip id={c.ownerId} /></dd>
              <dt>Payment terms</dt><dd>{c.paymentTerms || '—'}</dd>
              <dt>Price list</dt><dd>{c.priceList || '—'}</dd>
              <dt>Address</dt><dd>{[c.address, c.city, c.country].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Company size</dt><dd>{c.size || '—'}</dd>
            </dl>
          )}
          {tab === 'accounting' && (
            <dl className="dl">
              <dt>Tax ID</dt><dd>{c.taxId || '—'}</dd>
              <dt>Total invoiced</dt><dd className="num">{money(sum(invoices, (i) => i.total))}</dd>
              <dt>Total paid</dt><dd className="num">{money(sum(invoices, (i) => i.paid || 0))}</dd>
              <dt>Amount due</dt><dd className="num strong">{money(due)}</dd>
            </dl>
          )}
          {tab === 'notes' && <textarea className="textarea" rows={7} readOnly={!can('customers', 'edit')} aria-label="Internal notes" defaultValue={c.notes} placeholder="Add notes only your team sees…" onBlur={(e) => { if (e.target.value !== (c.notes || '')) { update('companies', c.id, { notes: e.target.value }); toast('Notes saved'); } }} />}
          {tab === 'deals' && (deals.length ? <Table head={['Opportunity', 'Stage', 'Closing', { t: 'Value', r: true }]}>{deals.map((d) => <tr key={d.id}><td><Link className="strong" to={`/pipeline/${d.id}`}>{d.title}</Link></td><td><Badge>{d.status === 'lost' ? 'Lost' : db.stages.find((s) => s.id === d.stage)?.name}</Badge></td><td className="nowrap">{fmtDate(d.closeDate)}</td><td className="r num">{money(d.value)}</td></tr>)}</Table> : <Empty icon="Handshake" text="No opportunities yet." />)}
          {tab === 'meetings' && (meetings.length ? <Table head={['Meeting', 'When', 'Location']}>{meetings.map((e) => <tr key={e.id}><td className="strong">{e.title}</td><td className="nowrap">{fmtDT(e.start)}</td><td>{e.location}</td></tr>)}</Table> : <Empty icon="CalendarDays" text="No meetings yet." />)}
          {tab === 'orders' && (orders.length ? <Table head={['Order', 'Date', 'Status', { t: 'Total', r: true }]}>{orders.map((o) => <tr key={o.id}><td><Link className="strong" to={`/orders?open=${o.id}`}>{o.number}</Link></td><td className="nowrap">{fmtDate(o.date)}</td><td><Badge>{o.status}</Badge></td><td className="r num">{money(o.total)}</td></tr>)}</Table> : <Empty icon="ShoppingCart" text="No orders yet." />)}
          {tab === 'invoices' && (invoices.length ? <Table head={['Invoice', 'Due', 'Status', { t: 'Total', r: true }]}>{invoices.map((i) => <tr key={i.id}><td className="strong"><Link to="/billing">{i.number}</Link></td><td className="nowrap">{fmtDate(i.due)}</td><td><Badge>{i.status}</Badge></td><td className="r num">{money(i.total)}</td></tr>)}</Table> : <Empty icon="Receipt" text="No invoices yet." />)}
          {tab === 'cases' && (cases.length ? <Table head={['Case', 'Priority', 'Status']}>{cases.map((x) => <tr key={x.id}><td><Link className="strong" to={`/cases?open=${x.id}`}>#{x.number} {x.subject}</Link></td><td><Badge>{x.priority}</Badge></td><td><Badge>{x.status}</Badge></td></tr>)}</Table> : <Empty icon="LifeBuoy" text="No cases yet." />)}
        </div>}
        {sec('customers', 'history') && <Chatter related={related} />}
      </div>
      {modal === 'edit' && <RecordModal size="lg" title="Edit customer" fields={companyFields({ owner: role !== 'sales' })} initial={c} onClose={() => setModal(null)} onSave={(v) => { const { id: _i, ...rest } = v; update('companies', c.id, rest); toast('Customer saved'); }} />}
      {modal === 'transfer' && <TransferDialog record={related} onClose={() => setModal(null)} />}
      {modal === 'delete' && <Confirm title="Delete customer?" text={`${c.name} will be removed for everyone. Linked deals and orders keep their history.`} onClose={() => setModal(null)} onConfirm={() => { remove('companies', c.id); toast('Customer deleted'); nav('/customers'); }} />}
    </div>
  );
}
