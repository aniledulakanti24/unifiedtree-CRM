import { allZones } from './worldwide';
// Every dropdown a company can add its own options to. Saved per company in db.picklists.
// locked: the CRM's logic depends on these values, so a rename changes the word people see, not the stored value.
// fixed: a step in a built-in workflow, which can be renamed but not removed. Nothing can be added to these lists.
// used: where the value is stored, so a rename can update existing records.
const validCurrency = (v) => { try { new Intl.NumberFormat('en-US', { style: 'currency', currency: v }); return ''; } catch { return 'Enter a 3-letter currency code, such as AED.'; } };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const validMonth = (v) => (MONTHS.includes(v) ? '' : 'Enter a month, such as March.');
const span = (m) => (m && m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m && m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`);
const validZone = (v) => { try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return ''; } catch { return 'Enter a time zone name, such as Asia/Dubai.'; } };

// Every country, named by the browser, so nobody has to type or maintain the list.
const COUNTRY_CODES = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA UY UZ VU VA VE VN YE ZM ZW'.split(' ');
const countries = () => {
  // USA, UK and UAE are kept short because existing records use those names.
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const list = COUNTRY_CODES.map((c) => names.of(c));
  return ['USA', 'UK', 'UAE', ...list].sort((a, b) => a.localeCompare(b));
};
const validLocale = (v) => { try { Intl.getCanonicalLocales(v); return ''; } catch { return 'Enter a format code, such as fr-CA.'; } };
const localeName = (code) => { try { return `${new Intl.DisplayNames(['en'], { type: 'language' }).of(code)} (${new Intl.NumberFormat(code).format(1234.5)})`; } catch { return code; } };

export const PICKLISTS = [
  { group: 'Calendar', key: 'eventCategory', label: 'Appointment category', defaults: ['Meeting', 'Demo', 'Call', 'Visit', 'Holiday'], locked: ['Meeting', 'Holiday'], used: [['events', 'category']] },
  { group: 'Communication', key: 'followupChannel', label: 'Follow-up channel', defaults: ['Call', 'Video', 'WhatsApp', 'Email', 'Meeting'], locked: ['Call', 'Video', 'WhatsApp'], used: [['followups', 'channel']] },
  { group: 'Communication', key: 'callOutcome', label: 'Call outcome', defaults: ['Connected', 'No answer', 'Busy', 'Left voicemail', 'Wrong number'], locked: ['Connected', 'No answer'], used: [['calls', 'outcome']] },
  { group: 'Communication', key: 'messageTemplate', label: 'WhatsApp template', defaults: ['Hi {name}, thanks for your time today. I will share the details shortly.', 'Hi {name}, just following up on our conversation. Is this a good time to talk?', 'Hi {name}, your quote is ready. Shall I walk you through it?', 'Hi {name}, your order is on its way. I will share the tracking details soon.'], used: [], placeholder: 'Write {name} where their first name goes' },
  { group: 'Communication', key: 'aiPurpose', label: 'AI Voice purpose', defaults: ['Lead qualification', 'Payment reminder', 'Appointment booking', 'Order status', 'Customer feedback', 'Answer incoming calls'], used: [['aiAgents', 'purpose']] },
  { group: 'Communication', key: 'aiLanguage', label: 'AI Voice language', defaults: ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Mandarin', 'Japanese', 'Korean', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi'], used: [['aiAgents', 'language']] },
  { group: 'Communication', key: 'aiVoice', label: 'AI Voice voice', defaults: ['Asha (female)', 'Meera (female)', 'Arjun (male)', 'Dev (male)'], used: [['aiAgents', 'voice']] },
  { group: 'Communication', key: 'callScript', label: 'Call script', defaults: ['Introduce yourself and ask if it is a good time.', 'Ask what they are using today, and what is not working.', 'Agree the next step and a date.'], used: [] },
  { group: 'Communication', key: 'reminderTime', label: 'Follow-up reminder time', defaults: [0, 15, 30, 60, 1440], locked: [0], used: [['followups', 'remindBefore']], noRename: true, numeric: true, placeholder: 'Minutes before, such as 45', format: (m) => (Number(m) === 0 ? 'At the time' : `${span(Number(m))} before`) },
  { group: 'Communication', key: 'meetingLength', label: 'Meeting length', defaults: [15, 30, 45, 60, 90], used: [['meetingRequests', 'minutes']], noRename: true, numeric: true, min: 1, placeholder: 'Minutes, such as 120', format: (m) => span(Number(m)) },
  { group: 'Sales', key: 'reportFolder', label: 'Report folder', defaults: ['Sales', 'Finance', 'Operations', 'Management'], used: [['reports', 'folder']] },
  { group: 'Sales', key: 'dealPipeline', label: 'Pipeline', defaults: ['New business', 'Renewal', 'Upsell'], used: [['deals', 'pipeline']] },
  { group: 'Sales', key: 'competitor', label: 'Competitor', defaults: ['Zoho', 'Salesforce', 'HubSpot', 'Local vendor', 'Spreadsheets'], used: [['deals', 'competitor']] },
  { group: 'Sales', key: 'stakeholderRole', label: 'Role on a deal', defaults: ['Decision maker', 'Influencer', 'Technical buyer', 'Finance', 'End user'], used: [] },
  { group: 'Sales', key: 'leadSource', label: 'Lead source', defaults: ['Website', 'Referral', 'Email campaign', 'Trade show', 'Cold call', 'Partner'], used: [['leads', 'source'], ['deals', 'source']] },
  { group: 'Sales', key: 'leadStatus', label: 'Lead status', defaults: ['New', 'Contacted', 'Qualified', 'Unqualified'], locked: ['New', 'Contacted', 'Qualified', 'Unqualified'], used: [['leads', 'status']] },
  { group: 'Sales', key: 'contactStatus', label: 'Contact status', defaults: ['Cold', 'Warm', 'Hot', 'In contract'], used: [['contacts', 'status']] },
  { group: 'Sales', key: 'customerType', label: 'Customer type', defaults: ['Customer', 'Prospect'], locked: ['Customer', 'Prospect'], used: [['companies', 'status']] },
  { group: 'Sales', key: 'industry', label: 'Industry', defaults: ['Manufacturing', 'Finance', 'Healthcare', 'Retail', 'Technology', 'Logistics', 'Education', 'Energy'], used: [['companies', 'industry'], ['leads', 'industry']] },
  { group: 'Sales', key: 'country', label: 'Country', defaults: countries(), used: [['leads', 'country'], ['companies', 'country']] },
  { group: 'Sales', key: 'companySize', label: 'Company size', defaults: ['1-50', '51-200', '201-1000', '1000+'], used: [['companies', 'size'], ['leads', 'size']] },
  { group: 'Sales', key: 'paymentTerms', label: 'Payment terms', defaults: ['Immediate', '15 days', '30 days', '45 days'], used: [['companies', 'paymentTerms']] },
  { group: 'Sales', key: 'priceList', label: 'Price list', defaults: ['Standard', 'Partner', 'Enterprise'], used: [['companies', 'priceList']] },
  { group: 'Commerce', key: 'orderChannel', label: 'Order channel', defaults: ['Direct', 'Partner', 'Web store'], locked: ['Direct'], used: [['orders', 'channel']] },
  { group: 'Commerce', key: 'productCategory', label: 'Product category', defaults: ['Hardware', 'Accessories', 'Software', 'Services', 'Consumables'], used: [['products', 'category']] },
  { group: 'Commerce', key: 'returnReason', label: 'Credit note reason', defaults: ['Damaged in delivery', 'Wrong item sent', 'Customer changed their mind', 'Billing correction', 'Price adjustment'], used: [['creditNotes', 'reason']] },
  { group: 'Commerce', key: 'paymentMethod', label: 'Payment method', defaults: ['Bank transfer', 'Card', 'Cheque', 'Cash'], used: [['payments', 'method']] },
  { group: 'Operations', key: 'delayReason', label: 'Delivery delay reason', defaults: ['Weather', 'Customs', 'Vehicle problem', 'Address problem', 'Carrier problem'], used: [['shipments', 'delayReason']] },
  { group: 'Operations', key: 'vehicleStatus', label: 'Vehicle status', defaults: ['On route', 'Loading', 'Idle', 'Maintenance'], locked: ['On route'], used: [['vehicles', 'status']] },
  { group: 'Support', key: 'caseQueue', label: 'Case queue', defaults: ['General', 'Technical', 'Billing', 'Delivery'], used: [['cases', 'queue']] },
  { group: 'Support', key: 'caseChannel', label: 'Case channel', defaults: ['Email', 'Portal', 'Phone', 'Chat'], used: [['cases', 'channel']] },
  { group: 'Support', key: 'kbCategory', label: 'Help article category', defaults: ['Getting started', 'Billing', 'Devices', 'Delivery', 'Account'], used: [['kbArticles', 'category']] },
  { group: 'Support', key: 'caseType', label: 'Case type', defaults: ['Question', 'Incident', 'Problem'], used: [['cases', 'type']] },
  { group: 'Support', key: 'casePriority', label: 'Case priority', defaults: ['Low', 'Normal', 'High', 'Urgent'], locked: ['Normal', 'Urgent'], used: [['cases', 'priority']] },
  { group: 'Support', key: 'caseStatus', label: 'Case status', defaults: ['New', 'Assigned', 'Pending', 'Closed', 'Rejected'], locked: ['New', 'Assigned', 'Pending', 'Closed', 'Rejected'], used: [['cases', 'status']] },
  { group: 'Communication', key: 'emailTemplate', label: 'Email template', defaults: ['Thanks for your time today. I will share the details shortly.', 'Your quote is ready. Shall I walk you through it?', 'Just following up on our conversation. Is this a good time to talk?'], used: [] },
  { group: 'Tax', key: 'taxName', label: 'Tax name', defaults: ['Tax', 'VAT', 'GST', 'Sales tax', 'Consumption tax'], used: [] },
  { group: 'Tax', key: 'taxIdLabel', label: 'Tax number name', defaults: ['Tax ID', 'VAT number', 'GST number', 'EIN', 'ABN', 'TRN'], used: [] },
  { group: 'Tax', key: 'taxRate', label: 'Tax rate', defaults: [0, 5, 10, 15, 20], used: [['products', 'taxRate']], noRename: true, numeric: true, placeholder: 'Percent, such as 12', format: (m) => `${Number(m)}%` },
  { group: 'Workflow', key: 'orderStatus', label: 'Order status', locked: ['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'], defaults: ['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'], used: [['orders', 'status']] },
  { group: 'Workflow', key: 'invoiceStatus', label: 'Invoice status', fixed: true, defaults: ['Sent', 'Partially paid', 'Paid', 'Overdue'], used: [['invoices', 'status']] },
  { group: 'Workflow', key: 'quoteStatus', label: 'Quote status', fixed: true, defaults: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'], used: [['quotes', 'status']] },
  { group: 'Workflow', key: 'shipmentStatus', label: 'Shipment status', fixed: true, defaults: ['Picked up', 'In Transit', 'Delayed', 'Delivered'], used: [['shipments', 'status']] },
  { group: 'Workflow', key: 'transferStatus', label: 'Transfer status', fixed: true, defaults: ['Pending', 'Approved', 'Rejected'], used: [['transfers', 'status']] },
  { group: 'Workflow', key: 'stockMovement', label: 'Stock movement', fixed: true, defaults: ['Receipt', 'Delivery', 'Adjustment'], used: [['stockMoves', 'type']] },
  { group: 'Workflow', key: 'stockLevel', label: 'Stock level', fixed: true, defaults: ['In stock', 'Low stock', 'Out of stock'], used: [] },
  { group: 'Workflow', key: 'roleName', label: 'Role name', fixed: true, defaults: ['Admin', 'Manager', 'Sales Person'], used: [] },
  { group: 'System', key: 'activityAction', label: 'Activity action', defaults: ['None', 'Upload document', 'Phone call', 'Meeting', 'Sign document'], locked: ['None'], used: [['activityTypes', 'action']] },
  { group: 'System', key: 'assignInterval', label: 'Assignment interval', defaults: ['Hourly', 'Daily', 'Weekly'], used: [] },
  { group: 'System', key: 'locale', label: 'Number and date format', defaults: ['en-US', 'en-GB', 'en-CA', 'en-AU', 'en-IN', 'de-DE', 'fr-FR', 'es-ES', 'es-MX', 'it-IT', 'pt-BR', 'nl-NL', 'sv-SE', 'pl-PL', 'tr-TR', 'ar-AE', 'ja-JP', 'ko-KR', 'zh-CN', 'id-ID'], used: [], noRename: true, check: validLocale, format: localeName },
  { group: 'System', key: 'timeZone', label: 'Time zone', defaults: allZones(), used: [['companies', 'timezone']], noRename: true, check: validZone },
  { group: 'System', key: 'currency', label: 'Currency', defaults: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'INR', 'SGD', 'HKD', 'AED', 'SAR', 'ZAR', 'BRL', 'MXN', 'KRW', 'SEK', 'NOK', 'DKK', 'NZD', 'PLN', 'TRY', 'IDR', 'MYR', 'THB', 'PHP', 'NGN', 'KES', 'EGP'], used: [], noRename: true, normalize: (v) => v.toUpperCase(), check: validCurrency },
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
