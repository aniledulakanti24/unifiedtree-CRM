import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, Icon, Kpi, Modal, PageHead, Pills, Stat, Tabs, Toggle, UserChip } from '../ui';
import { Bars } from '../charts';
import { ACTIONS_AUTO, OPERATORS, RULE_FIELDS, TRIGGERS, WORKFLOW_TEMPLATES, stepsOf } from '../engine';
import { fmtDT, fmtShort, iso, relTime, uid } from '../util';

const triggerOf = (k) => TRIGGERS.find((t) => t.k === k) || TRIGGERS[0];
const ICONS = { task: 'ListChecks', followup: 'BellPlus', notify: 'Bell', email: 'Mail', whatsapp: 'MessageCircle', assign: 'UserRoundCheck', update: 'PencilLine', tag: 'Tag', webhook: 'Webhook', deal: 'Kanban' };
const withIds = (steps) => steps.map((s) => ({ ...s, id: s.id || uid('st'), ...(s.kind === 'branch' ? { yes: withIds(s.yes || []), no: withIds(s.no || []) } : {}) }));
const newStep = (kind) => (kind === 'wait' ? { id: uid('st'), kind, days: 2 } : kind === 'waitUntil' ? { id: uid('st'), kind, hour: 9, workdays: true } : kind === 'branch' ? { id: uid('st'), kind, match: 'all', conditions: [], yes: [], no: [] } : kind === 'approval' ? { id: uid('st'), kind, to: 'manager', text: 'Please approve {name}' } : { id: uid('st'), kind: 'action', type: 'task', text: 'Follow up on {name}', days: 1, to: 'owner' });
const hourText = (h) => `${String(h).padStart(2, '0')}:00`;
const stepName = (s) => (s.kind === 'wait' ? `Wait ${s.days} ${Number(s.days) === 1 ? 'day' : 'days'}` : s.kind === 'waitUntil' ? `Wait until ${s.workdays !== false ? 'a working day' : 'the next day'} at ${hourText(s.hour ?? 9)}` : s.kind === 'branch' ? 'If / otherwise' : s.kind === 'approval' ? 'Ask for approval' : ACTIONS_AUTO.find(([k]) => k === s.type)?.[1] || s.type);
const countSteps = (steps) => steps.reduce((n, s) => n + 1 + (s.kind === 'branch' ? countSteps(s.yes || []) + countSteps(s.no || []) : 0), 0);

function Conditions({ value, match, onChange, onMatch, entity }) {
  const { db } = useStore();
  const fields = RULE_FIELDS[entity] || [];
  const set = (i, patch) => onChange(value.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const suggest = (field) => [...new Set((db[entity] || []).map((r) => r[field]).filter((x) => x != null && x !== ''))].slice(0, 30);
  return (
    <div className="stack-s">
      {value.length > 1 && <div className="row small"><span className="muted">Match</span><select className="select tb-filter" aria-label="Match all or any" value={match || 'all'} onChange={(e) => onMatch(e.target.value)}><option value="all">all of these</option><option value="any">any of these</option></select></div>}
      {value.map((c, i) => (
        <div key={i} className="rule-row">
          <select className="select" aria-label="Condition field" value={c.field} onChange={(e) => set(i, { field: e.target.value, value: '' })}>{fields.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="select" aria-label="Condition" value={c.op} onChange={(e) => set(i, { op: e.target.value })}>{OPERATORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="input" list={`vals-${c.field}`} aria-label="Condition value" value={c.value} onChange={(e) => set(i, { value: e.target.value })} />
          <datalist id={`vals-${c.field}`}>{suggest(c.field).map((x) => <option key={x} value={x} />)}</datalist>
          <Btn sm kind="ghost" icon="X" aria-label="Remove condition" onClick={() => onChange(value.filter((_, n) => n !== i))} />
        </div>
      ))}
      <div><Btn sm icon="Plus" disabled={!fields.length} onClick={() => onChange([...value, { field: fields[0][0], op: 'is', value: '' }])}>Add a condition</Btn></div>
    </div>
  );
}

function StepCard({ step, entity, canUp, canDown, onChange, onRemove, onMove }) {
  const { db } = useStore();
  const people = db.users.filter((u) => u.active);
  const put = (patch) => onChange({ ...step, ...patch });
  const Who = ({ allowRound }) => (
    <select className="select" aria-label="Who" value={step.to || 'owner'} onChange={(e) => put({ to: e.target.value })}>
      {allowRound && <option value="round">Next salesperson in turn</option>}
      <option value="owner">The record's owner</option><option value="manager">Their manager</option>
      {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
  const icon = step.kind === 'waitUntil' ? 'Clock' : step.kind === 'wait' ? 'Hourglass' : step.kind === 'branch' ? 'GitBranch' : step.kind === 'approval' ? 'ShieldCheck' : ICONS[step.type] || 'Zap';
  return (
    <div className={`wf-step ${step.kind}`}>
      <div className="wf-step-head">
        <span className="stat-ico"><Icon name={icon} size={14} /></span>
        {step.kind === 'action'
          ? <select className="select wf-type" aria-label="What this step does" value={step.type} onChange={(e) => put({ type: e.target.value })}>{ACTIONS_AUTO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          : <span className="strong grow">{step.kind === 'waitUntil' ? 'Wait until' : step.kind === 'wait' ? 'Wait' : step.kind === 'branch' ? 'If' : 'Ask for approval'}</span>}
        <span className="row" style={{ gap: 2, flexShrink: 0 }}>
          <Btn sm kind="ghost" icon="ArrowUp" aria-label="Move step up" disabled={!canUp} onClick={() => onMove(-1)} />
          <Btn sm kind="ghost" icon="ArrowDown" aria-label="Move step down" disabled={!canDown} onClick={() => onMove(1)} />
          <Btn sm kind="ghost" icon="X" aria-label="Remove step" onClick={onRemove} />
        </span>
      </div>
      {step.kind === 'wait' && <div className="row"><input className="input" style={{ width: 90 }} type="number" min="1" aria-label="Days to wait" value={step.days} onChange={(e) => put({ days: Math.max(1, Number(e.target.value) || 1) })} /><span className="small muted">days, then carry on</span></div>}
      {step.kind === 'waitUntil' && <div className="row wrap"><select className="select tb-filter" aria-label="Hour to carry on" value={step.hour ?? 9} onChange={(e) => put({ hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourText(h)}</option>)}</select><label className="check small"><input type="checkbox" checked={step.workdays !== false} onChange={(e) => put({ workdays: e.target.checked })} />Working days only</label><span className="small muted">For example, send at 9:00 on the next working day.</span></div>}
      {step.kind === 'approval' && <div className="wf-fields"><Who /><input className="input" aria-label="What to approve" value={step.text} onChange={(e) => put({ text: e.target.value })} /><div className="small muted">The workflow pauses until they approve. If they reject it, it stops.</div></div>}
      {step.kind === 'action' && (
        <div className="wf-fields">
          {!['assign', 'update', 'tag', 'webhook'].includes(step.type) && <input className="input" aria-label="Text" placeholder="Text. {name} and {status} fill in" value={step.text || ''} onChange={(e) => put({ text: e.target.value })} />}
          {['task', 'followup', 'notify', 'whatsapp', 'deal'].includes(step.type) && <Who />}
          {step.type === 'deal' && !['leads', 'contacts', 'companies'].includes(entity) && <div className="small error-text">This only works for leads, contacts and customers.</div>}
          {step.type === 'assign' && <Who allowRound />}
          {['task', 'followup'].includes(step.type) && <div className="row"><span className="small muted nowrap">Due in</span><input className="input" style={{ width: 80 }} type="number" min="0" aria-label="Due in days" value={step.days ?? 0} onChange={(e) => put({ days: Number(e.target.value) || 0 })} /><span className="small muted">days</span></div>}
          {step.type === 'update' && <div className="rule-row"><select className="select" aria-label="Field to change" value={step.field || ''} onChange={(e) => put({ field: e.target.value })}><option value="">Choose a field…</option>{(RULE_FIELDS[entity] || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><input className="input" aria-label="New value" placeholder="New value" value={step.value || ''} onChange={(e) => put({ value: e.target.value })} /></div>}
          {step.type === 'tag' && <input className="input" aria-label="Tag" placeholder="Tag to add" value={step.tag || ''} onChange={(e) => put({ tag: e.target.value })} />}
          {step.type === 'webhook' && <input className="input" aria-label="Address to send to" placeholder="https://your-system.example/hook" value={step.url || ''} onChange={(e) => put({ url: e.target.value })} />}
        </div>
      )}
      {step.kind === 'branch' && (
        <div className="stack-s">
          <Conditions value={step.conditions || []} match={step.match} entity={entity} onChange={(conditions) => put({ conditions })} onMatch={(match) => put({ match })} />
          <div className="wf-branches">
            <div className="wf-branch yes"><div className="small strong">If yes</div><StepList steps={step.yes || []} entity={entity} onChange={(yes) => put({ yes })} /></div>
            <div className="wf-branch no"><div className="small strong">Otherwise</div><StepList steps={step.no || []} entity={entity} onChange={(no) => put({ no })} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepList({ steps, entity, onChange }) {
  const move = (i, by) => { const next = [...steps]; [next[i], next[i + by]] = [next[i + by], next[i]]; onChange(next); };
  return (
    <div className="wf-list">
      {steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <StepCard step={s} entity={entity} canUp={i > 0} canDown={i < steps.length - 1} onMove={(by) => move(i, by)} onChange={(x) => onChange(steps.map((y, n) => (n === i ? x : y)))} onRemove={() => onChange(steps.filter((_, n) => n !== i))} />
          <span className="wf-line" aria-hidden="true" />
        </React.Fragment>
      ))}
      <select className="select wf-add" aria-label="Add a step" value="" onChange={(e) => { if (e.target.value) onChange([...steps, newStep(e.target.value)]); }}>
        <option value="">+ Add a step…</option><option value="action">Do something</option><option value="wait">Wait some days</option><option value="waitUntil">Wait until a time</option><option value="branch">If / otherwise</option><option value="approval">Ask for approval</option>
      </select>
    </div>
  );
}

function Builder({ initial, onClose }) {
  const { saveRule, toast } = useStore();
  const [v, setV] = useState(() => { const base = initial || { name: '', trigger: 'lead.created', conditions: [], match: 'all', active: true }; return { rerun: 'always', exit: { match: 'all', conditions: [] }, ...base, steps: withIds(stepsOf({ actions: [], ...base })) }; });
  const { userName } = useStore();
  const [error, setError] = useState('');
  const put = (patch) => { setV((p) => ({ ...p, ...patch })); setError(''); };
  const trig = triggerOf(v.trigger);
  const hasEmptyCond = (steps) => steps.some((s) => s.kind === 'branch' && ((s.conditions || []).some((c) => !String(c.value ?? '').trim()) || hasEmptyCond(s.yes || []) || hasEmptyCond(s.no || [])));
  const save = () => {
    if (!v.name.trim()) { setError('Give this workflow a name.'); return; }
    if (!countSteps(v.steps)) { setError('Add at least one step.'); return; }
    if ((v.conditions || []).some((c) => !String(c.value ?? '').trim()) || (v.exit?.conditions || []).some((c) => !String(c.value ?? '').trim()) || hasEmptyCond(v.steps)) { setError('Fill in every condition, or remove it.'); return; }
    if (trig.field && !v.field) { setError('Choose the field to watch.'); return; }
    const { actions, ...rest } = v;
    saveRule({ ...rest, name: v.name.trim(), actions: [] });
    toast('Workflow saved');
    onClose();
  };
  return (
    <Modal size="lg" title={initial?.id ? 'Edit workflow' : 'New workflow'} onClose={onClose} footer={<>{error && <span className="error-text" style={{ marginInlineEnd: 'auto' }}>{error}</span>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save workflow</Btn></>}>
      <div className="stack">
        <div className="field"><label className="label" htmlFor="rule-name">Name <span className="req">*</span></label><input id="rule-name" className="input" value={v.name} onChange={(e) => put({ name: e.target.value })} /></div>
        <div className="wf-list">
          <div className="wf-step trigger">
            <div className="wf-step-head"><span className="stat-ico"><Icon name="Zap" size={14} /></span><span className="strong">When this happens</span></div>
            <div className="wf-fields">
              <select id="rule-when" className="select" aria-label="Trigger" value={v.trigger} onChange={(e) => { const t = triggerOf(e.target.value); put({ trigger: t.k, conditions: [], exit: { match: 'all', conditions: [] }, days: t.timed ? v.days ?? 7 : undefined, field: t.field ? (RULE_FIELDS[t.entity] || [])[0]?.[0] : undefined, to: '', every: t.schedule ? v.every || 'day' : undefined, hour: t.schedule ? v.hour ?? 8 : undefined, weekday: t.schedule ? v.weekday ?? 1 : undefined }); }}>{TRIGGERS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
              {trig.timed && <div className="row"><label className="small muted" htmlFor="rule-days">{trig.daysLabel}</label><input id="rule-days" className="input" style={{ width: 90 }} type="number" min="0" value={v.days ?? 0} onChange={(e) => put({ days: Number(e.target.value) || 0 })} /><span className="small muted">Each record runs once.</span></div>}
              {trig.field && <div className="row wrap"><select className="select tb-filter" aria-label="Field to watch" value={v.field || ''} onChange={(e) => put({ field: e.target.value })}>{(RULE_FIELDS[trig.entity] || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="small muted">changes to</span><input className="input" style={{ maxWidth: 180 }} aria-label="New value (optional)" placeholder="Any value" value={v.to || ''} onChange={(e) => put({ to: e.target.value })} /></div>}
              {trig.schedule && <div className="row wrap"><select className="select tb-filter" aria-label="How often" value={v.every || 'day'} onChange={(e) => put({ every: e.target.value })}><option value="day">Every day</option><option value="week">Every week</option></select>{v.every === 'week' && <select className="select tb-filter" aria-label="Day of the week" value={v.weekday ?? 1} onChange={(e) => put({ weekday: Number(e.target.value) })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}<span className="small muted">at</span><select className="select tb-filter" aria-label="Hour" value={v.hour ?? 8} onChange={(e) => put({ hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourText(h)}</option>)}</select><span className="small muted">on every record that matches, up to 50 at a time</span></div>}
              <div className="label" style={{ marginTop: 4 }}>Only if (optional)</div>
              <Conditions value={v.conditions || []} match={v.match} entity={trig.entity} onChange={(conditions) => put({ conditions })} onMatch={(match) => put({ match })} />
            </div>
          </div>
          <span className="wf-line" aria-hidden="true" />
          <StepList steps={v.steps} entity={trig.entity} onChange={(steps) => put({ steps })} />
        </div>
        <div className="wf-step">
          <div className="wf-step-head"><span className="stat-ico"><Icon name="Flag" size={14} /></span><span className="strong">Goal: stop the run when (optional)</span></div>
          <Conditions value={v.exit?.conditions || []} match={v.exit?.match} entity={trig.entity} onChange={(conditions) => put({ exit: { ...v.exit, conditions } })} onMatch={(match) => put({ exit: { ...v.exit, match } })} />
          <div className="small muted">Checked before each step. For example, stop chasing once the invoice status is Paid.</div>
        </div>
        <div className="row wrap">
          <label className="small strong" htmlFor="rule-rerun">Run again on the same record</label>
          <select id="rule-rerun" className="select tb-filter" value={v.rerun || 'always'} onChange={(e) => put({ rerun: e.target.value })}><option value="always">Every time it happens</option><option value="once">Only once</option><option value="days">Again after some days</option></select>
          {v.rerun === 'days' && <><input className="input" style={{ width: 80 }} type="number" min="1" aria-label="Days before running again" value={v.rerunDays ?? 30} onChange={(e) => put({ rerunDays: Math.max(1, Number(e.target.value) || 1) })} /><span className="small muted">days</span></>}
        </div>
        {initial?.versions?.length > 0 && <div className="row wrap"><span className="small strong">Earlier versions</span><select className="select tb-filter" aria-label="Load an earlier version" value="" onChange={(e) => { const ver = initial.versions[Number(e.target.value)]; if (ver?.snap) { setV({ rerun: 'always', exit: { match: 'all', conditions: [] }, ...ver.snap, id: initial.id, steps: withIds(stepsOf({ actions: [], ...ver.snap })) }); setError(''); } }}><option value="">Load one…</option>{initial.versions.map((x, i) => <option key={x.at} value={i}>{fmtDT(x.at)} by {userName(x.by)}</option>)}</select><span className="small muted">Loads it here. Save to use it.</span></div>}
      </div>
    </Modal>
  );
}

function TestRun({ rule, onClose }) {
  const { db, previewRule } = useStore();
  const trig = triggerOf(rule.trigger);
  const records = (db[trig.entity] || []).slice(0, 200);
  const label = (r) => r.title || r.name || r.subject || r.summary || r.number || r.tracking || `${r.first || ''} ${r.last || ''}`.trim() || r.id;
  const [recId, setRecId] = useState(records[0]?.id || '');
  const rec = records.find((r) => r.id === recId);
  const result = useMemo(() => (rec ? previewRule(rule, rec, trig.entity) : null), [recId]);
  return (
    <Modal title={`Test: ${rule.name}`} onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
      <div className="stack">
        <p className="sub" style={{ margin: 0 }}>See what it would do to a real record. Nothing is changed or sent, and waits and approvals are skipped so you see the whole path.</p>
        {records.length ? <select className="select" aria-label="Record to test on" value={recId} onChange={(e) => setRecId(e.target.value)}>{records.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</select> : <Empty icon="Inbox" text="There are no records to test on yet." />}
        {result && <>
          <div className="row"><Badge tone={result.matches ? 'good' : 'warn'} dot={false}>{result.matches ? 'Would run on this record' : "Wouldn't run: its conditions don't match"}</Badge></div>
          <div className="wf-log">{result.log.map((l, i) => <div key={i} className="wf-log-row"><Icon name="ChevronRight" size={13} color="var(--ink-3)" /><span>{l.text}</span></div>)}</div>
        </>}
      </div>
    </Modal>
  );
}

// What the workflows did: runs by day, by workflow, and the work they saved.
const DID = [['Created a task', 'Tasks created'], ['Scheduled a follow-up', 'Follow-ups'], ['Sent an alert', 'Alerts'], ['Recorded an email', 'Emails'], ['Recorded a WhatsApp', 'WhatsApp messages'], ['Assigned the record', 'Records assigned'], ['Changed ', 'Fields changed'], ['Created an opportunity', 'Opportunities created'], ['Asked ', 'Approvals asked']];
function Results({ runs, rules }) {
  const [days, setDays] = useState('14');
  const since = new Date(Date.now() - Number(days) * 864e5).toISOString();
  const list = runs.filter((r) => r.at >= since);
  const count = (n) => String(Math.round(n));
  const byDay = Array.from({ length: Number(days) }, (_, i) => { const k = iso(new Date(Date.now() - (Number(days) - 1 - i) * 864e5)); const on = list.filter((r) => r.at.slice(0, 10) === k); return { label: fmtShort(k), finished: on.filter((r) => ['Done', 'Goal reached'].includes(r.status)).length, other: on.filter((r) => !['Done', 'Goal reached'].includes(r.status)).length }; });
  const byRule = rules.map((x) => { const on = list.filter((r) => r.ruleId === x.id); return { label: x.name, finished: on.filter((r) => ['Done', 'Goal reached'].includes(r.status)).length, other: on.filter((r) => !['Done', 'Goal reached'].includes(r.status)).length }; }).filter((x) => x.finished + x.other).sort((a, b) => b.finished + b.other - a.finished - a.other).slice(0, 10);
  const did = DID.map(([start, label]) => ({ label, value: list.reduce((a, r) => a + r.log.filter((l) => l.text.startsWith(start)).length, 0) })).filter((x) => x.value);
  return (
    <div className="stack">
      <Pills value={days} onChange={setDays} options={[{ k: '7', label: '7 days' }, { k: '14', label: '14 days' }, { k: '30', label: '30 days' }]} />
      <div className="g4">
        <Kpi label="Runs" value={count(list.length)} note={`${list.filter((r) => r.status === 'Goal reached').length} stopped early at their goal`} icon="Play" />
        <Kpi label="Finished" value={count(list.filter((r) => ['Done', 'Goal reached'].includes(r.status)).length)} note={`${list.filter((r) => r.status.startsWith('Waiting')).length} still waiting`} icon="CheckCircle2" />
        <Kpi label="Stopped" value={count(list.filter((r) => r.status === 'Stopped').length)} note="By hand, or the record went" icon="OctagonX" />
        <Kpi label="Steps done" value={count(did.reduce((a, x) => a + x.value, 0))} note="Work done without anyone clicking" icon="Zap" />
      </div>
      <Card title="Runs by day" sub="Finished, and still waiting or stopped">{list.length ? <Bars data={byDay} stacked series={[{ key: 'finished', name: 'Finished' }, { key: 'other', name: 'Waiting or stopped' }]} format={count} height={220} /> : <Empty icon="Play" text="No runs in this period." />}</Card>
      <div className="g2">
        <Card title="By workflow">{byRule.length ? <Bars horizontal stacked data={byRule} series={[{ key: 'finished', name: 'Finished' }, { key: 'other', name: 'Waiting or stopped' }]} format={count} height={Math.max(160, byRule.length * 40)} /> : <Empty icon="Workflow" text="No runs in this period." />}</Card>
        <Card title="What they did">{did.length ? <Bars horizontal data={did} series={[{ key: 'value', name: 'Steps' }]} format={count} height={Math.max(160, did.length * 36)} /> : <Empty icon="Zap" text="Nothing done in this period." />}</Card>
      </div>
    </div>
  );
}

function History({ rows, onOpen }) {
  const { userName } = useStore();
  return (
    <DataTable rows={rows} exportName="workflow-runs" dateOf={(r) => r.at} initialSort={{ k: 'at', dir: 'desc' }} onRow={onOpen} emptyText="No runs yet."
      statusTabs={{ options: ['Done', 'Goal reached', 'Waiting', 'Waiting for approval', 'Stopped'], get: (r) => r.status }}
      columns={[
        { k: 'ruleName', label: 'Workflow', render: (r) => <span className="strong">{r.ruleName}</span> },
        { k: 'label', label: 'Record' },
        { k: 'status', label: 'Status', render: (r) => <Badge tone={['Done', 'Goal reached'].includes(r.status) ? 'good' : r.status === 'Stopped' ? 'bad' : 'warn'} dot={false}>{r.status}</Badge> },
        { k: 'steps', label: 'Steps', align: 'r', value: (r) => r.log.length },
        { k: 'by', label: 'Started by', hidden: true, value: (r) => userName(r.by) },
        { k: 'at', label: 'Started', nowrap: true, render: (r) => fmtDT(r.at) },
      ]} />
  );
}

export default function Automation() {
  const { db, t, can, saveRule, removeRule, runRuleNow, cancelRun, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [test, setTest] = useState(null);
  const [gallery, setGallery] = useState(false);
  const [runNow, setRunNow] = useState(null);
  const [run, setRun] = useState(null);
  const [tab, setTab] = useState('flows');
  const canEdit = can('automation', 'edit');
  const rules = db.automations || [];
  const runs = db.ruleRuns || [];
  const pending = (db.approvals || []).filter((a) => a.status === 'Pending').length;
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const say = (r) => {
    const tr = triggerOf(r.trigger);
    const conds = (r.conditions || []).map((c) => `${(RULE_FIELDS[tr.entity] || []).find(([k]) => k === c.field)?.[1] || c.field} ${OPERATORS.find(([k]) => k === c.op)?.[1]} ${c.value}`);
    const fieldName = (k) => (RULE_FIELDS[tr.entity] || []).find(([x]) => x === k)?.[1] || k;
    const extra = tr.field ? `: ${fieldName(r.field)}${r.to ? ` becomes ${r.to}` : ''}` : tr.schedule ? `, ${r.every === 'week' ? `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][r.weekday ?? 1]}` : 'every day'} at ${hourText(r.hour ?? 8)}` : tr.timed ? `: ${r.days || 0} ${r.days === 1 ? 'day' : 'days'}` : '';
    return `${tr.label}${extra}${conds.length ? `, if ${conds.join(r.match === 'any' ? ' or ' : ' and ')}` : ''}${(r.exit?.conditions || []).some((c) => c.field) ? '. Stops when its goal is met' : ''}${r.rerun === 'once' ? '. Once per record' : r.rerun === 'days' ? `. At most every ${r.rerunDays || 30} days per record` : ''}.`;
  };
  const curRun = runs.find((x) => x.id === run);
  return (
    <div>
      <PageHead title={t('automation')} sub="Workflows that do repetitive work for your team. Everything they do is recorded.">
        {canEdit && <Btn icon="LayoutTemplate" onClick={() => setGallery(true)}>Templates</Btn>}
        {canEdit && <Btn kind="primary" icon="Plus" onClick={() => setEdit('new')}>New workflow</Btn>}
      </PageHead>
      <div className="g4" style={{ marginBottom: 14 }}>
        <Stat label="Active workflows" value={rules.filter((r) => r.active).length} note={`${rules.length} in total`} icon="Workflow" />
        <Stat label="Runs this week" value={runs.filter((r) => r.at >= weekAgo).length} icon="Play" />
        <Stat label="Waiting to continue" value={runs.filter((r) => r.status === 'Waiting').length} note="Paused on a wait step" icon="Hourglass" />
        <Stat label="Approvals pending" value={pending} note={pending ? 'Waiting for a decision' : 'None waiting'} icon="ShieldCheck" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'flows', label: 'Workflows', icon: 'Workflow' }, { k: 'history', label: 'Run history', icon: 'History' }, { k: 'results', label: 'Results', icon: 'BarChart3' }]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'flows' && (
          <div className="stack-s">
            {!rules.length && <div className="card"><Empty icon="Zap" text="No workflows yet. Start from a template.">{canEdit && <Btn icon="LayoutTemplate" onClick={() => setGallery(true)}>Templates</Btn>}</Empty></div>}
            {rules.map((r) => {
              const steps = stepsOf(r);
              return (
                <Card key={r.id} title={r.name} sub={say(r)} action={<span className="row wrap"><Btn sm icon="FlaskConical" onClick={() => setTest(r)}>Test</Btn>{canEdit && <Btn sm icon="Play" onClick={() => setRunNow(r)}>Run now</Btn>}<Toggle on={r.active} label={`Turn ${r.name} on or off`} disabled={!canEdit} onChange={(active) => saveRule({ ...r, active })} />{canEdit && <Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${r.name}`} onClick={() => setEdit(r)} />}{canEdit && <Btn sm kind="ghost" icon="Copy" aria-label={`Duplicate ${r.name}`} onClick={() => { const { id, runs: _r, lastRun, done, ...rest } = r; saveRule({ ...rest, name: `${r.name} (copy)`, active: false }); toast('Copy created, switched off'); }} />}{canEdit && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${r.name}`} onClick={() => setDel(r)} />}</span>}>
                  <div className="wf-mini">
                    {steps.slice(0, 7).map((s, i) => <React.Fragment key={s.id || i}>{i > 0 && <Icon name="ChevronRight" size={13} color="var(--ink-3)" />}<Badge tone={s.kind === 'branch' ? 'violet' : s.kind === 'approval' ? 'warn' : 'muted'} dot={false}>{stepName(s)}</Badge></React.Fragment>)}
                    {steps.length > 7 && <span className="small muted">+{steps.length - 7} more</span>}
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>Ran {r.runs || 0} {r.runs === 1 ? 'time' : 'times'}{r.lastRun ? `, last ${relTime(r.lastRun)}` : ''}{r.nextAt && r.active ? `. Next run ${fmtDT(r.nextAt)}` : ''}{r.versions?.length ? `. ${r.versions.length} earlier ${r.versions.length === 1 ? 'version' : 'versions'} kept` : ''}</div>
                </Card>
              );
            })}
          </div>
        )}
        {tab === 'history' && <History rows={runs} onOpen={(r) => setRun(r.id)} />}
        {tab === 'results' && <Results runs={runs} rules={rules} />}
      </div>
      {edit && <Builder initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {test && <TestRun rule={test} onClose={() => setTest(null)} />}
      {gallery && <Modal size="lg" title="Start from a template" onClose={() => setGallery(false)}><div className="rb-gallery">{WORKFLOW_TEMPLATES.map((x) => <button key={x.name} type="button" className="rb-template" onClick={() => { setGallery(false); setEdit({ ...x, about: undefined, active: true }); }}><Icon name="Workflow" size={18} /><span className="grow" style={{ minWidth: 0 }}><span className="strong" style={{ display: 'block' }}>{x.name}</span><span className="small muted">{x.about}</span></span></button>)}</div></Modal>}
      {runNow && <Confirm title={`Run ${runNow.name} now?`} text={`It runs on up to 25 ${triggerOf(runNow.trigger).entity.replace('activities', 'tasks')} that match its conditions and haven't had it before. Its steps really happen.`} confirmLabel="Run now" danger={false} onClose={() => setRunNow(null)} onConfirm={() => { const n = runRuleNow(runNow); toast(n ? `Started on ${n} ${n === 1 ? 'record' : 'records'}` : 'No matching records'); }} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="It will stop running, and any waiting runs stop. Anything it already did stays." onClose={() => setDel(null)} onConfirm={() => { removeRule(del.id); toast('Workflow deleted'); }} />}
      {curRun && (
        <Drawer title={curRun.ruleName} onClose={() => setRun(null)} footer={canEdit && curRun.status.startsWith('Waiting') ? <Btn kind="danger" onClick={() => { cancelRun(curRun.id); toast('Run stopped'); }}>Stop this run</Btn> : undefined}>
          <div className="stack">
            <div className="row wrap"><Badge tone={['Done', 'Goal reached'].includes(curRun.status) ? 'good' : curRun.status === 'Stopped' ? 'bad' : 'warn'} dot={false}>{curRun.status}</Badge><span className="small muted">{curRun.label}</span></div>
            <div className="wf-log">{curRun.log.map((l, i) => <div key={i} className="wf-log-row"><span className="small muted nowrap">{fmtDT(l.at)}</span><span>{l.text}</span></div>)}</div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

const LINKS = { leads: (id) => `/leads?open=${id}`, deals: (id) => `/pipeline/${id}`, companies: (id) => `/customers/${id}`, contacts: (id) => `/contacts?open=${id}`, orders: (id) => `/orders?open=${id}`, cases: (id) => `/cases?open=${id}` };

export function Approvals() {
  const { db, me, role, t, can, canRoute, decideApproval, toast } = useStore();
  const [filter, setFilter] = useState('Pending');
  const [deciding, setDeciding] = useState(null);
  const [note, setNote] = useState('');
  const mine = (db.approvals || []).filter((a) => role === 'admin' || a.to === me.id || a.ownerId === me.id);
  const list = filter === 'All' ? mine : mine.filter((a) => a.status === filter);
  const canDecide = (a) => can('approvals', 'edit') && a.status === 'Pending' && (role === 'admin' || a.to === me.id);
  return (
    <div>
      <PageHead title={t('approvals')} sub="Decisions workflows are waiting for. Approving lets the workflow carry on; rejecting stops it." />
      <div style={{ marginBottom: 12 }}><Pills value={filter} onChange={setFilter} options={['Pending', 'Approved', 'Rejected', 'All'].map((k) => ({ k, label: k, count: k === 'All' ? mine.length : mine.filter((a) => a.status === k).length }))} /></div>
      {!list.length && <div className="card"><Empty icon="ShieldCheck" text={filter === 'Pending' ? 'Nothing is waiting for a decision.' : 'Nothing here.'} /></div>}
      <div className="stack-s">
        {list.map((a) => {
          const to = LINKS[a.entity]?.(a.recId);
          return (
            <Card key={a.id} title={a.text} sub={`${a.ruleName} · ${fmtDT(a.at)}`} action={<Badge tone={a.status === 'Approved' ? 'good' : a.status === 'Rejected' ? 'bad' : 'warn'} dot={false}>{a.status}</Badge>}>
              <div className="row wrap between">
                <span className="row wrap small"><span className="muted">Record:</span>{to && canRoute(to.split('?')[0].replace(/\/[^/]+$/, (m) => (to.includes('?') ? m : ''))) ? <Link to={to}>{a.label}</Link> : <span>{a.label}</span>}<span className="muted">· Decision by</span><UserChip id={a.to} /></span>
                {canDecide(a) && <span className="row"><Btn sm kind="danger" onClick={() => { setDeciding({ a, ok: false }); setNote(''); }}>Reject</Btn><Btn sm kind="primary" onClick={() => { setDeciding({ a, ok: true }); setNote(''); }}>Approve</Btn></span>}
              </div>
              {a.note && <p className="small muted" style={{ margin: '8px 0 0' }}>“{a.note}”</p>}
            </Card>
          );
        })}
      </div>
      {deciding && (
        <Modal size="sm" title={deciding.ok ? 'Approve this?' : 'Reject this?'} onClose={() => setDeciding(null)} footer={<><Btn onClick={() => setDeciding(null)}>Cancel</Btn><Btn kind={deciding.ok ? 'primary' : 'danger'} onClick={() => { decideApproval(deciding.a.id, deciding.ok, note.trim()); toast(deciding.ok ? 'Approved. The workflow carries on.' : 'Rejected. The workflow stopped.'); setDeciding(null); }}>{deciding.ok ? 'Approve' : 'Reject'}</Btn></>}>
          <div className="field"><label className="label" htmlFor="appr-note">Note (optional)</label><textarea id="appr-note" className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </Modal>
      )}
    </div>
  );
}
