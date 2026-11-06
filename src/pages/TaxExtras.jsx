import React, { useState } from 'react';
import { useStore } from '../store';
import { Btn, Card, Confirm, DataTable, FormFields, Kpi, Pills } from '../ui';
import { exchangeDifferences } from '../worldwide';
import { inDoc, money, moneyK, num, rateFor, rateOf } from '../util';

export function TaxSummary() {
  const { db, scope } = useStore();
  const [span, setSpan] = useState('This year');
  const year = String(new Date().getFullYear());
  const since = span === 'This year' ? `${year}-01-01` : span === 'Last 12 months' ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : '';
  const list = scope(db.invoices).filter((i) => (i.date || '') >= since);
  const groups = new Map();
  let noTax = 0;
  const add = (country, rate, taxable, tax) => {
    const key = `${country}|${rate}`;
    const g = groups.get(key) || { id: key, country, rate, taxable: 0, tax: 0, count: 0 };
    g.taxable += taxable; g.tax += tax; g.count += 1;
    groups.set(key, g);
  };
  list.forEach((i) => {
    const c = db.companies.find((x) => x.id === i.companyId);
    const country = c?.country || 'Not recorded';
    if (!i.taxes) { noTax += 1; return; }
    if (i.taxes.lines?.length) i.taxes.lines.forEach((l) => add(country, l.rate, l.base, l.tax));
    else add(country, i.taxes.rate ?? 0, i.taxes.taxable, i.taxes.tax);
  });
  const rows = [...groups.values()];
  const tax = rows.reduce((a, r) => a + r.tax, 0);
  const taxable = rows.reduce((a, r) => a + r.taxable, 0);
  const name = db.settings.taxName || 'Tax';
  return (
    <div className="stack">
      <div className="row between wrap"><Pills value={span} onChange={setSpan} options={['This year', 'Last 12 months', 'All time']} /><span className="small muted">In {db.settings.currency}. A summary to help your accountant, not a tax filing.</span></div>
      <div className="g3">
        <Kpi label={`${name} on invoices`} value={moneyK(tax)} note={`${num(list.length)} invoices`} icon="Percent" />
        <Kpi label="Sales before tax" value={moneyK(taxable)} icon="Receipt" />
        <Kpi label="Average rate" value={taxable ? `${((tax / taxable) * 100).toFixed(1)}%` : '—'} note={noTax ? `${noTax} invoices have no tax details` : 'Across these invoices'} icon="Scale" />
      </div>
      <DataTable key={span} rows={rows} exportName="tax-summary" noSearch initialSort={{ k: 'tax', dir: 'desc' }} emptyText="No invoices in this period."
        columns={[
          { k: 'country', label: 'Country', render: (r) => <span className="strong">{r.country}</span> },
          { k: 'rate', label: 'Rate', align: 'r', render: (r) => `${r.rate}%` },
          { k: 'count', label: 'Lines', align: 'r' },
          { k: 'taxable', label: 'Before tax', align: 'r', render: (r) => money(Math.round(r.taxable)) },
          { k: 'tax', label: name, align: 'r', render: (r) => money(Math.round(r.tax)) },
        ]} />
    </div>
  );
}

export function ExchangeDifferences() {
  const { db, scope, companyName, revalueDeals, toast } = useStore();
  const [ask, setAsk] = useState(false);
  const x = exchangeDifferences(db, scope(db.invoices), rateOf);
  const realised = x.realised.reduce((a, r) => a + r.diff, 0);
  const open = x.open.reduce((a, r) => a + r.diff, 0);
  const deals = scope(db.deals, 'pipeline').filter((d) => d.status === 'open' && d.currency && rateOf(d.currency) && Math.abs(rateFor(d) - rateOf(d.currency)) > 1e-6);
  const dealGain = deals.reduce((a, d) => a + (inDoc(d, d.value) / rateOf(d.currency) - d.value), 0);
  const sign = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(Math.round(n)))}`;
  const rate = (r) => `${Number(r.fromRate.toPrecision(5))} to ${Number(r.toRate.toPrecision(5))}`;
  const cols = [
    { k: 'number', label: 'Document', render: (r) => <span className="strong">{r.number}</span> },
    { k: 'customer', label: 'Customer', value: (r) => companyName(r.companyId) },
    { k: 'currency', label: 'Currency' },
    { k: 'rates', label: 'Rate change', value: rate },
    { k: 'diff', label: 'Difference', align: 'r', render: (r) => <span style={{ color: r.diff < 0 ? 'var(--bad)' : undefined }}>{sign(r.diff)}</span> },
  ];
  return (
    <div className="stack">
      <div className="g3">
        <Kpi label="Gained or lost on payments" value={sign(realised)} note={`${x.realised.length} foreign payments`} icon="ArrowLeftRight" />
        <Kpi label="On unpaid invoices today" value={sign(open)} note={`${x.open.length} open, if paid at today's rate`} icon="Hourglass" />
        <Kpi label="On open deals today" value={sign(dealGain)} note={`${deals.length} deals have an older rate`} icon="Kanban" />
      </div>
      <Card title="Open deals" sub="Each deal keeps the rate from when it was created. Updating moves its value in reports to today's rate, and the amount in its own currency stays the same." action={<Btn disabled={!deals.length} icon="RefreshCw" onClick={() => setAsk(true)}>Update {deals.length} deals</Btn>}><div className="small muted">Rates are simulated, so these amounts show how this works rather than real gains or losses.</div></Card>
      {x.realised.length > 0 && <DataTable key="real" rows={x.realised} exportName="exchange-differences-paid" noSearch initialSort={{ k: 'diff', dir: 'desc' }} columns={cols} />}
      {x.open.some((r) => Math.abs(r.diff) > 0.005) && <DataTable key="open" rows={x.open.filter((r) => Math.abs(r.diff) > 0.005)} exportName="exchange-differences-open" noSearch initialSort={{ k: 'diff', dir: 'desc' }} columns={cols} />}
      {ask && <Confirm title={`Update ${deals.length} deals to today's rates?`} text={`Their value in reports changes by ${sign(dealGain)} in total. Amounts in their own currency don't change.`} confirmLabel="Update" onClose={() => setAsk(false)} onConfirm={() => { revalueDeals(deals.map((d) => d.id)); toast(`${deals.length} deals updated`); }} />}
    </div>
  );
}

export function PersonalFormats() {
  const { prefs, savePrefs, toast, db } = useStore();
  const v = { locale: prefs.locale || '', weekStart: prefs.weekStart || '' };
  const sample = new Intl.NumberFormat(prefs.locale || db.settings.locale || 'en-US').format(1234567.5);
  return (
    <Card title="My number and date format" sub={`Only for you. This looks like ${sample}.`}>
      <FormFields values={v} onChange={(k, x) => { savePrefs({ [k]: x }); toast('Format saved'); }} fields={[
        { k: 'locale', label: 'Number and date format', type: 'select', list: 'locale', blankLabel: 'Same as the company', full: true },
        { k: 'weekStart', label: 'Week starts on', type: 'select', blankLabel: 'Same as the company', full: true, options: ['Sunday', 'Monday', 'Saturday'] },
      ]} />
    </Card>
  );
}
