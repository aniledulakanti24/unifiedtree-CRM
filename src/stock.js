// Stock held in each warehouse, and the sums behind purchasing, shipping and billing.
// p.stock is always the product's total. p.stockBy holds what sits away from its home
// warehouse, and the home warehouse holds the rest. Older products simply have no stockBy.
import { addDays, inDoc, mainCurrency, sum, today } from './util';

export const splitOf = (p) => {
  const map = {};
  let home = Number(p.stock) || 0;
  Object.entries(p.stockBy || {}).forEach(([w, q]) => { if (w !== p.warehouseId && q > 0) { map[w] = q; home -= q; } });
  // Sales take stock from home first, then from the other warehouses.
  Object.keys(map).forEach((w) => {
    if (home >= 0) return;
    const take = Math.min(map[w], -home);
    map[w] -= take;
    home += take;
  });
  if (p.warehouseId) map[p.warehouseId] = Math.max(0, home);
  return map;
};
export const stockAt = (p, whId) => splitOf(p)[whId] || 0;

// The product fields to save after adding or removing stock in one warehouse.
export const withDelta = (p, whId, delta) => {
  const map = splitOf(p);
  const at = whId || p.warehouseId;
  map[at] = Math.max(0, (map[at] || 0) + delta);
  const stock = sum(Object.values(map));
  const stockBy = Object.fromEntries(Object.entries(map).filter(([w, q]) => w !== p.warehouseId && q > 0));
  return { stock, stockBy };
};

// Merges an order's lines and shows how much of each is still to ship, invoice or credit.
export const lineKey = (i) => `${i.productId}|${i.price}|${i.discount || 0}`;
export const remaining = (items = [], done = []) => {
  const lines = new Map();
  items.forEach((i) => {
    const k = lineKey(i);
    const cur = lines.get(k);
    lines.set(k, cur ? { ...cur, ordered: cur.ordered + i.qty } : { ...i, key: k, ordered: i.qty, done: 0 });
  });
  done.forEach((i) => { const cur = lines.get(lineKey(i)); if (cur) cur.done += i.qty; });
  return [...lines.values()].map((l) => ({ ...l, max: Math.max(0, l.ordered - l.done) }));
};
export const pickLines = (rows, qtys) => rows
  .map(({ key, ordered, done, max, ...line }) => ({ ...line, qty: Math.min(Number(qtys[key]) || 0, max) }))
  .filter((l) => l.qty > 0);

export const OPEN_PO = ['Draft', 'Awaiting approval', 'Approved', 'Sent', 'Partly received'];
export const onOrderOf = (db, productId) => sum((db.purchaseOrders || []).filter((o) => OPEN_PO.includes(o.status)).flatMap((o) => o.items).filter((i) => i.productId === productId), (i) => i.qty - (i.received || 0));

// What to buy: products at or below their reorder level, with sales speed and open orders counted.
export const reorderPlan = (db) => {
  const since = addDays(-30);
  return db.products.filter((p) => p.tracked && p.active !== false && p.stock <= p.reorder).map((p) => {
    const sold = Math.abs(sum(db.stockMoves.filter((m) => m.productId === p.id && m.type === 'Delivery' && m.date >= since), (m) => m.qty));
    const onOrder = onOrderOf(db, p.id);
    const target = Math.max(p.reorder * 2, sold);
    const supplier = (db.suppliers || []).find((s) => s.name === p.supplier);
    return { product: p, sold, onOrder, qty: Math.max(0, target - p.stock - onOrder), daysLeft: sold ? Math.floor(p.stock / (sold / 30)) : null, supplierId: supplier?.id || '' };
  }).sort((a, b) => a.product.stock - b.product.stock);
};

// Ages each open invoice by how far past its due date it is.
export const AGE_BANDS = [['current', 'Not due yet'], ['d30', '1 to 30 days'], ['d60', '31 to 60 days'], ['d90', '61 to 90 days'], ['over', 'Over 90 days']];
export const ageBand = (due, on = today()) => {
  const days = Math.floor((new Date(on) - new Date(due)) / 86400000);
  return days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'over';
};
export const receivablesOf = (invoices) => {
  const byCustomer = new Map();
  invoices.forEach((i) => {
    const bal = i.total - (i.paid || 0);
    if (bal < 0.005) return;
    const row = byCustomer.get(i.companyId) || { id: i.companyId, companyId: i.companyId, total: 0, count: 0, current: 0, d30: 0, d60: 0, d90: 0, over: 0 };
    row[ageBand(i.due)] += bal;
    row.total += bal;
    row.count += 1;
    byCustomer.set(i.companyId, row);
  });
  return [...byCustomer.values()];
};

// Everything that moved a customer's balance, oldest first, with a running balance.
export const statementOf = (db, invoices, companyId, from, to) => {
  const mine = invoices.filter((i) => i.companyId === companyId);
  const ids = new Set(mine.map((i) => i.id));
  const curs = new Set(mine.map((i) => i.currency || ''));
  const shared = curs.size === 1 && !curs.has('');
  const cur = shared ? mine[0].currency : mainCurrency();
  const conv = (invoiceId, n) => (shared ? inDoc(mine.find((i) => i.id === invoiceId), n) : n);
  const entries = [];
  mine.forEach((i) => {
    entries.push({ key: i.id, date: i.date, label: `Invoice ${i.number}`, charge: conv(i.id, i.total), credit: 0 });
    // Older invoices can show a paid amount with no receipt on file, so it still counts here.
    const linked = sum(db.payments.filter((p) => p.invoiceId === i.id), (p) => p.amount);
    const other = (i.paid || 0) - linked - (i.credited || 0);
    if (other > 0.005) entries.push({ key: `${i.id}-x`, date: i.date, label: `Payment against ${i.number}`, charge: 0, credit: conv(i.id, other) });
  });
  db.payments.filter((p) => ids.has(p.invoiceId)).forEach((p) => entries.push({ key: p.id, date: p.date, label: `Payment ${p.number} (${p.method})`, charge: 0, credit: conv(p.invoiceId, p.amount) }));
  (db.creditNotes || []).filter((c) => ids.has(c.invoiceId) && c.applied > 0).forEach((c) => entries.push({ key: c.id, date: c.date, label: `Credit note ${c.number}`, charge: 0, credit: conv(c.invoiceId, c.applied) }));
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.charge - a.charge));
  const opening = sum(entries.filter((e) => e.date < from), (e) => e.charge - e.credit);
  let running = opening;
  const rows = entries.filter((e) => e.date >= from && e.date <= to).map((e) => { running += e.charge - e.credit; return { ...e, balance: running }; });
  return { opening, rows, closing: running, cur };
};
