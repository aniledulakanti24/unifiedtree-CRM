import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building2, CheckCircle2, ChevronRight, ChevronsUpDown, Languages, LogOut, Menu, Moon, PanelLeft, Plus, Search, Sun } from 'lucide-react';
import { ROLES, unreadOf, useStore } from './store';
import { CommsProvider } from './comms';
import Calls from './pages/Calls';
import Messages from './pages/Messages';
import Meetings from './pages/Meetings';
import Followups from './pages/Followups';
import { Avatar, Btn, Empty, FormFields, Icon, Modal, PageBoundary, Popover, useEsc, validate } from './ui';
import { RecordQuickCreate } from './shared';
import { relTime } from './util';
import { currentLanguage, loadTranslate, setLanguage } from './translate';
import Login from './pages/Login';
import Dashboard from './pages/Dashboards';
import Performance from './pages/Performance';
import { DealRecord, Pipeline } from './pages/Pipeline';
import Leads from './pages/Leads';
import Contacts from './pages/Contacts';
import { CustomerRecord, Customers } from './pages/Customers';
import Tasks from './pages/Tasks';
import CalendarPage from './pages/Calendar';
import Transfers from './pages/Transfers';
import Teams from './pages/Teams';
import { Orders, Products } from './pages/Commerce';
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import Logistics from './pages/Logistics';
import Cases from './pages/Cases';
import { Forecast, LeadsAnalysis, PipelineAnalysis } from './pages/Reports';
import { AuditLog, SettingsPage, Users } from './pages/Admin';
import Access from './pages/Access';
import Profile from './pages/Profile';

const PAGES = {
  dashboard: { to: '/', icon: 'LayoutDashboard', el: <Dashboard /> },
  calendar: { to: '/calendar', icon: 'CalendarDays', el: <CalendarPage /> },
  calls: { to: '/calls', icon: 'Phone', el: <Calls /> },
  messages: { to: '/messages', icon: 'MessagesSquare', el: <Messages />, count: 'messages' },
  meetings: { to: '/meetings', icon: 'CalendarClock', el: <Meetings />, count: 'meetings' },
  followups: { to: '/followups', icon: 'BellRing', el: <Followups />, count: 'followups' },
  tasks: { to: '/tasks', icon: 'ListTodo', el: <Tasks />, count: 'tasks' },
  pipeline: { to: '/pipeline', icon: 'Kanban', el: <Pipeline /> },
  leads: { to: '/leads', icon: 'Magnet', el: <Leads /> },
  contacts: { to: '/contacts', icon: 'Contact', el: <Contacts /> },
  customers: { to: '/customers', icon: 'Building2', el: <Customers /> },
  transfers: { to: '/transfers', icon: 'ArrowRightLeft', el: <Transfers />, count: 'transfers' },
  teams: { to: '/teams', icon: 'UsersRound', el: <Teams /> },
  orders: { to: '/orders', icon: 'ShoppingCart', el: <Orders /> },
  products: { to: '/products', icon: 'Package', el: <Products /> },
  billing: { to: '/billing', icon: 'Receipt', el: <Billing /> },
  inventory: { to: '/inventory', icon: 'Warehouse', el: <Inventory /> },
  logistics: { to: '/logistics', icon: 'Truck', el: <Logistics /> },
  cases: { to: '/cases', icon: 'LifeBuoy', el: <Cases />, count: 'cases' },
  forecast: { to: '/reports/forecast', icon: 'TrendingUp', el: <Forecast /> },
  analysis: { to: '/reports/pipeline', icon: 'ChartColumn', el: <PipelineAnalysis /> },
  leadsReport: { to: '/reports/leads', icon: 'ChartPie', el: <LeadsAnalysis /> },
  performance: { to: '/performance', icon: 'Medal', el: <Performance /> },
  users: { to: '/users', icon: 'UserCog', el: <Users /> },
  access: { to: '/access', icon: 'ShieldCheck', el: <Access /> },
  audit: { to: '/audit', icon: 'ScrollText', el: <AuditLog /> },
  settings: { to: '/settings', icon: 'Settings', el: <SettingsPage /> },
};
// Each role gets its own workspace: its own menu, in its own order, for its own job.
const ROLE_NAV = {
  admin: [
    ['Overview', ['dashboard', 'calendar']],
    ['Communication', ['calls', 'messages', 'meetings', 'followups']],
    ['Sales records', ['pipeline', 'leads', 'contacts', 'customers', 'transfers']],
    ['Operations', ['orders', 'products', 'inventory', 'logistics', 'billing', 'cases']],
    ['Company reports', ['forecast', 'analysis', 'leadsReport']],
  ],
  manager: [
    ['My team', ['dashboard', 'teams', 'transfers', 'tasks', 'calendar']],
    ['Communication', ['calls', 'messages', 'meetings', 'followups']],
    ['Team sales', ['pipeline', 'leads', 'contacts', 'customers']],
    ['Team commerce', ['orders', 'billing', 'products', 'cases']],
    ['Team reports', ['forecast', 'analysis', 'leadsReport', 'audit']],
  ],
  sales: [
    ['My work', ['dashboard', 'followups', 'tasks', 'calendar']],
    ['Communicate', ['calls', 'messages', 'meetings']],
    ['Selling', ['pipeline', 'leads', 'contacts', 'customers', 'transfers']],
    ['Orders', ['orders', 'billing', 'products', 'cases']],
    ['My results', ['forecast', 'performance']],
  ],
};
// These open from the account panel instead of the sidebar.
const ROLE_PANEL = { admin: ['users', 'access', 'teams', 'audit', 'settings'], manager: ['users', 'access', 'settings'], sales: ['users', 'access', 'teams', 'audit', 'settings'] };
const PANEL_SUB = { users: 'Add people and set their roles', access: 'What each role and person can do', teams: 'Targets, pipeline and members', audit: 'Every change, by everyone', settings: 'CRM, company, integrations and data' };
// Menus show only what the Admin has granted; anything extra granted lands under "More".
const navFor = (role, can) => {
  const listed = new Set([...ROLE_NAV[role].flatMap(([, keys]) => keys), ...ROLE_PANEL[role]]);
  const more = Object.keys(PAGES).filter((k) => !listed.has(k) && can(k));
  return [...ROLE_NAV[role], ['More', more]].map(([group, keys]) => ({ group, items: keys.filter((k) => can(k)).map((key) => ({ ...PAGES[key], key })) })).filter((g) => g.items.length);
};
const WORKSPACE = { admin: 'Admin console', manager: 'Manager workspace', sales: 'Sales workspace' };

// Languages most useful to this business come first, in each language's own script.
const SUGGESTED_LANGUAGES = ['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'ar'];
const ownName = (code, english) => {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    // Browsers without a name for a language echo its code back, sometimes with a script after it.
    return name && !name.toLowerCase().startsWith(code.split('-')[0].toLowerCase()) && name.toLowerCase() !== english.toLowerCase() ? name : '';
  } catch { return ''; }
};

function LanguagePicker({ current, onPick }) {
  const [languages, setLanguages] = useState(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    let on = true;
    loadTranslate()
      .then((select) => { if (on) setLanguages([...select.options].filter((o) => o.value).map((o) => ({ code: o.value, name: o.text, own: ownName(o.value, o.text) })).sort((a, b) => a.name.localeCompare(b.name))); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);
  const row = (l) => (
    <button key={l.code} type="button" className="lang-row" lang={l.code} aria-current={l.code === current} onClick={() => onPick(l.code)}>
      <span className="grow trunc"><span className="strong">{l.own || l.name}</span>{l.own && <span className="small muted"> · {l.name}</span>}</span>
      {l.code === current && <CheckCircle2 size={15} color="var(--brand)" />}
    </button>
  );
  if (failed) return <div className="lang-empty">Google Translate couldn't be reached. Check your internet connection.</div>;
  const term = q.trim().toLowerCase();
  const matches = (languages || []).filter((l) => `${l.name} ${l.own}`.toLowerCase().includes(term));
  const suggested = term ? [] : SUGGESTED_LANGUAGES.map((c) => matches.find((l) => l.code === c)).filter(Boolean);
  const others = matches.filter((l) => !suggested.includes(l));
  const showEnglish = !term || 'english'.includes(term);
  return (
    <div className="notranslate" translate="no">
      <div className="tb-search lang-search"><Search size={15} /><input className="input" autoFocus aria-label="Search languages" placeholder="Search languages" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) onPick(matches[0].code); }} /></div>
      <div className="lang-list">
        {!languages && <div className="lang-empty">Loading languages…</div>}
        {languages && showEnglish && row({ code: '', name: 'English', own: '' })}
        {suggested.length > 0 && <div className="pop-head">Suggested</div>}
        {suggested.map(row)}
        {others.length > 0 && !term && <div className="pop-head">All languages</div>}
        {others.map(row)}
        {languages && term && !matches.length && !showEnglish && <div className="lang-empty">No language matches “{q}”.</div>}
      </div>
      <div className="small muted lang-note">Translated by Google, so page text is sent to Google. Translations can contain mistakes.</div>
    </div>
  );
}

// Opens beside the sidebar. The one home for your profile, Settings, theme and log out.
function AccountPanel({ collapsed, onClose }) {
  const { db, me, role, t, can, labelOf, login, logout, theme, toggleTheme, toast } = useStore();
  const nav = useNavigate();
  const panelItems = ROLE_PANEL[role].filter((k) => can(k));
  const [viewAs, setViewAs] = useState(false);
  const [q, setQ] = useState('');
  useEsc(onClose);
  const active = db.users.filter((u) => u.active);
  const list = active.filter((u) => `${u.name} ${ROLES[u.role]}`.toLowerCase().includes(q.toLowerCase()));
  const go = (to) => { onClose(); nav(to); };
  return (
    <>
      <div className="acct-scrim" onClick={onClose} />
      <aside className={`acct-panel ${collapsed ? 'collapsed' : ''}`} role="dialog" aria-modal="true" aria-label="Your account">
        <div className="acct-head">
          <div className="grow"><div className="ov-title">Your account</div><div className="small muted">Profile, settings and preferences</div></div>
          <Btn kind="ghost" sm icon="X" aria-label="Close" onClick={onClose} />
        </div>
        <div className="acct-body">
          <div className="acct-card">
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={me.name} size={46} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong trunc">{me.name}</div>
                <div className="small muted trunc">{me.title}</div>
                <div className="small muted trunc">{db.settings.companyName} · {ROLES[me.role]}</div>
              </div>
            </div>
            <button type="button" className="acct-row boxed" onClick={() => go('/profile')}><Icon name="UserRound" size={16} /><span className="grow">View my profile</span><ChevronRight size={15} /></button>
          </div>
          {panelItems.length > 0 && (
            <div className="acct-group">
              <div className="pop-head">{labelOf(role === 'admin' ? 'Administration' : 'Workspace')}</div>
              {panelItems.map((k) => (
                <button key={k} type="button" className="acct-row" onClick={() => go(PAGES[k].to)}><Icon name={PAGES[k].icon} size={16} /><span className="grow">{t(k)}<div className="small muted">{PANEL_SUB[k]}</div></span><ChevronRight size={15} /></button>
              ))}
            </div>
          )}
          {active.length > 1 && (
            <div className="acct-group">
              <div className="pop-head">Demo</div>
              <button type="button" className="acct-row" aria-expanded={viewAs} onClick={() => setViewAs((v) => !v)}><Icon name="Eye" size={16} /><span className="grow">View as<div className="small muted">See the CRM as another person</div></span><ChevronRight size={15} style={{ transform: viewAs ? 'rotate(90deg)' : 'none' }} /></button>
              {viewAs && (
                <div style={{ marginTop: 6 }}>
                  <input className="input" autoFocus placeholder="Search users" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
                  {['admin', 'manager', 'sales'].map((r) => {
                    const rows = list.filter((u) => u.role === r);
                    if (!rows.length) return null;
                    return (
                      <div key={r}>
                        <div className="pop-head">{ROLES[r]}</div>
                        {rows.map((u) => (
                          <button key={u.id} type="button" className="pop-item" onClick={() => { login(u.id); go('/'); toast(`Viewing as ${u.name}, ${ROLES[u.role]}`); }}>
                            <Avatar name={u.name} size={26} />
                            <span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{u.name}</div><div className="small muted trunc">{u.title}</div></span>
                            {u.id === me.id && <CheckCircle2 size={15} color="var(--brand)" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="acct-foot">
          <div className="theme-seg" role="group" aria-label="Theme">
            {[['light', 'Light', Sun], ['dark', 'Dark', Moon]].map(([k, l, I]) => (
              <button key={k} type="button" className={theme === k ? 'on' : ''} aria-pressed={theme === k} onClick={() => { if (theme !== k) toggleTheme(); }}><I size={14} />{l}</button>
            ))}
          </div>
          <button type="button" className="btn ghost acct-logout" onClick={logout}><LogOut size={15} />Log out</button>
        </div>
      </aside>
    </>
  );
}

function LanguageMenu() {
  const { toast } = useStore();
  const [language, setChosen] = useState(currentLanguage);
  const pick = (code, close) => {
    close();
    if (code === language) return;
    setChosen(code);
    setLanguage(code);
    if (code) toast('Translating the page. This can take a few seconds.');
  };
  return (
    <Popover width={300} trigger={({ toggle }) => <button type="button" className={`btn ghost lang-btn notranslate ${language ? '' : 'icon'}`} translate="no" title="Language" aria-label={`Language: ${language || 'English'}`} onClick={toggle}><Languages size={17} />{language && <span className="lang-code">{language.split('-')[0].toUpperCase()}</span>}</button>}>
      {(close) => <LanguagePicker current={language} onPick={(code) => pick(code, close)} />}
    </Popover>
  );
}

const BrandMark = () => <span className="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 2.5v19M12 10L5.5 5.5M12 10l6.5-4.5M12 16l-5-3.5M12 16l5-3.5" /></svg></span>;

function CompanySwitcher({ onAdd }) {
  const { db, role, can, labelOf, orgs, orgId, switchOrg, toast } = useStore();
  const nav = useNavigate();
  const brand = <><BrandMark /><span className="brand-text grow trunc"><span className="notranslate" translate="no">{db.settings.companyName} CRM</span><span className="brand-sub">{labelOf(WORKSPACE[role])}</span></span></>;
  if (!can('companies')) return <div className="brand">{brand}</div>;
  return (
    <div className="brand">
      <Popover align="left" width={260} trigger={({ toggle }) => (
        <button type="button" className="brand-switch" onClick={toggle} aria-label={`Switch company, current company ${db.settings.companyName}`}>
          {brand}<ChevronsUpDown className="brand-text" size={15} style={{ flexShrink: 0 }} />
        </button>
      )}>
        {(close) => (
          <div>
            <div className="pop-head">Companies</div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {orgs.map((o) => (
                <button key={o.id} type="button" className="pop-item" onClick={() => { close(); if (o.id === orgId) return; nav('/'); switchOrg(o.id); toast(`Switched to ${o.name}`); }}>
                  <Building2 size={15} /><span className="grow trunc strong">{o.name}</span>
                  {o.id === orgId && <CheckCircle2 size={15} color="var(--brand)" />}
                </button>
              ))}
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }} />
            {can('companies', 'create') && <button type="button" className="pop-item" onClick={() => { close(); onAdd(); }}><Plus size={15} />Add company</button>}
          </div>
        )}
      </Popover>
    </div>
  );
}

const COMPANY_FIELDS = [
  { k: 'name', label: 'Company name', req: true, full: true },
  { k: 'supportEmail', label: 'Support email', type: 'email', full: true },
  { k: 'currency', label: 'Currency', type: 'select', noBlank: true, list: 'currency', full: true },
];
function AddCompany({ onClose }) {
  const { orgs, addOrg, toast } = useStore();
  const nav = useNavigate();
  const [v, setV] = useState({ name: '', supportEmail: '', currency: 'USD' });
  const [errors, setErrors] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const name = v.name.trim();
    const er = validate(COMPANY_FIELDS, v);
    if (name && orgs.some((o) => o.name.toLowerCase() === name.toLowerCase())) er.name = 'A company with this name already exists.';
    setErrors(er);
    if (Object.keys(er).length) return;
    onClose();
    nav('/');
    addOrg({ ...v, name });
    toast(`${name} created. Add its people in Users & roles.`);
  };
  return (
    <Modal title="Add company" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><button type="submit" form="company-form" className="btn primary">Create company</button></>}>
      <form id="company-form" onSubmit={submit} noValidate>
        <p className="sub" style={{ margin: '0 0 14px' }}>The new company starts empty, with its own customers, deals, users and settings. You can switch back at any time.</p>
        <FormFields fields={COMPANY_FIELDS} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
      </form>
    </Modal>
  );
}

function CommandPalette({ onClose }) {
  const { db, scope, role, t, can } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = [
      ...navFor(role, can).flatMap((g) => g.items).map((i) => ({ key: i.to, icon: i.icon, label: t(i.key), sub: 'Go to page', to: i.to })),
      ...ROLE_PANEL[role].filter((k) => can(k)).map((k) => ({ key: PAGES[k].to, icon: PAGES[k].icon, label: t(k), sub: 'Go to page', to: PAGES[k].to })),
      { key: '/profile', icon: 'UserRound', label: 'My profile', sub: 'Go to page', to: '/profile' },
    ];
    if (!s) return pages.slice(0, 9);
    const m = (t) => (t || '').toLowerCase().includes(s);
    return [
      ...pages.filter((p) => m(p.label)),
      ...scope(db.deals).filter((d) => m(d.title)).slice(0, 6).map((d) => ({ key: d.id, icon: 'Kanban', label: d.title, sub: 'Opportunity', to: `/pipeline/${d.id}` })),
      ...scope(db.companies).filter((c) => m(c.name)).slice(0, 6).map((c) => ({ key: c.id, icon: 'Building2', label: c.name, sub: 'Customer', to: `/customers/${c.id}` })),
      ...scope(db.contacts).filter((c) => m(`${c.first} ${c.last}`) || m(c.email)).slice(0, 6).map((c) => ({ key: c.id, icon: 'Contact', label: `${c.first} ${c.last}`, sub: 'Contact', to: `/contacts?open=${c.id}` })),
      ...scope(db.leads).filter((l) => m(l.name) || m(l.company)).slice(0, 5).map((l) => ({ key: l.id, icon: 'Magnet', label: `${l.name}, ${l.company}`, sub: 'Lead', to: `/leads?open=${l.id}` })),
      ...scope(db.orders).filter((o) => m(o.number)).slice(0, 5).map((o) => ({ key: o.id, icon: 'ShoppingCart', label: o.number, sub: 'Order', to: `/orders?open=${o.id}` })),
      ...scope(db.cases).filter((c) => m(c.subject) || m(String(c.number))).slice(0, 5).map((c) => ({ key: c.id, icon: 'LifeBuoy', label: `#${c.number} ${c.subject}`, sub: 'Case', to: `/cases?open=${c.id}` })),
    ];
  }, [q, db, role]);
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const go = (r) => { nav(r.to); onClose(); };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-label="Search">
        <input autoFocus aria-label="Search everything" placeholder="Search deals, customers, contacts, orders, pages…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0]); }} />
        <div className="cmdk-list">
          {results.map((r) => <button key={r.key} type="button" className="pop-item" onClick={() => go(r)}><Icon name={r.icon} size={16} /><span className="grow trunc">{r.label}</span><span className="small muted">{r.sub}</span></button>)}
          {!results.length && <Empty icon="SearchX" text={`No results for “${q}”`} />}
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const { db, me, markRead } = useStore();
  const nav = useNavigate();
  const mine = db.notifications.filter((n) => n.to === me.id);
  const unread = mine.filter((n) => !n.read);
  return (
    <Popover width={340} trigger={({ toggle }) => (
      <button type="button" className="btn ghost icon" aria-label={`Notifications, ${unread.length} unread`} onClick={toggle} style={{ position: 'relative' }}>
        <Bell size={17} />
        {unread.length > 0 && <span style={{ position: 'absolute', top: 3, insetInlineEnd: 3, background: 'var(--bad)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: 'grid', placeItems: 'center' }}>{unread.length}</span>}
      </button>
    )}>
      {(close) => (
        <div>
          <div className="row between" style={{ padding: '4px 8px 8px' }}><strong>Notifications</strong>{unread.length > 0 && <Btn sm kind="ghost" onClick={() => markRead(unread.map((n) => n.id))}>Mark all read</Btn>}</div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {!mine.length && <Empty icon="BellOff" text="You're all caught up." />}
            {mine.slice(0, 12).map((n) => (
              <button key={n.id} type="button" className="pop-item" style={{ alignItems: 'flex-start' }} onClick={() => { markRead([n.id]); close(); if (n.link) nav(n.link); }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, background: n.read ? 'transparent' : 'var(--brand)', flexShrink: 0 }} />
                <span className="grow"><div style={{ fontSize: 13 }}>{n.text}</div><div className="small muted">{relTime(n.at)}</div></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function Shell() {
  const { db, me, role, t, scope, scopeOf, toasts, can, labelOf } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [quick, setQuick] = useState(null);
  const [addingCompany, setAddingCompany] = useState(false);
  const [account, setAccount] = useState(false);
  const loc = useLocation();
  const mainRef = useRef(null);

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const quickItems = [['deal', 'Opportunity', 'Kanban', 'pipeline'], ['lead', 'Lead', 'Magnet', 'leads'], ['contact', 'Contact', 'Contact', 'contacts'], ['company', 'Customer', 'Building2', 'customers']].filter(([, , , m]) => can(m, 'create'));
  const counts = {
    followups: scope(db.followups).filter((f) => f.ownerId === me.id && f.status === 'open' && f.at <= new Date().toISOString()).length,
    messages: !can('messages') ? 0 : db.conversations.filter((c) => (c.kind === 'team' ? c.members.includes(me.id) : c.ownerId === me.id)).reduce((a, c) => a + unreadOf(c, me.id), 0),
    meetings: !can('meetings') ? 0 : db.meetingRequests.filter((r) => r.status === 'Pending' && r.toId === me.id).length,
    tasks: scope(db.activities).filter((a) => a.status !== 'done').length,
    cases: scope(db.cases).filter((c) => ['New', 'Assigned'].includes(c.status)).length,
    transfers: !can('transfers') ? 0 : db.transfers.filter((t) => t.status === 'Pending' && (scopeOf('transfers') === 'all' || (scopeOf('transfers') === 'team' ? db.users.find((u) => u.id === t.fromId)?.teamId === me.teamId : t.requestedBy === me.id || t.fromId === me.id))).length,
  };

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${collapsed ? 'collapsed' : ''} ${open ? 'open' : ''}`} aria-label="Main navigation">
        <CompanySwitcher onAdd={() => setAddingCompany(true)} />
        <nav className="side-nav">
          {navFor(role, can).map((g) => {
            const items = g.items.filter((i) => i.key !== 'leads' || db.settings.useLeads);
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.group}>
                <div className="nav-label">{labelOf(g.group)}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} title={collapsed ? t(i.key) : undefined} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Icon name={i.icon} size={17} /><span className="nav-text trunc">{t(i.key)}</span>
                    {i.count && counts[i.count] > 0 && <span className="nav-count">{counts[i.count]}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <button type="button" className={`side-profile ${loc.pathname === '/profile' || ROLE_PANEL[role].some((k) => PAGES[k].to === loc.pathname) ? 'active' : ''}`} title={collapsed ? me.name : undefined} aria-label={`Open your account, ${me.name}, ${ROLES[me.role]}`} aria-expanded={account} onClick={() => { setOpen(false); setAccount(true); }}>
            <Avatar name={me.name} size={30} />
            <span className="nav-text grow" style={{ minWidth: 0 }}><div className="strong trunc notranslate" translate="no" style={{ fontSize: 13, color: '#fff' }}>{me.name}</div><div className="small trunc" style={{ color: 'var(--side-ink-2)' }}>{ROLES[me.role]}</div></span>
            <ChevronRight className="nav-text" size={15} style={{ flexShrink: 0 }} />
          </button>
        </div>
      </aside>
      <div className="main" ref={mainRef}>
        <header className="topbar">
          <button type="button" className="btn ghost icon menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <button type="button" className="btn ghost icon collapse-btn" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}><PanelLeft size={18} /></button>
          <button type="button" className="search-trigger" onClick={() => setPalette(true)} aria-label="Search"><Search size={15} /><span>Search everything…</span><kbd>Ctrl K</kbd></button>
          <div className="grow" />
          {quickItems.length > 0 && (
            <Popover width={190} trigger={({ toggle }) => <button type="button" className="btn primary" onClick={toggle} aria-label="Create new"><Plus size={16} /><span className="new-label">New</span></button>}>
              {(close) => quickItems.map(([k, l, ic]) => (
                <button key={k} type="button" className="pop-item" onClick={() => { setQuick(k); close(); }}><Icon name={ic} size={15} />{l}</button>
              ))}
            </Popover>
          )}
          <Notifications />
          <LanguageMenu />
        </header>
        <main className="content">
          <PageBoundary resetKey={loc.pathname + me.id}>
          <Routes>
            {Object.entries(PAGES).map(([key, p]) => <Route key={key} path={p.to} element={can(key) ? p.el : <NoAccess />} />)}
            <Route path="/pipeline/:id" element={<DealRecord />} />
            <Route path="/customers/:id" element={<CustomerRecord />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PageBoundary>
        </main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {quick && <RecordQuickCreate kind={quick} onClose={() => setQuick(null)} />}
      {addingCompany && <AddCompany onClose={() => setAddingCompany(false)} />}
      {account && <AccountPanel collapsed={collapsed} onClose={() => setAccount(false)} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast"><CheckCircle2 size={15} />{t.text}</div>)}
      </div>
    </div>
  );
}
function NoAccess() {
  const { me } = useStore();
  return <div className="card"><Empty icon="ShieldAlert" text="You don't have access to this page. Ask your admin if you need it."><Link className="btn" to="/">Back to dashboard</Link></Empty></div>;
}

export default function App() {
  const { me, orgId } = useStore();
  // Keyed by company so no page keeps state from the company you just left.
  return <HashRouter>{me ? <CommsProvider key={orgId}><Shell /></CommsProvider> : <Login />}</HashRouter>;
}
