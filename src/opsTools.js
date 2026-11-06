// Orders, billing, stock and buying live in other systems. The CRM reads them, and asks other teams for changes.
import { APPS } from './apps';
import { OPEN_PO, stockAt } from './stock';

export const AREAS = { billing: 'Billing', orders: 'Orders', inventory: 'Stock', purchasing: 'Purchasing', logistics: 'Shipping', other: 'Other' };
export const REQUEST_TYPES = [
  { k: 'quote', label: 'Prepare a quote', area: 'billing' },
  { k: 'discount', label: 'Approve a discount', area: 'billing' },
  { k: 'credit', label: 'Issue a credit note', area: 'billing' },
  { k: 'chase', label: 'Chase a payment', area: 'billing' },
  { k: 'invoice', label: 'Fix an invoice', area: 'billing' },
  { k: 'order', label: 'Change an order', area: 'orders' },
  { k: 'cancel', label: 'Cancel an order', area: 'orders' },
  { k: 'stock', label: 'Check or move stock', area: 'inventory' },
  { k: 'reorder', label: 'Reorder products', area: 'purchasing' },
  { k: 'po', label: 'Change a purchase order', area: 'purchasing' },
  { k: 'delivery', label: 'Check a delivery', area: 'logistics' },
  { k: 'other', label: 'Something else', area: 'other' },
];
export const typeLabel = (k) => REQUEST_TYPES.find((t) => t.k === k)?.label || 'Request';
export const OPEN = ['Open', 'In progress', 'Waiting for you'];
export const STATUSES = [...OPEN, 'Done', 'Declined'];
export const PRIORITY_HOURS = { Urgent: 4, High: 24, Normal: 72, Low: 168 };
export const dueOf = (r) => r.neededBy ? `${r.neededBy}T23:59:59.000Z` : new Date(new Date(r.createdAt).getTime() + (PRIORITY_HOURS[r.priority] || 72) * 36e5).toISOString();
export const isLate = (r, now = new Date().toISOString()) => OPEN.includes(r.status) && dueOf(r) < now;

// Who handles each area. The Admin can set people in Settings; otherwise Admins get everything.
export const teamFor = (db, area) => {
  const set = (db.settings.opsTeam?.[area] || []).filter((id) => db.users.some((u) => u.id === id && u.active));
  if (set.length) return set;
  return db.users.filter((u) => u.active && u.role === 'admin').map((u) => u.id);
};

// Where a kind of record comes from, if a connected system sends it in.
export const sourceFor = (db, entities) => {
  for (const app of APPS) {
    const row = (app.data || []).find(([, , way, entity]) => way === 'In' && entities.includes(entity));
    const conn = db.connections?.[app.k];
    if (row && conn?.connected) return { app, conn, label: row[1] };
  }
  const app = APPS.find((a) => (a.data || []).some(([, , way, entity]) => way === 'In' && entities.includes(entity)));
  return { app, conn: null, label: '' };
};

const OPEN_ORDER = ['Pending', 'Processing'];
// Can we deliver this many, and when? Stock on hand, less what open orders need, plus purchase orders still to arrive.
export const deliveryCheck = (db, productId, qty, whId = '') => {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return null;
  if (!p.tracked) return { p, untracked: true, ok: true, text: `${p.name} isn't counted in stock, so it can be sold any time.` };
  const onHand = whId ? stockAt(p, whId) : p.stock;
  const reserved = (db.orders || []).filter((o) => OPEN_ORDER.includes(o.status) && (!whId || !o.warehouseId || o.warehouseId === whId)).flatMap((o) => o.items || []).filter((i) => i.productId === productId).reduce((a, i) => a + (Number(i.qty) || 0), 0);
  const free = Math.max(0, onHand - reserved);
  const incoming = (db.purchaseOrders || []).filter((o) => OPEN_PO.includes(o.status) && (!whId || o.warehouseId === whId))
    .map((o) => ({ date: o.expected, number: o.number, qty: (o.items || []).filter((i) => i.productId === productId).reduce((a, i) => a + (i.qty - (i.received || 0)), 0) }))
    .filter((x) => x.qty > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const want = Number(qty) || 0;
  let have = free; let date = null; let via = null;
  if (have < want) for (const x of incoming) { have += x.qty; if (have >= want) { date = x.date; via = x.number; break; } }
  const ok = free >= want;
  return { p, onHand, reserved, free, incoming, want, ok, date, via, short: !ok && !date ? want - have : 0 };
};

// Sample requests for the demo company, once.
export const upgradeSampleOps = (d) => {
  if (d.opsV1) return d;
  const sales = d.users.filter((u) => u.active && u.role === 'sales');
  const admin = d.users.find((u) => u.active && u.role === 'admin');
  if (!sales.length || !admin) return { ...d, opsV1: true };
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const inv = (d.invoices || []).find((i) => i.total - (i.paid || 0) > 0);
  const ord = (d.orders || []).find((o) => o.status === 'Processing') || (d.orders || [])[0];
  const prod = (d.products || []).find((p) => p.tracked && p.stock <= p.reorder) || (d.products || [])[0];
  const deal = (d.deals || []).find((x) => x.status === 'open');
  const name = (id) => d.users.find((u) => u.id === id)?.name || '';
  const rows = [
    deal && { type: 'quote', area: 'billing', entity: 'deals', recordId: deal.id, recordLabel: deal.title, route: `/pipeline/${deal.id}`, companyId: deal.companyId, details: `Please prepare a quote for ${deal.title}. They asked for 12 months, paid yearly.`, priority: 'High', status: 'In progress', requestedBy: sales[0].id, createdAt: ago(20), comments: [{ by: admin.id, at: ago(18), text: 'On it. I will send it to you to check first.' }] },
    inv && { type: 'chase', area: 'billing', entity: 'invoices', recordId: inv.id, recordLabel: inv.number, route: '/billing', companyId: inv.companyId, details: `The customer says they paid ${inv.number} last week. Can you check it reached us?`, priority: 'Normal', status: 'Open', requestedBy: (sales[1] || sales[0]).id, createdAt: ago(90), comments: [] },
    ord && { type: 'order', area: 'orders', entity: 'orders', recordId: ord.id, recordLabel: ord.number, route: '/orders', companyId: ord.companyId, details: 'They want delivery split over two dates. First half as soon as possible.', priority: 'Urgent', status: 'Waiting for you', requestedBy: sales[0].id, createdAt: ago(30), comments: [{ by: admin.id, at: ago(26), text: 'Which date for the second half?' }] },
    prod && { type: 'reorder', area: 'purchasing', entity: 'products', recordId: prod.id, recordLabel: prod.name, route: '/products', details: `${prod.name} is nearly out and two customers are waiting. Please reorder 50.`, priority: 'High', status: 'Done', requestedBy: (sales[2] || sales[0]).id, createdAt: ago(120), doneAt: ago(100), resolution: 'Ordered 50 from the usual supplier, arriving in 10 days.', comments: [] },
    { type: 'discount', area: 'billing', details: 'Can we offer 15% to a new customer who is signing for three years?', priority: 'Normal', status: 'Declined', requestedBy: (sales[1] || sales[0]).id, createdAt: ago(200), doneAt: ago(180), resolution: 'Our limit is 10% for three years. Happy to approve that.', comments: [] },
  ].filter(Boolean).map((r, i) => ({ id: `rq${i + 1}`, assigneeId: admin.id, neededBy: '', ...r, requestedByName: name(r.requestedBy) }));
  return { ...d, opsV1: true, opsRequests: [...rows, ...(d.opsRequests || [])] };
};
