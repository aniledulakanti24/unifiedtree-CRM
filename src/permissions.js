// Everything a person can see or do comes from this model, and the Admin edits it in Access Control.
export const ACTIONS = [['view', 'View'], ['create', 'Create'], ['edit', 'Edit'], ['delete', 'Delete']];
export const SCOPES = [['own', 'Own records'], ['team', 'Team records'], ['all', 'All company']];

const CRUD = ['view', 'create', 'edit', 'delete'];
export const MODULES = [
  { group: 'Home', key: 'dashboard', label: 'Home dashboard', actions: [] },
  { group: 'Sales', key: 'pipeline', label: 'Deals & pipeline', actions: CRUD, scoped: true },
  { group: 'Sales', key: 'leads', label: 'Leads', actions: CRUD, scoped: true, extra: [['generate', 'Generate'], ['assign', 'Assign'], ['convert', 'Convert']] },
  { group: 'Sales', key: 'contacts', label: 'Contacts', actions: CRUD, scoped: true },
  { group: 'Sales', key: 'customers', label: 'Customers', actions: CRUD, scoped: true },
  { group: 'Sales', key: 'tasks', label: 'Tasks & activities', actions: CRUD, scoped: true },
  { group: 'Sales', key: 'calendar', label: 'Calendar', actions: CRUD, scoped: true },
  { group: 'Sales', key: 'transfers', label: 'Internal transfers', actions: ['view', 'create'], scoped: true, extra: [['approve', 'Approve'], ['direct', 'Move without approval']] },
  { group: 'Communication', key: 'calls', label: 'Calls & video', actions: ['view', 'create'], scoped: true, extra: [['video', 'Video calls'], ['setup', 'Change phone setup']] },
  { group: 'Communication', key: 'aiVoice', label: 'AI Voice', actions: ['view', 'create', 'edit', 'delete'], scoped: true },
  { group: 'Communication', key: 'messages', label: 'Chat', actions: ['view', 'create'] },
  { group: 'Communication', key: 'whatsapp', label: 'WhatsApp', actions: ['view', 'create'], scoped: true, extra: [['campaigns', 'Send campaigns'], ['setup', 'Change templates and automatic replies']] },
  { group: 'Communication', key: 'meetings', label: 'Meeting requests', actions: ['view', 'create'], scoped: true, scopes: ['own', 'all'], extra: [['respond', 'Accept, decline or pass']] },
  { group: 'Communication', key: 'emails', label: 'Email', actions: ['view', 'create'], scoped: true, extra: [['campaigns', 'Send campaigns'], ['setup', 'Change email setup']] },
  { group: 'Communication', key: 'followups', label: 'Follow-up reminders', actions: CRUD, scoped: true },
  { group: 'Commerce', key: 'orders', label: 'Orders', actions: ['view', 'create', 'edit'], scoped: true },
  { group: 'Commerce', key: 'billing', label: 'Quotes & invoices', actions: ['view', 'create', 'edit'], scoped: true, extra: [['invoice', 'Invoices & payments']] },
  { group: 'Commerce', key: 'products', label: 'Products', actions: CRUD },
  { group: 'Commerce', key: 'inventory', label: 'Inventory', actions: ['view', 'edit'] },
  { group: 'Commerce', key: 'requests', label: 'Requests to other teams', actions: ['view', 'create', 'edit'] },
  { group: 'Commerce', key: 'purchasing', label: 'Purchasing', actions: ['view', 'create', 'edit'], extra: [['approve', 'Approve large orders']] },
  { group: 'Commerce', key: 'logistics', label: 'Logistics', actions: ['view', 'edit'], scoped: true },
  { group: 'Support', key: 'cases', label: 'Support cases', actions: CRUD, scoped: true },
  { group: 'Reports', key: 'assistant', label: 'Assistant', actions: ['view'] },
  { group: 'Reports', key: 'insights', label: 'Insights', actions: ['view'], scoped: true },
  { group: 'Reports', key: 'reportBuilder', label: 'Report builder', actions: ['view', 'edit'] },
  { group: 'Reports', key: 'forecast', label: 'Forecast', actions: ['view'], scoped: true },
  { group: 'Reports', key: 'analysis', label: 'Pipeline analysis', actions: ['view'], scoped: true },
  { group: 'Reports', key: 'leadsReport', label: 'Leads analysis', actions: ['view'], scoped: true },
  { group: 'Reports', key: 'performance', label: 'My performance', actions: ['view'] },
  { group: 'Reports', key: 'data', label: 'Data export', actions: [], extra: [['export', 'Export to CSV']] },
  { group: 'Administration', key: 'connections', label: 'Connected apps', actions: ['view', 'edit'] },
  { group: 'Administration', key: 'approvals', label: 'Approvals', actions: ['view', 'edit'] },
  { group: 'Administration', key: 'automation', label: 'Automation rules', actions: ['view', 'edit'] },
  { group: 'Sales', key: 'webforms', label: 'Web forms', actions: ['view', 'edit'] },
  { group: 'Administration', key: 'security', label: 'Security', actions: ['view', 'edit'] },
  { group: 'Administration', key: 'access', label: 'Access control', actions: ['view', 'edit'], locked: ['view', 'edit'], note: 'Anyone who can edit this can change what everyone can do.' },
  { group: 'Administration', key: 'companies', label: 'Companies', actions: ['view', 'create', 'delete'], locked: ['view'], note: 'View lets someone switch between companies.' },
  { group: 'Administration', key: 'options', label: 'Dropdown options', actions: [], extra: [['add', 'Add options while filling in forms']], note: 'Renaming and removing options stays in Settings.' },
  { group: 'Administration', key: 'teams', label: 'Sales teams', actions: ['view', 'create', 'edit'], scoped: true, scopes: ['team', 'all'] },
  { group: 'Administration', key: 'audit', label: 'Audit log', actions: ['view'], scoped: true, locked: ['view'] },
  { group: 'Administration', key: 'users', label: 'Users', actions: ['view', 'create', 'edit'], locked: ['view', 'edit'], note: "Editing users lets someone change other people's roles." },
  { group: 'Administration', key: 'settings', label: 'System settings', actions: ['view', 'edit'], locked: ['view', 'edit'] },
];
// The sections, views and tabs inside each module, which the Admin assigns or revokes.
const sec = (group, list) => list.map(([k, label, roles]) => ({ k, label, group, roles }));
const KPI = ['kpis', 'Summary numbers'];
const SECTIONS = {
  dashboard: sec('Widgets', [
    KPI, ['charts', 'Charts'],
    ['todayMeetings', "Today's meetings"], ['focus', "Today's focus"], ['followupsCard', 'Follow-ups today'], ['closing', 'Closing soon'], ['stageChart', 'Pipeline by stage'], ['appointments', 'Next appointments'], ['leadsCard', 'Leads to contact'], ['transfersCard', 'Waiting on my manager'],
    ['coaching', 'Coaching'], ['scorecard', 'Rep scorecard'], ['approvals', 'Approvals'], ['risk', 'Deals at risk'], ['teamRevenue', 'Revenue won'],
    ['revenueTeams', 'Revenue by team'], ['attention', 'Needs attention'], ['targets', 'Team targets'], ['usersCard', 'Users and access'], ['activity', 'Recent system activity'],
  ]),
  pipeline: [...sec('Views', [['kanban', 'Kanban'], ['reps', 'By rep'], ['list', 'List'], ['graph', 'Graph']]), ...sec('Record sections', [['path', 'Stage bar'], ['highlights', 'Key details']]), ...sec('Record tabs', [['details', 'Details'], ['quotes', 'Quotes'], ['notes', 'Internal notes'], ['history', 'Notes & history panel']])],
  leads: sec('Sections', [['score', 'Lead score'], ['history', 'Notes & history panel']]),
  contacts: sec('Sections', [['filters', 'Filter panel'], ['deals', 'Open deals'], ['history', 'Notes & history panel']]),
  customers: [...sec('Views', [['list', 'List'], ['cards', 'Cards']]), ...sec('Record tabs', [['contacts', 'Contacts'], ['sales', 'Sales & Purchase'], ['accounting', 'Accounting'], ['notes', 'Internal notes']]), ...sec('Record quick links', [['deals', 'Opportunities'], ['meetings', 'Meetings'], ['orders', 'Sales'], ['invoices', 'Invoiced'], ['cases', 'Open cases']]), ...sec('Record sections', [['history', 'Notes & history panel']])],
  tasks: sec('Views', [['list', 'List'], ['board', 'Board'], ['workload', 'Workload']]),
  calendar: [...sec('Views', [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List'], ['team', 'Team availability']]), ...sec('Sections', [['upcoming', 'Upcoming'], ['categories', 'Categories']])],
  transfers: sec('Sections', [KPI]),
  whatsapp: sec('Tabs', [['campaigns', 'Campaigns'], ['templates', 'Templates'], ['automation', 'Automatic replies'], ['results', 'Results']]),
  emails: sec('Tabs', [['templates', 'Templates'], ['campaigns', 'Campaigns'], ['results', 'Results'], ['settings', 'Settings']]),
  calls: [...sec('Tabs', [['voicemail', 'Missed and voicemail'], ['meetings', 'Video meetings'], ['insights', 'Coaching and results'], ['setup', 'Phone setup']]), ...sec('Sections', [KPI, ['dialer', 'Dialer'], ['log', 'Call log']])],
  aiVoice: sec('Sections', [KPI, ['agents', 'Agents'], ['campaigns', 'Campaigns'], ['history', 'Call history'], ['reports', 'Reports'], ['rules', 'Rules and do not call']]),
  followups: sec('Sections', [KPI]),
  orders: sec('Sections', [KPI]),
  billing: [...sec('Tabs', [['invoices', 'Invoices'], ['quotes', 'Quotes'], ['payments', 'Payments'], ['credits', 'Credit notes'], ['recurring', 'Recurring'], ['receivables', 'Receivables'], ['taxes', 'Tax summary']]), ...sec('Sections', [KPI])],
  products: sec('Views', [['grid', 'Grid'], ['list', 'List']]),
  connections: sec('Tabs', [['apps', 'Apps'], ['attention', 'Needs attention'], ['activity', 'Sync history'], ['keys', 'API keys'], ['api', 'Try the API'], ['hooks', 'Webhooks']]),
};
MODULES.forEach((m) => { m.sections = SECTIONS[m.key] || []; });
export const sectionsFor = (m, role) => m.sections.filter((s) => !s.roles || s.roles.includes(role));

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));
export const allActions = (m) => [...m.actions, ...(m.extra || []).map(([k]) => k)];

export const ROUTE_MODULE = {
  '/calls': 'calls', '/emails': 'emails', '/webforms': 'webforms', '/requests': 'requests', '/automation': 'automation', '/approvals': 'approvals', '/connections': 'connections', '/ai-voice': 'aiVoice', '/messages': 'messages', '/whatsapp': 'whatsapp', '/meetings': 'meetings', '/followups': 'followups', '/calendar': 'calendar', '/tasks': 'tasks', '/pipeline': 'pipeline', '/leads': 'leads', '/contacts': 'contacts', '/customers': 'customers', '/transfers': 'transfers',
  '/teams': 'teams', '/orders': 'orders', '/products': 'products', '/billing': 'billing', '/inventory': 'inventory', '/purchasing': 'purchasing', '/security': 'security', '/logistics': 'logistics', '/cases': 'cases',
  '/insights': 'insights', '/reports/custom': 'reportBuilder', '/reports/forecast': 'forecast', '/reports/pipeline': 'analysis', '/reports/leads': 'leadsReport', '/performance': 'performance', '/users': 'users', '/audit': 'audit', '/settings': 'settings', '/access': 'access',
};
export const ENTITY_MODULE = { deals: 'pipeline', leads: 'leads', contacts: 'contacts', companies: 'customers', activities: 'tasks', events: 'calendar', orders: 'orders', invoices: 'billing', quotes: 'billing', payments: 'billing', shipments: 'logistics', cases: 'cases', calls: 'calls', followups: 'followups' };

const grant = (scope, spec, hidden = {}) => Object.fromEntries(MODULES.map((m) => {
  const on = spec[m.key] || '';
  const row = { scope: m.scoped ? (m.scopes && !m.scopes.includes(scope) ? m.scopes[0] : scope) : undefined, hidden: hidden[m.key] || [] };
  allActions(m).forEach((a) => { row[a] = on === '*' || on.split(' ').includes(a); });
  return [m.key, row];
}));

export const defaultPermissions = () => ({
  v: 6,
  roles: {
    admin: grant('all', {
      requests: '*', assistant: '*', security: '*', purchasing: '*', approvals: '*', insights: '*', reportBuilder: '*', access: '*', companies: '*', connections: '*', automation: '*', webforms: '*', emails: '*', options: '*', calls: 'view setup', aiVoice: '*', messages: 'view create', whatsapp: 'view create campaigns setup', meetings: '*', calendar: '*', followups: 'view', pipeline: 'view edit delete', leads: 'view edit delete assign', contacts: '*', customers: '*', transfers: '*', orders: '*', billing: '*', products: '*', inventory: '*', logistics: '*', cases: '*',
      forecast: '*', analysis: '*', leadsReport: '*', data: '*', teams: '*', audit: '*', users: '*', settings: '*',
    }, { pipeline: ['kanban', 'reps'], calls: ['dialer'] }),
    manager: grant('team', {
      requests: 'view create edit', assistant: '*', purchasing: 'view create edit', approvals: '*', insights: '*', reportBuilder: '*', emails: '*', webforms: 'view', options: '*', calls: '*', aiVoice: '*', messages: '*', whatsapp: '*', meetings: '*', followups: '*', pipeline: '*', leads: '*', contacts: '*', customers: '*', tasks: '*', calendar: '*', transfers: '*', orders: '*', billing: '*', products: 'view', cases: '*',
      forecast: '*', analysis: '*', leadsReport: '*', data: '*', teams: 'view edit', audit: 'view',
    }),
    sales: grant('own', {
      requests: 'view create', assistant: '*', approvals: 'view', insights: '*', reportBuilder: '*', emails: 'view create', options: '*', calls: 'view create video', aiVoice: 'view create', messages: '*', whatsapp: 'view create', meetings: '*', followups: 'view create edit', pipeline: 'view create edit', leads: 'view create edit convert', contacts: 'view create edit', customers: 'view create edit', tasks: 'view create edit', calendar: 'view create edit', transfers: 'view create',
      orders: 'view create', billing: 'view create edit', products: 'view', cases: 'view create edit', forecast: 'view', performance: 'view', data: '*',
    }, { pipeline: ['reps'], insights: ['business'] }),
  },
  users: {},
});

// Fills in anything missing from access settings saved by an older version.
export const migratePermissions = (saved) => {
  if (!saved) return defaultPermissions();
  const defaults = defaultPermissions();
  const roles = Object.fromEntries(Object.entries(defaults.roles).map(([r, rows]) => [r, Object.fromEntries(Object.entries(rows).map(([k, row]) => {
    const cur = saved.roles?.[r]?.[k];
    return [k, cur ? { ...cur, hidden: cur.hidden || row.hidden } : row];
  }))]));
  // Version 2 gave Admins the calendar, so they can accept meetings. Applied once to older saved access.
  if ((saved.v || 1) < 2) roles.admin.calendar = defaults.roles.admin.calendar;
  // Version 3 gives Managers back the Assistant, which an earlier default left off by mistake.
  if ((saved.v || 1) < 3) roles.manager.assistant = defaults.roles.manager.assistant;
  // Custom roles aren't in the defaults, so they carry over, with any new modules from the Sales defaults.
  Object.keys(saved.roles || {}).filter((k) => !roles[k]).forEach((k) => { roles[k] = { ...defaults.roles.sales, ...saved.roles[k] }; });
  // Version 4 adds changing the phone setup, for Admins and Managers.
  if ((saved.v || 1) < 4) ['admin', 'manager'].forEach((r) => { if (roles[r]?.calls) roles[r].calls = { ...roles[r].calls, setup: true }; });
  // Version 5 adds WhatsApp campaigns and setup, for Admins and Managers.
  if ((saved.v || 1) < 5) ['admin', 'manager'].forEach((r) => { if (roles[r]?.whatsapp) roles[r].whatsapp = { ...roles[r].whatsapp, campaigns: true, setup: true }; });
  // Version 6 adds email campaigns and setup, for Admins and Managers.
  if ((saved.v || 1) < 6) ['admin', 'manager'].forEach((r) => { if (roles[r]?.emails) roles[r].emails = { ...roles[r].emails, campaigns: true, setup: true }; });
  return { v: 6, roles, users: saved.users || {} };
};

export const effective = (perms, user, key) => {
  const base = perms.roles[user.customRole]?.[key] || perms.roles[user.role]?.[key] || {};
  return { ...base, ...(perms.users[user.id]?.[key] || {}) };
};
// Keeps a row sensible: nothing is allowed on a module the person can't view.
export const normalize = (m, next, changed) => {
  const row = { ...next };
  const acts = allActions(m);
  if (changed === 'view' && !row.view) acts.forEach((a) => { row[a] = false; });
  else if (changed && changed !== 'view' && row[changed] && m.actions.includes('view')) row.view = true;
  return row;
};
export const isLocked = (m, action, role) => role === 'admin' && (m.locked || []).includes(action);
