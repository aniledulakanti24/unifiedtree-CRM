import { addDays, iso } from './util';
import { defaultPermissions } from './permissions';

// Deterministic demo data, dated relative to the first load so dashboards stay current.
function prng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DEFAULT_STAGES = [
  { id: 'new', name: 'New', prob: 10 },
  { id: 'qualified', name: 'Qualified', prob: 30 },
  { id: 'proposition', name: 'Proposition', prob: 60 },
  { id: 'negotiation', name: 'Negotiation', prob: 80 },
  { id: 'won', name: 'Won', prob: 100 },
];

// Each company edits its own stages. The store points this at the open company's list, like setCurrency.
export let STAGES = DEFAULT_STAGES;
export const setStages = (list) => { STAGES = list; };

export function seed() {
  const r = prng(20261103);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const ts = (n) => new Date(Date.now() + n * 864e5 - int(0, 8) * 36e5).toISOString();

  const teams = [
    { id: 't1', name: 'Enterprise East', managerId: 'u2', target: 1600000, email: 'east@unifiedtree.demo', description: 'Named enterprise accounts across the eastern region.' },
    { id: 't2', name: 'Growth West', managerId: 'u3', target: 1300000, email: 'west@unifiedtree.demo', description: 'Mid-market and inbound opportunities in the west.' },
  ];
  const users = [
    ['u1', 'Priya Nair', 'admin', null, 'CRM Administrator', 0],
    ['u2', 'Daniel Ortiz', 'manager', 't1', 'Sales Manager, East', 360000],
    ['u3', 'Mei Tanaka', 'manager', 't2', 'Sales Manager, West', 320000],
    ['u4', 'Rohan Kapoor', 'sales', 't1', 'Account Executive', 520000],
    ['u5', 'Sara Lindqvist', 'sales', 't1', 'Account Executive', 480000],
    ['u6', 'Tom Becker', 'sales', 't1', 'Sales Representative', 340000],
    ['u7', 'Aisha Rahman', 'sales', 't2', 'Account Executive', 460000],
    ['u8', 'Luca Moretti', 'sales', 't2', 'Sales Representative', 300000],
    ['u9', 'Grace Mbeki', 'sales', 't2', 'Sales Representative', 300000],
  ].map(([id, name, role, teamId, title, target]) => ({
    id, name, role, teamId, title, target, active: true,
    email: `${name.split(' ')[0].toLowerCase()}@unifiedtree.demo`,
    phone: `+1 555 01${int(10, 99)}`,
  }));
  const owners = users.filter((u) => u.role !== 'admin').map((u) => u.id);

  const industries = ['Manufacturing', 'Finance', 'Healthcare', 'Retail', 'Technology', 'Logistics', 'Education', 'Energy'];
  const places = [['Boston', 'USA'], ['New York', 'USA'], ['Austin', 'USA'], ['Seattle', 'USA'], ['Denver', 'USA'], ['Toronto', 'Canada'], ['London', 'UK'], ['Berlin', 'Germany'], ['Mumbai', 'India'], ['Singapore', 'Singapore']];
  const cNames = ['Northwind Foods', 'Halcyon Systems', 'Brightpath Health', 'Copperline Energy', 'Vertex Freight', 'Larkspur Retail', 'Meridian Capital', 'Oakhaven Schools', 'Blue Harbor Marine', 'Sundial Robotics', 'Greywood Textiles', 'Riverbend Clinics', 'Atlas Fabrication', 'Juniper Software', 'Redwood Logistics', 'Summit Ridge Bank', 'Pinecrest Pharma', 'Solstice Solar', 'Fernhill Grocers', 'Kestrel Aerospace', 'Marlowe Insurance', 'Tidewater Shipping', 'Quillon Analytics', 'Ashford Academy', 'Beacon Telecom', 'Cobalt Mining', 'Evergreen Packaging', 'Lumen Devices'];
  const companies = cNames.map((name, i) => {
    const [city, country] = pick(places);
    const slug = name.toLowerCase().replace(/[^a-z]/g, '');
    return {
      id: `c${i + 1}`, name, industry: pick(industries), city, country, website: `www.${slug}.example`,
      phone: `+1 555 02${int(10, 99)}`, email: `hello@${slug}.example`, size: pick(['1-50', '51-200', '201-1000', '1000+']),
      status: r() > 0.32 ? 'Customer' : 'Prospect', ownerId: owners[i % owners.length], address: `${int(10, 980)} ${pick(['Market', 'Harbor', 'Oak', 'Summit', 'Mill'])} Street`,
      taxId: `TX-${int(100000, 999999)}`, paymentTerms: pick(['Immediate', '15 days', '30 days', '45 days']), priceList: pick(['Standard', 'Partner', 'Enterprise']),
      tags: r() > 0.5 ? [pick(['Key account', 'Renewal', 'Partner', 'VIP'])] : [], notes: '', createdAt: ts(-int(60, 500)),
    };
  });

  const first = ['Ava', 'Noah', 'Lena', 'Omar', 'Ines', 'Kai', 'Nina', 'Ravi', 'Elena', 'Marcus', 'Yuki', 'Hana', 'Felix', 'Zara', 'Peter', 'Anika', 'Jonas', 'Maya', 'Theo', 'Carla'];
  const last = ['Walsh', 'Fischer', 'Silva', 'Khan', 'Novak', 'Brooks', 'Sato', 'Iyer', 'Costa', 'Dubois', 'Hughes', 'Larsen', 'Reyes', 'Osei', 'Park'];
  const contacts = Array.from({ length: 56 }, (_, i) => {
    const c = i < companies.length ? companies[i] : pick(companies); const f = pick(first); const l = pick(last);
    return {
      id: `p${i + 1}`, first: f, last: l, title: pick(['VP Sales', 'Procurement Lead', 'CFO', 'Operations Director', 'IT Manager', 'Founder', 'Head of Growth', 'Buyer']),
      companyId: c.id, email: `${f}.${l}@${c.website.slice(4)}`.toLowerCase(), phone: `+1 555 03${int(10, 99)}`,
      status: pick(['Cold', 'Warm', 'Hot', 'In contract']), tags: r() > 0.45 ? [pick(['Decision maker', 'Influencer', 'Champion', 'Technical'])] : [],
      ownerId: c.ownerId, lastActivity: ts(-int(0, 75)), notes: '', createdAt: ts(-int(30, 400)),
    };
  });

  const sources = ['Website', 'Referral', 'Email campaign', 'Trade show', 'Cold call', 'Partner'];
  const dealWords = ['Annual licence', 'Fleet rollout', 'Platform upgrade', 'Support renewal', 'Pilot programme', 'Bulk order', 'Regional expansion', 'Integration project'];
  const stageIds = ['new', 'qualified', 'proposition', 'negotiation'];
  const deals = Array.from({ length: 140 }, (_, i) => {
    const c = pick(companies); const ct = contacts.find((p) => p.companyId === c.id);
    const roll = r();
    const status = roll < 0.42 ? 'open' : roll < 0.8 ? 'won' : 'lost';
    const stage = status === 'won' ? 'won' : pick(stageIds);
    const prob = status === 'won' ? 100 : status === 'lost' ? 0 : { new: 10, qualified: 30, proposition: 60, negotiation: 80 }[stage];
    const closeDate = status === 'open' ? addDays(int(-4, 130)) : addDays(-(i % 6 === 0 ? int(0, 2) : int(1, 355)));
    return {
      id: `d${i + 1}`, title: `${c.name.split(' ')[0]} · ${pick(dealWords)}`, companyId: c.id, contactId: ct?.id || '', ownerId: c.ownerId, stage, status,
      value: int(4, 96) * 1000, probability: prob, priority: pick([0, 0, 1, 1, 2, 3]), source: pick(sources), closeDate,
      tags: r() > 0.6 ? [pick(['Upsell', 'New logo', 'Renewal', 'Competitive'])] : [],
      lostReason: status === 'lost' ? pick(['Too expensive', 'Chose a competitor', 'No budget', 'Timing not right', 'Missing features']) : '',
      notes: '', createdAt: new Date(new Date(closeDate).getTime() - int(15, 80) * 864e5).toISOString(),
    };
  });

  const leads = Array.from({ length: 44 }, (_, i) => {
    const f = pick(first); const l = pick(last); const co = `${pick(['Alder', 'Birch', 'Cedar', 'Delta', 'Ember', 'Falcon', 'Harbor', 'Ion', 'Keystone', 'Mosaic'])} ${pick(['Labs', 'Group', 'Partners', 'Works', 'Trading'])}`;
    const [city, country] = pick(places);
    return {
      id: `l${i + 1}`, name: `${f} ${l}`, company: co, email: `${f}@${co.replace(/\s/g, '')}.example`.toLowerCase(), phone: `+1 555 04${int(10, 99)}`,
      title: pick(['Owner', 'Director', 'Purchasing Manager', 'CEO', 'Analyst']), source: pick(sources), status: pick(['New', 'New', 'Contacted', 'Qualified', 'Unqualified', 'Converted']),
      score: int(12, 97), ownerId: pick(owners), city, country, expected: int(3, 60) * 1000, notes: '', createdAt: ts(-int(0, 340)),
    };
  });

  const activityTypes = [
    { id: 'at1', name: 'To-Do', icon: 'CheckSquare', delay: 5, action: 'None', summary: '', userId: '', chainId: '' },
    { id: 'at2', name: 'Call', icon: 'Phone', delay: 2, action: 'Phone call', summary: 'Follow-up call', userId: '', chainId: '' },
    { id: 'at3', name: 'Email', icon: 'Mail', delay: 3, action: 'Upload document', summary: 'Send follow-up', userId: '', chainId: '' },
    { id: 'at4', name: 'Meeting', icon: 'Users', delay: 7, action: 'Meeting', summary: 'Client meeting', userId: '', chainId: 'at1' },
    { id: 'at5', name: 'Send Quote', icon: 'FileText', delay: 1, action: 'Sign document', summary: 'Prepare and send quote', userId: '', chainId: 'at2' },
  ];
  const lostReasons = ['Too expensive', 'Chose a competitor', 'No budget', 'Timing not right', 'Missing features', 'No response'].map((name, i) => ({ id: `lr${i + 1}`, name }));

  const taskWords = ['Follow up on proposal', 'Confirm contract terms', 'Prepare product demo', 'Update account plan', 'Review renewal pricing', 'Send onboarding pack', 'Qualify inbound request', 'Share case study'];
  const openDeals = deals.filter((d) => d.status === 'open');
  const activities = Array.from({ length: 130 }, (_, i) => {
    const d = pick(openDeals); const roll = r();
    return {
      id: `a${i + 1}`, typeId: pick(activityTypes).id, summary: pick(taskWords), due: addDays(int(-6, 16)), ownerId: d.ownerId,
      relatedType: 'deal', relatedId: d.id, relatedLabel: d.title, status: roll < 0.55 ? 'todo' : roll < 0.78 ? 'doing' : 'done',
      priority: pick(['Low', 'Medium', 'High']), tag: pick(['Sales', 'Renewal', 'Marketing', 'Support']), note: '', createdAt: ts(-int(1, 30)),
    };
  });

  const eventWords = [['Discovery call', 'Call'], ['Product demo', 'Demo'], ['Contract review', 'Meeting'], ['Quarterly business review', 'Meeting'], ['Onboarding kickoff', 'Meeting'], ['Follow-up call', 'Call'], ['Site visit', 'Visit']];
  const events = Array.from({ length: 96 }, (_, i) => {
    const c = pick(companies); const [t, category] = pick(eventWords); const day = new Date(Date.now() + int(-24, 40) * 864e5);
    day.setHours(int(9, 16), pick([0, 30]), 0, 0);
    return { id: `e${i + 1}`, title: `${t}: ${c.name}`, category, start: day.toISOString(), end: new Date(day.getTime() + pick([30, 60, 90]) * 6e4).toISOString(), companyId: c.id, ownerId: c.ownerId, location: pick(['Video call', 'Client office', 'Phone', 'HQ boardroom']), notes: '' };
  });

  const warehouses = [
    { id: 'w1', name: 'Boston Central', code: 'BOS', city: 'Boston', capacity: 12000 },
    { id: 'w2', name: 'Austin Hub', code: 'AUS', city: 'Austin', capacity: 8000 },
    { id: 'w3', name: 'Rotterdam EU', code: 'RTM', city: 'Rotterdam', capacity: 6000 },
  ];
  const prodBase = [['Tree Sensor Node', 'Hardware', 149], ['Gateway Pro 5G', 'Hardware', 620], ['Handheld Scanner X2', 'Hardware', 289], ['Label Printer 4in', 'Hardware', 340], ['Rack Mount Kit', 'Accessories', 58], ['Charging Dock', 'Accessories', 74], ['Protective Case', 'Accessories', 26], ['Cable Set 3m', 'Accessories', 18], ['CRM Seat, Annual', 'Software', 480], ['Analytics Add-on', 'Software', 960], ['API Access Tier', 'Software', 1200], ['Mobile App Licence', 'Software', 220], ['Onboarding Package', 'Services', 1800], ['Premium Support', 'Services', 2400], ['Data Migration', 'Services', 3200], ['Field Training Day', 'Services', 1100], ['Solar Power Pack', 'Hardware', 415], ['Outdoor Enclosure', 'Accessories', 132], ['Barcode Labels 5k', 'Consumables', 42], ['Thermal Ribbon', 'Consumables', 16]];
  const products = prodBase.map(([name, category, price], i) => {
    const digital = category === 'Software' || category === 'Services';
    return { id: `pr${i + 1}`, sku: `UT-${1000 + i * 7}`, name, category, price, cost: Math.round(price * (digital ? 0.25 : 0.58)), stock: digital ? 0 : pick([0, 4, 9, 18, 36, 64, 120, 240]), reorder: digital ? 0 : pick([10, 20, 30]), warehouseId: pick(warehouses).id, supplier: digital ? 'Unifiedtree' : pick(['Hexa Components', 'Norbury Supply', 'Pacific Parts']), tracked: !digital, active: true, description: `${name} for field and office teams.`, createdAt: ts(-int(90, 500)) };
  });

  const orders = [];
  const invoices = [];
  const payments = [];
  const shipments = [];
  const vehicles = [
    ['MA-01-4471', 'Heavy truck', 'Marta Ruiz', 'On route', 78], ['TX-22-9012', 'Box van', 'Ben Adler', 'On route', 54], ['MA-09-1180', 'Heavy truck', 'Ivan Petrov', 'Loading', 31],
    ['NL-44-7203', 'Trailer', 'Sanne de Vries', 'Idle', 0], ['MA-11-3345', 'Box van', 'Kofi Mensah', 'Maintenance', 0], ['TX-30-5581', 'Pickup', 'Ana Duarte', 'On route', 66],
  ].map(([plate, type, driver, status, load], i) => ({ id: `v${i + 1}`, plate, type, driver, status, load }));
  const carriers = ['Unifiedtree Fleet', 'NorthStar Freight', 'BlueLine Express'];
  const hubs = warehouses.map((w) => w.city);
  const physical = products.filter((p) => p.tracked);
  for (let i = 0; i < 88; i++) {
    const c = pick(companies); const back = i < 12 ? int(0, 9) : int(5, 330);
    const date = addDays(-back);
    const items = Array.from({ length: int(1, 3) }, () => { const p = pick(products); return { productId: p.id, name: p.name, qty: int(1, 9), price: p.price }; });
    const total = items.reduce((a, x) => a + x.qty * x.price, 0);
    const status = back > 20 ? (r() < 0.9 ? 'Completed' : 'Cancelled') : pick(['Pending', 'Processing', 'Processing', 'Shipped', 'Completed']);
    const number = `SO-${7000 + i}`;
    const id = `o${i + 1}`;
    orders.push({ id, number, companyId: c.id, ownerId: c.ownerId, date, status, items, total, channel: pick(['Direct', 'Partner', 'Web store']), createdAt: new Date(date).toISOString() });
    if (status === 'Cancelled' || status === 'Pending') continue;
    const invId = `i${invoices.length + 1}`; const due = addDays(30 - back);
    const paidAll = back > 60 || (status === 'Completed' && r() > 0.25);
    const paid = paidAll ? total : r() > 0.7 ? Math.round(total / 2) : 0;
    invoices.push({ id: invId, number: `INV-${5200 + invoices.length}`, orderId: id, companyId: c.id, ownerId: c.ownerId, date, due, items, total, paid, status: paid >= total ? 'Paid' : new Date(due) < new Date() ? 'Overdue' : paid > 0 ? 'Partially paid' : 'Sent', createdAt: new Date(date).toISOString() });
    if (paid) payments.push({ id: `pay${payments.length + 1}`, number: `PAY-${3100 + payments.length}`, invoiceId: invId, companyId: c.id, ownerId: c.ownerId, amount: paid, method: pick(['Bank transfer', 'Card', 'Cheque']), date: addDays(-Math.max(0, back - int(1, 20))), createdAt: ts(-back) });
    if (items.some((x) => physical.find((p) => p.id === x.productId)) || r() > 0.5) {
      const st = back > 12 ? 'Delivered' : pick(['Picked up', 'In Transit', 'In Transit', 'Delayed', 'Delivered']);
      const v = pick(vehicles);
      const past = (n) => addDays(Math.min(0, n));
      const log = [{ label: 'Picked up', at: past(-back + 1) }];
      if (st !== 'Picked up') log.push({ label: 'In Transit', at: past(-back + 2) });
      if (st === 'Delayed') log.push({ label: 'Delayed', at: past(-back + 3) });
      if (st === 'Delivered') log.push({ label: 'Delivered', at: past(-back + int(3, 6)) });
      shipments.push({ id: `s${shipments.length + 1}`, tracking: `UT-${int(10000, 99999)}-${int(1000, 9999)}`, orderId: id, orderNumber: number, companyId: c.id, origin: pick(hubs), destination: c.city, carrier: pick(carriers), vehicleId: v.id, status: st, shipDate: past(-back + 1), eta: st === 'Delivered' ? past(-back + int(3, 7)) : addDays(int(1, 6)), log, ownerId: c.ownerId, createdAt: ts(-back) });
    }
  }
  const quotes = Array.from({ length: 22 }, (_, i) => {
    const d = pick(openDeals); const p = pick(products); const qty = int(1, 12); const back = int(0, 40);
    return { id: `q${i + 1}`, number: `QT-${4400 + i}`, dealId: d.id, companyId: d.companyId, ownerId: d.ownerId, date: addDays(-back), expiry: addDays(30 - back), items: [{ productId: p.id, name: p.name, qty, price: p.price }], total: qty * p.price, status: back > 30 ? 'Expired' : pick(['Draft', 'Sent', 'Sent', 'Accepted', 'Rejected']), createdAt: ts(-back) };
  });
  const stockMoves = Array.from({ length: 30 }, (_, i) => {
    const p = pick(physical); const type = pick(['Receipt', 'Delivery', 'Adjustment']);
    return { id: `m${i + 1}`, productId: p.id, type, qty: type === 'Delivery' ? -int(1, 12) : int(1, 40), reason: type === 'Receipt' ? 'Supplier delivery' : type === 'Delivery' ? 'Sales order' : 'Cycle count', userId: pick(owners), warehouseId: p.warehouseId, date: addDays(-int(0, 40)) };
  });

  const caseSubjects = ['Gateway drops offline after update', 'Invoice shows wrong tax rate', 'Cannot add new seats', 'Scanner not pairing', 'Request for data export', 'Delivery arrived damaged', 'API rate limit questions', 'Password reset emails delayed'];
  const cases = Array.from({ length: 30 }, (_, i) => {
    const c = pick(companies); const ct = contacts.find((p) => p.companyId === c.id); const at = ts(-int(0, 45));
    return {
      id: `cs${i + 1}`, number: 1200 + i, subject: pick(caseSubjects), companyId: c.id, contactId: ct?.id || '', status: pick(['New', 'Assigned', 'Assigned', 'Pending', 'Closed', 'Rejected']), priority: pick(['Low', 'Normal', 'Normal', 'High', 'Urgent']),
      type: pick(['Question', 'Incident', 'Problem']), ownerId: c.ownerId, description: 'Customer reported the issue through the support portal. See the stream for updates.', stream: [{ at, by: c.ownerId, text: 'Case created from support portal.' }], createdAt: at,
    };
  });

  const transfers = [
    { id: 'tr1', recordType: 'deal', recordId: deals.find((d) => d.ownerId === 'u4' && d.status === 'open')?.id || openDeals[0].id, toId: 'u5', reason: 'Sara already manages this account group.', includeRelated: true, status: 'Pending', requestedBy: 'u4', requestedAt: ts(-1) },
    { id: 'tr2', recordType: 'company', recordId: companies.find((c) => c.ownerId === 'u7')?.id || 'c2', toId: 'u8', reason: 'Territory realignment for the new quarter.', includeRelated: true, status: 'Pending', requestedBy: 'u7', requestedAt: ts(-2) },
    { id: 'tr3', recordType: 'lead', recordId: leads.find((l) => l.ownerId === 'u4')?.id || 'l3', toId: 'u4', reason: 'Lead asked for a senior contact.', includeRelated: false, status: 'Approved', requestedBy: 'u6', requestedAt: ts(-11), decidedBy: 'u2', decidedAt: ts(-10), note: 'Approved.' },
  ].map((t) => {
    const src = { deal: deals, company: companies, lead: leads }[t.recordType].find((x) => x.id === t.recordId);
    return { ...t, fromId: t.status === 'Approved' ? t.requestedBy : (src?.ownerId || t.requestedBy), recordLabel: (t.recordType === 'deal' ? src?.title : src?.name) || t.recordId };
  });

  const audit = Array.from({ length: 34 }, (_, i) => {
    const d = pick(deals); const stage = pick(['qualified', 'proposition', 'negotiation']); const p = pick(products); const a = pick(activities);
    const at = new Date(Date.now() - (i + 1) * 0.6 * 864e5).toISOString();
    if (i % 3 === 0) return { id: `au${i}`, at, userId: d.ownerId, action: 'Update', entity: 'deals', entityId: d.id, label: d.title, changes: [{ field: 'Stage', from: 'new', to: stage }] };
    if (i % 3 === 1) return { id: `au${i}`, at, userId: a.ownerId, action: 'Create', entity: 'activities', entityId: a.id, label: a.summary, changes: [] };
    return { id: `au${i}`, at, userId: pick(['u1', 'u2', 'u3']), action: 'Update', entity: 'products', entityId: p.id, label: p.name, changes: [{ field: 'Price', from: String(p.price - 10), to: String(p.price) }] };
  });
  const notifications = [
    { id: 'n1', to: 'u2', at: ts(-1), text: 'Rohan Kapoor asked to transfer a deal to Sara Lindqvist.', link: '/transfers', read: false },
    { id: 'n2', to: 'u3', at: ts(-2), text: 'Aisha Rahman asked to transfer a customer to Luca Moretti.', link: '/transfers', read: false },
    { id: 'n4', to: 'u1', at: ts(-1), text: 'Rohan Kapoor asked to meet: "Pricing for the Kestrel renewal"', link: '/meetings?open=mr1', read: false },
    { id: 'n3', to: 'u1', at: ts(-1), text: `${products.filter((p) => p.tracked && p.stock <= p.reorder).length} products are at or below their reorder level.`, link: '/inventory', read: false },
  ];
  const outcomes = ['Connected', 'Connected', 'Connected', 'No answer', 'Busy', 'Left voicemail'];
  const callNotes = ['Discussed pricing, will review with their team.', 'Asked for a follow-up next week.', 'Confirmed delivery date.', 'Interested in a demo.', ''];
  const calls = Array.from({ length: 90 }, (_, i) => {
    const c = pick(contacts); const outcome = pick(outcomes); const back = i < 14 ? 0 : int(0, 40);
    const at = new Date(Date.now() - back * 864e5 - int(0, 7) * 36e5).toISOString();
    return { id: `ca${i + 1}`, type: r() > 0.85 ? 'video' : 'voice', direction: r() > 0.72 ? 'Incoming' : 'Outgoing', name: `${c.first} ${c.last}`, phone: c.phone, companyId: c.companyId, relatedType: 'contact', relatedId: c.id, ownerId: c.ownerId, at, duration: outcome === 'Connected' ? int(45, 900) : 0, outcome, note: outcome === 'Connected' ? pick(callNotes) : '', createdAt: at };
  });

  const followWords = ['Call back about the proposal', 'Check on the quote decision', 'Confirm the demo time', 'Share the updated pricing', 'Renewal check-in', 'Follow up after the site visit'];
  const followups = [];
  owners.forEach((ownerId) => {
    const mine = contacts.filter((c) => c.ownerId === ownerId);
    // Hours from now. Only the one due right now pops up on login; older ones are already acknowledged.
    [-52, -28, -3, -0.1, 2, 5, 27, 75, 170].forEach((h) => {
      const c = pick(mine.length ? mine : contacts); const at = new Date(Date.now() + h * 36e5).toISOString();
      const f = { id: `fu${followups.length + 1}`, title: pick(followWords), at, channel: h === -0.1 ? 'Call' : pick(['Call', 'Call', 'Video', 'WhatsApp', 'Email', 'Meeting']), remindBefore: 15, ownerId, contactId: c.id, name: `${c.first} ${c.last}`, phone: c.phone, relatedType: 'contact', relatedId: c.id, status: 'open', note: '', snoozedUntil: null, ackFor: null, notifiedFor: null, createdAt: ts(-4) };
      if (h < -1) { f.ackFor = new Date(new Date(at).getTime() - 15 * 6e4).toISOString(); f.notifiedFor = f.ackFor; }
      followups.push(f);
    });
    const c = pick(mine.length ? mine : contacts);
    followups.push({ id: `fu${followups.length + 1}`, title: 'Sent the contract', at: ts(-6), channel: 'Email', remindBefore: 15, ownerId, contactId: c.id, name: `${c.first} ${c.last}`, phone: c.phone, relatedType: 'contact', relatedId: c.id, status: 'done', note: '', createdAt: ts(-9) });
  });

  const chatLines = [['Hi, did you get a chance to look at the quote?', 'Yes, it looks good. Can we talk about delivery?'], ['Thanks for the call today.', 'Thank you. Please send the brochure when you can.'], ['Your order has shipped.', 'Great, thanks for the update!']];
  const conversations = contacts.slice(0, 24).map((c, i) => {
    const [a, b] = chatLines[i % chatLines.length];
    const t0 = Date.now() - (i + 1) * 5 * 36e5;
    return { id: `wa${i + 1}`, kind: 'whatsapp', contactId: c.id, name: `${c.first} ${c.last}`, phone: c.phone, ownerId: c.ownerId, reads: i % 3 === 0 ? {} : { [c.ownerId]: new Date().toISOString() }, createdAt: new Date(t0).toISOString(),
      messages: [{ id: `wm${i}a`, at: new Date(t0).toISOString(), by: c.ownerId, text: a, status: 'Sample' }, { id: `wm${i}b`, at: new Date(t0 + 18e5).toISOString(), by: null, text: b }] };
  });
  [['u2', 'u4', 'Can you join the Brightpath call at 3?', 'Yes, I will be there.'], ['u2', 'u5', 'Please update the Kestrel forecast today.', 'Done, it is in the pipeline now.'], ['u3', 'u7', 'Great work on the renewal this week.', 'Thank you!'], ['u4', 'u5', 'Do you have the latest price list?', 'Sending it over now.'], ['u1', 'u2', 'Team targets look good this month.', 'Thanks, we are on track.'], ['u1', 'u3', 'Please review the transfer requests.', 'Will do today.']].forEach(([x, y, a, b], i) => {
    const t0 = Date.now() - (i + 1) * 3 * 36e5;
    conversations.push({ id: `tc${i + 1}`, kind: 'team', members: [x, y], reads: { [x]: new Date(t0).toISOString() }, createdAt: new Date(t0).toISOString(), messages: [{ id: `tm${i}a`, at: new Date(t0).toISOString(), by: x, text: a, status: 'Sent' }, { id: `tm${i}b`, at: new Date(t0 + 12e5).toISOString(), by: y, text: b, status: 'Sent' }] });
  });

  const askedAt = new Date(Date.now() - 3 * 36e5).toISOString();
  const preferred = new Date(Date.now() + 864e5); preferred.setHours(11, 0, 0, 0);
  const meetingRequests = [{ id: 'mr1', requestedBy: 'u4', toId: 'u1', topic: 'Pricing for the Kestrel renewal', note: 'They want a discount above my limit. I need a decision before Friday.', preferredAt: preferred.toISOString(), minutes: 30, status: 'Pending', createdAt: askedAt, history: [{ at: askedAt, by: 'u4', action: 'Requested', toId: 'u1' }] }];

  const settings = {
    companyName: 'Unifiedtree', currency: 'USD', timezone: 'America/New_York', fiscalStart: 'January', supportEmail: 'support@unifiedtree.demo', businessNumber: '+91 80 0000 0100',
    useLeads: true, multiTeams: true, ruleAssignment: false, assignInterval: 'Daily', predictiveScoring: true, leadMining: true, emailGateway: false, gatewayAlias: 'sales', recurring: false, visits: false, partnerAutocomplete: true,
    voiceEnabled: true, videoEnabled: true, whatsappEnabled: true, requireLostReason: true, transferNeedsApproval: true, lowStockAlerts: true, allowBackorder: false, invoicePrefix: 'INV-', defaultTerms: '30 days', taxRate: 8,
  };
  return { users, teams, companies, contacts, deals, leads, activities, activityTypes, lostReasons, events, products, warehouses, stockMoves, orders, invoices, payments, quotes, shipments, vehicles, cases, transfers, audit, notifications, calls, followups, conversations, meetingRequests, picklists: {}, labels: {}, titles: {}, stages: DEFAULT_STAGES, chatter: {}, settings, permissions: defaultPermissions(), seededAt: iso(new Date()) };
}

// A new company has no records, only the CRM's default configuration and its first admin.
export function blankCompany(name, admin) {
  const base = seed();
  const empty = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Array.isArray(v) ? [] : v]));
  return {
    ...empty, stages: base.stages, activityTypes: base.activityTypes, lostReasons: base.lostReasons,
    warehouses: [{ id: 'w1', name: 'Main warehouse', code: 'MAIN', city: '', capacity: 10000 }],
    users: admin ? [{ ...admin, teamId: null }] : [],
    settings: { ...base.settings, companyName: name, supportEmail: '', businessNumber: `+91 80 0000 01${String(Math.floor(Math.random() * 90) + 10)}` },
  };
}
