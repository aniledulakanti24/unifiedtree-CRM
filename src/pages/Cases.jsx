import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, DataTable, Drawer, Kpi, PageHead, RecordModal, UserChip } from '../ui';
import { fmtDT, relTime } from '../util';

const fieldsFor = (db, role) => [
  { k: 'subject', label: 'Subject', req: true, full: true },
  { k: 'companyId', label: 'Account', type: 'company', req: true },
  { k: 'type', label: 'Type', type: 'select', list: 'caseType', req: true },
  { k: 'priority', label: 'Priority', type: 'radio', list: 'casePriority', full: true },
  { k: 'status', label: 'Status', type: 'select', noBlank: true, list: 'caseStatus' },
  { k: 'ownerId', label: 'Assigned user', type: 'user', req: true, hide: role === 'sales' },
  { k: 'description', label: 'Description', type: 'textarea' },
  { k: 'attachment', label: 'Attachment', type: 'file' },
];

export default function Cases() {
  const { db, me, role, t, sec, scope, create, update, remove, can, toast, companyName, userName, optionsOf } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [modal, setModal] = useState(null);
  const [post, setPost] = useState('');
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);
  const rows = scope(db.cases);
  const c = rows.find((x) => x.id === openId);
  const addPost = () => {
    if (!post.trim()) return;
    update('cases', c.id, { stream: [{ at: new Date().toISOString(), by: me.id, text: post.trim() }, ...c.stream] });
    setPost('');
  };
  const contact = c && db.contacts.find((p) => p.id === c.contactId);
  return (
    <div>
      <PageHead title={t('cases')} sub="Customer issues and requests">
        {can('cases', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('new')}>Create case</Btn>}
      </PageHead>
      {sec('cases', 'kpis') && <div className="g4" style={{ marginBottom: 14 }}>
        <Kpi label="New" value={rows.filter((x) => x.status === 'New').length} note="Waiting for an owner" icon="Inbox" />
        <Kpi label="In progress" value={rows.filter((x) => ['Assigned', 'Pending'].includes(x.status)).length} icon="Wrench" />
        <Kpi label="Urgent and open" value={rows.filter((x) => x.priority === 'Urgent' && !['Closed', 'Rejected'].includes(x.status)).length} icon="Siren" />
        <Kpi label="Closed" value={rows.filter((x) => x.status === 'Closed').length} icon="CircleCheck" />
      </div>}
      <DataTable rows={rows} exportName="cases" onRow={(x) => setOpenId(x.id)} isSelected={(x) => x.id === openId} initialSort={{ k: 'createdAt', dir: 'desc' }}
        statusTabs={{ options: optionsOf('caseStatus'), get: (x) => x.status }}
        filters={[
          { k: 'priority', label: 'Priority', get: (x) => x.priority, options: optionsOf('casePriority') },
          { k: 'type', label: 'Type', get: (x) => x.type, options: optionsOf('caseType') },
        ]}
        bulk={can('cases', 'edit') ? (sel, clear) => <Btn sm icon="CircleCheck" onClick={() => { sel.forEach((r) => update('cases', r.id, { status: 'Closed' })); clear(); toast('Cases closed'); }}>Close</Btn> : undefined}
        columns={[
          { k: 'number', label: 'Number', render: (x) => <span className="num muted">#{x.number}</span> },
          { k: 'subject', label: 'Name', render: (x) => <span className="strong">{x.subject}</span> },
          { k: 'status', label: 'Status', render: (x) => <Badge>{x.status}</Badge> },
          { k: 'account', label: 'Account', value: (x) => companyName(x.companyId) },
          { k: 'priority', label: 'Priority', render: (x) => <Badge>{x.priority}</Badge> },
          { k: 'type', label: 'Type' },
          { k: 'owner', label: 'Assigned user', omit: role === 'sales', value: (x) => userName(x.ownerId), render: (x) => <UserChip id={x.ownerId} /> },
          { k: 'createdAt', label: 'Created', nowrap: true, render: (x) => relTime(x.createdAt) },
        ]} />
      {c && (
        <Drawer title={`#${c.number} ${c.subject}`} onClose={() => setOpenId(null)} actions={can('cases', 'edit') && <Btn sm icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>} footer={<>
          {can('cases', 'delete') && <Btn kind="danger" icon="Trash2" style={{ marginInlineEnd: 'auto' }} onClick={() => setModal('delete')}>Delete</Btn>}
          {!can('cases', 'edit') ? null : c.status !== 'Closed' ? <Btn kind="primary" icon="CircleCheck" onClick={() => { update('cases', c.id, { status: 'Closed' }); toast('Case closed'); }}>Close case</Btn> : <Btn onClick={() => { update('cases', c.id, { status: 'Assigned' }); toast('Case reopened'); }}>Reopen</Btn>}
        </>}>
          <div className="stack">
            <div className="row wrap"><Badge>{c.status}</Badge><Badge>{c.priority}</Badge><Badge tone="muted" dot={false}>{c.type}</Badge></div>
            <dl className="dl">
              <dt>Account</dt><dd><Link to={`/customers/${c.companyId}`}>{companyName(c.companyId)}</Link></dd>
              <dt>Contact</dt><dd>{contact ? `${contact.first} ${contact.last}` : '—'}</dd>
              <dt>Assigned user</dt><dd><UserChip id={c.ownerId} /></dd>
              <dt>Created</dt><dd>{fmtDT(c.createdAt)}</dd>
              <dt>Description</dt><dd>{c.description || '—'}</dd>
            </dl>
            {sec('cases', 'stream') && <div>
              <div className="filter-title">Stream</div>
              <div className="stack-s" style={{ marginBottom: 12 }}>
                <textarea className="textarea" aria-label="Write a post" placeholder="Write your comment here" value={post} onChange={(e) => setPost(e.target.value)} />
                <div><Btn sm kind="primary" disabled={!post.trim()} onClick={addPost}>Post</Btn></div>
              </div>
              <div className="feed">
                {c.stream.map((m) => (
                  <div key={m.at + m.text} className="feed-item"><Avatar name={userName(m.by)} size={26} /><div className="grow"><div className="small"><span className="strong">{userName(m.by)}</span> <span className="muted">{relTime(m.at)}</span></div><div style={{ overflowWrap: 'anywhere' }}>{m.text}</div></div></div>
                ))}
              </div>
            </div>}
          </div>
        </Drawer>
      )}
      {modal === 'new' && <RecordModal size="lg" title="Create case" saveLabel="Create" fields={fieldsFor(db, role)} initial={{ status: 'New', priority: 'Normal', type: 'Question', ownerId: me.id }} onClose={() => setModal(null)} onSave={(v) => { const contact0 = db.contacts.find((p) => p.companyId === v.companyId); create('cases', { ...v, number: 1200 + db.cases.length, contactId: contact0?.id || '', stream: [{ at: new Date().toISOString(), by: me.id, text: 'Case created.' }] }); toast('Case created'); }} />}
      {modal === 'edit' && c && <RecordModal size="lg" title="Edit case" fields={fieldsFor(db, role)} initial={c} onClose={() => setModal(null)} onSave={(v) => { const { id, ...rest } = v; update('cases', c.id, rest); toast('Case saved'); }} />}
      {modal === 'delete' && c && <Confirm title="Delete case?" text={`Case #${c.number} will be removed for everyone.`} onClose={() => setModal(null)} onConfirm={() => { remove('cases', c.id); setOpenId(null); toast('Case deleted'); }} />}
    </div>
  );
}
