// Things that make the CRM easier to learn and faster to use: the tour, help, the getting-started list and keyboard shortcuts.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { Btn, Card, Drawer, Icon, Progress } from './ui';

/* ---------- Keyboard shortcuts ---------- */
const GO_KEYS = { d: ['/', 'Dashboard'], i: ['/insights', 'Insights'], p: ['/pipeline', 'Deals'], l: ['/leads', 'Leads'], c: ['/contacts', 'Contacts'], u: ['/customers', 'Customers'], o: ['/orders', 'Orders'], b: ['/billing', 'Quotes and invoices'], t: ['/tasks', 'Tasks'], m: ['/messages', 'Chat'] };
export const SHORTCUTS = [
  ['Ctrl K or /', 'Search and run commands'],
  ['N', 'Create something new'],
  ['?', 'Open help'],
  ['A', 'Ask the assistant'],
  ...Object.entries(GO_KEYS).map(([k, [, label]]) => [`G then ${k.toUpperCase()}`, `Go to ${label}`]),
];
const typing = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

export function useShortcuts({ onSearch, onNew, onHelp, onAsk }) {
  const { canRoute } = useStore();
  const nav = useNavigate();
  const waiting = useRef(0);
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onSearch(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('[role="dialog"]')) return;
      if (Date.now() - waiting.current < 1200) {
        waiting.current = 0;
        const go = GO_KEYS[e.key.toLowerCase()];
        if (go && canRoute(go[0])) { e.preventDefault(); nav(go[0]); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); onSearch(); } else if (e.key === '?') { e.preventDefault(); onHelp(); } else if (e.key.toLowerCase() === 'a') { e.preventDefault(); onAsk?.(); } else if (e.key.toLowerCase() === 'n') { e.preventDefault(); onNew(); } else if (e.key.toLowerCase() === 'g') waiting.current = Date.now();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onSearch, onNew, onHelp, onAsk, canRoute]);
}

/* ---------- Getting started ---------- */
const seen = (prefs, to) => (prefs.visited || []).includes(to);
const STEPS = {
  admin: [['/settings', 'Check your company details', 'Name, currency, tax and fiscal year.'], ['/users', 'Review your people', 'Add users and set their roles.'], ['/access', 'Decide who can do what', 'Turn pages and actions on or off for each role.'], ['/teams', 'Set up your sales teams', 'Leaders, members and targets.'], ['/insights', 'Read your business insights', 'What to act on, and what is working.']],
  manager: [['/teams', 'Check your team', 'Members, targets and pipeline.'], ['/pipeline', 'Review the team pipeline', 'See deals by stage.'], ['/transfers', 'See what needs approval', 'Requests to move records.'], ['/insights', 'Read your team insights', 'Who is on track, and who needs support.']],
  sales: [['/followups', 'See your follow-ups', 'Who to contact today.'], ['/pipeline', 'Open your pipeline', 'Drag deals between stages.'], ['/leads', 'Check your leads', 'Highest score first.'], ['/calls', 'Try the dialer', 'Calls are logged for you.'], ['/insights', 'See how you are doing', 'Progress against your target.']],
};
export function checklistFor(role, prefs, db, me, canRoute) {
  const pages = (STEPS[role] || STEPS.sales).filter(([to]) => canRoute(to)).map(([to, title, text]) => ({ key: to, to, title, text, done: seen(prefs, to) }));
  return [
    ...pages,
    { key: 'layout', to: '/', title: 'Make the dashboard yours', text: 'Press Customize, then add or move widgets.', done: !!db.dashboards?.[me.id] },
    { key: 'search', title: 'Try search', text: 'Press Ctrl K and type anything.', done: !!prefs.usedSearch },
  ];
}

export function Checklist({ onClose }) {
  const { db, me, role, prefs, canRoute } = useStore();
  const items = checklistFor(role, prefs, db, me, canRoute);
  return (
    <div className="gs-list">
      {items.map((x) => {
        const body = <><span className={`gs-tick ${x.done ? 'on' : ''}`}><Icon name={x.done ? 'Check' : 'Circle'} size={13} /></span><span className="grow" style={{ minWidth: 0 }}><span className={`strong ${x.done ? 'gs-done' : ''}`} style={{ display: 'block' }}>{x.title}</span><span className="small muted">{x.text}</span></span></>;
        return x.to ? <Link key={x.key} to={x.to} className="gs-item" onClick={onClose}>{body}<Icon name="ChevronRight" size={15} color="var(--ink-3)" /></Link> : <div key={x.key} className="gs-item">{body}</div>;
      })}
    </div>
  );
}

// Sits on the dashboard until it's finished or dismissed.
export function GettingStarted() {
  const { db, me, role, prefs, canRoute, savePrefs } = useStore();
  const items = checklistFor(role, prefs, db, me, canRoute);
  const done = items.filter((x) => x.done).length;
  if (prefs.hideChecklist || done === items.length) return null;
  const next = items.find((x) => !x.done);
  return (
    <section className="card gs-card">
      <span className="stat-ico" style={{ width: 36, height: 36 }}><Icon name="Rocket" size={18} /></span>
      <div className="grow" style={{ minWidth: 200 }}>
        <div className="strong">Getting started: {done} of {items.length} done</div>
        <div className="small muted">Next: {next.title}. {next.text}</div>
        <div style={{ marginTop: 8, maxWidth: 360 }}><Progress value={(done / items.length) * 100} /></div>
      </div>
      {next.to ? <Link className="btn primary" to={next.to}>Continue</Link> : null}
      <Btn kind="ghost" onClick={() => savePrefs({ hideChecklist: true })}>Hide</Btn>
    </section>
  );
}

/* ---------- Help ---------- */
const TIPS = {
  '/': ['Press Customize to add, remove, move or resize widgets.', 'Click a chart title to switch what it shows.', 'The date filter at the top changes the charts and most numbers.'],
  '/insights': ['Start with the headline, then What to do next.', 'Use the date filter to compare another period.', 'Open the Employees tab to see each person.'],
  '/pipeline': ['Drag a card to move a deal to another stage.', 'The list view has a date filter and saved views.', 'Open a deal to see its summary and risks.'],
  '/leads': ['Leads with the highest score are the most promising.', 'Import brings in a CSV file and checks for duplicates.', 'Save a filter you use often under Views.'],
  '/contacts': ['Use the filter panel on the left to narrow the list.', 'Open a contact to call, message or add a follow-up.', 'Import brings in a CSV file.'],
  '/customers': ['Open a customer to see contacts, sales and support together.', 'The Customer portal button opens their private page.'],
  '/orders': ['Open an order to see its step, invoices and shipments.', 'A warning appears if an order line is above stock.'],
  '/calendar': ['Drag an appointment to move it.', 'Use Team to find a time when everyone is free.'],
  '/billing': ['Open an invoice to see what is paid or send a reminder.', 'The Receivables tab shows who owes what and for how long.'],
  '/calls': ['All calling here is simulated, and every call is logged.', 'Use Simulate a customer calling to see an incoming call.'],
  '/ai-voice': ['Press Test call to talk to an agent by typing.', 'A campaign calls a whole group with one agent.'],
  '/messages': ['Press the + button to start a chat or a group.', 'The i button shows details about the person or group.'],
  '/whatsapp': ['Sending opens WhatsApp with your message ready.', 'Use a template to save typing.'],
  '/access': ['Change a role, or override it for one person.', 'New role creates a custom role from an existing one.'],
  '/settings': ['Dropdown options lets you edit every list in the CRM.', 'The Data tab holds backups and restore.'],
  '/reports/custom': ['Choose the data, grouping and chart, then save it.', 'Pin a report to show it on your home screen.'],
};
const GENERAL_TIPS = ['Press Ctrl K to find any record or page.', 'Hover over a menu item and press the star to add it to Favourites.', 'Save a table filter under Views to reuse it.'];

export function HelpPanel({ onClose, onTour }) {
  const loc = useLocation();
  const tips = TIPS[loc.pathname] || GENERAL_TIPS;
  return (
    <Drawer title="Help" onClose={onClose}>
      <div className="stack">
        <Card title="On this page"><ul className="plain-list">{tips.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title="Getting started"><Checklist onClose={onClose} /></Card>
        <Card title="Keyboard shortcuts" pad={false}><div className="tb-wrap"><table className="table"><tbody>{SHORTCUTS.map(([k, what]) => <tr key={k}><td className="nowrap"><kbd className="kbd">{k}</kbd></td><td>{what}</td></tr>)}</tbody></table></div></Card>
        <div className="row wrap"><Btn icon="Map" onClick={() => { onClose(); onTour(); }}>Take the tour again</Btn><Link className="btn" to="/profile" onClick={onClose}>My profile</Link></div>
      </div>
    </Drawer>
  );
}

/* ---------- Tour ---------- */
const TOUR = [
  { sel: '.search-trigger', title: 'Find anything', text: 'Search every record and page, or run a command. Press Ctrl K from anywhere.' },
  { sel: '[aria-label="Create new"]', title: 'Create in one click', text: 'Add a lead, deal, contact or customer from any page.' },
  { sel: '.side-nav', title: 'Your menu', text: 'It only shows what you can use. Hover over an item and press the star to keep it at the top.' },
  { sel: '.dr', title: 'Filter by date', text: 'Pick a period or any two dates. This same filter appears across the CRM.' },
  { sel: '[aria-label="Open help"]', title: 'Help is always here', text: 'See tips for the page you are on, your getting-started list and all shortcuts.' },
];

export function Tour({ onDone }) {
  const { me } = useStore();
  const [step, setStep] = useState(-1);
  const [box, setBox] = useState(null);
  const steps = TOUR.filter((s) => { const el = document.querySelector(s.sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > 0; });
  const cur = steps[step];
  const cardRef = useRef(null);
  useLayoutEffect(() => {
    if (!cur) { setBox(null); return; }
    const el = document.querySelector(cur.sel);
    el?.scrollIntoView?.({ block: 'nearest' });
    setBox(el?.getBoundingClientRect() || null);
  }, [step]);
  useEffect(() => {
    cardRef.current?.querySelector('.btn.primary')?.focus();
    const esc = (e) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [step]);
  if (step < 0) {
    return (
      <div className="overlay tour-layer">
        <div className="modal sm tour-welcome" role="dialog" aria-modal="true" aria-label="Welcome" ref={cardRef}>
          <span className="stat-ico" style={{ width: 44, height: 44 }}><Icon name="Sparkles" size={22} /></span>
          <h2 style={{ margin: '12px 0 4px', fontSize: 19 }}>Welcome, {me.name.split(' ')[0]}</h2>
          <p className="sub" style={{ margin: 0 }}>A quick look around takes about 30 seconds.</p>
          <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}><Btn onClick={onDone}>Skip</Btn><Btn kind="primary" onClick={() => setStep(0)}>Show me around</Btn></div>
        </div>
      </div>
    );
  }
  if (!cur) { onDone(); return null; }
  const below = box && box.bottom + 190 < window.innerHeight;
  const pos = box ? { top: below ? box.bottom + 12 : Math.max(12, box.top - 190), left: Math.max(12, Math.min(box.left, window.innerWidth - 332)) } : { top: 80, left: 12 };
  if (box && box.height > window.innerHeight * 0.6) { pos.top = 80; pos.left = Math.min(box.right + 12, window.innerWidth - 332); }
  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label={cur.title}>
      {box && <div className="tour-hole" style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }} />}
      <div className="card tour-card" style={pos} ref={cardRef}>
        <div className="small muted">Step {step + 1} of {steps.length}</div>
        <div className="strong" style={{ fontSize: 15, margin: '2px 0 4px' }}>{cur.title}</div>
        <p className="sub" style={{ margin: 0 }}>{cur.text}</p>
        <div className="row between" style={{ marginTop: 12 }}>
          <Btn sm kind="ghost" onClick={onDone}>Skip</Btn>
          <span className="row">{step > 0 && <Btn sm onClick={() => setStep(step - 1)}>Back</Btn>}<Btn sm kind="primary" onClick={() => (step + 1 < steps.length ? setStep(step + 1) : onDone())}>{step + 1 < steps.length ? 'Next' : 'Done'}</Btn></span>
        </div>
      </div>
    </div>
  );
}
