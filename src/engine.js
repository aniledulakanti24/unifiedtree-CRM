import { getLocale, lineTotal } from './util';
// Business logic a real backend would own. It runs in the browser for now and has no screen code in it.
const num = (v) => Number(v) || 0;

/* ---------- Lead scoring: every point has a stated reason ---------- */
const SENIOR = /(founder|owner|ceo|cfo|cto|coo|director|head|vp|vice president|president|decision|manager|partner)/i;
const WARM_SOURCES = { Referral: 20, Partner: 15, 'Trade show': 10, Website: 10, 'Email campaign': 5, 'Cold call': 0 };
export const scoreReasons = (l) => {
  const out = [];
  if (l.email) out.push(['Has an email address', 15]);
  if (l.phone) out.push(['Has a phone number', 10]);
  if (SENIOR.test(l.title || '')) out.push(['Senior job title', 20]);
  const src = WARM_SOURCES[l.source] ?? 5;
  if (src) out.push([`Source: ${l.source || 'other'}`, src]);
  const value = num(l.expected);
  if (value >= 50000) out.push(['Expected revenue of 50,000 or more', 25]);
  else if (value >= 10000) out.push(['Expected revenue of 10,000 or more', 15]);
  else if (value > 0) out.push(['Has an expected revenue', 5]);
  if (l.status === 'Contacted') out.push(['Already contacted', 5]);
  if (l.status === 'Qualified') out.push(['Qualified', 15]);
  if (l.status === 'Unqualified') out.push(['Marked unqualified', -40]);
  return out;
};
export const scoreLead = (l) => Math.max(0, Math.min(100, scoreReasons(l).reduce((a, [, n]) => a + n, 10)));

/* ---------- Deals: time in stage, next step, stage rules ---------- */
export const REQUIRED_OPTIONS = [['value', 'Expected revenue'], ['closeDate', 'Expected closing date'], ['contactId', 'Main contact'], ['source', 'Source'], ['nextStep', 'A planned next step']];
export const daysInStage = (d) => Math.max(0, Math.floor((Date.now() - new Date(d.stageAt || d.createdAt).getTime()) / 864e5));
export const nextActivity = (id, activities) => activities.filter((a) => a.relatedId === id && a.status !== 'done').sort((a, b) => (a.due || '').localeCompare(b.due || ''))[0];
export const gateMissing = (stage, deal, activities) => (stage.required || []).filter((k) => (k === 'nextStep' ? !nextActivity(deal.id, activities) : k === 'value' ? !(Number(deal.value) > 0) : !deal[k]));

// When a scheduled report is next due: 8am tomorrow, in a week or in a month.
export const nextRun = (freq) => { const d = new Date(); d.setHours(8, 0, 0, 0); if (freq === 'monthly') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + (freq === 'weekly' ? 7 : 1)); return d.toISOString(); };

/* ---------- Automation rules ---------- */
export const TRIGGERS = [
  { k: 'lead.created', label: 'A lead is created', entity: 'leads' },
  { k: 'lead.status', label: "A lead's status changes", entity: 'leads' },
  { k: 'deal.created', label: 'An opportunity is created', entity: 'deals' },
  { k: 'deal.stage', label: 'An opportunity changes stage', entity: 'deals' },
  { k: 'deal.won', label: 'An opportunity is won', entity: 'deals' },
  { k: 'deal.lost', label: 'An opportunity is lost', entity: 'deals' },
  { k: 'contact.created', label: 'A contact is created', entity: 'contacts' },
  { k: 'company.created', label: 'A customer is created', entity: 'companies' },
  { k: 'order.created', label: 'An order is placed', entity: 'orders' },
  { k: 'invoice.paid', label: 'An invoice is paid in full', entity: 'invoices' },
  { k: 'case.created', label: 'A support case is created', entity: 'cases' },
  { k: 'shipment.status', label: "A delivery's status changes", entity: 'shipments' },
  { k: 'deal.stuck', label: 'An opportunity has had no activity', entity: 'deals', timed: true, daysLabel: 'For how many days' },
  { k: 'lead.stale', label: 'A new lead has not been contacted', entity: 'leads', timed: true, daysLabel: 'For how many days' },
  { k: 'invoice.overdue', label: 'An invoice is overdue', entity: 'invoices', timed: true, daysLabel: 'By how many days' },
  { k: 'deal.closing', label: 'An opportunity is closing soon', entity: 'deals', timed: true, daysLabel: 'Days before closing' },
  { k: 'quote.expiring', label: 'A quote is about to expire', entity: 'quotes', timed: true, daysLabel: 'Days before it expires' },
  { k: 'task.overdue', label: 'A task is overdue', entity: 'activities', timed: true, daysLabel: 'By how many days' },
  { k: 'case.open', label: 'A support case stays open', entity: 'cases', timed: true, daysLabel: 'For how many days' },
  { k: 'lead.field', label: 'A field on a lead changes', entity: 'leads', field: true },
  { k: 'deal.field', label: 'A field on an opportunity changes', entity: 'deals', field: true },
  { k: 'contact.field', label: 'A field on a contact changes', entity: 'contacts', field: true },
  { k: 'company.field', label: 'A field on a customer changes', entity: 'companies', field: true },
  { k: 'case.field', label: 'A field on a support case changes', entity: 'cases', field: true },
  { k: 'lead.schedule', label: 'On a schedule: leads', entity: 'leads', schedule: true },
  { k: 'deal.schedule', label: 'On a schedule: opportunities', entity: 'deals', schedule: true },
  { k: 'contact.schedule', label: 'On a schedule: contacts', entity: 'contacts', schedule: true },
  { k: 'company.schedule', label: 'On a schedule: customers', entity: 'companies', schedule: true },
  { k: 'case.schedule', label: 'On a schedule: support cases', entity: 'cases', schedule: true },
];
export const FIELD_TRIGGER = { leads: 'lead.field', deals: 'deal.field', contacts: 'contact.field', companies: 'company.field', cases: 'case.field' };
// When a scheduled workflow next runs: every day, or one day a week, at an hour.
export const nextScheduleAt = (rule, from = Date.now()) => {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(Number(rule.hour ?? 8));
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  if (rule.every === 'week') { const want = Number(rule.weekday ?? 1); while (d.getDay() !== want) d.setDate(d.getDate() + 1); }
  return d.toISOString();
};
// "Wait until": the next time it's that hour, skipping weekends if asked.
export const waitUntilAt = (step, from = Date.now()) => {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(Number(step.hour ?? 9));
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  if (step.workdays !== false) while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toISOString();
};
// Whether a workflow may run again on a record it already ran on.
export const canRerun = (rule, recId, now = Date.now()) => {
  const mode = rule.rerun || 'always';
  if (mode === 'always') return true;
  const last = rule.lastBy?.[recId];
  if (mode === 'once') return !last && !(rule.done || []).includes(recId);
  return !last || now - new Date(last).getTime() >= (Number(rule.rerunDays) || 30) * 864e5;
};
export const RULE_FIELDS = {
  leads: [['source', 'Source'], ['status', 'Status'], ['expected', 'Expected revenue'], ['score', 'Lead score'], ['country', 'Country']],
  deals: [['value', 'Expected revenue'], ['stage', 'Stage'], ['source', 'Source'], ['probability', 'Probability'], ['pipeline', 'Pipeline'], ['competitor', 'Competitor'], ['priority', 'Priority']],
  quotes: [['total', 'Total'], ['status', 'Status']],
  activities: [['priority', 'Priority'], ['tag', 'Tag']],
  contacts: [['status', 'Status'], ['title', 'Job title']],
  companies: [['status', 'Type'], ['industry', 'Industry'], ['city', 'City']],
  orders: [['total', 'Total'], ['channel', 'Channel']],
  invoices: [['total', 'Total'], ['status', 'Status']],
  cases: [['priority', 'Priority'], ['type', 'Type'], ['status', 'Status']],
  shipments: [['status', 'Status'], ['carrier', 'Carrier']],
};
export const OPERATORS = [['is', 'is'], ['isnt', "isn't"], ['gt', 'is more than'], ['lt', 'is less than'], ['has', 'contains']];
export const ACTIONS_AUTO = [['task', 'Create a task'], ['followup', 'Schedule a call-back follow-up'], ['notify', 'Send a bell alert'], ['email', 'Send an email (simulated)'], ['whatsapp', 'Send a WhatsApp message (simulated)'], ['assign', 'Assign to the next salesperson'], ['update', 'Change a field'], ['tag', 'Add a tag'], ['webhook', 'Send to another system (simulated)'], ['deal', 'Create an opportunity']];
const passes = (c, rec) => {
  const got = rec[c.field];
  if (c.op === 'gt') return num(got) > num(c.value);
  if (c.op === 'lt') return num(got) < num(c.value);
  const a = String(got ?? '').toLowerCase();
  const b = String(c.value ?? '').toLowerCase();
  if (c.op === 'has') return a.includes(b);
  return c.op === 'isnt' ? a !== b : a === b;
};
export const ruleMatches = (rule, rec) => {
  const list = (rule.conditions || []).filter((c) => c.field);
  return !list.length || (rule.match === 'any' ? list.some((c) => passes(c, rec)) : list.every((c) => passes(c, rec)));
};
// A workflow's steps. Older rules kept a flat list of actions, each with its own wait.
export const stepsOf = (rule) => rule.steps || (rule.actions || []).flatMap((a) => { const { delay, ...rest } = a; return [...(Number(delay) > 0 ? [{ kind: 'wait', days: Number(delay) }] : []), { kind: 'action', ...rest }]; });

const act = (type, text, extra = {}) => ({ kind: 'action', type, text, days: 0, to: 'owner', ...extra });
const wait = (days) => ({ kind: 'wait', days });
const cond = (field, op, value) => ({ field, op, value: String(value) });
export const WORKFLOW_TEMPLATES = [
  { name: 'New lead: assign and follow up', about: 'Share leads evenly, fast-track big ones', trigger: 'lead.created', conditions: [], steps: [act('assign', '', { to: 'round' }), { kind: 'branch', match: 'all', conditions: [cond('expected', 'gt', 25000)], yes: [act('notify', 'Big new lead: {name}', { to: 'manager' }), act('task', 'Call {name} today')], no: [act('email', 'Welcome {name}'), wait(2), act('task', 'Call {name}')] }] },
  { name: 'Lead not contacted: escalate', about: 'Remind the owner, then tell their manager', trigger: 'lead.stale', days: 2, conditions: [], steps: [act('notify', 'Please contact {name}'), wait(2), { kind: 'branch', match: 'all', conditions: [cond('status', 'is', 'New')], yes: [act('notify', '{name} still has not been contacted', { to: 'manager' })], no: [] }] },
  { name: 'Stuck deal: nudge and escalate', about: 'No activity for 14 days', trigger: 'deal.stuck', days: 14, conditions: [], steps: [act('task', 'Plan a next step for {name}', { days: 1 }), wait(7), act('notify', 'Still stuck: {name}', { to: 'manager' })] },
  { name: 'Big deal: manager approval', about: 'Sign-off before the contract stage', trigger: 'deal.stage', conditions: [cond('stage', 'is', 'negotiation'), cond('value', 'gt', 50000)], steps: [{ kind: 'approval', to: 'manager', text: 'Approve the terms for {name}' }, act('task', 'Prepare the contract for {name}', { days: 1 })] },
  { name: 'Deal won: onboarding', about: 'Welcome, then check in at 7 and 30 days', trigger: 'deal.won', conditions: [], steps: [act('task', 'Send the welcome pack for {name}'), act('tag', '', { tag: 'Onboarding' }), wait(7), act('task', 'Check in about {name}'), wait(23), act('followup', 'Ask how {name} is going')] },
  { name: 'Overdue invoice: chase in steps', about: 'Email, WhatsApp, then a call and your manager', trigger: 'invoice.overdue', days: 0, conditions: [], steps: [act('email', 'Payment reminder for {name}'), wait(7), act('whatsapp', 'Reminder: invoice {name} is overdue'), wait(7), act('task', 'Call about overdue invoice {name}'), act('notify', 'Invoice {name} is two weeks overdue', { to: 'manager' })] },
  { name: 'Urgent case: alert fast', about: 'Route support cases by priority', trigger: 'case.created', conditions: [], steps: [{ kind: 'branch', match: 'any', conditions: [cond('priority', 'is', 'Urgent'), cond('priority', 'is', 'High')], yes: [act('notify', 'Urgent case: {name}', { to: 'manager' }), act('task', 'Reply to {name} today')], no: [act('task', 'Reply to {name}', { days: 1 })] }] },
  { name: 'Case open too long', about: 'Escalate after 3 days', trigger: 'case.open', days: 3, conditions: [], steps: [act('notify', 'Case open for 3 days: {name}', { to: 'manager' })] },
  { name: 'Quote expiring: follow up', about: 'Prompt a call before it lapses', trigger: 'quote.expiring', days: 5, conditions: [cond('status', 'is', 'Sent')], steps: [act('task', 'Follow up on quote {name} before it expires')] },
  { name: 'Delivery updates', about: 'Tell the customer on WhatsApp', trigger: 'shipment.status', conditions: [], steps: [act('whatsapp', 'Update on delivery {name}: it is now {status}.')] },
];

// Whose turn it is next, so new leads spread evenly across active salespeople.
export const nextSalesperson = (db) => {
  const people = db.users.filter((u) => u.active && u.role === 'sales');
  if (!people.length) return null;
  const load = (u) => db.leads.filter((l) => l.ownerId === u.id && l.status === 'New').length;
  return [...people].sort((a, b) => load(a) - load(b) || a.id.localeCompare(b.id))[0].id;
};

/* ---------- Form setup ---------- */
export const applyFormConfig = (config, base) => {
  if (!config) return base;
  const fields = [
    ...base.map((f) => ({ ...f, label: config.labels?.[f.k] || f.label, req: f.req || !!config.required?.[f.k], hide: f.hide || !!config.hidden?.[f.k] })),
    ...(config.custom || []).map((f) => ({ ...f, req: !!config.required?.[f.k], hide: !!config.hidden?.[f.k], full: f.type === 'textarea' })),
  ];
  const order = config.order || [];
  const at = (f) => { const i = order.indexOf(f.k); return i < 0 ? 999 + fields.indexOf(f) : i; };
  return [...fields].sort((a, b) => at(a) - at(b));
};

/* ---------- CSV ---------- */
export const parseCsv = (text) => {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
};

/* ---------- Duplicates ---------- */
const clean = (s) => String(s || '').trim().toLowerCase();
const keysOf = (kind, r, db) => {
  if (kind === 'contact') return [r.email && `e:${clean(r.email)}`, r.first && r.companyId && `n:${clean(r.first)} ${clean(r.last)}|${r.companyId}`].filter(Boolean);
  if (kind === 'lead') return [r.email && `e:${clean(r.email)}`, r.name && r.company && `n:${clean(r.name)}|${clean(r.company)}`].filter(Boolean);
  return [r.name && `n:${clean(r.name)}`, r.email && `e:${clean(r.email)}`].filter(Boolean);
};
export const DUP_ENTITY = { lead: 'leads', contact: 'contacts', company: 'companies' };
export const findDuplicate = (db, kind, rec) => {
  const want = new Set(keysOf(kind, rec, db));
  return db[DUP_ENTITY[kind]].find((r) => r.id !== rec.id && keysOf(kind, r, db).some((k) => want.has(k)));
};
export const duplicateGroups = (db, kind) => {
  const seen = new Map();
  db[DUP_ENTITY[kind]].forEach((r) => keysOf(kind, r, db).forEach((k) => seen.set(k, [...(seen.get(k) || []), r])));
  const groups = []; const used = new Set();
  seen.forEach((list) => {
    const fresh = list.filter((r) => !used.has(r.id));
    if (fresh.length > 1 && list.length > 1) { fresh.forEach((r) => used.add(r.id)); groups.push(fresh); }
  });
  return groups;
};
const LINKS = { company: [['contacts', 'companyId'], ['deals', 'companyId'], ['orders', 'companyId'], ['invoices', 'companyId'], ['quotes', 'companyId'], ['payments', 'companyId'], ['shipments', 'companyId'], ['cases', 'companyId'], ['events', 'companyId'], ['calls', 'companyId']], contact: [['deals', 'contactId'], ['cases', 'contactId'], ['followups', 'contactId']], lead: [] };
export const mergeRecords = (d, kind, keepId, dropId) => {
  const entity = DUP_ENTITY[kind];
  const keep = d[entity].find((r) => r.id === keepId);
  const drop = d[entity].find((r) => r.id === dropId);
  if (!keep || !drop) return;
  const filled = { ...keep };
  Object.keys(drop).forEach((k) => { if (filled[k] === undefined || filled[k] === '' || filled[k] === null) filled[k] = drop[k]; });
  d[entity] = d[entity].map((r) => (r.id === keepId ? filled : r)).filter((r) => r.id !== dropId);
  LINKS[kind].forEach(([e, f]) => { d[e] = d[e].map((r) => (r[f] === dropId ? { ...r, [f]: keepId } : r)); });
  const type = kind;
  d.activities = d.activities.map((a) => (a.relatedId === dropId ? { ...a, relatedId: keepId } : a));
  d.followups = d.followups.map((f) => (f.relatedId === dropId ? { ...f, relatedId: keepId } : f));
  d.calls = d.calls.map((c) => (c.relatedId === dropId ? { ...c, relatedId: keepId } : c));
  const from = `${type}:${dropId}`; const to = `${type}:${keepId}`;
  if (d.chatter[from]) { d.chatter = { ...d.chatter, [to]: [...(d.chatter[to] || []), ...d.chatter[from]] }; delete d.chatter[from]; }
};

/* ---------- Tax ---------- */
const regionKey = (country, region) => `${country}|${String(region || '').trim().toLowerCase()}`;
export const taxRegionKey = regionKey;
// Tax can be left off when you sell to a business abroad that has its own tax number.
export const isReverseCharge = (db, company) => {
  const s = db.settings;
  return !!(s.reverseCharge && s.homeCountry && company?.country && company.country !== s.homeCountry && (company.taxId || company.gstin));
};
// In order: tax exempt, reverse charge, the customer's state or region, their country, the product, then the default.
export const taxRateFor = (db, company, product) => {
  if (company?.taxExempt || isReverseCharge(db, company)) return 0;
  const byRegion = db.settings.taxByRegion?.[regionKey(company?.country, company?.state)];
  if (byRegion !== undefined && byRegion !== '') return num(byRegion);
  const byCountry = db.settings.taxByCountry?.[company?.country];
  if (byCountry !== undefined && byCountry !== '') return num(byCountry);
  const own = product?.taxRate ?? product?.gstRate;
  return own !== undefined && own !== '' ? num(own) : num(db.settings.taxRate);
};
export const taxesFor = (items, db, company) => {
  const inclusive = !!db.settings.pricesIncludeTax;
  const lines = items.map((x) => {
    const p = db.products.find((y) => y.id === x.productId);
    const rate = taxRateFor(db, company, p);
    const amount = lineTotal(x);
    // When prices already include tax, the tax is taken out of the price rather than added.
    const base = inclusive ? amount / (1 + rate / 100) : amount;
    return { ...x, taxCode: p?.taxCode || p?.hsn || '', rate, base, tax: inclusive ? amount - base : Math.round(base * rate) / 100 };
  });
  const rates = [...new Set(lines.map((l) => l.rate))];
  return {
    taxable: Math.round(lines.reduce((a, l) => a + l.base, 0) * 100) / 100,
    tax: Math.round(lines.reduce((a, l) => a + l.tax, 0) * 100) / 100,
    rate: rates.length === 1 ? rates[0] : null,
    lines,
    inclusive,
    reverseCharge: isReverseCharge(db, company),
    exemptRef: company?.taxExempt ? company.taxExemptRef || '' : '',
  };
};

/* ---------- Assistant and coaching: plain rules, not an AI model ---------- */
const DAY = 864e5;
export const lastTouch = (db, id) => {
  const times = [
    ...db.audit.filter((a) => a.entityId === id).map((a) => a.at),
    ...db.activities.filter((a) => a.relatedId === id).map((a) => a.createdAt),
    ...db.calls.filter((c) => c.relatedId === id).map((c) => c.at),
  ].filter(Boolean);
  return times.sort().pop();
};
export const dealInsights = (db, d) => {
  if (d.status !== 'open') return { risk: 'None', flags: [], next: [] };
  const now = Date.now();
  const flags = []; const next = [];
  const touched = lastTouch(db, d.id) || d.createdAt;
  const idle = touched ? Math.floor((now - new Date(touched)) / DAY) : 0;
  const planned = db.activities.filter((a) => a.relatedId === d.id && a.status !== 'done');
  const quotes = db.quotes.filter((q) => q.dealId === d.id);
  const contact = db.contacts.find((c) => c.id === d.contactId);
  if (d.closeDate && new Date(d.closeDate) < new Date(new Date().toDateString())) { flags.push('The expected closing date has passed'); next.push('Agree a new closing date with the customer'); }
  if (idle >= 14) { flags.push(`Nothing has happened for ${idle} days`); next.push(contact ? `Call ${contact.first} ${contact.last} to restart the conversation` : 'Call the customer to restart the conversation'); }
  if (!planned.length) { flags.push('No next step is planned'); next.push('Schedule a to-do so this deal keeps moving'); }
  if (!contact) { flags.push('No contact is linked'); next.push('Add the person you are dealing with'); }
  if (!quotes.length && d.probability >= 50) { flags.push('Far along, but no quote has been sent'); next.push('Create a quote'); }
  if (quotes.some((q) => q.status === 'Sent')) next.push('Follow up on the quote you sent');
  if (!next.length) next.push('On track. Keep the planned step moving');
  return { risk: flags.length >= 3 ? 'High' : flags.length ? 'Medium' : 'Low', flags, next: [...new Set(next)].slice(0, 3), idle };
};
// Records a time-based rule applies to right now.
export const timedRecords = (d, trigger, days) => {
  const before = (n) => Date.now() - n * DAY;
  if (trigger === 'deal.stuck') return d.deals.filter((x) => x.status === 'open' && new Date(lastTouch(d, x.id) || x.createdAt).getTime() < before(days));
  if (trigger === 'lead.stale') return d.leads.filter((x) => x.status === 'New' && new Date(x.createdAt).getTime() < before(days));
  if (trigger === 'invoice.overdue') return d.invoices.filter((x) => x.total > (x.paid || 0) && x.due && new Date(x.due).getTime() < before(days));
  const ahead = (n) => Date.now() + n * DAY;
  if (trigger === 'deal.closing') return d.deals.filter((x) => x.status === 'open' && x.closeDate && new Date(x.closeDate).getTime() <= ahead(days) && new Date(x.closeDate).getTime() >= before(1));
  if (trigger === 'quote.expiring') return d.quotes.filter((x) => ['Draft', 'Sent'].includes(x.status) && x.expiry && new Date(x.expiry).getTime() <= ahead(days) && new Date(x.expiry).getTime() >= before(1));
  if (trigger === 'task.overdue') return d.activities.filter((x) => x.status !== 'done' && x.due && new Date(x.due).getTime() < before(days));
  if (trigger === 'case.open') return d.cases.filter((x) => !['Closed', 'Rejected'].includes(x.status) && new Date(x.createdAt).getTime() < before(days));
  return [];
};
const when = (s) => (s ? new Date(s).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }) : 'unknown');
// A plain summary built from the record. Fixed wording, not an AI model.
export const dealSummary = (db, d, stageName, companyName) => {
  const open = db.activities.filter((a) => a.relatedId === d.id && a.status !== 'done').length;
  const calls = db.calls.filter((c) => c.relatedId === d.id || c.relatedId === d.contactId).length;
  const quotes = db.quotes.filter((q) => q.dealId === d.id);
  const notes = db.chatter[`deal:${d.id}`] || [];
  return `${d.title} is at ${stageName} with ${companyName}, closing ${when(d.closeDate)} at ${d.probability}% probability. ${quotes.length ? `${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'}, latest ${quotes[0].status.toLowerCase()}.` : 'No quote yet.'} ${open} open ${open === 1 ? 'task' : 'tasks'} and ${calls} logged ${calls === 1 ? 'call' : 'calls'}.${notes[0] ? ` Latest note: "${notes[0].text.slice(0, 90)}"` : ''}`;
};
export const dealDraft = (db, d, contact, me) => {
  const hi = contact ? `Hi ${contact.first},` : 'Hello,';
  const ask = db.quotes.some((q) => q.dealId === d.id && q.status === 'Sent') ? 'Have you had a chance to review the quote I sent?' : 'Could we find a time this week to discuss the next step?';
  return `${hi}\n\nFollowing up on ${d.title}. ${ask}\n\nThanks,\n${me.name}`;
};
export const coachingFor = (db, ids) => {
  const now = new Date().toISOString();
  const week = new Date(Date.now() - 7 * DAY).toISOString();
  return ids.map((id) => {
    const open = db.deals.filter((d) => d.ownerId === id && d.status === 'open');
    const stuck = open.filter((d) => { const t = lastTouch(db, d.id) || d.createdAt; return t && Date.now() - new Date(t) > 14 * DAY; });
    const late = db.followups.filter((f) => f.ownerId === id && f.status === 'open' && f.at < now).length;
    const overdue = db.activities.filter((a) => a.ownerId === id && a.status !== 'done' && a.due < now.slice(0, 10)).length;
    const calls = db.calls.filter((c) => c.ownerId === id && c.at > week).length;
    const notes = [];
    if (stuck.length) notes.push(`${stuck.length} stuck ${stuck.length === 1 ? 'deal' : 'deals'}`);
    if (late) notes.push(`${late} late ${late === 1 ? 'follow-up' : 'follow-ups'}`);
    if (overdue) notes.push(`${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`);
    if (!calls) notes.push('No calls this week');
    return { id, open: open.length, stuck, late, overdue, calls, notes };
  }).sort((a, b) => b.notes.length - a.notes.length || b.stuck.length - a.stuck.length);
};

/* ---------- Simulated sign-in. This is not security: anyone with the browser can read this data. ---------- */
export const DEMO_PASSWORD = 'demo1234';
export const demoHash = (text) => [...String(text)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
export const passwordMatches = (user, text) => (user.passHash || demoHash(DEMO_PASSWORD)) === demoHash(text);
