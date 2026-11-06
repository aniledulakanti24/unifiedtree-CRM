// WhatsApp business rules the CRM can apply itself: templates, consent, campaigns, automatic replies and prices.
import { countryOf } from './callTools';

export const CATEGORIES = ['Marketing', 'Utility', 'Authentication'];
export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Hindi', 'Japanese', 'Chinese', 'Italian', 'Dutch'];
export const VARIABLES = ['{name}', '{company}', '{owner}', '{code}'];
export const DEFAULT_WA = {
  greeting: { on: true, text: 'Hi {name}, thanks for your message. Someone from {company} will reply shortly.' },
  away: { on: false, text: 'Thanks for your message. We are closed right now and will reply as soon as we open.' },
  keywords: [{ word: 'price', reply: 'Thanks for asking. Your account manager will send our price list shortly.' }],
  optOutWords: 'stop, unsubscribe', optInWords: 'start, subscribe',
  optOutReply: 'You will not get marketing messages from us any more. Reply START to sign up again.',
  optInReply: 'Thanks. You are signed up for our updates again. Reply STOP at any time.',
  optInOnly: true, assign: 'round',
};
export const waOf = (settings) => ({ ...DEFAULT_WA, ...settings?.wa, greeting: { ...DEFAULT_WA.greeting, ...settings?.wa?.greeting }, away: { ...DEFAULT_WA.away, ...settings?.wa?.away } });

// Templates saved before the template list are kept as approved Utility templates.
export const templatesOf = (db, picklist = []) => (db.waTemplates?.length ? db.waTemplates : picklist.map((body, i) => ({ id: `pk${i}`, name: `Template ${i + 1}`, category: 'Utility', language: 'English', body, buttons: [], status: 'Approved', legacy: true })));
export const approved = (list) => list.filter((t) => t.status === 'Approved');

const SHORTENERS = ['bit.ly', 'tinyurl', 'goo.gl', 't.co/', 'ow.ly'];
const PROMISES = ['guaranteed', '100% free', 'act now', 'risk free', 'winner'];
// Problems that would get a template turned down. The simulated review uses the same checks.
export const templateIssues = (t) => {
  const out = [];
  const body = String(t.body || '').trim();
  if (!String(t.name || '').trim()) out.push('Give the template a name.');
  if (!body) out.push('Write the message.');
  if (body.length > 1024) out.push('Keep the message under 1,024 characters.');
  const vars = body.match(/\{[^}]*\}/g) || [];
  vars.filter((v) => !VARIABLES.includes(v)).forEach((v) => out.push(`${v} isn't a field the CRM can fill in. Use ${VARIABLES.join(', ')}.`));
  if (/^\{[^}]*\}/.test(body) || /\{[^}]*\}$/.test(body)) out.push("Don't start or end the message with a field. WhatsApp turns those down.");
  if (SHORTENERS.some((s) => body.toLowerCase().includes(s))) out.push('Use the full web address, not a short link.');
  if (PROMISES.some((s) => body.toLowerCase().includes(s))) out.push('Avoid promises like "guaranteed" or "act now". They are often turned down.');
  if (body.length > 20 && body === body.toUpperCase() && /[A-Z]/.test(body)) out.push("Don't write the whole message in capitals.");
  if (t.category === 'Authentication' && !body.includes('{code}')) out.push('A sign-in code template needs {code}.');
  if ((t.buttons || []).filter(Boolean).length > 3) out.push('Use at most 3 quick-reply buttons.');
  if ((t.buttons || []).some((b) => b.length > 25)) out.push('Keep each button under 25 characters.');
  return [...new Set(out)];
};
export const fillTemplate = (body, { name = '', company = '', owner = '', code = '' } = {}) => String(body || '')
  .replaceAll('{name}', String(name).split(' ')[0] || 'there').replaceAll('{company}', company).replaceAll('{owner}', String(owner).split(' ')[0]).replaceAll('{code}', code || String(Math.floor(100000 + Math.random() * 900000)));

// Rough prices per message in US dollars. Real prices depend on the provider and change often.
const MARKETING = { 'United States or Canada': 0.025, 'United Kingdom': 0.0529, Germany: 0.1365, France: 0.1432, Spain: 0.0615, Italy: 0.0691, Netherlands: 0.16, India: 0.0107, Brazil: 0.0625, Mexico: 0.0436, 'United Arab Emirates': 0.0384, 'Saudi Arabia': 0.0455, 'South Africa': 0.0379, Australia: 0.0586, Singapore: 0.0786, Nigeria: 0.0516, Kenya: 0.0198 };
export const priceOf = (phone, category) => {
  const base = MARKETING[countryOf(phone)?.country] ?? 0.06;
  return category === 'Marketing' ? base : category === 'Authentication' ? base * 0.2 : base * 0.25;
};

const digits = (s) => String(s || '').replace(/\D/g, '');
export const consentOf = (db, contactId, phone) => {
  const c = db.contacts.find((x) => x.id === contactId) || (phone ? db.contacts.find((x) => digits(x.phone) && digits(x.phone) === digits(phone)) : null);
  return { contact: c, optedOut: !!c?.waOptOut, optedIn: !!c?.waOptIn };
};

// Who a campaign would reach, and who is left out and why.
export const audienceOf = (db, rows, audience, template, wa) => {
  const out = { send: [], noPhone: 0, optedOut: 0, notAsked: 0 };
  rows.forEach((c) => {
    if (audience.status && c.status !== audience.status) return;
    if (audience.ownerId && c.ownerId !== audience.ownerId) return;
    if (audience.country && countryOf(c.phone)?.country !== audience.country) return;
    if (!c.phone) { out.noPhone += 1; return; }
    if (c.waOptOut) { out.optedOut += 1; return; }
    if (template?.category === 'Marketing' && wa.optInOnly && !c.waOptIn) { out.notAsked += 1; return; }
    out.send.push(c);
  });
  out.cost = out.send.reduce((a, c) => a + priceOf(c.phone, template?.category), 0);
  return out;
};
export const campaignStats = (db, camp) => {
  const s = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
  (camp.recipients || []).forEach((r) => {
    const conv = db.conversations.find((c) => c.id === r.convId);
    const m = conv?.messages.find((x) => x.id === r.msgId);
    if (!m) return;
    s.sent += 1;
    if (m.status === 'Failed') { s.failed += 1; return; }
    if (['Delivered', 'Read'].includes(m.status)) s.delivered += 1;
    if (m.status === 'Read') { s.read += 1; }
    // A reply is the customer's next message, before anyone writes to them again.
    const after = conv.messages.slice(conv.messages.indexOf(m) + 1).filter((x) => !x.note);
    const next = after.find((x) => !x.by || !x.auto);
    if (next && !next.by) s.replied += 1;
  });
  if (s.read > s.delivered) s.delivered = s.read;
  return s;
};

const wordsOf = (text) => String(text || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
// What the CRM sends back by itself when a customer writes.
export const autoReplies = (wa, conv, text, { open, company, name }) => {
  const t = String(text || '').trim().toLowerCase();
  const fill = (x) => fillTemplate(x, { name, company });
  if (wordsOf(wa.optOutWords).includes(t)) return { optOut: true, replies: [{ text: wa.optOutReply, why: 'Opt-out word' }] };
  if (wordsOf(wa.optInWords).includes(t)) return { optIn: true, replies: [{ text: wa.optInReply, why: 'Opt-in word' }] };
  const replies = [];
  // Only when the customer starts the conversation, not when they answer something we sent.
  const firstTime = !conv.messages.some((m) => !m.note);
  if (firstTime && wa.greeting.on && wa.greeting.text.trim()) replies.push({ text: fill(wa.greeting.text), why: 'Greeting for a new conversation' });
  if (!open && wa.away.on && wa.away.text.trim()) replies.push({ text: fill(wa.away.text), why: 'Away message, outside opening hours' });
  const hit = (wa.keywords || []).find((k) => k.word?.trim() && k.reply?.trim() && t.includes(k.word.trim().toLowerCase()));
  if (hit) replies.push({ text: fill(hit.reply), why: `Keyword "${hit.word}"` });
  return { replies };
};

// Minutes from a customer's message to the first reply by a person.
export const firstReplyMinutes = (conv) => {
  const out = [];
  let waiting = null;
  conv.messages.forEach((m) => {
    if (m.note) return;
    if (!m.by) { if (!waiting) waiting = m.at; return; }
    if (waiting && !m.auto) { out.push((new Date(m.at) - new Date(waiting)) / 6e4); waiting = null; }
  });
  return out;
};

// Sample templates, consent and one campaign for the demo company, once.
export const upgradeSampleWhatsapp = (d, picklist = []) => {
  if (d.waV1) return d;
  const at = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const waTemplates = [
    ...(d.picklists?.messageTemplate || picklist).map((body, i) => ({ id: `wt${i}`, name: ['Thanks after a call', 'Follow-up', 'Quote ready', 'Order update'][i] || `Template ${i + 1}`, category: 'Utility', language: 'English', body, buttons: [], status: 'Approved', submittedAt: at(60), decidedAt: at(60) })),
    { id: 'wtm1', name: 'Spring offer', category: 'Marketing', language: 'English', body: 'Hi {name}, our spring offer is here: 15% off annual plans until the end of the month. Would you like the details?', buttons: ['Yes, send details', 'Not now'], status: 'Approved', submittedAt: at(20), decidedAt: at(20) },
    { id: 'wtm2', name: 'Big win', category: 'Marketing', language: 'English', body: 'WINNER! Guaranteed savings, act now at bit.ly/deal', buttons: [], status: 'Rejected', reason: 'Avoid promises like "guaranteed" or "act now". They are often turned down.', submittedAt: at(10), decidedAt: at(10) },
    { id: 'wta1', name: 'Sign-in code', category: 'Authentication', language: 'English', body: 'Your {company} code is {code}. It expires in 10 minutes.', buttons: [], status: 'Approved', submittedAt: at(30), decidedAt: at(30) },
  ];
  const contacts = d.contacts.map((c, i) => ({ ...c, waOptIn: i % 10 < 7, waOptOut: i % 23 === 5, waOptInAt: i % 10 < 7 ? at(90 - i) : undefined }));
  // One finished campaign, made from existing sample chats, so Campaigns has results to show.
  const recipients = [];
  const conversations = d.conversations.map((c, i) => {
    if (c.kind !== 'whatsapp' || i > 13) return c;
    const sentAt = at(6);
    const msg = { id: `wcm${i}`, at: sentAt, by: c.ownerId, text: fillTemplate(waTemplates.find((t) => t.id === 'wtm1').body, { name: c.name }), status: i % 9 === 4 ? 'Failed' : i % 3 === 0 ? 'Delivered' : 'Read', templateId: 'wtm1', campaignId: 'wc1', buttons: ['Yes, send details', 'Not now'] };
    recipients.push({ contactId: c.contactId, convId: c.id, msgId: msg.id });
    const reply = i % 4 === 1 ? [{ id: `wcr${i}`, at: at(5.9), by: null, text: 'Yes, send details' }, { id: `wco${i}`, at: at(5.88), by: c.ownerId, text: 'Great, I am sending them now.', status: 'Read' }] : [];
    return { ...c, messages: [...c.messages, msg, ...reply].sort((a, b) => a.at.localeCompare(b.at)), status: i % 5 === 0 ? 'Resolved' : 'Open' };
  });
  const waCampaigns = [{ id: 'wc1', name: 'Spring offer', templateId: 'wtm1', audience: { status: '', ownerId: '', country: '' }, status: 'Sent', sentAt: at(6), createdAt: at(7), recipients, skipped: { optedOut: 1, notAsked: 4, noPhone: 0 }, cost: recipients.length * 0.025, sample: true }];
  return { ...d, waV1: true, waTemplates, waCampaigns, contacts, conversations };
};
