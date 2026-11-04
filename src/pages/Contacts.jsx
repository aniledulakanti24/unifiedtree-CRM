import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, Mail, Phone, Search, SlidersHorizontal, Tag, Thermometer, User } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Confirm, Drawer, Empty, PageHead, RecordModal, UserChip } from '../ui';
import { ContactActions, personOfContact } from '../comms';
import { Chatter, RecordQuickCreate, TransferDialog, contactFields, relatedOf } from '../shared';
import { addDays, downloadCsv, money, relTime } from '../util';

const STATUS_COLOR = { Cold: 'var(--s1)', Warm: 'var(--s4)', Hot: 'var(--s8)', 'In contract': 'var(--s3)' };
const PERIODS = [['Today', 0], ['This week', 7], ['This month', 30], ['Before last month', -60]];

export default function Contacts() {
  const { db, me, role, t, sec, scope, companyName, update, remove, can, toast, optionsOf } = useStore();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get('open'));
  const [q, setQ] = useState('');
  const [f, setF] = useState({ status: '', tag: '', period: null, mine: false, tasks: false });
  const [modal, setModal] = useState(null);
  const [sort, setSort] = useState('activity');
  const [limit, setLimit] = useState(25);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params]);

  const rows = scope(db.contacts);
  const openTasks = useMemo(() => new Set(db.activities.filter((a) => a.relatedType === 'contact' && a.status !== 'done').map((a) => a.relatedId)), [db.activities]);
  const tags = [...new Set(rows.flatMap((c) => c.tags || []))].sort();
  const filtered = rows.filter((c) => {
    if (f.status && c.status !== f.status) return false;
    if (f.tag && !(c.tags || []).includes(f.tag)) return false;
    if (f.mine && c.ownerId !== me.id) return false;
    if (f.tasks && !openTasks.has(c.id)) return false;
    if (f.period != null) {
      const d = c.lastActivity?.slice(0, 10) || '';
      if (f.period === 0 && d !== addDays(0)) return false;
      if (f.period > 0 && d < addDays(-f.period)) return false;
      if (f.period < 0 && d >= addDays(f.period)) return false;
    }
    if (q && !`${c.first} ${c.last} ${c.email} ${companyName(c.companyId)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (sort === 'name' ? a.last.localeCompare(b.last) : (b.lastActivity || '').localeCompare(a.lastActivity || '')));

  const c = rows.find((x) => x.id === openId);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: p[k] === v ? (k === 'period' ? null : '') : v })); setLimit(25); };
  const exportAll = () => downloadCsv('contacts', [['First', 'Last', 'Title', 'Company', 'Email', 'Phone', 'Status'], ...filtered.map((x) => [x.first, x.last, x.title, companyName(x.companyId), x.email, x.phone, x.status])]);
  const deals = c ? db.deals.filter((d) => d.contactId === c.id) : [];

  return (
    <div>
      <PageHead title={t('contacts')} sub={`${filtered.length} of ${rows.length} people`}>
        {can('data', 'export') && <Btn icon="Download" onClick={exportAll}>Export</Btn>}
        {can('contacts', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setModal('new')}>New contact</Btn>}
      </PageHead>
      <div className="split">
        {sec('contacts', 'filters') && <div className="filter-rail filter-rail-wrap card card-b">
          <div><div className="filter-title"><CalendarClock size={13} />Last activity</div>{PERIODS.map(([l, v]) => <button key={l} type="button" className={`filter-opt ${f.period === v ? 'on' : ''}`} onClick={() => set('period', v)}>{l}</button>)}</div>
          <div><div className="filter-title"><Thermometer size={13} />Status</div>{optionsOf('contactStatus').map((s) => <button key={s} type="button" className={`filter-opt ${f.status === s ? 'on' : ''}`} onClick={() => set('status', s)}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: (STATUS_COLOR[s] || 'var(--ink-3)'), marginInlineEnd: 7 }} />{s}</button>)}</div>
          <div><div className="filter-title"><Tag size={13} />Tags</div>{tags.map((t) => <button key={t} type="button" className={`filter-opt ${f.tag === t ? 'on' : ''}`} onClick={() => set('tag', t)}>{t}</button>)}</div>
          <div>
            <div className="filter-title"><SlidersHorizontal size={13} />More</div>
            {role === 'manager' && <button type="button" className={`filter-opt ${f.mine ? 'on' : ''}`} onClick={() => setF((p) => ({ ...p, mine: !p.mine }))}>Managed by me</button>}
            <button type="button" className={`filter-opt ${f.tasks ? 'on' : ''}`} onClick={() => setF((p) => ({ ...p, tasks: !p.tasks }))}>With pending tasks</button>
          </div>
        </div>}
        <div className="card">
          <div className="tb-toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search contacts" placeholder="Name, company…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="select tb-filter status-mobile" aria-label="Status" value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}><option value="">Status: All</option>{optionsOf('contactStatus').map((s) => <option key={s}>{s}</option>)}</select>
            <select className="select tb-filter" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="activity">Last activity</option><option value="name">Last name</option></select>
          </div>
          {filtered.slice(0, limit).map((x) => (
            <button key={x.id} type="button" onClick={() => setOpenId(x.id)} className="row" style={{ width: '100%', gap: 12, padding: '10px 14px', border: 0, borderTop: '1px solid var(--line)', background: x.id === openId ? 'var(--brand-soft)' : 'none', textAlign: 'start' }}>
              <Avatar name={`${x.first} ${x.last}`} size={36} />
              <span className="grow">
                <div className="strong trunc">{x.first} {x.last}</div>
                <div className="small muted trunc">{x.title} at {companyName(x.companyId)}</div>
              </span>
              <span className="row wrap" style={{ justifyContent: 'flex-end', gap: 4 }}>{(x.tags || []).map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>)}</span>
              <span className="small muted nowrap" style={{ width: 70, textAlign: 'end' }}>{relTime(x.lastActivity)}</span>
              <span title={x.status} aria-label={x.status} style={{ width: 9, height: 9, borderRadius: 5, background: (STATUS_COLOR[x.status] || 'var(--ink-3)'), flexShrink: 0 }} />
            </button>
          ))}
          {!filtered.length && <Empty icon="UserSearch" text="No contacts match these filters." />}
          {filtered.length > limit && <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line)' }}><Btn onClick={() => setLimit(limit + 25)}>Show more</Btn></div>}
        </div>
      </div>

      {c && (
        <Drawer title={`${c.first} ${c.last}`} onClose={() => setOpenId(null)} actions={<>{can('transfers', 'create') && <Btn sm icon="ArrowRightLeft" onClick={() => setModal('transfer')}>Transfer</Btn>}{can('contacts', 'edit') && <Btn sm icon="Pencil" onClick={() => setModal('edit')}>Edit</Btn>}{can('contacts', 'delete') && <Btn sm kind="danger" icon="Trash2" aria-label="Delete" onClick={() => setModal('delete')} />}</>}>
          <div className="stack">
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={`${c.first} ${c.last}`} size={52} />
              <div className="grow"><div className="strong" style={{ fontSize: 15 }}>{c.title}</div><Link to={`/customers/${c.companyId}`}>{companyName(c.companyId)}</Link><div style={{ marginTop: 4 }}><Badge>{c.status}</Badge></div></div>
            </div>
            <div className="row wrap">
              <a className="btn sm" href={`mailto:${c.email}`}><Mail size={14} />Email</a>
              <ContactActions showLabels person={personOfContact(c, companyName(c.companyId))} />
            </div>
            <dl className="dl">
              <dt>Email</dt><dd>{c.email}</dd>
              <dt>Phone</dt><dd>{c.phone || '—'}</dd>
              <dt>Account manager</dt><dd><UserChip id={c.ownerId} /></dd>
              <dt>Last activity</dt><dd>{relTime(c.lastActivity)}</dd>
              <dt>Tags</dt><dd className="row wrap">{c.tags?.length ? c.tags.map((t) => <Badge key={t} tone="violet" dot={false}>{t}</Badge>) : '—'}</dd>
              <dt>Background</dt><dd>{c.notes || '—'}</dd>
            </dl>
            {sec('contacts', 'deals') && <div>
              <div className="filter-title">Open deals ({deals.filter((d) => d.status === 'open').length})</div>
              {deals.filter((d) => d.status === 'open').map((d) => <div className="dashlet" key={d.id}><Link className="grow trunc" to={`/pipeline/${d.id}`}>{d.title}</Link><span className="num strong">{money(d.value)}</span></div>)}
              {!deals.some((d) => d.status === 'open') && <div className="sub muted">None.</div>}
            </div>}
            {sec('contacts', 'history') && <Chatter related={relatedOf('contact', c)} />}
          </div>
        </Drawer>
      )}
      {modal === 'new' && <RecordQuickCreate kind="contact" onClose={() => setModal(null)} />}
      {modal === 'transfer' && c && <TransferDialog record={relatedOf('contact', c)} onClose={() => setModal(null)} />}
      {modal === 'edit' && c && <RecordModal size="lg" title="Edit contact" fields={contactFields({ owner: role !== 'sales' })} initial={c} onClose={() => setModal(null)} onSave={(v) => { const { id, ...rest } = v; update('contacts', c.id, rest); toast('Contact saved'); }} />}
      {modal === 'delete' && c && <Confirm title="Delete contact?" text={`${c.first} ${c.last} will be removed for everyone.`} onClose={() => setModal(null)} onConfirm={() => { remove('contacts', c.id); setOpenId(null); toast('Contact deleted'); }} />}
    </div>
  );
}
