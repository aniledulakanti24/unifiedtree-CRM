import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lock, RotateCcw, Search } from 'lucide-react';
import { ROLES, useStore } from '../store';
import { Avatar, Badge, Btn, Card, Confirm, PageHead, Pills, Tabs } from '../ui';
import { ACTIONS, MODULES, SCOPES, allActions, effective, isLocked, normalize, sectionsFor } from '../permissions';

const GROUPS = [...new Set(MODULES.map((m) => m.group))];

function Tick({ label, checked, disabled, locked, onChange }) {
  if (locked) return <span title="Always on for Admin, so nobody gets locked out"><Lock size={14} color="var(--ink-3)" aria-label={`${label}: locked on`} /></span>;
  return <input type="checkbox" aria-label={label} checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />;
}

function SectionPanel({ m, role, value, onChange }) {
  const list = sectionsFor(m, role);
  const hidden = value.hidden || [];
  const keys = list.map((s) => s.k);
  const groups = [...new Set(list.map((s) => s.group))];
  const put = (next) => onChange(m, { ...value, hidden: next });
  return (
    <div className="section-panel">
      <div className="row between wrap" style={{ marginBottom: 8 }}>
        <span className="small sub">Tick what {m.label} shows. Anything unticked disappears straight away.</span>
        <span className="row">
          <Btn sm onClick={() => put(hidden.filter((k) => !keys.includes(k)))}>Assign all</Btn>
          <Btn sm onClick={() => put([...new Set([...hidden, ...keys])])}>Revoke all</Btn>
        </span>
      </div>
      <div className="section-groups">
        {groups.map((g) => (
          <div key={g}>
            <div className="filter-title">{g}</div>
            <div className="stack-s">
              {list.filter((s) => s.group === g).map((s) => (
                <label key={s.k} className="check small"><input type="checkbox" aria-label={`${m.label} ${s.label}`} checked={!hidden.includes(s.k)} onChange={(e) => put(e.target.checked ? hidden.filter((k) => k !== s.k) : [...hidden, s.k])} />{s.label}</label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Matrix({ role, valueOf, isCustom, onChange, onResetRow }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="tb-wrap">
      <table className="table access-table">
        <thead>
          <tr>
            <th>Module</th>
            {ACTIONS.map(([k, l]) => <th key={k} className="c">{l}</th>)}
            <th>Sections & tabs</th>
            <th>Special permissions</th>
            <th style={{ width: 150 }}>Data they can see</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g) => (
            <React.Fragment key={g}>
              <tr className="access-group"><td colSpan={8}>{g}</td></tr>
              {MODULES.filter((m) => m.group === g).map((m) => {
                const v = valueOf(m);
                const custom = isCustom?.(m);
                const set = (a, on) => onChange(m, normalize(m, { ...v, [a]: on }, a));
                const list = sectionsFor(m, role);
                const on = list.filter((s) => !(v.hidden || []).includes(s.k)).length;
                const off = m.actions.includes('view') && !v.view;
                const isOpen = open.has(m.key) && !off;
                return (
                  <React.Fragment key={m.key}>
                    <tr className={custom ? 'access-custom' : ''}>
                      <td>
                        <div className="row"><span className="strong">{m.label}</span>{custom && <Badge tone="violet" dot={false}>Custom</Badge>}{custom && <button type="button" className="link-btn" onClick={() => onResetRow(m)}>Reset</button>}</div>
                        {m.note && <div className="small muted">{m.note}</div>}
                      </td>
                      {ACTIONS.map(([a, l]) => (
                        <td key={a} className="c">{m.actions.includes(a) ? <Tick label={`${m.label}: ${l}`} checked={v[a]} locked={isLocked(m, a, role)} onChange={(x) => set(a, x)} /> : <span className="muted">—</span>}</td>
                      ))}
                      <td>
                        {list.length ? (
                          <button type="button" className="btn sm nowrap" aria-expanded={isOpen} aria-label={`${m.label}: sections and tabs`} disabled={off} onClick={() => toggle(m.key)}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{on === list.length ? `All ${list.length}` : `${on} of ${list.length}`}
                          </button>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <div className="row wrap" style={{ gap: '4px 12px' }}>
                          {(m.extra || []).map(([a, l]) => <label key={a} className="check small"><input type="checkbox" checked={!!v[a]} onChange={(e) => set(a, e.target.checked)} />{l}</label>)}
                          {!m.extra && <span className="muted">—</span>}
                        </div>
                      </td>
                      <td>
                        {m.scoped ? (
                          <select className="select" style={{ height: 30 }} aria-label={`${m.label}: data scope`} disabled={off} value={v.scope} onChange={(e) => onChange(m, { ...v, scope: e.target.value })}>
                            {SCOPES.filter(([k]) => !m.scopes || m.scopes.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        ) : <span className="muted">—</span>}
                      </td>
                    </tr>
                    {isOpen && <tr><td colSpan={8} style={{ padding: 0 }}><SectionPanel m={m} role={role} value={v} onChange={onChange} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesTab() {
  const { db, setRolePermission, applyRolePreset, login, toast } = useStore();
  const nav = useNavigate();
  const [role, setRole] = useState('sales');
  const [ask, setAsk] = useState(null);
  const sample = db.users.find((u) => u.role === role && u.active);
  const count = db.users.filter((u) => u.role === role).length;
  const PRESETS = { full: ['Give full access?', 'Every action on every module, for everyone in this role. Data scope stays as it is.'], view: ['Make this role view-only?', 'They keep every module they can see now, but cannot change anything.'], none: ['Remove all access?', 'They will only see their home screen until you grant something.'], reset: ['Restore the default access?', 'This role goes back to its original permissions. Personal changes for individual people are kept.'] };
  return (
    <Card pad={false}>
      <div className="tb-toolbar">
        <Pills value={role} onChange={setRole} options={Object.entries(ROLES).map(([k, label]) => ({ k, label }))} />
        <span className="sub">{count} {count === 1 ? 'person' : 'people'} in this role</span>
        <div className="grow" />
        <Btn sm onClick={() => setAsk('full')}>Full access</Btn>
        <Btn sm onClick={() => setAsk('view')}>View only</Btn>
        <Btn sm onClick={() => setAsk('none')}>No access</Btn>
        <Btn sm icon="RotateCcw" onClick={() => setAsk('reset')}>Restore defaults</Btn>
        {sample && role !== 'admin' && <Btn sm icon="Eye" onClick={() => { login(sample.id); nav('/'); toast(`Viewing as ${sample.name}. Switch back with "View as" in your account panel.`); }}>Preview as {sample.name.split(' ')[0]}</Btn>}
      </div>
      <Matrix role={role} valueOf={(m) => db.permissions.roles[role][m.key]} onChange={(m, next) => setRolePermission(role, m.key, next)} />
      {ask && <Confirm title={PRESETS[ask][0]} text={PRESETS[ask][1]} danger={ask === 'none'} confirmLabel="Apply" onClose={() => setAsk(null)} onConfirm={() => { applyRolePreset(role, ask); toast('Access updated'); }} />}
    </Card>
  );
}

function PeopleTab({ initial }) {
  const { db, setUserPermission, clearUserPermissions, login, toast } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [id, setId] = useState(initial || db.users.find((u) => u.role === 'sales')?.id);
  const list = db.users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  const user = db.users.find((u) => u.id === id);
  const customCount = (uid) => Object.keys(db.permissions.users[uid] || {}).length;
  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)' }}>
      <div className="card" style={{ padding: 10 }}>
        <div className="tb-search" style={{ maxWidth: 'none', marginBottom: 8 }}><Search size={15} /><input className="input" aria-label="Search people" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.map((u) => (
          <button key={u.id} type="button" className={`pop-item ${u.id === id ? 'selected' : ''}`} aria-current={u.id === id} onClick={() => setId(u.id)}>
            <Avatar name={u.name} size={28} />
            <span className="grow"><div className="strong trunc">{u.name}</div><div className="small muted">{ROLES[u.role]}</div></span>
            {customCount(u.id) > 0 && <Badge tone="violet" dot={false}>{customCount(u.id)}</Badge>}
          </button>
        ))}
      </div>
      {user && (
        <Card pad={false}>
          <div className="tb-toolbar">
            <Avatar name={user.name} size={34} />
            <div><div className="strong">{user.name}</div><div className="small muted">Starts from the {ROLES[user.role]} role. Changes here apply to this person only.</div></div>
            <div className="grow" />
            {customCount(user.id) > 0 && <Btn sm icon="RotateCcw" onClick={() => { clearUserPermissions(user.id); toast('Back to role access'); }}>Reset to role</Btn>}
            {user.role !== 'admin' && <Btn sm icon="Eye" onClick={() => { login(user.id); nav('/'); toast(`Viewing as ${user.name}. Switch back with "View as" in your account panel.`); }}>Preview</Btn>}
          </div>
          <Matrix role={user.role}
            valueOf={(m) => effective(db.permissions, user, m.key)}
            isCustom={(m) => !!db.permissions.users[user.id]?.[m.key]}
            onChange={(m, next) => setUserPermission(user.id, m.key, next)}
            onResetRow={(m) => setUserPermission(user.id, m.key, null)} />
        </Card>
      )}
    </div>
  );
}

export default function Access() {
  const { t, can } = useStore();
  const [params] = useSearchParams();
  const initialUser = params.get('user');
  const [tab, setTab] = useState(initialUser ? 'people' : 'roles');
  return (
    <div>
      <PageHead title={t('access')} sub="You decide which modules, sections and tabs each role and person gets, and what they can view and edit. Changes apply straight away and are recorded in the audit log." />
      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'roles', label: 'Roles', icon: 'ShieldCheck' }, { k: 'people', label: 'Individual people', icon: 'UserCog' }]} />
      <fieldset disabled={!can('access', 'edit')} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {tab === 'roles' ? <RolesTab /> : <PeopleTab initial={initialUser} />}
      </fieldset>
    </div>
  );
}
