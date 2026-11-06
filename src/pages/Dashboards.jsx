import { getLocale } from '../util';
import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStore } from '../store';
import { DrillCtx } from '../charts';
import { RecordsDrawer, printPage } from '../drill';
import { DateRange, useDateRange } from '../dateRange';
import { GettingStarted } from '../ease';
import { Badge, Btn, Card, Confirm, Empty, Icon, Modal, PageHead, Pills, Stat } from '../ui';
import { RecordQuickCreate } from '../shared';
import { uid } from '../util';
import { BOARD_TEMPLATES, DEFAULTS, DRILLS, GROUPS, WIDGETS, buildContext, familyOf, typeLabel, widgetOf } from '../widgets';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const dateLine = () => new Date().toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric' });
const SIZES = [{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }, { value: 'f', label: 'Full width' }];
const fresh = (k) => ({ id: uid('w'), k });
const COLUMNS = { s: 3, m: 4, l: 6, f: 12 };
// The last widget in a row grows to fill it, so any mix of sizes leaves no blank space.
const fitRows = (sizes) => {
  const spans = sizes.map((s) => COLUMNS[s]);
  let used = 0;
  spans.forEach((span, i) => {
    if (used + span > 12) { spans[i - 1] += 12 - used; used = 0; }
    used = (used + span) % 12;
  });
  if (used) spans[spans.length - 1] += 12 - used;
  return spans;
};

// One broken widget shows a small message and leaves the rest of the dashboard working.
class WidgetGuard extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Card title={this.props.title}><Empty icon="TriangleAlert" text="This widget couldn't load." /></Card>;
    return this.props.children;
  }
}

function Tile({ w, ctx, onDrill }) {
  const x = w.fn(ctx);
  return <Stat label={w.title} icon={w.icon} {...x} onClick={DRILLS[w.k] ? () => onDrill(w) : undefined} />;
}

// Redrawn only when its own settings or the data change, so moving one widget stays quick with many on screen.
const Widget = React.memo(({ item, w, ctx, setCfg, choices, onChoose, onDrill }) => {
  const { canRoute } = useStore();
  if (w.type === 'section') return <h2 className="wd-section">{w.title}</h2>;
  if (w.type === 'tile') return <Tile w={w} ctx={ctx} onDrill={onDrill} />;
  if (w.bare) return <w.C ctx={ctx} />;
  const link = w.to && canRoute(w.to) ? <Link className="small nowrap" to={w.to}>View all</Link> : null;
  return (
    <Card title={choices.length > 1
      ? <span className="wd-pick-wrap"><span className="nowrap">{w.title}</span><Icon name="ChevronDown" size={14} color="var(--ink-3)" style={{ flexShrink: 0 }} /><select className="wd-pick" aria-label={`What this chart shows: ${w.title}`} value={w.k} onChange={(e) => onChoose(e.target.value)}>{choices.map((x) => <option key={x.k} value={x.k}>{x.title}</option>)}</select></span>
      : item.cfg?.name || w.title} sub={w.sub} action={link} pad={w.pad !== false}>
      <DrillCtx.Provider value={DRILLS[w.k]?.key ? (label) => onDrill(w, label) : null}>
        {w.Explorer ? <w.Explorer cfg={item.cfg} setCfg={setCfg} range={ctx.range} /> : <w.C ctx={ctx} />}
      </DrillCtx.Provider>
    </Card>
  );
}, (a, b) => a.ctx === b.ctx && a.item.id === b.item.id && a.item.k === b.item.k && a.item.cfg === b.item.cfg && a.choices.map((x) => x.k).join() === b.choices.map((x) => x.k).join());

function NewBoard({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('sales');
  return (
    <Modal size="sm" title="New dashboard" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), from)}>Create</Btn></>}>
      <div className="stack">
        <div className="field"><label className="label" htmlFor="board-name">Name</label><input id="board-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Monthly review" /></div>
        <div className="field"><label className="label" htmlFor="board-from">Start from</label><select id="board-from" className="select" value={from} onChange={(e) => setFrom(e.target.value)}>{Object.entries(BOARD_TEMPLATES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select></div>
      </div>
    </Modal>
  );
}

function ShareBoard({ board, onSave, onClose }) {
  const [roles, setRoles] = useState(board.roles || []);
  const opts = [['admin', 'Admins'], ['manager', 'Managers'], ['sales', 'Sales people']];
  return (
    <Modal size="sm" title={`Share ${board.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={() => onSave(roles)}>Save</Btn></>}>
      <div className="stack-s">
        {opts.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={roles.includes(k)} onChange={() => setRoles((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))} />{l}</label>)}
        <p className="small muted" style={{ margin: '6px 0 0' }}>They see the same layout, filled with only the records they're allowed to see. Only you can change it.</p>
      </div>
    </Modal>
  );
}

function AddWidgets({ items, available, onAdd, onRemove, onClose }) {
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const groups = ['All', ...GROUPS.filter((g) => available.some((w) => w.group === g))];
  const shown = available.filter((w) => (group === 'All' || w.group === group) && `${w.title} ${w.sub || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal size="lg" title="Add widgets" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Done</Btn>}>
      <div className="stack-s">
        <div className="row wrap between">
          <div className="tb-search grow"><Search size={15} /><input className="input" aria-label="Search widgets" placeholder={`Search ${available.length} widgets…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="small muted">{items.length} on your dashboard</span>
        </div>
        <Pills value={group} onChange={setGroup} options={groups} />
        <div className="wd-lib">
          {shown.map((w) => {
            const placed = items.filter((x) => x.k === w.k);
            const on = placed.length > 0;
            return (
              <div key={w.k} className={`wd-lib-item ${on ? 'on' : ''}`}>
                <span className="kpi-ico"><Icon name={w.icon} size={16} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="strong trunc">{w.title}</div>
                  <div className="small muted trunc">{typeLabel(w)}{w.sub ? ` · ${w.sub}` : ''}</div>
                </div>
                {w.multi && on && <Badge tone="muted" dot={false}>{placed.length}</Badge>}
                {on && !w.multi
                  ? <Btn sm icon="Check" aria-label={`Remove ${w.title}`} onClick={() => onRemove(placed[0].id)}>Added</Btn>
                  : <Btn sm icon="Plus" aria-label={`Add ${w.title}`} onClick={() => onAdd(w.k)}>Add</Btn>}
              </div>
            );
          })}
          {!shown.length && <Empty icon="Search" text="No widget matches that." />}
        </div>
      </div>
    </Modal>
  );
}

export default function Dashboard() {
  const { db, me, role, can, sec, scope, t, saveDashboard, saveBoards, companyName, userName, toast } = useStore();
  const [boardId, setBoardId] = useState('main');
  const [newBoard, setNewBoard] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [who, setWho] = useState('');
  const [drill, setDrill] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [quick, setQuick] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [range, setRange] = useDateRange('Current Fiscal Year');
  // Admins can narrow to a team or a person, and managers to someone on their team.
  const teams = role === 'admin' ? db.teams : [];
  const people = role === 'sales' ? [] : db.users.filter((u) => u.active && u.role !== 'admin' && (role === 'admin' || u.teamId === me.teamId));
  const ids = !who ? null : new Set(who.startsWith('t:') ? db.users.filter((u) => u.teamId === who.slice(2)).map((u) => u.id) : [who]);
  // Only the records count here. Saving a layout changes `db` too, and must not redraw every chart.
  const ctx = useMemo(() => buildContext({ db, me, scope, can, range, ids, names: { companyName, userName } }), [range, who, db.deals, db.leads, db.orders, db.invoices, db.payments, db.cases, db.calls, db.activities, db.followups, db.shipments, db.events, db.aiCalls, db.products, db.users, db.teams, db.transfers, db.stages, db.audit, db.permissions, me.id]);

  // Access control can turn a whole module or a dashboard section off, so the library shrinks with it.
  const allowed = (w) => (w.module === 'dashboard' || can(w.module)) && sec('dashboard', w.sec) && (!w.needs || can(...w.needs)) && (!w.secOf || sec(...w.secOf));
  const available = WIDGETS.filter(allowed);
  const boards = (db.boards || []).filter((b) => b.ownerId === me.id || b.roles?.includes(role));
  const board = boards.find((b) => b.id === boardId);
  const myBoard = board?.ownerId === me.id;
  const readOnly = board && !myBoard;
  const saved = board ? board.items : db.dashboards?.[me.id];
  // Each chart appears once, even in a layout saved before this rule. Only the Chart builder can repeat.
  const seen = new Set();
  const items = (saved || (DEFAULTS[role] || DEFAULTS.sales).map((k) => ({ id: k, k }))).filter((x) => {
    const w = widgetOf(x.k);
    if (!w || !allowed(w) || (!w.multi && seen.has(x.k))) return false;
    seen.add(x.k);
    return true;
  });

  const latest = useRef(items);
  latest.current = items;
  // A heading with nothing under it, because of permissions or removed widgets, is left out.
  const visible = items.filter((x, i) => widgetOf(x.k).type !== 'section' || (items[i + 1] && widgetOf(items[i + 1].k).type !== 'section'));
  const spans = fitRows(visible.map((x) => x.size || widgetOf(x.k).size));
  const save = (next) => { if (board) saveBoards((db.boards || []).map((b) => (b.id === board.id ? { ...b, items: next } : b))); else saveDashboard(next); };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const onDrill = useRef((w, label) => {
    const def = DRILLS[w.k];
    const c = ctxRef.current;
    const rows = def.rows(c);
    setDrill({ title: label ? `${w.title}: ${label}` : w.title, kind: def.kind, rows: label ? rows.filter((r) => def.key(r, c) === label) : rows });
  }).current;
  const createBoard = (name, from) => {
    const id = uid('b');
    saveBoards([...(db.boards || []), { id, name, ownerId: me.id, roles: [], items: BOARD_TEMPLATES[from].items.map((k) => ({ id: uid('w'), k })) }]);
    setBoardId(id); setNewBoard(false); toast('Dashboard created');
  };
  const add = (k) => { save([fresh(k), ...items]); };
  const remove = (id) => save(items.filter((x) => x.id !== id));
  const change = (id, patch) => save(latest.current.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (id, by) => {
    const i = items.findIndex((x) => x.id === id);
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const dropOn = (id) => {
    if (!dragId || dragId === id) return;
    const next = items.filter((x) => x.id !== dragId);
    next.splice(items.findIndex((x) => x.id === id), 0, items.find((x) => x.id === dragId));
    save(next);
    setDragId(null);
  };

  const head = role === 'sales'
    ? { title: `${greeting()}, ${me.name.split(' ')[0]}`, sub: dateLine() }
    : { title: role === 'manager' ? db.teams.find((x) => x.id === me.teamId)?.name || t('dashboard') : t('dashboard'), sub: `${db.settings.companyName} · ${dateLine()}` };

  return (
    <div>
      <PageHead title={head.title} sub={head.sub}>
        <DateRange value={range} onChange={setRange} />
        {people.length > 0 && <select className="select tb-filter" aria-label="Show data for" value={who} onChange={(e) => setWho(e.target.value)}><option value="">{role === 'admin' ? 'Whole company' : 'Whole team'}</option>{teams.length > 0 && <optgroup label="Teams">{teams.map((x) => <option key={x.id} value={`t:${x.id}`}>{x.name}</option>)}</optgroup>}<optgroup label="People">{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup></select>}
        {editing ? (
          <>
            <Btn icon="RotateCcw" onClick={() => setResetting(true)}>Reset</Btn>
            <Btn icon="Plus" onClick={() => setAdding(true)}>Add widgets</Btn>
            <Btn kind="primary" icon="Check" onClick={() => setEditing(false)}>Done</Btn>
          </>
        ) : (
          <>
            {role === 'sales' && can('leads', 'create') && <Btn icon="Magnet" onClick={() => setQuick('lead')}>New lead</Btn>}
            {role === 'sales' && can('pipeline', 'create') && <Btn icon="Plus" onClick={() => setQuick('deal')}>New opportunity</Btn>}
            <Btn icon="Printer" className="no-print" onClick={printPage}>Print or PDF</Btn>
            {!readOnly && <Btn kind="primary" icon="LayoutDashboard" onClick={() => setEditing(true)}>Customize</Btn>}
          </>
        )}
      </PageHead>
      <GettingStarted />
      <div className="wd-boards no-print">
        <Pills value={board ? board.id : 'main'} onChange={(k) => { setBoardId(k); setEditing(false); }} options={[{ k: 'main', label: 'Overview' }, ...boards.map((b) => ({ k: b.id, label: b.name }))]} />
        <Btn sm icon="Plus" onClick={() => setNewBoard(true)}>New dashboard</Btn>
        {myBoard && role !== 'sales' && <Btn sm icon="Share2" onClick={() => setSharing(true)}>{board.roles?.length ? 'Shared' : 'Share'}</Btn>}
        {myBoard && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${board.name}`} onClick={() => setRemoving(true)} />}
        {readOnly && <span className="small muted">Shared with you by {userName(board.ownerId)}</span>}
      </div>
      <p className="small muted wd-note">Compared with the same number of days before. Open deals, unpaid invoices, stock and to-dos always show today's position.</p>
      {editing && <p className="notice" style={{ marginTop: 0 }}>Drag a widget to move it, change its size, or remove it. Your layout is only for you, and it's saved as you go.</p>}
      {!items.length && <div className="card"><Empty icon="LayoutDashboard" text="Your dashboard is empty. Choose Customize, then Add widgets." /></div>}
      <div className={`wd-grid ${editing ? 'editing' : ''}`}>
        {visible.map((item, i) => {
          const w = widgetOf(item.k);
          const size = item.size || w.size;
          return (
            <div key={item.id} className={`wd wd-${size} ${dragId === item.id ? 'dragging' : ''}`} style={{ '--span': spans[i] }} draggable={editing} onDragStart={() => setDragId(item.id)} onDragEnd={() => setDragId(null)} onDragOver={(e) => { if (editing) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(item.id); }}>
              {editing && (
                <div className="wd-bar">
                  <Icon name="GripVertical" size={15} color="var(--ink-3)" />
                  <span className="small strong trunc grow">{w.title}</span>
                  <select className="select wd-size" aria-label={`Size of ${w.title}`} value={size} onChange={(e) => change(item.id, { size: e.target.value })}>{SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                  <Btn sm kind="ghost" icon="ArrowLeft" aria-label={`Move ${w.title} earlier`} disabled={i === 0} onClick={() => move(item.id, -1)} />
                  <Btn sm kind="ghost" icon="ArrowRight" aria-label={`Move ${w.title} later`} disabled={i === visible.length - 1} onClick={() => move(item.id, 1)} />
                  <Btn sm kind="ghost" icon="X" aria-label={`Remove ${w.title}`} onClick={() => remove(item.id)} />
                </div>
              )}
              <WidgetGuard key={item.k} title={w.title}><Widget item={item} w={w} ctx={ctx} setCfg={(cfg) => change(item.id, { cfg })} choices={available.filter((x) => familyOf(w.k).includes(x.k) && (x.k === w.k || !seen.has(x.k)))} onChoose={(k) => change(item.id, { k, size })} onDrill={onDrill} /></WidgetGuard>
            </div>
          );
        })}
      </div>
      {adding && <AddWidgets items={items} available={available.filter((w) => !w.hidden)} onAdd={add} onRemove={remove} onClose={() => setAdding(false)} />}
      {resetting && <Confirm title="Reset your dashboard?" text={`It goes back to the standard layout for your role. Only your own dashboard changes.`} confirmLabel="Reset" onClose={() => setResetting(false)} onConfirm={() => { if (board) save([]); else saveDashboard(null); toast('Dashboard reset'); }} />}
      {quick && <RecordQuickCreate kind={quick} onClose={() => setQuick(null)} />}
      {drill && <RecordsDrawer {...drill} onClose={() => setDrill(null)} />}
      {newBoard && <NewBoard onCreate={createBoard} onClose={() => setNewBoard(false)} />}
      {sharing && board && <ShareBoard board={board} onClose={() => setSharing(false)} onSave={(roles) => { saveBoards(db.boards.map((b) => (b.id === board.id ? { ...b, roles } : b))); setSharing(false); toast(roles.length ? 'Dashboard shared' : 'Dashboard is private'); }} />}
      {removing && board && <Confirm title={`Delete ${board.name}?`} text="It's removed for everyone it was shared with." onClose={() => setRemoving(false)} onConfirm={() => { saveBoards(db.boards.filter((b) => b.id !== board.id)); setBoardId('main'); toast('Dashboard deleted'); }} />}
    </div>
  );
}
