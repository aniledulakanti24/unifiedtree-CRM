import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Confirm, DataTable, Drawer, FormFields, Modal, PageHead, Progress, RecordModal, UserChip } from '../ui';
import { ContactActions } from '../comms';
import { Chatter, RecordQuickCreate, TransferDialog, leadFields, relatedOf } from '../shared';
import { addDays, fmtDate, money, uid } from '../util';

function Generate({ onClose }) {
  const { me, create, toast } = useStore();
  const [v, setV] = useState({ count: 5, industry: 'Technology', country: 'USA', size: '51-200', source: 'Website', note: '' });
  const words = ['Aspen', 'Basalt', 'Cinder', 'Dune', 'Elm', 'Flint', 'Grove', 'Hazel', 'Iris', 'Jade'];
  const people = ['Alex Morgan', 'Sam Rivera', 'Jamie Chen', 'Robin Ahmed', 'Casey Novak', 'Drew Patel', 'Taylor Boyd', 'Jordan Lee'];
  const run = () => {
    const n = Math.max(1, Math.min(30, Number(v.count) || 1));
    for (let i = 0; i < n; i++) {
      const co = `${words[Math.floor(Math.random() * words.length)]} ${v.industry}`;
      const nm = people[Math.floor(Math.random() * people.length)];
      create('leads', { id: uid('l'), name: nm, company: co, email: `${nm.split(' ')[0].toLowerCase()}@${co.replace(/\s/g, '').toLowerCase()}.example`, phone: '', title: 'Decision maker', source: v.source, status: 'New', score: 40 + Math.floor(Math.random() * 50), ownerId: me.id, city: '', country: v.country, expected: (5 + Math.floor(Math.random() * 40)) * 1000, notes: `Sample lead. Size ${v.size}.` });
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

function ConvertDialog({ lead, onClose }) {
  const { db, create, update, toast } = useStore();
  const [title, setTitle] = useState(`${lead.company} · New opportunity`);
  const [value, setValue] = useState(lead.expected || 0);
  const existing = db.companies.find((c) => c.name.toLowerCase() === lead.company.toLowerCase());
  const run = () => {
    const co = existing || create('companies', { name: lead.company, status: 'Prospect', ownerId: lead.ownerId, email: lead.email, phone: lead.phone, city: lead.city, country: lead.country, tags: [], industry: '', notes: '', paymentTerms: '30 days', priceList: 'Standard' });
    const [first, ...rest] = lead.name.split(' ');
    const ct = create('contacts', { first, last: rest.join(' '), title: lead.title, companyId: co.id, email: lead.email, phone: lead.phone, status: 'Warm', tags: [], ownerId: lead.ownerId, lastActivity: new Date().toISOString(), notes: '' });
    create('deals', { title, companyId: co.id, contactId: ct.id, ownerId: lead.ownerId, stage: (db.stages.find((s) => s.id === 'qualified') || db.stages[0]).id, status: 'open', probability: (db.stages.find((s) => s.id === 'qualified') || db.stages[0]).prob, value: Number(value) || 0, priority: 1, source: lead.source, closeDate: addDays(45), tags: [], notes: lead.notes || '' });
    update('leads', lead.id, { status: 'Converted' });
    toast('Lead converted to an opportunity');
    onClose();
  };
  return (
    <Modal size="sm" title="Convert to opportunity" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={run}>Convert</Btn></>}>
      <div className="stack">
        <div className="sub">{existing ? `Links to the existing customer ${existing.name}.` : `Creates a new customer, ${lead.company}, and a contact.`}</div>
        <div className="field"><label className="label">Opportunity</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label className="label">Expected revenue</label><input className="input" type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

export default function Leads() {
  const { db, role, t, sec, scope, assignable, update, remove, can, toast, userName, optionsOf } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [modal, setModal] = useState(null);
  const rows = scope(db.leads);
  const lead = rows.find((l) => l.id === openId);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);
  return (
    <div>
      <PageHead title={t('leads')} sub={`${rows.filter((l) => l.status === 'New').length} new leads ${can('leads', 'assign') ? 'to assign and follow up' : 'waiting for first contact'}`}>
        {db.settings.leadMining && can('leads', 'generate') && <Btn icon="Sparkles" onClick={() => setModal('generate')}>Generate leads</Btn>}
        {can('leads', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('new')}>New lead</Btn>}
      </PageHead>
      <DataTable rows={rows} exportName="leads" onRow={(l) => setOpenId(l.id)} isSelected={(l) => l.id === openId} initialSort={{ k: 'createdAt', dir: 'desc' }}
        statusTabs={{ options: [...optionsOf('leadStatus'), 'Converted'], get: (l) => l.status }}
        filters={[{ k: 'source', label: 'Source', get: (l) => l.source, options: optionsOf('leadSource') }]}
        bulk={can('leads', 'delete') || can('leads', 'assign') ? (sel, clear) => <>
          {can('leads', 'assign') && <select className="select tb-filter" style={{ height: 30 }} aria-label="Assign to" value="" onChange={(e) => { if (!e.target.value) return; sel.forEach((r) => update('leads', r.id, { ownerId: e.target.value }, 'Transfer')); clear(); toast('Leads assigned'); }}><option value="">Assign to…</option>{assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          {can('leads', 'delete') && <Btn sm kind="danger" icon="Trash2" onClick={() => { sel.forEach((r) => remove('leads', r.id)); clear(); toast('Leads deleted'); }}>Delete</Btn>}
        </> : undefined}
        columns={[
          { k: 'name', label: 'Lead', render: (l) => <div><div className="strong">{l.name}</div><div className="small muted">{l.title}</div></div> },
          { k: 'company', label: 'Company' },
          { k: 'email', label: 'Email', hidden: true },
          { k: 'source', label: 'Source' },
          { k: 'status', label: 'Status', render: (l) => <Badge>{l.status}</Badge> },
          { k: 'score', label: 'Score', omit: !sec('leads', 'score'), hidden: !db.settings.predictiveScoring, render: (l) => <div className="row" style={{ width: 90 }}><span className="num small" style={{ width: 20 }}>{l.score}</span><div className="grow"><Progress value={l.score} /></div></div> },
          { k: 'expected', label: 'Expected', align: 'r', render: (l) => money(l.expected) },
          { k: 'owner', label: 'Salesperson', omit: role === 'sales', value: (l) => userName(l.ownerId), render: (l) => <UserChip id={l.ownerId} /> },
          { k: 'createdAt', label: 'Created', nowrap: true, render: (l) => fmtDate(l.createdAt) },
        ]} />
      {lead && (
        <Drawer title={lead.name} onClose={() => setOpenId(null)} actions={<>{can('transfers', 'create') && <Btn sm icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}{can('leads', 'edit') && <Btn sm icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}</>}
          footer={can('leads', 'convert') && lead.status !== 'Converted' && <><Btn onClick={() => { update('leads', lead.id, { status: 'Unqualified' }); toast('Marked unqualified'); }}>Unqualified</Btn><Btn kind="primary" icon="Repeat" onClick={() => setModal('convert')}>Convert to opportunity</Btn></>}>
          <div className="stack">
            <div className="row wrap"><ContactActions showLabels person={{ name: lead.name, phone: lead.phone, relatedType: 'lead', relatedId: lead.id, sub: lead.company }} /></div>
            <div className="row wrap"><Badge>{lead.status}</Badge>{sec('leads', 'score') && <Badge tone="muted" dot={false}>Score {lead.score}</Badge>}</div>
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
            </dl>
            {sec('leads', 'history') && <Chatter related={relatedOf('lead', lead)} />}
          </div>
        </Drawer>
      )}
      {modal === 'new' && <RecordQuickCreate kind="lead" onClose={() => setModal(null)} />}
      {modal === 'generate' && <Generate onClose={() => setModal(null)} />}
      {modal === 'convert' && lead && <ConvertDialog lead={lead} onClose={() => setModal(null)} />}
      {modal === 'transfer' && lead && <TransferDialog record={relatedOf('lead', lead)} onClose={() => setModal(null)} />}
      {modal === 'edit' && lead && <RecordModal size="lg" title="Edit lead" fields={leadFields({ owner: role !== 'sales' })} initial={lead} onClose={() => setModal(null)} onSave={(v) => { const { id, ...rest } = v; update('leads', lead.id, rest); toast('Lead saved'); }} />}
    </div>
  );
}
