// Email rules the CRM applies itself: templates, the do-not-email list, campaigns with two subjects, and results.
export const FOLDERS = ['Sales', 'Follow-up', 'Support', 'Marketing'];
export const DEFAULT_EMAIL = {
  tracking: true,
  footer: 'You are getting this email from {company}. {address}\nTo stop these emails, reply UNSUBSCRIBE.',
  address: '', dailyLimit: 500, suppressBounces: true,
};
export const emailOf = (settings) => ({ ...DEFAULT_EMAIL, ...settings?.email });
export const STEPS = ['Sent', 'Delivered', 'Opened', 'Clicked', 'Replied'];
const RANK = { Sent: 0, Delivered: 1, Opened: 2, Clicked: 3, Replied: 4 };
export const reached = (status, step) => (RANK[status] ?? -1) >= RANK[step];

// Templates saved before the template list carry over without a subject.
export const emailTemplatesOf = (db, picklist = []) => (db.emailTemplates?.length ? db.emailTemplates : picklist.map((body, i) => ({ id: `ep${i}`, name: body.split(/[.!?]/)[0].slice(0, 40), folder: 'Sales', subject: '', body, legacy: true })));
export const fill = (text, { first, company, me, ours } = {}) => String(text || '').replace(/\{name\}/g, first || 'there').replace(/\{company\}/g, company || 'your company').replace(/\{me\}/g, me || '').replace(/\{our_company\}/g, ours || '');

const lower = (s) => String(s || '').trim().toLowerCase();
export const suppressedOf = (db, email) => (db.emailSuppressed || []).find((x) => lower(x.email) === lower(email)) || null;
export const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
export const splitList = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

// The hour people open most, from emails that were opened.
export const bestHour = (emails) => {
  const counts = Array(24).fill(0);
  emails.forEach((e) => { const at = e.openedAt || e.net?.openAt; if (at && reached(e.status, 'Opened')) counts[new Date(at).getHours()] += 1; });
  const total = counts.reduce((a, x) => a + x, 0);
  if (total < 5) return null;
  const h = counts.indexOf(Math.max(...counts));
  return { hour: h, share: counts[h] / total, counts };
};

export const rates = (list) => {
  const sent = list.length;
  const n = (fn) => list.filter(fn).length;
  const bounced = n((e) => e.status === 'Bounced');
  const delivered = sent - bounced;
  return { sent, delivered, bounced, opened: n((e) => reached(e.status, 'Opened')), clicked: n((e) => reached(e.status, 'Clicked')), replied: n((e) => e.status === 'Replied'), unsub: n((e) => e.unsubscribed) };
};
// With two subjects, the one with more opens wins once both have enough sends.
export const winnerOf = (camp, emails) => {
  if (!camp.subjectB) return null;
  const a = rates(emails.filter((e) => e.campaignId === camp.id && e.variant === 'A'));
  const b = rates(emails.filter((e) => e.campaignId === camp.id && e.variant === 'B'));
  if (a.delivered < 5 || b.delivered < 5) return { a, b, winner: null };
  const ra = a.opened / a.delivered; const rb = b.opened / b.delivered;
  return { a, b, winner: Math.abs(ra - rb) < 0.05 ? 'Tie' : ra > rb ? 'A' : 'B' };
};

// Who a campaign reaches, and who is left out and why.
export const audienceOf = (db, people, audience) => {
  const out = { send: [], suppressed: 0, noEmail: 0 };
  people.forEach((p) => {
    if (audience.status && p.status !== audience.status) return;
    if (audience.kind && p.kind !== audience.kind) return;
    if (!validEmail(p.email)) { out.noEmail += 1; return; }
    if (suppressedOf(db, p.email)) { out.suppressed += 1; return; }
    out.send.push(p);
  });
  return out;
};
export const footerText = (settings) => {
  const e = emailOf(settings);
  return e.footer.replace('{company}', settings.companyName || '').replace('{address}', e.address || '').trim();
};

// Sample mail for the demo company, once: sent emails across a month, two campaigns, a template list and a few do-not-email addresses.
export const upgradeSampleEmail = (d, picklist = []) => {
  if (d.emailV1) return d;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const templates = [
    { id: 'et1', name: 'First contact', folder: 'Sales', subject: 'A quick idea for {company}', body: 'Hi {name},\n\nI work with teams like yours on keeping customers and sales in one place. Would a 15-minute call next week be useful?' },
    { id: 'et2', name: 'After a meeting', folder: 'Follow-up', subject: 'Thanks for your time today', body: 'Hi {name},\n\nThanks for meeting today. As promised, here are the next steps we agreed.' },
    { id: 'et3', name: 'Quote ready', folder: 'Sales', subject: 'Your quote from {our_company}', body: 'Hi {name},\n\nYour quote is ready. Shall I walk you through it this week?' },
    { id: 'et4', name: 'Monthly news', folder: 'Marketing', subject: 'What is new this month', body: 'Hi {name},\n\nHere is a short round-up of what changed this month, and one tip to get more from it.' },
    ...(d.picklists?.emailTemplate || picklist).slice(0, 2).map((body, i) => ({ id: `etp${i}`, name: body.split(/[.!?]/)[0].slice(0, 40), folder: 'Follow-up', subject: '', body })),
  ];
  const people = d.contacts.filter((c) => c.email).slice(0, 60);
  const statuses = ['Replied', 'Opened', 'Clicked', 'Delivered', 'Opened', 'Bounced', 'Opened', 'Delivered', 'Clicked', 'Replied', 'Opened', 'Delivered'];
  const emails = [];
  people.slice(0, 36).forEach((c, i) => {
    const at = now - (1 + ((i * 7) % 29)) * 864e5 - ((i * 5) % 9) * 36e5;
    const status = statuses[i % statuses.length];
    const tpl = templates[i % 3];
    const openAt = new Date(at); openAt.setHours([9, 10, 10, 11, 14, 16, 10, 9][i % 8], 15, 0, 0);
    emails.push({ id: `es${i}`, to: c.email, name: `${c.first} ${c.last}`, subject: fill(tpl.subject, { first: c.first, company: d.companies.find((x) => x.id === c.companyId)?.name, ours: d.settings.companyName }), body: fill(tpl.body, { first: c.first }), ownerId: c.ownerId, status, at: iso(at), relatedType: 'contact', relatedId: c.id, templateId: tpl.id, sample: true, openedAt: reached(status, 'Opened') ? openAt.toISOString() : undefined, ...(status === 'Replied' ? { reply: 'Thanks, this is helpful. Can we speak this week?', replyAt: iso(at + 5 * 36e5), seen: i > 4 } : {}) });
  });
  const campAt = now - 9 * 864e5;
  const campRows = people.slice(10, 50);
  campRows.forEach((c, i) => {
    const variant = i % 2 ? 'B' : 'A';
    const roll = (i * 37) % 100;
    const status = roll < 4 ? 'Bounced' : roll < (variant === 'B' ? 58 : 38) ? (roll % 5 === 0 ? 'Clicked' : 'Opened') : 'Delivered';
    const openAt = new Date(campAt + 2 * 36e5);
    emails.push({ id: `ec${i}`, to: c.email, name: `${c.first} ${c.last}`, subject: variant === 'A' ? 'What is new this month' : `${c.first}, three changes worth a look`, body: fill(templates[3].body, { first: c.first }), ownerId: c.ownerId, status, at: iso(campAt), relatedType: 'contact', relatedId: c.id, campaignId: 'ec1', variant, templateId: 'et4', sample: true, openedAt: reached(status, 'Opened') ? openAt.toISOString() : undefined, unsubscribed: i === 7 || i === 23 });
  });
  const suppressed = [
    ...campRows.filter((_, i) => i === 7 || i === 23).map((c, i) => ({ id: `sx${i}`, email: c.email, reason: 'Unsubscribed', at: iso(campAt + 864e5) })),
    ...emails.filter((e) => e.status === 'Bounced').slice(0, 3).map((e, i) => ({ id: `sb${i}`, email: e.to, reason: 'Bounced', at: e.at })),
  ];
  const emailCampaigns = [{ id: 'ec1', name: 'October news', templateId: 'et4', subject: 'What is new this month', subjectB: '{name}, three changes worth a look', audience: { kind: 'contact', status: '' }, status: 'Sent', sentAt: iso(campAt), createdAt: iso(campAt - 864e5), count: campRows.length, sample: true }];
  return { ...d, emailV1: true, emailTemplates: templates, emails: [...emails, ...(d.emails || [])], emailSuppressed: [...suppressed, ...(d.emailSuppressed || [])], emailCampaigns: [...emailCampaigns, ...(d.emailCampaigns || [])] };
};
