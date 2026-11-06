import React, { useEffect, useState } from 'react';
import { ROLES, roleNameOf, useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Empty, FormFields, Icon, Kpi, Modal, NoSections, PageHead, Pills, Progress, Tabs, UserChip, firstAllowed } from '../ui';
import { COLLECTIONS, createBackup, deleteBackup, diffOf, fileFor, listBackups, readBackup, readFile, storageUse, verifyBackup } from '../backups';
import { DEMO_IP, healthOf, secOf, securityEvents, tempPassword } from '../security';
import { demoHash } from '../engine';
import { downloadBlob, fmtDT, fmtDate, num } from '../util';

const NOTE = 'Simulated. These rules show how real security behaves, but they run in this browser, so they don\'t protect the data until a real server enforces them.';

function Overview({ backups, onTab }) {
  const { db } = useStore();
  const { items, score } = healthOf(db.settings, backups);
  const log = db.loginLog || [];
  const week = Date.now() - 7 * 864e5;
  const recent = log.filter((x) => new Date(x.at).getTime() >= week);
  const locked = db.users.filter((u) => u.lockedUntil && new Date(u.lockedUntil) > new Date());
  const go = { passwords: 'rules', strong: 'rules', twoStep: 'rules', lock: 'rules', timeout: 'rules', common: 'rules', alerts: 'rules', backup: 'backups', offsite: 'backups' };
  return (
    <div className="stack">
      <div className="g4">
        <Kpi label="Security score" value={`${score}%`} note={`${items.filter((i) => i.ok).length} of ${items.length} done`} icon="ShieldCheck" />
        <Kpi label="Sign-ins this week" value={num(recent.filter((x) => x.result === 'Success').length)} icon="LogIn" />
        <Kpi label="Failed this week" value={num(recent.filter((x) => x.result !== 'Success').length)} note="Wrong passwords and blocks" icon="ShieldAlert" />
        <Kpi label="Locked accounts" value={locked.length} note={`${(db.sessions || []).length} active sessions`} icon="Lock" />
      </div>
      <Card title="What to do next" sub="Each item makes the CRM safer once there is a real server.">
        <div className="stack-s">
          <Progress value={score} />
          {items.map((i) => (
            <div className="dashlet" key={i.k}>
              <Icon name={i.ok ? 'CircleCheck' : 'CircleAlert'} size={17} style={{ color: i.ok ? 'var(--good)' : 'var(--warn)', flexShrink: 0 }} />
              <span className="grow">{i.label}</span>
              {i.ok ? <Badge tone="good">Done</Badge> : <Btn sm onClick={() => onTab(go[i.k])}>{i.fix}</Btn>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Rules() {
  const { db, updateSettings, toast } = useStore();
  const sec = secOf(db.settings);
  const [v, setV] = useState({
    requirePasswords: !!db.settings.requirePasswords, min: sec.passwordPolicy.min, number: sec.passwordPolicy.number, symbol: sec.passwordPolicy.symbol, days: sec.passwordPolicy.days,
    lockAfter: sec.lockAfter, lockMinutes: sec.lockMinutes, sessionTimeout: sec.sessionTimeout, twoStep: sec.twoStep, google: sec.sso.google, microsoft: sec.sso.microsoft, saml: sec.sso.saml, ipAllow: sec.ipAllow,
    blockCommon: sec.blockCommon, noReuse: sec.noReuse, hoursOn: sec.hours.on, hoursFrom: sec.hours.from, hoursTo: sec.hours.to, hoursRoles: sec.hours.roles, hoursDays: sec.hours.days, maxSessions: sec.maxSessions, rememberDays: sec.rememberDays, newDeviceAlert: sec.newDeviceAlert,
  });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const n = (x) => Math.max(0, Number(x) || 0);
  const save = () => {
    updateSettings({
      requirePasswords: v.requirePasswords,
      passwordPolicy: { min: Math.max(4, n(v.min)), number: !!v.number, symbol: !!v.symbol, days: n(v.days) },
      lockAfter: n(v.lockAfter), lockMinutes: n(v.lockMinutes), sessionTimeout: n(v.sessionTimeout), twoStep: v.twoStep,
      sso: { google: !!v.google, microsoft: !!v.microsoft, saml: !!v.saml }, ipAllow: v.ipAllow || '',
      blockCommon: !!v.blockCommon, noReuse: n(v.noReuse), hours: { on: !!v.hoursOn, from: v.hoursFrom || '07:00', to: v.hoursTo || '21:00', roles: v.hoursRoles || [], days: v.hoursDays || [] }, maxSessions: n(v.maxSessions), rememberDays: n(v.rememberDays), newDeviceAlert: !!v.newDeviceAlert,
    });
    toast('Security rules saved');
  };
  return (
    <div className="stack">
      <div className="g2" style={{ alignItems: 'start' }}>
        <Card title="Passwords">
          <FormFields values={v} onChange={set} fields={[
            { k: 'requirePasswords', label: 'Sign-in', type: 'check', text: 'Require a password at login', full: true, hint: 'While this is off, the login page offers the one-click demo roles, and the rules on this page are skipped.' },
            { k: 'min', label: 'Shortest allowed', type: 'number', min: 4 },
            { k: 'days', label: 'Change every (days)', type: 'number', min: 0, hint: '0 means never' },
            { k: 'number', label: 'Numbers', type: 'check', text: 'Must include a number' },
            { k: 'symbol', label: 'Symbols', type: 'check', text: 'Must include a symbol' },
            { k: 'blockCommon', label: 'Common passwords', type: 'check', text: 'Refuse common passwords and ones with the email name', full: true },
            { k: 'noReuse', label: 'No reuse of the last', type: 'number', min: 0, hint: 'Passwords. 0 allows reuse' },
          ]} />
        </Card>
        <Card title="Lockout and idle time">
          <FormFields values={v} onChange={set} fields={[
            { k: 'lockAfter', label: 'Lock after wrong passwords', type: 'number', min: 0, hint: '0 means never lock' },
            { k: 'lockMinutes', label: 'Stay locked for (minutes)', type: 'number', min: 0 },
            { k: 'sessionTimeout', label: 'Sign out after idle (minutes)', type: 'number', min: 0, hint: '0 means stay signed in', full: true },
            { k: 'maxSessions', label: 'Most devices at once', type: 'number', min: 0, hint: '0 means no limit. The oldest sign-in ends first.' },
            { k: 'rememberDays', label: 'Trust a device for (days)', type: 'number', min: 0, hint: 'Skips two-step on that device. 0 turns it off.' },
            { k: 'newDeviceAlert', label: 'New devices', type: 'check', text: 'Tell people, and Admins, about sign-ins from a new device', full: true },
          ]} />
        </Card>
        <Card title="Two-step sign-in" sub="After the password, people enter a code. The login page shows the code, because no text or email is really sent.">
          <FormFields values={v} onChange={set} fields={[
            { k: 'twoStep', label: 'Who needs it', type: 'select', noBlank: true, full: true, options: [{ value: 'off', label: 'Only people who turn it on in their profile' }, { value: 'admins', label: 'Admins' }, { value: 'all', label: 'Everyone' }] },
          ]} />
        </Card>
        <Card title="Single sign-on" sub="Shows these buttons on the login page. Nothing connects to the real services.">
          <FormFields values={v} onChange={set} fields={[
            { k: 'google', label: 'Google', type: 'check', text: 'Offer Google' },
            { k: 'microsoft', label: 'Microsoft', type: 'check', text: 'Offer Microsoft' },
            { k: 'saml', label: 'Company login', type: 'check', text: 'Offer company login (SAML)' },
          ]} />
        </Card>
        <Card title="Sign-in hours" sub="Outside these hours, people in the chosen roles can't sign in. Admins always can.">
          <div className="stack-s">
            <label className="check"><input type="checkbox" checked={!!v.hoursOn} onChange={(e) => set('hoursOn', e.target.checked)} />Limit sign-in hours</label>
            {v.hoursOn && <>
              <div className="row wrap" role="group" aria-label="Roles">{Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={(v.hoursRoles || []).includes(k)} onChange={(e) => set('hoursRoles', e.target.checked ? [...(v.hoursRoles || []), k] : (v.hoursRoles || []).filter((x) => x !== k))} />{l}</label>)}</div>
              <div className="row wrap" role="group" aria-label="Days">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <label key={d} className="check"><input type="checkbox" checked={(v.hoursDays || []).includes(i)} onChange={(e) => set('hoursDays', e.target.checked ? [...(v.hoursDays || []), i].sort() : (v.hoursDays || []).filter((x) => x !== i))} />{d}</label>)}</div>
              <FormFields values={v} onChange={set} fields={[{ k: 'hoursFrom', label: 'From', type: 'time' }, { k: 'hoursTo', label: 'Until', type: 'time' }]} />
            </>}
          </div>
        </Card>
        <Card title="Allowed network addresses" sub={`Leave empty to allow any. Admins are never blocked, so nobody gets locked out. This browser's demo address is ${DEMO_IP}.`}>
          <FormFields values={v} onChange={set} fields={[{ k: 'ipAllow', label: 'Addresses or the start of one', type: 'textarea', full: true, placeholder: 'For example, 203.0.113.' }]} />
        </Card>
      </div>
      <div><Btn kind="primary" onClick={save}>Save rules</Btn></div>
    </div>
  );
}

function People() {
  const { db, unlockUser, resetUserPassword, signOutUser, toast, setAuthenticator } = useStore();
  const [temp, setTemp] = useState(null);
  const log = db.loginLog || [];
  const lastOf = (id) => log.find((x) => x.userId === id && x.result === 'Success')?.at;
  const sec = secOf(db.settings);
  const twoStepOf = (u) => (sec.twoStep === 'all' || (sec.twoStep === 'admins' && u.role === 'admin') ? 'Required' : u.twoStep ? 'On' : 'Off');
  const isLocked = (u) => u.lockedUntil && new Date(u.lockedUntil) > new Date();
  return (
    <>
      <DataTable rows={db.users.filter((u) => u.active)} exportName="security-people" searchPlaceholder="Search people…" initialSort={{ k: 'name', dir: 'asc' }}
        columns={[
          { k: 'name', label: 'Person', render: (u) => <UserChip id={u.id} /> },
          { k: 'role', label: 'Role', value: (u) => roleNameOf(db, u) },
          { k: 'last', label: 'Last sign-in', value: (u) => lastOf(u.id) || '', render: (u) => (lastOf(u.id) ? fmtDT(lastOf(u.id)) : 'Never') },
          { k: 'pass', label: 'Password changed', value: (u) => u.passChangedAt || '', render: (u) => (u.passChangedAt ? fmtDate(u.passChangedAt) : 'Not yet') },
          { k: 'two', label: 'Two-step', value: twoStepOf },
          { k: 'app', label: 'Authenticator', value: (u) => (u.totpSecret ? 'On' : 'Off'), render: (u) => <Badge tone={u.totpSecret ? 'good' : 'muted'} dot={false}>{u.totpSecret ? 'On' : 'Off'}</Badge> },
          { k: 'state', label: 'Status', value: (u) => (isLocked(u) ? 'Locked' : u.mustChangePassword ? 'Must change password' : 'OK'), render: (u) => <Badge tone={isLocked(u) ? 'bad' : u.mustChangePassword ? 'warn' : 'good'}>{isLocked(u) ? 'Locked' : u.mustChangePassword ? 'Must change password' : 'OK'}</Badge> },
          { k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (u) => <div className="row" style={{ justifyContent: 'flex-end' }}>
            {isLocked(u) && <Btn sm onClick={() => { unlockUser(u.id); toast(`${u.name} unlocked`); }}>Unlock</Btn>}
            <Btn sm onClick={() => { const t = tempPassword(); resetUserPassword(u.id, demoHash(t)); setTemp({ name: u.name, t }); }}>Reset password</Btn>
            <Btn sm onClick={() => { signOutUser(u.id); toast(`${u.name} signed out everywhere`); }}>Sign out</Btn>
            {u.totpSecret && <Btn sm kind="ghost" onClick={() => { setAuthenticator(u.id, null, []); toast(`${u.name}'s authenticator app was removed. They can set it up again.`); }}>Remove app</Btn>}
          </div> },
        ]} />
      {temp && <Modal size="sm" title={`Temporary password for ${temp.name}`} onClose={() => setTemp(null)} footer={<Btn kind="primary" onClick={() => setTemp(null)}>Done</Btn>}>
        <div className="stack-s"><div className="strong" style={{ fontSize: 18 }}>{temp.t}</div><div className="small muted">They must choose a new one at their next sign-in. A real system would email a link, and nobody would see this.</div></div>
      </Modal>}
    </>
  );
}

function Activity() {
  const { db, endSession, currentSessionId, signOutOthers, toast, userName } = useStore();
  const current = currentSessionId();
  const sessions = db.sessions || [];
  return (
    <div className="stack">
      <Card title="Active sessions" sub="Where people are signed in now. The other devices are sample data." action={sessions.length > 1 && <Btn onClick={() => { signOutOthers(); toast('Other sessions signed out'); }}>Sign out all others</Btn>} pad={false}>
        {sessions.length ? <div className="tb-wrap"><table className="table">
          <thead><tr><th>Person</th><th>Device</th><th>Address</th><th>Signed in</th><th /></tr></thead>
          <tbody>{sessions.map((s) => <tr key={s.id}><td><UserChip id={s.userId} /></td><td>{s.device}{s.id === current && <> <Badge tone="good" dot={false}>This device</Badge></>}</td><td>{s.ip}{s.place ? ` · ${s.place}` : ''}</td><td>{fmtDT(s.at)}</td><td className="r">{s.id !== current && <Btn sm onClick={() => { endSession(s.id); toast('Session signed out'); }}>Sign out</Btn>}</td></tr>)}</tbody>
        </table></div> : <Empty icon="MonitorSmartphone" text="No active sessions." />}
      </Card>
      <DataTable rows={db.loginLog || []} exportName="sign-in-history" dateOf={(x) => x.at} initialSort={{ k: 'at', dir: 'desc' }} searchPlaceholder="Search sign-ins…"
        statusTabs={{ options: ['Success', 'Failed', 'Locked', 'Blocked'], get: (x) => x.result }}
        columns={[
          { k: 'at', label: 'When', nowrap: true, render: (x) => fmtDT(x.at) },
          { k: 'who', label: 'Person', value: (x) => (x.userId ? userName(x.userId) : x.email || 'Unknown') },
          { k: 'method', label: 'How' },
          { k: 'result', label: 'Result', render: (x) => <Badge tone={x.result === 'Success' ? 'good' : x.result === 'Failed' ? 'warn' : 'bad'}>{x.result}</Badge> },
          { k: 'device', label: 'Device' },
          { k: 'ip', label: 'Address' },
          { k: 'place', label: 'Place' },
        ]} />
    </div>
  );
}

const LEVEL_TONE = { High: 'bad', Medium: 'warn', Low: 'muted' };
function Alerts() {
  const { db } = useStore();
  const [level, setLevel] = useState('All');
  const all = securityEvents(db);
  const rows = all.filter((e) => level === 'All' || e.level === level);
  return (
    <div className="stack">
      <Pills value={level} onChange={setLevel} options={['All', 'High', 'Medium', 'Low'].map((k) => ({ k, label: k, count: k === 'All' ? all.length : all.filter((e) => e.level === k).length }))} />
      {!rows.length ? <div className="card"><Empty icon="ShieldCheck" text="Nothing to look at here." /></div> : (
        <DataTable rows={rows.map((e, i) => ({ ...e, id: `ev${i}` }))} exportName="security-alerts" dateOf={(x) => x.at} initialSort={{ k: 'at', dir: 'desc' }} searchPlaceholder="Search alerts…" columns={[
          { k: 'at', label: 'When', nowrap: true, render: (x) => fmtDT(x.at) },
          { k: 'level', label: 'Level', render: (x) => <Badge tone={LEVEL_TONE[x.level]}>{x.level}</Badge> },
          { k: 'kind', label: 'Area' },
          { k: 'text', label: 'What happened' },
        ]} />
      )}
      <p className="small muted">Worked out from sign-ins and the change history in this browser. Wrong-password bursts, locks, blocks, new devices, big exports, erasures, permanent deletes, and changes to people, access or sign-in rules.</p>
    </div>
  );
}

function RecycleBin() {
  const { db, restoreDeleted, purgeDeleted, toast, userName } = useStore();
  const [del, setDel] = useState(null);
  const [emptying, setEmptying] = useState(false);
  const rows = db.recycleBin || [];
  const words = { deals: 'Opportunity', leads: 'Lead', contacts: 'Contact', companies: 'Customer', activities: 'Task', cases: 'Support case', products: 'Product', events: 'Appointment', suppliers: 'Supplier' };
  return (
    <div className="stack">
      <div className="row between wrap"><span className="sub">Deleted records stay here for 30 days, then they're removed for good.</span>{rows.length > 0 && <Btn kind="danger" onClick={() => setEmptying(true)}>Empty the bin</Btn>}</div>
      <DataTable rows={rows} exportName="recycle-bin" dateOf={(x) => x.at} initialSort={{ k: 'at', dir: 'desc' }} searchPlaceholder="Search deleted records…" emptyText="Nothing has been deleted."
        columns={[
          { k: 'label', label: 'Record', render: (x) => <span className="strong">{x.label}</span> },
          { k: 'type', label: 'Type', value: (x) => words[x.entity] || x.entity },
          { k: 'at', label: 'Deleted', nowrap: true, render: (x) => fmtDT(x.at) },
          { k: 'by', label: 'By', value: (x) => userName(x.by) },
          { k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (x) => <div className="row" style={{ justifyContent: 'flex-end' }}><Btn sm icon="Undo2" onClick={() => { restoreDeleted(x.id); toast(`${x.label} restored`); }}>Restore</Btn><Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${x.label} for good`} onClick={() => setDel(x)} /></div> },
        ]} />
      {del && <Confirm title={`Delete ${del.label} for good?`} text="This can't be undone." onClose={() => setDel(null)} onConfirm={() => { purgeDeleted(del.id); toast('Deleted for good'); }} />}
      {emptying && <Confirm title="Empty the bin?" text={`${rows.length} records will be deleted for good. This can't be undone.`} onClose={() => setEmptying(false)} onConfirm={() => { purgeDeleted(); toast('Bin emptied'); }} />}
    </div>
  );
}

function CompareModal({ title, then, onClose, onDone }) {
  const { db, orgId, restorePartial, toast } = useStore();
  const rows = diffOf(db, then).filter((r) => r.now || r.then);
  const [kinds, setKinds] = useState([]);
  const [gone, setGone] = useState({});
  const toggleKind = (k) => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const nameOf = (k, id) => { const r = (then[k] || []).find((x) => x.id === id); return r?.name || [r?.first, r?.last].filter(Boolean).join(' ') || r?.title || r?.number || r?.subject || id; };
  const picked = Object.values(gone).reduce((n, ids) => n + ids.length, 0);
  const apply = async () => {
    await createBackup(orgId, db, `Before bringing back from ${title}`, secOf(db.settings).backupOffsite);
    restorePartial(then, kinds, gone, title);
    toast('Brought back. A safety backup was taken first.');
    onDone?.();
    onClose();
  };
  return (
    <Modal size="lg" title={`Compare: ${title}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" disabled={!kinds.length && !picked} onClick={apply}>Bring back {kinds.length ? `${kinds.length} ${kinds.length === 1 ? 'kind' : 'kinds'}` : ''}{kinds.length && picked ? ' and ' : ''}{picked ? `${picked} deleted ${picked === 1 ? 'record' : 'records'}` : ''}</Btn></>}>
      <div className="stack">
        <div className="sub">What changed since the backup. Tick a kind of record to put all of it back as it was, or pick single records that were deleted.</div>
        <div className="tb-wrap"><table className="bk-diff">
          <thead><tr><th>Bring back all</th><th>Records</th><th className="r">Then</th><th className="r">Now</th><th className="r">Deleted since</th><th className="r">Added since</th><th className="r">Changed</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.k}>
            <td><input type="checkbox" aria-label={`Bring back all ${r.label}`} checked={kinds.includes(r.k)} onChange={() => toggleKind(r.k)} disabled={r.k === 'users'} /></td>
            <td className="strong">{r.label}</td><td className="r">{num(r.then)}</td><td className="r">{num(r.now)}</td>
            <td className="r">{r.gone.length || '—'}</td><td className="r">{r.added.length || '—'}</td><td className="r">{r.changed.length || '—'}</td>
          </tr>)}</tbody>
        </table></div>
        {rows.some((r) => r.gone.length && r.k !== 'users') && <div className="stack-s">
          <div className="label">Deleted since the backup</div>
          {rows.filter((r) => r.gone.length && r.k !== 'users' && !kinds.includes(r.k)).map((r) => <div key={r.k}>
            <div className="small muted">{r.label}</div>
            <div className="row wrap">{r.gone.slice(0, 40).map((id) => <label key={id} className="check small"><input type="checkbox" checked={(gone[r.k] || []).includes(id)} onChange={(e) => setGone((p) => ({ ...p, [r.k]: e.target.checked ? [...(p[r.k] || []), id] : (p[r.k] || []).filter((x) => x !== id) }))} />{nameOf(r.k, id)}</label>)}</div>
          </div>)}
        </div>}
        <div className="small muted">People can't be brought back from here, so nobody loses access by mistake. Use a full restore for that.</div>
      </div>
    </Modal>
  );
}

function Backups({ backups, reload }) {
  const { db, orgId, restoreBackup, updateSettings, logExport, toast } = useStore();
  const sec = secOf(db.settings);
  const [restore, setRestore] = useState(null);
  const [del, setDel] = useState(null);
  const [label, setLabel] = useState('');
  const [checks, setChecks] = useState({});
  const [compare, setCompare] = useState(null);
  const [dl, setDl] = useState(null);
  const [pass, setPass] = useState('');
  const [upload, setUpload] = useState(null);
  const [use, setUse] = useState(null);
  const [v, setV] = useState({ backupFreq: sec.backupFreq, backupKeep: sec.backupKeep, backupWeeks: sec.backupWeeks, backupMonths: sec.backupMonths, backupOffsite: sec.backupOffsite });
  useEffect(() => { storageUse().then(setUse); }, [backups.length]);
  const take = async () => {
    await createBackup(orgId, db, label.trim() || 'Manual backup', sec.backupOffsite);
    setLabel('');
    await reload();
    toast(sec.backupOffsite ? 'Backup taken, with a simulated off-site copy' : 'Backup taken');
  };
  const download = async () => {
    if (dl.lock && pass.length < 8) { toast('Use a password of at least 8 characters.', 'bad'); return; }
    const data = await readBackup(dl.b.id);
    const text = await fileFor(data, { label: dl.b.label, at: dl.b.at, company: db.settings.companyName }, dl.lock ? pass : '');
    downloadBlob(new Blob([text], { type: 'application/json' }), `backup-${dl.b.day}${dl.lock ? '-locked' : ''}.json`);
    logExport(`backup file${dl.lock ? ' (password locked)' : ''}`, 1);
    setDl(null); setPass('');
  };
  const check = async (b) => { const r = await verifyBackup(b.id); setChecks((p) => ({ ...p, [b.id]: r })); toast(r.text, r.ok ? undefined : 'bad'); };
  const openFile = async (file, password) => {
    const text = await file.text();
    const r = await readFile(text, password);
    setUpload({ file, ...r });
  };
  const total = (b) => Object.values(b.counts).reduce((a, n) => a + n, 0);
  return (
    <div className="stack">
      <div className="g2" style={{ alignItems: 'start' }}>
        <Card title="Take a backup now">
          <div className="stack-s">
            <div className="row"><input className="input grow" aria-label="Backup name" placeholder="Name, such as Before the import" value={label} onChange={(e) => setLabel(e.target.value)} /><Btn kind="primary" icon="DatabaseBackup" onClick={take}>Back up</Btn></div>
            <label className="btn" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}><Icon name="Upload" size={15} />Restore from a file<input type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files[0]; if (file) openFile(file); e.target.value = ''; }} /></label>
            {use && <div className="small muted">This browser uses {use.used < 1048576 ? `${Math.round(use.used / 1024)} KB` : `${(use.used / 1048576).toFixed(1)} MB`} of about {Math.round(use.quota / 1048576)} MB it allows.</div>}
            <div className="small muted">Imports take a safety backup by themselves first.</div>
          </div>
        </Card>
        <Card title="Automatic backups" sub="They run while the CRM is open. Kept in this browser only.">
          <div className="stack">
            <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} fields={[
              { k: 'backupFreq', label: 'How often', type: 'select', noBlank: true, options: ['Hourly', 'Daily', 'Weekly', 'Off'] },
              { k: 'backupKeep', label: 'Keep the latest', type: 'number', min: 1 },
              { k: 'backupWeeks', label: 'Also keep one a week for (weeks)', type: 'number', min: 0 },
              { k: 'backupMonths', label: 'And one a month for (months)', type: 'number', min: 0 },
              { k: 'backupOffsite', label: 'Off-site copy', type: 'check', text: 'Also copy each backup off-site (simulated)', full: true },
            ]} />
            <div><Btn onClick={() => { updateSettings({ backupFreq: v.backupFreq, backupKeep: Math.max(1, Number(v.backupKeep) || 7), backupWeeks: Math.max(0, Number(v.backupWeeks) || 0), backupMonths: Math.max(0, Number(v.backupMonths) || 0), backupOffsite: !!v.backupOffsite }); toast('Backup schedule saved'); }}>Save schedule</Btn></div>
          </div>
        </Card>
      </div>
      <Card title="Backups" sub="Restoring takes a safety backup first, so you can go back." pad={false}>
        {backups.length ? <div className="tb-wrap"><table className="table">
          <thead><tr><th>Backup</th><th>Taken</th><th className="r">Records</th><th className="r">Size</th><th>Copies</th><th>Check</th><th /></tr></thead>
          <tbody>{backups.map((b) => <tr key={b.id}>
            <td className="strong">{b.label}</td>
            <td>{fmtDT(b.at)}</td>
            <td className="r num" title={Object.entries(b.counts).map(([k, n]) => `${n} ${k}`).join(', ')}>{num(total(b))}</td>
            <td className="r num">{Math.round(b.size / 1024)} KB</td>
            <td>{b.offsite ? <Badge tone="good" dot={false}>This browser + off-site (simulated)</Badge> : <Badge tone="muted" dot={false}>This browser</Badge>}</td>
            <td>{checks[b.id] ? <Badge tone={checks[b.id].ok ? 'good' : 'bad'}>{checks[b.id].ok ? 'Intact' : 'Damaged'}</Badge> : <Btn sm kind="ghost" icon="ShieldCheck" onClick={() => check(b)}>Check</Btn>}</td>
            <td><div className="row" style={{ justifyContent: 'flex-end' }}>
              <Btn sm icon="GitCompare" onClick={async () => setCompare({ title: b.label, then: await readBackup(b.id) })}>Compare</Btn>
              <Btn sm icon="Download" aria-label={`Download ${b.label}`} onClick={() => { setDl({ b, lock: true }); setPass(''); }} />
              <Btn sm onClick={() => setRestore(b)}>Restore</Btn>
              <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${b.label}`} onClick={() => setDel(b)} />
            </div></td>
          </tr>)}</tbody>
        </table></div> : <Empty icon="DatabaseBackup" text="No backups yet." />}
      </Card>
      {restore && <Confirm title={`Restore ${restore.label}?`} text={`Everything in ${db.settings.companyName} goes back to ${fmtDT(restore.at)}. A safety backup is taken first.`} confirmLabel="Restore" onClose={() => setRestore(null)} onConfirm={async () => {
        const ok = await verifyBackup(restore.id);
        if (!ok.ok) { toast(ok.text, 'bad'); return; }
        await createBackup(orgId, db, `Before restoring ${restore.label}`, sec.backupOffsite);
        const data = await readBackup(restore.id);
        if (data?.users) { restoreBackup(data); toast('Backup restored'); } else toast('That backup could not be read', 'bad');
        await reload();
      }} />}
      {del && <Confirm title={`Delete ${del.label}?`} text="This backup will be gone for good." onClose={() => setDel(null)} onConfirm={async () => { await deleteBackup(del.id); await reload(); toast('Backup deleted'); }} />}
      {dl && <Modal title={`Download ${dl.b.label}`} onClose={() => setDl(null)} footer={<><Btn onClick={() => setDl(null)}>Cancel</Btn><Btn kind="primary" icon="Download" onClick={download}>Download</Btn></>}>
        <div className="stack-s">
          <label className="check"><input type="radio" name="bk-lock" checked={dl.lock} onChange={() => setDl({ ...dl, lock: true })} />Lock it with a password (recommended)</label>
          {dl.lock && <div className="field"><label className="label" htmlFor="bk-pass">Password</label><input id="bk-pass" className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /><span className="hint">At least 8 characters. Without it, the file can't be opened, and it can't be recovered.</span></div>}
          <label className="check"><input type="radio" name="bk-lock" checked={!dl.lock} onChange={() => setDl({ ...dl, lock: false })} />Plain file anyone can read</label>
          <div className="small muted">The file holds customer and personal data. Keep it somewhere safe.</div>
        </div>
      </Modal>}
      {upload && <Modal title={`Restore from ${upload.file.name}`} onClose={() => setUpload(null)} footer={<>
        <Btn onClick={() => setUpload(null)}>Cancel</Btn>
        {upload.needsPassword && <Btn kind="primary" onClick={() => openFile(upload.file, pass)}>Unlock</Btn>}
        {upload.data && <Btn onClick={() => { setCompare({ title: upload.meta?.label || upload.file.name, then: upload.data }); setUpload(null); }}>Compare and pick</Btn>}
        {upload.data && <Btn kind="primary" onClick={async () => { await createBackup(orgId, db, `Before restoring ${upload.file.name}`, sec.backupOffsite); restoreBackup(upload.data); await reload(); toast('Restored from the file. A safety backup was taken first.'); setUpload(null); }}>Restore everything</Btn>}
      </>}>
        <div className="stack-s">
          {upload.error && <div className="error-text">{upload.error}</div>}
          {upload.needsPassword && <><div className="sub">This file is locked with a password.</div><div className="field"><label className="label" htmlFor="up-pass">Password</label><input id="up-pass" className={`input ${upload.wrong ? 'err' : ''}`} type="password" value={pass} onChange={(e) => setPass(e.target.value)} />{upload.wrong && <span className="error-text">That password is wrong.</span>}</div></>}
          {upload.data && <>
            <div className="notice">{upload.meta?.label || 'Backup'}{upload.meta?.at ? `, taken ${fmtDT(upload.meta.at)}` : ''}{upload.meta?.company ? ` from ${upload.meta.company}` : ''}. {upload.checked ? 'Its fingerprint matches, so it is intact.' : 'It has no fingerprint to check.'}</div>
            <div className="small">{COLLECTIONS.filter(([k]) => (upload.data[k] || []).length).map(([k, l]) => `${num(upload.data[k].length)} ${l.toLowerCase()}`).join(', ')}</div>
            <div className="small muted">Restoring everything replaces what is here now. Compare first to bring back only part of it.</div>
          </>}
        </div>
      </Modal>}
      {compare && <CompareModal title={compare.title} then={compare.then} onClose={() => setCompare(null)} onDone={reload} />}
    </div>
  );
}

function Privacy() {
  const { db, erasePerson, logExport, toast, companyName } = useStore();
  const [q, setQ] = useState('');
  const [erase, setErase] = useState(null);
  const term = q.trim().toLowerCase();
  const people = term.length < 2 ? [] : [
    ...db.contacts.map((c) => ({ kind: 'contact', id: c.id, name: `${c.first} ${c.last}`, email: c.email, where: companyName(c.companyId), rec: c })),
    ...db.leads.map((l) => ({ kind: 'lead', id: l.id, name: l.name, email: l.email, where: l.company, rec: l })),
  ].filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(term)).slice(0, 12);
  const download = (p) => {
    const activities = (db.activities || []).filter((a) => a.relatedId === p.id);
    const emails = (db.emails || []).filter((e) => e.relatedId === p.id || (p.email && e.to === p.email));
    const formEnquiries = (db.formSubmissions || []).filter((s) => s.leadId === p.id || (p.email && String(s.values?.email || '').toLowerCase() === p.email.toLowerCase()));
    downloadBlob(new Blob([JSON.stringify({ person: p.rec, activities, emails, formEnquiries }, null, 2)], { type: 'application/json' }), `personal-data-${p.id}.json`);
    logExport(`personal data of ${p.name}`, 1);
    toast('Personal data downloaded');
  };
  return (
    <Card title="Privacy requests" sub="Find a person, then download what you hold about them or erase their details. Check your legal duties first, as some records must be kept.">
      <div className="stack">
        <input className="input" aria-label="Find a person" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        {term.length >= 2 && !people.length && <div className="sub">Nobody matches.</div>}
        {people.map((p) => (
          <div className="dashlet" key={`${p.kind}-${p.id}`}>
            <span className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{p.name}</div><div className="small muted trunc">{p.kind === 'lead' ? 'Lead' : 'Contact'} · {p.email || 'No email'} · {p.where || '—'}</div></span>
            <Btn sm icon="Download" onClick={() => download(p)}>Download</Btn>
            <Btn sm kind="danger" onClick={() => setErase(p)}>Erase</Btn>
          </div>
        ))}
      </div>
      {erase && <Confirm title={`Erase ${erase.name}?`} text="Their name, email, phone and notes are removed from this record for good. Deals and invoices stay, and old messages may still mention them." confirmLabel="Erase" onClose={() => setErase(null)} onConfirm={() => { erasePerson(erase.kind, erase.id); toast('Personal details erased'); setQ(''); }} />}
    </Card>
  );
}

export default function Security() {
  const { db, t, sec, orgId } = useStore();
  const [pref, setTab] = useState('overview');
  const [backups, setBackups] = useState([]);
  const reload = () => listBackups(orgId).then(setBackups).catch(() => setBackups([]));
  useEffect(() => { reload(); }, [orgId]);
  const tabs = [
    { k: 'overview', label: 'Overview', icon: 'ShieldCheck' }, { k: 'rules', label: 'Sign-in rules', icon: 'KeyRound' }, { k: 'people', label: 'People', icon: 'Users' },
    { k: 'activity', label: 'Sign-ins and sessions', icon: 'MonitorSmartphone' }, { k: 'alerts', label: 'Alerts', icon: 'Siren', count: securityEvents(db).filter((e) => e.level === 'High').length || undefined }, { k: 'bin', label: 'Recycle bin', icon: 'Trash2', count: (db.recycleBin || []).length },
    { k: 'backups', label: 'Backups', icon: 'DatabaseBackup', count: backups.length }, { k: 'privacy', label: 'Privacy requests', icon: 'UserX' },
  ].filter((x) => sec('security', x.k));
  const tab = firstAllowed(tabs, pref);
  return (
    <div>
      <PageHead title={t('security')} sub="Sign-in rules, sessions, backups, deleted records and privacy requests" />
      <p className="notice" style={{ marginBottom: 14 }}>{NOTE}</p>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {!tab && <NoSections />}
      {tab === 'overview' && <Overview backups={backups} onTab={setTab} />}
      {tab === 'rules' && <Rules />}
      {tab === 'people' && <People />}
      {tab === 'activity' && <Activity />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'bin' && <RecycleBin />}
      {tab === 'backups' && <Backups backups={backups} reload={reload} />}
      {tab === 'privacy' && <Privacy />}
    </div>
  );
}
