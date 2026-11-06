import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Empty, Modal } from '../ui';
import { Bars } from '../charts';
import { API_AREAS, ENDPOINTS, answer, signBody } from '../connTools';
import { fmtDT, fmtShort, iso, money } from '../util';

// What needs a person: changes both systems made to the same record, and records a sync couldn't take.
export function Attention() {
  const { db, can, resolveConflict, resolveIssue, toast } = useStore();
  const canEdit = can('connections', 'edit');
  const conflicts = db.syncConflicts || [];
  const issues = db.syncIssues || [];
  const show = (c, v) => (c.field === 'price' ? money(Number(v) || 0) : String(v ?? '—'));
  return (
    <div className="stack">
      <Card title="Changed in both places" sub="These records changed in the CRM and in the other system. Pick which value to keep. Shown when an app is set to Ask me each time.">
        {!conflicts.length ? <Empty icon="GitMerge" text="Nothing to decide." /> : <div className="stack-s">{conflicts.map((c) => (
          <div key={c.id} className="conn-conflict">
            <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{c.label}: {c.fieldLabel}</div><div className="small muted">{c.appName} · {c.provider} · {fmtDT(c.at)}</div></div>
            <div className="conn-pick">
              <button type="button" className="conn-choice" disabled={!canEdit} onClick={() => { resolveConflict(c.id, 'ours'); toast('Kept the CRM value'); }}><span className="small muted">In the CRM</span><strong>{show(c, c.ours)}</strong></button>
              <button type="button" className="conn-choice" disabled={!canEdit} onClick={() => { resolveConflict(c.id, 'theirs'); toast(`Took the value from ${c.provider}`); }}><span className="small muted">In {c.provider}</span><strong>{show(c, c.theirs)}</strong></button>
            </div>
          </div>
        ))}</div>}
      </Card>
      <Card title="Records a sync couldn't take" sub="Fix the reason, or bring them in anyway.">
        {!issues.length ? <Empty icon="CheckCircle2" text="Nothing waiting." /> : <div className="stack-s">{issues.map((x) => (
          <div key={x.id} className="dashlet">
            <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{x.label}</div><div className="small muted">{x.reason} · {x.appName}, {x.provider} · {fmtDT(x.at)}</div></div>
            {canEdit && <span className="row">{x.kind === 'leads' && <Btn sm onClick={() => { resolveIssue(x.id, 'add'); toast('Lead added without contact details. Add them on the lead.'); }}>Add anyway</Btn>}<Btn sm kind="ghost" onClick={() => { resolveIssue(x.id, 'dismiss'); toast('Dismissed'); }}>Dismiss</Btn></span>}
          </div>
        ))}</div>}
      </Card>
      <p className="small muted">Simulated: the other systems and their changes are made up by the demo sync.</p>
    </div>
  );
}

// One webhook delivery: what was sent, the signature header, and each try.
export function DeliveryDetail({ item, hook, onClose }) {
  const { resendWebhook, toast } = useStore();
  const body = JSON.stringify(item.payload || { event: item.event, label: item.label }, null, 2);
  const [sig, setSig] = useState('');
  useEffect(() => { if (hook?.secret) signBody(hook.secret, body).then(setSig); }, [item.id]);
  return (
    <Modal size="lg" title={`Delivery: ${item.label}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" icon="RotateCw" onClick={() => { resendWebhook(item.id); toast('Sent again (simulated)'); onClose(); }}>Send again</Btn></>}>
      <div className="stack">
        <div className="row wrap"><Badge tone={item.status === 'Delivered' ? 'good' : item.status === 'Failed' ? 'bad' : 'warn'}>{item.status || 'Logged'}</Badge><span className="small muted">{item.attempts || 1} {item.attempts === 1 ? 'try' : 'tries'}{item.nextRetryAt ? ` · next try ${fmtDT(item.nextRetryAt)}` : ''}</span></div>
        <div><div className="label">Request</div><pre className="conn-code">{`POST ${hook?.url || '(deleted webhook)'}
Content-Type: application/json
X-Unifiedtree-Event: ${item.event}
X-Unifiedtree-Signature: sha256=${sig || (hook?.secret ? '…' : 'no secret set')}

${body}`}</pre></div>
        <div className="small muted">The receiving system checks the signature by working out HMAC-SHA256 of the body with the shared secret. The signature here is real; the sending is simulated.</div>
        {item.tries?.length > 0 && <div><div className="label">Tries</div>{item.tries.map((t, i) => <div key={i} className="dashlet"><span className="small grow">{fmtDT(t.at)}</span><Badge tone={t.code === 200 ? 'good' : 'bad'} dot={false}>{t.code === 200 ? '200 OK' : '500 Server error'}</Badge></div>)}</div>}
      </div>
    </Modal>
  );
}

// Try the API with a key. Answers come from the CRM's data in this browser.
export function ApiExplorer() {
  const { db, create, patchQuiet, toast } = useStore();
  const keys = db.apiKeys || [];
  const [keyId, setKeyId] = useState(keys[0]?.id || '');
  const [epIdx, setEpIdx] = useState(0);
  const [id, setId] = useState('');
  const [page, setPage] = useState(1);
  const [body, setBody] = useState('{\n  "name": "Ada Lovelace",\n  "company": "Analytical Ltd",\n  "email": "ada@example.com"\n}');
  const [res, setRes] = useState(null);
  const ep = ENDPOINTS[epIdx];
  const key = keys.find((k) => k.id === keyId);
  const path = ep.path.replace('{id}', id || '{id}') + (!ep.one && !ep.write && page > 1 ? `?page=${page}` : '');
  const send = () => {
    let parsed = null;
    if (ep.write) { try { parsed = JSON.parse(body); } catch { setRes({ code: 400, body: { error: 'bad_json', message: "The body isn't valid JSON." } }); return; } }
    const r = answer(db, key, ep, { id: id.trim(), body: parsed, page });
    if (r.create) { const rec = create('leads', { ...r.create, ownerId: key?.createdBy || '' }); r.body = { data: { id: rec.id, ...r.create } }; toast('A lead was created through the API (simulated)'); }
    if (key) patchQuiet('apiKeys', key.id, { lastUsed: new Date().toISOString(), calls: (key.calls || 0) + 1 });
    setRes(r);
  };
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Try the API" sub="Pick a key and a request. It's answered from your CRM data, with the same checks a real API makes.">
        <div className="stack-s">
          <div className="field"><label className="label" htmlFor="api-key">Key</label><select id="api-key" className="select" value={keyId} onChange={(e) => setKeyId(e.target.value)}><option value="">No key</option>{keys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.prefix})</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="api-ep">Request</label><select id="api-ep" className="select" value={epIdx} onChange={(e) => { setEpIdx(Number(e.target.value)); setRes(null); setPage(1); }}>{ENDPOINTS.map((x, i) => <option key={x.method + x.path} value={i}>{x.method} {x.path}: {x.label}</option>)}</select></div>
          {ep.one && <div className="field"><label className="label" htmlFor="api-id">Record id</label><input id="api-id" className="input" placeholder={(db[ep.area] || [])[0]?.id} value={id} onChange={(e) => setId(e.target.value)} /></div>}
          {!ep.one && !ep.write && <div className="row"><span className="small muted">Page</span><input className="input" style={{ width: 80 }} type="number" min="1" aria-label="Page" value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} /></div>}
          {ep.write && <div className="field"><label className="label" htmlFor="api-body">Body (JSON)</label><textarea id="api-body" className="textarea conn-code-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>}
          <pre className="conn-code">{`curl -X ${ep.method} https://api.example-crm.com${path} \\
  -H "Authorization: Bearer ${key ? key.prefix : 'YOUR_KEY'}"${ep.write ? ' \\\n  -H "Content-Type: application/json" -d @body.json' : ''}`}</pre>
          <div><Btn kind="primary" icon="Send" onClick={send}>Send request</Btn></div>
        </div>
      </Card>
      <Card title="Response" sub={res ? `${res.code} ${{ 200: 'OK', 201: 'Created', 400: 'Bad request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not found', 422: 'Unprocessable' }[res.code] || ''}` : 'Send a request to see the answer.'}>
        {res ? <pre className={`conn-code ${res.code >= 400 ? 'bad' : ''}`}>{JSON.stringify(res.body, null, 2)}</pre> : <Empty icon="Braces" text="No request yet." />}
        <div className="small muted" style={{ marginTop: 8 }}>Simulated: there is no server, so the web address above doesn't exist yet. Lists come 5 at a time.</div>
      </Card>
    </div>
  );
}

// Records moved in and out over two weeks, for one app.
export function UsageChart({ appKey }) {
  const { db } = useStore();
  const runs = (db.syncRuns || []).filter((r) => r.appKey === appKey);
  if (!runs.length) return null;
  const data = Array.from({ length: 14 }, (_, i) => { const k = iso(new Date(Date.now() - (13 - i) * 864e5)); const on = runs.filter((r) => r.at.slice(0, 10) === k); return { label: fmtShort(k), in: on.reduce((a, r) => a + r.inCount, 0), out: on.reduce((a, r) => a + r.outCount, 0) }; });
  return <div><div className="label" style={{ marginBottom: 6 }}>Records moved, last 14 days</div><Bars data={data} series={[{ key: 'in', name: 'Into the CRM' }, { key: 'out', name: 'From the CRM' }]} format={(n) => String(Math.round(n))} height={180} /></div>;
}

export const SCOPE_OPTIONS = API_AREAS.flatMap(([k, l]) => [[`${k}:read`, `Read ${l.toLowerCase()}`], [`${k}:write`, `Change ${l.toLowerCase()}`]]);
