// A pretend connection to another system. There is no network: incoming data is made up here,
// then saved like any record, so people can see how a real sync would change the CRM.
import { addDays, rateOf, today, uid } from './util';
import { withDelta } from './stock';
import { scoreLead } from './engine';
import { conflictOf, issueOf } from './connTools';

export const AUTO_SYNC = [['Off', 0], ['Every 15 minutes', 15], ['Every hour', 60], ['Every day', 1440]];
export const nextSyncAt = (auto, from = Date.now()) => {
  const mins = AUTO_SYNC.find(([k]) => k === auto)?.[1];
  return mins ? new Date(from + mins * 6e4).toISOString() : null;
};

const NEXT = { 'Picked up': 'In Transit', 'In Transit': 'Delivered', Delayed: 'In Transit' };
const SAMPLE_PEOPLE = [['Maya Lindgren', 'Nordlys Foods'], ['Tariq Haddad', 'Sahel Logistics'], ['Ines Carvalho', 'Porto Textiles'], ['Kenji Mori', 'Hikari Devices'], ['Amara Obi', 'Lagos Retail'], ['Lucas Meyer', 'Alpen Medical']];
const pickSome = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const fresh = (rows, since) => (since ? rows.filter((r) => (r.createdAt || r.date || r.at || '') >= since) : rows);

const incoming = {
  // Payments recorded in the other system reach the invoice here.
  payments: (d, conn, ctx) => {
    const open = d.invoices.filter((i) => i.total - (i.paid || 0) > 0.005);
    pickSome(open, 2).forEach((inv, n) => {
      const bal = inv.total - (inv.paid || 0);
      const amount = n === 0 ? bal : bal / 2;
      const paid = (inv.paid || 0) + amount;
      d.payments = [{ id: uid('pay'), number: `PAY-${3100 + d.payments.length}`, invoiceId: inv.id, companyId: inv.companyId, ownerId: inv.ownerId, currency: inv.currency || '', fxRate: inv.fxRate || 1, rateAtPayment: inv.currency ? rateOf(inv.currency) || inv.fxRate || 1 : 1, amount, method: `${conn.provider} (simulated)`, date: today(), source: conn.provider, createdAt: new Date().toISOString() }, ...d.payments];
      ctx.applyUpdate(d, 'invoices', inv.id, { paid, status: paid >= inv.total - 0.005 ? 'Paid' : 'Partially paid' });
    });
    return Math.min(open.length, 2);
  },
  // Stock counts from the warehouse system replace what the CRM shows.
  products: (d, conn, ctx) => {
    // A price changed in both places. With "Ask me each time" a person decides; otherwise the rule decides.
    const clash = pickSome(d.products.filter((p) => Number(p.price) > 0), 1)[0];
    if (clash) {
      const theirs = Math.round(clash.price * 1.05 * 100) / 100;
      if (conn.conflict === 'Ask me each time') { d.syncConflicts = [conflictOf(ctx.app, conn, 'products', clash, 'price', 'Price', theirs), ...(d.syncConflicts || [])].slice(0, 100); ctx.run.conflicts = (ctx.run.conflicts || 0) + 1; }
      else if (conn.conflict !== 'CRM wins') ctx.applyUpdate(d, 'products', clash.id, { price: theirs }, 'Sync');
    }
    const list = pickSome(d.products.filter((p) => p.tracked), 3);
    const stamp = new Date().toISOString();
    list.forEach((p) => {
      const change = Math.max(-p.stock, Math.floor(Math.random() * 31) - 10) || 5;
      const patch = withDelta(p, p.warehouseId, change);
      d.products = d.products.map((x) => (x.id === p.id ? { ...x, ...patch, syncedAt: stamp } : x));
      d.stockMoves = [{ id: uid('m'), productId: p.id, type: 'Sync', qty: change, reason: `From ${conn.provider} (simulated)`, userId: ctx.userId, warehouseId: p.warehouseId, date: today() }, ...d.stockMoves];
    });
    return list.length;
  },
  shipments: (d, conn, ctx) => {
    const list = pickSome(d.shipments.filter((s) => NEXT[s.status]), 2);
    list.forEach((s) => {
      const status = NEXT[s.status];
      ctx.applyUpdate(d, 'shipments', s.id, { status, log: [...(s.log || []), { label: status, at: today() }], source: conn.provider });
      const all = d.shipments.filter((x) => x.orderId === s.orderId);
      if (status === 'Delivered' && all.every((x) => x.status === 'Delivered')) ctx.applyUpdate(d, 'orders', s.orderId, { status: 'Completed' });
    });
    return list.length;
  },
  leads: (d, conn, ctx) => {
    const owner = d.users.find((u) => u.role === 'sales' && u.active);
    const list = pickSome(SAMPLE_PEOPLE, 2);
    // Now and then a record arrives without any way to reach the person, so it waits for someone to decide.
    if (Math.random() < 0.5) { const [name, company] = pickSome(SAMPLE_PEOPLE, 1)[0]; d.syncIssues = [issueOf(ctx.app, conn, 'leads', `${name}, ${company}`, 'No email or phone, so it was skipped', { name, company }), ...(d.syncIssues || [])].slice(0, 100); ctx.run.issues = (ctx.run.issues || 0) + 1; }
    list.forEach(([name, company]) => {
      const lead = { id: uid('le'), name, company, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phone: '', status: 'New', source: conn.provider, ownerId: owner?.id, expected: 5000, createdAt: new Date().toISOString() };
      d.leads = [{ ...lead, score: scoreLead(lead) }, ...d.leads];
    });
    return list.length;
  },
  activities: (d, conn) => {
    const owner = d.users.find((u) => u.role === 'sales' && u.active);
    d.activities = [{ id: uid('ac'), typeId: d.activityTypes[0]?.id, summary: `Project update from ${conn.provider}`, due: addDays(1), ownerId: owner?.id, note: 'Simulated task from the connected system.', status: 'todo', priority: 'Medium', tag: 'Sales', createdAt: new Date().toISOString() }, ...d.activities];
    return 1;
  },
  events: (d, conn) => {
    const owner = d.users.find((u) => u.role === 'sales' && u.active);
    const start = new Date(Date.now() + 2 * 864e5);
    start.setHours(10, 0, 0, 0);
    d.events = [{ id: uid('ev'), title: `Meeting from ${conn.provider}`, category: 'Meeting', start: start.toISOString(), end: new Date(start.getTime() + 18e5).toISOString(), ownerId: owner?.id, createdAt: new Date().toISOString() }, ...d.events];
    return 1;
  },
};

export function runSimulatedSync(d, app, conn, trigger, ctx) {
  const at = new Date().toISOString();
  const run = { id: uid('sr'), appKey: app.k, appName: app.name, provider: conn.provider, at, trigger, status: 'Success', inCount: 0, outCount: 0, lines: [], errors: [], by: ctx.userId };
  if (conn.failNext) {
    run.status = 'Failed';
    run.errors.push(`${conn.provider} could not be reached (simulated). Nothing changed. Try again.`);
  } else {
    app.data.filter(([k]) => !(conn.off || []).includes(k)).forEach(([k, label, way, entity]) => {
      if (way === 'In') {
        const handler = incoming[entity];
        const count = handler ? handler(d, conn, { ...ctx, app, run }) : 0;
        run.inCount += count;
        run.lines.push({ label, way, count, text: count ? `${count} updated in the CRM` : 'Already up to date' });
      } else {
        const count = fresh(d[entity] || [], conn.lastSync).length;
        run.outCount += count;
        run.lines.push({ label, way, count, text: count ? `${count} would be sent. Nothing really left the CRM.` : 'Nothing new to send' });
      }
    });
  }
  d.syncRuns = [run, ...(d.syncRuns || [])].slice(0, 200);
  d.connections = { ...d.connections, [app.k]: { ...conn, failNext: false, lastSync: run.status === 'Failed' ? conn.lastSync : at, lastAttempt: at, lastStatus: run.status, nextSync: nextSyncAt(conn.auto) } };
  return run;
}
