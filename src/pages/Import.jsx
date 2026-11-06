import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, Modal } from '../ui';
import { DUP_ENTITY, duplicateGroups, findDuplicate, parseCsv } from '../engine';
import { companyFields, contactFields, leadFields } from '../shared';
import { downloadBlob, fmtDT } from '../util';
import { createBackup, listBackups, readBackup } from '../backups';
import { secOf } from '../security';

const KINDS = {
  lead: { label: 'leads', module: 'leads', fields: leadFields, name: (r) => r.name },
  contact: { label: 'contacts', module: 'contacts', fields: contactFields, name: (r) => `${r.first} ${r.last}` },
  company: { label: 'customers', module: 'customers', fields: companyFields, name: (r) => r.name },
};
const SKIP = ['ownerId', 'tags', 'currency'];
const say = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

export function ImportDialog({ kind, onClose }) {
  const { db, formFields, importRecords, toast, orgId } = useStore();
  const cfg = KINDS[kind];
  const fields = formFields(kind, cfg.fields({ owner: false })).filter((f) => !SKIP.includes(f.k) && !f.hide);
  const [rows, setRows] = useState(null);
  const [map, setMap] = useState({});
  const [mode, setMode] = useState('skip');
  const [error, setError] = useState('');
  const load = (text) => {
    const parsed = parseCsv(text);
    if (parsed.length < 2) { setError('The file needs a heading row and at least one record.'); return; }
    setError('');
    setRows(parsed);
    const guess = {};
    parsed[0].forEach((h, i) => { const f = fields.find((x) => say(x.label) === say(h) || say(x.k) === say(h)); if (f) guess[f.k] = i; });
    setMap(guess);
  };
  const file = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => load(String(r.result)); r.readAsText(f); };
  const sample = () => downloadBlob(new Blob([`${fields.map((f) => `"${f.label}"`).join(',')}\n`], { type: 'text/csv' }), `${cfg.label}-template.csv`);
  const companyIdFor = (name) => db.companies.find((c) => c.name.toLowerCase() === String(name).trim().toLowerCase())?.id;
  const records = (rows || []).slice(1).map((row) => {
    const rec = {};
    fields.forEach((f) => { if (map[f.k] !== undefined) { const raw = row[map[f.k]] ?? ''; rec[f.k] = f.type === 'number' ? Number(raw) || 0 : raw; } });
    if (rec.companyId) { rec.companyName = rec.companyId; rec.companyId = companyIdFor(rec.companyId) || ''; }
    return rec;
  });
  const need = fields.filter((f) => f.req && f.type !== 'company');
  const invalid = (r) => need.some((f) => !String(r[f.k] ?? '').trim());
  const bad = records.filter(invalid).length;
  const dups = records.filter((r) => !invalid(r) && findDuplicate(db, kind, r)).length;
  const add = records.length - bad - (mode === 'create' ? 0 : dups);
  const missing = need.filter((f) => map[f.k] === undefined);
  const run = async () => {
    // A safety backup first, so a bad import can be undone from Security, Backups.
    try { await createBackup(orgId, db, `Before importing ${cfg.label.toLowerCase()}`, secOf(db.settings).backupOffsite); } catch { /* storage may be blocked */ }
    const r = importRecords(kind, records.filter((x) => !invalid(x)), mode);
    toast(`${r.added} added, ${r.updated} updated, ${r.skipped + bad} skipped`);
    onClose();
  };
  return (
    <Modal size="lg" title={`Import ${cfg.label}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn>{rows && <Btn kind="primary" disabled={!!missing.length || (add <= 0 && mode !== 'update')} onClick={run}>Import</Btn>}</>}>
      {!rows ? (
        <div className="stack">
          <p className="sub" style={{ margin: 0 }}>Upload a CSV file. You'll match its columns and see duplicates before anything is added.</p>
          <input type="file" className="input" accept=".csv,text/csv" aria-label="CSV file" onChange={file} />
          <div className="field"><label className="label" htmlFor="csv-paste">Or paste CSV text</label><textarea id="csv-paste" className="textarea" rows={6} onBlur={(e) => { if (e.target.value.trim()) load(e.target.value); }} /></div>
          {error && <span className="error-text">{error}</span>}
          <div><Btn sm icon="Download" onClick={sample}>Download a blank template</Btn></div>
        </div>
      ) : (
        <div className="stack">
          <div className="row wrap"><Badge tone="muted" dot={false}>{`${records.length} rows`}</Badge><Badge tone="good" dot={false}>{`${Math.max(0, add)} will be added`}</Badge>{dups > 0 && <Badge tone="warn" dot={false}>{`${dups} possible duplicates`}</Badge>}{bad > 0 && <Badge tone="bad" dot={false}>{`${bad} missing required data`}</Badge>}</div>
          <div className="form-grid">
            {fields.map((f) => (
              <div className="field" key={f.k}><label className="label">{f.label}{f.req && <span className="req"> *</span>}</label>
                <select className={`select ${f.req && map[f.k] === undefined && f.type !== 'company' ? 'err' : ''}`} value={map[f.k] ?? ''} onChange={(e) => setMap((p) => { const n = { ...p }; if (e.target.value === '') delete n[f.k]; else n[f.k] = Number(e.target.value); return n; })}>
                  <option value="">Don't import</option>
                  {rows[0].map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="field"><label className="label" htmlFor="dup-mode">If a record already exists</label>
            <select id="dup-mode" className="select" value={mode} onChange={(e) => setMode(e.target.value)}><option value="skip">Skip it</option><option value="update">Update the existing record</option><option value="create">Add it anyway</option></select>
          </div>
          {kind === 'contact' && <div className="small muted">A company that doesn't exist yet is created as a new customer.</div>}
          {missing.length > 0 && <span className="error-text">Match these required columns: {missing.map((f) => f.label).join(', ')}.</span>}
        </div>
      )}
    </Modal>
  );
}

export function ImportButton({ kind }) {
  const { can } = useStore();
  const [open, setOpen] = useState(false);
  if (!can(KINDS[kind].module, 'create')) return null;
  return <><Btn icon="Upload" onClick={() => setOpen(true)}>Import</Btn>{open && <ImportDialog kind={kind} onClose={() => setOpen(false)} />}</>;
}

export function AutoBackups() {
  const { db, orgId, restoreBackup, toast } = useStore();
  const [list, setList] = useState(null);
  const [restore, setRestore] = useState(null);
  useEffect(() => { listBackups(orgId).then(setList).catch(() => setList([])); }, [orgId]);
  return (
    <Card title="Automatic backups" sub="Taken when the CRM is opened, in this browser only. Manage them under Security, Backups.">
      {list && !list.length && <div className="sub">None yet.</div>}
      {(list || []).map((b) => <div key={b.id} className="dashlet"><span className="grow">{fmtDT(b.at)}<div className="small muted">{Math.round(b.size / 1024)} KB</div></span><Btn sm onClick={() => setRestore(b)}>Restore</Btn></div>)}
      {restore && <Confirm title="Restore this backup?" text={`Everything in ${db.settings.companyName} goes back to ${fmtDT(restore.at)}. Changes since then are lost.`} confirmLabel="Restore" onClose={() => setRestore(null)} onConfirm={() => { readBackup(restore.id).then((data) => { restoreBackup(data); toast('Backup restored'); }); }} />}
    </Card>
  );
}

export function DuplicatesCard() {
  const { db, mergeDuplicates, toast } = useStore();
  const [kind, setKind] = useState('contact');
  const [merge, setMerge] = useState(null);
  const groups = duplicateGroups(db, kind);
  return (
    <Card title="Find duplicates" sub="Same email, or the same name">
      <div className="stack-s">
        <select className="select" aria-label="Record type" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
        {!groups.length && <div className="sub">No duplicates found.</div>}
        {groups.slice(0, 8).map((g) => (
          <div key={g[0].id} className="dashlet">
            <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{KINDS[kind].name(g[0])}</div><div className="small muted">{g.length} records</div></div>
            <Btn sm onClick={() => setMerge(g)}>Merge</Btn>
          </div>
        ))}
        {groups.length > 8 && <div className="small muted">And {groups.length - 8} more.</div>}
      </div>
      {merge && <Confirm title="Merge these records?" text={`The oldest ${KINDS[kind].label.replace(/s$/, '')} stays and takes over the links and history of the other ${merge.length - 1}. This can't be undone.`} confirmLabel="Merge" onClose={() => setMerge(null)} onConfirm={() => { mergeDuplicates(kind, merge.map((r) => r.id)); toast('Records merged'); }} />}
    </Card>
  );
}
export { DUP_ENTITY };
