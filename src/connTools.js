// What a connection server would do: webhook deliveries with retries, signed payloads, and a small API answered from CRM data.
import { uid } from './util';

// ---- Webhooks
const SAFE = ['id', 'name', 'first', 'last', 'title', 'email', 'phone', 'company', 'companyId', 'status', 'stage', 'value', 'total', 'paid', 'currency', 'closeDate', 'due', 'number', 'tracking', 'carrier', 'priority', 'source', 'ownerId', 'createdAt'];
export const payloadOf = (event, entity, rec) => ({ id: uid('evt'), event, entity, at: new Date().toISOString(), data: Object.fromEntries(SAFE.filter((k) => rec?.[k] !== undefined && rec?.[k] !== '').map((k) => [k, rec[k]])) });
const RETRY_MIN = [1, 5, 30];
// Most deliveries get a 200 back. Some fail with 500 and are tried again after 1, 5 and 30 minutes.
export const deliveryOf = (hook, event, entity, rec, label) => {
  const ok = Math.random() > 0.12;
  return { id: uid('wl'), webhookId: hook.id, event, label, at: new Date().toISOString(), payload: payloadOf(event, entity, rec), attempts: 1, code: ok ? 200 : 500, status: ok ? 'Delivered' : 'Retrying', nextRetryAt: ok ? null : new Date(Date.now() + RETRY_MIN[0] * 6e4).toISOString(), tries: [{ at: new Date().toISOString(), code: ok ? 200 : 500 }] };
};
export const retryDelivery = (x, force) => {
  const ok = force ? Math.random() > 0.05 : Math.random() > 0.3;
  const attempts = (x.attempts || 1) + 1;
  const tries = [...(x.tries || []), { at: new Date().toISOString(), code: ok ? 200 : 500 }];
  if (ok) return { ...x, attempts, tries, code: 200, status: 'Delivered', nextRetryAt: null };
  const wait = RETRY_MIN[attempts - 1];
  return wait && !force ? { ...x, attempts, tries, code: 500, status: 'Retrying', nextRetryAt: new Date(Date.now() + wait * 6e4).toISOString() } : { ...x, attempts, tries, code: 500, status: 'Failed', nextRetryAt: null };
};
export const newSecretKey = () => `whsec_${[...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
// A real HMAC-SHA256 signature over the body, as the receiving system would check it.
export const signBody = async (secret, body) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ---- API
export const API_AREAS = [['contacts', 'Contacts'], ['companies', 'Customers'], ['leads', 'Leads'], ['deals', 'Opportunities'], ['products', 'Products'], ['orders', 'Orders']];
export const ENDPOINTS = [
  ...API_AREAS.map(([k, l]) => ({ method: 'GET', path: `/v1/${k}`, area: k, label: `List ${l.toLowerCase()}` })),
  ...API_AREAS.slice(0, 4).map(([k, l]) => ({ method: 'GET', path: `/v1/${k}/{id}`, area: k, one: true, label: `One ${l.toLowerCase().replace(/s$/, '')}` })),
  { method: 'POST', path: '/v1/leads', area: 'leads', write: true, label: 'Create a lead' },
];
const clean = (r) => Object.fromEntries(SAFE.filter((k) => r[k] !== undefined && r[k] !== '').map((k) => [k, r[k]]));
// Answers a request from the CRM's own data, with the checks a real API makes. Nothing goes over the network.
export const answer = (db, key, ep, { id, body, page = 1 } = {}) => {
  const now = new Date().toISOString();
  if (!key) return { code: 401, body: { error: 'missing_key', message: 'Send your key in the Authorization header.' } };
  if (key.expires && key.expires < now.slice(0, 10)) return { code: 401, body: { error: 'key_expired', message: `This key expired on ${key.expires}.` } };
  const scopes = key.scopes || API_AREAS.flatMap(([k]) => [`${k}:read`, ...(key.access === 'Read and write' ? [`${k}:write`] : [])]);
  const need = `${ep.area}:${ep.write ? 'write' : 'read'}`;
  if (!scopes.includes(need)) return { code: 403, body: { error: 'missing_scope', message: `This key can't ${ep.write ? 'change' : 'read'} ${ep.area}. It needs ${need}.` } };
  const list = db[ep.area] || [];
  if (ep.write) {
    const b = body || {};
    const errors = [];
    if (!String(b.name || '').trim()) errors.push({ field: 'name', message: 'is required' });
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) errors.push({ field: 'email', message: 'is not a valid email' });
    if (errors.length) return { code: 422, body: { error: 'invalid', errors } };
    return { code: 201, create: { name: String(b.name).trim(), company: b.company || '', email: b.email || '', phone: b.phone || '', status: 'New', source: 'API', expected: Number(b.expected) || 0 }, body: { message: 'Created' } };
  }
  if (ep.one) {
    const r = list.find((x) => x.id === id);
    return r ? { code: 200, body: { data: clean(r) } } : { code: 404, body: { error: 'not_found', message: `No ${ep.area.replace(/s$/, '')} with id ${id || '(empty)'}.` } };
  }
  const size = 5;
  const rows = list.slice((page - 1) * size, page * size).map(clean);
  return { code: 200, body: { data: rows, page, per_page: size, total: list.length, has_more: page * size < list.length } };
};

// ---- Conflicts and records a sync couldn't take
export const conflictOf = (app, conn, entity, rec, field, fieldLabel, theirs) => ({ id: uid('cf'), appKey: app.k, appName: app.name, provider: conn.provider, entity, recId: rec.id, label: rec.name || rec.title || rec.number || rec.id, field, fieldLabel, ours: rec[field], theirs, at: new Date().toISOString() });
export const issueOf = (app, conn, kind, label, reason, payload) => ({ id: uid('si'), appKey: app.k, appName: app.name, provider: conn.provider, kind, label, reason, payload, at: new Date().toISOString() });
