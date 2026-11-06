// Ready-made setups for a new company: its deal stages, dropdown lists, extra fields and starting rules.
const stages = (...rows) => [...rows.map(([name, prob], i) => ({ id: `s${i + 1}`, name, prob })), { id: 'won', name: 'Won', prob: 100 }];
const field = (k, label, extra = {}) => ({ k: `cf_${k}`, label, ...extra });
const rule = (id, name, trigger, actions, more = {}) => ({ id, name, trigger, actions, active: true, conditions: [], runs: 0, ...more });
const chase = rule('t_chase', 'Chase overdue invoices', 'invoice.overdue', [{ type: 'email', text: 'Payment reminder for {name}', days: 0, to: 'owner' }, { type: 'task', text: 'Call about overdue invoice {name}', days: 1, to: 'owner' }], { days: 0 });
const delivery = rule('t_delivery', 'Tell customers about deliveries', 'shipment.status', [{ type: 'whatsapp', text: 'Update on delivery {name}: it is now {status}.', days: 0, to: 'owner' }]);

export const TEMPLATES = {
  distributor: {
    label: 'Distributor or wholesaler',
    stages: stages(['Enquiry', 10], ['Rate quoted', 40], ['Negotiation', 70], ['Order confirmed', 90]),
    picklists: { orderChannel: ['Direct', 'Dealer', 'Sales rep', 'Web store'], leadSource: ['Dealer referral', 'Trade fair', 'Field visit', 'Website', 'Phone enquiry'], industry: ['Retail', 'Wholesale', 'Construction', 'Hospitality', 'Healthcare'], paymentTerms: ['Advance', '15 days', '30 days', '45 days', '60 days'] },
    fields: { company: [field('territory', 'Territory'), field('credit', 'Credit limit', { type: 'number' })] },
    rules: [chase, delivery],
  },
  manufacturer: {
    label: 'Manufacturer',
    stages: stages(['Enquiry', 10], ['Sample sent', 30], ['Technical review', 50], ['Commercial offer', 70], ['Purchase order', 90]),
    picklists: { orderChannel: ['Direct', 'Distributor', 'Tender'], leadSource: ['Trade fair', 'Referral', 'Tender portal', 'Website'], industry: ['Automotive', 'Pharma', 'Engineering', 'Textiles', 'Food processing'], paymentTerms: ['Advance', '50% advance', '30 days', '60 days'] },
    fields: { deal: [field('leadtime', 'Production lead time (days)', { type: 'number' })], product: [field('moq', 'Minimum order quantity', { type: 'number' })] },
    rules: [chase, delivery],
  },
  services: {
    label: 'Services or agency',
    stages: stages(['New enquiry', 10], ['Discovery call', 30], ['Proposal sent', 60], ['Contract review', 85]),
    picklists: { leadSource: ['Referral', 'LinkedIn', 'Website', 'Event'], industry: ['Technology', 'Finance', 'Education', 'Healthcare'], productCategory: ['Consulting', 'Retainer', 'Project', 'Training'] },
    fields: { deal: [field('startdate', 'Expected start date', { type: 'date' })] },
    rules: [chase],
  },
  retail: {
    label: 'Retail or e-commerce',
    stages: stages(['Interested', 20], ['Quoted', 50], ['Ready to buy', 80]),
    picklists: { orderChannel: ['Store', 'Website', 'Marketplace', 'WhatsApp'], leadSource: ['Walk-in', 'Instagram', 'Website', 'Referral'], productCategory: ['New arrivals', 'Bestsellers', 'Accessories', 'Clearance'] },
    fields: {},
    rules: [delivery],
  },
};

export const applyTemplate = (d, key) => {
  const t = TEMPLATES[key];
  if (!t) return d;
  return {
    ...d,
    stages: t.stages,
    picklists: { ...d.picklists, ...t.picklists },
    formConfig: Object.fromEntries(Object.entries(t.fields).map(([form, custom]) => [form, { custom }])),
    automations: t.rules.map((r) => ({ ...r })),
  };
};
