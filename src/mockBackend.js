// Stands in for a server and calling provider, so the full call flow can be tried in the browser.
// Nothing here dials or receives a real call. A real backend would make these decisions instead.
export const RING_SECONDS = 15;

const digits = (s = '') => s.replace(/\D/g, '');
const same = (a, b) => digits(a).length >= 6 && digits(a) === digits(b);

// Who is calling, worked out from their number the way a server would.
export const matchCaller = (db, phone) => {
  const contact = db.contacts.find((c) => same(c.phone, phone));
  if (contact) return contactCaller(db, contact);
  const company = db.companies.find((c) => same(c.phone, phone));
  if (company) return { known: true, name: company.name, phone, relatedType: 'company', relatedId: company.id, companyId: company.id, ownerId: company.ownerId };
  const lead = db.leads.find((l) => same(l.phone, phone));
  if (lead) return { known: true, name: lead.name, phone, sub: lead.company, relatedType: 'lead', relatedId: lead.id, ownerId: lead.ownerId };
  return { known: false, name: phone, phone, relatedType: '', relatedId: '' };
};
export const contactCaller = (db, c) => ({
  known: true, name: `${c.first} ${c.last}`, phone: c.phone, sub: db.companies.find((x) => x.id === c.companyId)?.name, relatedType: 'contact', relatedId: c.id, contactId: c.id, companyId: c.companyId, ownerId: c.ownerId,
});

// The order people ring in: the owner, then their manager, then the Admin. Unknown numbers start with managers.
export const ringOrder = (db, caller) => {
  const active = db.users.filter((u) => u.active);
  const owner = active.find((u) => u.id === caller.ownerId);
  const manager = db.teams.find((t) => t.id === owner?.teamId)?.managerId;
  const managers = caller.known ? [manager] : active.filter((u) => u.role === 'manager').map((u) => u.id);
  const admins = active.filter((u) => u.role === 'admin').map((u) => u.id);
  return [...new Set([owner?.id, ...managers, ...admins])].filter((id) => id && active.some((u) => u.id === id));
};

/* ---------- What a phone and messaging network would do ---------- */
const later = (from, s) => new Date(from + s * 1000).toISOString();
const REPLIES = ['Thanks, this is helpful. Can we speak this week?', 'Please send me the price list.', 'Got it. I will discuss with my team and come back to you.', 'Interesting. What would be the next step?', 'Not right now, but please check back next month.'];
export const pickReply = () => REPLIES[Math.floor(Math.random() * REPLIES.length)];

// When an email will be delivered, opened and answered. Short times, so the demo moves while you watch.
export const emailPlan = () => {
  const now = Date.now();
  const roll = Math.random();
  if (roll < 0.04) return { bounceAt: later(now, 6) };
  const net = { deliverAt: later(now, 4) };
  if (roll < 0.72) net.openAt = later(now, 12 + Math.random() * 25);
  if (roll < 0.34) net.clickAt = later(now, 30 + Math.random() * 25);
  if (roll < 0.24) { net.replyAt = later(now, 50 + Math.random() * 60); net.reply = pickReply(); }
  // A few people unsubscribe after opening.
  else if (roll > 0.6 && roll < 0.63) net.unsubAt = later(now, 40 + Math.random() * 30);
  return net;
};
export const whatsappPlan = () => {
  const now = Date.now();
  const roll = Math.random();
  // A few numbers aren't on WhatsApp, so the message fails.
  if (roll > 0.97) return { failAt: later(now, 3) };
  const net = { deliverAt: later(now, 3) };
  if (roll < 0.85) net.readAt = later(now, 8 + Math.random() * 20);
  if (roll < 0.35) { net.replyAt = later(now, 30 + Math.random() * 50); net.reply = pickReply(); }
  return net;
};

// Whether an outgoing call would connect.
export const callOutcomeRoll = () => { const r = Math.random(); return r < 0.72 ? 'connected' : r < 0.9 ? 'noanswer' : 'busy'; };
// A made-up transcript and summary for a recorded call, so the review screen can be tried.
export const fakeTranscript = (me, name, note) => {
  const first = /^[+0-9]/.test(name || '') || !name ? 'The customer' : name.split(' ')[0];
  const lines = [
    { who: 'you', text: `Hello${first === "The customer" ? "" : ` ${first}`}, this is ${me.split(' ')[0]}. Is this a good time to talk?` },
    { who: 'them', text: 'Yes, go ahead.' },
    { who: 'you', text: 'I wanted to follow up on our last conversation and see where things stand.' },
    { who: 'them', text: 'We are still comparing options. Pricing is the main question for us.' },
    { who: 'you', text: 'Understood. I can send the details and we can review them together.' },
    { who: 'them', text: 'That works. Please send them over.' },
  ];
  return { lines, summary: `${first} is still comparing options, and pricing is the main question. Agreed to send the details.${note ? ` Your note: ${note}` : ''}` };
};
