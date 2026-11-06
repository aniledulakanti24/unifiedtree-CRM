import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Confirm, DataTable, Drawer, FormFields, Icon, Modal, PageHead, Progress, RecordModal, UserChip } from '../ui';
import { ContactActions } from '../comms';
import { ActivityDialog, Chatter, RecordQuickCreate, TransferDialog, leadFields, relatedOf } from '../shared';
import { addDays, fmtDate, money, uid } from '../util';
import { CustomValues, LeadScore } from '../extras';
import { findDuplicate, nextActivity, nextSalesperson } from '../engine';
import { ImportButton } from './Import';

function Generate({ onClose }) {
  const { db, me, create, toast } = useStore();
  const [v, setV] = useState({ count: 5, industry: 'Technology', country: 'USA', size: '51-200', source: 'Website', note: '' });
  const words = ['Aspen', 'Basalt', 'Cinder', 'Dune', 'Elm', 'Flint', 'Grove', 'Hazel', 'Iris', 'Jade'];
  const people = ['Alex Morgan', 'Sam Rivera', 'Jamie Chen', 'Robin Ahmed', 'Casey Novak', 'Drew Patel', 'Taylor Boyd', 'Jordan Lee'];
  const run = () => {
    const n = Math.max(1, Math.min(30, Number(v.count) || 1));
    for (let i = 0; i < n; i++) {
      const co = `${words[Math.floor(Math.random() * words.length)]} ${v.industry}`;
      const nm = people[Math.floor(Math.random() * people.length)];
      create('leads', { id: uid('l'), name: nm, company: co, email: `${nm.split(' ')[0].toLowerCase()}@${co.replace(/\s/g, '').toLowerCase()}.example`, phone: '', title: 'Decision maker', source: v.source, status: 'New', ownerId: db.settings.ruleAssignment ? nextSalesperson(db) || me.id : me.id, city: '', country: v.country, expected: (5 + Math.floor(Math.random() * 40)) * 1000, notes: `Sample lead. Size ${v.size}.` });
    }
    toast(`${n} sample leads generated`);
    onClose();
  };
  return (
    <Modal title="Generate leads" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Sparkles" onClick={run}>Generate</Btn></>}>
      <div className="stack">
        <div className="notice">Creates sample leads for demos. A real data provider can plug in here later.</div>
        <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} fields={[
          { k: 'count', label: 'Number of leads', type: 'number', min: 1, hint: 'Up to 30 at a time' },
          { k: 'source', label: 'Source', type: 'select', noBlank: true, list: 'leadSource' },
          { k: 'industry', label: 'Industry', type: 'select', noBlank: true, list: 'industry' },
          { k: 'country', label: 'Country', type: 'select', noBlank: true, list: 'country' },
          { k: 'size', label: 'Company size', type: 'radio', list: 'companySize', full: true },
        ]} />
      </div>
    </Modal>
  );
}

function ConvertDialog({ lead, onClose, onConverted }) {
  const { db, scope, create, update, toast, role, assignable } = useStore();
  const nav = useNavigate();
  const stages = db.stages.filter((s) => s.id !== 'won');
  const [title, setTitle] = useState(`${lead.company} · New opportunity`);
  const [value, setValue] = useState(lead.expected || 0);
  const [stage, setStage] = useState((stages.find((s) => s.id === 'qualified') || stages[0]).id);
  const [ownerId, setOwner] = useState(lead.ownerId);
  const [makeDeal, setMakeDeal] = useState(true);
  const existing = db.companies.find((c) => c.name.toLowerCase() === lead.company.toLowerCase());
  const existingContact = db.contacts.find((c) => lead.email && c.email?.toLowerCase() === lead.email.toLowerCase());
  const run = () => {
    const co = existing || create('companies', { name: lead.company, status: 'Prospect', ownerId, email: lead.email, phone: lead.phone, city: lead.city, country: lead.country, tags: [], industry: '', notes: '', paymentTerms: db.settings.defaultTerms || '30 days', priceList: 'Standard' });
    const [first, ...rest] = lead.name.split(' ');
    const ct = existingContact || create('contacts', { first, last: rest.join(' '), title: lead.title, companyId: co.id, email: lead.email, phone: lead.phone, status: 'Warm', tags: [], ownerId, lastActivity: new Date().toISOString(), notes: '' });
    const st = stages.find((s) => s.id === stage);
    const deal = makeDeal ? create('deals', { title, companyId: co.id, contactId: ct.id, ownerId, stage: st.id, status: 'open', probability: st.prob, value: Number(value) || 0, priority: 1, source: lead.source, closeDate: addDays(30), tags: [], notes: lead.notes || '', stageAt: new Date().toISOString() }) : null;
    // Work already planned on the lead moves with it.
    scope(db.activities).filter((a) => a.relatedId === lead.id && a.status !== 'done').forEach((a) => update('activities', a.id, deal ? { relatedType: 'deal', relatedId: deal.id, relatedLabel: deal.title } : { relatedType: 'contact', relatedId: ct.id, relatedLabel: lead.name }));
    update('leads', lead.id, { status: 'Converted', ownerId });
    toast(deal ? 'Lead converted to an opportunity' : 'Lead converted to a customer and contact');
    onClose();
    onConverted?.();
    nav(deal ? `/pipeline/${deal.id}` : `/customers/${co.id}`);
  };
  return (
    <Modal size="sm" title="Convert lead" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={makeDeal && !title.trim()} onClick={run}>Convert</Btn></>}>
      <div className="stack">
        <div className="sub">{existing ? `Links to the existing customer ${existing.name}` : `Creates a new customer, ${lead.company}`}{existingContact ? ` and the existing contact ${existingContact.first} ${existingContact.last}.` : ', and a contact.'}</div>
        {role !== 'sales' && <div className="field"><label className="label" htmlFor="conv-owner">Salesperson</label><select id="conv-owner" className="select" value={ownerId} onChange={(e) => setOwner(e.target.value)}>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
        <label className="check"><input type="checkbox" checked={makeDeal} onChange={(e) => setMakeDeal(e.target.checked)} />Also create an opportunity</label>
        {makeDeal && <>
          <div className="field"><label className="label" htmlFor="conv-title">Opportunity</label><input id="conv-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="conv-value">Expected revenue</label><input id="conv-value" className="input" type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="conv-stage">Starting stage</label><select id="conv-stage" className="select" value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </>}
      </div>
    </Modal>
  );
}

// A sequence is a set of follow-ups added to a lead with their dates worked out.
function Sequences({ onClose }) {
  const { db, can, create, update, remove, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const canEdit = can('leads', 'edit');
  const blank = { name: '', steps: [{ day: 0, type: 'Call', text: 'Call {name}' }] };
  const setStep = (i, patch) => setEdit((p) => ({ ...p, steps: p.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)) }));
  const save = () => {
    const steps = edit.steps.filter((s) => s.text.trim()).sort((a, b) => Number(a.day) - Number(b.day));
    if (edit.id) update('sequences', edit.id, { name: edit.name.trim(), steps }); else create('sequences', { name: edit.name.trim(), steps });
    toast('Sequence saved');
    setEdit(null);
  };
  if (edit) {
    return (
      <Modal title={edit.id ? `Edit ${edit.name}` : 'New sequence'} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Back</Btn><Btn kind="primary" disabled={!edit.name.trim() || !edit.steps.some((s) => s.text.trim())} onClick={save}>Save</Btn></>}>
        <div className="stack">
          <div className="field"><label className="label" htmlFor="seq-name">Name</label><input id="seq-name" className="input" value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} /></div>
          <div className="small muted">{'{name}'} becomes the person's first name. Each step becomes a task on that day.</div>
          {edit.steps.map((s, i) => (
            <div className="row" key={i}>
              <span className="small muted nowrap">Day</span>
              <input className="input" style={{ width: 70 }} type="number" min="0" aria-label={`Day of step ${i + 1}`} value={s.day} onChange={(e) => setStep(i, { day: e.target.value })} />
              <select className="select" style={{ width: 100 }} aria-label={`Type of step ${i + 1}`} value={s.type} onChange={(e) => setStep(i, { type: e.target.value })}>{[...new Set(['Call', 'Email', 'Meeting', ...db.activityTypes.map((t) => t.name)])].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <input className="input grow" aria-label={`What to do in step ${i + 1}`} value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} />
              <Btn sm kind="ghost" icon="X" aria-label={`Remove step ${i + 1}`} disabled={edit.steps.length === 1} onClick={() => setEdit((p) => ({ ...p, steps: p.steps.filter((_, n) => n !== i) }))} />
            </div>
          ))}
          <div><Btn sm icon="Plus" onClick={() => setEdit((p) => ({ ...p, steps: [...p.steps, { day: Number(p.steps[p.steps.length - 1]?.day || 0) + 3, type: 'Call', text: '' }] }))}>Add a step</Btn></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Sequences" onClose={onClose} footer={canEdit ? <Btn kind="primary" icon="Plus" onClick={() => setEdit(blank)}>New sequence</Btn> : undefined}>
      <div className="stack-s">
        <p className="sub" style={{ margin: 0 }}>Start one on a lead to add its follow-ups as tasks. Nothing is sent automatically.</p>
        {db.sequences.map((s) => <div key={s.id} className="dashlet"><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{s.name}</div><div className="small muted">{s.steps.length} steps over {Math.max(...s.steps.map((x) => Number(x.day) || 0))} days</div></div>{canEdit && <Btn sm icon="Pencil" aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)} />}{canEdit && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${s.name}`} onClick={() => { remove('sequences', s.id); toast('Sequence deleted'); }} />}</div>)}
        {!db.sequences.length && <div className="sub">No sequences yet.</div>}
      </div>
    </Modal>
  );
}

const waitingDays = (l) => (l.status === 'New' ? Math.max(0, Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 864e5)) : 0);
const quality = (l) => (l.score >= 70 ? 'Hot' : l.score >= 40 ? 'Warm' : 'Cold');

export default function Leads() {
  const { db, role, t, sec, scope, assignable, update, remove, can, toast, userName, optionsOf, formFields, startSequence } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [modal, setModal] = useState(null);
  const rows = scope(db.leads);
  const activities = scope(db.activities, 'leads');
  const lead = rows.find((l) => l.id === openId);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);
  return (
    <div>
      <PageHead title={t('leads')} sub={`${rows.filter((l) => l.status === 'New').length} new leads ${can('leads', 'assign') ? 'to assign and follow up' : 'waiting for first contact'}`}>
        {db.settings.leadMining && can('leads', 'generate') && <Btn icon="Sparkles" onClick={() => setModal('generate')}>Generate leads</Btn>}
        <Btn icon="ListOrdered" onClick={() => setModal('sequences')}>Sequences</Btn>
        <ImportButton kind="lead" />
        {can('leads', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('new')}>New lead</Btn>}
      </PageHead>
      <DataTable fieldKind="lead" rows={rows} exportName="leads" dateOf={(l) => l.createdAt} onRow={(l) => setOpenId(l.id)} isSelected={(l) => l.id === openId} initialSort={{ k: 'createdAt', dir: 'desc' }}
        statusTabs={{ options: [...optionsOf('leadStatus'), 'Converted'], get: (l) => l.status }}
        filters={[{ k: 'source', label: 'Source', get: (l) => l.source, options: optionsOf('leadSource') }, { k: 'quality', label: 'Quality', get: quality, options: ['Hot', 'Warm', 'Cold'] }, { k: 'waiting', label: 'Waiting', get: (l) => (waitingDays(l) > 3 ? 'Over 3 days' : 'No'), options: ['Over 3 days'] }, ...(role !== 'sales' ? [{ k: 'owner', label: 'Salesperson', get: (l) => l.ownerId, options: assignable().map((u) => ({ value: u.id, label: u.name })) }] : [])]}
        bulk={can('leads', 'edit') || can('leads', 'delete') || can('leads', 'assign') ? (sel, clear) => <>
          {can('leads', 'edit') && <select className="select tb-filter" style={{ height: 30 }} aria-label="Set status of selected" value="" onChange={(e) => { if (!e.target.value) return; sel.forEach((r) => update('leads', r.id, { status: e.target.value })); clear(); toast('Status updated'); }}><option value="">Set status…</option>{optionsOf('leadStatus').map((x) => <option key={x} value={x}>{x}</option>)}</select>}
          {can('tasks', 'create') && <select className="select tb-filter" style={{ height: 30 }} aria-label="Start a sequence on selected" value="" onChange={(e) => { if (!e.target.value) return; startSequence(e.target.value, 'lead', sel); clear(); toast('Sequence started'); }}><option value="">Start sequence…</option>{db.sequences.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          {can('leads', 'assign') && <select className="select tb-filter" style={{ height: 30 }} aria-label="Assign to" value="" onChange={(e) => { if (!e.target.value) return; sel.forEach((r) => update('leads', r.id, { ownerId: e.target.value }, 'Transfer')); clear(); toast('Leads assigned'); }}><option value="">Assign to…</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          {can('leads', 'delete') && <Btn sm kind="danger" icon="Trash2" onClick={() => { sel.forEach((r) => remove('leads', r.id)); clear(); toast('Leads deleted'); }}>Delete</Btn>}
        </> : undefined}
        columns={[
          { k: 'name', label: 'Lead', render: (l) => <div><div className="strong">{l.name}</div><div className="small muted">{l.title}</div></div> },
          { k: 'company', label: 'Company' },
          { k: 'email', label: 'Email', hidden: true },
          { k: 'source', label: 'Source' },
          { k: 'status', label: 'Status', render: (l) => <span className="row" style={{ gap: 6 }}><Badge>{l.status}</Badge>{waitingDays(l) > 3 && <span className="small kb-stuck nowrap" title="Waiting for first contact">{waitingDays(l)}d</span>}</span> },
          { k: 'nextStep', label: 'Next step', hidden: true, value: (l) => nextActivity(l.id, activities)?.summary || 'None' },
          { k: 'score', label: 'Score', omit: !sec('leads', 'score'), hidden: !db.settings.predictiveScoring, render: (l) => <div className="row" style={{ width: 90 }}><span className="num small" style={{ width: 20 }}>{l.score}</span><div className="grow"><Progress value={l.score} /></div></div> },
          { k: 'expected', label: 'Expected', align: 'r', render: (l) => money(l.expected) },
          { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (l) => userName(l.ownerId), render: (l) => <UserChip id={l.ownerId} /> },
          { k: 'createdAt', label: 'Created', nowrap: true, render: (l) => fmtDate(l.createdAt) },
        ]} />
      {lead && (
        <Drawer title={lead.name} onClose={() => setOpenId(null)} actions={<>{can('transfers', 'create') && <Btn sm icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}{can('leads', 'edit') && <Btn sm icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}</>}
          footer={can('leads', 'convert') && lead.status !== 'Converted' && <><Btn onClick={() => { update('leads', lead.id, { status: 'Unqualified' }); toast('Marked unqualified'); }}>Unqualified</Btn><Btn kind="primary" icon="Repeat" onClick={() => setModal('convert')}>Convert</Btn></>}>
          <div className="stack">
            <div className="row wrap"><ContactActions showLabels person={{ name: lead.name, phone: lead.phone, relatedType: 'lead', relatedId: lead.id, sub: lead.company }} /></div>
            <div className="row wrap"><Badge>{lead.status}</Badge>{waitingDays(lead) > 3 && <span className="small kb-stuck">Waiting {waitingDays(lead)} days for first contact</span>}</div>
            {(() => { const dup = findDuplicate(db, 'lead', lead); return dup ? <p className="notice" style={{ margin: 0 }}>This may be a duplicate of <button type="button" className="link-btn" onClick={() => setOpenId(dup.id)}>{dup.name}, {dup.company}</button>. Merge duplicates in <Link to="/settings">Settings, Data</Link>.</p> : null; })()}
            {can('leads', 'edit') && lead.status !== 'Converted' && <div className="row wrap">
              {lead.status === 'New' && <Btn sm icon="PhoneCall" onClick={() => { update('leads', lead.id, { status: 'Contacted' }); toast('Marked as contacted'); }}>Mark contacted</Btn>}
              {['New', 'Contacted'].includes(lead.status) && <Btn sm icon="BadgeCheck" onClick={() => { update('leads', lead.id, { status: 'Qualified' }); toast('Marked as qualified'); }}>Qualify</Btn>}
              {can('tasks', 'create') && <Btn sm icon="Plus" onClick={() => setModal('step')}>Plan a step</Btn>}
              {can('tasks', 'create') && db.sequences.length > 0 && <select className="select tb-filter" style={{ height: 30 }} aria-label="Start a sequence" value="" onChange={(e) => { if (!e.target.value) return; startSequence(e.target.value, 'lead', [lead]); toast('Sequence started'); }}><option value="">Start sequence…</option>{db.sequences.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
            </div>}
            {(() => { const next = nextActivity(lead.id, activities); return next ? <div className="dashlet"><Icon name="CalendarCheck" size={15} color="var(--ink-3)" /><span className="grow small"><strong>Next step:</strong> {next.summary}, due {fmtDate(next.due)}</span></div> : null; })()}
            {sec('leads', 'score') && db.settings.predictiveScoring && <LeadScore lead={lead} />}
            <dl className="dl">
              <dt>Company</dt><dd>{lead.company}</dd>
              <dt>Job title</dt><dd>{lead.title || '—'}</dd>
              <dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : '—'}</dd>
              <dt>Phone</dt><dd>{lead.phone || '—'}</dd>
              <dt>Location</dt><dd>{[lead.city, lead.country].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Source</dt><dd>{lead.source || '—'}</dd>
              <dt>Expected</dt><dd className="num">{money(lead.expected)}</dd>
              <dt>Salesperson</dt><dd><UserChip id={lead.ownerId} /></dd>
              <dt>Notes</dt><dd>{lead.notes || '—'}</dd>
              <CustomValues kind="lead" record={lead} />
            </dl>
            {sec('leads', 'history') && <Chatter related={relatedOf('lead', lead)} />}
          </div>
        </Drawer>
      )}
      {modal === 'new' && <RecordQuickCreate kind="lead" onClose={() => setModal(null)} />}
      {modal === 'generate' && <Generate onClose={() => setModal(null)} />}
      {modal === 'sequences' && <Sequences onClose={() => setModal(null)} />}
      {modal === 'step' && lead && <ActivityDialog related={relatedOf('lead', lead)} onClose={() => setModal(null)} />}
      {modal === 'convert' && lead && <ConvertDialog lead={lead} onClose={() => setModal(null)} onConverted={() => setOpenId(null)} />}
      {modal === 'transfer' && lead && <TransferDialog record={relatedOf('lead', lead)} onClose={() => setModal(null)} />}
      {modal === 'edit' && lead && <RecordModal size="lg" title="Edit lead" fields={formFields('lead', leadFields({ owner: role !== 'sales' }))} initial={lead} onClose={() => setModal(null)} onSave={(v) => { const { id, ...rest } = v; update('leads', lead.id, rest); toast('Lead saved'); }} />}
    </div>
  );
}
