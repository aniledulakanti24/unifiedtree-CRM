import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Empty, FormFields, Kpi, Modal, Pills } from '../ui';
import { Bars } from '../charts';
import { aiRules, phoneKey, questionsOf } from '../aiVoice';
import { fmtDuration } from '../comms';
import { fmtDT, fmtShort, iso, num, pct } from '../util';

// The questions an agent asks, what it does with the answers, and what it can answer itself.
export function ScriptEditor({ agent, onClose }) {
  const { update, toast } = useStore();
  const [rows, setRows] = useState(() => questionsOf(agent));
  const [faqs, setFaqs] = useState(() => agent.faqs || []);
  const [error, setError] = useState('');
  const setRow = (i, k, x) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: x } : r)));
  const setFaq = (i, k, x) => setFaqs(faqs.map((r, n) => (n === i ? { ...r, [k]: x } : r)));
  const move = (i, by) => { const next = [...rows]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); setRows(next); };
  const save = () => {
    const clean = rows.map((r) => ({ text: r.text.trim(), saveAs: (r.saveAs || '').trim() })).filter((r) => r.text);
    if (!clean.length) { setError('Add at least one question.'); return; }
    const cleanFaqs = faqs.map((f) => ({ keywords: (f.keywords || '').trim(), answer: (f.answer || '').trim() })).filter((f) => f.keywords && f.answer);
    update('aiAgents', agent.id, { questions: clean, faqs: cleanFaqs });
    toast('Script saved');
    onClose();
  };
  return (
    <Modal size="lg" title={`Script: ${agent.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save script</Btn></>}>
      <div className="stack">
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Questions, in order</div>
          <div className="stack-s">
            {rows.map((r, i) => (
              <div key={i} className="ai-script-row">
                <input className="input" aria-label={`Question ${i + 1}`} placeholder="What the agent asks" value={r.text} onChange={(e) => { setRow(i, 'text', e.target.value); setError(''); }} />
                <input className="input" aria-label={`Save answer ${i + 1} as`} placeholder="Save answer as, such as Team size" value={r.saveAs || ''} onChange={(e) => setRow(i, 'saveAs', e.target.value)} />
                <span className="row" style={{ gap: 2 }}>
                  <Btn sm kind="ghost" icon="ArrowUp" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Btn sm kind="ghost" icon="ArrowDown" aria-label={`Move question ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                  <Btn sm kind="ghost" icon="X" aria-label={`Remove question ${i + 1}`} onClick={() => setRows(rows.filter((_, n) => n !== i))} />
                </span>
              </div>
            ))}
            <div><Btn sm icon="Plus" onClick={() => setRows([...rows, { text: '', saveAs: '' }])}>Add question</Btn></div>
          </div>
        </div>
        <div>
          <div className="label">Questions it can answer</div>
          <div className="small muted" style={{ marginBottom: 6 }}>If the person says one of these words, the agent gives this answer and goes back to its script.</div>
          <div className="stack-s">
            {faqs.map((f, i) => (
              <div key={i} className="ai-script-row">
                <input className="input" aria-label={`Answer ${i + 1} words`} placeholder="Words, such as price, cost" value={f.keywords || ''} onChange={(e) => setFaq(i, 'keywords', e.target.value)} />
                <input className="input" aria-label={`Answer ${i + 1}`} placeholder="What the agent says" value={f.answer || ''} onChange={(e) => setFaq(i, 'answer', e.target.value)} />
                <Btn sm kind="ghost" icon="X" aria-label={`Remove answer ${i + 1}`} onClick={() => setFaqs(faqs.filter((_, n) => n !== i))} />
              </div>
            ))}
            <div><Btn sm icon="Plus" onClick={() => setFaqs([...faqs, { keywords: '', answer: '' }])}>Add answer</Btn></div>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    </Modal>
  );
}

export function Reports({ calls }) {
  const { db } = useStore();
  const [span, setSpan] = useState('30 days');
  const since = span === 'All time' ? '' : new Date(Date.now() - (span === '30 days' ? 30 : 7) * 864e5).toISOString();
  const list = calls.filter((c) => c.at >= since);
  const answered = (l) => l.filter((c) => c.outcome !== 'No answer');
  const interested = (l) => l.filter((c) => c.outcome === 'Interested');
  const avg = (l) => (l.length ? l.reduce((a, c) => a + (c.duration || 0), 0) / l.length : 0);
  const days = Array.from({ length: 14 }, (_, i) => iso(new Date(Date.now() - (13 - i) * 864e5)));
  const trend = days.map((d) => { const day = list.filter((c) => c.at.slice(0, 10) === d); return { label: fmtShort(d), Calls: day.length, Interested: interested(day).length }; });
  const outcomes = ['Interested', 'Call back later', 'Asked for a person', 'Not interested', 'Do not call', 'No answer'].map((o) => ({ label: o, Calls: list.filter((c) => c.outcome === o).length }));
  const agents = [...new Set(list.map((c) => c.agentId))].map((id) => {
    const mine = list.filter((c) => c.agentId === id);
    const a = answered(mine);
    return { id, name: mine[0]?.agentName || db.aiAgents.find((x) => x.id === id)?.name || 'Deleted agent', calls: mine.length, answerRate: mine.length ? (a.length / mine.length) * 100 : 0, interestRate: a.length ? (interested(mine).length / a.length) * 100 : 0, handover: mine.filter((c) => c.outcome === 'Asked for a person').length, length: avg(a), flagged: mine.filter((c) => c.review === 'Needs work').length };
  });
  const a = answered(list);
  return (
    <div className="stack">
      <div><Pills value={span} onChange={setSpan} options={['7 days', '30 days', 'All time']} /></div>
      <div className="g4">
        <Kpi label="Answer rate" value={pct(list.length ? (a.length / list.length) * 100 : 0)} note={`${a.length} of ${list.length}`} icon="PhoneIncoming" />
        <Kpi label="Interested" value={pct(a.length ? (interested(list).length / a.length) * 100 : 0)} note="Of answered calls" icon="ThumbsUp" />
        <Kpi label="Handed to a person" value={num(list.filter((c) => c.outcome === 'Asked for a person').length)} icon="Users" />
        <Kpi label="Average length" value={fmtDuration(Math.round(avg(a)))} icon="Timer" />
      </div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <Card title="Calls over 14 days"><Bars height={220} format={num} data={trend} series={[{ key: 'Calls', name: 'Calls' }, { key: 'Interested', name: 'Interested', color: 'var(--s3)' }]} /></Card>
        <Card title="How calls ended"><Bars height={220} horizontal format={num} data={outcomes} series={[{ key: 'Calls', name: 'Calls' }]} /></Card>
      </div>
      <DataTable key={span} rows={agents} exportName="ai-agent-performance" noSearch initialSort={{ k: 'calls', dir: 'desc' }}
        columns={[
          { k: 'name', label: 'Agent', render: (r) => <span className="strong">{r.name}</span> },
          { k: 'calls', label: 'Calls', align: 'r' },
          { k: 'answerRate', label: 'Answered', align: 'r', render: (r) => pct(r.answerRate) },
          { k: 'interestRate', label: 'Interested', align: 'r', render: (r) => pct(r.interestRate) },
          { k: 'handover', label: 'To a person', align: 'r' },
          { k: 'length', label: 'Average length', align: 'r', render: (r) => fmtDuration(Math.round(r.length)) },
          { k: 'flagged', label: 'Needs work', align: 'r' },
        ]} />
    </div>
  );
}

export function RulesTab() {
  const { db, can, create, remove, updateSettings, toast } = useStore();
  const canEdit = can('aiVoice', 'edit');
  const [v, setV] = useState(() => aiRules(db.settings));
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState({ name: '', phone: '' });
  const [del, setDel] = useState(null);
  const list = db.aiDnc || [];
  const addNumber = () => {
    if (phoneKey(person.phone).length < 6) { toast('Enter a phone number.', 'bad'); return; }
    if (list.some((x) => phoneKey(x.phone) === phoneKey(person.phone))) { toast('That number is already on the list.', 'bad'); return; }
    create('aiDnc', { name: person.name.trim() || 'Added by hand', phone: person.phone.trim(), source: 'Added by hand' });
    setPerson({ name: '', phone: '' });
    setAdding(false);
    toast('Number added to the list');
  };
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Calling rules" sub="Campaigns follow these. Laws differ by country, so check yours, such as TCPA, GDPR or TRAI.">
        <div className="stack">
          <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} fields={[
            { k: 'from', label: 'Call from', type: 'time' },
            { k: 'to', label: 'Until', type: 'time', hint: "In the customer's time, if their time zone is set. Otherwise this device's." },
            { k: 'retry', label: 'Try again if no answer', type: 'select', noBlank: true, options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Once' }, { value: 2, label: 'Twice' }] },
            { k: 'weekends', label: 'Weekends', type: 'check', text: 'Call at weekends' },
            { k: 'disclose', label: 'Honesty', type: 'check', text: 'Agents must say they are an AI in their opening line', full: true },
          ]} />
          {canEdit && <div><Btn kind="primary" onClick={() => { updateSettings({ aiRules: { ...v, retry: Number(v.retry) || 0 } }); toast('Calling rules saved'); }}>Save rules</Btn></div>}
        </div>
      </Card>
      <Card title="Do not call" sub="Agents never call these numbers. Anyone who asks to stop is added here automatically." action={canEdit && <Btn icon="Plus" onClick={() => setAdding(true)}>Add number</Btn>} pad={false}>
        {list.length ? <div className="tb-wrap"><table className="table"><thead><tr><th>Person</th><th>Phone</th><th>Added</th><th /></tr></thead>
          <tbody>{list.map((x) => <tr key={x.id}><td className="strong">{x.name}<div className="small muted">{x.source}</div></td><td>{x.phone}</td><td className="small nowrap">{fmtDT(x.createdAt)}</td><td className="r">{canEdit && <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${x.phone}`} onClick={() => setDel(x)} />}</td></tr>)}</tbody></table></div>
          : <Empty icon="PhoneOff" text="No numbers on the list." />}
      </Card>
      {adding && <Modal size="sm" title="Add to do not call" onClose={() => setAdding(false)} footer={<><Btn onClick={() => setAdding(false)}>Cancel</Btn><Btn kind="primary" onClick={addNumber}>Add</Btn></>}>
        <div className="stack">
          <div className="field"><label className="label" htmlFor="dnc-phone">Phone number</label><input id="dnc-phone" className="input" type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor="dnc-name">Name</label><input id="dnc-name" className="input" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></div>
        </div>
      </Modal>}
      {del && <Confirm title={`Remove ${del.phone}?`} text="Agents could call this number again." confirmLabel="Remove" onClose={() => setDel(null)} onConfirm={() => { remove('aiDnc', del.id); toast('Number removed'); }} />}
    </div>
  );
}

export function CallReview({ call }) {
  const { can, update, toast } = useStore();
  const [note, setNote] = useState(call.reviewNote || '');
  const canEdit = can('aiVoice', 'edit');
  const mark = (review) => { update('aiCalls', call.id, { review, reviewNote: note.trim() }); toast('Review saved'); };
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>Review this call</div>
      {call.review && <div style={{ marginBottom: 6 }}><Badge tone={call.review === 'Good' ? 'good' : 'warn'}>{call.review}</Badge></div>}
      {canEdit ? <div className="stack-s">
        <textarea className="textarea" aria-label="Review note" placeholder="What should the agent do differently?" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row"><Btn sm icon="ThumbsUp" onClick={() => mark('Good')}>Good call</Btn><Btn sm icon="ThumbsDown" onClick={() => mark('Needs work')}>Needs work</Btn></div>
      </div> : call.reviewNote && <div className="small">{call.reviewNote}</div>}
    </div>
  );
}
