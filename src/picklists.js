// Every dropdown a company can add its own options to. Saved per company in db.picklists.
// locked: the CRM's logic depends on these values, so a rename changes the word people see, not the stored value.
// fixed: a step in a built-in workflow, which can be renamed but not removed. Nothing can be added to these lists.
// used: where the value is stored, so a rename can update existing records.
const validCurrency = (v) => { try { new Intl.NumberFormat('en-US', { style: 'currency', currency: v }); return ''; } catch { return 'Enter a 3-letter currency code, such as AED.'; } };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const validMonth = (v) => (MONTHS.includes(v) ? '' : 'Enter a month, such as March.');
const span = (m) => (m && m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m && m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`);
const validZone = (v) => { try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return ''; } catch { return 'Enter a time zone name, such as Asia/Dubai.'; } };

export const PICKLISTS = [
  { group: 'Calendar', key: 'eventCategory', label: 'Appointment category', defaults: ['Meeting', 'Demo', 'Call', 'Visit', 'Holiday'], locked: ['Meeting', 'Holiday'], used: [['events', 'category']] },
  { group: 'Communication', key: 'followupChannel', label: 'Follow-up channel', defaults: ['Call', 'Video', 'WhatsApp', 'Email', 'Meeting'], locked: ['Call', 'Video', 'WhatsApp'], used: [['followups', 'channel']] },
  { group: 'Communication', key: 'callOutcome', label: 'Call outcome', defaults: ['Connected', 'No answer', 'Busy', 'Left voicemail', 'Wrong number'], locked: ['Connected', 'No answer'], used: [['calls', 'outcome']] },
  { group: 'Communication', key: 'messageTemplate', label: 'WhatsApp template', defaults: ['Hi {name}, thanks for your time today. I will share the details shortly.', 'Hi {name}, just following up on our conversation. Is this a good time to talk?', 'Hi {name}, your quote is ready. Shall I walk you through it?', 'Hi {name}, your order is on its way. I will share the tracking details soon.'], used: [], placeholder: 'Write {name} where their first name goes' },
  { group: 'Communication', key: 'reminderTime', label: 'Follow-up reminder time', defaults: [0, 15, 30, 60, 1440], locked: [0], used: [['followups', 'remindBefore']], noRename: true, numeric: true, placeholder: 'Minutes before, such as 45', format: (m) => (Number(m) === 0 ? 'At the time' : `${span(Number(m))} before`) },
  { group: 'Communication', key: 'meetingLength', label: 'Meeting length', defaults: [15, 30, 45, 60, 90], used: [['meetingRequests', 'minutes']], noRename: true, numeric: true, min: 1, placeholder: 'Minutes, such as 120', format: (m) => span(Number(m)) },
  { group: 'Sales', key: 'leadSource', label: 'Lead source', defaults: ['Website', 'Referral', 'Email campaign', 'Trade show', 'Cold call', 'Partner'], used: [['leads', 'source'], ['deals', 'source']] },
  { group: 'Sales', key: 'leadStatus', label: 'Lead status', defaults: ['New', 'Contacted', 'Qualified', 'Unqualified'], locked: ['New', 'Contacted', 'Qualified', 'Unqualified'], used: [['leads', 'status']] },
  { group: 'Sales', key: 'contactStatus', label: 'Contact status', defaults: ['Cold', 'Warm', 'Hot', 'In contract'], used: [['contacts', 'status']] },
  { group: 'Sales', key: 'customerType', label: 'Customer type', defaults: ['Customer', 'Prospect'], locked: ['Customer', 'Prospect'], used: [['companies', 'status']] },
  { group: 'Sales', key: 'industry', label: 'Industry', defaults: ['Manufacturing', 'Finance', 'Healthcare', 'Retail', 'Technology', 'Logistics', 'Education', 'Energy'], used: [['companies', 'industry'], ['leads', 'industry']] },
  { group: 'Sales', key: 'country', label: 'Country', defaults: ['USA', 'Canada', 'UK', 'Germany', 'India', 'Singapore'], used: [['leads', 'country']] },
  { group: 'Sales', key: 'companySize', label: 'Company size', defaults: ['1-50', '51-200', '201-1000', '1000+'], used: [['companies', 'size'], ['leads', 'size']] },
  { group: 'Sales', key: 'paymentTerms', label: 'Payment terms', defaults: ['Immediate', '15 days', '30 days', '45 days'], used: [['companies', 'paymentTerms']] },
  { group: 'Sales', key: 'priceList', label: 'Price list', defaults: ['Standard', 'Partner', 'Enterprise'], used: [['companies', 'priceList']] },
  { group: 'Commerce', key: 'orderChannel', label: 'Order channel', defaults: ['Direct', 'Partner', 'Web store'], locked: ['Direct'], used: [['orders', 'channel']] },
  { group: 'Commerce', key: 'productCategory', label: 'Product category', defaults: ['Hardware', 'Accessories', 'Software', 'Services', 'Consumables'], used: [['products', 'category']] },
  { group: 'Commerce', key: 'paymentMethod', label: 'Payment method', defaults: ['Bank transfer', 'Card', 'Cheque', 'Cash'], used: [['payments', 'method']] },
  { group: 'Operations', key: 'vehicleStatus', label: 'Vehicle status', defaults: ['On route', 'Loading', 'Idle', 'Maintenance'], locked: ['On route'], used: [['vehicles', 'status']] },
  { group: 'Support', key: 'caseType', label: 'Case type', defaults: ['Question', 'Incident', 'Problem'], used: [['cases', 'type']] },
  { group: 'Support', key: 'casePriority', label: 'Case priority', defaults: ['Low', 'Normal', 'High', 'Urgent'], locked: ['Normal', 'Urgent'], used: [['cases', 'priority']] },
  { group: 'Support', key: 'caseStatus', label: 'Case status', defaults: ['New', 'Assigned', 'Pending', 'Closed', 'Rejected'], locked: ['New', 'Assigned', 'Pending', 'Closed', 'Rejected'], used: [['cases', 'status']] },
  { group: 'Workflow', key: 'orderStatus', label: 'Order status', fixed: true, defaults: ['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'], used: [['orders', 'status']] },
  { group: 'Workflow', key: 'invoiceStatus', label: 'Invoice status', fixed: true, defaults: ['Sent', 'Partially paid', 'Paid', 'Overdue'], used: [['invoices', 'status']] },
  { group: 'Workflow', key: 'quoteStatus', label: 'Quote status', fixed: true, defaults: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'], used: [['quotes', 'status']] },
  { group: 'Workflow', key: 'shipmentStatus', label: 'Shipment status', fixed: true, defaults: ['Picked up', 'In Transit', 'Delayed', 'Delivered'], used: [['shipments', 'status']] },
  { group: 'Workflow', key: 'transferStatus', label: 'Transfer status', fixed: true, defaults: ['Pending', 'Approved', 'Rejected'], used: [['transfers', 'status']] },
  { group: 'Workflow', key: 'stockMovement', label: 'Stock movement', fixed: true, defaults: ['Receipt', 'Delivery', 'Adjustment'], used: [['stockMoves', 'type']] },
  { group: 'Workflow', key: 'stockLevel', label: 'Stock level', fixed: true, defaults: ['In stock', 'Low stock', 'Out of stock'], used: [] },
  { group: 'Workflow', key: 'roleName', label: 'Role name', fixed: true, defaults: ['Admin', 'Manager', 'Sales Person'], used: [] },
  { group: 'System', key: 'activityAction', label: 'Activity action', defaults: ['None', 'Upload document', 'Phone call', 'Meeting', 'Sign document'], locked: ['None'], used: [['activityTypes', 'action']] },
  { group: 'System', key: 'assignInterval', label: 'Assignment interval', defaults: ['Hourly', 'Daily', 'Weekly'], used: [] },
  { group: 'System', key: 'fiscalStart', label: 'Fiscal year start', defaults: ['January', 'April', 'July', 'October'], used: [], noRename: true, normalize: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(), check: validMonth },
  { group: 'System', key: 'currency', label: 'Currency', defaults: ['USD', 'EUR', 'GBP', 'INR', 'SGD', 'CAD'], used: [], noRename: true, normalize: (v) => v.toUpperCase(), check: validCurrency },
  { group: 'System', key: 'timezone', label: 'Time zone', defaults: ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore'], used: [], noRename: true, check: validZone },
];
PICKLISTS.filter((p) => p.fixed).forEach((p) => { p.locked = p.defaults; });
export const MENU_WORDS = ['Overview', 'Communication', 'Sales records', 'Operations', 'Company reports', 'My team', 'Team sales', 'Team commerce', 'Team reports', 'My work', 'Communicate', 'Selling', 'Orders', 'My results', 'More', 'Administration', 'Workspace', 'Admin console', 'Manager workspace', 'Sales workspace'];
export const PICKLIST_BY_KEY = Object.fromEntries(PICKLISTS.map((p) => [p.key, p]));

// Tidies what someone typed. exists means it's already in the list, in whatever capitals it was saved with.
export const cleanOption = (key, raw, list) => {
  const def = PICKLIST_BY_KEY[key];
  const text = String(raw).trim().replace(/\s+/g, ' ');
  if (!text) return { error: def.numeric ? 'Enter the number of minutes.' : 'Enter a name.' };
  if (def.numeric) {
    const n = Number(text);
    if (!Number.isInteger(n) || n < (def.min ?? 0) || n > 525600) return { error: 'Enter a whole number of minutes.' };
    return list.includes(n) ? { value: n, exists: true } : { value: n };
  }
  const value = def.normalize ? def.normalize(text) : text;
  const same = list.find((o) => o.toLowerCase() === value.toLowerCase());
  if (same) return { value: same, exists: true };
  const error = def.check?.(value);
  return error ? { error } : { value };
};
