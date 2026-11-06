import React, { useEffect, useState } from 'react';
// A starting point for answering a case, from its subject. Fixed wording, not an AI model.
const caseReply = (c) => (/invoice|tax|billing/i.test(c.subject) ? 'Thanks for flagging this. I am checking the invoice now and will send a corrected copy today.' : /deliver|damag|ship/i.test(c.subject) ? 'I am sorry about this. I am checking with our logistics team and will come back with a resolution today.' : /password|login|access|seat/i.test(c.subject) ? 'Thanks for reaching out. I am looking at your account access and will update you shortly.' : 'Thanks for reaching out. I am looking into this and will update you by the end of the day.');
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, DataTable, Drawer, Kpi, Modal, NoSections, PageHead, Pills, RecordModal, Tabs, UserChip, firstAllowed } from '../ui';
import { fmtDT, relTime } from '../util';
import { SLA_TONE, articlesFor, isOpenCase, nextCaseNumber, slaOf } from '../cases';
import { CasePerformance, CaseSetup, KnowledgeBase, SlaPanel } from './CaseExtras';

const NEXT_PRIORITY = { Low: 'Normal', Normal: 'High', High: 'Urgent' };
const SAMPLE_EMAILS = ['Cannot log in after the update', 'Wrong item in my last delivery', 'Please send a copy of my invoice', 'Device keeps restarting', 'How do I add another user?'];

const fieldsFor = (db, role) => [
  { k: 'subject', label: 'Subject', req: true, full: true },
  { k: 'companyId', label: 'Account', type: 'company', req: true },
  { k: 'type', label: 'Type', type: 'select', list: 'caseType', req: true },
  { k: 'priority', label: 'Priority', type: 'radio', list: 'casePriority', full: true },
  { k: 'status', label: 'Status', type: 'select', noBlank: true, list: 'caseStatus' },
  { k: 'queue', label: 'Queue', type: 'select', list: 'caseQueue' },
  { k: 'channel', label: 'Came in by', type: 'select', list: 'caseChannel' },
  { k: 'ownerId', label: 'Assigned user', type: 'user', req: true, hide: role === 'sales' },
  { k: 'description', label: 'Description', type: 'textarea' },
  { k: 'attachment', label: 'Attachment', type: 'file' },
];

export default function Cases() {
  const { db, me, role, t, sec, scope, create, update, remove, can, toast, companyName, userName, optionsOf, formFields, pushNotification } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [modal, setModal] = useState(null);
  const [post, setPost] = useState('');
  const [postKind, setPostKind] = useState('reply');
  const [queueView, setQueueView] = useState('All');
  const [pref, setTab] = useState('cases');
  const [merging, setMerging] = useState(false);
  const [mergeInto, setMergeInto] = useState('');
  const tabs = [{ k: 'cases', label: 'Cases', icon: 'LifeBuoy' }, { k: 'kb', label: 'Knowledge base', icon: 'BookOpen', count: (db.kbArticles || []).length }, { k: 'perf', label: 'Performance', icon: 'ChartColumn' }, ...(can('cases', 'delete') ? [{ k: 'setup', label: 'Targets and replies', icon: 'SlidersHorizontal' }] : [])].filter((x) => sec('cases', x.k));
  const tab = firstAllowed(tabs, pref);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);
  const rows = scope(db.cases);
  const c = rows.find((x) => x.id === openId);
  const addPost = () => {
    if (!post.trim()) return;
    const at = new Date().toISOString();
    const isReply = postKind === 'reply';
    update('cases', c.id, { stream: [{ at, by: me.id, kind: postKind, text: post.trim() }, ...c.stream], ...(isReply && !c.firstResponseAt ? { firstResponseAt: at } : {}), ...(isReply && c.status === 'New' ? { status: 'Assigned' } : {}) });
    toast(isReply ? 'Reply posted to the customer portal. No real email was sent.' : 'Internal note added');
    setPost('');
  };
  const queueRows = rows.filter((x) => {
    if (queueView === 'Mine') return x.ownerId === me.id && isOpenCase(x);
    if (queueView === 'New') return x.status === 'New';
    if (queueView === 'Overdue') return slaOf(x, db.settings).overall === 'Overdue';
    if (queueView === 'Due soon') return slaOf(x, db.settings).overall === 'Due soon';
    return true;
  });
  const whoOf = (m) => (m.kind === 'customer' ? (contactOf(c)?.first ? `${contactOf(c).first} ${contactOf(c).last}` : companyName(c.companyId)) : userName(m.by));
  const contactOf = (x) => db.contacts.find((p) => p.id === x.contactId);
  const take = () => { update('cases', c.id, { ownerId: me.id, ...(c.status === 'New' ? { status: 'Assigned' } : {}) }); toast('Assigned to you'); };
  const escalate = () => {
    const priority = NEXT_PRIORITY[c.priority] || c.priority;
    update('cases', c.id, { priority, escalated: true, stream: [{ at: new Date().toISOString(), by: me.id, kind: 'note', text: `Escalated by ${me.name}. Priority is now ${priority}.` }, ...c.stream] });
    const owner = db.users.find((u) => u.id === c.ownerId);
    const managerId = db.teams.find((x) => x.id === owner?.teamId)?.managerId;
    const to = managerId && managerId !== me.id ? [managerId] : db.users.filter((u) => u.role === 'admin' && u.active && u.id !== me.id).map((u) => u.id);
    to.forEach((id) => pushNotification(id, `Case #${c.number} was escalated: ${c.subject}`, `/cases?open=${c.id}`));
    toast('Case escalated');
  };
  const merge = () => {
    const into = rows.find((x) => x.id === mergeInto);
    if (!into) return;
    const at = new Date().toISOString();
    update('cases', into.id, { stream: [{ at, by: me.id, kind: 'note', text: `Case #${c.number} was merged into this one: ${c.subject}` }, ...c.stream.map((m) => ({ ...m, text: `[From #${c.number}] ${m.text}` })), ...into.stream] });
    update('cases', c.id, { status: 'Closed', mergedInto: into.number, stream: [{ at, by: me.id, kind: 'note', text: `Merged into case #${into.number}.` }, ...c.stream] });
    toast(`Merged into #${into.number}`);
    setMerging(false);
    setOpenId(into.id);
  };
  const simulateEmail = () => {
    const pool = scope(db.contacts, 'contacts').filter((p) => p.companyId && p.email);
    const person = pool[Math.floor(Math.random() * pool.length)];
    const co = db.companies.find((x) => x.id === person?.companyId);
    if (!person || !co) { toast('Add a contact with an email first.', 'bad'); return; }
    const subject = SAMPLE_EMAILS[Math.floor(Math.random() * SAMPLE_EMAILS.length)];
    const at = new Date().toISOString();
    const made = create('cases', { subject, companyId: co.id, contactId: person.id, ownerId: co.ownerId || me.id, status: 'New', priority: 'Normal', type: 'Question', channel: 'Email', queue: /invoice/i.test(subject) ? 'Billing' : /delivery/i.test(subject) ? 'Delivery' : 'Technical', number: nextCaseNumber(db.cases), description: `Sample email from ${person.email}.`, stream: [{ at, by: null, kind: 'customer', text: subject }] });
    if (co.ownerId) pushNotification(co.ownerId, `New case from ${person.first} ${person.last}: ${subject}`, `/cases?open=${made.id}`);
    toast('Sample email turned into a case. Nothing really arrived.');
  };
  const suggested = c ? articlesFor(db.kbArticles || [], c.subject).slice(0, 3) : [];
  const fillName = (text) => text.replace(/\{name\}/g, (c && contactOf(c)?.first) || 'there');
  const contact = c && db.contacts.find((p) => p.id === c.contactId);
  return (
    <div>
      <PageHead title={t('cases')} sub="Customer issues and requests">
        {tab === 'cases' && can('cases', 'create') && <Btn icon="Mail" onClick={simulateEmail}>Simulate an incoming email</Btn>}
        {tab === 'cases' && can('cases', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('new')}>Create case</Btn>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {!tab && <NoSections />}
      {tab === 'kb' && <KnowledgeBase />}
      {tab === 'perf' && <CasePerformance rows={rows} />}
      {tab === 'setup' && <CaseSetup />}
      {tab === 'cases' && <>
      {sec('cases', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="New" value={rows.filter((x) => x.status === 'New').length} note="Waiting for an owner" icon="Inbox" />
        <Kpi label="Overdue" value={rows.filter((x) => slaOf(x, db.settings).overall === 'Overdue').length} note="Past the service target" icon="AlarmClock" />
        <Kpi label="Urgent and open" value={rows.filter((x) => x.priority === 'Urgent' && !['Closed', 'Rejected'].includes(x.status)).length} icon="Siren" />
        <Kpi label="Closed" value={rows.filter((x) => x.status === 'Closed').length} icon="CircleCheck" />
      </div>}
      <div style={{ marginBottom: 10 }}><Pills value={queueView} onChange={setQueueView} options={['All', 'Mine', 'New', 'Overdue', 'Due soon']} /></div>
      <DataTable rows={queueRows} exportName="cases" dateOf={(x) => x.createdAt} onRow={(x) => setOpenId(x.id)} isSelected={(x) => x.id === openId} initialSort={{ k: 'createdAt', dir: 'desc' }}
        statusTabs={{ options: optionsOf('caseStatus'), get: (x) => x.status }}
        filters={[
          { k: 'priority', label: 'Priority', get: (x) => x.priority, options: optionsOf('casePriority') },
          { k: 'type', label: 'Type', get: (x) => x.type, options: optionsOf('caseType') },
          { k: 'queue', label: 'Queue', get: (x) => x.queue, options: optionsOf('caseQueue') },
          { k: 'channel', label: 'Came in by', get: (x) => x.channel, options: optionsOf('caseChannel') },
        ]}
        bulk={can('cases', 'edit') ? (sel, clear) => <><Btn sm icon="UserCheck" onClick={() => { sel.forEach((r) => update('cases', r.id, { ownerId: me.id, ...(r.status === 'New' ? { status: 'Assigned' } : {}) })); clear(); toast('Assigned to you'); }}>Assign to me</Btn><Btn sm icon="CircleCheck" onClick={() => { sel.forEach((r) => update('cases', r.id, { status: 'Closed' })); clear(); toast('Cases closed'); }}>Close</Btn></> : undefined}
        columns={[
          { k: 'number', label: 'Number', render: (x) => <span className="num muted">#{x.number}</span> },
          { k: 'subject', label: 'Name', render: (x) => <span className="strong">{x.subject}</span> },
          { k: 'status', label: 'Status', render: (x) => <Badge>{x.status}</Badge> },
          { k: 'account', label: 'Account', value: (x) => companyName(x.companyId) },
          { k: 'priority', label: 'Priority', render: (x) => <Badge>{x.priority}</Badge> },
          { k: 'sla', label: 'Service target', value: (x) => slaOf(x, db.settings).overall, render: (x) => <Badge tone={SLA_TONE[slaOf(x, db.settings).overall]}>{slaOf(x, db.settings).overall}</Badge> },
          { k: 'queue', label: 'Queue' },
          { k: 'type', label: 'Type' },
          { k: 'owner', label: 'Assigned user', omit: role === 'sales', value: (x) => userName(x.ownerId), render: (x) => <UserChip id={x.ownerId} /> },
          { k: 'createdAt', label: 'Created', nowrap: true, render: (x) => relTime(x.createdAt) },
        ]} />
      </>}
      {c && (
        <Drawer title={`#${c.number} ${c.subject}`} onClose={() => setOpenId(null)} actions={can('cases', 'edit') && <Btn sm icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>} footer={<>
          {can('cases', 'delete') && <Btn kind="danger" icon="Trash2" style={{ marginInlineEnd: 'auto' }} onClick={() => setModal('delete')}>Delete</Btn>}
          {!can('cases', 'edit') ? null : c.status !== 'Closed' ? <Btn kind="primary" icon="CircleCheck" onClick={() => { update('cases', c.id, { status: 'Closed' }); toast('Case closed'); }}>Close case</Btn> : <Btn onClick={() => { update('cases', c.id, { status: 'Assigned' }); toast('Case reopened'); }}>Reopen</Btn>}
        </>}>
          <div className="stack">
            <div className="row wrap"><Badge>{c.status}</Badge><Badge>{c.priority}</Badge><Badge tone="muted" dot={false}>{c.type}</Badge>{c.escalated && <Badge tone="bad" dot={false}>Escalated</Badge>}{c.mergedInto && <Badge tone="muted" dot={false}>Merged into #{c.mergedInto}</Badge>}</div>
            <SlaPanel c={c} />
            {can('cases', 'edit') && isOpenCase(c) && <div className="row wrap">
              {c.ownerId !== me.id && <Btn sm icon="UserCheck" onClick={take}>Assign to me</Btn>}
              {NEXT_PRIORITY[c.priority] && <Btn sm icon="ArrowUpCircle" onClick={escalate}>Escalate</Btn>}
              {c.status !== 'Pending' ? <Btn sm icon="Pause" onClick={() => { update('cases', c.id, { status: 'Pending' }); toast('Waiting for the customer. The clock is paused.'); }}>Wait for customer</Btn> : <Btn sm icon="Play" onClick={() => { update('cases', c.id, { status: 'Assigned' }); toast('The clock is running again'); }}>Resume</Btn>}
              <Btn sm icon="GitMerge" onClick={() => { setMergeInto(''); setMerging(true); }}>Merge</Btn>
            </div>}
            <dl className="dl">
              <dt>Account</dt><dd><Link to={`/customers/${c.companyId}`}>{companyName(c.companyId)}</Link></dd>
              <dt>Contact</dt><dd>{contact ? `${contact.first} ${contact.last}` : '—'}</dd>
              <dt>Assigned user</dt><dd><UserChip id={c.ownerId} /></dd>
              <dt>Created</dt><dd>{fmtDT(c.createdAt)}</dd>
              <dt>Queue</dt><dd>{c.queue || '—'}</dd>
              <dt>Came in by</dt><dd>{c.channel || '—'}</dd>
              {c.csat && <><dt>Customer rating</dt><dd>{c.csat} out of 5</dd></>}
              <dt>Description</dt><dd>{c.description || '—'}</dd>
            </dl>
            {sec('cases', 'stream') && <div>
              <div className="filter-title">Stream</div>
              <div className="stack-s" style={{ marginBottom: 12 }}>
                <div className="row between wrap">
                  <Pills value={postKind} onChange={setPostKind} options={[{ k: 'reply', label: 'Reply to customer' }, { k: 'note', label: 'Internal note' }]} />
                  {(db.cannedReplies || []).length > 0 && <select className="select tb-filter" aria-label="Saved replies" value="" onChange={(e) => { const r = db.cannedReplies.find((x) => x.id === e.target.value); if (r) setPost(fillName(r.text)); }}><option value="">Saved replies…</option>{db.cannedReplies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
                </div>
                <textarea className="textarea" aria-label="Write a post" placeholder={postKind === 'reply' ? 'The customer can see this in their portal' : 'Only your team can see this'} value={post} onChange={(e) => setPost(e.target.value)} />
                {suggested.length > 0 && <div className="small"><span className="muted">Help articles that may answer this: </span>{suggested.map((a) => <button key={a.id} type="button" className="link-btn" style={{ marginInlineEnd: 8 }} onClick={() => setPost((p) => `${p ? `${p}\n\n` : ''}This article may help: ${a.title}`)}>{a.title}</button>)}</div>}
                {db.settings.aiWriter !== false && <div><Btn sm icon="Sparkles" onClick={() => setPost(caseReply(c))}>Suggest a reply</Btn></div>}
                <div><Btn sm kind="primary" disabled={!post.trim()} onClick={addPost}>{postKind === 'reply' ? 'Send reply' : 'Add note'}</Btn></div>
              </div>
              <div className="feed">
                {c.stream.map((m) => (
                  <div key={m.at + m.text} className="feed-item"><Avatar name={whoOf(m)} size={26} /><div className="grow"><div className="small"><span className="strong">{whoOf(m)}</span> <span className="muted">{relTime(m.at)}</span></div>{m.kind === 'note' && <Badge tone="warn" dot={false}>Internal note</Badge>}{m.kind === 'customer' && <Badge tone="info" dot={false}>Customer</Badge>}<div style={{ overflowWrap: 'anywhere' }}>{m.text}</div></div></div>
                ))}
              </div>
            </div>}
          </div>
        </Drawer>
      )}
      {modal === 'new' && <RecordModal size="lg" title="Create case" saveLabel="Create" fields={formFields('case', fieldsFor(db, role))} initial={{ status: 'New', priority: 'Normal', type: 'Question', ownerId: me.id }} onClose={() => setModal(null)} onSave={(v) => { const contact0 = db.contacts.find((p) => p.companyId === v.companyId); create('cases', { ...v, number: nextCaseNumber(db.cases), contactId: contact0?.id || '', stream: [{ at: new Date().toISOString(), by: me.id, kind: 'note', text: 'Case created.' }] }); toast('Case created'); }} />}
      {modal === 'edit' && c && <RecordModal size="lg" title="Edit case" fields={formFields('case', fieldsFor(db, role))} initial={c} onClose={() => setModal(null)} onSave={(v) => { const { id, ...rest } = v; update('cases', c.id, rest); toast('Case saved'); }} />}
      {merging && c && <Modal size="sm" title={`Merge case #${c.number}`} onClose={() => setMerging(false)} footer={<><Btn onClick={() => setMerging(false)}>Cancel</Btn><Btn kind="primary" disabled={!mergeInto} onClick={merge}>Merge</Btn></>}>
        <div className="field"><label className="label" htmlFor="merge-into">Merge into</label><select id="merge-into" className="select" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}><option value="">Choose a case…</option>{rows.filter((x) => x.id !== c.id && x.companyId === c.companyId && isOpenCase(x)).map((x) => <option key={x.id} value={x.id}>#{x.number} {x.subject}</option>)}</select><span className="hint">Only open cases for the same customer. This case closes, and its history moves across.</span></div>
      </Modal>}
      {modal === 'delete' && c && <Confirm title="Delete case?" text={`Case #${c.number} will be removed for everyone.`} onClose={() => setModal(null)} onConfirm={() => { remove('cases', c.id); setOpenId(null); toast('Case deleted'); }} />}
    </div>
  );
}
