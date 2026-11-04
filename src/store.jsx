import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { blankCompany, seed, setStages, STAGES } from './seed';
import { fmtDT, humanize, setCurrency, today, uid } from './util';
import { PICKLIST_BY_KEY } from './picklists';
import { ENTITY_MODULE, MODULES, MODULE_BY_KEY, ROUTE_MODULE, allActions, defaultPermissions, effective, isLocked, migratePermissions } from './permissions';

const KEY = 'unifiedtree-crm-v3';
const SESSION = 'unifiedtree-crm-session';
const THEME = 'unifiedtree-crm-theme';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };

// An "org" is a business using this CRM, shown as "Company" on screen. Each has its own db.
// Not to be confused with db.companies, which holds one org's customers.
const ORGS = 'unifiedtree-crm-orgs';
const ACTIVE_ORG = 'unifiedtree-crm-org';
const SAMPLE_ORG = 'default';
const orgKey = (id) => (id === SAMPLE_ORG ? KEY : `${KEY}:${id}`);
const loadOrg = (org) => {
  const fresh = org.id === SAMPLE_ORG ? seed() : blankCompany(org.name);
  const saved = read(orgKey(org.id));
  if (!saved?.users) return fresh;
  // Older saved data gets anything added since, without touching what's already there.
  return { ...fresh, ...saved, settings: { ...fresh.settings, ...saved.settings }, permissions: migratePermissions(saved.permissions) };
};

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
// Every page that can be renamed in Settings.
export const TITLES = {
  calls: { admin: 'All calls', manager: 'Team calls', sales: 'My calls' },
  messages: { admin: 'Messages', manager: 'Messages', sales: 'Messages' },
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
const labelOf = (entity, r) => (LABELS[entity] ? LABELS[entity](r) : r.name || r.id);
export const RECORD_ENTITY = { deal: 'deals', lead: 'leads', contact: 'contacts', company: 'companies' };

export function StoreProvider({ children }) {
  const [orgs, setOrgs] = useState(() => read(ORGS) || [{ id: SAMPLE_ORG, name: read(KEY)?.settings?.companyName || 'Unifiedtree' }]);
  const [orgId, setOrgId] = useState(() => { const id = read(ACTIVE_ORG); return orgs.some((o) => o.id === id) ? id : orgs[0].id; });
  const [db, setDb] = useState(() => loadOrg(orgs.find((o) => o.id === orgId)));
  const [userId, setUserId] = useState(() => read(SESSION));
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
  setStages(db.stages);
  const labelOf = (word) => db.labels?.[word] ?? word;
  Object.entries(ROLE_WORDS).forEach(([k, word]) => { ROLES[k] = labelOf(word); });

  const me = db.users.find((u) => u.id === userId) || null;
  const role = me?.role;

  const toast = useCallback((text, tone = 'good') => {
    const id = uid('t');
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const SCOPE_TITLE = { own: 'sales', team: 'manager', all: 'admin' };
  const perm = (m) => (me ? effective(db.permissions, me, m) : {});
  const can = (m, a = 'view') => {
    if (!me) return false;
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
  const scope = (list, mod) => {
    const m = mod || ENTITY_MODULE[Object.keys(ENTITY_MODULE).find((k) => db[k] === list)];
    if (!m || !can(m)) return [];
    const s = scopeOf(m);
    if (s === 'all') return list;
    // attendeeIds is on meetings: anyone invited sees them, whoever owns them.
    const invited = (r) => r.attendeeIds?.includes(me.id);
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
  const companyName = (id, d = db) => d.companies.find((c) => c.id === id)?.name || '—';
  const stamp = (d, action, entity, entityId, label, changes = []) => {
    d.audit = [{ id: uid('au'), at: new Date().toISOString(), userId: me?.id, action, entity, entityId, label, changes }, ...d.audit].slice(0, 3000);
  };
  const pretty = (d, k, v) => {
    if (k === 'ownerId' || k === 'userId') return userName(v, d);
    if (k === 'companyId') return companyName(v, d);
    if (Array.isArray(v)) return v.length && typeof v[0] !== 'object' ? v.join(', ') : `${v.length} item(s)`;
    if (v === '' || v == null) return '—';
    return String(v);
  };
  const applyUpdate = (d, entity, id, patch, action = 'Update') => {
    const cur = d[entity].find((r) => r.id === id);
    if (!cur) return;
    const changes = Object.keys(patch).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(patch[k])).map((k) => ({ field: humanize(k), from: pretty(d, k, cur[k]), to: pretty(d, k, patch[k]) }));
    if (!changes.length) return;
    d[entity] = d[entity].map((r) => (r.id === id ? { ...r, ...patch } : r));
    stamp(d, action, entity, id, labelOf(entity, { ...cur, ...patch }), changes);
  };

  const create = (entity, rec) => {
    const r = { ...rec, id: rec.id || uid(entity.slice(0, 2)), createdAt: rec.createdAt || new Date().toISOString() };
    setDb((p) => { const d = { ...p, [entity]: [r, ...p[entity]] }; stamp(d, 'Create', entity, r.id, labelOf(entity, r)); return d; });
    return r;
  };
  const update = (entity, id, patch, action) => setDb((p) => { const d = { ...p }; applyUpdate(d, entity, id, patch, action); return d; });
  const remove = (entity, id) => setDb((p) => {
    const cur = p[entity].find((r) => r.id === id);
    const d = { ...p, [entity]: p[entity].filter((r) => r.id !== id) };
    if (cur) stamp(d, 'Delete', entity, id, labelOf(entity, cur));
    return d;
  });
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
      const changes = Object.keys(patch).filter((k) => p.settings[k] !== patch[k]).map((k) => ({ field: humanize(k), from: String(p.settings[k]), to: String(patch[k]) }));
      const d = { ...p, settings: { ...p.settings, ...patch } };
      if (changes.length) stamp(d, 'Update', 'settings', 'settings', 'System settings', changes);
      return d;
    });
  };
  const addOrg = ({ name, currency, supportEmail }) => {
    const org = { id: uid('org'), name, createdAt: new Date().toISOString() };
    const d = blankCompany(name, me);
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

  const notify = (d, to, text, link, key) => { d.notifications = [{ id: uid('n'), to, at: new Date().toISOString(), text, link, read: false, key }, ...d.notifications.filter((n) => !(key && n.key === key && n.to === to && !n.read))]; };
  const pushNotification = (to, text, link) => setDb((p) => { const d = { ...p }; notify(d, to, text, link); return d; });
  // Routine state with no business meaning, so it stays out of the audit log.
  const patchQuiet = (entity, id, patch) => setDb((p) => ({ ...p, [entity]: p[entity].map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const sendMessage = (id, text, status) => setDb((p) => {
    const at = new Date().toISOString();
    const d = { ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, messages: [...c.messages, { id: uid('msg'), at, by: me.id, text, status }], reads: { ...c.reads, [me.id]: at } } : c)) };
    // One bell entry per unread chat, so a burst of messages doesn't fill the list.
    const conv = p.conversations.find((c) => c.id === id);
    if (conv?.kind === 'team') conv.members.filter((u) => u !== me.id).forEach((u) => notify(d, u, `${me.name}: ${text.slice(0, 80)}`, '/messages', `chat-${id}`));
    return d;
  });
  const markConversationRead = (id) => setDb((p) => ({ ...p, conversations: p.conversations.map((c) => (c.id === id ? { ...c, reads: { ...c.reads, [me.id]: new Date().toISOString() } } : c)) }));
  const openConversation = (kind, x) => {
    const found = db.conversations.find((c) => (kind === 'team' ? c.kind === 'team' && c.members.includes(me.id) && c.members.includes(x.id) : c.kind === 'whatsapp' && (x.id ? c.contactId === x.id : c.phone === x.phone) && c.ownerId === me.id));
    if (found) return found.id;
    const rec = { id: uid('cv'), kind, createdAt: new Date().toISOString(), reads: {}, messages: [], ...(kind === 'team' ? { members: [me.id, x.id] } : { contactId: x.id, name: x.name, phone: x.phone, ownerId: me.id }) };
    setDb((p) => ({ ...p, conversations: [rec, ...p.conversations] }));
    return rec.id;
  };
  const markRead = (ids) => setDb((p) => ({ ...p, notifications: p.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) }));

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
    const patch = { stage: stageId, status: stageId === 'won' ? 'won' : 'open', probability: st.prob, lostReason: '' };
    if (stageId === 'won') patch.closeDate = today();
    applyUpdate(d, 'deals', id, patch);
    return d;
  });
  const markLost = (id, reason) => update('deals', id, { status: 'lost', probability: 0, lostReason: reason, closeDate: today() });
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
  const adjustStock = (productId, qty, type, reason) => setDb((p) => {
    const cur = p.products.find((x) => x.id === productId);
    const d = { ...p, stockMoves: [{ id: uid('m'), productId, type, qty, reason, userId: me.id, warehouseId: cur.warehouseId, date: today() }, ...p.stockMoves] };
    applyUpdate(d, 'products', productId, { stock: Math.max(0, cur.stock + qty) });
    return d;
  });
  const recordPayment = (invoiceId, amount, method, date) => setDb((p) => {
    const inv = p.invoices.find((x) => x.id === invoiceId);
    const paid = (inv.paid || 0) + amount;
    const d = { ...p, payments: [{ id: uid('pay'), number: `PAY-${3100 + p.payments.length}`, invoiceId, companyId: inv.companyId, ownerId: inv.ownerId, amount, method, date, createdAt: new Date().toISOString() }, ...p.payments] };
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
    stamp(d, 'Update', 'permissions', r, `${ROLES[r]} role access`, permChanges(m, cur, next));
    return d;
  });
  const applyRolePreset = (r, preset) => setDb((p) => {
    const defaults = defaultPermissions().roles[r];
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
    stamp(d, 'Update', 'permissions', r, `${ROLES[r]} role access`, [{ field: 'All modules', from: 'Previous access', to: { full: 'Full access', view: 'View only', none: 'No access', reset: 'Defaults' }[preset] }]);
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
    const d = isSampleOrg ? seed() : blankCompany(db.settings.companyName, me);
    renameOrg(orgId, d.settings.companyName);
    setDb(d);
    toast(isSampleOrg ? 'Demo data restored' : 'Company data cleared');
  };
  const login = (id) => setUserId(id);
  const logout = () => setUserId(null);
  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));

  const value = {
    db, orgs, orgId, isSampleOrg, addOrg, switchOrg, deleteOrg, me, role, t, can, sec, canRoute, scopeOf, setRolePermission, applyRolePreset, setUserPermission, clearUserPermissions, scope, assignable, scopeLabel, theme, toggleTheme, toast, toasts, login, logout,
    userName, companyName, create, update, remove, updateSettings, moveDeal, markLost, reopen, addChatter,
    addStage, updateStage, moveStage, removeStage,
    optionsOf, addOption, renameOption, removeOption, labelOf, setLabel, setTitle,
    requestMeeting, passMeeting, declineMeeting, acceptMeeting, withdrawMeeting, meetingEventChanged,
    pushNotification, patchQuiet, sendMessage, markConversationRead, openConversation, requestTransfer, decideTransfer, placeOrder, cancelOrder, adjustStock, recordPayment, markRead, resetDemo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
