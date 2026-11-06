export const DAY = 864e5;
export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s) => (s && s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s));
export const addDays = (n, from = new Date()) => iso(new Date(from.getTime() + n * DAY));
export const today = () => iso(new Date());

let currency = 'USD';
export const setCurrency = (c) => { currency = c || 'USD'; };
let locale = 'en-US';
let weekStart = 0;
export const setRegion = (code, week) => {
  try { locale = Intl.getCanonicalLocales(code || 'en-US')[0]; } catch { locale = 'en-US'; }
  weekStart = Math.max(0, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(week));
};
export const getLocale = () => locale;
export const getWeekStart = () => weekStart;
export const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: Math.abs(n) < 1000 && n % 1 ? 2 : 0 }).format(n || 0);
export const moneyK = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const num = (n) => new Intl.NumberFormat(locale).format(n || 0);
export const pct = (n) => `${Math.round(n || 0)}%`;
export const fmtDate = (s) => (s ? parseD(s).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtShort = (s) => (s ? parseD(s).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '—');
export const fmtDT = (s) => (s ? new Date(s).toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtTime = (s) => new Date(s).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
export const monthKey = (s) => (s || '').slice(0, 7);
export const monthLabel = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
export const lastMonths = (n) => {
  const out = []; const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(iso(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7));
  return out;
};
export const nextMonths = (n) => {
  const out = []; const d = new Date();
  for (let i = 0; i < n; i++) out.push(iso(new Date(d.getFullYear(), d.getMonth() + i, 1)).slice(0, 7));
  return out;
};
export const relTime = (s) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return fmtDate(s);
};
// A line's value after its discount, before tax.
export const lineTotal = (i) => Math.round((Number(i.qty) || 0) * (Number(i.price) || 0) * (100 - (Number(i.discount) || 0))) / 100;
// The next document number. Uses the highest in the list, so a deleted record can't cause a repeat.
export const nextNo = (list, prefix, base) => {
  const top = (list || []).reduce((a, r) => Math.max(a, Number(String(r.number || '').match(/(\d+)$/)?.[1]) || 0), base - 1);
  return `${prefix}${top + 1}`;
};
export const nextDate = (date, freq) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + (freq === 'Yearly' ? 12 : freq === 'Quarterly' ? 3 : 1));
  return d.toISOString().slice(0, 10);
};
export const priceListDiscount = (settings, list) => Number((settings.priceLists ?? { Partner: 10, Enterprise: 15 })[list]) || 0;
export const discountIssue = (lines, settings, role) => {
  const top = settings.maxDiscount ?? 20;
  const over = role === 'sales' && lines.find((l) => (Number(l.discount) || 0) > top);
  return over ? `${over.name} has ${over.discount}% off. You can give up to ${top}%, so ask a manager to place this.` : '';
};
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Stored amounts are always in the main currency, so reports add up. A record also keeps its own
// currency and the rate at that time, which is how it's shown to people and customers.
// Standard rates per 1 USD. These are sample figures, not live market data.
export const FX_USD = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151, CNY: 7.2, AUD: 1.52, CAD: 1.37, CHF: 0.88, INR: 83.5, SGD: 1.35, HKD: 7.8, AED: 3.67, SAR: 3.75, ZAR: 18.5, BRL: 5.4, MXN: 18, KRW: 1370, SEK: 10.6, NOK: 10.8, DKK: 6.9, NZD: 1.66, PLN: 3.95, TRY: 34, IDR: 15900, MYR: 4.5, THB: 34.5, PHP: 58, NGN: 1500, KES: 129, EGP: 49 };
let fxRates = {};
export const setFx = (rates) => { fxRates = rates || {}; };
export const mainCurrency = () => currency;
export const standardRate = (cur, base = currency) => (FX_USD[cur] && FX_USD[base] ? FX_USD[cur] / FX_USD[base] : 0);
// How much of this currency one unit of the main currency buys. 0 means no rate is known yet.
export const rateOf = (cur) => {
  if (!cur || cur === currency) return 1;
  return fxRates[cur] > 0 ? fxRates[cur] : standardRate(cur);
};
export const moneyIn = (cur, n) => new Intl.NumberFormat(locale, { style: 'currency', currency: cur || currency, maximumFractionDigits: Math.abs(n) < 1000 && n % 1 ? 2 : 0 }).format(n || 0);
export const docCur = (rec) => rec?.currency || currency;
export const rateFor = (rec) => (rec?.currency && rec.currency !== currency ? rec.fxRate || rateOf(rec.currency) || 1 : 1);
export const inDoc = (rec, n) => (Number(n) || 0) * rateFor(rec);
export const docMoney = (rec, n) => moneyIn(docCur(rec), inDoc(rec, n));
export const fxFields = (cur) => (cur && cur !== currency ? { currency: cur, fxRate: rateOf(cur) } : { currency: '', fxRate: 1 });
export const repriceItems = (items, from, to) => items.map((i) => ({ ...i, price: round2((i.price / (rateOf(from) || 1)) * (rateOf(to) || 1)) }));
// A deal form is filled in using the deal's own currency.
export const dealToForm = (d) => ({ ...d, currency: d.currency || '', value: round2(inDoc(d, d.value)) });
export const dealFromForm = (v, prev, company) => {
  const cur = v.currency || company?.currency || currency;
  const fx = fxFields(cur);
  if (prev && (prev.currency || '') === fx.currency) fx.fxRate = rateFor(prev);
  const typed = Number(v.value) || 0;
  const same = prev && (prev.currency || '') === fx.currency && round2(inDoc(prev, prev.value)) === typed;
  return { ...v, ...fx, value: same ? prev.value : typed / (fx.fxRate || 1) };
};
export const NO_RATE = 'This currency has no exchange rate yet. Add one under Settings, Currencies.';
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
export const initials = (name = '') => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const humanize = (k) => k.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const TONES = {
  good: ['Won', 'Paid', 'Delivered', 'Completed', 'Active', 'Approved', 'Closed', 'Accepted', 'Customer', 'In stock', 'On route', 'In contract', 'Qualified', 'Available', 'Converted'],
  warn: ['Pending', 'Processing', 'Sent', 'In Transit', 'Partially paid', 'Low stock', 'Warm', 'Medium', 'Proposition', 'Negotiation', 'Draft', 'Loading', 'Assigned', 'Contacted', 'High'],
  bad: ['Lost', 'Overdue', 'Cancelled', 'Declined', 'Out of stock', 'Rejected', 'Urgent', 'Hot', 'Expired', 'Delayed', 'Maintenance', 'Unqualified', 'Failed'],
  info: ['New', 'Open', 'Shipped', 'Prospect', 'Cold', 'Picked up', 'Normal', 'Idle'],
};
export const toneOf = (v) => { for (const [t, list] of Object.entries(TONES)) if (list.includes(v)) return t; return 'muted'; };

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function downloadCsv(name, rows) {
  const safe = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  downloadBlob(new Blob([rows.map((r) => r.map(safe).join(',')).join('\n')], { type: 'text/csv' }), `${name}.csv`);
}
