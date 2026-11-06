import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, ROLES, roleNameOf } from '../store';
import { Avatar, Badge, Btn, Card, Confirm, DataTable, FormFields, Icon, ListField, Modal, NoSections, PageHead, Popover, RecordModal, Tabs, Toggle, UserChip, firstAllowed } from '../ui';
import DropdownOptions, { DealStages, PageNames } from './Options';
import FormSetup from './FormSetup';
import { AutoBackups, DuplicatesCard } from './Import';
import { CurrencySettings, TaxSettings } from '../extras';
import { MONTHS } from '../dateRange';
import { downloadBlob, fmtDT, humanize, money, moneyK, priceListDiscount, sum } from '../util';

export function Users() {
  const { db, me, role, can, scopeOf, t, create, update, toast } = useStore();
  const [edit, setEdit] = useState(null);
  // A team always needs its leader, and only people with company-wide team access can move others between teams.
  const teamRules = (v) => {
    const was = db.users.find((u) => u.id === v.id);
    if (!was) return {};
    const leads = db.teams.find((x) => x.managerId === was.id);
    if (leads && (v.teamId || null) !== leads.id) return { teamId: `${was.name} leads ${leads.name}. Give that team a new leader first.` };
    if (leads && v.role !== 'manager') return { role: `${was.name} leads ${leads.name}. Give that team a new leader first.` };
    if (scopeOf('teams') !== 'all' && (v.teamId || null) !== (was.teamId || null) && was.teamId && was.teamId !== me.teamId) return { teamId: 'Only an Admin can move someone out of another team.' };
    return {};
  };
  const fields = [
    { k: 'name', label: 'Full name', req: true },
    { k: 'email', label: 'Email', type: 'email', req: true },
    { k: 'title', label: 'Job title' },
    { k: 'phone', label: 'Phone', type: 'tel' },
    { k: 'role', label: 'Role', type: 'select', noBlank: true, options: Object.entries(ROLES).filter(([value]) => role === 'admin' || value !== 'admin').map(([value, label]) => ({ value, label })) },
    { k: 'customRole', label: 'Custom role', type: 'select', hide: !(db.customRoles || []).length, blankLabel: 'None', options: (db.customRoles || []).map((x) => ({ value: x.id, label: x.name })), hint: 'Replaces the access of the role above. The menu layout stays the same.' },
    { k: 'teamId', label: 'Sales team', type: 'select', options: db.teams.map((t) => ({ value: t.id, label: t.name })) },
    { k: 'target', label: 'Annual target', type: 'number', min: 0 },
    { k: 'active', label: 'Status', type: 'check', text: 'Active user' },
  ];
  const stat = (id) => {
    const d = db.deals.filter((x) => x.ownerId === id);
    return { open: d.filter((x) => x.status === 'open').length, won: sum(d.filter((x) => x.status === 'won'), (x) => x.value) };
  };
  return (
    <div>
      <PageHead title={t('users')} sub={`${db.users.filter((u) => u.active).length} active users`}>
        {can('users', 'create') && <Btn kind="primary" icon="UserPlus" onClick={() => setEdit({ role: 'sales', active: true, target: 0 })}>New user</Btn>}
      </PageHead>
      <DataTable rows={db.users} exportName="users" onRow={can('users', 'edit') ? (u) => { if (role === 'admin' || u.role !== 'admin') setEdit(u); } : undefined} initialSort={{ k: 'name', dir: 'asc' }}
        statusTabs={{ options: Object.values(ROLES), get: (u) => ROLES[u.role] }}
        columns={[
          { k: 'name', label: 'Name', render: (u) => <span className="row"><Avatar name={u.name} size={30} /><span><div className="strong">{u.name}</div><div className="small muted">{u.email}</div></span></span> },
          { k: 'title', label: 'Job title' },
          { k: 'role', label: 'Role', value: (u) => roleNameOf(db, u), render: (u) => <Badge tone={u.role === 'admin' ? 'violet' : u.role === 'manager' ? 'info' : 'muted'} dot={false}>{roleNameOf(db, u)}</Badge> },
          { k: 'team', label: 'Team', value: (u) => db.teams.find((t) => t.id === u.teamId)?.name || '—' },
          { k: 'open', label: 'Open deals', align: 'r', value: (u) => stat(u.id).open },
          { k: 'won', label: 'Won', align: 'r', value: (u) => stat(u.id).won, render: (u) => moneyK(stat(u.id).won) },
          { k: 'active', label: 'Status', value: (u) => (u.active ? 'Active' : 'Inactive'), render: (u) => <Badge>{u.active ? 'Active' : 'Inactive'}</Badge> },
          { k: 'access', label: 'Access', sort: false, stop: true, omit: !can('access'), value: (u) => Object.keys(db.permissions.users[u.id] || {}).length || '', render: (u) => { const n = Object.keys(db.permissions.users[u.id] || {}).length; return <Link className="btn sm" to={`/access?user=${u.id}`}>{n ? `Custom (${n})` : 'Role access'}</Link>; } },
        ]} />
      {edit && <RecordModal size="lg" title={edit.id ? `Edit ${edit.name}` : 'New user'} fields={fields} initial={edit} check={teamRules} onClose={() => setEdit(null)} onSave={(v) => {
        if (v.id) {
          if (v.id === me.id && (!v.active || v.role !== 'admin')) { toast("You can't remove your own admin access."); return; }
          const { id, ...rest } = v; update('users', id, rest); toast('User saved');
        } else { create('users', { ...v, teamId: v.teamId || null }); toast('User created'); }
      }} />}
    </div>
  );
}

export function AuditLog() {
  const { db, me, scopeOf, t, userName } = useStore();
  const teamIds = useMemo(() => new Set(db.users.filter((u) => u.teamId === me.teamId).map((u) => u.id)), [db.users, me.teamId]);
  const sc = scopeOf('audit');
  const rows = db.audit.filter((a) => (sc === 'all' || (sc === 'team' ? teamIds.has(a.userId) || a.userId === me.id : a.userId === me.id)));
  const entities = [...new Set(db.audit.map((a) => a.entity))].sort();
  const actions = [...new Set(db.audit.map((a) => a.action))].sort();
  const TONE = { Create: 'good', Update: 'info', Delete: 'bad', Transfer: 'violet', Request: 'warn', Reject: 'bad' };
  return (
    <div>
      <PageHead title={t('audit')} sub={{ all: 'Every change, by everyone', team: 'Changes made by your team', own: 'Changes you made' }[sc]} />
      <DataTable rows={rows} exportName="audit-log" dateOf={(a) => a.at} initialSort={{ k: 'at', dir: 'desc' }}
        searchPlaceholder="Filter by user, record…"
        filters={[
          { k: 'action', label: 'Action', get: (a) => a.action, options: actions },
          { k: 'entity', label: 'Entity', get: (a) => a.entity, options: entities.map((e) => ({ value: e, label: humanize(e) })) },
        ]}
        columns={[
          { k: 'user', label: 'User', value: (a) => userName(a.userId), render: (a) => <UserChip id={a.userId} /> },
          { k: 'action', label: 'Action', render: (a) => <Badge tone={TONE[a.action]} dot={false}>{a.action}</Badge> },
          { k: 'entity', label: 'Entity', value: (a) => humanize(a.entity) },
          { k: 'label', label: 'Record', render: (a) => <div className="trunc" style={{ maxWidth: 280 }}>{a.label}</div> },
          { k: 'changes', label: 'Changes', sort: false, stop: true, value: (a) => a.changes.map((c) => `${c.field}: ${c.from} > ${c.to}`).join('; '), render: (a) => (a.changes.length ? (
            <Popover width={330} align="left" trigger={({ toggle }) => <Btn sm icon="Eye" onClick={toggle}>Details</Btn>}>
              <table className="table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{a.changes.map((c) => <tr key={c.field}><td className="strong">{c.field}</td><td>{c.from}</td><td>{c.to}</td></tr>)}</tbody></table>
            </Popover>
          ) : <span className="muted">—</span>) },
          { k: 'at', label: 'Date & time', nowrap: true, render: (a) => fmtDT(a.at) },
        ]} />
    </div>
  );
}

function Setting({ title, desc, k, fallback }) {
  const { db, updateSettings } = useStore();
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <Toggle on={db.settings[k] ?? fallback} label={title} onChange={(v) => updateSettings({ [k]: v })} />
      <div className="grow"><div className="strong">{title}</div><div className="small muted">{desc}</div></div>
    </div>
  );
}
function General() {
  const { db, updateSettings, toast } = useStore();
  const [v, setV] = useState(db.settings);
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Company">
        <div className="stack">
          <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} fields={[
            { k: 'companyName', label: 'Company name', req: true, full: true },
            { k: 'supportEmail', label: 'Support email', type: 'email', full: true },
            { k: 'businessNumber', label: 'Business phone number', full: true, hint: 'Demo only. No real calls use this number.' },
            { k: 'currency', label: 'Main currency', type: 'select', noBlank: true, list: 'currency', hint: 'Reports total in this. Changing it changes the symbol only, and existing amounts are not converted.' },
            { k: 'fiscalStart', label: 'Fiscal year starts', type: 'select', noBlank: true, options: MONTHS },
            { k: 'locale', label: 'Number and date format', type: 'select', noBlank: true, list: 'locale' },
            { k: 'weekStart', label: 'Week starts on', type: 'select', noBlank: true, options: ['Sunday', 'Monday', 'Saturday'] },
          ]} />
          <div><Btn kind="primary" disabled={!v.companyName?.trim()} onClick={() => { updateSettings({ companyName: v.companyName, supportEmail: v.supportEmail, businessNumber: v.businessNumber, currency: v.currency, ...(v.currency !== db.settings.currency ? { fxRates: {} } : {}), fiscalStart: v.fiscalStart, locale: v.locale || 'en-US', weekStart: v.weekStart || 'Sunday' }); toast('Settings saved'); }}>Save</Btn></div>
        </div>
      </Card>
      <Roles />
    </div>
  );
}
function Roles() {
  return (
    <Card title="Roles & access" sub="Decide what each role and person can view and edit">
      <Link className="btn" to="/access"><Icon name="ShieldCheck" />Open Access control</Link>
    </Card>
  );
}
function CrmSettings() {
  const { db, updateSettings, optionsOf } = useStore();
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="CRM">
        <Setting k="useLeads" title="Leads" desc="Add a qualification step before an opportunity is created." />
        <Setting k="ruleAssignment" title="Rule-based assignment" desc="Leads from imports and generated leads go to the salesperson with the fewest new leads. Web form leads always do." />
        <Setting k="requirePasswords" title="Require passwords at login" desc="Simulated sign-in. The demo password is demo1234. This doesn't secure the data, which stays readable in this browser." />
      </Card>
      <Card title="Assistant" sub="Simulated: fixed rules over your records, with no AI model">
        <Setting k="aiAssistant" title="Ask the assistant" desc="A panel for asking questions about your records and adding tasks." />
        <Setting k="aiDealScore" title="Win chance on deals" desc="A score on each open deal, with the reasons behind it." />
        <Setting k="aiHealth" title="Customer health" desc="Healthy, Watch or At risk on each customer." />
        <Setting k="aiWriter" title="Writing help" desc="Draft messages, make them shorter or more formal, and suggest replies." />
      </Card>
      <Card title="Lead generation">
        <Setting k="predictiveScoring" title="Predictive lead scoring" desc="Rank leads by how likely they are to convert." />
        <Setting k="leadMining" title="Lead mining" desc="Show the Generate leads button." />
      </Card>
      <Card title="Workflow rules">
        <Setting k="requireLostReason" title="Require a lost reason" desc="Salespeople must pick a reason when they mark a deal as lost." />
        <Setting k="transferNeedsApproval" title="Transfers need manager approval" desc="If off, salespeople can transfer records directly." />
      </Card>
      <Card title="Commerce">
        <Setting k="opsReadOnly" fallback={true} title="Orders, billing, shipping and reordering are handled outside this CRM" desc="People can view quotes, orders, invoices, payments, shipments, stock and purchase orders, and notify others, but can't change them here." />
        <Setting k="lowStockAlerts" title="Low stock alerts" desc="Admins get a bell alert when a product reaches its reorder level." />
        <Setting k="allowBackorder" title="Allow backorders" desc="Accept orders for more than the stock on hand." />
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field"><label className="label">Invoice prefix</label><input className="input" defaultValue={db.settings.invoicePrefix} onBlur={(e) => updateSettings({ invoicePrefix: e.target.value })} /></div>
          <div className="field"><label className="label">Default payment terms</label><ListField f={{ k: 'defaultTerms', label: 'Payment terms', type: 'select', noBlank: true, list: 'paymentTerms' }} value={db.settings.defaultTerms} onChange={(_, x) => updateSettings({ defaultTerms: x })} /></div>
        </div>
      </Card>
      <Card title="Discounts and purchasing">
        <div className="form-grid">
          <div className="field"><label className="label" htmlFor="set-maxd">Most a salesperson can discount (%)</label><input id="set-maxd" className="input" type="number" min="0" max="100" defaultValue={db.settings.maxDiscount ?? 20} onBlur={(e) => updateSettings({ maxDiscount: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></div>
          {db.settings.opsReadOnly === false && <div className="field"><label className="label" htmlFor="set-pol">Purchase orders above this need approval</label><input id="set-pol" className="input" type="number" min="0" defaultValue={db.settings.poApprovalLimit ?? 5000} onBlur={(e) => updateSettings({ poApprovalLimit: Math.max(0, Number(e.target.value) || 0) })} /></div>}
        </div>
        <div className="label" style={{ margin: '14px 0 6px' }}>Discount for each price list (%)</div>
        <div className="form-grid">
          {optionsOf('priceList').map((name) => <div className="field" key={name}><label className="label" htmlFor={`set-pl-${name}`}>{name}</label><input id={`set-pl-${name}`} className="input" type="number" min="0" max="100" defaultValue={priceListDiscount(db.settings, name)} onBlur={(e) => updateSettings({ priceLists: { ...(db.settings.priceLists ?? { Partner: 10, Enterprise: 15 }), [name]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} /></div>)}
        </div>
      </Card>
    </div>
  );
}
function ActivityTypes() {
  const { db, create, update, remove, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const used = (id) => db.activities.filter((a) => a.typeId === id).length;
  const fields = [
    { k: 'name', label: 'Name', req: true },
    { k: 'action', label: 'Action', type: 'select', noBlank: true, list: 'activityAction' },
    { k: 'icon', label: 'Icon', type: 'select', noBlank: true, options: ['CheckSquare', 'Phone', 'Mail', 'Users', 'FileText', 'Video', 'MapPin'] },
    { k: 'summary', label: 'Default summary' },
    { k: 'delay', label: 'Schedule after (days)', type: 'number', min: 0, req: true },
    { k: 'userId', label: 'Default user', type: 'user' },
    { k: 'chainId', label: 'Suggest next', type: 'select', options: db.activityTypes.map((t) => ({ value: t.id, label: t.name })) },
  ];
  return (
    <>
      <DataTable rows={db.activityTypes} exportName="activity-types" onRow={setEdit} initialSort={{ k: 'name', dir: 'asc' }}
        actions={<Btn kind="primary" icon="Plus" onClick={() => setEdit({ delay: 3, action: 'None', icon: 'CheckSquare' })}>New activity type</Btn>}
        columns={[
          { k: 'name', label: 'Name', render: (t) => <span className="row strong"><Icon name={t.icon} size={15} />{t.name}</span> },
          { k: 'action', label: 'Action' },
          { k: 'summary', label: 'Default summary', render: (t) => t.summary || '—' },
          { k: 'delay', label: 'Schedule', render: (t) => `${t.delay} days after` },
          { k: 'chain', label: 'Suggest next', value: (t) => db.activityTypes.find((x) => x.id === t.chainId)?.name || '—' },
          { k: 'used', label: 'Planned', align: 'r', value: (t) => used(t.id) },
          { k: 'x', label: '', sort: false, stop: true, value: () => '', render: (t) => <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)} /> },
        ]} />
      {edit && <RecordModal title={edit.id ? `Edit ${edit.name}` : 'New activity type'} fields={fields} initial={edit} onClose={() => setEdit(null)} onSave={(v) => { if (v.id) { const { id, ...rest } = v; update('activityTypes', id, rest); } else create('activityTypes', v); toast('Activity type saved'); }} />}
      {del && <Confirm title={`Delete ${del.name}?`} text={used(del.id) ? `${used(del.id)} activities use this type. They'll keep their summary but lose the type label.` : 'This type is not in use.'} onClose={() => setDel(null)} onConfirm={() => { remove('activityTypes', del.id); toast('Activity type deleted'); }} />}
    </>
  );
}
function LostReasons() {
  const { db, create, update, remove, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const deals = (n) => db.deals.filter((d) => d.lostReason === n);
  return (
    <>
      <DataTable rows={db.lostReasons} exportName="lost-reasons" onRow={setEdit} initialSort={{ k: 'name', dir: 'asc' }}
        actions={<Btn kind="primary" icon="Plus" onClick={() => setEdit({ name: '' })}>New lost reason</Btn>}
        columns={[
          { k: 'name', label: 'Reason', render: (r) => <span className="strong">{r.name}</span> },
          { k: 'count', label: 'Lost deals', align: 'r', value: (r) => deals(r.name).length },
          { k: 'value', label: 'Lost revenue', align: 'r', value: (r) => sum(deals(r.name), (d) => d.value), render: (r) => money(sum(deals(r.name), (d) => d.value)) },
          { k: 'x', label: '', sort: false, stop: true, value: () => '', render: (r) => <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${r.name}`} onClick={() => { remove('lostReasons', r.id); toast('Lost reason deleted'); }} /> },
        ]} />
      {edit && <RecordModal size="sm" title={edit.id ? 'Edit lost reason' : 'New lost reason'} fields={[{ k: 'name', label: 'Reason', req: true, full: true }]} initial={edit} onClose={() => setEdit(null)} onSave={(v) => { if (v.id) update('lostReasons', v.id, { name: v.name }); else create('lostReasons', v); toast('Lost reason saved'); }} />}
    </>
  );
}
const INTEGRATIONS = [
  { title: 'Phone calls', icon: 'Phone', setting: 'voiceEnabled', now: 'Simulated only: outgoing calls from a demo business number, customers calling back, ringing the owner, then the manager, then the Admin, and missed-call follow-ups. No real calls are made.', needs: 'Real calls need a telephony provider and a server.', options: 'Twilio, Exotel, Knowlarity, Plivo' },
  { title: 'Video calls', icon: 'Video', setting: 'videoEnabled', now: 'Demo call screen with your real camera preview, and call logging.', needs: 'Connecting two people needs a video service and a server.', options: 'Zoom, Google Meet, Daily, Agora' },
  { title: 'WhatsApp', icon: 'MessageCircle', setting: 'whatsappEnabled', now: 'Simulated: messages show delivered and read, customers may reply, plus templates and broadcasts. A button also opens the real WhatsApp.', needs: 'Receiving replies and sending automatically needs WhatsApp Business API approval and a server.', options: 'Meta Cloud API, Gupshup, Twilio, Interakt' },
  { title: 'SMS', icon: 'Smartphone', needs: 'Needs an SMS provider and a server.', options: 'Twilio, MSG91, Plivo' },
  { title: 'Email', icon: 'Mail', now: 'Simulated: inbox, tracking, scheduling and bulk email, with nothing actually sent.', needs: 'Needs Gmail or Outlook sign-in through a server.', options: 'Gmail, Outlook, SendGrid' },
  { title: 'Other messaging', icon: 'Send', needs: 'Each needs its own business account and a server.', options: 'Telegram, Facebook Messenger, Instagram' },
];
function Integrations() {
  const { db, updateSettings } = useStore();
  return (
    <div className="stack">
      <div className="notice">Provider connections need a backend, because API keys must never be stored in the browser. Until then, the switches below turn each channel on or off for everyone.</div>
      <div className="g3">
        {INTEGRATIONS.map((x) => (
          <Card key={x.title} title={<span className="row"><Icon name={x.icon} />{x.title}</span>} action={x.setting ? <Toggle on={db.settings[x.setting] !== false} label={x.title} onChange={(v) => updateSettings({ [x.setting]: v })} /> : <Badge tone="muted" dot={false}>Not connected</Badge>}>
            <div className="stack-s small">
              {x.now && <div><strong>Works now:</strong> {x.now}</div>}
              <div><strong>To go live:</strong> {x.needs}</div>
              <div className="muted">Options: {x.options}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
function DeleteCompany({ onClose }) {
  const { db, deleteOrg, toast } = useStore();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const name = db.settings.companyName;
  const submit = (e) => {
    e.preventDefault();
    if (typed.trim() !== name) return;
    onClose();
    nav('/');
    const next = deleteOrg();
    if (next) toast(`${name} deleted. You're now in ${next.name}.`);
  };
  return (
    <Modal size="sm" title="Delete this company?" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><button type="submit" form="delete-company-form" className="btn danger" disabled={typed.trim() !== name}>Delete company</button></>}>
      <form id="delete-company-form" className="stack-s" onSubmit={submit} noValidate>
        <p className="sub" style={{ margin: 0 }}>This permanently removes every customer, deal, order, user and setting in <strong>{name}</strong>. It can't be undone, so download a backup first if you might need the data. Other companies are not affected.</p>
        <label className="label" htmlFor="delete-company-name">Type <strong>{name}</strong> to confirm</label>
        <input id="delete-company-name" className="input" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </form>
    </Modal>
  );
}
function DataTab() {
  const { db, can, orgs, resetDemo, isSampleOrg, restoreBackup, toast } = useStore();
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="g2">
      <Card title="Backup" sub="Download this company's data as a JSON file">
        <Btn icon="Download" onClick={() => downloadBlob(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), 'unifiedtree-crm-backup.json')}>Download backup</Btn>
      </Card>
      <Card title="Restore" sub="Replace this company's data with a backup file">
        <input type="file" className="input" accept=".json,application/json" aria-label="Backup file" onChange={(e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(String(r.result)); if (!Array.isArray(data.users) || !data.settings) throw new Error('bad'); setRestoring(data); } catch { toast("That file isn't a CRM backup."); } }; r.readAsText(f); e.target.value = ''; }} />
      </Card>
      <AutoBackups />
      <DuplicatesCard />
      {restoring && <Confirm title="Replace this company's data?" text={`Everything in ${db.settings.companyName} will be replaced by the backup. This can't be undone, so download a backup first if you might need the current data.`} confirmLabel="Restore" onClose={() => setRestoring(null)} onConfirm={() => { restoreBackup(restoring); toast('Backup restored'); }} />}
      <Card title="Demo data" sub="Data is stored in this browser only">
        <Btn kind="danger" icon="RotateCcw" onClick={() => setConfirm(true)}>{isSampleOrg ? 'Reset to sample data' : 'Clear company data'}</Btn>
      </Card>
      {can('companies', 'delete') && (
        <Card title="Delete company" sub={orgs.length > 1 ? `Permanently remove ${db.settings.companyName} and all its data` : "This is the only company, so it can't be deleted"}>
          <Btn kind="danger" icon="Trash2" disabled={orgs.length < 2} onClick={() => setDeleting(true)}>Delete company</Btn>
        </Card>
      )}
      {deleting && <DeleteCompany onClose={() => setDeleting(false)} />}
      {confirm && <Confirm title={isSampleOrg ? "Reset this company?" : "Clear this company?"} text={isSampleOrg ? "Every change you've made to this company in this browser will be replaced by the original sample data. Other companies are not affected." : "All records, users and settings in this company will be removed. Other companies are not affected."} confirmLabel="Reset" onClose={() => setConfirm(false)} onConfirm={resetDemo} />}
    </div>
  );
}
export function SettingsPage() {
  const { db, t, can, sec } = useStore();
  const [pref, setTab] = useState('crm');
  const settingTabs = [{ k: 'crm', label: 'CRM settings', icon: 'SlidersHorizontal' }, { k: 'options', label: 'Dropdown options', icon: 'ListPlus' }, { k: 'stages', label: 'Deal stages', icon: 'Kanban' }, { k: 'names', label: 'Page & menu names', icon: 'Type' }, { k: 'forms', label: 'Form fields', icon: 'FormInput' }, { k: 'gst', label: 'Tax', icon: 'Percent' }, { k: 'fx', label: 'Currencies', icon: 'Coins' }, { k: 'general', label: 'General & roles', icon: 'Building' }, { k: 'types', label: 'Activity types', icon: 'ListChecks' }, { k: 'lost', label: 'Lost reasons', icon: 'ThumbsDown' }, { k: 'integrations', label: 'Integrations', icon: 'Plug' }, { k: 'data', label: 'Data', icon: 'Database' }].filter((x) => sec('settings', x.k));
  const tab = firstAllowed(settingTabs, pref);
  return (
    <div>
      <PageHead title={t('settings')} />
      <Tabs value={tab} onChange={setTab} tabs={settingTabs} />
      {!tab && <NoSections />}
      <fieldset disabled={!can('settings', 'edit')} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {tab === 'crm' && <CrmSettings />}
      {tab === 'options' && <DropdownOptions />}
      {tab === 'stages' && <DealStages />}
      {tab === 'names' && <PageNames />}
      {tab === 'forms' && <FormSetup />}
      {tab === 'gst' && <TaxSettings />}
      {tab === 'fx' && <CurrencySettings key={db.settings.currency} />}
      {tab === 'general' && <General />}
      {tab === 'types' && <ActivityTypes />}
      {tab === 'lost' && <LostReasons />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'data' && <DataTab />}
      </fieldset>
    </div>
  );
}
