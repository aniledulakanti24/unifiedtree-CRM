import React, { useMemo, useState } from 'react';
import { ROLES, roleNameOf, useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Empty, Modal, Pills, UserChip } from '../ui';
import { ACTIONS, MODULES, MODULE_BY_KEY, SCOPES, allActions, effective } from '../permissions';
import { applyFormConfig } from '../engine';
import { FORMS } from './FormSetup';
import { fmtDT } from '../util';

const actionLabel = (m, a) => (ACTIONS.find(([k]) => k === a)?.[1]) || (m.extra || []).find(([k]) => k === a)?.[1] || a;
const scopeLabel = (s) => SCOPES.find(([k]) => k === s)?.[1] || s;
const roleOptions = (db, withAdmin) => [...Object.entries(ROLES).filter(([k]) => withAdmin || k !== 'admin').map(([k, label]) => ({ k, label })), ...(db.customRoles || []).map((x) => ({ k: x.id, label: x.name }))];

// Hide a field from a role, or let them see it without changing it.
export function FieldAccess() {
  const { db, setFieldRule } = useStore();
  const [role, setRole] = useState('sales');
  const [form, setForm] = useState('deal');
  const fields = useMemo(() => applyFormConfig(db.formConfig?.[form], FORMS[form].base()).filter((f) => f.type !== 'check' || f.k), [db.formConfig, form]);
  const rules = db.fieldRules?.[role]?.[form] || {};
  const changed = Object.keys(rules).length;
  return (
    <Card pad={false}>
      <div className="tb-toolbar">
        <Pills value={role} onChange={setRole} options={roleOptions(db)} />
        <div className="grow" />
        <select className="select tb-filter" aria-label="Choose a record type" value={form} onChange={(e) => setForm(e.target.value)}>
          {Object.entries(FORMS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <span className="sub">{changed ? `${changed} restricted` : 'No restrictions'}</span>
      </div>
      <div className="tb-wrap">
        <table className="table">
          <thead><tr><th>Field</th><th style={{ width: 220 }}>This role can</th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.k}>
                <td><span className="strong">{f.label}</span>{f.req && <span className="small muted"> Required, so it stays visible</span>}</td>
                <td>
                  <select className="select" style={{ height: 30 }} aria-label={`${f.label}: access`} disabled={f.req} value={f.req ? 'edit' : rules[f.k] || 'edit'} onChange={(e) => setFieldRule(role, form, f.k, e.target.value)}>
                    <option value="edit">See and edit</option>
                    <option value="read">See only</option>
                    <option value="hidden">Not see</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Lets a person or team also see records owned by another person or team.
export function SharingRules() {
  const { db, create, remove, toast, userName } = useStore();
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const scoped = MODULES.filter((m) => m.scoped);
  const targets = [...(db.teams || []).map((t) => ({ value: `team:${t.id}`, label: `Team: ${t.name}` })), ...db.users.filter((u) => u.active).map((u) => ({ value: `user:${u.id}`, label: u.name }))];
  const nameOf = (v) => { const [kind, id] = String(v).split(':'); return kind === 'team' ? `Team: ${db.teams.find((t) => t.id === id)?.name || 'Removed team'}` : userName(id); };
  const rules = db.sharingRules || [];
  return (
    <div className="stack">
      <Card title="Sharing rules" sub="Open up records beyond a role's data scope, such as when one team covers for another. They can do whatever their role allows on those records." action={<Btn kind="primary" icon="Plus" onClick={() => setAdding(true)}>New rule</Btn>}>
        {rules.length ? (
          <div className="tb-wrap"><table className="table">
            <thead><tr><th>Records owned by</th><th>Shared with</th><th>Modules</th><th /></tr></thead>
            <tbody>{rules.map((r) => <tr key={r.id}><td className="strong">{nameOf(r.from)}</td><td>{nameOf(r.to)}</td><td>{r.modules.map((k) => MODULE_BY_KEY[k]?.label || k).join(', ')}</td><td className="r"><Btn sm kind="ghost" icon="Trash2" aria-label={`Delete rule from ${nameOf(r.from)}`} onClick={() => setDel(r)} /></td></tr>)}</tbody>
          </table></div>
        ) : <Empty icon="Share2" text="No sharing rules yet. People see records based on their data scope." />}
      </Card>
      {adding && <SharingForm targets={targets} scoped={scoped} onClose={() => setAdding(false)} onSave={(v) => { create('sharingRules', { ...v, name: `${nameOf(v.from)} to ${nameOf(v.to)}` }); toast('Sharing rule added'); setAdding(false); }} />}
      {del && <Confirm title="Delete this sharing rule?" text="People go back to seeing only what their data scope allows." onClose={() => setDel(null)} onConfirm={() => { remove('sharingRules', del.id); toast('Sharing rule deleted'); }} />}
    </div>
  );
}

function SharingForm({ targets, scoped, onClose, onSave }) {
  const [v, setV] = useState({ from: '', to: '' });
  const [mods, setMods] = useState(['pipeline', 'leads', 'contacts', 'customers']);
  const [error, setError] = useState('');
  const save = () => {
    if (!v.from || !v.to) { setError('Choose who owns the records and who to share them with.'); return; }
    if (v.from === v.to) { setError('Choose two different people or teams.'); return; }
    if (!mods.length) { setError('Choose at least one module.'); return; }
    onSave({ ...v, modules: mods });
  };
  const pick = (k, label) => (
    <div className="field"><label className="label" htmlFor={`share-${k}`}>{label}</label>
      <select id={`share-${k}`} className="select" value={v[k]} onChange={(e) => { setV((p) => ({ ...p, [k]: e.target.value })); setError(''); }}><option value="">Select…</option>{targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
    </div>
  );
  return (
    <Modal title="New sharing rule" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save rule</Btn></>}>
      <div className="stack">
        <div className="form-grid">{pick('from', 'Records owned by')}{pick('to', 'Shared with')}</div>
        <div className="field"><div className="label">Modules</div>
          <div className="section-groups">{scoped.map((m) => <label key={m.key} className="check small"><input type="checkbox" checked={mods.includes(m.key)} onChange={(e) => { setMods(e.target.checked ? [...mods, m.key] : mods.filter((x) => x !== m.key)); setError(''); }} />{m.label}</label>)}</div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

// Answers "who can do this?" and says whether it comes from their role or was set for them.
export function WhoHasAccess() {
  const { db } = useStore();
  const [mod, setMod] = useState('customers');
  const m = MODULE_BY_KEY[mod];
  const acts = allActions(m);
  const [act, setAct] = useState('view');
  const action = acts.includes(act) ? act : acts[0];
  const rows = db.users.filter((u) => u.active).map((u) => {
    const row = effective(db.permissions, u, mod);
    const expired = db.accessExpiry?.[u.id] && db.accessExpiry[u.id] < new Date().toISOString().slice(0, 10);
    const personal = !expired && !!db.permissions.users[u.id]?.[mod];
    const base = effective({ ...db.permissions, users: {} }, u, mod);
    const has = personal ? !!row[action] : !!base[action];
    return { id: u.id, ownerId: u.id, name: u.name, role: roleNameOf(db, u), has, via: personal ? 'Set for this person' : 'From their role', scope: m.scoped ? scopeLabel((personal ? row : base).scope) : '—' };
  }).filter((r) => r.has);
  return (
    <Card pad={false}>
      <div className="tb-toolbar">
        <select className="select tb-filter" aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)}>{MODULES.map((x) => <option key={x.key} value={x.key}>{x.group}: {x.label}</option>)}</select>
        <select className="select tb-filter" aria-label="Action" value={action} onChange={(e) => setAct(e.target.value)}>{acts.map((a) => <option key={a} value={a}>{actionLabel(m, a)}</option>)}</select>
        <span className="sub">{rows.length} {rows.length === 1 ? 'person' : 'people'} can {actionLabel(m, action).toLowerCase()} {m.label.toLowerCase()}</span>
      </div>
      <div style={{ padding: 12 }}>
        <DataTable key={`${mod}-${action}`} rows={rows} exportName="access-review" searchPlaceholder="Search people…" initialSort={{ k: 'name', dir: 'asc' }}
          columns={[
            { k: 'name', label: 'Person', render: (r) => <UserChip id={r.id} /> },
            { k: 'role', label: 'Role' },
            { k: 'scope', label: 'Data they can see' },
            { k: 'via', label: 'Why', render: (r) => <Badge tone={r.via.startsWith('Set') ? 'violet' : 'muted'} dot={false}>{r.via}</Badge> },
          ]} />
      </div>
    </Card>
  );
}

const describe = (m, row) => {
  if (!row) return '—';
  const on = allActions(m).filter((a) => row[a]).map((a) => actionLabel(m, a));
  return on.length ? `${on.join(', ')}${m.scoped && row.scope ? ` (${scopeLabel(row.scope)})` : ''}` : 'No access';
};

export function CompareRoles() {
  const { db } = useStore();
  const [a, setA] = useState('manager');
  const [b, setB] = useState('sales');
  const [all, setAll] = useState(false);
  const opts = roleOptions(db, true);
  const rows = MODULES.map((m) => ({ m, x: describe(m, db.permissions.roles[a]?.[m.key]), y: describe(m, db.permissions.roles[b]?.[m.key]) }));
  const shown = all ? rows : rows.filter((r) => r.x !== r.y);
  const name = (k) => opts.find((o) => o.k === k)?.label || k;
  const sel = (value, set, label) => <select className="select tb-filter" aria-label={label} value={value} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}</select>;
  return (
    <Card pad={false}>
      <div className="tb-toolbar">
        {sel(a, setA, 'First role')}
        <span className="sub">compared with</span>
        {sel(b, setB, 'Second role')}
        <div className="grow" />
        <label className="check small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show modules that match too</label>
        <span className="sub">{rows.filter((r) => r.x !== r.y).length} differences</span>
      </div>
      {shown.length ? (
        <div className="tb-wrap"><table className="table">
          <thead><tr><th>Module</th><th>{name(a)}</th><th>{name(b)}</th></tr></thead>
          <tbody>{shown.map(({ m, x, y }) => <tr key={m.key}><td className="strong">{m.label}</td><td>{x}</td><td>{y}</td></tr>)}</tbody>
        </table></div>
      ) : <Empty icon="CheckCheck" text="These two roles have the same access." />}
    </Card>
  );
}

export function AccessHistory() {
  const { db, userName } = useStore();
  const rows = (db.audit || []).filter((x) => ['permissions', 'customRoles', 'sharingRules', 'accessExpiry'].includes(x.entity));
  return (
    <DataTable rows={rows} exportName="access-history" dateOf={(x) => x.at} initialSort={{ k: 'at', dir: 'desc' }} searchPlaceholder="Search changes…" emptyText="No access changes yet."
      columns={[
        { k: 'at', label: 'When', nowrap: true, render: (x) => fmtDT(x.at) },
        { k: 'user', label: 'Changed by', value: (x) => userName(x.userId) },
        { k: 'label', label: 'What' },
        { k: 'detail', label: 'Change', value: (x) => (x.changes || []).map((c) => `${c.field}: ${c.from} to ${c.to}`).join('; ') || x.action },
      ]} />
  );
}

