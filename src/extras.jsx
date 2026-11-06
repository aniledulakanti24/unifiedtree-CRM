import React, { useState } from 'react';
import { WinChance } from './askPanel';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Badge, Btn, Card, FormFields, Icon, Progress, UserChip } from './ui';
import { useStore } from './store';
import { ExchangeDifferences } from './pages/TaxExtras';
import { taxRegionKey, coachingFor, dealDraft, dealInsights, dealSummary, scoreLead, scoreReasons, taxesFor } from './engine';
import { FX_USD, docMoney, fmtDate, fmtDT, lineTotal, mainCurrency, money, standardRate } from './util';

// Values of the fields an Admin added to a form in Settings.
export function CustomValues({ kind, record }) {
  const { db } = useStore();
  const list = (db.formConfig?.[kind]?.custom || []).filter((f) => !db.formConfig[kind].hidden?.[f.k]);
  if (!list.length) return null;
  const show = (f) => { const v = record[f.k]; if (f.type === 'check') return v ? 'Yes' : 'No'; return v === '' || v == null ? '—' : String(v); };
  return <>{list.map((f) => <React.Fragment key={f.k}><dt>{f.label}</dt><dd>{show(f)}</dd></React.Fragment>)}</>;
}

export function LeadScore({ lead }) {
  return (
    <div>
      <div className="row between"><strong>Lead score</strong><span className="num strong">{scoreLead(lead)} / 100</span></div>
      <div style={{ margin: '6px 0' }}><Progress value={scoreLead(lead)} /></div>
      <div className="small muted">{scoreReasons(lead).map(([why, n]) => `${why} (${n > 0 ? '+' : ''}${n})`).join(' · ') || 'Add details to raise the score.'}</div>
    </div>
  );
}

const JOURNEY_ICON = { lead: 'Magnet', deal: 'Kanban', quote: 'FileText', order: 'ShoppingCart', shipment: 'Truck', invoice: 'Receipt', payment: 'Banknote', case: 'LifeBuoy', call: 'Phone', meeting: 'CalendarDays' };
const JOURNEY_STEPS = [['lead', 'Lead'], ['deal', 'Opportunity'], ['quote', 'Quote'], ['order', 'Order'], ['shipment', 'Delivery'], ['invoice', 'Invoice'], ['payment', 'Payment'], ['case', 'Support']];

// One customer's whole story: first enquiry through delivery, payment and support. Only shows what you may see.
export function Journey({ companyId, dealId }) {
  const { db, can, companyName } = useStore();
  const name = companyName(companyId).toLowerCase();
  const items = [
    ...(can('leads') ? db.leads.filter((l) => (l.company || '').toLowerCase() === name).map((l) => ({ kind: 'lead', at: l.createdAt, title: `Lead: ${l.name}`, status: l.status, to: `/leads?open=${l.id}` })) : []),
    ...(can('pipeline') ? db.deals.filter((d) => d.companyId === companyId && (!dealId || d.id === dealId)).map((d) => ({ kind: 'deal', at: d.createdAt, title: d.title, status: d.status === 'open' ? 'Open' : d.status === 'won' ? 'Won' : 'Lost', amount: d.value, to: `/pipeline/${d.id}` })) : []),
    ...(can('billing') ? db.quotes.filter((q) => q.companyId === companyId).map((q) => ({ kind: 'quote', at: q.createdAt || q.date, title: `Quote ${q.number}`, status: q.status, amount: q.total, to: '/billing' })) : []),
    ...(can('orders') ? db.orders.filter((o) => o.companyId === companyId).map((o) => ({ kind: 'order', at: o.createdAt || o.date, title: `Order ${o.number}`, status: o.status, amount: o.total, to: `/orders?open=${o.id}` })) : []),
    ...(can('logistics') ? db.shipments.filter((s) => s.companyId === companyId).map((s) => ({ kind: 'shipment', at: s.createdAt || s.shipDate, title: `Shipment ${s.tracking}`, status: s.status, to: '/logistics' })) : []),
    ...(can('billing') ? db.invoices.filter((i) => i.companyId === companyId).map((i) => ({ kind: 'invoice', at: i.createdAt || i.date, title: `Invoice ${i.number}`, status: i.status, amount: i.total, to: '/billing' })) : []),
    ...(can('billing', 'invoice', true) ? db.payments.filter((p) => p.companyId === companyId).map((p) => ({ kind: 'payment', at: p.createdAt || p.date, title: `Payment ${p.number}`, status: p.method, amount: p.amount, to: '/billing' })) : []),
    ...(can('cases') ? db.cases.filter((c) => c.companyId === companyId).map((c) => ({ kind: 'case', at: c.createdAt, title: `Case #${c.number}: ${c.subject}`, status: c.status, to: `/cases?open=${c.id}` })) : []),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const [all, setAll] = useState(false);
  const count = (k) => items.filter((i) => i.kind === k).length;
  return (
    <Card title="Customer journey" sub="From first enquiry to delivery, payment and support">
      <div className="journey">
        {JOURNEY_STEPS.map(([k, label]) => (
          <div key={k} className={`journey-step ${count(k) ? 'on' : ''}`}><span className="kpi-ico" style={{ width: 30, height: 30 }}><Icon name={JOURNEY_ICON[k]} size={15} /></span><span className="small">{label}</span><strong className="num">{count(k)}</strong></div>
        ))}
      </div>
      {!items.length && <div className="sub" style={{ marginTop: 10 }}>Nothing yet.</div>}
      <div className="stack-s" style={{ marginTop: 10 }}>
        {(all ? items : items.slice(0, 6)).map((x, i) => (
          <div key={i} className="dashlet">
            <Icon name={JOURNEY_ICON[x.kind]} size={15} color="var(--ink-3)" />
            <div className="grow" style={{ minWidth: 0 }}><Link className="strong trunc" to={x.to}>{x.title}</Link><div className="small muted">{fmtDate(x.at)}</div></div>
            {x.amount != null && <span className="num small">{money(x.amount)}</span>}
            <Badge>{x.status}</Badge>
          </div>
        ))}
      </div>
      {items.length > 6 && <div style={{ marginTop: 8 }}><Btn sm onClick={() => setAll((v) => !v)}>{all ? 'Show less' : `Show all ${items.length}`}</Btn></div>}
    </Card>
  );
}

export function DealAssistant({ deal }) {
  const { db, me, can, companyName, sendEmail, toast } = useStore();
  const { risk, flags, next } = dealInsights(db, deal);
  const [draft, setDraft] = useState(null);
  if (deal.status !== 'open') return null;
  const contact = db.contacts.find((c) => c.id === deal.contactId);
  const stage = db.stages.find((s) => s.id === deal.stage)?.name || deal.stage;
  return (
    <Card title="Deal assistant" sub="Suggestions from fixed rules, not an AI model" action={<Badge tone={risk === 'High' ? 'bad' : risk === 'Medium' ? 'warn' : 'good'}>{`${risk} risk`}</Badge>}>
      <WinChance deal={deal} />
      {flags.length > 0 && <ul className="plain-list">{flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      <div className="filter-title" style={{ marginTop: flags.length ? 8 : 0 }}><Icon name="Lightbulb" size={13} />Suggested next steps</div>
      <ul className="plain-list">{next.map((n) => <li key={n}>{n}</li>)}</ul>
      <div className="filter-title" style={{ marginTop: 8 }}><Icon name="FileText" size={13} />Summary</div>
      <p className="small" style={{ margin: 0 }}>{dealSummary(db, deal, stage, companyName(deal.companyId))}</p>
      {can('emails', 'create') && contact?.email && (draft === null
        ? <div style={{ marginTop: 8 }}><Btn sm icon="PenLine" onClick={() => setDraft(dealDraft(db, deal, contact, me))}>Draft a follow-up</Btn></div>
        : <div className="stack-s" style={{ marginTop: 8 }}>
          <textarea className="textarea" rows={6} aria-label="Follow-up draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="row"><Btn sm kind="primary" onClick={() => { sendEmail({ to: contact.email, subject: `Following up: ${deal.title}`, body: draft, ownerId: deal.ownerId, relatedType: 'deal', relatedId: deal.id }); setDraft(null); toast(`Saved as sent to ${contact.email}. No real email was sent.`); }}>Send (simulated)</Btn><Btn sm onClick={() => setDraft(null)}>Discard</Btn></div>
        </div>)}
    </Card>
  );
}

export function Coaching({ userIds }) {
  const { db, sec, userName } = useStore();
  if (!sec('dashboard', 'coaching')) return null;
  const rows = coachingFor(db, userIds);
  return (
    <div style={{ marginBottom: 14 }}>
      <Card title="Coaching" sub="Who may need your help this week" pad={false}>
        <div className="tb-wrap" style={{ marginTop: 10 }}>
          <table className="table"><thead><tr><th>Salesperson</th><th className="r">Open deals</th><th className="r">Stuck</th><th className="r">Late follow-ups</th><th className="r">Overdue tasks</th><th className="r">Calls this week</th><th>Look at</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><UserChip id={r.id} /></td><td className="r num">{r.open}</td><td className="r num">{r.stuck.length}</td><td className="r num">{r.late}</td><td className="r num">{r.overdue}</td><td className="r num">{r.calls}</td>
                <td className="small">{r.stuck[0] ? <Link to={`/pipeline/${r.stuck[0].id}`}>{r.notes.join(', ')}</Link> : r.notes.join(', ') || <span className="muted">{`${userName(r.id).split(' ')[0]} is on track`}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// A clean A4 page. Only appears when printing or saving as PDF.
export function DocPrint({ doc, kind }) {
  const { db, companyName } = useStore();
  const s = db.settings;
  const dm = (n) => docMoney(doc, n);
  const c = db.companies.find((x) => x.id === doc.companyId);
  const itemised = !!doc.taxes;
  const lines = doc.taxes?.lines;
  const showCodes = !!lines?.some((l) => l.taxCode);
  const taxName = s.taxName || 'Tax';
  const idLabel = s.taxIdLabel || 'Tax ID';
  const myTaxId = s.taxId || s.gstin;
  const theirTaxId = c?.taxId || c?.gstin;
  const title = kind === 'quote' ? 'Quotation' : kind === 'credit' ? 'Credit note' : 'Invoice';
  return createPortal(
    <div className="print-doc">
      <div className="pd-head">
        <div><div className="pd-co">{s.companyName}</div><div>{s.address}</div>{myTaxId && <div>{idLabel}: {myTaxId}</div>}{s.supportEmail && <div>{s.supportEmail}</div>}</div>
        <div style={{ textAlign: 'right' }}><div className="pd-title">{title}</div><div>{doc.number}</div><div>Date: {fmtDate(doc.date)}</div><div>{kind === 'quote' ? `Valid until: ${fmtDate(doc.expiry)}` : kind === 'credit' ? `Against invoice: ${doc.invoiceNumber}` : `Due: ${fmtDate(doc.due)}`}</div></div>
      </div>
      <div className="pd-to"><strong>Bill to</strong><div>{companyName(doc.companyId)}</div><div>{[c?.address, c?.city, c?.state, c?.country].filter(Boolean).join(', ')}</div>{theirTaxId && <div>Tax ID: {theirTaxId}</div>}</div>
      <table className="pd-table"><thead><tr><th>Item</th>{showCodes && <th>Tax code</th>}<th className="r">Qty</th><th className="r">Price</th>{lines && <th className="r">{taxName}</th>}<th className="r">Amount</th></tr></thead>
        <tbody>{(lines || doc.items || []).map((i, n) => <tr key={n}><td>{i.name}</td>{showCodes && <td>{i.taxCode || '—'}</td>}<td className="r">{i.qty}</td><td className="r">{dm(i.price)}</td>{lines && <td className="r">{i.rate}%</td>}<td className="r">{dm(lineTotal(i))}</td></tr>)}</tbody>
      </table>
      <div className="pd-totals">
        {itemised && <div><span>Before tax</span><span>{dm(doc.taxes.taxable)}</span></div>}
        {itemised && <div><span>{taxName}{doc.taxes.rate != null ? ` (${doc.taxes.rate}%)` : ''}</span><span>{dm(doc.taxes.tax)}</span></div>}
        <div className="pd-grand"><span>Total</span><span>{dm(doc.total)}</span></div>
      </div>
      {doc.taxes?.inclusive && <div className="pd-words">Prices include {taxName.toLowerCase() === 'tax' ? 'tax' : taxName}.</div>}
      {doc.taxes?.reverseCharge && <div className="pd-words">Reverse charge: no {taxName === 'Tax' ? 'tax' : taxName} charged. The customer accounts for it.</div>}
      {doc.taxes?.exemptRef && <div className="pd-words">Tax exempt. Certificate: {doc.taxes.exemptRef}</div>}
      {!itemised && <div className="pd-words">{kind === 'credit' ? `Reason: ${doc.reason}. The total includes tax.` : "Tax isn't itemised on this document."}</div>}
      <div className="pd-foot">Generated by {s.companyName} CRM on {fmtDT(new Date().toISOString())}. This is a demo document, not a filed tax record.</div>
    </div>, document.body,
  );
}

export function CurrencySettings() {
  const { db, updateSettings, toast, optionsOf } = useStore();
  const base = mainCurrency();
  const saved = db.settings.fxRates || {};
  const codes = optionsOf('currency').filter((c) => c !== base);
  const rateText = (c) => { const r = saved[c] || standardRate(c, base); return r ? String(Number(r.toPrecision(6))) : ''; };
  const [rates, setRates] = useState(() => Object.fromEntries(codes.map((c) => [c, rateText(c)])));
  const nameOf = (c) => { try { return new Intl.DisplayNames(['en'], { type: 'currency' }).of(c); } catch { return c; } };
  const save = () => {
    const fxRates = Object.fromEntries(Object.entries(rates).filter(([c, r]) => Number(r) > 0 && codes.includes(c)).map(([c, r]) => [c, Number(r)]));
    const at = new Date().toISOString();
    updateSettings({ fxRates, fxUpdatedAt: at, fxHistory: [{ at, rates: saved }, ...(db.settings.fxHistory || [])].slice(0, 24) });
    toast('Exchange rates saved. New records use them. Existing records keep their rate.');
  };
  const refresh = () => {
    setRates(Object.fromEntries(codes.map((c) => { const r = standardRate(c, base); return [c, r ? String(Number((r * (1 + (Math.random() - 0.5) * 0.03)).toPrecision(6))) : rates[c] || '']; })));
    toast('Simulated rates filled in. Press Save rates to use them.');
  };
  return (
    <div className="stack"><Card title="Exchange rates" sub={`Your main currency is ${base}, and reports total in it. Change it under General & roles.`} action={<div className="row"><Btn icon="RefreshCw" onClick={refresh}>Refresh rates (simulated)</Btn><Btn kind="primary" onClick={save}>Save rates</Btn></div>}>
      <div className="stack">
        <div className="notice">Rates are simulated, not live market data. Each record keeps the rate from when it was created, so saving new rates doesn't change old amounts.{db.settings.fxUpdatedAt ? ` Last saved ${fmtDT(db.settings.fxUpdatedAt)}.` : ''}</div>
        <div className="tb-wrap">
          <table className="table">
            <thead><tr><th>Currency</th><th className="r">1 {base} buys</th><th className="r">1 unit costs</th><th className="r">Since last save</th><th>Status</th></tr></thead>
            <tbody>{codes.map((c) => {
              const r = Number(rates[c]);
              return <tr key={c}>
                <td><span className="strong">{c}</span> <span className="small muted">{nameOf(c)}</span></td>
                <td className="r"><input className="input" style={{ width: 120, textAlign: 'right', marginInlineStart: 'auto' }} type="number" min="0" step="any" aria-label={`Rate for ${c}`} value={rates[c] ?? ''} onChange={(e) => setRates((p) => ({ ...p, [c]: e.target.value }))} /></td>
                <td className="r num">{r > 0 ? money(1 / r) : '—'}</td>
                <td className="r num">{(() => { const last = db.settings.fxHistory?.[0]?.rates?.[c] || standardRate(c, base); const was = saved[c] || last; const old = rates[c] !== rateText(c) ? was : last; return r > 0 && old > 0 && Math.abs(r / old - 1) > 0.00005 ? `${r > old ? '+' : '−'}${Math.abs((r / old - 1) * 100).toFixed(2)}%` : '—'; })()}</td>
                <td>{r > 0 ? <Badge tone={saved[c] ? 'good' : 'muted'}>{saved[c] ? 'Saved' : FX_USD[c] ? 'Standard' : 'Not saved'}</Badge> : <Badge tone="warn">Needs a rate</Badge>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </Card><ExchangeDifferences /></div>
  );
}

export function TaxSettings() {
  const { db, updateSettings, toast, optionsOf } = useStore();
  const s = db.settings;
  const [v, setV] = useState({ taxName: s.taxName || 'Tax', taxIdLabel: s.taxIdLabel || 'Tax ID', taxId: s.taxId || s.gstin || '', taxRate: s.taxRate ?? 0, address: s.address || '', pricesIncludeTax: !!s.pricesIncludeTax, reverseCharge: !!s.reverseCharge, homeCountry: s.homeCountry || '' });
  const [rows, setRows] = useState(() => [
    ...Object.entries(s.taxByCountry || {}).map(([country, rate]) => ({ country, region: '', rate })),
    ...Object.entries(s.taxByRegion || {}).map(([key, rate]) => { const [country, region] = key.split('|'); return { country, region, rate }; }),
  ]);
  const save = () => {
    const good = rows.filter((r) => r.country && r.rate !== '');
    const n = (r) => Math.max(0, Number(r.rate) || 0);
    const taxByCountry = Object.fromEntries(good.filter((r) => !r.region.trim()).map((r) => [r.country, n(r)]));
    const taxByRegion = Object.fromEntries(good.filter((r) => r.region.trim()).map((r) => [taxRegionKey(r.country, r.region), n(r)]));
    updateSettings({ ...v, taxId: v.taxId.trim(), taxRate: Math.max(0, Number(v.taxRate) || 0), taxByCountry, taxByRegion });
    toast('Tax settings saved');
  };
  const setRow = (i, patch) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Your tax details" sub="Used on quotes, invoices and printed documents.">
        <div className="stack">
          <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} fields={[
            { k: 'taxName', label: 'What tax is called', type: 'select', noBlank: true, list: 'taxName', hint: 'Shown on documents, such as VAT or Sales tax.' },
            { k: 'taxRate', label: 'Default rate %', type: 'number', min: 0 },
            { k: 'taxIdLabel', label: 'What your tax number is called', type: 'select', noBlank: true, list: 'taxIdLabel' },
            { k: 'taxId', label: 'Your tax number' },
            { k: 'address', label: 'Address on documents', full: true },
            { k: 'pricesIncludeTax', label: 'Prices', type: 'check', text: 'My prices already include tax', full: true, hint: 'Common in Europe and Australia. Tax is taken out of the price instead of added on top.' },
            { k: 'homeCountry', label: 'My country', type: 'select', list: 'country' },
            { k: 'reverseCharge', label: 'Selling abroad', type: 'check', text: 'No tax for businesses abroad with a tax number', hint: 'Known as reverse charge. Check that it applies to you.' },
          ]} />
          <div><Btn kind="primary" onClick={save}>Save</Btn></div>
          <div className="notice">Check rates and invoice wording with your accountant. This CRM doesn't file tax returns.</div>
        </div>
      </Card>
      <Card title="Rates by place" sub="Leave the state blank to cover a whole country. A state or region rate wins over its country. Tax-exempt customers pay none.">
        <div className="stack-s">
          {rows.map((r, i) => (
            <div className="tax-rate-row" key={i}>
              <select className="select" aria-label="Country" value={r.country} onChange={(e) => setRow(i, { country: e.target.value })}>
                <option value="">Choose a country…</option>
                {optionsOf('country').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="input" aria-label="State or region" placeholder="State or region" value={r.region} onChange={(e) => setRow(i, { region: e.target.value })} />
              <input className="input" type="number" min="0" step="any" aria-label={`Rate for ${r.region || r.country || 'this place'}`} placeholder="%" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} />
              <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${r.region || r.country || 'this row'}`} onClick={() => setRows(rows.filter((_, n) => n !== i))} />
            </div>
          ))}
          {!rows.length && <div className="small muted">No rates by place yet. Everyone pays the product's rate or your default rate.</div>}
          <div className="row"><Btn sm icon="Plus" onClick={() => setRows([...rows, { country: '', region: '', rate: '' }])}>Add a rate</Btn><Btn sm kind="primary" onClick={save}>Save</Btn></div>
        </div>
      </Card>
    </div>
  );
}
