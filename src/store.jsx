import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { blankCompany, seed, setStages, STAGES } from './seed';
import { addDays, fmtDT, humanize, FX_USD, nextDate, nextNo, rateOf, setCurrency, setFx, setRegion, today, uid } from './util';
import { withDelta } from './stock';
import { PICKLIST_BY_KEY } from './picklists';
import { DEMO_PASSWORD, FIELD_TRIGGER, canRerun, demoHash, nextScheduleAt, waitUntilAt } from './engine';
import { DUP_ENTITY, TRIGGERS, taxesFor, applyFormConfig, findDuplicate, mergeRecords, nextSalesperson, nextRun, ruleMatches, scoreLead, stepsOf, timedRecords } from './engine';
import { applyTemplate } from './templates';
import { aiRules, phoneKey, simulateAiCall, withinCallingHours } from './aiVoice';
import { emailPlan, pickReply, whatsappPlan } from './mockBackend';
import { autoBackup } from './backups';
import { upgradeSampleForecast } from './forecast';
import { upgradeSampleCalls, isOpen } from './callTools';
import { typeLabel, upgradeSampleOps } from './opsTools';
import { deliveryOf, retryDelivery } from './connTools';
import { emailOf, footerText, reached as emailReached, upgradeSampleEmail } from './emailTools';
import { audienceOf, autoReplies, templateIssues, templatesOf, upgradeSampleWhatsapp, waOf } from './whatsapp';
import { buildLead, bumpStat, enquiryNote, findExisting, mergeText, routeTo, spamReason, upgradeSampleForms } from './formTools';
import { nextDue } from './calendarTools';
import { upgradeSampleTax } from './worldwide';
import { deliveryState, upgradeSampleShipments } from './logistics';
import { caseStatusPatch, isOpenCase, slaOf, upgradeSampleCases } from './cases';
import { alertPrefs, channelOn, inQuietHours, isAway, kindOf } from './alerts';
import { APPS } from './apps';
import { runSimulatedSync } from './syncEngine';
import { DEMO_IP, deviceName, secOf } from './security';
import { ENTITY_MODULE, MODULES, MODULE_BY_KEY, ROUTE_MODULE, allActions, defaultPermissions, effective, isLocked, migratePermissions } from './permissions';

const KEY = 'unifiedtree-crm-v3';
const SESSION = 'unifiedtree-crm-session';
const SID = 'unifiedtree-crm-sid';
const THEME = 'unifiedtree-crm-theme';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };

// An "org" is a business using this CRM, shown as "Company" on screen. Each has its own db.
// Not to be confused with db.companies, which holds one org's customers.
const ORGS = 'unifiedtree-crm-orgs';
const ACTIVE_ORG = 'unifiedtree-crm-org';
const SAMPLE_ORG = 'default';
const orgKey = (id) => (id === SAMPLE_ORG ? KEY : `${KEY}:${id}`);
const scored = (d) => ({ ...d, leads: d.leads.map((l) => ({ ...l, score: scoreLead(l) })) });
const loadSaved = (org) => {
  const fresh = org.id === SAMPLE_ORG ? seed() : blankCompany(org.name);
  const saved = read(orgKey(org.id));
  if (!saved?.users) return scored(fresh);
  // Older saved data gets anything added since, without touching what's already there.
  // Rules added since this company was saved arrive once. After that, deleting one sticks.
  const newGroups = saved.groupsV1 ? [] : (fresh.conversations || []).filter((c) => c.group);
  const newRules = saved.rulesV2 ? [] : (fresh.automations || []).filter((r) => !(saved.automations || []).some((x) => x.id === r.id));
  return scored({ ...fresh, ...saved, rulesV2: true, groupsV1: true, layoutV3: true, fyV1: true, dashboards: saved.layoutV3 ? saved.dashboards : {}, conversations: [...(saved.conversations || []), ...newGroups], automations: [...(saved.automations || []), ...newRules], settings: { ...fresh.settings, ...saved.settings, ...(saved.fyV1 ? {} : { fiscalStart: 'April' }) }, permissions: migratePermissions(saved.permissions) });
};

// Gives the sample company's customers abroad their own currency, once. Amounts stay as they are.
const COUNTRY_CURRENCY = { Germany: 'EUR', UK: 'GBP', Canada: 'CAD', Singapore: 'SGD', India: 'INR' };
const withSampleCurrencies = (d) => {
  if (d.fxV1) return d;
  const base = d.settings.currency || 'USD';
  const curOf = {};
  const companies = d.companies.map((c) => {
    const cur = COUNTRY_CURRENCY[c.country];
    if (!cur || cur === base || !FX_USD[base]) return c;
    curOf[c.id] = cur;
    return { ...c, currency: cur };
  });
  const tag = (list = []) => list.map((r) => (curOf[r.companyId] && !r.currency ? { ...r, currency: curOf[r.companyId], fxRate: FX_USD[curOf[r.companyId]] / FX_USD[base] } : r));
  return { ...d, fxV1: true, companies, deals: tag(d.deals), quotes: tag(d.quotes), invoices: tag(d.invoices), orders: tag(d.orders), payments: tag(d.payments), creditNotes: tag(d.creditNotes) };
};
const loadOrg = (org) => {
  const d = loadSaved(org);
  return org.id === SAMPLE_ORG ? upgradeSampleOps(upgradeSampleEmail(upgradeSampleWhatsapp(upgradeSampleCalls(upgradeSampleForms(upgradeSampleForecast(upgradeSampleTax(upgradeSampleShipments(upgradeSampleCases(withSampleCurrencies(d))))))), PICKLIST_BY_KEY.messageTemplate.defaults), PICKLIST_BY_KEY.emailTemplate.defaults)) : d;
};

const WATCH_ROUTE = { invoices: '/billing', quotes: '/billing', creditNotes: '/billing', orders: '/orders', purchaseOrders: '/purchasing', shipments: '/logistics' };
const FIELD_ENTITY = { deal: 'deals', lead: 'leads', contact: 'contacts', company: 'companies', product: 'products', case: 'cases', event: 'events' };
const ENTITY_FIELD = Object.fromEntries(Object.entries(FIELD_ENTITY).map(([k, e]) => [e, k]));

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
export const unreadOf = (c, uid_) => {
  const seen = c.reads?.[uid_] || '';
  return c.messages.filter((m) => m.by !== uid_ && m.at > seen).length;
};

// Everyone a meeting request has reached: the person who asked and each person it was sent or passed to.
export const meetingPeople = (r) => [...new Set([r.requestedBy, ...r.history.map((h) => h.toId).filter(Boolean)])];

const ROLE_WORDS = { admin: 'Admin', manager: 'Manager', sales: 'Sales Person' };
export const ROLES = { ...ROLE_WORDS };
export const roleNameOf = (db, u) => db.customRoles?.find((x) => x.id === u.customRole)?.name || ROLES[u.role];
// Every page that can be renamed in Settings.
export const TITLES = {
  calls: { admin: 'All calls', manager: 'Team calls', sales: 'My calls' },
  aiVoice: { admin: 'AI Voice', manager: 'AI Voice', sales: 'AI Voice' },
  messages: { admin: 'Chat', manager: 'Chat', sales: 'Chat' },
  whatsapp: { admin: 'WhatsApp', manager: 'WhatsApp', sales: 'WhatsApp' },
  emails: { admin: 'Email', manager: 'Email', sales: 'Email' },
  webforms: { admin: 'Web forms', manager: 'Web forms', sales: 'Web forms' },
  requests: { admin: 'Requests to other teams', manager: 'Requests to other teams', sales: 'My requests' },
  automation: { admin: 'Automation', manager: 'Automation', sales: 'Automation' },
  insights: { admin: 'Business insights', manager: 'Team insights', sales: 'My insights' },
  reportBuilder: { admin: 'Report builder', manager: 'Report builder', sales: 'Report builder' },
  approvals: { admin: 'Approvals', manager: 'Approvals', sales: 'My approvals' },
  connections: { admin: 'Connected apps', manager: 'Connected apps', sales: 'Connected apps' },
  meetings: { admin: 'Meeting requests', manager: 'Meeting requests', sales: 'Meeting requests' },
  followups: { admin: 'All follow-ups', manager: 'Team follow-ups', sales: 'My follow-ups' },
  dashboard: { admin: 'Company overview', manager: 'Team dashboard', sales: 'My day' },
  calendar: { admin: 'All appointments', manager: 'Team calendar', sales: 'My calendar' },
  tasks: { admin: 'All activities', manager: 'Team activities', sales: 'My tasks' },
  pipeline: { admin: 'All deals', manager: 'Team pipeline', sales: 'My pipeline' },
  leads: { admin: 'All leads', manager: 'Team leads', sales: 'My leads' },
  contacts: { admin: 'All contacts', manager: 'Team contacts', sales: 'My contacts' },
  customers: { admin: 'All customers', manager: 'Team customers', sales: 'My customers' },
  transfers: { admin: 'Transfer log', manager: 'Transfer approvals', sales: 'My transfers' },
  teams: { admin: 'Sales teams', manager: 'My team' },
  orders: { admin: 'All orders', manager: 'Team orders', sales: 'My orders' },
  products: { admin: 'Products', manager: 'Product catalogue', sales: 'Product catalogue' },
  billing: { admin: 'Quotes & invoices', manager: 'Team quotes & invoices', sales: 'My quotes & invoices' },
  inventory: { admin: 'Inventory' },
  security: { admin: 'Security' },
  purchasing: { admin: 'Purchasing', manager: 'Purchasing' },
  logistics: { admin: 'Logistics' },
  cases: { admin: 'All cases', manager: 'Team cases', sales: 'My cases' },
  forecast: { admin: 'Company forecast', manager: 'Team forecast', sales: 'My forecast' },
  analysis: { admin: 'Pipeline analysis', manager: 'Team pipeline analysis', sales: 'My pipeline analysis' },
  leadsReport: { admin: 'Leads analysis', manager: 'Team leads analysis', sales: 'My leads analysis' },
  performance: { sales: 'My performance' },
  users: { admin: 'Users & roles' },
  audit: { admin: 'Audit log', manager: 'Team audit trail', sales: 'My activity log' },
  access: { admin: 'Access control' },
  settings: { admin: 'System settings' },
};

const LABELS = {
  deals: (r) => r.title, contacts: (r) => `${r.first} ${r.last}`, activities: (r) => r.summary, events: (r) => r.title,
  orders: (r) => r.number, invoices: (r) => r.number, quotes: (r) => r.number, payments: (r) => r.number, shipments: (r) => r.tracking, cases: (r) => r.subject, vehicles: (r) => r.plate, calls: (r) => `${r.type === 'video' ? 'Video call' : 'Call'} with ${r.name}`, followups: (r) => r.title, meetingRequests: (r) => r.topic,
};
const recordLabel = (entity, r) => (LABELS[entity] ? LABELS[entity](r) : r.name || r.title || r.number || r.tracking || r.id);
export const RECORD_ENTITY = { deal: 'deals', lead: 'leads', contact: 'contacts', company: 'companies' };

const CREATE_TRIGGER = { leads: 'lead.created', deals: 'deal.created', contacts: 'contact.created', companies: 'company.created', cases: 'case.created' };
const RECORD_LINK = { leads: (r) => `/leads?open=${r.id}`, deals: (r) => `/pipeline/${r.id}`, contacts: (r) => `/contacts?open=${r.id}`, companies: (r) => `/customers/${r.id}`, orders: (r) => `/orders?open=${r.id}`, invoices: () => '/billing', cases: (r) => `/cases?open=${r.id}` };
const RECORD_KIND = { leads: 'lead', deals: 'deal', contacts: 'contact', companies: 'company' };

export function StoreProvider({ children }) {
  const [orgs, setOrgs] = useState(() => read(ORGS) || [{ id: SAMPLE_ORG, name: read(KEY)?.settings?.companyName || 'Unifiedtree' }]);
  const [orgId, setOrgId] = useState(() => { const id = read(ACTIVE_ORG); return orgs.some((o) => o.id === id) ? id : orgs[0].id; });
  const [db, setDb] = useState(() => loadOrg(orgs.find((o) => o.id === orgId)));
  const [userId, setUserId] = useState(() => read(SESSION));
  const [authNote, setAuthNote] = useState('');
  const [theme, setThemeState] = useState(() => read(THEME) || 'light');
  const [toasts, setToasts] = useState([]);

  useEffect(() => { write(orgKey(orgId), db); }, [db, orgId]);
  useEffect(() => { write(ORGS, orgs); }, [orgs]);
  useEffect(() => { write(ACTIVE_ORG, orgId); }, [orgId]);
  useEffect(() => { write(SESSION, userId); }, [userId]);
  // Other tabs in this browser see new chat messages and reminders straight away.
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.newValue) return;
      try {
        if (e.key === orgKey(orgId)) setDb(JSON.parse(e.newValue));
        if (e.key === ORGS) {
          const list = JSON.parse(e.newValue);
          setOrgs(list);
          // Another tab deleted the company open here, so don't write it back to storage.
          if (!list.some((o) => o.id === orgId)) { setDb(loadOrg(list[0])); setOrgId(list[0].id); }
        }
      } catch { /* ignore a partial write */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [orgId]);
  useEffect(() => { document.documentElement.dataset.theme = theme; write(THEME, theme); }, [theme]);
  setCurrency(db.settings.currency);
  setFx(db.settings.fxRates);
  setRegion(db.prefs?.[userId]?.locale || db.settings.locale, db.prefs?.[userId]?.weekStart || db.settings.weekStart);
  setStages(db.stages);
  const labelOf = (word) => db.labels?.[word] ?? word;
  Object.entries(ROLE_WORDS).forEach(([k, word]) => { ROLES[k] = labelOf(word); });

  const me = db.users.find((u) => u.id === userId) || null;
  const role = me?.role;
  // Field rules apply to what a person reads everywhere, so a hidden field is blank on every screen and export.
  const myFieldRules = db.fieldRules?.[me?.customRole || role];
  const viewDb = useMemo(() => {
    if (!myFieldRules) return db;
    const next = { ...db };
    Object.entries(FIELD_ENTITY).forEach(([kind, entity]) => {
      const hidden = Object.entries(myFieldRules[kind] || {}).filter(([, rule]) => rule === 'hidden').map(([k]) => k);
      if (!hidden.length || !db[entity]) return;
      next[entity] = db[entity].map((r) => {
        const out = { ...r };
        hidden.forEach((k) => { if (k in out) out[k] = typeof out[k] === 'number' ? null : Array.isArray(out[k]) ? [] : ''; });
        return out;
      });
    });
    return next;
  }, [db, myFieldRules]);
  const seesField = (kind, k) => myFieldRules?.[kind]?.[k] !== 'hidden';

  const lastDelete = useRef(null);
  const toast = useCallback((text, tone = 'good') => {
    const id = uid('t');
    // A delete just before this message can be undone from it.
    const undo = lastDelete.current && Date.now() - lastDelete.current.at < 400 ? lastDelete.current.restore : null;
    lastDelete.current = null;
    setToasts((t) => [...t, { id, text, tone, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 7000 : 3600);
  }, []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const SCOPE_TITLE = { own: 'sales', team: 'manager', all: 'admin' };
  const personalEnded = me && db.accessExpiry?.[me.id] && db.accessExpiry[me.id] < today();
  const perm = (m) => (me ? effective(personalEnded ? { ...db.permissions, users: {} } : db.permissions, me, m) : {});
  // Quotes, orders, billing, shipping, purchasing and stock are run outside the CRM, so here they can be read but not changed.
  // Pass seeOnly to ask whether someone may see this data, whatever the read-only setting says.
  const opsReadOnly = db.settings.opsReadOnly !== false;
  const can = (m, a = 'view', seeOnly) => {
    if (!me) return false;
    if (opsReadOnly && !seeOnly && a !== 'view' && ['purchasing', 'inventory', 'billing', 'orders', 'logistics'].includes(m)) return false;
    if (m === 'dashboard') return true;
    const def = MODULE_BY_KEY[m];
    if (def && isLocked(def, a, role)) return true;
    if (a === 'view' && def && !def.actions.includes('view')) return allActions(def).some((x) => perm(m)[x]);
    return !!perm(m)[a];
  };
  // A section, view or tab inside a module: on unless the Admin has revoked it.
  const sec = (m, k) => can(m) && !(perm(m).hidden || []).includes(k);
  const scopeOf = (m) => perm(m).scope || 'own';
  const canRoute = (to) => (ROUTE_MODULE[to] ? can(ROUTE_MODULE[to]) : true);
  const t = (k) => {
    if (db.titles?.[k]) return db.titles[k];
    const row = TITLES[k] || {};
    const key = MODULE_BY_KEY[k]?.scoped ? SCOPE_TITLE[scopeOf(k)] : role;
    return row[key] || row[role] || Object.values(row)[0] || k;
  };
  const teamIds = useMemo(() => new Set(db.users.filter((u) => u.teamId && u.teamId === me?.teamId).map((u) => u.id)), [db.users, me?.teamId]);
  // Pass the module when the list isn't one of the db collections, e.g. scope([deal], 'pipeline').
  const sharedOwners = (m) => {
    const owners = new Set();
    const isMe = (v) => v === `user:${me.id}` || (me.teamId && v === `team:${me.teamId}`);
    (db.sharingRules || []).filter((r) => r.modules?.includes(m) && isMe(r.to)).forEach((r) => {
      const [kind, id] = String(r.from).split(':');
      if (kind === 'user') owners.add(id);
      else db.users.filter((u) => u.teamId === id).forEach((u) => owners.add(u.id));
    });
    return owners;
  };
  const scope = (list, mod) => {
    const m = mod || ENTITY_MODULE[Object.keys(ENTITY_MODULE).find((k) => db[k] === list || viewDb[k] === list)];
    if (!m || !can(m)) return [];
    const s = scopeOf(m);
    if (s === 'all') return list;
    // attendeeIds is on meetings: anyone invited sees them, whoever owns them.
    const invited = (r) => r.attendeeIds?.includes(me.id) || sharedOwners(m).has(r.ownerId);
    if (s === 'team') return list.filter((r) => r.ownerId === me.id || teamIds.has(r.ownerId) || invited(r) || r.attendeeIds?.some((u) => teamIds.has(u)));
    return list.filter((r) => r.ownerId === me.id || invited(r));
  };
  const assignable = () => {
    const active = db.users.filter((u) => u.active);
    const s = scopeOf('pipeline');
    if (s === 'all') return active;
    if (s === 'team') return active.filter((u) => u.id === me?.id || teamIds.has(u.id));
    return active.filter((u) => u.id === me?.id);
  };
  const scopeLabel = role === 'admin' ? 'Company-wide' : role === 'manager' ? (db.teams.find((t) => t.id === me?.teamId)?.name || 'Team') : 'Your book';

  const userName = (id, d = db) => d.users.find((u) => u.id === id)?.name || '—';
  // The automation engine. Runs inside the same change as the event, so a rule can never see stale data.
  const doAction = (d, rule, a, rec, entity) => {
    const name = recordLabel(entity, rec);
    const fill = (text) => String(text || '').replace(/\{name\}/g, name).replace(/\{status\}/g, rec.status || '');
    const admin = d.users.find((u) => u.role === 'admin')?.id;
    const who = (to) => {
      if (to === 'manager') return d.teams.find((t) => t.id === d.users.find((u) => u.id === rec.ownerId)?.teamId)?.managerId || admin;
      return to === 'owner' || !to ? rec.ownerId || admin : to;
    };
    const type = RECORD_KIND[entity] || '';
    const company = d.companies.find((c) => c.id === rec.companyId);
    const contact = d.contacts.find((c) => c.companyId === rec.companyId);
    if (a.type === 'task') d.activities = [{ id: uid('ac'), typeId: d.activityTypes[0]?.id, summary: fill(a.text), due: addDays(Number(a.days) || 0), ownerId: who(a.to), note: `Added by the rule "${rule.name}".`, status: 'todo', priority: 'Medium', tag: 'Sales', relatedType: type, relatedId: type ? rec.id : '', relatedLabel: type ? name : '', createdAt: new Date().toISOString() }, ...d.activities];
    if (a.type === 'followup') d.followups = [{ id: uid('fu'), title: fill(a.text), at: new Date(Date.now() + (Number(a.days) || 0) * 864e5).toISOString(), channel: 'Call', remindBefore: 15, ownerId: who(a.to), contactId: entity === 'contacts' ? rec.id : rec.contactId || '', name, phone: rec.phone || '', relatedType: type, relatedId: type ? rec.id : '', status: 'open', note: `Added by the rule "${rule.name}".`, createdAt: new Date().toISOString() }, ...d.followups];
    if (a.type === 'notify') notify(d, who(a.to), fill(a.text), RECORD_LINK[entity]?.(rec));
    if (a.type === 'email') d.emails = [{ net: emailPlan(), id: uid('em'), to: rec.email || contact?.email || company?.email || '(no email on this record)', subject: fill(a.text), body: fill(a.text), status: 'Sent', auto: true, ownerId: rec.ownerId, at: new Date().toISOString(), relatedType: type, relatedId: type ? rec.id : '' }, ...(d.emails || [])];
    if (a.type === 'assign') { const next = !a.to || a.to === 'round' ? nextSalesperson(d) : who(a.to); if (next) d[entity] = d[entity].map((r) => (r.id === rec.id ? { ...r, ownerId: next } : r)); }
    if (a.type === 'update' && a.field && !(d.settings.opsReadOnly !== false && ['invoices', 'quotes', 'orders', 'shipments'].includes(entity))) d[entity] = d[entity].map((r) => (r.id === rec.id ? { ...r, [a.field]: typeof r[a.field] === 'number' ? Number(a.value) || 0 : a.value } : r));
    if (a.type === 'deal' && ['leads', 'contacts', 'companies'].includes(entity)) {
      const first = d.stages[0];
      const at = new Date().toISOString();
      d.deals = [{ id: uid('de'), title: fill(a.text) || name, companyId: entity === 'companies' ? rec.id : rec.companyId || '', contactId: entity === 'contacts' ? rec.id : '', ownerId: who(a.to), stage: first?.id, status: 'open', value: Number(rec.expected) || 0, probability: first?.probability ?? 10, priority: 0, source: rec.source || '', closeDate: addDays(30), tags: [], lostReason: '', notes: `Created by the workflow "${rule.name}".`, createdAt: at, stageAt: at }, ...d.deals];
    }
    if (a.type === 'tag' && a.tag) d[entity] = d[entity].map((r) => (r.id === rec.id && !(r.tags || []).includes(a.tag) ? { ...r, tags: [...(r.tags || []), a.tag] } : r));
    if (a.type === 'whatsapp' && contact) {
      const at = new Date().toISOString();
      const msg = { id: uid('msg'), at, by: rec.ownerId || who('owner'), text: fill(a.text), status: 'Sent', net: whatsappPlan() };
      const conv = d.conversations.find((c) => c.kind === 'whatsapp' && c.contactId === contact.id);
      d.conversations = conv
        ? d.conversations.map((c) => (c.id === conv.id ? { ...c, messages: [...c.messages, msg] } : c))
        : [{ id: uid('cv'), kind: 'whatsapp', contactId: contact.id, name: `${contact.first} ${contact.last}`, phone: contact.phone, ownerId: contact.ownerId, createdAt: at, reads: {}, messages: [msg] }, ...d.conversations];
    }
  };
  const logRun = (d, runId, text, status) => {
    d.ruleRuns = (d.ruleRuns || []).map((r) => (r.id === runId ? { ...r, log: [...r.log, { at: new Date().toISOString(), text }], ...(status ? { status } : {}) } : r));
  };
  const stepText = (a, name) => {
    const fill = (x) => String(x || '').replace(/\{name\}/g, name);
    return { task: `Created a task: ${fill(a.text)}`, followup: `Scheduled a follow-up: ${fill(a.text)}`, notify: `Sent an alert: ${fill(a.text)}`, email: `Recorded an email (simulated): ${fill(a.text)}`, whatsapp: `Recorded a WhatsApp message (simulated): ${fill(a.text)}`, assign: 'Assigned the record', update: `Changed ${a.field} to ${a.value}`, tag: `Added the tag ${a.tag}`, webhook: `Would send the record to ${a.url || 'another system'} (simulated, nothing was sent)`, deal: `Created an opportunity: ${fill(a.text) || name}` }[a.type] || a.type;
  };
  // Goes through steps in order, and stops at a wait or an approval to carry on later.
  const runSteps = (d, run, rule, steps, entity, recId, preview) => {
    let queue = [...steps];
    while (queue.length) {
      const st = queue.shift();
      const rec = d[entity]?.find((r) => r.id === recId);
      if (!rec) { logRun(d, run.id, 'The record no longer exists, so this run stopped.', 'Stopped'); return; }
      // A goal ends the run early, for example once the lead has been contacted.
      if ((rule.exit?.conditions || []).some((c) => c.field) && ruleMatches(rule.exit, rec)) { logRun(d, run.id, preview ? 'Would stop here, as the goal is reached' : 'Stopped: the goal was reached', preview ? undefined : 'Goal reached'); return; }
      if (st.kind === 'waitUntil') {
        const until = waitUntilAt(st);
        if (preview) { logRun(d, run.id, `Would wait until ${fmtDT(until)}`); continue; }
        logRun(d, run.id, `Waiting until ${fmtDT(until)}`, 'Waiting');
        d.scheduled = [...(d.scheduled || []), { id: uid('sch'), ruleId: rule.id, runId: run.id, entity, recId, steps: queue, at: until }];
        return;
      }
      if (st.kind === 'wait') {
        if (preview) { logRun(d, run.id, `Would wait ${st.days} days`); continue; }
        logRun(d, run.id, `Waiting ${st.days} days`, 'Waiting');
        d.scheduled = [...(d.scheduled || []), { id: uid('sch'), ruleId: rule.id, runId: run.id, entity, recId, steps: queue, at: new Date(Date.now() + Number(st.days) * 864e5).toISOString() }];
        return;
      }
      if (st.kind === 'branch') {
        const ok = ruleMatches(st, rec);
        logRun(d, run.id, ok ? 'Condition met, so it took the "if yes" path' : 'Condition not met, so it took the "otherwise" path');
        queue = [...((ok ? st.yes : st.no) || []), ...queue];
        continue;
      }
      if (st.kind === 'approval') {
        const name = recordLabel(entity, rec);
        const admin = d.users.find((u) => u.role === 'admin')?.id;
        const to = st.to === 'manager' || !st.to ? d.teams.find((t) => t.id === d.users.find((u) => u.id === rec.ownerId)?.teamId)?.managerId || admin : st.to === 'owner' ? rec.ownerId || admin : st.to;
        const text = String(st.text || '').replace(/\{name\}/g, name);
        if (preview) { logRun(d, run.id, `Would ask ${userName(to, d)} to approve: ${text}, and carry on if they do`); continue; }
        d.approvals = [{ id: uid('apr'), ruleId: rule.id, ruleName: rule.name, runId: run.id, entity, recId, label: name, to, ownerId: rec.ownerId, text, status: 'Pending', at: new Date().toISOString(), steps: queue }, ...(d.approvals || [])];
        notify(d, to, `Approval needed: ${text}`, '/approvals');
        logRun(d, run.id, `Asked ${userName(to, d)} to approve: ${text}`, 'Waiting for approval');
        return;
      }
      doAction(d, rule, st, rec, entity);
      logRun(d, run.id, stepText(st, recordLabel(entity, rec)));
    }
    logRun(d, run.id, 'Finished', 'Done');
  };
  const fireRule = (d, rule, rec, entity) => {
    const run = { id: uid('run'), ruleId: rule.id, ruleName: rule.name, entity, recId: rec.id, label: recordLabel(entity, rec), at: new Date().toISOString(), status: 'Running', by: me?.id, log: [] };
    d.ruleRuns = [run, ...(d.ruleRuns || [])].slice(0, 300);
    runSteps(d, run, rule, stepsOf(rule), entity, rec.id);
    d.automations = d.automations.map((x) => (x.id === rule.id ? { ...x, runs: (x.runs || 0) + 1, lastRun: new Date().toISOString(), lastBy: { ...x.lastBy, [rec.id]: new Date().toISOString() } } : x));
    stamp(d, 'Automation', 'automations', rule.id, rule.name, [{ field: 'Ran on', from: '—', to: recordLabel(entity, rec) }]);
  };
  const runRules = (d, trigger, rec, entity) => {
    const hooks = (d.webhooks || []).filter((h) => h.active && h.events?.includes(trigger));
    if (hooks.length) d.webhookLog = [...hooks.map((h) => deliveryOf(h, trigger, entity, rec, recordLabel(entity, rec))), ...(d.webhookLog || [])].slice(0, 200);
    (d.automations || []).filter((rule) => rule.active && rule.trigger === trigger && ruleMatches(rule, rec) && canRerun(rule, rec.id)).forEach((rule) => fireRule(d, rule, rec, entity));
  };
  // A dry run on a copy of the data, so nothing real changes.
  const previewRule = (rule, rec, entity) => {
    const d = JSON.parse(JSON.stringify(db));
    const matches = ruleMatches(rule, rec);
    const run = { id: 'preview', log: [] };
    d.ruleRuns = [run];
    if (matches) runSteps(d, run, rule, stepsOf(rule), entity, rec.id, true);
    return { matches, log: matches ? d.ruleRuns[0].log : [{ text: "Its conditions don't match this record." }] };
  };
  const runRuleNow = (rule) => {
    const entity = TRIGGERS.find((x) => x.k === rule.trigger)?.entity;
    const seen = new Set(rule.done || []);
    // A timed workflow only runs on records that have actually reached its point, such as overdue invoices.
    const timed = TRIGGERS.find((x) => x.k === rule.trigger)?.timed;
    const pool = timed ? timedRecords(db, rule.trigger, Number(rule.days) || 0) : db[entity] || [];
    const hits = pool.filter((r) => !seen.has(r.id) && ruleMatches(rule, r)).slice(0, 25);
    if (hits.length) setDb((p) => { const d = { ...p }; hits.forEach((rec) => fireRule(d, d.automations.find((x) => x.id === rule.id) || rule, rec, entity)); d.automations = d.automations.map((x) => (x.id === rule.id ? { ...x, done: [...(x.done || []), ...hits.map((r) => r.id)] } : x)); return d; });
    return hits.length;
  };
  const cancelRun = (id) => setDb((p) => {
    const d = { ...p, scheduled: (p.scheduled || []).filter((x) => x.runId !== id), approvals: (p.approvals || []).map((a) => (a.runId === id && a.status === 'Pending' ? { ...a, status: 'Rejected', note: 'The run was stopped.' } : a)) };
    logRun(d, id, 'Stopped by hand', 'Stopped');
    return d;
  });
  const decideApproval = (id, ok, note) => setDb((p) => {
    const a = (p.approvals || []).find((x) => x.id === id);
    if (!a || a.status !== 'Pending') return p;
    const d = { ...p, approvals: p.approvals.map((x) => (x.id === id ? { ...x, status: ok ? 'Approved' : 'Rejected', note, decidedBy: me.id, decidedAt: new Date().toISOString(), steps: [] } : x)) };
    logRun(d, a.runId, `${ok ? 'Approved' : 'Rejected'} by ${me.name}${note ? `: ${note}` : ''}`);
    stamp(d, ok ? 'Update' : 'Reject', a.entity, a.recId, a.label, [{ field: 'Approval', from: 'Pending', to: ok ? 'Approved' : 'Rejected' }]);
    if (a.ownerId && a.ownerId !== me.id) notify(d, a.ownerId, `${ok ? 'Approved' : 'Rejected'}: ${a.text}`, '/approvals');
    const rule = d.automations.find((r) => r.id === a.ruleId);
    if (ok && rule) runSteps(d, { id: a.runId }, rule, a.steps || [], a.entity, a.recId);
    else logRun(d, a.runId, ok ? 'The workflow no longer exists, so this run stopped.' : 'Rejected, so this run stopped.', 'Stopped');
    return d;
  });
  // What a server's scheduler would do. It runs while someone has the CRM open: delayed actions, timed rules, stock alerts.
  const invoiceFromPlan = (d, r, on) => {
    const c = d.companies.find((x) => x.id === r.companyId);
    const taxes = taxesFor(r.items, d, c);
    const inv = { id: uid('in'), number: nextNo(d.invoices, d.settings.invoicePrefix, 5200), currency: r.currency || '', fxRate: r.currency ? rateOf(r.currency) || 1 : 1, recurringId: r.id, companyId: r.companyId, ownerId: r.ownerId, date: on || r.next, due: addDays(Number(r.dueDays) || 30, new Date(on || r.next)), items: r.items, taxes, total: taxes.taxable + taxes.tax, paid: 0, status: 'Sent', orderId: '', createdAt: new Date().toISOString() };
    d.invoices = [inv, ...d.invoices];
    d.recurringInvoices = d.recurringInvoices.map((x) => (x.id === r.id ? { ...x, next: nextDate(x.next, x.freq), last: inv.number, count: (x.count || 0) + 1 } : x));
    if (r.ownerId) notify(d, r.ownerId, `Recurring invoice ${inv.number} was created for ${c?.name || 'a customer'}`, '/billing');
    return inv;
  };
  // Sends a campaign inside an update: each person gets the template in their chat, new chats go to the contact's owner.
  const runCampaign = (d, id) => {
    const camp = (d.waCampaigns || []).find((c) => c.id === id);
    if (!camp || camp.status === 'Sent') return;
    const tpl = templatesOf(d, d.picklists?.messageTemplate || PICKLIST_BY_KEY.messageTemplate.defaults).find((t) => t.id === camp.templateId && t.status === 'Approved');
    const at = new Date().toISOString();
    if (!tpl) { d.waCampaigns = d.waCampaigns.map((c) => (c.id === id ? { ...c, status: 'Draft', note: 'The template is no longer approved.' } : c)); return; }
    const aud = audienceOf(d, d.contacts, camp.audience || {}, tpl, waOf(d.settings));
    let conversations = d.conversations;
    const recipients = [];
    aud.send.forEach((c) => {
      const owner = d.users.find((u) => u.id === c.ownerId);
      const text = tpl.body.replaceAll('{name}', c.first || 'there').replaceAll('{company}', d.settings.companyName).replaceAll('{owner}', (owner?.name || '').split(' ')[0]).replaceAll('{code}', String(Math.floor(100000 + Math.random() * 900000)));
      const msg = { id: uid('msg'), at, by: c.ownerId || me?.id, text, status: 'Sent', net: whatsappPlan(), templateId: tpl.id, campaignId: id, buttons: tpl.buttons };
      const found = conversations.find((x) => x.kind === 'whatsapp' && x.contactId === c.id);
      const convId = found?.id || uid('cv');
      conversations = found ? conversations.map((x) => (x.id === found.id ? { ...x, messages: [...x.messages, msg] } : x)) : [{ id: convId, kind: 'whatsapp', contactId: c.id, name: `${c.first} ${c.last}`, phone: c.phone, ownerId: c.ownerId, createdAt: at, reads: {}, messages: [msg], status: 'Open' }, ...conversations];
      recipients.push({ contactId: c.id, convId, msgId: msg.id });
    });
    d.conversations = conversations;
    d.waCampaigns = d.waCampaigns.map((c) => (c.id === id ? { ...c, status: 'Sent', sentAt: at, recipients, skipped: { optedOut: aud.optedOut, notAsked: aud.notAsked, noPhone: aud.noPhone }, cost: aud.cost } : c));
    stamp(d, 'Send', 'waCampaigns', id, camp.name, [{ field: 'Recipients', from: '—', to: String(recipients.length) }]);
  };
  const sendCampaign = (id) => setDb((p) => { const d = { ...p }; runCampaign(d, id); return d; });
  const schedulerPass = (p) => {
    const d = { ...p };
    let changed = false;
    const now = new Date().toISOString();
    const due = (d.scheduled || []).filter((x) => x.at <= now);
    if (due.length) {
      d.scheduled = d.scheduled.filter((x) => x.at > now);
      due.forEach((x) => {
        const rec = d[x.entity]?.find((r) => r.id === x.recId);
        const rule = d.automations.find((r) => r.id === x.ruleId);
        if (x.steps) {
          if (rec && rule?.active) { logRun(d, x.runId, 'Finished waiting'); runSteps(d, { id: x.runId }, rule, x.steps, x.entity, x.recId); } else logRun(d, x.runId, 'Stopped: the workflow was switched off or the record was deleted.', 'Stopped');
        } else if (rec && rule) doAction(d, rule, x.action, rec, x.entity);
      });
      changed = true;
    }
    (d.automations || []).filter((r) => r.active && TRIGGERS.find((t) => t.k === r.trigger)?.timed).forEach((rule) => {
      const entity = TRIGGERS.find((t) => t.k === rule.trigger).entity;
      const seen = new Set(rule.done || []);
      const hits = timedRecords(d, rule.trigger, Number(rule.days) || 0).filter((r) => (rule.rerun === 'days' ? canRerun(rule, r.id) : !seen.has(r.id)) && ruleMatches(rule, r)).slice(0, 25);
      if (!hits.length) return;
      hits.forEach((rec) => fireRule(d, rule, rec, entity));
      d.automations = d.automations.map((x) => (x.id === rule.id ? { ...x, done: [...(x.done || []), ...hits.map((r) => r.id)] } : x));
      changed = true;
    });
    // Scheduled workflows: at their time, run on up to 50 matching records.
    (d.automations || []).filter((r) => r.active && TRIGGERS.find((t) => t.k === r.trigger)?.schedule && (r.nextAt || nextScheduleAt(r, new Date(r.createdAt || Date.now()).getTime())) <= now).forEach((rule) => {
      const entity = TRIGGERS.find((t) => t.k === rule.trigger).entity;
      const hits = (d[entity] || []).filter((r) => ruleMatches(rule, r) && canRerun(rule, r.id)).slice(0, 50);
      hits.forEach((rec) => fireRule(d, d.automations.find((x) => x.id === rule.id) || rule, rec, entity));
      d.automations = d.automations.map((x) => (x.id === rule.id ? { ...x, nextAt: nextScheduleAt(x), lastScheduled: now, lastScheduledCount: hits.length } : x));
      changed = true;
    });
    (d.reports || []).filter((r) => r.schedule?.next && r.schedule.next <= now).forEach((r) => {
      deliverReport(d, r, r.schedule.to || []);
      d.reports = d.reports.map((x) => (x.id === r.id ? { ...x, schedule: { ...x.schedule, last: now, next: nextRun(x.schedule.freq) } } : x));
      changed = true;
    });
    (d.settings.opsReadOnly === false ? d.recurringInvoices || [] : []).filter((r) => r.active && r.next <= today()).slice(0, 10).forEach((r) => { invoiceFromPlan(d, r); changed = true; });
    Object.entries(d.connections || {}).filter(([, c]) => c.connected && c.auto && c.auto !== 'Off' && c.nextSync && c.nextSync <= now).slice(0, 3).forEach(([key]) => { syncOne(d, key, 'Automatic'); changed = true; });
    Object.entries(d.prefs || {}).forEach(([id, pref]) => {
      const a = alertPrefs(pref?.alerts);
      if (!a.digest.on || pref.lastDigest === today() || new Date().getHours() < a.digest.hour) return;
      notify(d, id, digestFor(d, id), '/tasks', `digest-${id}`);
      d.prefs = { ...d.prefs, [id]: { ...d.prefs[id], lastDigest: today() } };
      changed = true;
    });
    (d.cases || []).filter((c) => isOpenCase(c) && !c.slaAlerted && c.ownerId && slaOf(c, d.settings).overall === 'Overdue').slice(0, 20).forEach((c) => {
      const owner = d.users.find((u) => u.id === c.ownerId);
      const managerId = d.teams.find((x) => x.id === owner?.teamId)?.managerId;
      [c.ownerId, managerId].filter(Boolean).forEach((to) => notify(d, to, `Case #${c.number} missed its service target: ${c.subject}`, `/cases?open=${c.id}`));
      d.cases = d.cases.map((x) => (x.id === c.id ? { ...x, slaAlerted: true } : x));
      changed = true;
    });
    (d.shipments || []).filter((s) => !s.lateAlerted && s.ownerId && ['Overdue', 'Delayed'].includes(deliveryState(s))).slice(0, 20).forEach((s) => {
      notify(d, s.ownerId, `Delivery ${s.tracking} is ${deliveryState(s).toLowerCase()}. Tell the customer.`, `/logistics?open=${s.id}`);
      d.shipments = d.shipments.map((x) => (x.id === s.id ? { ...x, lateAlerted: true } : x));
      changed = true;
    });
    // Simulated WhatsApp review: about a minute after sending, using the same checks as the form.
    const review = (d.waTemplates || []).filter((t) => t.status === 'Pending' && new Date(t.submittedAt).getTime() < Date.now() - 45e3);
    if (review.length) {
      d.waTemplates = d.waTemplates.map((t) => { if (!review.includes(t)) return t; const issues = templateIssues(t); return { ...t, status: issues.length ? 'Rejected' : 'Approved', reason: issues[0] || '', decidedAt: now }; });
      review.forEach((t) => { const after = d.waTemplates.find((x) => x.id === t.id); d.users.filter((u) => u.active && (u.role === 'admin' || u.role === 'manager')).forEach((u) => notify(d, u.id, `WhatsApp template "${t.name}" was ${after.status === 'Approved' ? 'approved' : 'turned down'}.`, '/whatsapp')); });
      changed = true;
    }
    (d.waCampaigns || []).filter((c) => c.status === 'Scheduled' && c.scheduledAt <= now).forEach((c) => { runCampaign(d, c.id); changed = true; });
    // Webhook deliveries that failed are tried again after 1, 5 and 30 minutes, then given up.
    if ((d.webhookLog || []).some((x) => x.status === 'Retrying' && x.nextRetryAt <= now)) {
      d.webhookLog = d.webhookLog.map((x) => {
        if (x.status !== 'Retrying' || x.nextRetryAt > now) return x;
        const next = retryDelivery(x);
        if (next.status === 'Failed') d.users.filter((u) => u.role === 'admin' && u.active).forEach((u) => notify(d, u.id, `A webhook gave up after ${next.attempts} tries: ${(d.webhooks || []).find((h) => h.id === x.webhookId)?.name || 'webhook'}, ${x.label}`, '/connections'));
        return next;
      });
      changed = true;
    }
    (d.emailCampaigns || []).filter((c) => c.status === 'Scheduled' && c.scheduledAt <= now).forEach((c) => { runEmailCampaign(d, c.id); changed = true; });
    // "Remind me if no reply": when the time comes and nobody replied, add a follow-up.
    const quiet = (d.emails || []).filter((e) => e.remindAt && !e.reminded && e.remindAt <= now && !['Replied', 'Scheduled', 'Draft'].includes(e.status));
    if (quiet.length) {
      d.emails = d.emails.map((e) => (quiet.includes(e) ? { ...e, reminded: true } : e));
      d.followups = [...quiet.map((e) => ({ id: uid('fu'), title: `No reply from ${e.name || e.to}: ${e.subject}`, at: now, channel: 'Email', remindBefore: 0, ownerId: e.ownerId, contactId: e.relatedType === 'contact' ? e.relatedId : '', name: e.name || e.to, phone: '', relatedType: e.relatedType || '', relatedId: e.relatedId || '', status: 'open', note: 'Added because the email had no reply.', createdAt: now })), ...(d.followups || [])];
      quiet.forEach((e) => notify(d, e.ownerId, `No reply yet from ${e.name || e.to} to "${e.subject}". A follow-up was added.`, '/followups'));
      changed = true;
    }
    const binLimit = new Date(Date.now() - 30 * 864e5).toISOString();
    if ((d.recycleBin || []).some((x) => x.at < binLimit)) { d.recycleBin = d.recycleBin.filter((x) => x.at >= binLimit); changed = true; }
    if (d.settings.lowStockAlerts) {
      const low = d.products.filter((x) => x.tracked && x.active !== false && x.stock <= x.reorder).map((x) => x.id);
      const known = d.lowStockSeen || [];
      const fresh = low.filter((id) => !known.includes(id));
      if (fresh.length || low.length !== known.length) {
        d.lowStockSeen = low;
        if (fresh.length) d.users.filter((u) => u.role === 'admin' && u.active).forEach((u) => notify(d, u.id, `${fresh.length} ${fresh.length === 1 ? 'product is' : 'products are'} at or below the reorder level.`, '/inventory'));
        changed = true;
      }
    }
    return changed ? d : p;
  };
  useEffect(() => {
    if (!userId) return undefined;
    setDb(schedulerPass);
    const id = setInterval(() => setDb(schedulerPass), 60000);
    return () => clearInterval(id);
  }, [userId, orgId]);
  const latestDb = useRef(db);
  latestDb.current = db;
  // Checked when the CRM opens, then every half hour, so hourly backups keep going while it's open.
  useEffect(() => {
    const run = () => { const s = secOf(latestDb.current.settings); autoBackup(orgId, latestDb.current, { freq: s.backupFreq, keep: s.backupKeep, weeks: s.backupWeeks, months: s.backupMonths, offsite: s.backupOffsite }).catch(() => {}); };
    run();
    const id = setInterval(run, 30 * 6e4);
    return () => clearInterval(id);
  }, [orgId]);
  // A new role copies the access of any role, custom ones included. The layout comes from the built-in role underneath.
  const addCustomRole = (name, from) => setDb((p) => {
    const id = uid('role');
    const source = p.customRoles?.find((x) => x.id === from);
    const base = source?.base || from;
    const d = { ...p, customRoles: [...(p.customRoles || []), { id, name, base }], permissions: { ...p.permissions, roles: { ...p.permissions.roles, [id]: p.permissions.roles[from] } }, fieldRules: { ...p.fieldRules, [id]: p.fieldRules?.[from] || {} } };
    stamp(d, 'Create', 'customRoles', id, name, [{ field: 'Copied from', from: '—', to: source?.name || ROLES[from] }]);
    return d;
  });
  const removeCustomRole = (id) => setDb((p) => {
    const cur = p.customRoles.find((x) => x.id === id);
    const roles = { ...p.permissions.roles };
    delete roles[id];
    const d = { ...p, customRoles: p.customRoles.filter((x) => x.id !== id), permissions: { ...p.permissions, roles }, users: p.users.map((u) => (u.customRole === id ? { ...u, customRole: '' } : u)) };
    stamp(d, 'Delete', 'customRoles', id, cur?.name || id);
    return d;
  });
  // A simulated AI call: it goes into the AI call history and the normal call log, then hands over to a person when needed.
  const runAiCall = (d, agent, t, campaignId, incoming = false) => {
    const r = simulateAiCall(agent, t.name, Math.random(), incoming);
    const at = new Date().toISOString();
    const admin = d.users.find((u) => u.role === 'admin')?.id;
    const owner = t.ownerId || admin;
    const direction = incoming ? 'Incoming' : 'Outgoing';
    d.aiCalls = [{ id: uid('aic'), agentId: agent.id, agentName: agent.name, campaignId: campaignId || '', name: t.name, phone: t.phone, companyId: t.companyId || '', relatedType: t.relatedType || '', relatedId: t.relatedId || '', ownerId: owner, at, direction, ...r }, ...d.aiCalls];
    d.calls = [{ id: uid('ca'), type: 'voice', direction, businessNumber: d.settings.businessNumber, name: t.name, phone: t.phone, companyId: t.companyId || '', relatedType: t.relatedType || '', relatedId: t.relatedId || '', ownerId: owner, at, duration: r.duration, outcome: r.outcome === 'No answer' ? 'No answer' : 'Connected', note: `AI Voice, ${agent.name}: ${r.summary}`, demo: true }, ...d.calls];
    if (['Interested', 'Call back later', 'Asked for a person'].includes(r.outcome)) {
      const urgent = r.outcome === 'Asked for a person';
      const to = urgent && agent.handoff === 'manager' ? d.teams.find((x) => x.id === d.users.find((u) => u.id === owner)?.teamId)?.managerId || owner : owner;
      d.followups = [{ id: uid('fu'), title: `Call ${t.name}: ${r.outcome.toLowerCase()}`, at: new Date(Date.now() + (r.outcome === 'Call back later' ? 864e5 : urgent ? 0 : 36e5)).toISOString(), channel: 'Call', remindBefore: 0, ownerId: to, contactId: t.relatedType === 'contact' ? t.relatedId : '', name: t.name, phone: t.phone, relatedType: t.relatedType || '', relatedId: t.relatedId || '', status: 'open', note: `From AI Voice: ${r.summary}`, createdAt: at }, ...d.followups];
      notify(d, to, `AI Voice: ${r.summary}`, '/followups');
    }
    // Answers go onto the record, so nobody has to ask again.
    if (r.answers?.length && ['lead', 'contact'].includes(t.relatedType)) {
      const entity = t.relatedType === 'lead' ? 'leads' : 'contacts';
      const text = `AI Voice on ${at.slice(0, 10)}: ${r.answers.map((a) => `${a.label}: ${a.value}`).join(', ')}`;
      d[entity] = d[entity].map((x) => (x.id === t.relatedId ? { ...x, notes: x.notes ? `${text}\n${x.notes}` : text } : x));
    }
    if (r.outcome === 'Do not call' && !(d.aiDnc || []).some((x) => phoneKey(x.phone) === phoneKey(t.phone))) {
      d.aiDnc = [{ id: uid('dn'), name: t.name, phone: t.phone, source: `Asked on a call with ${agent.name}`, createdAt: at }, ...(d.aiDnc || [])];
    }
    if (r.outcome === 'Interested' && agent.purpose === 'Appointment booking') {
      const start = new Date(Date.now() + 864e5);
      start.setHours(11, 0, 0, 0);
      d.events = [{ id: uid('ev'), title: `Meeting with ${t.name}`, category: 'Meeting', start: start.toISOString(), end: new Date(start.getTime() + 18e5).toISOString(), companyId: t.companyId || '', ownerId: owner, createdAt: at }, ...d.events];
    }
    return r;
  };
  const aiStep = (p) => {
    const nowIso = new Date().toISOString();
    const dueLater = p.aiCampaigns.filter((c) => c.status === 'Scheduled' && (c.startAt || '') <= nowIso);
    const running = [...p.aiCampaigns.filter((c) => c.status === 'Running'), ...dueLater];
    if (!running.length) return p;
    const d = { ...p };
    const rules = aiRules(p.settings);
    let touched = dueLater.length > 0;
    if (dueLater.length) d.aiCampaigns = d.aiCampaigns.map((c) => (dueLater.some((x) => x.id === c.id) ? { ...c, status: 'Running' } : c));
    running.forEach((c) => {
      const agent = d.aiAgents.find((a) => a.id === c.agentId);
      if (!agent) { d.aiCampaigns = d.aiCampaigns.map((x) => (x.id === c.id ? { ...x, status: 'Paused' } : x)); return; }
      // Call the next person for whom it's within calling hours. Their customer's time zone counts, if it's set.
      const at = c.queue.findIndex((x) => withinCallingHours(rules, new Date(), x.tz));
      if (at < 0) {
        if (!c.waiting) { d.aiCampaigns = d.aiCampaigns.map((x) => (x.id === c.id ? { ...x, waiting: true } : x)); touched = true; }
        return;
      }
      touched = true;
      const t = c.queue[at];
      const rest = c.queue.filter((_, n) => n !== at);
      const blocked = (d.aiDnc || []).some((x) => phoneKey(x.phone) === phoneKey(t.phone));
      const r = blocked ? null : runAiCall(d, agent, t, c.id);
      const again = r?.outcome === 'No answer' && (t.attempts || 0) < rules.retry;
      const queue = again ? [...rest, { ...t, attempts: (t.attempts || 0) + 1 }] : rest;
      d.aiCampaigns = d.aiCampaigns.map((x) => (x.id === c.id ? { ...x, waiting: false, queue, done: x.done + (again ? 0 : 1), skipped: (x.skipped || 0) + (blocked ? 1 : 0), retried: (x.retried || 0) + (again ? 1 : 0), status: queue.length ? 'Running' : 'Completed' } : x));
      if (!queue.length) notify(d, c.ownerId, `AI Voice campaign finished: ${c.name}`, '/ai-voice');
    });
    return touched ? d : p;
  };
  const aiRunning = (db.aiCampaigns || []).some((c) => ['Running', 'Scheduled'].includes(c.status));
  useEffect(() => {
    if (!userId || !aiRunning) return undefined;
    const id = setInterval(() => setDb(aiStep), 2500);
    return () => clearInterval(id);
  }, [userId, orgId, aiRunning]);
  const aiAnswerMissed = (agent, person, owner) => setDb((p) => { const d = { ...p }; runAiCall(d, agent, { ...person, ownerId: owner }, '', true); return d; });
  const prefs = db.prefs?.[me?.id] || {};
  const savePrefs = (patch) => setDb((p) => ({ ...p, prefs: { ...p.prefs, [me.id]: { ...p.prefs?.[me.id], ...patch } } }));
  const saveBoards = (boards) => setDb((p) => ({ ...p, boards }));
  // A scheduled report arrives as an entry in Email and a notification. Nothing leaves the browser.
  const deliverReport = (d, r, to) => {
    const at = new Date().toISOString();
    to.forEach((id) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) return;
      d.emails = [{ id: uid('em'), to: u.email, subject: `Report: ${r.name}`, body: `Your report "${r.name}" is ready. Open it in the CRM to see the latest numbers.`, status: 'Sent', auto: true, ownerId: r.ownerId, at, relatedType: '', relatedId: '' }, ...(d.emails || [])];
      notify(d, id, `Report ready: ${r.name}`, `/reports/custom?open=${r.id}`);
    });
  };
  const saveReportSchedule = (id, schedule) => setDb((p) => ({ ...p, reports: p.reports.map((r) => (r.id === id ? { ...r, schedule: schedule ? { ...schedule, next: nextRun(schedule.freq), last: r.schedule?.last } : null } : r)) }));
  const sendReportNow = (id, to) => setDb((p) => {
    const d = { ...p };
    const r = p.reports.find((x) => x.id === id);
    if (r) { deliverReport(d, r, to); d.reports = p.reports.map((x) => (x.id === id && x.schedule ? { ...x, schedule: { ...x.schedule, last: new Date().toISOString() } } : x)); }
    return d;
  });
  const saveDashboard = (list) => setDb((p) => ({ ...p, dashboards: { ...p.dashboards, [me.id]: list || undefined } }));
  const saveRule = (rule) => setDb((p) => {
    const exists = rule.id && p.automations.some((r) => r.id === rule.id);
    const prev = exists && p.automations.find((r) => r.id === rule.id);
    // Each save keeps the version before it, so a change can be undone.
    const snap = prev ? (({ versions, runs, lastRun, done, lastBy, nextAt, ...s }) => s)(prev) : null;
    const base = exists ? { ...rule, versions: [{ at: new Date().toISOString(), by: me.id, snap }, ...(prev.versions || [])].slice(0, 10) } : { ...rule, id: uid('rule'), runs: 0, createdAt: new Date().toISOString() };
    const rec = TRIGGERS.find((t) => t.k === base.trigger)?.schedule ? { ...base, nextAt: nextScheduleAt(base) } : base;
    const d = { ...p, automations: exists ? p.automations.map((r) => (r.id === rule.id ? rec : r)) : [rec, ...p.automations] };
    stamp(d, exists ? 'Update' : 'Create', 'automations', rec.id, rec.name);
    return d;
  });
  const removeRule = (id) => remove('automations', id);
  const formFields = (kind, base) => {
    const rules = myFieldRules?.[kind];
    const fields = applyFormConfig(db.formConfig?.[kind], base);
    if (!rules) return fields;
    return fields.map((f) => (f.req || !rules[f.k] ? f : rules[f.k] === 'hidden' ? { ...f, hide: true } : { ...f, readOnly: true, hint: 'You can see this but not change it.' }));
  };
  const setFieldRule = (r, kind, k, rule) => setDb((p) => {
    const forRole = { ...(p.fieldRules?.[r] || {}) };
    const forKind = { ...(forRole[kind] || {}) };
    const before = forKind[k] || 'edit';
    if (rule === 'edit') delete forKind[k]; else forKind[k] = rule;
    const words = { edit: 'See and edit', read: 'See only', hidden: 'Not see' };
    const d = { ...p, fieldRules: { ...p.fieldRules, [r]: { ...forRole, [kind]: forKind } } };
    stamp(d, 'Update', 'permissions', r, `${ROLES[r] || p.customRoles?.find((x) => x.id === r)?.name} field access`, [{ field: `${kind}: ${k}`, from: words[before], to: words[rule] }]);
    return d;
  });
  const setAccessExpiry = (id, date) => setDb((p) => {
    const next = { ...(p.accessExpiry || {}) };
    const before = next[id] || 'No end date';
    if (date) next[id] = date; else delete next[id];
    const d = { ...p, accessExpiry: next };
    stamp(d, 'Update', 'accessExpiry', id, `${userName(id, p)}'s personal access`, [{ field: 'Ends on', from: before, to: date || 'No end date' }]);
    return d;
  });
  const saveFormConfig = (kind, config) => setDb((p) => {
    const d = { ...p, formConfig: { ...p.formConfig, [kind]: config } };
    stamp(d, 'Update', 'formConfig', kind, `${kind} form`);
    return d;
  });
  const importRecords = (kind, records, mode) => {
    const entity = DUP_ENTITY[kind];
    const counts = { added: 0, updated: 0, skipped: 0 };
    const seen = { ...db, [entity]: [...db[entity]] };
    const plan = [];
    records.forEach((rec) => {
      const dup = mode === 'create' ? null : findDuplicate(seen, kind, rec);
      if (dup && mode === 'skip') { counts.skipped++; return; }
      if (dup) { plan.push({ dupId: dup.id, rec }); counts.updated++; return; }
      seen[entity].push({ ...rec, id: uid('tmp') });
      plan.push({ rec });
      counts.added++;
    });
    setDb((p) => {
      const d = { ...p };
      const now = new Date().toISOString();
      plan.forEach(({ dupId, rec }) => {
        const { companyName: co, ...data } = rec;
        if (kind === 'contact' && !data.companyId && co) {
          let found = d.companies.find((c) => c.name.toLowerCase() === co.toLowerCase());
          if (!found) { found = { id: uid('co'), name: co, status: 'Prospect', ownerId: me.id, tags: [], notes: '', createdAt: now }; d.companies = [found, ...d.companies]; }
          data.companyId = found.id;
        }
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v != null));
        if (dupId) { d[entity] = d[entity].map((r) => (r.id === dupId ? (entity === 'leads' ? { ...r, ...clean, score: scoreLead({ ...r, ...clean }) } : { ...r, ...clean }) : r)); return; }
        const row = { status: kind === 'lead' ? 'New' : kind === 'contact' ? 'Cold' : 'Prospect', tags: [], notes: '', ownerId: me.id, ...clean, id: uid(entity.slice(0, 2)), createdAt: now, ...(kind === 'contact' ? { lastActivity: now } : {}) };
        if (kind === 'lead') { row.source = row.source || 'Website'; row.expected = row.expected || 0; if (p.settings.ruleAssignment) row.ownerId = nextSalesperson(d) || row.ownerId; row.score = scoreLead(row); }
        d[entity] = [row, ...d[entity]];
        if (CREATE_TRIGGER[entity]) runRules(d, CREATE_TRIGGER[entity], row, entity);
      });
      stamp(d, 'Import', entity, kind, `Imported ${entity}`, [{ field: 'Records', from: '—', to: `${counts.added} added, ${counts.updated} updated, ${counts.skipped} skipped` }]);
      return d;
    });
    return counts;
  };
  const mergeDuplicates = (kind, ids) => setDb((p) => {
    const d = { ...p };
    const list = d[DUP_ENTITY[kind]].filter((r) => ids.includes(r.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    list.slice(1).forEach((r) => mergeRecords(d, kind, list[0].id, r.id));
    stamp(d, 'Merge', DUP_ENTITY[kind], list[0].id, recordLabel(DUP_ENTITY[kind], list[0]), [{ field: 'Records merged', from: String(list.length), to: '1' }]);
    return d;
  });
  // Turns an enquiry into a lead, or adds it to the person's open lead, and says who got it and why.
  const acceptEnquiry = (form, values, base) => {
    const { lead: known, contact } = form.dupes === 'new' ? {} : findExisting(db, values);
    const who = values.name || values.email || 'Someone';
    let out;
    if (known) {
      const note = [values.notes, enquiryNote(form, values, base)].filter(Boolean).join('\n');
      setDb((p) => {
        const d = { ...p };
        applyUpdate(d, 'leads', known.id, { notes: [known.notes, `Enquiry through ${form.name} on ${base.at.slice(0, 10)}:`, note].filter(Boolean).join('\n'), lastEnquiryAt: base.at }, 'Enquiry');
        notify(d, known.ownerId, `${who} wrote again, through ${form.name}.`, `/leads?open=${known.id}`);
        return d;
      });
      out = { status: 'Added to a lead', leadId: known.id, ownerId: known.ownerId, why: 'They already had an open lead' };
    } else {
      const r = routeTo(form, values, db, nextSalesperson, contact);
      const lead = create('leads', { ...buildLead(form, values, base), ownerId: r.ownerId });
      setDb((p) => { const d = { ...p }; notify(d, r.ownerId, `New enquiry from ${who}${values.company ? ` at ${values.company}` : ''}, through ${form.name}.`, `/leads?open=${lead.id}`); return d; });
      out = { status: contact ? 'Lead, known contact' : 'Lead created', leadId: lead.id, ownerId: r.ownerId, why: r.why };
    }
    if (form.alsoNotify?.length) setDb((p) => { const d = { ...p }; form.alsoNotify.filter((u) => u !== out.ownerId).forEach((u) => notify(d, u, `${who} sent ${form.name}.`, '/webforms')); return d; });
    if (form.autoReply && values.email) {
      const subject = mergeText(form.autoSubject, values, form, db.settings.companyName);
      sendEmail({ to: values.email, subject, body: mergeText(form.autoBody, values, form, db.settings.companyName), ownerId: out.ownerId, relatedType: 'lead', relatedId: out.leadId });
      out.autoReply = `"${subject}" to ${values.email}`;
    }
    return out;
  };
  const submitWebForm = (form, values, meta = {}) => {
    const at = new Date().toISOString();
    const base = { id: uid('fs'), formId: form.id, at, values, utm: meta.utm || {}, referrer: meta.referrer || '', seconds: meta.seconds, consent: meta.consent, consentText: meta.consent ? form.consentText : undefined };
    const reason = spamReason(form, values, { trap: meta.trap, seconds: meta.seconds, recent: db.formSubmissions || [] });
    if (reason) {
      setDb((p) => ({ ...p, formSubmissions: [{ ...base, status: 'Spam', reason }, ...(p.formSubmissions || [])].slice(0, 1000), formStats: bumpStat(p.formStats, form.id, 'spam') }));
      return 'spam';
    }
    const out = acceptEnquiry(form, values, base);
    setDb((p) => ({ ...p, formSubmissions: [{ ...base, ...out }, ...(p.formSubmissions || [])].slice(0, 1000), formStats: bumpStat(p.formStats, form.id, 'sent'), webForms: p.webForms.map((f) => (f.id === form.id ? { ...f, submissions: (f.submissions || 0) + 1 } : f)) }));
    return 'sent';
  };
  // Counts opens, starts and pages reached. Quietly, as these aren't anyone's edits.
  const trackForm = (formId, kind, step) => setDb((p) => ({ ...p, formStats: bumpStat(p.formStats, formId, kind, { step }) }));
  const enquiryNotSpam = (id) => {
    const sub = (db.formSubmissions || []).find((s) => s.id === id);
    const form = sub && db.webForms.find((f) => f.id === sub.formId);
    if (!sub || !form || sub.status !== 'Spam') return false;
    const out = acceptEnquiry(form, sub.values, sub);
    setDb((p) => {
      const day = sub.at.slice(0, 10);
      const d = { ...p, formSubmissions: p.formSubmissions.map((s) => (s.id === id ? { ...s, ...out, reason: '', heldFor: s.reason } : s)), formStats: bumpStat(bumpStat(p.formStats, form.id, 'spam', { day, by: -1 }), form.id, 'sent', { day }), webForms: p.webForms.map((f) => (f.id === form.id ? { ...f, submissions: (f.submissions || 0) + 1 } : f)) };
      stamp(d, 'Not spam', 'webForms', form.id, form.name, [{ field: 'Enquiry', from: 'Spam', to: out.status }]);
      return d;
    });
    return true;
  };
  const removeEnquiries = (ids) => setDb((p) => {
    const d = { ...p, formSubmissions: (p.formSubmissions || []).filter((s) => !ids.includes(s.id)) };
    stamp(d, 'Delete', 'webForms', ids[0], `${ids.length} web ${ids.length === 1 ? 'enquiry' : 'enquiries'}`);
    return d;
  });;
  const newEmail = ({ to, subject, body, ownerId, relatedType = '', relatedId = '', files: att, sendAt, name, cc, bcc, templateId, remindAt, campaignId, variant }) => ({ id: uid('em'), to, subject, body, ownerId, name, files: att, cc: cc || undefined, bcc: bcc || undefined, templateId, remindAt, campaignId, variant, status: sendAt ? 'Scheduled' : 'Sent', sendAt: sendAt || undefined, at: new Date().toISOString(), relatedType, relatedId, net: sendAt ? undefined : trackedPlan(db.settings) || emailPlan() });
  // With tracking off, nobody can see opens or clicks.
  const trackedPlan = (settings) => { const n = emailPlan(); if (!emailOf(settings).tracking) { delete n.openAt; delete n.clickAt; delete n.unsubAt; } return n; };
  const runEmailCampaign = (d, id) => {
    const camp = (d.emailCampaigns || []).find((c) => c.id === id);
    if (!camp || camp.status === 'Sent') return;
    const tpl = (d.emailTemplates?.length ? d.emailTemplates : []).find((t) => t.id === camp.templateId) || { body: (d.picklists?.emailTemplate || PICKLIST_BY_KEY.emailTemplate.defaults)[Number(String(camp.templateId).replace('ep', ''))] || '' };
    const at = new Date().toISOString();
    const listed = new Set((d.emailSuppressed || []).map((x) => String(x.email).toLowerCase()));
    const skipped = { suppressed: 0, noEmail: 0 };
    const people = (camp.audience?.ids || []).map((key) => { const [kind, rid] = key.split(':'); const r = kind === 'lead' ? d.leads.find((x) => x.id === rid) : d.contacts.find((x) => x.id === rid); return r && { kind, r }; }).filter(Boolean);
    const footer = footerText(d.settings);
    const owner = d.users.find((u) => u.id === camp.ownerId);
    const recs = [];
    people.forEach(({ kind, r }, i) => {
      const email = String(r.email || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped.noEmail += 1; return; }
      if (listed.has(email.toLowerCase())) { skipped.suppressed += 1; return; }
      const first = kind === 'lead' ? r.name.split(' ')[0] : r.first;
      const company = kind === 'lead' ? r.company : d.companies.find((x) => x.id === r.companyId)?.name;
      const variant = camp.subjectB ? (i % 2 ? 'B' : 'A') : undefined;
      const fillIn = (t) => String(t || '').replace(/\{name\}/g, first || 'there').replace(/\{company\}/g, company || 'your company').replace(/\{me\}/g, owner?.name || '').replace(/\{our_company\}/g, d.settings.companyName);
      recs.push({ id: uid('em'), to: email, name: kind === 'lead' ? r.name : `${r.first} ${r.last}`, subject: fillIn(variant === 'B' ? camp.subjectB : camp.subject), body: `${fillIn(tpl.body)}\n\n--\n${footer}`, ownerId: r.ownerId || camp.ownerId, status: 'Sent', at, relatedType: kind, relatedId: r.id, campaignId: id, variant, templateId: camp.templateId, net: trackedPlan(d.settings) });
    });
    d.emails = [...recs, ...(d.emails || [])];
    d.emailCampaigns = d.emailCampaigns.map((c) => (c.id === id ? { ...c, status: 'Sent', sentAt: at, count: recs.length, skipped } : c));
    stamp(d, 'Send', 'emailCampaigns', id, camp.name, [{ field: 'Recipients', from: '—', to: String(recs.length) }]);
  };
  const sendEmailCampaign = (id) => setDb((p) => { const d = { ...p }; runEmailCampaign(d, id); return d; });
  const createRequest = (rec) => setDb((p) => {
    const r = { id: uid('rq'), ...rec, status: 'Open', requestedBy: me.id, createdAt: new Date().toISOString(), comments: [] };
    const d = { ...p, opsRequests: [r, ...(p.opsRequests || [])] };
    stamp(d, 'Create', 'opsRequests', r.id, typeLabel(r.type));
    notify(d, r.assigneeId, `${me.name} asked you to ${typeLabel(r.type).toLowerCase()}${r.recordLabel ? `: ${r.recordLabel}` : ''}.`, '/requests', `rq-${r.id}`, true);
    return d;
  });
  const updateRequest = (id, patch) => setDb((p) => {
    const cur = (p.opsRequests || []).find((r) => r.id === id);
    if (!cur) return p;
    const d = { ...p, opsRequests: p.opsRequests.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
    stamp(d, 'Update', 'opsRequests', id, typeLabel(cur.type), Object.keys(patch).filter((k) => k !== 'doneAt').map((k) => ({ field: k === 'assigneeId' ? 'With' : k === 'status' ? 'Status' : 'What was done', from: k === 'assigneeId' ? userName(cur[k], p) : String(cur[k] || '—'), to: k === 'assigneeId' ? userName(patch[k], p) : String(patch[k] || '—') })));
    if (patch.assigneeId) notify(d, patch.assigneeId, `${me.name} passed you a request: ${typeLabel(cur.type)}.`, '/requests', `rq-${id}`, true);
    if (patch.status && cur.requestedBy !== me.id) notify(d, cur.requestedBy, `Your request "${typeLabel(cur.type)}" is now ${patch.status.toLowerCase()}${patch.resolution ? `: ${patch.resolution.replace(/[.!?]+$/, '')}` : ''}.`, '/requests', `rq-${id}`, true);
    return d;
  });
  const commentRequest = (id, text, status) => setDb((p) => {
    const cur = (p.opsRequests || []).find((r) => r.id === id);
    if (!cur) return p;
    const d = { ...p, opsRequests: p.opsRequests.map((r) => (r.id === id ? { ...r, comments: [...(r.comments || []), { by: me.id, at: new Date().toISOString(), text }], ...(status ? { status } : {}) } : r)) };
    const other = me.id === cur.requestedBy ? cur.assigneeId : cur.requestedBy;
    notify(d, other, `${me.name} on "${typeLabel(cur.type)}": ${text.slice(0, 80)}`, '/requests', `rq-${id}`, true);
    return d;
  });
  const sendEmail = (mail) => setDb((p) => {
    const rec = newEmail(mail);
    const d = { ...p, emails: [rec, ...(p.emails || [])] };
    stamp(d, rec.status === 'Scheduled' ? 'Schedule' : 'Send', 'emails', rec.id, rec.subject, [{ field: 'To', from: '—', to: rec.to }]);
    return d;
  });
  const sendBulkEmail = (list) => {
    setDb((p) => { const recs = list.map(newEmail); const d = { ...p, emails: [...recs, ...(p.emails || [])] }; stamp(d, 'Send', 'emails', recs[0]?.id || 'bulk', `Bulk email: ${list[0]?.subject || ''}`, [{ field: 'Recipients', from: '—', to: String(list.length) }]); return d; });
    return list.length;
  };
  const saveEmailDraft = ({ id, to, subject, body, files: att, ownerId }) => setDb((p) => {
    const rec = { id: id || uid('em'), to, subject, body, files: att, ownerId, status: 'Draft', at: new Date().toISOString() };
    return { ...p, emails: id ? p.emails.map((x) => (x.id === id ? rec : x)) : [rec, ...(p.emails || [])] };
  });
  const removeEmail = (id) => setDb((p) => ({ ...p, emails: p.emails.filter((x) => x.id !== id) }));
  // Passing no text just marks it as read.
  const sendEmailReply = (id, text) => setDb((p) => ({ ...p, emails: p.emails.map((x) => (x.id !== id ? x : text ? { ...x, seen: true, thread: [...(x.thread || []), { mine: true, at: new Date().toISOString(), text }] } : { ...x, seen: true })) }));
  const simulateEmailReply = (id) => setDb((p) => {
    const e = p.emails.find((x) => x.id === id);
    if (!e) return p;
    const at = new Date().toISOString();
    const d = { ...p, emails: p.emails.map((x) => (x.id === id ? { ...x, status: 'Replied', reply: pickReply(), replyAt: at, seen: false, net: { ...x.net, replyAt: undefined } } : x)) };
    notify(d, e.ownerId, `${e.name || e.to} replied to "${e.subject}".`, '/emails');
    return d;
  });
  const simulateIncomingEmail = () => setDb((p) => {
    const c = scope(p.contacts).filter((x) => x.email)[Math.floor(Math.random() * Math.max(1, scope(p.contacts).filter((x) => x.email).length))];
    const at = new Date().toISOString();
    const rec = { id: uid('em'), incoming: true, to: c?.email || 'customer@example.com', name: c ? `${c.first} ${c.last}` : 'A customer', subject: 'Question about your products', body: 'Hello, could you send me more details and pricing?', ownerId: c?.ownerId || me.id, status: 'Received', at, replyAt: at, seen: false, relatedType: c ? 'contact' : '', relatedId: c?.id || '' };
    const d = { ...p, emails: [rec, ...(p.emails || [])] };
    notify(d, rec.ownerId, `New email from ${rec.name}.`, '/emails');
    return d;
  });
  // Moves simulated messages along: scheduled emails go out, and customers open, read and reply.
  const networkPass = (p) => {
    const now = new Date().toISOString();
    let changed = false;
    const d = { ...p };
    const replies = [];
    const bounced = [];
    const unsubs = [];
    d.emails = (p.emails || []).map((e) => {
      if (e.status === 'Scheduled' && e.sendAt <= now) { changed = true; return { ...e, status: 'Sent', at: now, sendAt: undefined, net: trackedPlan(p.settings) }; }
      if (!e.net) return e;
      const n = e.net;
      const rank = { Sent: 0, Delivered: 1, Opened: 2, Clicked: 3, Replied: 4 };
      let status = e.status;
      if (n.bounceAt && n.bounceAt <= now && status !== 'Bounced') { changed = true; bounced.push(e); return { ...e, status: 'Bounced', net: { ...n, bounceAt: undefined } }; }
      if (n.unsubAt && n.unsubAt <= now) { changed = true; unsubs.push(e); return { ...e, unsubscribed: true, net: { ...n, unsubAt: undefined } }; }
      const reach = (x, at) => { if (at && at <= now && rank[status] < rank[x]) status = x; };
      reach('Delivered', n.deliverAt); reach('Opened', n.openAt); reach('Clicked', n.clickAt);
      if (n.replyAt && n.replyAt <= now) { changed = true; replies.push(e); return { ...e, status: 'Replied', reply: n.reply, replyAt: now, seen: false, net: { ...n, replyAt: undefined } }; }
      if (status !== e.status) { changed = true; return { ...e, status, ...(emailReached(status, 'Opened') && !e.openedAt ? { openedAt: now } : {}) }; }
      return e;
    });
    replies.forEach((e) => notify(d, e.ownerId, `${e.name || e.to} replied to "${e.subject}".`, '/emails'));
    // Bounces and unsubscribes go on the do-not-email list, so campaigns skip them.
    const listed = new Set((p.emailSuppressed || []).map((x) => String(x.email).toLowerCase()));
    const add = [];
    [...(emailOf(p.settings).suppressBounces ? bounced.map((e) => [e, 'Bounced']) : []), ...unsubs.map((e) => [e, 'Unsubscribed'])].forEach(([e, reason]) => {
      const key = String(e.to).toLowerCase();
      if (listed.has(key)) return;
      listed.add(key);
      add.push({ id: uid('sup'), email: key, reason, at: now });
      if (reason === 'Unsubscribed') notify(d, e.ownerId, `${e.name || e.to} unsubscribed from "${e.subject}".`, '/emails');
    });
    if (add.length) d.emailSuppressed = [...add, ...(p.emailSuppressed || [])];
    d.conversations = p.conversations.map((c) => {
      if (c.kind !== 'whatsapp' || !c.messages.some((m) => m.net)) return c;
      let touched = false;
      const added = [];
      const messages = c.messages.map((m) => {
        if (!m.net) return m;
        const n = m.net;
        let status = m.status;
        if (n.failAt && n.failAt <= now) { touched = true; return { ...m, status: 'Failed', net: undefined }; }
        if (n.deliverAt && n.deliverAt <= now && status === 'Sent') { status = 'Delivered'; touched = true; }
        if (n.readAt && n.readAt <= now && status !== 'Read') { status = 'Read'; touched = true; }
        const left = { ...n };
        if (n.replyAt && n.replyAt <= now) { added.push({ id: uid('msg'), at: now, by: null, text: n.reply }); delete left.replyAt; touched = true; }
        const finished = !left.replyAt && (!left.readAt || status === 'Read') && status !== 'Sent';
        return status !== m.status || finished || left.replyAt !== n.replyAt ? { ...m, status, net: finished ? undefined : left } : m;
      });
      if (!touched && messages.every((m, i) => m === c.messages[i])) return c;
      changed = true;
      if (added.length) notify(d, c.ownerId, `${c.name} replied on WhatsApp.`, '/whatsapp', `wa-${c.id}`);
      return { ...c, messages: [...messages, ...added], ...(added.length ? { status: 'Open' } : {}) };
    });
    return changed ? d : p;
  };
  useEffect(() => {
    if (!userId) return undefined;
    const id = setInterval(() => setDb(networkPass), 4000);
    return () => clearInterval(id);
  }, [userId, orgId]);
  const sendBroadcast = (rows, makeText) => {
    setDb((p) => {
      let conversations = p.conversations;
      const at = new Date().toISOString();
      rows.forEach((c) => {
        const msg = { id: uid('msg'), at, by: me.id, text: makeText(c), status: 'Sent', net: whatsappPlan() };
        const found = conversations.find((x) => x.kind === 'whatsapp' && x.contactId === c.id);
        conversations = found ? conversations.map((x) => (x.id === found.id ? { ...x, messages: [...x.messages, msg], reads: { ...x.reads, [me.id]: at } } : x)) : [{ id: uid('cv'), kind: 'whatsapp', contactId: c.id, name: `${c.first} ${c.last}`, phone: c.phone, ownerId: c.ownerId, createdAt: at, reads: { [me.id]: at }, messages: [msg] }, ...conversations];
      });
      const d = { ...p, conversations };
      stamp(d, 'Send', 'conversations', 'broadcast', 'WhatsApp broadcast', [{ field: 'Recipients', from: '—', to: String(rows.length) }]);
      return d;
    });
    return rows.length;
  };
  const assignConversation = (id, ownerId) => setDb((p) => ({ ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, ownerId } : c)) }));
  const customerWrites = (d, id, text) => {
    const c = d.conversations.find((x) => x.id === id);
    if (!c) return;
    const at = new Date().toISOString();
    const wa = waOf(d.settings);
    const contact = d.contacts.find((x) => x.id === c.contactId);
    const r = autoReplies(wa, c, text, { open: isOpen(d.settings), company: d.settings.companyName, name: /^[+\d]/.test(c.name) ? '' : c.name });
    const inbound = { id: uid('msg'), at, by: null, text, status: 'Simulated' };
    const later = new Date(Date.now() + 1000).toISOString();
    const autos = r.replies.map((x) => ({ id: uid('msg'), at: later, by: c.ownerId || null, auto: true, why: x.why, text: x.text, status: 'Sent', net: whatsappPlan() }));
    d.conversations = d.conversations.map((x) => (x.id === id ? { ...x, status: 'Open', messages: [...x.messages, inbound, ...autos], ...(r.optOut ? { optOut: true } : r.optIn ? { optOut: false } : {}) } : x));
    if (contact && (r.optOut || r.optIn)) d.contacts = d.contacts.map((x) => (x.id === contact.id ? { ...x, waOptOut: !!r.optOut, waOptIn: r.optIn ? true : false, waOptInAt: r.optIn ? at : x.waOptInAt } : x));
    if (r.optOut || r.optIn) stamp(d, r.optOut ? 'Opt out' : 'Opt in', 'conversations', id, c.name, [{ field: 'WhatsApp marketing', from: r.optOut ? 'Allowed' : 'Stopped', to: r.optOut ? 'Stopped' : 'Agreed' }]);
    const to = c.ownerId ? [c.ownerId] : d.users.filter((u) => u.active && u.role === 'manager').map((u) => u.id);
    to.forEach((u) => notify(d, u, `${c.name} ${r.optOut ? 'asked to stop WhatsApp messages' : 'wrote on WhatsApp'}.`, '/whatsapp', `wa-${id}`));
  };
  const simulateChatReply = (id, text = 'Thanks for the update. Can we talk tomorrow?') => setDb((p) => { const d = { ...p }; customerWrites(d, id, text); return d; });
  // A number that isn't a contact writes in. It goes to a salesperson in turn, or waits unassigned.
  const simulateNewChat = () => {
    const wa = waOf(db.settings);
    const sales = db.users.filter((u) => u.active && u.role === 'sales');
    const openOf = (u) => db.conversations.filter((c) => c.kind === 'whatsapp' && c.ownerId === u.id && (c.status || 'Open') === 'Open').length;
    const ownerId = wa.assign === 'round' && sales.length ? [...sales].sort((a, b) => openOf(a) - openOf(b) || a.id.localeCompare(b.id))[0].id : '';
    const phone = `+44 7700 900${String(Math.floor(Math.random() * 900) + 100)}`;
    const id = uid('cv');
    setDb((p) => {
      const d = { ...p, conversations: [{ id, kind: 'whatsapp', contactId: '', name: phone, phone, ownerId, createdAt: new Date().toISOString(), reads: {}, messages: [], status: 'Open' }, ...p.conversations] };
      customerWrites(d, id, 'Hi, I saw your website. What is the price for a team of ten?');
      return d;
    });
    return id;
  };
  const setConversationStatus = (id, status) => setDb((p) => {
    const d = { ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, status } : c)) };
    stamp(d, status === 'Resolved' ? 'Resolve' : 'Reopen', 'conversations', id, p.conversations.find((c) => c.id === id)?.name || 'Chat');
    return d;
  });
  const saveConnection = (id, patch) => setDb((p) => {
    const cur = p.connections?.[id] || {};
    const d = { ...p, connections: { ...p.connections, [id]: { ...cur, ...patch } } };
    if (patch.connected !== undefined) stamp(d, patch.connected ? 'Connect' : 'Disconnect', 'connections', id, id, [{ field: 'System', from: cur.provider || '—', to: patch.provider || cur.provider || '—' }]);
    return d;
  });
  const syncOne = (d, key, trigger) => {
    const app = APPS.find((a) => a.k === key);
    const conn = d.connections?.[key];
    if (!app || !conn?.connected) return null;
    const run = runSimulatedSync(d, app, conn, trigger, { applyUpdate, userId: me?.id });
    stamp(d, 'Sync', 'connections', key, `${app.name}: ${conn.provider}`, [{ field: 'Simulated', from: '—', to: run.status === 'Failed' ? 'Failed' : `${run.inCount} in, ${run.outCount} out` }]);
    if (run.status === 'Failed') d.users.filter((u) => u.role === 'admin' && u.active).forEach((u) => notify(d, u.id, `${app.name} sync failed: ${conn.provider} could not be reached`, '/connections'));
    return run;
  };
  const revalueDeals = (ids) => setDb((p) => {
    const d = { ...p };
    d.deals = p.deals.map((x) => {
      if (!ids.includes(x.id) || !x.currency || !rateOf(x.currency)) return x;
      const rate = rateOf(x.currency);
      return { ...x, value: (x.value * (x.fxRate || rate)) / rate, fxRate: rate };
    });
    stamp(d, 'Update', 'deals', 'revalue', `${ids.length} deals moved to today's rates`);
    return d;
  });
  const patchDb = (patch, field, label) => setDb((p) => {
    const d = { ...p, ...patch };
    stamp(d, 'Update', 'forecast', field, label, [{ field, from: '—', to: 'Changed' }]);
    return d;
  });
  // Keeps one saved copy a week, for each period, so changes can be listed. Quietly, as this isn't anyone's edit.
  const saveForecastSnapshot = (snap) => setDb((p) => {
    const same = (p.forecastSnapshots || []).filter((s) => s.period === snap.period).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (same && (Date.now() - new Date(same.date).getTime()) / 864e5 < 7) return p;
    return { ...p, forecastSnapshots: [snap, ...(p.forecastSnapshots || [])].slice(0, 12) };
  });
  const runSync = (key, trigger = 'Manual') => setDb((p) => { const d = { ...p }; syncOne(d, key, trigger); return d; });
  const testWebhook = (id) => setDb((p) => { const h = (p.webhooks || []).find((x) => x.id === id); return h ? { ...p, webhookLog: [deliveryOf(h, 'test', 'test', { id: 'sample', name: 'Sample record' }, 'Sample record'), ...(p.webhookLog || [])].slice(0, 200) } : p; });
  const resendWebhook = (id) => setDb((p) => ({ ...p, webhookLog: (p.webhookLog || []).map((x) => (x.id === id ? retryDelivery(x, true) : x)) }));
  const resolveConflict = (id, pick) => setDb((p) => {
    const c = (p.syncConflicts || []).find((x) => x.id === id);
    if (!c) return p;
    const d = { ...p, syncConflicts: p.syncConflicts.filter((x) => x.id !== id) };
    if (pick === 'theirs') applyUpdate(d, c.entity, c.recId, { [c.field]: c.theirs }, 'Sync');
    stamp(d, 'Update', 'connections', c.appKey, `${c.label}: ${c.fieldLabel}`, [{ field: 'Conflict', from: 'Both changed', to: pick === 'theirs' ? `Took ${c.provider}'s value` : 'Kept the CRM value' }]);
    return d;
  });
  const resolveIssue = (id, action) => setDb((p) => {
    const x = (p.syncIssues || []).find((i) => i.id === id);
    if (!x) return p;
    const d = { ...p, syncIssues: p.syncIssues.filter((i) => i.id !== id) };
    if (action === 'add' && x.kind === 'leads') {
      const owner = p.users.find((u) => u.role === 'sales' && u.active);
      const lead = { id: uid('le'), name: x.payload.name, company: x.payload.company, email: '', phone: '', status: 'New', source: x.provider, ownerId: owner?.id, expected: 0, createdAt: new Date().toISOString() };
      d.leads = [{ ...lead, score: scoreLead(lead) }, ...p.leads];
      stamp(d, 'Create', 'leads', lead.id, lead.name, [{ field: 'From', from: '—', to: `${x.provider}, added by hand` }]);
    }
    return d;
  });
  const setPassword = (hash, id = me?.id) => setDb((p) => {
    // Keeps the last few, so the same password can't be used again straight away.
    const d = { ...p, users: p.users.map((u) => (u.id === id ? { ...u, passHash: hash, passHistory: [u.passHash || demoHash(DEMO_PASSWORD), ...(u.passHistory || [])].slice(0, 5), passChangedAt: new Date().toISOString(), mustChangePassword: false } : u)) };
    stamp(d, 'Update', 'users', id, userName(id, p), [{ field: 'Password', from: '••••', to: 'Changed' }]);
    return d;
  });
  // The people signed in now stay signed in, so restoring old data doesn't throw them out.
  // Brings back only what was chosen: whole kinds of records, or single deleted records.
  const restorePartial = (data, kinds, records, label) => setDb((p) => {
    const d = { ...p };
    const names = [];
    kinds.forEach((k) => { if (Array.isArray(data[k])) { d[k] = data[k]; names.push(`all ${k}`); } });
    Object.entries(records || {}).forEach(([k, ids]) => {
      if (kinds.includes(k) || !ids.length) return;
      const back = (data[k] || []).filter((r) => ids.includes(r.id));
      d[k] = [...back, ...(d[k] || []).filter((r) => !ids.includes(r.id))];
      names.push(`${back.length} ${k}`);
    });
    stamp(d, 'Restore', 'backup', label, `From backup: ${label}`, [{ field: 'Brought back', from: '—', to: names.join(', ') || 'nothing' }]);
    return d;
  });
  const restoreBackup = (data) => { setDb((p) => scored({ ...seed(), ...data, sessions: p.sessions, loginLog: p.loginLog, settings: { ...seed().settings, ...data.settings }, permissions: migratePermissions(data.permissions) })); };

  const companyName = (id, d = db) => d.companies.find((c) => c.id === id)?.name || '—';
  const stamp = (d, action, entity, entityId, label, changes = []) => {
    d.audit = [{ id: uid('au'), at: new Date().toISOString(), userId: me?.id, action, entity, entityId, label, changes }, ...d.audit].slice(0, 3000);
  };
  const pretty = (d, k, v) => {
    if (k === 'ownerId' || k === 'userId') return userName(v, d);
    if (k === 'companyId') return companyName(v, d);
    if (Array.isArray(v)) return v.length && typeof v[0] !== 'object' ? v.join(', ') : `${v.length} item(s)`;
    if (v && typeof v === 'object') return 'Changed';
    if (v === '' || v == null) return '—';
    return String(v);
  };
  const applyUpdate = (d, entity, id, rawPatch, action = 'Update') => {
    const cur = d[entity].find((r) => r.id === id);
    if (!cur) return;
    const patch = entity === 'cases' ? caseStatusPatch(cur, rawPatch) : rawPatch;
    const changes = Object.keys(patch).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(patch[k])).map((k) => ({ field: humanize(k), from: pretty(d, k, cur[k]), to: pretty(d, k, patch[k]) }));
    if (!changes.length) return;
    d[entity] = d[entity].map((r) => (r.id === id ? { ...r, ...patch } : r));
    stamp(d, action, entity, id, recordLabel(entity, { ...cur, ...patch }), changes);
    // People watching this record hear about the change, for example an invoice being paid.
    if (WATCH_ROUTE[entity]) Object.entries(d.prefs || {}).forEach(([who, pr]) => { if ((pr?.watch || []).includes(`${entity}:${id}`)) notify(d, who, `${recordLabel(entity, { ...cur, ...patch })} changed: ${changes.slice(0, 2).map((c) => `${c.field} is now ${c.to}`).join(', ')}`, WATCH_ROUTE[entity], `watch-${entity}-${id}-${who}-${Date.now()}`, true); });
    if (entity === 'leads') d.leads = d.leads.map((r) => (r.id === id ? { ...r, score: scoreLead(r) } : r));
    const row = d[entity].find((r) => r.id === id);
    const changed = (k) => patch[k] !== undefined && patch[k] !== cur[k];
    if (entity === 'activities' && changed('status') && patch.status === 'done') spawnRepeat(d, row);
    if (entity === 'leads' && changed('status')) runRules(d, 'lead.status', row, entity);
    if (entity === 'deals' && changed('status') && patch.status === 'won') runRules(d, 'deal.won', row, entity);
    if (entity === 'deals' && changed('status') && patch.status === 'lost') runRules(d, 'deal.lost', row, entity);
    if (entity === 'deals' && changed('stage')) runRules(d, 'deal.stage', row, entity);
    if (entity === 'invoices' && changed('status') && patch.status === 'Paid') runRules(d, 'invoice.paid', row, entity);
    if (entity === 'shipments' && changed('status')) runRules(d, 'shipment.status', row, entity);
    // "A field changes" workflows: the chosen field changed, to the chosen value if one was set.
    if (FIELD_TRIGGER[entity]) (d.automations || []).filter((r) => r.active && r.trigger === FIELD_TRIGGER[entity] && r.field && changed(r.field) && (!String(r.to ?? '').trim() || String(row[r.field] ?? '').toLowerCase() === String(r.to).trim().toLowerCase()) && ruleMatches(r, row) && canRerun(r, row.id)).forEach((rule) => fireRule(d, rule, row, entity));
  };

  const spawnRepeat = (d, row) => {
    if (!row.repeat || row.repeat === 'Never') return;
    const { id: _old, ...rest } = row;
    d.activities = [{ ...rest, id: uid('ac'), status: 'todo', due: nextDue(row.due, row.repeat), subtasks: (row.subtasks || []).map((x) => ({ ...x, done: false })), createdAt: new Date().toISOString() }, ...d.activities];
  };
  const create = (entity, rec) => {
    const r = { ...rec, id: rec.id || uid(entity.slice(0, 2)), createdAt: rec.createdAt || new Date().toISOString() };
    if (entity === 'leads') r.score = scoreLead(r);
    setDb((p) => {
      const d = { ...p, [entity]: [r, ...p[entity]] };
      stamp(d, 'Create', entity, r.id, recordLabel(entity, r));
      if (CREATE_TRIGGER[entity]) runRules(d, CREATE_TRIGGER[entity], r, entity);
      if (entity === 'activities' && r.status === 'done') spawnRepeat(d, r);
      return d;
    });
    return r;
  };
  const update = (entity, id, patch, action) => setDb((p) => {
    const d = { ...p };
    const rules = myFieldRules?.[ENTITY_FIELD[entity]];
    const allowed = rules ? Object.fromEntries(Object.entries(patch).filter(([k]) => !rules[k])) : patch;
    if (Object.keys(allowed).length) applyUpdate(d, entity, id, allowed, action);
    return d;
  });
  const remove = (entity, id) => {
    const at = db[entity]?.findIndex((r) => r.id === id);
    const cur = db[entity]?.[at];
    if (cur) {
      lastDelete.current = {
        at: Date.now(),
        restore: () => setDb((p) => {
          if (p[entity].some((r) => r.id === id)) return p;
          const list = [...p[entity]];
          list.splice(at, 0, cur);
          const d = { ...p, [entity]: list, recycleBin: (p.recycleBin || []).filter((x) => !(x.entity === entity && x.rec.id === id)) };
          stamp(d, 'Restore', entity, id, recordLabel(entity, cur));
          return d;
        }),
      };
    }
    setDb((p) => {
      const found = p[entity].find((r) => r.id === id);
      const d = { ...p, [entity]: p[entity].filter((r) => r.id !== id) };
      if (found) {
        stamp(d, 'Delete', entity, id, recordLabel(entity, found));
        d.recycleBin = [{ id: uid('bin'), entity, label: recordLabel(entity, found), rec: found, at: new Date().toISOString(), by: me?.id }, ...(p.recycleBin || [])].slice(0, 300);
      }
      return d;
    });
  };
  const optionsOf = (key) => db.picklists?.[key] || PICKLIST_BY_KEY[key].defaults;
  const listIn = (p, key) => p.picklists?.[key] || PICKLIST_BY_KEY[key].defaults;
  const addOption = (key, value) => setDb((p) => {
    const d = { ...p, picklists: { ...p.picklists, [key]: PICKLIST_BY_KEY[key].numeric ? [...listIn(p, key), value].sort((a, b) => a - b) : [...listIn(p, key), value] } };
    stamp(d, 'Update', 'picklists', key, PICKLIST_BY_KEY[key].label, [{ field: 'Option added', from: '—', to: value }]);
    return d;
  });
  const setWord = (bucket, key, name, label) => setDb((p) => {
    const next = { ...p[bucket] };
    const from = next[key];
    if (name && name !== key) next[key] = name; else delete next[key];
    const d = { ...p, [bucket]: next };
    stamp(d, 'Update', bucket, key, label, [{ field: 'Name', from: from || key, to: next[key] || key }]);
    return d;
  });
  const setLabel = (word, name) => setWord('labels', word, name, word);
  const setTitle = (key, name) => setWord('titles', key, name, name || key);
  const renameOption = (key, from, to) => {
    // The CRM's logic relies on built-in values, so only the word people see changes.
    if (PICKLIST_BY_KEY[key].locked?.includes(from)) { setLabel(from, to); return; }
    renameStored(key, from, to);
  };
  const renameStored = (key, from, to) => setDb((p) => {
    const d = { ...p, picklists: { ...p.picklists, [key]: listIn(p, key).map((o) => (o === from ? to : o)) } };
    PICKLIST_BY_KEY[key].used.forEach(([entity, field]) => { d[entity] = d[entity].map((r) => (r[field] === from ? { ...r, [field]: to } : r)); });
    stamp(d, 'Update', 'picklists', key, PICKLIST_BY_KEY[key].label, [{ field: 'Option renamed', from, to }]);
    return d;
  });
  const removeOption = (key, value) => setDb((p) => {
    const d = { ...p, picklists: { ...p.picklists, [key]: listIn(p, key).filter((o) => o !== value) } };
    stamp(d, 'Update', 'picklists', key, PICKLIST_BY_KEY[key].label, [{ field: 'Option removed', from: value, to: '—' }]);
    return d;
  });
  const renameOrg = (id, name) => setOrgs((l) => l.map((o) => (o.id === id ? { ...o, name } : o)));
  const updateSettings = (patch) => {
    if (patch.companyName) renameOrg(orgId, patch.companyName);
    setDb((p) => {
      const changes = Object.keys(patch).filter((k) => p.settings[k] !== patch[k]).map((k) => ({ field: humanize(k), from: p.settings[k] == null ? '—' : typeof p.settings[k] === 'object' ? 'Earlier setup' : String(p.settings[k]), to: typeof patch[k] === 'object' ? 'Changed' : String(patch[k]) }));
      const d = { ...p, settings: { ...p.settings, ...patch } };
      if (changes.length) stamp(d, 'Update', 'settings', 'settings', 'System settings', changes);
      return d;
    });
  };
  const addOrg = ({ name, currency, supportEmail, template }) => {
    const org = { id: uid('org'), name, createdAt: new Date().toISOString() };
    const d = applyTemplate(blankCompany(name, me), template);
    d.settings = { ...d.settings, currency, supportEmail: supportEmail || '' };
    stamp(d, 'Create', 'settings', org.id, `Company ${name}`);
    setOrgs((l) => [...l, org]);
    setOrgId(org.id);
    setDb(d);
  };
  // An admin can open every company, including ones created by another admin.
  const loadOrgFor = (org) => {
    const next = loadOrg(org);
    return me && !next.users.some((u) => u.id === me.id) ? { ...next, users: [...next.users, { ...me, teamId: null }] } : next;
  };
  const switchOrg = (id) => {
    const org = orgs.find((o) => o.id === id);
    if (!org || id === orgId) return;
    setDb(loadOrgFor(org));
    setOrgId(id);
  };
  // Deletes the open company and moves to the next one. The last company can't be deleted.
  const deleteOrg = () => {
    const rest = orgs.filter((o) => o.id !== orgId);
    if (!rest.length) return null;
    const d = loadOrgFor(rest[0]);
    stamp(d, 'Delete', 'settings', orgId, `Company ${db.settings.companyName}`);
    try { localStorage.removeItem(orgKey(orgId)); } catch { /* storage may be blocked */ }
    setOrgs(rest);
    setOrgId(rest[0].id);
    setDb(d);
    return rest[0];
  };

  // Each person chooses which kinds of alert they get. Security alerts and messages sent to them directly always arrive.
  const notify = (d, to, text, link, key, always) => {
    const prefs = alertPrefs(d.prefs?.[to]?.alerts);
    const kind = kindOf(link);
    if (!always && !channelOn(prefs, kind, 'bell')) return;
    const quiet = inQuietHours(prefs, new Date(), kind);
    const also = quiet ? [] : [channelOn(prefs, kind, 'email') && 'Email', channelOn(prefs, kind, 'push') && 'Phone push'].filter(Boolean);
    d.notifications = [{ id: uid('n'), to, at: new Date().toISOString(), text, link, read: false, key, also }, ...d.notifications.filter((n) => !(key && n.key === key && n.to === to && !n.read))];
    // While someone is away, their backup gets a copy, so nothing waits for their return.
    if (isAway(prefs) && prefs.away.to !== to && d.users.some((u) => u.id === prefs.away.to && u.active)) {
      const name = d.users.find((u) => u.id === to)?.name || 'a colleague';
      d.notifications = [{ id: uid('n'), to: prefs.away.to, at: new Date().toISOString(), text: `For ${name}, who is away: ${text}`, link, read: false, forwardedFrom: to }, ...d.notifications];
    }
  };
  const digestFor = (d, id) => {
    const now = today();
    const tasks = (d.activities || []).filter((a) => a.ownerId === id && a.status !== 'done' && a.due && a.due < now).length;
    const closing = (d.deals || []).filter((x) => x.ownerId === id && x.status === 'open' && x.closeDate >= now && x.closeDate <= addDays(7)).length;
    const unread = d.notifications.filter((n) => n.to === id && !n.read).length;
    return `Your day: ${tasks} overdue ${tasks === 1 ? 'task' : 'tasks'}, ${closing} ${closing === 1 ? 'deal' : 'deals'} closing this week, ${unread} unread ${unread === 1 ? 'alert' : 'alerts'}.`;
  };
  const sendDigest = () => setDb((p) => { const d = { ...p }; notify(d, me.id, digestFor(d, me.id), '/tasks', `digest-${me.id}`); return d; });
  const snoozeAlert = (id, until) => setDb((p) => ({ ...p, notifications: p.notifications.map((n) => (n.id === id ? { ...n, snoozeUntil: until, read: until ? false : n.read } : n)) }));
  const notifyPeople = (to, text, link) => setDb((p) => {
    const d = { ...p };
    to.forEach((id) => notify(d, id, `${me.name}: ${text}`, link, undefined, true));
    stamp(d, 'Notify', 'notifications', uid('n'), text.slice(0, 80));
    return d;
  });
  const pushNotification = (to, text, link) => setDb((p) => { const d = { ...p }; notify(d, to, text, link); return d; });
  // Routine state with no business meaning, so it stays out of the audit log.
  const patchQuiet = (entity, id, patch) => setDb((p) => ({ ...p, [entity]: p[entity].map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const sendMessage = (id, text, status, file, extra = {}) => setDb((p) => {
    const at = new Date().toISOString();
    const d = { ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, messages: [...c.messages, { id: uid('msg'), at, by: me.id, text, status, ...(c.kind === 'whatsapp' ? { net: whatsappPlan() } : {}), ...(file ? { file: { name: file.name, size: file.size, ...(file.data ? { data: file.data } : {}) } } : {}), ...extra }], reads: { ...c.reads, [me.id]: at } } : c)) };
    // One bell entry per unread chat, so a burst of messages doesn't fill the list.
    const conv = p.conversations.find((c) => c.id === id);
    if (conv?.kind === 'team') conv.members.filter((u) => u !== me.id).forEach((u) => {
      const link = `/messages?open=${id}`;
      // A mention always gets through, even if the person muted this chat or chat alerts.
      if (extra.mentions?.includes(u)) notify(d, u, `${me.name} mentioned you: ${(text || '').slice(0, 80)}`, link, `mention-${uid('m')}`, true);
      else if (!conv.muted?.[u]) notify(d, u, `${me.name}: ${(text || file?.name || '').slice(0, 80)}`, link, `chat-${id}`);
    });
    return d;
  });
  const patchChatMessage = (id, msgId, patch) => setDb((p) => ({ ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) } : c)) }));
  const markConversationRead = (id) => setDb((p) => ({ ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, reads: { ...c.reads, [me.id]: new Date().toISOString() } } : c)) }));
  const openConversation = (kind, x) => {
    const found = db.conversations.find((c) => (kind === 'team' ? c.kind === 'team' && !c.group && c.members.includes(me.id) && c.members.includes(x.id) : c.kind === 'whatsapp' && (x.id ? c.contactId === x.id : c.phone === x.phone) && c.ownerId === me.id));
    if (found) return found.id;
    const rec = { id: uid('cv'), kind, createdAt: new Date().toISOString(), reads: {}, messages: [], ...(kind === 'team' ? { members: [me.id, x.id] } : { contactId: x.id, name: x.name, phone: x.phone, ownerId: me.id }) };
    setDb((p) => ({ ...p, conversations: [rec, ...p.conversations] }));
    return rec.id;
  };
  const createGroup = (name, ids, extra = {}) => {
    const rec = { id: uid('cv'), kind: 'team', group: true, name, members: [me.id, ...ids], createdBy: me.id, createdAt: new Date().toISOString(), reads: {}, messages: [], ...extra };
    setDb((p) => ({ ...p, conversations: [rec, ...p.conversations] }));
    return rec.id;
  };
  const markRead = (ids) => setDb((p) => ({ ...p, notifications: p.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) }));
  // Opening an alert also notes it was opened, so people can see which alerts they actually use.
  const openAlert = (id) => setDb((p) => ({ ...p, notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true, openedAt: n.openedAt || new Date().toISOString() } : n)) }));

  const meetingLink = (id) => `/meetings?open=${id}`;
  const logMeeting = (d, r, patch, entry, changes = []) => {
    d.meetingRequests = d.meetingRequests.map((x) => (x.id === r.id ? { ...x, ...patch, history: [...x.history, { at: new Date().toISOString(), by: me.id, ...entry }] } : x));
    stamp(d, entry.action, 'meetingRequests', r.id, r.topic, changes);
  };
  const tellMeetingPeople = (d, r, text, skip) => meetingPeople(r).filter((u) => u !== me.id && u !== skip).forEach((u) => notify(d, u, text, meetingLink(r.id)));
  // Only the person it's waiting on can answer, and only while it's still waiting.
  const waitingOnMe = (p, id) => { const r = p.meetingRequests.find((x) => x.id === id); return r?.status === 'Pending' && r.toId === me.id ? r : null; };
  const requestMeeting = ({ toId, topic, note, preferredAt, minutes }) => {
    const at = new Date().toISOString();
    const r = { id: uid('mr'), requestedBy: me.id, toId, topic, note: note || '', preferredAt, minutes, status: 'Pending', createdAt: at, history: [{ at, by: me.id, action: 'Requested', toId }] };
    setDb((p) => {
      const d = { ...p, meetingRequests: [r, ...p.meetingRequests] };
      stamp(d, 'Request', 'meetingRequests', r.id, topic, [{ field: 'With', from: '—', to: userName(toId, p) }]);
      notify(d, toId, `${me.name} asked to meet: "${topic}"`, meetingLink(r.id));
      return d;
    });
    return r;
  };
  const passMeeting = (id, toId, note) => setDb((p) => {
    const r = waitingOnMe(p, id);
    if (!r) return p;
    const d = { ...p };
    logMeeting(d, r, { toId }, { action: 'Passed', toId, note }, [{ field: 'With', from: me.name, to: userName(toId, p) }]);
    notify(d, toId, `${me.name} passed a meeting request to you: "${r.topic}"`, meetingLink(id));
    tellMeetingPeople(d, r, `${me.name} passed "${r.topic}" to ${userName(toId, p)}.`, toId);
    return d;
  });
  const declineMeeting = (id, note) => setDb((p) => {
    const r = waitingOnMe(p, id);
    if (!r) return p;
    const d = { ...p };
    logMeeting(d, r, { status: 'Declined' }, { action: 'Declined', note });
    tellMeetingPeople(d, r, `${me.name} declined the meeting "${r.topic}".`);
    return d;
  });
  const acceptMeeting = (id, { start, end, location, note }) => setDb((p) => {
    const r = waitingOnMe(p, id);
    if (!r) return p;
    const ev = { id: uid('ev'), title: r.topic, category: 'Meeting', start, end, location: location || '', notes: note || '', companyId: '', ownerId: me.id, attendeeIds: [r.requestedBy], requestId: id, createdAt: new Date().toISOString() };
    const d = { ...p, events: [ev, ...p.events] };
    stamp(d, 'Create', 'events', ev.id, ev.title);
    logMeeting(d, r, { status: 'Accepted', scheduledAt: start, eventId: ev.id, acceptedBy: me.id }, { action: 'Accepted', note }, [{ field: 'Time', from: '—', to: fmtDT(start) }]);
    tellMeetingPeople(d, r, `${me.name} accepted "${r.topic}" for ${fmtDT(start)}.`);
    return d;
  });
  const withdrawMeeting = (id) => setDb((p) => {
    const r = p.meetingRequests.find((x) => x.id === id);
    if (r?.status !== 'Pending' || r.requestedBy !== me.id) return p;
    const d = { ...p };
    logMeeting(d, r, { status: 'Withdrawn' }, { action: 'Withdrawn' });
    tellMeetingPeople(d, r, `${me.name} withdrew the meeting request "${r.topic}".`);
    return d;
  });
  // A meeting on the calendar was moved (start is the new time) or deleted (no start).
  const meetingEventChanged = (ev, start) => setDb((p) => {
    const d = { ...p };
    const r = p.meetingRequests.find((x) => x.id === ev.requestId);
    if (r) logMeeting(d, r, start ? { scheduledAt: start } : { status: 'Cancelled' }, { action: start ? 'Rescheduled' : 'Cancelled' });
    const text = start ? `${me.name} moved "${ev.title}" to ${fmtDT(start)}.` : `${me.name} cancelled "${ev.title}".`;
    [ev.ownerId, ...(ev.attendeeIds || [])].filter((u) => u !== me.id).forEach((u) => notify(d, u, text, r ? meetingLink(r.id) : '/calendar'));
    return d;
  });

  const moveDeal = (id, stageId) => setDb((p) => {
    const d = { ...p };
    const st = STAGES.find((s) => s.id === stageId);
    const cur = p.deals.find((x) => x.id === id);
    const at = new Date().toISOString();
    const patch = { stage: stageId, status: stageId === 'won' ? 'won' : 'open', probability: st.prob, lostReason: '', stageAt: at, stageLog: [...(cur?.stageLog || [{ stage: cur?.stage, at: cur?.createdAt && cur.createdAt < at ? cur.createdAt : at, by: cur?.ownerId }]), { stage: stageId, at, by: me?.id }] };
    if (stageId === 'won') patch.closeDate = today();
    applyUpdate(d, 'deals', id, patch);
    return d;
  });
  const markLost = (id, reason) => {
    const cur = db.deals.find((x) => x.id === id);
    const at = new Date().toISOString();
    update('deals', id, { status: 'lost', probability: 0, lostReason: reason, closeDate: today(), stageLog: [...(cur?.stageLog || [{ stage: cur?.stage, at: cur?.createdAt && cur.createdAt < at ? cur.createdAt : at, by: cur?.ownerId }]), { stage: 'lost', at, by: me?.id }] });
  };
  const setStageRequired = (id, required) => setDb((p) => ({ ...p, stages: p.stages.map((s) => (s.id === id ? { ...s, required } : s)) }));
  // Adds a sequence's steps as dated tasks on each record.
  const startSequence = (seqId, kind, records) => setDb((p) => {
    const seq = p.sequences.find((s) => s.id === seqId);
    if (!seq) return p;
    const d = { ...p };
    const entity = kind === 'lead' ? 'leads' : 'deals';
    const added = [];
    records.forEach((r) => {
      const label = recordLabel(entity, r);
      const fill = (x) => x.replace(/\{name\}/g, (r.name || label).split(' ')[0]);
      seq.steps.forEach((st) => {
        const type = p.activityTypes.find((t) => t.name.toLowerCase().includes(String(st.type).toLowerCase())) || p.activityTypes[0];
        added.push({ id: uid('ac'), typeId: type?.id, summary: fill(st.text), due: addDays(Number(st.day) || 0), ownerId: r.ownerId || me.id, note: `Step in the sequence "${seq.name}".`, status: 'todo', priority: 'Medium', tag: 'Sales', relatedType: kind, relatedId: r.id, relatedLabel: label, createdAt: new Date().toISOString() });
      });
      stamp(d, 'Automation', entity, r.id, label, [{ field: 'Sequence started', from: '—', to: seq.name }]);
    });
    d.activities = [...added, ...d.activities];
    return d;
  });
  const reopen = (id) => update('deals', id, { status: 'open', stage: db.stages[0].id, probability: db.stages[0].prob, lostReason: '' });

  const logStage = (d, label, changes) => stamp(d, 'Update', 'stages', 'stages', label, changes);
  // New stages go before Won, which always stays last.
  const addStage = (name, prob) => setDb((p) => {
    const d = { ...p, stages: [...p.stages.slice(0, -1), { id: uid('st'), name, prob }, p.stages[p.stages.length - 1]] };
    logStage(d, name, [{ field: 'Stage added', from: '—', to: `${name} (${prob}%)` }]);
    return d;
  });
  const updateStage = (id, name, prob) => setDb((p) => {
    const cur = p.stages.find((s) => s.id === id);
    const d = { ...p, stages: p.stages.map((s) => (s.id === id ? { ...s, name, prob } : s)) };
    // Open deals still on the stage's old probability follow it; ones set by hand stay as they are.
    if (prob !== cur.prob) d.deals = p.deals.map((x) => (x.stage === id && x.status === 'open' && x.probability === cur.prob ? { ...x, probability: prob } : x));
    logStage(d, name, [{ field: 'Stage changed', from: `${cur.name} (${cur.prob}%)`, to: `${name} (${prob}%)` }]);
    return d;
  });
  const moveStage = (id, step) => setDb((p) => {
    const i = p.stages.findIndex((s) => s.id === id);
    const j = i + step;
    if (id === 'won' || j < 0 || j >= p.stages.length - 1) return p;
    const stages = [...p.stages];
    [stages[i], stages[j]] = [stages[j], stages[i]];
    const d = { ...p, stages };
    logStage(d, stages[j].name, [{ field: 'Stage order', from: `Position ${i + 1}`, to: `Position ${j + 1}` }]);
    return d;
  });
  // Deals on a removed stage move to another, so none is left without a stage.
  const removeStage = (id, toId) => setDb((p) => {
    const cur = p.stages.find((s) => s.id === id);
    const to = p.stages.find((s) => s.id === toId);
    if (id === 'won' || p.stages.length < 3) return p;
    const d = { ...p, stages: p.stages.filter((s) => s.id !== id), deals: p.deals.map((x) => (x.stage === id ? { ...x, stage: toId, probability: x.status === 'open' ? to.prob : x.probability } : x)) };
    logStage(d, cur.name, [{ field: 'Stage removed', from: cur.name, to: to ? `Deals moved to ${to.name}` : '—' }]);
    return d;
  });

  const addChatter = (key, kind, text) => setDb((p) => ({ ...p, chatter: { ...p.chatter, [key]: [{ id: uid('ch'), at: new Date().toISOString(), by: me.id, kind, text }, ...(p.chatter[key] || [])] } }));

  const moveRecord = (d, t) => {
    applyUpdate(d, RECORD_ENTITY[t.recordType], t.recordId, { ownerId: t.toId }, 'Transfer');
    if (!t.includeRelated) return;
    if (t.recordType === 'company') {
      d.contacts.filter((c) => c.companyId === t.recordId).forEach((c) => applyUpdate(d, 'contacts', c.id, { ownerId: t.toId }, 'Transfer'));
      d.deals.filter((x) => x.companyId === t.recordId && x.status === 'open').forEach((x) => applyUpdate(d, 'deals', x.id, { ownerId: t.toId }, 'Transfer'));
    }
    d.activities.filter((a) => a.relatedId === t.recordId && a.status !== 'done').forEach((a) => applyUpdate(d, 'activities', a.id, { ownerId: t.toId }, 'Transfer'));
    d.followups.filter((f) => f.relatedId === t.recordId && f.status === 'open').forEach((f) => applyUpdate(d, 'followups', f.id, { ownerId: t.toId }, 'Transfer'));
  };
  const requestTransfer = ({ recordType, recordId, recordLabel, fromId, toId, reason, includeRelated }) => {
    const direct = can('transfers', 'direct') || !db.settings.transferNeedsApproval;
    const at = new Date().toISOString();
    const t = { id: uid('tr'), recordType, recordId, recordLabel, fromId, toId, reason, includeRelated, status: direct ? 'Approved' : 'Pending', requestedBy: me.id, requestedAt: at, ...(direct ? { decidedBy: me.id, decidedAt: at, note: 'Direct transfer.' } : {}) };
    setDb((p) => {
      const d = { ...p, transfers: [t, ...p.transfers] };
      if (direct) {
        moveRecord(d, t);
        notify(d, toId, `${me.name} transferred "${recordLabel}" to you.`, '/transfers');
        if (fromId !== me.id) notify(d, fromId, `${me.name} moved "${recordLabel}" to ${userName(toId, p)}.`, '/transfers');
      } else {
        stamp(d, 'Request', 'transfers', t.id, recordLabel, [{ field: 'Owner', from: userName(fromId, p), to: userName(toId, p) }]);
        const team = p.users.find((u) => u.id === fromId)?.teamId;
        const mgr = p.teams.find((x) => x.id === team)?.managerId || p.users.find((u) => u.role === 'admin')?.id;
        notify(d, mgr, `${me.name} asked to transfer "${recordLabel}" to ${userName(toId, p)}.`, '/transfers');
      }
      return d;
    });
    return direct;
  };
  const decideTransfer = (id, approve, note = '') => setDb((p) => {
    const t = p.transfers.find((x) => x.id === id);
    if (!t || t.status !== 'Pending') return p;
    const next = { ...t, status: approve ? 'Approved' : 'Rejected', decidedBy: me.id, decidedAt: new Date().toISOString(), note };
    const d = { ...p, transfers: p.transfers.map((x) => (x.id === id ? next : x)) };
    if (approve) moveRecord(d, next);
    else stamp(d, 'Reject', 'transfers', id, t.recordLabel, [{ field: 'Transfer', from: 'Pending', to: 'Rejected' }]);
    [t.fromId, t.toId, t.requestedBy].filter((v, i, a) => a.indexOf(v) === i).forEach((u) => notify(d, u, `Transfer of "${t.recordLabel}" was ${approve ? 'approved' : 'rejected'} by ${me.name}.`, '/transfers'));
    return d;
  });

  const stockShift = (p, items, sign, reason, date) => ({
    products: p.products.map((x) => { const q = items.filter((i) => i.productId === x.id).reduce((a, i) => a + i.qty, 0); return q && x.tracked ? { ...x, stock: Math.max(0, x.stock + sign * q) } : x; }),
    stockMoves: [...items.filter((i) => p.products.find((x) => x.id === i.productId)?.tracked).map((i) => ({ id: uid('m'), productId: i.productId, type: sign < 0 ? 'Delivery' : 'Receipt', qty: sign * i.qty, reason, userId: me.id, warehouseId: p.products.find((x) => x.id === i.productId)?.warehouseId, date })), ...p.stockMoves],
  });
  const placeOrder = (rec) => {
    const r = { ...rec, id: uid('o'), number: `SO-${7100 + db.orders.length}`, createdAt: new Date().toISOString() };
    setDb((p) => {
      const d = { ...p, orders: [r, ...p.orders], ...stockShift(p, r.items, -1, `Sales order ${r.number}`, r.date) };
      stamp(d, 'Create', 'orders', r.id, r.number);
      runRules(d, 'order.created', r, 'orders');
      return d;
    });
    return r;
  };
  const cancelOrder = (id) => setDb((p) => {
    const o = p.orders.find((x) => x.id === id);
    if (!o || o.status === 'Cancelled') return p;
    const d = { ...p, ...stockShift(p, o.items, 1, `Cancelled ${o.number}`, today()) };
    applyUpdate(d, 'orders', id, { status: 'Cancelled' });
    return d;
  });
  const adjustStock = (productId, qty, type, reason, whId) => setDb((p) => {
    const cur = p.products.find((x) => x.id === productId);
    const at = whId || cur.warehouseId;
    const d = { ...p, stockMoves: [{ id: uid('m'), productId, type, qty, reason, userId: me.id, warehouseId: at, date: today() }, ...p.stockMoves] };
    applyUpdate(d, 'products', productId, withDelta(cur, at, qty));
    return d;
  });
  const transferStock = ({ productId, from, to, qty, note, date }) => {
    const number = nextNo(db.stockTransfers || [], 'TR-', 1001);
    setDb((p) => {
      const cur = p.products.find((x) => x.id === productId);
      const out = { ...cur, ...withDelta(cur, from, -qty) };
      const done = { ...out, ...withDelta(out, to, qty) };
      const r = { id: uid('tr'), number, productId, name: cur.name, from, to, qty, note, date, userId: me.id, createdAt: new Date().toISOString() };
      const move = (warehouseId, n) => ({ id: uid('m'), productId, type: 'Transfer', qty: n, reason: `Transfer ${number}`, userId: me.id, warehouseId, date });
      const d = { ...p, stockTransfers: [r, ...(p.stockTransfers || [])], products: p.products.map((x) => (x.id === productId ? done : x)), stockMoves: [move(to, qty), move(from, -qty), ...p.stockMoves] };
      stamp(d, 'Create', 'stockTransfers', r.id, number);
      return d;
    });
    return number;
  };
  const postStockCount = (warehouseId, lines, note) => {
    const number = nextNo(db.stockCounts || [], 'SC-', 301);
    setDb((p) => {
      const date = today();
      const changed = lines.filter((l) => l.counted !== l.system);
      const costOf = (id) => p.products.find((x) => x.id === id)?.cost || 0;
      const r = { id: uid('sc'), number, warehouseId, note, date, userId: me.id, lines, counted: lines.length, changed: changed.length, units: changed.reduce((a, l) => a + l.counted - l.system, 0), value: changed.reduce((a, l) => a + (l.counted - l.system) * costOf(l.productId), 0), createdAt: new Date().toISOString() };
      const d = { ...p, stockCounts: [r, ...(p.stockCounts || [])],
        products: p.products.map((x) => { const l = changed.find((y) => y.productId === x.id); return l ? { ...x, ...withDelta(x, warehouseId, l.counted - l.system) } : x; }),
        stockMoves: [...changed.map((l) => ({ id: uid('m'), productId: l.productId, type: 'Count', qty: l.counted - l.system, reason: `Stock count ${number}`, userId: me.id, warehouseId, date })), ...p.stockMoves] };
      stamp(d, 'Create', 'stockCounts', r.id, number);
      return d;
    });
    return number;
  };
  const askPoApproval = (id) => setDb((p) => {
    const po = p.purchaseOrders.find((x) => x.id === id);
    const d = { ...p };
    applyUpdate(d, 'purchaseOrders', id, { status: 'Awaiting approval' });
    d.users.filter((u) => u.role === 'admin' && u.active).forEach((u) => notify(d, u.id, `Purchase order ${po.number} needs your approval`, '/purchasing'));
    return d;
  });
  // Receiving adds stock and moves the product's cost to the average of old and new.
  const receivePO = (id, qtys, warehouseId, date) => setDb((p) => {
    const po = p.purchaseOrders.find((x) => x.id === id);
    const got = po.items.map((i) => ({ ...i, now: Math.min(Math.max(0, Number(qtys[i.productId]) || 0), i.qty - (i.received || 0)) })).filter((i) => i.now > 0);
    const items = po.items.map((i) => { const g = got.find((x) => x.productId === i.productId); return g ? { ...i, received: (i.received || 0) + g.now } : i; });
    const full = items.every((i) => (i.received || 0) >= i.qty);
    const d = { ...p,
      products: p.products.map((x) => {
        const g = got.find((y) => y.productId === x.id);
        if (!g) return x;
        const total = x.stock + g.now;
        const cost = total ? Math.round(((x.stock * x.cost + g.now * g.price) / total) * 100) / 100 : g.price;
        return { ...x, ...withDelta(x, warehouseId, g.now), cost };
      }),
      stockMoves: [...got.map((g) => ({ id: uid('m'), productId: g.productId, type: 'Receipt', qty: g.now, reason: `Purchase order ${po.number}`, userId: me.id, warehouseId, date })), ...p.stockMoves] };
    applyUpdate(d, 'purchaseOrders', id, { items, status: full ? 'Received' : 'Partly received', receivedAt: date });
    return d;
  });
  // A credit reduces what the customer owes. Anything over the balance becomes a refund to pay.
  const issueCredit = ({ invoice, lines, amount, reason, note, restock, warehouseId, date }) => {
    const balance = Math.max(0, invoice.total - (invoice.paid || 0));
    const applied = Math.min(balance, amount);
    const refundDue = Math.round((amount - applied) * 100) / 100;
    const rec = { id: uid('cn'), number: nextNo(db.creditNotes || [], 'CN-', 8001), invoiceId: invoice.id, invoiceNumber: invoice.number, currency: invoice.currency || '', fxRate: invoice.fxRate || 1, companyId: invoice.companyId, ownerId: invoice.ownerId, date, due: date, reason, note, items: lines, total: amount, applied, refundDue, restocked: !!restock, warehouseId, status: refundDue > 0 ? 'Refund due' : 'Applied', createdAt: new Date().toISOString() };
    setDb((p) => {
      const tracked = restock ? lines.filter((l) => p.products.find((x) => x.id === l.productId)?.tracked) : [];
      const d = { ...p, creditNotes: [rec, ...(p.creditNotes || [])],
        products: p.products.map((x) => { const q = tracked.filter((l) => l.productId === x.id).reduce((a, l) => a + l.qty, 0); return q ? { ...x, ...withDelta(x, warehouseId, q) } : x; }),
        stockMoves: [...tracked.map((l) => ({ id: uid('m'), productId: l.productId, type: 'Return', qty: l.qty, reason: `Credit note ${rec.number}`, userId: me.id, warehouseId, date })), ...p.stockMoves] };
      stamp(d, 'Create', 'creditNotes', rec.id, rec.number);
      const cur = d.invoices.find((x) => x.id === invoice.id);
      const paid = (cur.paid || 0) + applied;
      const credited = (cur.credited || 0) + applied;
      applyUpdate(d, 'invoices', invoice.id, { paid, credited, status: credited >= cur.total ? 'Credited' : paid >= cur.total ? 'Paid' : 'Partially paid' });
      return d;
    });
    return rec;
  };
  const runRecurringNow = (id) => setDb((p) => {
    const d = { ...p };
    const r = d.recurringInvoices.find((x) => x.id === id);
    invoiceFromPlan(d, r, today());
    return d;
  });
  const recordPayment = (invoiceId, amount, method, date) => setDb((p) => {
    const inv = p.invoices.find((x) => x.id === invoiceId);
    const paid = (inv.paid || 0) + amount;
    const d = { ...p, payments: [{ id: uid('pay'), number: `PAY-${3100 + p.payments.length}`, invoiceId, companyId: inv.companyId, ownerId: inv.ownerId, currency: inv.currency || '', fxRate: inv.fxRate || 1, rateAtPayment: inv.currency ? rateOf(inv.currency) : 1, amount, method, date, createdAt: new Date().toISOString() }, ...p.payments] };
    applyUpdate(d, 'invoices', invoiceId, { paid, status: paid >= inv.total ? 'Paid' : 'Partially paid' });
    return d;
  });

  const permChanges = (m, from, to) => {
    const def = MODULE_BY_KEY[m];
    const was = from?.hidden || [];
    const now = to?.hidden || [];
    const sections = def.sections.filter((s) => was.includes(s.k) !== now.includes(s.k)).map((s) => ({ field: `${def.label} section: ${s.label}`, from: was.includes(s.k) ? 'revoked' : 'assigned', to: now.includes(s.k) ? 'revoked' : 'assigned' }));
    return [...[...allActions(def), 'scope'].filter((a) => (from?.[a] ?? false) !== (to?.[a] ?? false)).map((a) => ({ field: `${def.label}: ${a}`, from: String(from?.[a] ?? 'off'), to: String(to?.[a] ?? 'off') })), ...sections];
  };
  const setRolePermission = (r, m, next) => setDb((p) => {
    const cur = p.permissions.roles[r][m];
    const d = { ...p, permissions: { ...p.permissions, roles: { ...p.permissions.roles, [r]: { ...p.permissions.roles[r], [m]: next } } } };
    stamp(d, 'Update', 'permissions', r, `${ROLES[r] || p.customRoles?.find((x) => x.id === r)?.name} role access`, permChanges(m, cur, next));
    return d;
  });
  const applyRolePreset = (r, preset) => setDb((p) => {
    const defaults = defaultPermissions().roles[r] || defaultPermissions().roles[p.customRoles?.find((x) => x.id === r)?.base];
    const rows = Object.fromEntries(MODULES.map((def) => {
      const cur = p.permissions.roles[r][def.key];
      if (preset === 'reset') return [def.key, defaults[def.key]];
      const row = { ...cur };
      allActions(def).forEach((a) => {
        if (preset === 'full') { row[a] = true; row.hidden = []; }
        else if (preset === 'none') row[a] = false;
        else row[a] = a === 'view' ? cur[a] : false;
      });
      return [def.key, row];
    }));
    const d = { ...p, permissions: { ...p.permissions, roles: { ...p.permissions.roles, [r]: rows } } };
    stamp(d, 'Update', 'permissions', r, `${ROLES[r] || p.customRoles?.find((x) => x.id === r)?.name} role access`, [{ field: 'All modules', from: 'Previous access', to: { full: 'Full access', view: 'View only', none: 'No access', reset: 'Defaults' }[preset] }]);
    return d;
  });
  const setUserPermission = (uid_, m, next) => setDb((p) => {
    const mine = { ...(p.permissions.users[uid_] || {}) };
    const user = p.users.find((u) => u.id === uid_);
    const before = effective(p.permissions, user, m);
    if (next) mine[m] = next; else delete mine[m];
    const users = { ...p.permissions.users, [uid_]: mine };
    if (!Object.keys(mine).length) delete users[uid_];
    const d = { ...p, permissions: { ...p.permissions, users } };
    stamp(d, 'Update', 'permissions', uid_, `${user.name}'s access`, permChanges(m, before, effective(d.permissions, user, m)));
    return d;
  });
  const clearUserPermissions = (uid_) => setDb((p) => {
    const users = { ...p.permissions.users };
    delete users[uid_];
    const d = { ...p, permissions: { ...p.permissions, users } };
    stamp(d, 'Update', 'permissions', uid_, `${userName(uid_, p)}'s access`, [{ field: 'Personal access', from: 'Custom', to: 'Role default' }]);
    return d;
  });

  const isSampleOrg = orgId === SAMPLE_ORG;
  const resetDemo = () => {
    const d = isSampleOrg ? scored(seed()) : blankCompany(db.settings.companyName, me);
    renameOrg(orgId, d.settings.companyName);
    setDb({ ...d, sessions: db.sessions });
    toast(isSampleOrg ? 'Demo data restored' : 'Company data cleared');
  };
  const login = (id) => setUserId(id);
  const currentSessionId = () => { const s = read(SID); return s?.org === orgId ? s.id : null; };
  const logEntry = (d, rec) => { d.loginLog = [{ id: uid('lg'), at: new Date().toISOString(), device: deviceName(), ip: DEMO_IP, place: 'This device', ...rec }, ...(d.loginLog || [])].slice(0, 500); };
  const signIn = (id, method) => {
    const session = { id: uid('ses'), userId: id, at: new Date().toISOString(), device: deviceName(), ip: DEMO_IP, place: 'This device' };
    write(SID, { id: session.id, org: orgId });
    setDb((p) => {
      const sec = secOf(p.settings);
      // A device and address never used by this person before is worth telling them about.
      const known = (p.loginLog || []).some((x) => x.userId === id && x.result === 'Success' && x.device === session.device && x.ip === session.ip);
      const fresh = !known && (p.loginLog || []).some((x) => x.userId === id && x.result === 'Success');
      // With a limit, the oldest sessions end first.
      const mine = (p.sessions || []).filter((s) => s.userId === id).sort((a, b) => b.at.localeCompare(a.at));
      const drop = sec.maxSessions > 0 ? new Set(mine.slice(sec.maxSessions - 1).map((s) => s.id)) : new Set();
      const d = { ...p, sessions: [session, ...(p.sessions || []).filter((s) => !drop.has(s.id))], users: p.users.map((u) => (u.id === id ? { ...u, failed: 0, lockedUntil: null } : u)) };
      logEntry(d, { userId: id, method, result: 'Success', ...(fresh ? { newDevice: true } : {}) });
      if (fresh && sec.newDeviceAlert) {
        const who = p.users.find((u) => u.id === id);
        notify(d, id, `New sign-in to your account from ${session.device} at ${session.ip}. If this wasn't you, change your password and tell your admin.`, '/profile', `newdev-${session.id}`, true);
        p.users.filter((u) => u.role === 'admin' && u.active && u.id !== id).forEach((u) => notify(d, u.id, `${who?.name || 'Someone'} signed in from a new device: ${session.device}`, '/security', `newdev-${session.id}-${u.id}`));
      }
      if (drop.size) logEntry(d, { userId: id, method: 'Session limit', result: 'Success', note: `${drop.size} older session ended` });
      return d;
    });
    setAuthNote('');
    setUserId(id);
  };
  // End this device's session. View as changes who you see the CRM as, so it never ends a session.
  const logout = (reason) => {
    const sid = currentSessionId();
    if (sid) setDb((p) => ({ ...p, sessions: (p.sessions || []).filter((s) => s.id !== sid) }));
    try { localStorage.removeItem(SID); } catch { /* storage may be blocked */ }
    setAuthNote(typeof reason === 'string' ? reason : '');
    setUserId(null);
  };
  const noteFailedLogin = (user, email, result = 'Failed', reason = '') => setDb((p) => {
    const d = { ...p };
    if (!user || result !== 'Failed') { logEntry(d, { userId: user?.id, email, method: 'Password', result, ...(reason ? { reason } : {}) }); return d; }
    const sec = secOf(p.settings);
    const failed = (p.users.find((u) => u.id === user.id)?.failed || 0) + 1;
    const lock = sec.lockAfter > 0 && failed >= sec.lockAfter;
    d.users = p.users.map((u) => (u.id === user.id ? { ...u, failed: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + sec.lockMinutes * 6e4).toISOString() : u.lockedUntil } : u));
    logEntry(d, { userId: user.id, method: 'Password', result: lock ? 'Locked' : 'Failed' });
    if (lock) p.users.filter((u) => u.role === 'admin' && u.active).forEach((u) => notify(d, u.id, `${user.name}'s account locked after ${failed} wrong passwords`, '/security'));
    return d;
  });
  const unlockUser = (id) => update('users', id, { failed: 0, lockedUntil: null });
  // The secret never goes into the change history, only that the app was turned on or off.
  const setAuthenticator = (id, secret, codes) => setDb((p) => {
    const d = { ...p, users: p.users.map((u) => (u.id === id ? { ...u, totpSecret: secret || null, recoveryHashes: secret ? codes.map((c) => demoHash(c)) : [] } : u)) };
    stamp(d, 'Update', 'users', id, userName(id, p), [{ field: 'Authenticator app', from: secret ? 'Off' : 'On', to: secret ? 'On' : 'Off' }]);
    return d;
  });
  const redeemRecoveryCode = (id, code) => {
    const u = db.users.find((x) => x.id === id);
    const h = demoHash(String(code || '').trim().toLowerCase());
    if (!u?.recoveryHashes?.includes(h)) return false;
    setDb((p) => { const d = { ...p, users: p.users.map((x) => (x.id === id ? { ...x, recoveryHashes: x.recoveryHashes.filter((y) => y !== h) } : x)) }; stamp(d, 'Update', 'users', id, userName(id, p), [{ field: 'Recovery code', from: 'Unused', to: 'Used to sign in' }]); return d; });
    return true;
  };
  const resetUserPassword = (id, hash) => setDb((p) => {
    const d = { ...p, users: p.users.map((u) => (u.id === id ? { ...u, passHash: hash, mustChangePassword: true, failed: 0, lockedUntil: null } : u)) };
    stamp(d, 'Update', 'users', id, userName(id, p), [{ field: 'Password', from: '••••', to: 'Reset by admin' }]);
    return d;
  });
  const endSession = (id) => setDb((p) => ({ ...p, sessions: (p.sessions || []).filter((s) => s.id !== id) }));
  const signOutUser = (id) => setDb((p) => {
    const d = { ...p, sessions: (p.sessions || []).filter((s) => s.userId !== id) };
    stamp(d, 'Update', 'users', id, userName(id, p), [{ field: 'Sessions', from: 'Signed in', to: 'Signed out by admin' }]);
    return d;
  });
  const signOutOthers = () => { const sid = currentSessionId(); setDb((p) => ({ ...p, sessions: (p.sessions || []).filter((s) => s.id === sid) })); };
  const restoreDeleted = (binId) => setDb((p) => {
    const item = (p.recycleBin || []).find((x) => x.id === binId);
    if (!item) return p;
    const d = { ...p, [item.entity]: [item.rec, ...(p[item.entity] || []).filter((r) => r.id !== item.rec.id)], recycleBin: p.recycleBin.filter((x) => x.id !== binId) };
    stamp(d, 'Restore', item.entity, item.rec.id, item.label);
    return d;
  });
  const purgeDeleted = (binId) => setDb((p) => {
    const d = { ...p, recycleBin: binId ? (p.recycleBin || []).filter((x) => x.id !== binId) : [] };
    stamp(d, 'Delete', 'recycleBin', binId || 'all', binId ? 'A record, for good' : 'Everything in the recycle bin');
    return d;
  });
  const logExport = (name, count) => setDb((p) => {
    const d = { ...p };
    stamp(d, 'Export', 'data', name, name, [{ field: 'Records', from: '—', to: String(count) }]);
    return d;
  });
  const erasePerson = (kind, id) => setDb((p) => {
    const d = { ...p };
    if (kind === 'contact') d.contacts = p.contacts.map((c) => (c.id === id ? { ...c, first: 'Erased', last: 'person', email: '', phone: '', title: '', notes: '', background: '', erasedAt: today() } : c));
    else d.leads = p.leads.map((l) => (l.id === id ? { ...l, name: 'Erased person', email: '', phone: '', title: '', notes: '', erasedAt: today() } : l));
    const person = (kind === 'contact' ? p.contacts : p.leads).find((r) => r.id === id);
    const mail = String(person?.email || '').toLowerCase();
    d.formSubmissions = (p.formSubmissions || []).map((s) => (s.leadId === id || (mail && String(s.values?.email || '').toLowerCase() === mail) ? { ...s, values: {}, utm: {}, referrer: '', erased: true } : s));
    stamp(d, 'Erase', kind === 'contact' ? 'contacts' : 'leads', id, 'Personal details erased');
    return d;
  });
  // An Admin can sign someone out from another session. Here, that means this device on its next check.
  useEffect(() => {
    const sid = currentSessionId();
    if (me && sid && !(db.sessions || []).some((s) => s.id === sid)) {
      try { localStorage.removeItem(SID); } catch { /* storage may be blocked */ }
      setAuthNote('You were signed out by an admin.');
      setUserId(null);
    }
  }, [db.sessions, orgId]);
  const idleLimit = secOf(db.settings).sessionTimeout;
  useEffect(() => {
    if (!me || !idleLimit) return undefined;
    let last = Date.now();
    let warned = false;
    const mark = () => { last = Date.now(); warned = false; };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      const idle = (Date.now() - last) / 6e4;
      if (idle >= idleLimit) logout('You were signed out because you were away for a while.');
      else if (!warned && idleLimit - idle <= 1) { warned = true; toast('You will be signed out soon because you are away.', 'bad'); }
    }, 5000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, mark)); };
  }, [userId, idleLimit, orgId]);
  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));

  const value = {
    setDbFromPublic: setDb,
    patchDb, saveForecastSnapshot,
    trackForm, enquiryNotSpam, removeEnquiries,
    sendCampaign, simulateNewChat, setConversationStatus,
    sendEmailCampaign,
    createRequest, updateRequest, commentRequest,
    setAuthenticator, redeemRecoveryCode,
    restorePartial,
    resendWebhook, resolveConflict, resolveIssue,
    openAlert,
    revalueDeals,
    sendDigest, snoozeAlert,
    testWebhook,
    authNote, signIn, noteFailedLogin, unlockUser, resetUserPassword, endSession, signOutUser, signOutOthers, currentSessionId, restoreDeleted, purgeDeleted, logExport, erasePerson,
    db: viewDb, seesField, setFieldRule, setAccessExpiry, orgs, orgId, isSampleOrg, addOrg, switchOrg, deleteOrg, me, role, t, can, sec, canRoute, scopeOf, setRolePermission, applyRolePreset, setUserPermission, clearUserPermissions, scope, assignable, scopeLabel, theme, toggleTheme, toast, toasts, login, logout,
    userName, companyName, create, update, remove, updateSettings, moveDeal, markLost, reopen, addChatter,
    addStage, updateStage, moveStage, removeStage,
    setStageRequired, startSequence, sendBulkEmail, saveEmailDraft, removeEmail, sendEmailReply, simulateIncomingEmail, sendBroadcast, assignConversation, previewRule, runRuleNow, cancelRun, decideApproval, saveBoards, saveReportSchedule, sendReportNow, prefs, savePrefs, dismissToast, saveDashboard, addCustomRole, removeCustomRole, createGroup, aiAnswerMissed, saveConnection, runSync, saveRule, removeRule, formFields, saveFormConfig, importRecords, mergeDuplicates, submitWebForm, sendEmail, simulateEmailReply, simulateChatReply, setPassword, restoreBackup,
    optionsOf, addOption, renameOption, removeOption, labelOf, setLabel, setTitle,
    requestMeeting, passMeeting, declineMeeting, acceptMeeting, withdrawMeeting, meetingEventChanged,
    pushNotification, patchQuiet, patchChatMessage, sendMessage, markConversationRead, openConversation, requestTransfer, decideTransfer, opsReadOnly, notifyPeople, placeOrder, cancelOrder, adjustStock, transferStock, postStockCount, askPoApproval, receivePO, issueCredit, runRecurringNow, recordPayment, markRead, resetDemo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
