// Web form logic: which fields show, what is valid, what looks like spam, and who gets the enquiry.
export const STANDARD_FIELDS = [
  { k: 'name', label: 'Your name', type: 'text' },
  { k: 'company', label: 'Company', type: 'text' },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'title', label: 'Job title', type: 'text' },
  { k: 'city', label: 'City', type: 'text' },
  { k: 'country', label: 'Country', type: 'text' },
  { k: 'expected', label: 'Estimated budget', type: 'number' },
  { k: 'notes', label: 'Message', type: 'textarea' },
];
const STANDARD_KEYS = new Set(STANDARD_FIELDS.map((f) => f.k));
export const isStandard = (k) => STANDARD_KEYS.has(k);
export const FIELD_TYPES = [
  { value: 'text', label: 'Short text' }, { value: 'textarea', label: 'Long text' }, { value: 'email', label: 'Email' }, { value: 'tel', label: 'Phone number' },
  { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Dropdown' }, { value: 'radio', label: 'One choice' },
  { value: 'checks', label: 'Several choices' }, { value: 'check', label: 'Tick box' }, { value: 'hidden', label: 'Hidden value' },
];
export const hasChoices = (type) => ['select', 'radio', 'checks'].includes(type);

const std = (k, extra = {}) => ({ ...STANDARD_FIELDS.find((f) => f.k === k), step: 1, ...extra });
export const DEFAULT_SPAM = { trap: true, minSeconds: 3, human: false, domains: '', words: '', perHour: 5 };
export const DEFAULT_ROUTE = { mode: 'round', ownerId: '', rules: [] };
export const CONSENT_TEXT = 'I agree that you can store these details and contact me about this enquiry.';

// Forms saved before the builder only hold a list of optional fields.
export const formItems = (form) => {
  if (form?.items?.length) return form.items;
  const old = form?.fields || [];
  return [std('name', { req: true }), std('company', { req: true }), ...STANDARD_FIELDS.filter((f) => f.k !== 'name' && f.k !== 'company' && old.includes(f.k)).map((f) => std(f.k))];
};
export const newForm = () => ({ name: '', source: 'Website', status: 'Live', thanks: 'Thanks. We will be in touch soon.', button: 'Send', intro: '', items: [std('name', { req: true }), std('email', { req: true }), std('notes')], after: 'message', redirect: '', autoReply: false, autoSubject: 'We received your enquiry', autoBody: 'Hello {{name}},\n\nThanks for contacting {{company}}. We will reply soon.', consent: false, consentText: CONSENT_TEXT, route: DEFAULT_ROUTE, alsoNotify: [], dupes: 'update', spam: DEFAULT_SPAM, limit: '', closesOn: '', submissions: 0 });
const custom = (k, label, type, extra = {}) => ({ k, label, type, step: 1, ...extra });
export const TEMPLATES = [
  { key: 'contact', name: 'Contact us', text: 'Name, email and a message.', icon: 'Mail', make: () => ({ name: 'Contact us', items: [std('name', { req: true }), std('email', { req: true }), std('phone'), std('notes', { req: true })] }) },
  { key: 'demo', name: 'Request a demo', text: 'Two pages, with a follow-up question.', icon: 'Presentation', make: () => ({ name: 'Request a demo', button: 'Request demo', consent: true, autoReply: true, items: [std('name', { req: true }), std('email', { req: true }), std('company', { req: true }), custom('cf_size', 'Team size', 'select', { step: 2, options: ['1 to 10', '11 to 50', '51 to 200', 'More than 200'] }), custom('cf_when', 'When do you want to start?', 'radio', { step: 2, options: ['This month', 'This quarter', 'Just looking'] }), std('country', { step: 2 })] }) },
  { key: 'quote', name: 'Ask for a price', text: 'Asks for details only when they matter.', icon: 'Tag', make: () => ({ name: 'Ask for a price', source: 'Website', button: 'Ask for a price', items: [std('name', { req: true }), std('company', { req: true }), std('email', { req: true }), custom('cf_what', 'What do you need?', 'radio', { req: true, options: ['Products', 'Services', 'Something else'] }), custom('cf_qty', 'How many?', 'number', { showIf: { k: 'cf_what', value: 'Products' } }), custom('cf_other', 'Tell us more', 'textarea', { req: true, showIf: { k: 'cf_what', value: 'Something else' } }), std('expected')] }) },
  { key: 'event', name: 'Event sign-up', text: 'Places are limited, and the form closes itself.', icon: 'CalendarDays', make: () => ({ name: 'Event sign-up', button: 'Save my place', limit: 100, consent: true, autoReply: true, autoSubject: 'Your place is saved', autoBody: 'Hello {{name}},\n\nYour place is saved. We will send the details soon.', thanks: 'Your place is saved.', items: [std('name', { req: true }), std('email', { req: true }), std('company'), custom('cf_diet', 'Any dietary needs?', 'text')] }) },
  { key: 'news', name: 'Newsletter', text: 'Just an email address, with consent.', icon: 'Newspaper', make: () => ({ name: 'Newsletter', button: 'Sign up', consent: true, consentText: 'I agree to receive your newsletter. I can unsubscribe at any time.', thanks: 'You are signed up.', items: [std('email', { req: true }), std('name')] }) },
  { key: 'blank', name: 'Start blank', text: 'Choose every field yourself.', icon: 'Plus', make: () => ({}) },
];

const isEmpty = (x) => x === '' || x == null || x === false || (typeof x === 'string' && !x.trim()) || (Array.isArray(x) && !x.length);
const said = (x) => (x === true ? 'Yes' : Array.isArray(x) ? x.join(', ') : String(x ?? ''));

// A field with a rule only shows when the field it depends on is showing and has that answer.
export const isShown = (item, items, values, depth = 0) => {
  if (!item.showIf?.k) return true;
  const parent = items.find((i) => i.k === item.showIf.k);
  if (!parent || depth > 12 || !isShown(parent, items, values, depth + 1)) return false;
  const have = values[parent.k];
  const want = String(item.showIf.value ?? '').trim().toLowerCase();
  if (Array.isArray(have)) return have.some((x) => String(x).toLowerCase() === want);
  if (typeof have === 'boolean') return (have ? 'yes' : 'no') === want;
  return String(have ?? '').trim().toLowerCase() === want;
};
export const shownItems = (items, values) => items.filter((i) => i.type !== 'hidden' && isShown(i, items, values));
// A page with nothing to show right now is skipped.
export const pagesOf = (items, values) => {
  const list = [...new Set(shownItems(items, values).map((i) => i.step || 1))].sort((a, b) => a - b);
  return list.length ? list : [1];
};
export const toInput = (i) => ({ k: i.k, label: i.label, type: i.type === 'text' ? undefined : i.type, req: i.req, hint: i.hint, full: true, text: i.label, min: i.type === 'number' ? 0 : undefined, options: hasChoices(i.type) ? (i.options || []).filter((o) => o && o.trim()) : undefined });

export const formErrors = (items, values) => {
  const e = {};
  items.forEach((i) => {
    const x = values[i.k];
    if (isEmpty(x)) { if (i.req) e[i.k] = i.type === 'check' ? 'Please tick this to carry on' : `${i.label} is required`; return; }
    if (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(String(x).trim())) e[i.k] = 'Enter a valid email address';
    if (i.type === 'tel') { const digits = String(x).replace(/\D/g, ''); if (!/^[+\d\s().-]+$/.test(x) || digits.length < 7 || digits.length > 15) e[i.k] = 'Enter a valid phone number'; }
    if (i.type === 'number' && (!Number.isFinite(Number(x)) || Number(x) < 0)) e[i.k] = 'Enter a number of 0 or more';
  });
  return e;
};
// With an email or phone field showing, one of them is needed so someone can reply.
export const contactError = (items, values) => {
  const shown = shownItems(items, values);
  const mail = shown.find((i) => i.k === 'email');
  const tel = shown.find((i) => i.k === 'phone');
  if ((!mail && !tel) || !isEmpty(values.email) || !isEmpty(values.phone)) return {};
  return { [(mail || tel).k]: 'Tell us how to reach you' };
};

const listOf = (text) => String(text || '').split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
// Returns why this looks like spam, or nothing. Spam is kept to one side, so a real person can be let through.
export const spamReason = (form, values, { trap, seconds, recent = [] } = {}) => {
  const s = { ...DEFAULT_SPAM, ...form.spam };
  if (s.trap && trap) return 'Filled in the hidden field only robots can see';
  if (Number(s.minSeconds) > 0 && seconds != null && seconds < Number(s.minSeconds)) return `Sent ${seconds} seconds after opening, faster than a person can type`;
  const mail = String(values.email || '').trim().toLowerCase();
  const domain = mail.split('@')[1] || '';
  if (domain && listOf(s.domains).some((x) => domain === x.replace(/^@/, '') || domain.endsWith(`.${x.replace(/^@/, '')}`))) return `Email domain ${domain} is blocked`;
  const text = Object.values(values).map(said).join(' ').toLowerCase();
  const word = listOf(s.words).find((x) => text.includes(x));
  if (word) return `Contains the blocked word "${word}"`;
  const hourAgo = Date.now() - 36e5;
  if (mail && Number(s.perHour) > 0 && recent.filter((r) => String(r.values?.email || '').toLowerCase() === mail && new Date(r.at).getTime() > hourAgo).length >= Number(s.perHour)) return `More than ${s.perHour} sent from this email in an hour`;
  return '';
};

export const closedReason = (form) => {
  if (form.status === 'Paused') return 'This form is paused at the moment.';
  if (form.closesOn && form.closesOn < new Date().toISOString().slice(0, 10)) return 'This form has closed.';
  if (Number(form.limit) > 0 && (form.submissions || 0) >= Number(form.limit)) return 'This form is full.';
  return '';
};

const digitsOf = (x) => String(x || '').replace(/\D/g, '');
// The same person writing again goes on their existing lead, rather than making a second one.
export const findExisting = (db, values) => {
  const mail = String(values.email || '').trim().toLowerCase();
  const tel = digitsOf(values.phone);
  const same = (r) => (mail && String(r.email || '').toLowerCase() === mail) || (tel.length >= 7 && digitsOf(r.phone) === tel);
  return { lead: db.leads.find((l) => !l.erasedAt && l.status !== 'Converted' && same(l)) || null, contact: db.contacts.find((c) => !c.erasedAt && same(c)) || null };
};
const activeUser = (db, id) => db.users.find((u) => u.id === id && u.active);
export const routeTo = (form, values, db, nextPerson, contact) => {
  const route = { ...DEFAULT_ROUTE, ...form.route };
  const items = formItems(form);
  for (const r of route.rules || []) {
    const have = values[r.k];
    if (!r.k || !r.value || isEmpty(have) || !activeUser(db, r.ownerId)) continue;
    if (said(have).toLowerCase().includes(String(r.value).trim().toLowerCase())) return { ownerId: r.ownerId, why: `${items.find((i) => i.k === r.k)?.label || r.k} contains "${r.value}"` };
  }
  if (contact?.ownerId && activeUser(db, contact.ownerId)) return { ownerId: contact.ownerId, why: 'This person is already a contact of theirs' };
  if (route.mode === 'owner' && activeUser(db, route.ownerId)) return { ownerId: route.ownerId, why: 'This form always goes to them' };
  const next = nextPerson(db);
  if (next) return { ownerId: next, why: 'Shared evenly: they had the fewest new leads' };
  return { ownerId: db.users.find((u) => u.role === 'admin' && u.active)?.id, why: 'No active salespeople, so an Admin got it' };
};

export const answersOf = (form, values) => formItems(form).filter((i) => !isEmpty(values[i.k])).map((i) => ({ k: i.k, label: i.label, value: said(values[i.k]) }));
const utmLine = (utm) => { const parts = [utm?.utm_source, utm?.utm_medium, utm?.utm_campaign].filter(Boolean); return parts.length ? `Came from: ${parts.join(' / ')}` : ''; };
export const enquiryNote = (form, values, meta = {}) => [
  ...answersOf(form, values).filter((a) => !isStandard(a.k)).map((a) => `${a.label}: ${a.value}`),
  utmLine(meta.utm),
  meta.consent ? `Consent given on ${String(meta.at || '').slice(0, 10)}: ${form.consentText || CONSENT_TEXT}` : '',
].filter(Boolean).join('\n');
export const buildLead = (form, values, meta = {}) => {
  const text = (k) => String(values[k] ?? '').trim();
  return {
    name: text('name') || text('email') || text('phone') || 'Web enquiry', company: text('company'), email: text('email'), phone: text('phone'), title: text('title'), city: text('city'), country: text('country'),
    expected: Number(values.expected) || 0, source: form.source || 'Website', status: 'New', webFormId: form.id,
    notes: [text('notes'), enquiryNote(form, values, meta)].filter(Boolean).join('\n'),
  };
};
export const mergeText = (text, values, form, company) => String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
  if (key === 'company') return company;
  if (key === 'form') return form.name;
  return said(values[key]) || (key === 'name' ? 'there' : '');
});

const dayKey = (at = new Date()) => new Date(at).toISOString().slice(0, 10);
// One small count per form and day. View, start, sent and spam, plus how many reached each page.
export const bumpStat = (stats, formId, kind, { step, day, by = 1 } = {}) => {
  const all = stats || {};
  const key = day || dayKey();
  const form = all[formId] || {};
  const cur = form[key] || {};
  const next = kind === 'page' ? { ...cur, pages: { ...cur.pages, [step]: Math.max(0, (cur.pages?.[step] || 0) + by) } } : { ...cur, [kind]: Math.max(0, (cur[kind] || 0) + by) };
  return { ...all, [formId]: { ...form, [key]: next } };
};
export const statDays = (stats, formIds, days) => Array.from({ length: days }, (_, i) => {
  const key = dayKey(Date.now() - (days - 1 - i) * 864e5);
  const row = { key, view: 0, start: 0, sent: 0, spam: 0, pages: {} };
  formIds.forEach((id) => {
    const s = stats?.[id]?.[key];
    if (!s) return;
    ['view', 'start', 'sent', 'spam'].forEach((k) => { row[k] += s[k] || 0; });
    Object.entries(s.pages || {}).forEach(([p, n]) => { row.pages[p] = (row.pages[p] || 0) + n; });
  });
  return row;
});
export const safeLink = (url) => /^https?:\/\/\S+$/i.test(String(url || '').trim());
export const luminanceContrast = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 21;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
};
export const whereFrom = (s) => s.utm?.utm_source || 'Direct link';

// Sample history for the demo company, once. Real figures come from forms being opened and sent.
export const upgradeSampleForms = (d) => {
  if (d.formsV1) return d;
  const sales = d.users.filter((u) => u.role === 'sales' && u.active);
  const contact = (d.webForms || []).find((f) => f.id === 'wf1');
  const demo = {
    id: 'wf2', ...newForm(), name: 'Request a demo', button: 'Request demo', intro: 'Tell us a little about your team and we will set up a time.', consent: true, autoReply: true, thanks: 'Thanks. We will write to you soon to pick a time.', createdAt: d.webForms?.[0]?.createdAt,
    items: [std('name', { req: true }), std('email', { req: true }), std('company', { req: true }), custom('cf_need', 'What would you like?', 'radio', { step: 2, req: true, options: ['See a demo', 'Talk about pricing', 'Something else'] }), custom('cf_other', 'Tell us more', 'textarea', { step: 2, req: true, showIf: { k: 'cf_need', value: 'Something else' } }), custom('cf_size', 'Team size', 'select', { step: 2, options: ['1 to 10', '11 to 50', '51 to 200', 'More than 200'] }), std('country', { step: 2 })],
    route: { mode: 'round', ownerId: '', rules: sales[0] ? [{ k: 'country', value: 'Germany', ownerId: sales[0].id }] : [] },
  };
  const forms = (d.webForms || []).map((f) => (f.id === 'wf1' ? { ...newForm(), ...f, items: formItems(f), status: 'Live' } : f));
  if (!forms.some((f) => f.id === 'wf2')) forms.push(demo);
  const leads = d.leads.filter((l) => l.email);
  const sources = ['google', 'linkedin', '', 'newsletter', 'google', ''];
  const subs = [];
  const used = {};
  let stats = {};
  const dayAgo = (n) => new Date(Date.now() - n * 864e5 - (n % 7) * 36e5);
  leads.slice(0, 16).forEach((l, i) => {
    const form = i % 3 === 0 ? 'wf1' : 'wf2';
    const at = dayAgo(1 + ((i * 11) % 29));
    const src = sources[i % sources.length];
    subs.push({ id: `fs${i}`, sample: true, formId: form, at: at.toISOString(), values: { name: l.name, company: l.company, email: l.email, ...(form === 'wf2' ? { cf_need: ['See a demo', 'Talk about pricing'][i % 2], cf_size: '11 to 50' } : { notes: l.notes || 'Please call me back.' }) }, utm: src ? { utm_source: src } : {}, seconds: 25 + (i * 7) % 90, status: 'Lead created', leadId: l.id, ownerId: l.ownerId, why: 'Shared evenly: they had the fewest new leads' });
    used[l.id] = form;
    stats = bumpStat(stats, form, 'sent', { day: dayKey(at) });
    if (form === 'wf2') stats = bumpStat(stats, form, 'page', { step: 2, day: dayKey(at) });
  });
  [['Best Pills', 'sales@cheap-offers.example', 'Sent 0.8 seconds after opening, faster than a person can type'], ['SEO Team', 'rank@seo-now.example', 'Filled in the hidden field only robots can see'], ['Win Prize', 'win@prize-mail.example', 'Sent 1.1 seconds after opening, faster than a person can type']].forEach(([name, email, reason], i) => {
    const at = dayAgo(2 + i * 6);
    subs.push({ id: `fsx${i}`, sample: true, formId: i ? 'wf2' : 'wf1', at: at.toISOString(), values: { name, email, company: name }, utm: {}, seconds: 1, status: 'Spam', reason });
    stats = bumpStat(stats, i ? 'wf2' : 'wf1', 'spam', { day: dayKey(at) });
  });
  ['wf1', 'wf2'].forEach((id, f) => {
    for (let n = 0; n < 30; n++) {
      const day = dayKey(Date.now() - n * 864e5);
      const views = 3 + ((n * 13 + f * 5) % 9);
      stats = bumpStat(stats, id, 'view', { day, by: views });
      stats = bumpStat(stats, id, 'start', { day, by: Math.ceil(views / 3) });
      if (id === 'wf2') stats = bumpStat(stats, id, 'page', { step: 2, day, by: Math.ceil(views / 8) });
    }
  });
  const counted = (id) => subs.filter((s) => s.formId === id && s.status !== 'Spam').length;
  return {
    ...d, formsV1: true, formStats: stats, formSubmissions: [...subs.sort((a, b) => b.at.localeCompare(a.at)), ...(d.formSubmissions || [])],
    webForms: forms.map((f) => ((f.id === 'wf1' || f.id === 'wf2') ? { ...f, submissions: (f.submissions || 0) + counted(f.id) } : f)),
    leads: d.leads.map((l) => (used[l.id] ? { ...l, webFormId: used[l.id] } : l)),
  };
};
