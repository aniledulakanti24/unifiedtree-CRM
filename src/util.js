export const DAY = 864e5;
export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s) => (s && s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s));
export const addDays = (n, from = new Date()) => iso(new Date(from.getTime() + n * DAY));
export const today = () => iso(new Date());

let currency = 'USD';
export const setCurrency = (c) => { currency = c || 'USD'; };
export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(n) < 1000 && n % 1 ? 2 : 0 }).format(n || 0);
export const moneyK = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const num = (n) => new Intl.NumberFormat('en-US').format(n || 0);
export const pct = (n) => `${Math.round(n || 0)}%`;
export const fmtDate = (s) => (s ? parseD(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtShort = (s) => (s ? parseD(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
export const fmtDT = (s) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtTime = (s) => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const monthKey = (s) => (s || '').slice(0, 7);
export const monthLabel = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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
