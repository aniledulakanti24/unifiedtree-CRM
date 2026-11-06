// Backups kept in this browser's IndexedDB. Automatic ones follow the schedule in Security.
const DB_NAME = 'unifiedtree-crm-backups';
const STORE = 'snapshots';
const COUNT_OF = ['deals', 'leads', 'contacts', 'companies', 'orders', 'invoices', 'users'];
const KEEP_MANUAL = 20;

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const done = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const countsOf = (data) => Object.fromEntries(COUNT_OF.map((k) => [k, (data?.[k] || []).length]));

export async function listBackups(orgId) {
  const db = await open();
  const all = await done(db.transaction(STORE).objectStore(STORE).getAll());
  return all.filter((b) => b.orgId === orgId).map(({ id, day, at, size, label, kind, offsite, data, sum, keep }) => ({ id, day, at, size, label: label || 'Automatic', kind: kind || 'auto', offsite: !!offsite, counts: countsOf(data), sum, keep })).sort((a, b) => b.at.localeCompare(a.at));
}

export async function readBackup(id) {
  const db = await open();
  return (await done(db.transaction(STORE).objectStore(STORE).get(id)))?.data;
}

export async function deleteBackup(id) {
  const db = await open();
  await done(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
}

export async function createBackup(orgId, data, label, offsite) {
  const db = await open();
  const at = new Date().toISOString();
  const id = `${orgId}:m:${at}`;
  const text = JSON.stringify(data);
  await done(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ id, orgId, day: at.slice(0, 10), at, data, label, kind: 'manual', offsite, size: text.length, sum: await checksum(text) }));
  const old = (await listBackups(orgId)).filter((b) => b.kind === 'manual').slice(KEEP_MANUAL);
  await Promise.all(old.map((b) => deleteBackup(b.id)));
  return id;
}

// Automatic backups: hourly, daily or weekly. Beyond the latest ones, one a week and one a month are kept longer.
export async function autoBackup(orgId, data, { freq = 'Daily', keep = 7, weeks = 4, months = 6, offsite = false } = {}) {
  if (freq === 'Off') return;
  const list = (await listBackups(orgId)).filter((b) => b.kind === 'auto');
  const gapHours = freq === 'Hourly' ? 1 : freq === 'Weekly' ? 168 : 24;
  if (list[0] && (Date.now() - new Date(list[0].at).getTime()) / 36e5 < gapHours) return;
  const at = new Date().toISOString();
  const text = JSON.stringify(data);
  const db = await open();
  await done(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ id: `${orgId}:${freq === 'Hourly' ? at.slice(0, 13) : at.slice(0, 10)}`, orgId, day: at.slice(0, 10), at, data, kind: 'auto', offsite, size: text.length, sum: await checksum(text) }));
  const all = (await listBackups(orgId)).filter((b) => b.kind === 'auto');
  const kept = new Set(all.slice(0, keep).map((b) => b.id));
  const weekOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x.toISOString().slice(0, 10); };
  const firstPer = (keyOf, n) => { const seen = new Set(); all.forEach((b) => { const k = keyOf(b.at); if (!seen.has(k) && seen.size < n) { seen.add(k); kept.add(b.id); } }); };
  firstPer(weekOf, weeks);
  firstPer((d) => d.slice(0, 7), months);
  await Promise.all(all.filter((b) => !kept.has(b.id)).map((b) => deleteBackup(b.id)));
}

// A fingerprint of the backup, so a damaged copy is noticed before it's restored.
export async function checksum(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function verifyBackup(id) {
  const data = await readBackup(id);
  const db = await open();
  const rec = await done(db.transaction(STORE).objectStore(STORE).get(id));
  if (!data || !rec) return { ok: false, text: "This backup can't be read." };
  if (!rec.sum) return { ok: true, text: 'Readable. It was taken before fingerprints were added, so it can only be checked for being readable.' };
  const now = await checksum(JSON.stringify(data));
  return now === rec.sum ? { ok: true, text: 'Intact: its fingerprint matches the one taken when it was saved.' } : { ok: false, text: "Damaged: its fingerprint doesn't match. Don't restore it." };
}
export async function storageUse() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { used: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; }
}

// A backup file can be locked with a password (AES-GCM, with the key made from the password by PBKDF2).
// In chunks, as large backups are too big to convert in one go.
const b64 = (buf) => { const bytes = new Uint8Array(buf); let out = ''; for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(out); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const keyFrom = async (password, salt) => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
export async function fileFor(data, meta, password) {
  const text = JSON.stringify(data);
  const head = { format: 'unifiedtree-crm-backup', version: 1, ...meta, sum: await checksum(text) };
  if (!password) return JSON.stringify({ ...head, data }, null, 2);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), new TextEncoder().encode(text));
  return JSON.stringify({ ...head, locked: true, salt: b64(salt), iv: b64(iv), data: b64(enc) });
}
// Reads a backup file. Older plain files (just the data) still work.
export async function readFile(text, password) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { error: "This isn't a backup file." }; }
  if (raw?.format !== 'unifiedtree-crm-backup') return raw?.users && raw?.settings ? { data: raw, meta: { label: 'Older backup file' }, checked: false } : { error: "This isn't a CRM backup file." };
  let data = raw.data;
  if (raw.locked) {
    if (!password) return { needsPassword: true, meta: raw };
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, await keyFrom(password, unb64(raw.salt)), unb64(raw.data));
      data = JSON.parse(new TextDecoder().decode(plain));
    } catch { return { needsPassword: true, wrong: true, meta: raw }; }
  }
  if (!data?.users || !data?.settings) return { error: 'The file is missing the people or settings, so it may be from another program.' };
  const ok = raw.sum ? (await checksum(JSON.stringify(data))) === raw.sum : null;
  if (ok === false) return { error: "The file's fingerprint doesn't match, so it was changed or damaged after it was saved." };
  return { data, meta: raw, checked: ok === true };
}

// What differs between a backup and now, for each kind of record.
export const COLLECTIONS = [['contacts', 'Contacts'], ['companies', 'Customers'], ['leads', 'Leads'], ['deals', 'Opportunities'], ['activities', 'Tasks'], ['events', 'Appointments'], ['cases', 'Support cases'], ['products', 'Products'], ['orders', 'Orders'], ['quotes', 'Quotes'], ['invoices', 'Invoices'], ['emails', 'Emails'], ['followups', 'Follow-ups'], ['automations', 'Workflows'], ['reports', 'Reports'], ['webForms', 'Web forms'], ['users', 'People']];
export const diffOf = (now, then) => COLLECTIONS.map(([k, label]) => {
  const a = new Map((now?.[k] || []).map((r) => [r.id, r]));
  const b = new Map((then?.[k] || []).map((r) => [r.id, r]));
  const gone = [...b.keys()].filter((id) => !a.has(id));
  const added = [...a.keys()].filter((id) => !b.has(id));
  const changed = [...b.keys()].filter((id) => a.has(id) && JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id)));
  return { k, label, now: a.size, then: b.size, gone, added, changed };
});
