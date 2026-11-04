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
