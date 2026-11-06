// Service-level targets for support cases. Hours run around the clock, and stop while a case is Pending.
export const SLA_DEFAULT = { Urgent: { first: 1, resolve: 8 }, High: { first: 4, resolve: 24 }, Normal: { first: 8, resolve: 48 }, Low: { first: 24, resolve: 96 } };
export const slaHours = (settings) => ({ ...SLA_DEFAULT, ...(settings.slaHours || {}) });
export const isOpenCase = (c) => !['Closed', 'Rejected'].includes(c.status);
const HOUR = 36e5;

export const slaOf = (c, settings, now = Date.now()) => {
  const target = slaHours(settings)[c.priority] || SLA_DEFAULT.Normal;
  const start = new Date(c.createdAt).getTime();
  const running = c.pendingSince ? now - new Date(c.pendingSince).getTime() : 0;
  const paused = (c.pausedMs || 0) + running;
  const firstDue = start + target.first * HOUR;
  const resolveDue = start + target.resolve * HOUR + paused;
  const firstAt = c.firstResponseAt ? new Date(c.firstResponseAt).getTime() : null;
  const doneAt = c.resolvedAt ? new Date(c.resolvedAt).getTime() : null;
  const stateOf = (due, at, total) => {
    if (at) return at <= due ? 'Met' : 'Missed';
    if (now > due) return 'Overdue';
    return due - now <= total * HOUR * 0.25 ? 'Due soon' : 'On track';
  };
  const first = c.status === 'Rejected' ? 'Not needed' : stateOf(firstDue, firstAt, target.first);
  const resolve = c.status === 'Rejected' ? 'Not needed' : c.pendingSince ? 'Paused' : stateOf(resolveDue, doneAt, target.resolve);
  const overall = [first, resolve].includes('Overdue') ? 'Overdue' : [first, resolve].includes('Due soon') ? 'Due soon' : [first, resolve].includes('Missed') ? 'Missed' : resolve === 'Paused' ? 'Paused' : resolve === 'Not needed' ? 'Not needed' : resolve === 'Met' ? 'Met' : 'On track';
  return { first, resolve, overall, firstDue, resolveDue };
};
export const SLA_TONE = { Met: 'good', 'On track': 'good', 'Due soon': 'warn', Paused: 'muted', 'Not needed': 'muted', Overdue: 'bad', Missed: 'bad' };

// What else changes when a case's status does.
export const caseStatusPatch = (cur, patch) => {
  if (patch.status === undefined || patch.status === cur.status) return patch;
  const now = new Date();
  const next = { ...patch };
  if (cur.pendingSince) {
    next.pausedMs = (cur.pausedMs || 0) + (now.getTime() - new Date(cur.pendingSince).getTime());
    next.pendingSince = null;
  }
  if (patch.status === 'Pending') next.pendingSince = now.toISOString();
  if (['Closed', 'Rejected'].includes(patch.status)) next.resolvedAt = now.toISOString();
  else if (cur.resolvedAt) { next.resolvedAt = null; next.csat = null; }
  return next;
};
export const nextCaseNumber = (cases) => cases.reduce((a, c) => Math.max(a, Number(c.number) || 0), 1199) + 1;
export const articlesFor = (articles, text) => {
  const words = String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return articles.filter((a) => a.status === 'Published').map((a) => {
    const hay = `${a.title} ${a.body}`.toLowerCase();
    return { a, hits: words.filter((w) => hay.includes(w)).length };
  }).filter((x) => x.hits > 0).sort((x, y) => y.hits - x.hits).map((x) => x.a);
};
export const hoursBetween = (from, to) => (new Date(to).getTime() - new Date(from).getTime()) / HOUR;
export const niceHours = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24)} days`);

// Fills in a history for the sample company's older cases, once, so the reports have something to show.
export const upgradeSampleCases = (d) => {
  if (d.casesV1) return d;
  const cases = (d.cases || []).map((c) => {
    if (c.channel) return c;
    const n = Number(c.number) || 0;
    const start = new Date(c.createdAt).getTime();
    const next = { ...c, channel: ['Email', 'Portal', 'Phone', 'Chat'][n % 4], queue: /invoice|tax/i.test(c.subject) ? 'Billing' : /deliver/i.test(c.subject) ? 'Delivery' : /request|seats|rate/i.test(c.subject) ? 'General' : 'Technical', slaAlerted: true };
    if (c.status !== 'New') next.firstResponseAt = new Date(start + ((n * 7) % 20 + 1) * HOUR).toISOString();
    if (['Closed', 'Rejected'].includes(c.status)) next.resolvedAt = new Date(start + ((n * 13) % 70 + 5) * HOUR).toISOString();
    if (c.status === 'Closed' && n % 5 !== 0) next.csat = 3 + (n % 3);
    return next;
  });
  return { ...d, casesV1: true, cases };
};
