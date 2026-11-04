import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { RECORD_ENTITY, useStore } from '../store';
import { Badge, Btn, DataTable, FormFields, Kpi, Modal, PageHead, UserChip } from '../ui';
import { TransferDialog } from '../shared';
import { fmtDate, relTime } from '../util';

const TYPE_LABEL = { deal: 'Opportunity', lead: 'Lead', contact: 'Contact', company: 'Customer' };
const linkOf = (t) => (t.recordType === 'deal' ? `/pipeline/${t.recordId}` : t.recordType === 'company' ? `/customers/${t.recordId}` : t.recordType === 'lead' ? `/leads?open=${t.recordId}` : `/contacts?open=${t.recordId}`);

function NewTransfer({ onClose }) {
  const { db, scope, role, companyName } = useStore();
  const [v, setV] = useState({ type: 'deal', recordId: '' });
  const [record, setRecord] = useState(null);
  const list = scope(db[RECORD_ENTITY[v.type]]).filter((r) => (v.type === 'deal' ? r.status === 'open' : true));
  const label = (r) => (v.type === 'deal' ? r.title : v.type === 'contact' ? `${r.first} ${r.last}` : r.name);
  if (record) return <TransferDialog record={record} onClose={onClose} />;
  return (
    <Modal size="sm" title="New internal transfer" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!v.recordId} onClick={() => { const r = list.find((x) => x.id === v.recordId); setRecord({ type: v.type, id: r.id, label: label(r), ownerId: r.ownerId }); }}>Continue</Btn></>}>
      <FormFields values={v} onChange={(k, x) => setV((p) => (k === 'type' ? { type: x, recordId: '' } : { ...p, [k]: x }))} fields={[
        { k: 'type', label: 'Record type', type: 'select', noBlank: true, options: Object.entries(TYPE_LABEL).map(([value, l]) => ({ value, label: l })), full: true },
        { k: 'recordId', label: TYPE_LABEL[v.type], type: 'select', full: true, options: [...list].sort((a, b) => label(a).localeCompare(label(b))).map((r) => ({ value: r.id, label: role === 'sales' ? label(r) : `${label(r)} (${db.users.find((u) => u.id === r.ownerId)?.name})` })) },
      ]} />
    </Modal>
  );
}
function Decide({ t, approve, onClose }) {
  const { decideTransfer, toast } = useStore();
  const [note, setNote] = useState('');
  return (
    <Modal size="sm" title={approve ? 'Approve transfer' : 'Reject transfer'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={approve ? 'primary' : 'danger'} onClick={() => { decideTransfer(t.id, approve, note); toast(approve ? 'Transfer approved. Ownership moved.' : 'Transfer rejected'); onClose(); }}>{approve ? 'Approve' : 'Reject'}</Btn></>}>
      <div className="stack">
        <div className="sub"><strong>{t.recordLabel}</strong></div>
        <div className="field"><label className="label">Note (optional)</label><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shared with both salespeople" /></div>
      </div>
    </Modal>
  );
}

export default function Transfers() {
  const { db, me, role, t, sec, can, scopeOf, userName } = useStore();
  const [modal, setModal] = useState(null);
  const teamOf = (id) => db.users.find((u) => u.id === id)?.teamId;
  const sc = scopeOf('transfers');
  const rows = db.transfers.filter((x) => sc === 'all' || (sc === 'team' ? teamOf(x.fromId) === me.teamId || teamOf(x.toId) === me.teamId : [x.fromId, x.toId, x.requestedBy].includes(me.id)));
  const pending = rows.filter((t) => t.status === 'Pending');
  return (
    <div>
      <PageHead title={t('transfers')} sub={{ sales: 'Ask to hand a record to a colleague. Your manager approves it.', manager: 'Approve requests from your team, or move records yourself.', admin: 'Every transfer across the company. Managers normally approve these.' }[role]}>
        {can('transfers', 'create') && <Btn kind="primary" icon="ArrowRightLeft" onClick={() => setModal({ kind: 'new' })}>{{ sales: 'Request transfer', manager: 'Move a record', admin: 'Reassign a record' }[role]}</Btn>}
      </PageHead>
      {sec('transfers', 'kpis') && <div className="g3" style={{ marginBottom: 14 }}>
        <Kpi label="Waiting for approval" value={pending.length} icon="Hourglass" />
        <Kpi label="Approved" value={rows.filter((t) => t.status === 'Approved').length} icon="CheckCircle2" />
        <Kpi label="Rejected" value={rows.filter((t) => t.status === 'Rejected').length} icon="XCircle" />
      </div>}
      <DataTable rows={rows} exportName="transfers" initialSort={{ k: 'requestedAt', dir: 'desc' }}
        statusTabs={{ options: ['Pending', 'Approved', 'Rejected'], get: (t) => t.status }}
        filters={[{ k: 'type', label: 'Type', get: (t) => t.recordType, options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) }]}
        columns={[
          { k: 'recordLabel', label: 'Record', render: (t) => <div><Link className="strong" to={linkOf(t)}>{t.recordLabel}</Link><div className="small muted">{TYPE_LABEL[t.recordType]}{t.includeRelated ? ' · with related records' : ''}</div></div> },
          { k: 'route', label: 'From → To', sort: false, value: (t) => `${userName(t.fromId)} to ${userName(t.toId)}`, render: (t) => <span className="row"><UserChip id={t.fromId} /><ArrowRight size={14} color="var(--ink-3)" /><UserChip id={t.toId} /></span> },
          { k: 'reason', label: 'Reason', render: (t) => <div style={{ maxWidth: 260 }}>{t.reason}{t.note && <div className="small muted">Decision note: {t.note}</div>}</div> },
          { k: 'status', label: 'Status', render: (t) => <Badge>{t.status}</Badge> },
          { k: 'requestedAt', label: 'Requested', nowrap: true, render: (t) => <span title={fmtDate(t.requestedAt)}>{relTime(t.requestedAt)}</span> },
          { k: 'actions', label: '', sort: false, stop: true, value: () => '', render: (t) => t.status === 'Pending' && can('transfers', 'approve') && (
            <span className="row" style={{ justifyContent: 'flex-end' }}>
              <Btn sm kind="primary" onClick={() => setModal({ kind: 'decide', t, approve: true })}>Approve</Btn>
              <Btn sm onClick={() => setModal({ kind: 'decide', t, approve: false })}>Reject</Btn>
            </span>
          ) },
        ]} />
      {modal?.kind === 'new' && <NewTransfer onClose={() => setModal(null)} />}
      {modal?.kind === 'decide' && <Decide t={modal.t} approve={modal.approve} onClose={() => setModal(null)} />}
    </div>
  );
}
