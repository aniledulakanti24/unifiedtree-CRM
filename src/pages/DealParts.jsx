// Pieces of the deal board and deal record: stage rules, the next step, people, products and stage history.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Empty, FieldInput, Icon, ListField, Modal } from '../ui';
import { ActivityDialog, relatedOf } from '../shared';
import { REQUIRED_OPTIONS, gateMissing, nextActivity } from '../engine';
import { addDays, docMoney, fmtDate, fmtDT, inDoc, money, rateFor, round2, sum, today, uid } from '../util';

// Shown when a stage asks for details the deal doesn't have yet.
export function StageGate({ deal, stage, missing, onDone, onClose }) {
  const { db, me, update, create, moveDeal, toast } = useStore();
  const contacts = db.contacts.filter((c) => c.companyId === deal.companyId);
  const [v, setV] = useState({ value: deal.value ? round2(inDoc(deal, deal.value)) : '', closeDate: deal.closeDate || addDays(30), contactId: contacts[0]?.id || '', source: deal.source || '', nextStep: '' });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const ready = missing.every((k) => (k === 'value' ? Number(v.value) > 0 : !!String(v[k]).trim()));
  const save = () => {
    const patch = {};
    missing.filter((k) => k !== 'nextStep').forEach((k) => { patch[k] = k === 'value' ? Number(v.value) / rateFor(deal) : v[k]; });
    if (Object.keys(patch).length) update('deals', deal.id, patch);
    if (missing.includes('nextStep')) create('activities', { typeId: db.activityTypes[0]?.id, summary: v.nextStep.trim(), due: addDays(2), ownerId: deal.ownerId || me.id, note: '', status: 'todo', priority: 'Medium', tag: 'Sales', relatedType: 'deal', relatedId: deal.id, relatedLabel: deal.title });
    moveDeal(deal.id, stage.id);
    toast(`Moved to ${stage.name}`);
    onDone?.();
    onClose();
  };
  const label = (k) => REQUIRED_OPTIONS.find(([x]) => x === k)?.[1];
  return (
    <Modal size="sm" title={`Before moving to ${stage.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ready} onClick={save}>Save and move</Btn></>}>
      <div className="stack">
        <p className="sub" style={{ margin: 0 }}>This stage needs a few details on “{deal.title}”.</p>
        {missing.map((k) => (
          <div className="field" key={k}>
            <label className="label" htmlFor={`gate-${k}`}>{label(k)}<span className="req"> *</span></label>
            {k === 'value' && <input id={`gate-${k}`} className="input" type="number" min="1" value={v.value} onChange={(e) => set(k, e.target.value)} />}
            {k === 'closeDate' && <input id={`gate-${k}`} className="input" type="date" value={v.closeDate} onChange={(e) => set(k, e.target.value)} />}
            {k === 'contactId' && (contacts.length
              ? <select id={`gate-${k}`} className="select" value={v.contactId} onChange={(e) => set(k, e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.id}>{c.first} {c.last}</option>)}</select>
              : <span className="error-text">This customer has no contacts yet. <Link to={`/customers/${deal.companyId}`}>Add one first.</Link></span>)}
            {k === 'source' && <ListField f={{ k, label: 'Source', ariaLabel: 'Source', type: 'select', list: 'leadSource', blankLabel: 'Select a source…' }} value={v.source} onChange={(_, x) => set(k, x)} />}
            {k === 'nextStep' && <input id={`gate-${k}`} className="input" placeholder="For example, send the proposal" value={v.nextStep} onChange={(e) => set(k, e.target.value)} />}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// Moves a deal, stopping first if the stage asks for something.
export function useStageMove() {
  const { db, scope, moveDeal, toast } = useStore();
  const [gate, setGate] = useState(null);
  const tryMove = (deal, stageId) => {
    const stage = db.stages.find((s) => s.id === stageId);
    if (!stage || (deal.stage === stageId && deal.status === 'open')) return;
    const missing = gateMissing(stage, deal, scope(db.activities, 'pipeline'));
    if (missing.length) { setGate({ deal, stage, missing }); return; }
    moveDeal(deal.id, stageId);
    toast(stageId === 'won' ? `Won: ${deal.title}` : `Moved to ${stage.name}`);
  };
  const gateView = gate && <StageGate {...gate} onClose={() => setGate(null)} />;
  return { tryMove, gateView };
}

export function NextStep({ deal }) {
  const { db, can, scope, update, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const next = nextActivity(deal.id, scope(db.activities, 'pipeline'));
  const late = next && next.due < today();
  if (deal.status !== 'open') return null;
  return (
    <section className={`card next-step ${next ? (late ? 'late' : '') : 'none'}`}>
      <span className="stat-ico"><Icon name={next ? 'CalendarCheck' : 'CalendarX'} size={15} /></span>
      <div className="grow" style={{ minWidth: 180 }}>
        <div className="small muted">Next step</div>
        <div className="strong">{next ? next.summary : 'Nothing planned for this deal'}</div>
        {next && <div className="small" style={{ color: late ? 'var(--bad)' : 'var(--ink-3)' }}>{late ? 'Overdue, was due' : 'Due'} {fmtDate(next.due)}</div>}
      </div>
      {next && can('tasks', 'edit') && <Btn icon="Check" onClick={() => { update('activities', next.id, { status: 'done' }); toast('Step done. What happens next?'); setAdding(true); }}>Done</Btn>}
      {can('tasks', 'create') && <Btn kind={next ? undefined : 'primary'} icon="Plus" onClick={() => setAdding(true)}>Plan a step</Btn>}
      {adding && <ActivityDialog related={relatedOf('deal', deal)} onClose={() => setAdding(false)} />}
    </section>
  );
}

export function DealPeople({ deal, canEdit }) {
  const { db, can, update, toast } = useStore();
  const [pick, setPick] = useState('');
  const [role, setRole] = useState('');
  const contacts = db.contacts.filter((c) => c.companyId === deal.companyId);
  const people = deal.people || [];
  const listed = [...new Set([deal.contactId, ...people.map((p) => p.contactId)].filter(Boolean))];
  const roleOf = (id) => people.find((p) => p.contactId === id)?.role;
  const add = () => {
    if (!pick) return;
    update('deals', deal.id, { people: [...people.filter((p) => p.contactId !== pick), { contactId: pick, role }], ...(deal.contactId ? {} : { contactId: pick }) });
    setPick(''); setRole(''); toast('Added to this deal');
  };
  const free = contacts.filter((c) => !listed.includes(c.id));
  return (
    <div className="stack-s" style={{ marginTop: 10 }}>
      {!listed.length && <Empty icon="UsersRound" text="Nobody is linked to this deal yet." />}
      {listed.map((id) => {
        const c = db.contacts.find((x) => x.id === id);
        if (!c) return null;
        return (
          <div className="dashlet" key={id}>
            <div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{c.first} {c.last}{id === deal.contactId && <Badge tone="info" dot={false}> Main contact</Badge>}</div><div className="small muted trunc">{[roleOf(id), c.title].filter(Boolean).join(' · ') || c.email}</div></div>
            {canEdit && id !== deal.contactId && <Btn sm onClick={() => update('deals', deal.id, { contactId: id })}>Make main</Btn>}
            {canEdit && <Btn sm kind="ghost" icon="X" aria-label={`Remove ${c.first} ${c.last}`} onClick={() => update('deals', deal.id, { people: people.filter((p) => p.contactId !== id), ...(id === deal.contactId ? { contactId: '' } : {}) })} />}
          </div>
        );
      })}
      {canEdit && (free.length > 0
        ? <div className="row wrap" style={{ marginTop: 8 }}>
          <select className="select tb-filter" aria-label="Contact to add" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Add a contact…</option>{free.map((c) => <option key={c.id} value={c.id}>{c.first} {c.last}</option>)}</select>
          <div style={{ minWidth: 170 }}><ListField f={{ k: 'role', label: 'Role', ariaLabel: 'Their role in this deal', type: 'select', list: 'stakeholderRole', blankLabel: 'Their role…' }} value={role} onChange={(_, x) => setRole(x)} /></div>
          <Btn icon="Plus" disabled={!pick} onClick={add}>Add</Btn>
        </div>
        : <div className="small muted">Everyone at this customer is on the deal. {can('contacts', 'create') && <Link to={`/customers/${deal.companyId}`}>Add a contact</Link>}</div>)}
    </div>
  );
}

export function DealProducts({ deal, canEdit }) {
  const { db, update, toast } = useStore();
  const items = deal.items || [];
  const total = sum(items, (x) => x.qty * x.price);
  const save = (next) => update('deals', deal.id, { items: next });
  const add = (id) => {
    const p = db.products.find((x) => x.id === id);
    if (p) save([...items, { key: uid('li'), productId: p.id, name: p.name, qty: 1, price: p.price }]);
  };
  return (
    <div className="stack-s" style={{ marginTop: 10 }}>
      {!items.length && <Empty icon="Package" text="No products on this deal yet." />}
      {items.length > 0 && (
        <div className="tb-wrap"><table className="table"><thead><tr><th>Product</th><th style={{ width: 90 }}>Qty</th><th className="r" style={{ width: 120 }}>Price</th><th className="r">Total</th><th /></tr></thead><tbody>
          {items.map((x, i) => (
            <tr key={x.key || i}>
              <td>{x.name}</td>
              <td><input className="input" type="number" min="1" aria-label={`Quantity of ${x.name}`} disabled={!canEdit} defaultValue={x.qty} onBlur={(e) => save(items.map((y, n) => (n === i ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y)))} /></td>
              <td className="r"><input className="input" type="number" min="0" aria-label={`Price of ${x.name}`} disabled={!canEdit} defaultValue={round2(inDoc(deal, x.price))} onBlur={(e) => save(items.map((y, n) => (n === i ? { ...y, price: (Number(e.target.value) || 0) / rateFor(deal) } : y)))} /></td>
              <td className="r num">{docMoney(deal, x.qty * x.price)}</td>
              <td>{canEdit && <Btn sm kind="ghost" icon="X" aria-label={`Remove ${x.name}`} onClick={() => save(items.filter((_, n) => n !== i))} />}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      <div className="row wrap between">
        {canEdit ? <select className="select tb-filter" aria-label="Add a product" value="" onChange={(e) => add(e.target.value)}><option value="">Add a product…</option>{db.products.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <span />}
        {items.length > 0 && <span className="row"><strong className="num">{docMoney(deal, total)}</strong>{canEdit && total !== deal.value && <Btn sm onClick={() => { update('deals', deal.id, { value: total }); toast('Expected revenue updated'); }}>Use as expected revenue</Btn>}</span>}
      </div>
      {items.length > 0 && <div className="small muted">New quotes from this deal start with these products.</div>}
    </div>
  );
}

export function StageHistory({ deal }) {
  const { db, userName } = useStore();
  const log = deal.stageLog || [];
  const name = (id) => (id === 'lost' ? 'Lost' : db.stages.find((s) => s.id === id)?.name || id);
  const rows = log.map((x, i) => ({ ...x, days: Math.max(0, Math.floor((new Date(log[i + 1]?.at || Date.now()) - new Date(x.at)) / 864e5)), current: i === log.length - 1 }));
  if (!rows.length) return <div style={{ marginTop: 10 }}><Empty icon="History" text="Stage changes from now on will appear here." /></div>;
  return (
    <div className="stage-log">
      {[...rows].reverse().map((r) => <div key={r.at} className="stage-log-row"><span className="stage-dot" /><div className="grow" style={{ minWidth: 0 }}><div className="strong">{name(r.stage)}</div><div className="small muted">{fmtDT(r.at)} · {userName(r.by)}</div></div><span className="small num nowrap">{r.current && deal.status === 'open' ? `${r.days} days so far` : `${r.days} days`}</span></div>)}
    </div>
  );
}
