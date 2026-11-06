// How each delivery is doing against what was promised, and the sums behind the Logistics reports.
import { addDays, today } from './util';

export const deliveredOn = (s) => (s.log || []).find((x) => x.label === 'Delivered')?.at || null;
export const promisedOf = (s) => s.promisedEta || s.eta;
export const deliveryState = (s, now = today()) => {
  if (s.status === 'Delivered') return (deliveredOn(s) || now) <= promisedOf(s) ? 'On time' : 'Late';
  if (s.status === 'Delayed') return 'Delayed';
  if (promisedOf(s) < now) return 'Overdue';
  if (promisedOf(s) <= addDays(1) && s.status === 'Picked up') return 'At risk';
  return 'On track';
};
export const STATE_TONE = { 'On time': 'good', 'On track': 'good', 'At risk': 'warn', Late: 'bad', Delayed: 'bad', Overdue: 'bad' };
export const needsAttention = (s) => ['Delayed', 'Overdue', 'At risk'].includes(deliveryState(s));

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
export const groupStats = (rows, keyOf) => {
  const groups = new Map();
  rows.forEach((s) => { const k = keyOf(s) || 'Unknown'; groups.set(k, [...(groups.get(k) || []), s]); });
  return [...groups.entries()].map(([name, list]) => {
    const done = list.filter((s) => s.status === 'Delivered');
    const onTime = done.filter((s) => deliveryState(s) === 'On time').length;
    const days = done.filter((s) => deliveredOn(s) && s.shipDate).map((s) => daysBetween(s.shipDate, deliveredOn(s)));
    const cost = list.reduce((a, s) => a + (s.cost || 0), 0);
    return { id: name, name, count: list.length, delivered: done.length, onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null, avgDays: days.length ? days.reduce((a, d) => a + d, 0) / days.length : null, cost, costEach: list.length ? cost / list.length : 0, open: list.length - done.length };
  });
};

export const CAPACITY_KG = { 'Heavy truck': 8000, 'Box van': 1500, Trailer: 12000, Pickup: 800 };
export const capacityOf = (v) => Number(v?.capacityKg) || CAPACITY_KG[v?.type] || 2000;
export const trackUrl = (tracking) => `${location.origin}${location.pathname}#/track/${tracking}`;

// Gives the sample company's shipments the details the reports need, once. Status and dates stay as they are.
export const upgradeSampleShipments = (d) => {
  if (d.shipV1) return d;
  const shipments = (d.shipments || []).map((s, i) => {
    if (s.weightKg) return s;
    const shipped = new Date(s.shipDate).getTime();
    const delivered = (s.log || []).find((x) => x.label === 'Delivered')?.at;
    const next = { ...s, weightKg: 20 + ((i * 37) % 480), cost: 60 + ((i * 53) % 640), lateAlerted: true, promisedEta: delivered ? new Date(shipped + (3 + (i % 4)) * 864e5).toISOString().slice(0, 10) : s.eta };
    if (s.status === 'Delayed') next.delayReason = ['Weather', 'Customs', 'Vehicle problem', 'Address problem'][i % 4];
    if (s.status === 'Delivered') {
      const c = d.contacts.find((x) => x.companyId === s.companyId);
      next.pod = { signedBy: c ? `${c.first} ${c.last}` : 'Reception', at: delivered, note: i % 7 === 0 ? 'Left with reception' : '' };
    }
    return next;
  });
  return { ...d, shipV1: true, shipments };
};
