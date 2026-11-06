// Which kind of alert something is, worked out from where it links to, and each person's choices.
export const ALERT_KINDS = [
  { k: 'sales', label: 'Sales and customers', hint: 'Leads, deals and customers' },
  { k: 'tasks', label: 'Tasks and reminders', hint: 'Follow-ups and due tasks' },
  { k: 'calendar', label: 'Meetings', hint: 'Requests and changes' },
  { k: 'approvals', label: 'Approvals and transfers', hint: 'Things waiting for a decision' },
  { k: 'messages', label: 'Messages and calls', hint: 'Chat, WhatsApp, email and calls' },
  { k: 'orders', label: 'Orders, billing and stock', hint: 'Low stock, payments and deliveries' },
  { k: 'system', label: 'Security and connections', hint: "Can't be turned off", locked: true },
  { k: 'general', label: 'Everything else', hint: 'Reports and other updates' },
];
const ROUTES = {
  sales: ['/pipeline', '/leads', '/customers', '/contacts', '/webforms'],
  tasks: ['/followups', '/tasks'],
  calendar: ['/meetings', '/calendar'],
  approvals: ['/approvals', '/transfers'],
  messages: ['/messages', '/whatsapp', '/emails', '/calls', '/ai-voice', '/cases'],
  orders: ['/orders', '/billing', '/inventory', '/products', '/purchasing', '/logistics'],
  system: ['/security', '/connections', '/access', '/users'],
};
export const kindOf = (link = '') => Object.keys(ROUTES).find((k) => ROUTES[k].some((r) => String(link).startsWith(r))) || 'general';
export const kindLabel = (k) => ALERT_KINDS.find((x) => x.k === k)?.label || 'Everything else';

export const CHANNELS = [['bell', 'In the CRM'], ['device', 'Pop-up on this device'], ['email', 'Email (simulated)'], ['push', 'Phone push (simulated)']];
export const alertPrefs = (saved = {}) => ({
  kinds: saved.kinds || {},
  quiet: { on: false, from: '20:00', to: '08:00', weekends: false, urgent: ['approvals', 'system'], ...(saved.quiet || {}) },
  away: { on: false, until: '', to: '', ...(saved.away || {}) },
  digest: { on: false, hour: 8, ...(saved.digest || {}) },
});
const CHANNEL_DEFAULT = { bell: true, device: true, email: false, push: false };
export const channelOn = (prefs, kind, channel) => {
  if (kind === 'system' && channel === 'bell') return true;
  return prefs.kinds?.[kind]?.[channel] ?? CHANNEL_DEFAULT[channel];
};
// Quiet hours can run past midnight, such as 20:00 to 08:00.
// Urgent kinds come through anyway. Weekends can be quiet all day.
export const inQuietHours = (prefs, at = new Date(), kind) => {
  if (kind && (prefs.quiet.urgent || []).includes(kind)) return false;
  if (prefs.quiet.weekends && [0, 6].includes(at.getDay())) return true;
  if (!prefs.quiet.on) return false;
  const now = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const { from, to } = prefs.quiet;
  return from <= to ? now >= from && now < to : now >= from || now < to;
};
export const isAway = (prefs, day = new Date().toISOString().slice(0, 10)) => !!(prefs.away?.on && prefs.away.to && (!prefs.away.until || prefs.away.until >= day));
// Alerts that look alike on the same day are shown together: the same kind, page and first words.
export const groupAlerts = (list) => {
  const groups = [];
  const at = new Map();
  list.forEach((n) => {
    const key = `${kindOf(n.link)}|${String(n.link || '').split('?')[0]}|${String(n.text).split(' ').slice(0, 3).join(' ')}|${String(n.at).slice(0, 10)}`;
    if (at.has(key)) groups[at.get(key)].rest.push(n);
    else { at.set(key, groups.length); groups.push({ key, first: n, rest: [] }); }
  });
  return groups;
};
// Which kinds of alert someone opens, and which they leave unread.
export const alertHabits = (list, now = Date.now()) => ALERT_KINDS.map((k) => {
  const mine = list.filter((n) => kindOf(n.link) === k.k && now - new Date(n.at).getTime() <= 30 * 864e5);
  const opened = mine.filter((n) => n.openedAt).length;
  const ignored = mine.filter((n) => !n.read && now - new Date(n.at).getTime() > 3 * 864e5).length;
  return { ...k, total: mine.length, opened, ignored };
}).filter((x) => x.total);
export const isAwake = (n, now = new Date().toISOString()) => !n.snoozeUntil || n.snoozeUntil <= now;
