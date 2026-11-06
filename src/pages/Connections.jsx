import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, Icon, Kpi, ListField, Modal, NoSections, PageHead, Tabs, firstAllowed } from '../ui';
import { downloadCsv, fmtDT, num, relTime, uid } from '../util';
import { APPS, FIELD_MAP } from '../apps';
import { AUTO_SYNC, nextSyncAt } from '../syncEngine';
import { TRIGGERS } from '../engine';

export { APPS };

import { ApiExplorer, Attention, DeliveryDetail, SCOPE_OPTIONS, UsageChart } from './ConnectionExtras';
import { newSecretKey } from '../connTools';

const STATUS_TONE = { Success: 'good', Failed: 'bad' };

function FieldMapping({ app, conn, canEdit }) {
  const { saveConnection, toast } = useStore();
  const usable = app.data.filter(([, , , entity]) => FIELD_MAP[entity]);
  const [pick, setPick] = useState(usable[0]?.[0]);
  const row = usable.find(([k]) => k === pick);
  if (!row) return null;
  const entity = row[3];
  const saved = conn.mapping?.[entity] || {};
  const put = (k, value) => saveConnection(app.k, { mapping: { ...conn.mapping, [entity]: { ...saved, [k]: value } } });
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="label">Match the fields</span>
        <select className="select tb-filter" aria-label="Data to match" value={pick} onChange={(e) => setPick(e.target.value)}>{usable.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      </div>
      <div className="tb-wrap"><table className="table">
        <thead><tr><th>In the CRM</th><th>In {conn.provider}</th></tr></thead>
        <tbody>{FIELD_MAP[entity].map(([k, label, theirs]) => <tr key={k}><td>{label}</td><td><input className="input" style={{ height: 30 }} aria-label={`${label} in ${conn.provider}`} disabled={!canEdit} defaultValue={saved[k] ?? theirs} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== (saved[k] ?? theirs)) { put(k, e.target.value.trim()); toast('Field match saved'); } }} /></td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

function AppDrawer({ app, onClose }) {
  const { db, can, saveConnection, runSync, toast } = useStore();
  const conn = db.connections?.[app.k] || {};
  const canEdit = can('connections', 'edit');
  const [provider, setProvider] = useState(conn.provider || '');
  const [account, setAccount] = useState(conn.account || '');
  const [off, setOff] = useState(conn.off || []);
  const [extras, setExtras] = useState(conn.provider && !app.providers.includes(conn.provider) ? [conn.provider] : []);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [detail, setDetail] = useState(null);
  const runs = (db.syncRuns || []).filter((r) => r.appKey === app.k);
  const toggle = (k) => {
    const next = off.includes(k) ? off.filter((x) => x !== k) : [...off, k];
    setOff(next);
    if (conn.connected) saveConnection(app.k, { off: next });
  };
  const connect = () => {
    if (!provider) { setError('Choose which system to connect.'); return; }
    if (!account.trim()) { setError(`Enter your ${provider} account name.`); return; }
    saveConnection(app.k, { connected: true, provider, account: account.trim(), off, connectedAt: new Date().toISOString(), auto: 'Off', conflict: 'Outside system wins', lastStatus: 'Success' });
    toast(`Connected to ${provider} (simulated). Sign-in was skipped.`);
  };
  const sync = (trigger) => { runSync(app.k, trigger); toast('Sync finished (simulated)'); };
  return (
    <Drawer title={app.name} onClose={onClose} footer={canEdit && (conn.connected
      ? <><Btn kind="danger" onClick={() => setDisconnecting(true)} style={{ marginInlineEnd: 'auto' }}>Disconnect</Btn><Btn kind="primary" icon="RefreshCw" onClick={() => sync(conn.lastStatus === 'Failed' ? 'Retry' : 'Manual')}>{conn.lastStatus === 'Failed' ? 'Try again' : 'Sync now'}</Btn></>
      : <Btn kind="primary" icon="Plug" onClick={connect}>Connect</Btn>)}>
      <div className="stack">
        <div className="row wrap">
          <Badge tone={conn.connected ? (conn.lastStatus === 'Failed' ? 'bad' : 'good') : 'muted'}>{conn.connected ? (conn.lastStatus === 'Failed' ? 'Problem' : 'Connected') : 'Not connected'}</Badge>
          {conn.connected && <span className="small muted">{conn.provider} · {conn.account}{conn.lastSync ? ` · last synced ${relTime(conn.lastSync)}` : ''}</span>}
        </div>
        {conn.connected && conn.lastStatus === 'Failed' && <div className="notice">{runs[0]?.errors?.[0] || 'The last sync failed.'}</div>}
        <p className="sub" style={{ margin: 0 }}>{app.about}</p>
        <div className="field">
          <label className="label">System to connect</label>
          <ListField err={error && !provider} value={provider} onChange={(_, x) => { setProvider(x); setError(''); }} f={{ k: 'provider', label: 'System', type: 'select', disabled: !canEdit || conn.connected, blankLabel: 'Choose a system…', addText: '+ Add another system…', options: [...app.providers, ...extras], onAdd: canEdit ? (name) => { setExtras((p) => [...p, name]); return name; } : undefined }} />
        </div>
        {!conn.connected && canEdit && <div className="field"><label className="label" htmlFor="conn-account">Account name</label><input id="conn-account" className="input" placeholder="For example, your company's name there" value={account} onChange={(e) => { setAccount(e.target.value); setError(''); }} /><span className="hint">Never enter a real password or key here. A real connection would open that system's own sign-in.</span></div>}
        {error && <span className="error-text">{error}</span>}
        <div>
          <div className="label" style={{ marginBottom: 6 }}>What to share</div>
          {app.data.map(([k, label, way, entity]) => (
            <label key={k} className="conn-row">
              <input type="checkbox" checked={!off.includes(k)} disabled={!canEdit} onChange={() => toggle(k)} />
              <span className="grow">{label}<div className="small muted">{num((db[entity] || []).length)} in the CRM</div></span>
              <Badge tone="muted" dot={false}>{way === 'In' ? 'Into the CRM' : 'From the CRM'}</Badge>
            </label>
          ))}
        </div>
        {conn.connected && <>
          <div className="form-grid">
            <div className="field"><label className="label" htmlFor="conn-auto">Sync automatically</label><select id="conn-auto" className="select" disabled={!canEdit} value={conn.auto || 'Off'} onChange={(e) => { saveConnection(app.k, { auto: e.target.value, nextSync: nextSyncAt(e.target.value) }); toast(e.target.value === 'Off' ? 'Automatic sync off' : `Syncs ${e.target.value.toLowerCase()} while the CRM is open`); }}>{AUTO_SYNC.map(([k]) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="conn-conflict">If both systems changed a record</label><select id="conn-conflict" className="select" disabled={!canEdit} value={conn.conflict || 'Outside system wins'} onChange={(e) => saveConnection(app.k, { conflict: e.target.value })}>{['Outside system wins', 'CRM wins', 'Most recent change wins', 'Ask me each time'].map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
          </div>
          <FieldMapping app={app} conn={conn} canEdit={canEdit} />
          <UsageChart appKey={app.k} />
        </>}
        {app.k === 'accounting' && <div><Btn sm icon="Download" onClick={() => { downloadCsv('invoices-for-accounting', [['Invoice', 'Date', 'Due', 'Customer', 'Tax ID', 'Before tax', 'Tax', 'Total', 'Paid'], ...db.invoices.map((i) => { const c = db.companies.find((x) => x.id === i.companyId); const t = i.taxes || {}; return [i.number, i.date, i.due, c?.name || '', c?.taxId || c?.gstin || '', t.taxable ?? i.total, t.tax ?? 0, i.total, i.paid || 0]; })]); toast('Invoices downloaded'); }}>Download invoices for your accountant</Btn></div>}
        {app.k === 'website' && <div className="notice">Website forms are already here. Open <strong>Web forms</strong> in the sidebar to copy a form's link or embed code.</div>}
        {conn.connected && (
          <div>
            <div className="row between" style={{ marginBottom: 6 }}><span className="label">Sync history</span>{canEdit && <Btn sm kind="ghost" onClick={() => { saveConnection(app.k, { failNext: true }); runSync(app.k, 'Failure test'); toast('Simulated a failed sync', 'bad'); }}>Try a failed sync</Btn>}</div>
            {!runs.length && <div className="sub">Not synced yet.</div>}
            {runs.slice(0, 6).map((r) => <button type="button" key={r.id} className="dashlet" style={{ width: '100%', textAlign: 'start', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setDetail(r)}><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge><span className="grow small">{r.inCount} in, {r.outCount} out</span><span className="small muted nowrap">{fmtDT(r.at)}</span></button>)}
          </div>
        )}
        <div className="notice">Simulated: nothing really connects and no data leaves the CRM. Syncs make up sample changes so you can see how it will work. A real connection needs a server and an account with that system.</div>
      </div>
      {detail && <RunDetail run={detail} onClose={() => setDetail(null)} />}
      {disconnecting && <Confirm title={`Disconnect ${app.name}?`} text="Sharing stops. Your CRM data stays as it is." confirmLabel="Disconnect" onClose={() => setDisconnecting(false)} onConfirm={() => { saveConnection(app.k, { connected: false, auto: 'Off', nextSync: null }); toast(`${app.name} disconnected`); }} />}
    </Drawer>
  );
}

function RunDetail({ run, onClose }) {
  return (
    <Modal title={`${run.appName}: ${run.provider}`} onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Done</Btn>}>
      <div className="stack">
        <div className="row wrap"><Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge><span className="small muted">{fmtDT(run.at)} · {run.trigger}</span></div>
        {run.errors.map((e) => <div key={e} className="notice">{e}</div>)}
        {(run.conflicts > 0 || run.issues > 0) && <div className="notice">{run.conflicts ? `${run.conflicts} changed in both places and waits for a decision. ` : ''}{run.issues ? `${run.issues} couldn't be brought in. ` : ''}See Needs attention.</div>}
        {!!run.lines.length && <div className="tb-wrap"><table className="table"><thead><tr><th>Data</th><th>Direction</th><th>Result</th></tr></thead><tbody>{run.lines.map((l) => <tr key={l.label}><td className="strong">{l.label}</td><td>{l.way === 'In' ? 'Into the CRM' : 'From the CRM'}</td><td>{l.text}</td></tr>)}</tbody></table></div>}
      </div>
    </Modal>
  );
}

function AppsTab({ q }) {
  const { db } = useStore();
  const [open, setOpen] = useState(null);
  const shown = APPS.filter((a) => `${a.name} ${a.about} ${a.providers.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const app = APPS.find((a) => a.k === open);
  return (
    <>
      <div className="app-grid">
        {shown.map((a) => {
          const c = db.connections?.[a.k];
          const bad = c?.connected && c.lastStatus === 'Failed';
          return (
            <button key={a.k} type="button" className="app-tile" aria-label={`${a.name}, ${c?.connected ? (bad ? 'problem' : 'connected') : 'not connected'}`} onClick={() => setOpen(a.k)}>
              {c?.connected && <span className="app-flag"><Badge tone={bad ? 'bad' : 'good'} dot={false}>{bad ? 'Problem' : 'Connected'}</Badge></span>}
              <span className="app-icon" style={{ background: `linear-gradient(160deg, ${a.colors[0]}, ${a.colors[1]})` }}><Icon name={a.icon} size={30} color="#fff" /></span>
              <span className="app-name">{a.name}</span>
              {c?.connected && <span className="small muted">{c.provider}{c.lastSync ? ` · ${relTime(c.lastSync)}` : ''}</span>}
            </button>
          );
        })}
      </div>
      {!shown.length && <div className="sub" style={{ marginTop: 12 }}>No app matches “{q}”.</div>}
      {app && <AppDrawer key={app.k} app={app} onClose={() => setOpen(null)} />}
    </>
  );
}

function ActivityTab() {
  const { db } = useStore();
  const [detail, setDetail] = useState(null);
  return (
    <>
      <DataTable rows={db.syncRuns || []} exportName="sync-history" dateOf={(r) => r.at} initialSort={{ k: 'at', dir: 'desc' }} onRow={setDetail} searchPlaceholder="Search syncs…" emptyText="No syncs yet. Connect an app and press Sync now."
        statusTabs={{ options: ['Success', 'Failed'], get: (r) => r.status }}
        columns={[
          { k: 'at', label: 'When', nowrap: true, render: (r) => fmtDT(r.at) },
          { k: 'appName', label: 'App' },
          { k: 'provider', label: 'System' },
          { k: 'trigger', label: 'Started by' },
          { k: 'status', label: 'Result', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
          { k: 'inCount', label: 'Into the CRM', align: 'r' },
          { k: 'outCount', label: 'From the CRM', align: 'r' },
        ]} />
      {detail && <RunDetail run={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function ApiKeys() {
  const { db, me, create, remove, toast, userName } = useStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState('Read only');
  const [scopes, setScopes] = useState(['contacts:read', 'companies:read']);
  const [expires, setExpires] = useState('');
  const [shown, setShown] = useState(null);
  const [del, setDel] = useState(null);
  const keys = db.apiKeys || [];
  const makeKey = () => {
    if (!name.trim()) return;
    const secret = `ut_demo_${uid('').replace(/[^a-z0-9]/gi, '')}`;
    create('apiKeys', { name: name.trim(), access: scopes.some((x) => x.endsWith(':write')) ? 'Read and write' : 'Read only', scopes, expires, prefix: `${secret.slice(0, 12)}…`, createdBy: me.id });
    setShown(secret);
    setName('');
    setNaming(false);
  };
  return (
    <Card title="API keys" sub="Simulated. There is no API behind these, so a key opens nothing." action={<Btn kind="primary" icon="Plus" onClick={() => setNaming(true)}>New key</Btn>} pad={false}>
      {keys.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Name</th><th>Key</th><th>Can</th><th>Expires</th><th>Last used</th><th>Created</th><th /></tr></thead>
        <tbody>{keys.map((k) => <tr key={k.id}><td className="strong">{k.name}</td><td><code>{k.prefix}</code></td><td className="small">{k.scopes ? k.scopes.map((x) => SCOPE_OPTIONS.find(([v]) => v === x)?.[1] || x).join(', ') : k.access}</td><td>{k.expires ? (k.expires < new Date().toISOString().slice(0, 10) ? <Badge tone="bad">Expired</Badge> : k.expires) : 'Never'}</td><td className="small">{k.lastUsed ? `${relTime(k.lastUsed)}, ${k.calls || 1} ${k.calls === 1 ? 'call' : 'calls'}` : 'Not yet'}</td><td>{fmtDT(k.createdAt)}{k.createdBy ? ` · ${userName(k.createdBy)}` : ''}</td><td className="r"><Btn sm kind="ghost" onClick={() => setDel(k)}>Revoke</Btn></td></tr>)}</tbody></table></div>
        : <Empty icon="KeyRound" text="No API keys yet." />}
      {naming && <Modal size="sm" title="New API key" onClose={() => setNaming(false)} footer={<><Btn onClick={() => setNaming(false)}>Cancel</Btn><Btn kind="primary" onClick={makeKey} disabled={!name.trim() || !scopes.length}>Create key</Btn></>}>
        <div className="stack">
          <div className="field"><label className="label" htmlFor="key-name">Name</label><input id="key-name" className="input" placeholder="For example, Website" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <fieldset className="plain-fieldset"><legend className="label">What it can do</legend><div className="form-grid">{SCOPE_OPTIONS.map(([v, l]) => <label key={v} className="check small"><input type="checkbox" checked={scopes.includes(v)} onChange={(e) => setScopes(e.target.checked ? [...scopes, v] : scopes.filter((x) => x !== v))} />{l}</label>)}</div></fieldset>
          <div className="field"><label className="label" htmlFor="key-exp">Expires</label><input id="key-exp" className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /><span className="hint">Leave empty for no expiry. Keys that expire are safer.</span></div>
        </div>
      </Modal>}
      {shown && <Modal size="sm" title="Copy your key" onClose={() => setShown(null)} footer={<Btn kind="primary" onClick={() => setShown(null)}>Done</Btn>}><div className="stack-s"><code style={{ overflowWrap: 'anywhere' }}>{shown}</code><div className="small muted">It's shown once, as real keys are. This demo key opens nothing.</div></div></Modal>}
      {del && <Confirm title={`Revoke ${del.name}?`} text="Anything using this key would stop working." confirmLabel="Revoke" onClose={() => setDel(null)} onConfirm={() => { remove('apiKeys', del.id); toast('Key revoked'); }} />}
    </Card>
  );
}

function Webhooks() {
  const { db, create, update, remove, testWebhook, toast } = useStore();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [del, setDel] = useState(null);
  const [open, setOpen] = useState(null);
  const [secretOf, setSecretOf] = useState(null);
  const hooks = db.webhooks || [];
  const eventName = (k) => TRIGGERS.find((t) => t.k === k)?.label || k;
  const nameOf = (id) => hooks.find((h) => h.id === id)?.name || 'Removed webhook';
  const save = () => {
    if (!form.name.trim()) { setError('Give it a name.'); return; }
    if (!/^https:\/\/\S+\.\S+/.test(form.url)) { setError('Enter a web address starting with https://'); return; }
    if (!form.events.length) { setError('Choose at least one event.'); return; }
    create('webhooks', { ...form, name: form.name.trim(), active: true, secret: newSecretKey() });
    toast('Webhook added. Nothing is really sent.');
    setForm(null);
  };
  return (
    <div className="stack">
      <Card title="Webhooks" sub="Tell another system when something happens. Simulated: events are logged here, and nothing is sent to the address." action={<Btn kind="primary" icon="Plus" onClick={() => { setError(''); setForm({ name: '', url: 'https://', events: [] }); }}>New webhook</Btn>} pad={false}>
        {hooks.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Name</th><th>Address</th><th>Events</th><th>Status</th><th /></tr></thead>
          <tbody>{hooks.map((h) => <tr key={h.id}><td className="strong">{h.name}</td><td className="small" style={{ overflowWrap: 'anywhere' }}>{h.url}</td><td className="small">{h.events.map(eventName).join(', ')}</td><td><Badge tone={h.active ? 'good' : 'muted'}>{h.active ? 'On' : 'Off'}</Badge></td><td><div className="row" style={{ justifyContent: 'flex-end' }}><Btn sm onClick={() => { testWebhook(h.id); toast('Test sent (simulated). See the result below.'); }}>Test</Btn><Btn sm kind="ghost" icon="KeyRound" aria-label={`Signing secret for ${h.name}`} onClick={() => { if (!h.secret) update('webhooks', h.id, { secret: newSecretKey() }); setSecretOf(h.id); }} /><Btn sm onClick={() => update('webhooks', h.id, { active: !h.active })}>{h.active ? 'Turn off' : 'Turn on'}</Btn><Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${h.name}`} onClick={() => setDel(h)} /></div></td></tr>)}</tbody></table></div>
          : <Empty icon="Webhook" text="No webhooks yet." />}
      </Card>
      <DataTable rows={db.webhookLog || []} exportName="webhook-log" dateOf={(x) => x.at} initialSort={{ k: 'at', dir: 'desc' }} searchPlaceholder="Search deliveries…" emptyText="No events logged yet." onRow={(x) => setOpen(x.id)}
        statusTabs={{ options: ['Delivered', 'Retrying', 'Failed'], get: (x) => x.status || 'Delivered' }}
        columns={[
          { k: 'at', label: 'When', nowrap: true, render: (x) => fmtDT(x.at) },
          { k: 'hook', label: 'Webhook', value: (x) => nameOf(x.webhookId) },
          { k: 'event', label: 'Event', value: (x) => (x.event === 'test' ? 'Test' : eventName(x.event)) },
          { k: 'label', label: 'Record' },
          { k: 'status', label: 'Result', value: (x) => x.status || 'Logged', render: (x) => <Badge tone={!x.status || x.status === 'Delivered' ? 'good' : x.status === 'Failed' ? 'bad' : 'warn'}>{x.status ? `${x.status}${x.code ? ` (${x.code})` : ''}` : 'Logged'}</Badge> },
          { k: 'tries', label: 'Tries', align: 'r', value: (x) => x.attempts || 1 },
        ]} />
      {form && <Modal title="New webhook" onClose={() => setForm(null)} footer={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
        <div className="stack">
          <div className="field"><label className="label" htmlFor="wh-name">Name</label><input id="wh-name" className="input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }} /></div>
          <div className="field"><label className="label" htmlFor="wh-url">Address</label><input id="wh-url" className="input" value={form.url} onChange={(e) => { setForm({ ...form, url: e.target.value }); setError(''); }} /></div>
          <div className="field"><div className="label">Events</div><div className="stack-s" style={{ maxHeight: 200, overflowY: 'auto' }}>{TRIGGERS.filter((t) => !t.timed).map((t) => <label key={t.k} className="check small"><input type="checkbox" checked={form.events.includes(t.k)} onChange={(e) => { setForm({ ...form, events: e.target.checked ? [...form.events, t.k] : form.events.filter((x) => x !== t.k) }); setError(''); }} />{t.label}</label>)}</div></div>
          {error && <div className="error-text">{error}</div>}
        </div>
      </Modal>}
      {open && (db.webhookLog || []).find((x) => x.id === open) && <DeliveryDetail item={(db.webhookLog || []).find((x) => x.id === open)} hook={hooks.find((h) => h.id === (db.webhookLog || []).find((x) => x.id === open).webhookId)} onClose={() => setOpen(null)} />}
      {secretOf && <Modal size="sm" title="Signing secret" onClose={() => setSecretOf(null)} footer={<Btn kind="primary" onClick={() => setSecretOf(null)}>Done</Btn>}><div className="stack-s"><code style={{ overflowWrap: 'anywhere' }}>{hooks.find((h) => h.id === secretOf)?.secret || '…'}</code><div className="small muted">Give this to the system that receives the webhook. It uses it to check each delivery really came from this CRM.</div><Btn sm kind="ghost" onClick={() => { update('webhooks', secretOf, { secret: newSecretKey() }); toast('New secret made. Update the receiving system.'); }}>Make a new secret</Btn></div></Modal>}
      {del && <Confirm title={`Delete ${del.name}?`} text="No more events will be logged for it." onClose={() => setDel(null)} onConfirm={() => { remove('webhooks', del.id); toast('Webhook deleted'); }} />}
    </div>
  );
}

export default function Connections() {
  const { db, t, sec, can } = useStore();
  const [q, setQ] = useState('');
  const [pref, setTab] = useState('apps');
  const linked = APPS.filter((a) => db.connections?.[a.k]?.connected);
  const problems = linked.filter((a) => db.connections[a.k].lastStatus === 'Failed').length;
  const runs = db.syncRuns || [];
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const today = runs.filter((r) => r.at >= dayAgo);
  const tabs = [
    { k: 'apps', label: 'Apps', icon: 'LayoutGrid' }, { k: 'attention', label: 'Needs attention', icon: 'TriangleAlert', count: ((db.syncConflicts || []).length + (db.syncIssues || []).length) || undefined }, { k: 'activity', label: 'Sync history', icon: 'History', count: runs.length },
    ...(can('connections', 'edit') ? [{ k: 'keys', label: 'API keys', icon: 'KeyRound' }, { k: 'api', label: 'Try the API', icon: 'Braces' }, { k: 'hooks', label: 'Webhooks', icon: 'Webhook' }] : []),
  ].filter((x) => sec('connections', x.k));
  const tab = firstAllowed(tabs, pref);
  return (
    <div>
      <PageHead title={t('connections')} sub={`${linked.length} of ${APPS.length} connected. Link the CRM to the other systems your business runs on.`}>
        {tab === 'apps' && <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search apps" placeholder="Search apps…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      </PageHead>
      <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="Connected" value={linked.length} note={`of ${APPS.length} apps`} icon="Plug" />
        <Kpi label="Problems" value={problems + (db.syncConflicts || []).length + (db.syncIssues || []).length} note={`${problems} failed syncs, ${(db.syncConflicts || []).length + (db.syncIssues || []).length} records to decide`} icon="TriangleAlert" />
        <Kpi label="Syncs in 24 hours" value={num(today.length)} icon="RefreshCw" />
        <Kpi label="Records updated" value={num(today.reduce((a, r) => a + r.inCount, 0))} note="Into the CRM, in 24 hours" icon="ArrowDownToLine" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {!tab && <NoSections />}
      {tab === 'apps' && <AppsTab q={q} />}
      {tab === 'attention' && <Attention />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'api' && <ApiExplorer />}
      {tab === 'keys' && <ApiKeys />}
      {tab === 'hooks' && <Webhooks />}
    </div>
  );
}
