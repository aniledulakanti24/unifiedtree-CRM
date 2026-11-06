// Simulated sign-in rules. They run in the browser, so they show how real security would behave
// but don't protect the data, which stays readable in this browser's storage.
import { demoHash } from './engine';

export const DEMO_IP = '203.0.113.24';

export const secOf = (s = {}) => ({
  passwordPolicy: { min: 8, number: true, symbol: false, days: 0, ...(s.passwordPolicy || {}) },
  lockAfter: s.lockAfter ?? 5,
  lockMinutes: s.lockMinutes ?? 15,
  sessionTimeout: s.sessionTimeout ?? 0,
  twoStep: s.twoStep ?? 'off',
  sso: { google: true, microsoft: true, saml: false, ...(s.sso || {}) },
  ipAllow: s.ipAllow ?? '',
  backupFreq: s.backupFreq ?? 'Daily',
  backupKeep: s.backupKeep ?? 7,
  backupWeeks: s.backupWeeks ?? 4,
  backupMonths: s.backupMonths ?? 6,
  backupOffsite: s.backupOffsite ?? false,
  blockCommon: s.blockCommon ?? true,
  noReuse: s.noReuse ?? 3,
  hours: { on: false, roles: ['sales'], from: '07:00', to: '21:00', days: [1, 2, 3, 4, 5], ...(s.hours || {}) },
  maxSessions: s.maxSessions ?? 0,
  rememberDays: s.rememberDays ?? 30,
  newDeviceAlert: s.newDeviceAlert ?? true,
});

// Passwords people pick most often. Attackers try these first.
const COMMON = ['password', 'password1', 'password123', '123456', '12345678', '123456789', '1234567890', 'qwerty', 'qwerty123', 'abc123', '111111', '123123', 'letmein', 'welcome', 'welcome1', 'welcome123', 'admin', 'admin123', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'master', 'shadow', 'superman', 'trustno1', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'changeme', 'secret', 'login', 'starwars', 'zaq12wsx', '1q2w3e4r', 'qazwsx', 'asdfgh', 'demo1234', 'test1234', 'company1', 'summer2024', 'winter2024', 'spring2025', 'autumn2025', 'crm12345'];
export const passwordProblem = (policy, text = '', ctx = {}) => {
  if (text.length < policy.min) return `Use at least ${policy.min} characters.`;
  if (policy.number && !/\d/.test(text)) return 'Include at least one number.';
  if (policy.symbol && !/[^A-Za-z0-9]/.test(text)) return 'Include at least one symbol.';
  const low = text.toLowerCase();
  if (ctx.blockCommon !== false && (COMMON.includes(low) || COMMON.includes(low.replace(/[!@#$%^&*.]+$/, '')))) return 'That password is one of the most common ones. Pick something harder to guess.';
  const name = String(ctx.email || '').split('@')[0].toLowerCase();
  if (ctx.blockCommon !== false && name.length >= 3 && low.includes(name)) return "Don't use your email name in your password.";
  if (ctx.history?.length && ctx.history.slice(0, ctx.noReuse || 3).includes(demoHash(text))) return `Pick a password you haven't used in your last ${ctx.noReuse || 3}.`;
  return '';
};
export const passwordRules = (sec, user) => ({ blockCommon: sec.blockCommon, noReuse: sec.noReuse, email: user?.email, history: user?.passHistory || [] });
export const policyText = (policy) => [`At least ${policy.min} characters`, policy.number && 'a number', policy.symbol && 'a symbol'].filter(Boolean).join(', ');

export const passwordExpired = (user, policy) => {
  if (user.mustChangePassword) return true;
  if (!policy.days) return false;
  if (!user.passChangedAt) return false;
  return (Date.now() - new Date(user.passChangedAt).getTime()) / 864e5 > policy.days;
};
export const needsTwoStep = (user, sec) => sec.twoStep === 'all' || (sec.twoStep === 'admins' && user.role === 'admin') || !!user.twoStep;
export const ipBlocked = (user, sec) => {
  // Admins are never blocked, so a wrong list can't lock everyone out.
  const allowed = sec.ipAllow.split(/[\s,]+/).filter(Boolean);
  return !!allowed.length && user.role !== 'admin' && !allowed.some((a) => DEMO_IP.startsWith(a));
};
// Sign-in hours: outside them, people in the chosen roles can't sign in. Admins always can.
export const hoursBlocked = (user, sec, at = new Date()) => {
  const h = sec.hours;
  if (!h.on || user.role === 'admin' || !(h.roles || []).includes(user.customRole || user.role)) return '';
  const mins = at.getHours() * 60 + at.getMinutes();
  const toMin = (t) => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
  if (!(h.days || []).includes(at.getDay()) || mins < toMin(h.from) || mins >= toMin(h.to)) return `Sign-in for your role is allowed ${h.from} to ${h.to} on working days set by your admin.`;
  return '';
};

// Authenticator apps (Google, Microsoft and others) use time-based codes. This is the real method, worked out in the browser.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const newSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = '';
  bytes.forEach((x) => { bits += x.toString(2).padStart(8, '0'); });
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
};
const fromB32 = (s) => {
  let bits = '';
  for (const c of String(s).replace(/[\s=]/g, '').toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
};
export const totpAt = async (secret, t = Date.now()) => {
  const counter = Math.floor(t / 1000 / 30);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', fromB32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
};
// Accepts the code from 30 seconds either side, as phone clocks drift a little.
export const verifyTotp = async (secret, code) => {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  for (const step of [-1, 0, 1]) if ((await totpAt(secret, Date.now() + step * 30000)) === c) return true;
  return false;
};
export const otpUrl = (secret, email, issuer) => `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
export const recoveryCodes = () => Array.from({ length: 8 }, () => { const b = crypto.getRandomValues(new Uint8Array(5)); const s = [...b].map((x) => B32[x % 32]).join('').toLowerCase(); return `${s.slice(0, 5)}-${String(1000 + (b[0] * b[1]) % 9000)}`; });
const TRUST = (id) => `unifiedtree-crm-trust-${id}`;
export const trusted = (id) => { try { return Number(localStorage.getItem(TRUST(id)) || 0) > Date.now(); } catch { return false; } };
export const trustDevice = (id, days) => { try { localStorage.setItem(TRUST(id), String(Date.now() + days * 864e5)); } catch { /* storage may be blocked */ } };

// Things an Admin should look at, worked out from sign-ins and the change history.
export const securityEvents = (db) => {
  const out = [];
  const log = db.loginLog || [];
  const name = (id) => db.users.find((u) => u.id === id)?.name || 'Someone';
  const fails = log.filter((x) => x.result === 'Failed').sort((a, b) => a.at.localeCompare(b.at));
  const seen = new Set();
  fails.forEach((x, i) => {
    const key = x.userId || x.email;
    const burst = fails.slice(i).filter((y) => (y.userId || y.email) === key && new Date(y.at) - new Date(x.at) <= 15 * 6e4);
    if (burst.length >= 3 && !seen.has(`${key}${x.at.slice(0, 13)}`)) { seen.add(`${key}${x.at.slice(0, 13)}`); out.push({ at: burst[burst.length - 1].at, level: 'High', kind: 'Sign-in', text: `${burst.length} wrong passwords in 15 minutes for ${x.userId ? name(x.userId) : x.email || 'an unknown email'}` }); }
  });
  log.filter((x) => x.result === 'Locked').forEach((x) => out.push({ at: x.at, level: 'High', kind: 'Sign-in', text: `${name(x.userId)}'s account was locked` }));
  log.filter((x) => x.result === 'Blocked').forEach((x) => out.push({ at: x.at, level: 'Medium', kind: 'Sign-in', text: `Blocked sign-in for ${x.userId ? name(x.userId) : x.email}: ${x.reason || 'network address or hours'}` }));
  log.filter((x) => x.newDevice).forEach((x) => out.push({ at: x.at, level: 'Low', kind: 'Sign-in', text: `${name(x.userId)} signed in from a new device: ${x.device}, ${x.ip}` }));
  (db.audit || []).forEach((a) => {
    if (a.action === 'Export') { const n = Number(a.changes?.[0]?.to) || 0; if (n >= 100) out.push({ at: a.at, level: n >= 500 ? 'High' : 'Medium', kind: 'Data', text: `${name(a.userId)} exported ${n} records (${a.label})` }); }
    if (a.action === 'Erase') out.push({ at: a.at, level: 'Medium', kind: 'Privacy', text: `${name(a.userId)} erased a person's details` });
    if (a.entity === 'recycleBin' && a.action === 'Delete') out.push({ at: a.at, level: 'Medium', kind: 'Data', text: `${name(a.userId)} deleted for good: ${a.label}` });
    if (a.entity === 'users' && (a.changes || []).some((c) => ['Role', 'Active', 'Two-step sign-in', 'Authenticator app'].includes(c.field) || c.to === 'Reset by admin')) out.push({ at: a.at, level: 'Medium', kind: 'People', text: `${name(a.userId)} changed ${a.label}: ${a.changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(', ')}` });
    if (['permissions', 'access'].includes(a.entity)) out.push({ at: a.at, level: 'Medium', kind: 'Access', text: `${name(a.userId)} changed access: ${a.label}` });
    if (a.entity === 'settings' && (a.changes || []).some((c) => /password|lock|two|sso|ip|session|hours|reuse|common/i.test(c.field))) out.push({ at: a.at, level: 'Low', kind: 'Rules', text: `${name(a.userId)} changed sign-in rules: ${a.changes.map((c) => c.field).join(', ')}` });
  });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
};
export const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));
export const tempPassword = () => `Temp-${Math.floor(1000 + Math.random() * 9000)}${String.fromCharCode(97 + Math.floor(Math.random() * 26))}`;
export const deviceName = () => {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  return `${browser} on ${os}`;
};

// A plain checklist, so an Admin sees what to turn on next.
export const healthOf = (settings, backups = []) => {
  const sec = secOf(settings);
  const last = backups[0]?.at;
  const days = last ? (Date.now() - new Date(last).getTime()) / 864e5 : Infinity;
  const items = [
    { k: 'passwords', label: 'Passwords are required at login', ok: !!settings.requirePasswords, fix: 'Turn on Require passwords' },
    { k: 'strong', label: 'Passwords have 10 or more characters and a number', ok: sec.passwordPolicy.min >= 10 && sec.passwordPolicy.number, fix: 'Strengthen the password rule' },
    { k: 'twoStep', label: 'Two-step sign-in is on for admins or everyone', ok: sec.twoStep !== 'off', fix: 'Turn on two-step sign-in' },
    { k: 'lock', label: 'Accounts lock after repeated wrong passwords', ok: sec.lockAfter > 0, fix: 'Set a lockout limit' },
    { k: 'common', label: 'Common and reused passwords are refused', ok: sec.blockCommon && sec.noReuse > 0, fix: 'Turn on password checks' },
    { k: 'alerts', label: 'People are told about sign-ins from new devices', ok: sec.newDeviceAlert, fix: 'Turn on new-device alerts' },
    { k: 'timeout', label: 'Idle sessions sign out automatically', ok: sec.sessionTimeout > 0, fix: 'Set an idle time limit' },
    { k: 'backup', label: 'A backup was taken in the last 7 days', ok: days <= 7, fix: 'Take a backup' },
    { k: 'offsite', label: 'Backups have an off-site copy', ok: sec.backupOffsite, fix: 'Turn on off-site copies' },
  ];
  return { items, score: Math.round((items.filter((i) => i.ok).length / items.length) * 100) };
};
