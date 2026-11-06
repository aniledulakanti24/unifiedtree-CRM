// The Ask panel, and small pieces that show win chance, customer health and writing help.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useStore } from './store';
import { Badge, Btn, Card, Drawer, Icon } from './ui';
import { Bars } from './charts';
import { moneyK } from './util';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
import { SUGGESTIONS, answer, customerHealth, dealScore } from './assistant';
import { DRAFT_KINDS, draftEmail, rewrite } from './assistant';

export function AssistantPanel({ onClose, history, setHistory }) {
  const store = useStore();
  const { me, role, can, create, sendEmail, toast, moveDeal, update } = store;
  const [listening, setListening] = useState(false);
  const [q, setQ] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [history.length]);
  const ask = (text) => {
    const t = text.trim();
    if (!t) return;
    setHistory((h) => {
      const focus = [...h].reverse().find((x) => x.a.focus)?.a.focus;
      return [...h, { id: h.length, q: t, a: answer(t, { ...store, focus }) }];
    });
    setQ('');
  };
  const listen = () => {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onerror = () => toast("The microphone isn't available. You can type instead.", 'bad');
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const apply = (m) => {
    const x = m.a.action;
    if (x.kind === 'stage') moveDeal(x.id, x.stage); else update(x.entity, x.id, x.patch);
    doneAction(m.id, { applied: true, text: `Done: ${x.title}.` });
    toast('Change saved');
  };
  const undo = (m) => {
    const x = m.a.action;
    if (x.kind === 'stage') moveDeal(x.id, x.before); else update(x.entity, x.id, x.before);
    doneAction(m.id, { text: 'Undone.' });
    toast('Change undone');
  };
  const doneAction = (id, patch) => setHistory((h) => h.map((x) => (x.id === id ? { ...x, done: patch } : x)));
  return (
    <Drawer title="Ask the assistant" onClose={onClose}>
      <div className="as-wrap">
        <p className="small muted" style={{ margin: 0 }}>Simulated: fixed rules over your own records, not a real AI model. It only sees what you're allowed to see.</p>
        {!history.length && (
          <div className="stack-s">
            <div className="strong">Hi {me.name.split(' ')[0]}. Try asking:</div>
            <div className="as-chips">{(SUGGESTIONS[role] || SUGGESTIONS.sales).map((x) => <button key={x} type="button" className="wa-chip" onClick={() => ask(x)}>{x}</button>)}</div>
          </div>
        )}
        {history.map((m) => (
          <div key={m.id} className="stack-s">
            <div className="as-q">{m.q}</div>
            <div className="as-a">
              <div>{m.a.text}</div>
              {m.a.rows?.length > 0 && <div className="as-rows">{m.a.rows.map((r, i) => {
                const body = <><span className="grow" style={{ minWidth: 0 }}><span className="strong trunc" style={{ display: 'block' }}>{r.title}</span>{r.sub && <span className="small muted trunc" style={{ display: 'block' }}>{r.sub}</span>}</span>{r.value && <span className="num small strong nowrap">{r.value}</span>}</>;
                return r.to ? <Link key={i} to={r.to} className="as-row" onClick={onClose}>{body}</Link> : <div key={i} className="as-row">{body}</div>;
              })}</div>}
              {m.a.chart?.length > 0 && <div style={{ marginTop: 8 }}><Bars height={200} horizontal format={moneyK} data={m.a.chart} series={[{ key: 'Value', name: 'Value' }]} /></div>}
              {m.a.action?.type === 'change' && (m.done
                ? <div className="row" style={{ marginTop: 6 }}><span className="small muted grow">{m.done.text}</span>{m.done.applied && <Btn sm icon="Undo2" onClick={() => undo(m)}>Undo</Btn>}</div>
                : <div className="as-card"><div className="strong">{m.a.action.title}</div><div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{m.a.action.detail}</div><div className="row" style={{ marginTop: 6 }}><Btn sm kind="primary" icon="Check" onClick={() => apply(m)}>Confirm</Btn><Btn sm onClick={() => doneAction(m.id, { text: 'Cancelled. Nothing changed.' })}>Cancel</Btn></div></div>)}
              {m.a.action?.type === 'task' && (m.done
                ? <div className="small muted" style={{ marginTop: 6 }}>{m.done}</div>
                : <div className="as-card"><div className="strong">{m.a.action.summary}</div><div className="small muted">Due {m.a.action.due}</div><div className="row" style={{ marginTop: 6 }}><Btn sm kind="primary" icon="Plus" onClick={() => { create('activities', { typeId: store.db.activityTypes[0]?.id, summary: m.a.action.summary, due: m.a.action.due, ownerId: me.id, note: 'Added from the assistant.', status: 'todo', priority: 'Medium', tag: 'Sales', relatedType: '', relatedId: '', relatedLabel: '' }); doneAction(m.id, 'Task added.'); toast('Task added'); }}>Add task</Btn><Btn sm onClick={() => doneAction(m.id, 'Cancelled.')}>Cancel</Btn></div></div>)}
              {m.a.draft && (m.done
                ? <div className="small muted" style={{ marginTop: 6 }}>{m.done}</div>
                : <div className="as-card"><div className="strong">{m.a.draft.subject}</div><div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.a.draft.body}</div>{can('emails', 'create') && m.a.draft.to && <div className="row" style={{ marginTop: 6 }}><Btn sm kind="primary" icon="Send" onClick={() => { sendEmail({ to: m.a.draft.to, subject: m.a.draft.subject, body: `${m.a.draft.body}\n\nRegards,\n${me.name}`, ownerId: me.id }); doneAction(m.id, `Sent to ${m.a.draft.to} (simulated).`); toast('Sent (simulated)'); }}>Send (simulated)</Btn></div>}</div>)}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        {Recognition && <Btn icon="Mic" aria-label={listening ? 'Listening' : 'Speak your question'} disabled={listening} onClick={listen} />}
        <input className="input" autoFocus aria-label="Ask a question" placeholder={listening ? 'Listening…' : 'Ask, or say what to change: "Move Meridian to Proposal"'} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!q.trim()} aria-label="Ask"><Send size={15} /></button>
      </form>
    </Drawer>
  );
}

export function WinChance({ deal }) {
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  if (db.settings.aiDealScore === false) return null;
  const x = dealScore(db, deal);
  if (!x) return null;
  return (
    <div className="win-chance">
      <div className="row between">
        <span className="small strong">Win chance</span>
        <button type="button" className="link-btn small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide why' : 'Why?'}</button>
      </div>
      <div className="row"><span className="kpi-value">{x.score}%</span><span className="grow win-bar"><i style={{ width: `${x.score}%`, background: x.score >= 60 ? 'var(--good)' : x.score >= 35 ? 'var(--warn)' : 'var(--bad)' }} /></span></div>
      {open && <div className="stack-s" style={{ marginTop: 6 }}>{x.reasons.map(([why, pts]) => <div key={why} className="row between small"><span>{why}</span><span className="num" style={{ color: pts < 0 ? 'var(--bad)' : 'var(--good)' }}>{pts > 0 ? '+' : ''}{pts}</span></div>)}<div className="small muted">Worked out from fixed rules and how past deals went, not an AI model.</div></div>}
    </div>
  );
}

export function CustomerHealth({ customer }) {
  const { db } = useStore();
  if (db.settings.aiHealth === false) return null;
  const h = customerHealth(db, customer);
  return (
    <Card title="Customer health" sub="From fixed rules, not an AI model" action={<Badge tone={h.tone}>{h.label}</Badge>}>
      <div className="row wrap" style={{ gap: 6 }}>{h.reasons.map(([why, pts]) => <span key={why} className={`health-chip ${pts < 0 ? 'bad' : pts > 0 ? 'good' : ''}`}>{why}</span>)}</div>
    </Card>
  );
}

// Draft and rewrite buttons shown above a message box.
export function WritingHelp({ text, onDraft, onText, first, company }) {
  const { db, me } = useStore();
  if (db.settings.aiWriter === false) return null;
  return (
    <div className="as-write" role="group" aria-label="Writing help">
      <span className="row small muted" style={{ gap: 4 }}><Icon name="Sparkles" size={13} />Writing help</span>
      <select className="select tb-filter" aria-label="Draft a message" value="" onChange={(e) => { if (e.target.value) onDraft(draftEmail(e.target.value, { first, company, me: me.name })); }}><option value="">Draft for me…</option>{DRAFT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {[['shorter', 'Shorter'], ['friendly', 'Friendlier'], ['formal', 'More formal']].map(([k, l]) => <Btn sm key={k} disabled={!text?.trim()} onClick={() => onText(rewrite(text, k))}>{l}</Btn>)}
    </div>
  );
}
