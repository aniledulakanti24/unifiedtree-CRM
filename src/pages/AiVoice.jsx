import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, FormFields, Icon, Kpi, Modal, NoSections, PageHead, RecordModal, Tabs, Toggle, firstAllowed, validate } from '../ui';
import { aiReply, aiRules, mentionsAi, phoneKey, questionsOf, speak, stopSpeaking, withinCallingHours } from '../aiVoice';
import { CallReview, Reports, RulesTab, ScriptEditor } from './AiVoiceExtras';
import { fmtDuration } from '../comms';
import { fmtDT, num, pct, sum, today } from '../util';

const OUTCOME_TONE = { Interested: 'good', 'Call back later': 'warn', 'Not interested': 'bad', 'Do not call': 'bad', 'Asked for a person': 'info', 'No answer': 'muted' };
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const AUDIENCES = ['New leads', 'All open leads', 'Open opportunities', 'Customers with overdue invoices', 'All contacts'];
const MAX_CALLS = 25;

function TestCall({ agent, onClose }) {
  const [lines, setLines] = useState([]);
  const [step, setStep] = useState(0);
  const [ended, setEnded] = useState(null);
  const [text, setText] = useState('');
  const [muted, setMuted] = useState(false);
  const endRef = useRef(null);
  const [captured, setCaptured] = useState([]);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const say = (line) => { setLines((p) => [...p, { who: 'ai', text: line }]); if (!muted) speak(line, agent); };
  useEffect(() => { say(agent.greeting.replace('{name}', 'there')); return stopSpeaking; }, []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [lines.length]);
  const answer = (said) => {
    if (!said.trim() || ended) return;
    setLines((p) => [...p, { who: 'person', text: said.trim() }]);
    setText('');
    const asked = questionsOf(agent)[step - 1];
    if (asked?.saveAs && !/\b(person|human|manager|busy|later|not interested|stop|remove)\b/i.test(said)) setCaptured((p) => [...p, { label: asked.saveAs, value: said.trim() }]);
    const r = aiReply(agent, step, said);
    say(r.text);
    if (!r.faq) setStep(step + 1);
    if (r.end) setEnded(r.outcome);
  };
  const listen = () => {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.onresult = (e) => answer(e.results[0][0].transcript);
    rec.onerror = () => setMicError("The microphone isn't available. You can type instead.");
    rec.onend = () => setListening(false);
    setMicError('');
    setListening(true);
    rec.start();
  };
  return (
    <Modal title={`Test call: ${agent.name}`} onClose={onClose} footer={<><Btn icon={muted ? 'VolumeX' : 'Volume2'} onClick={() => { setMuted(!muted); stopSpeaking(); }}>{muted ? 'Sound off' : 'Sound on'}</Btn><Btn kind="danger" icon="PhoneOff" onClick={onClose}>End call</Btn></>}>
      <div className="stack-s">
        <p className="small muted" style={{ margin: 0 }}>You play the customer by typing. The agent follows a fixed script and speaks with your browser's voice. It isn't a real AI model.</p>
        <div className="ai-transcript">
          {lines.map((l, i) => <div key={i} className={`ai-line ${l.who}`}><span className="small strong">{l.who === 'ai' ? agent.name : 'You'}</span><div>{l.text}</div></div>)}
          <div ref={endRef} />
        </div>
        {ended ? <div className="row"><Badge tone={OUTCOME_TONE[ended]}>{ended}</Badge><span className="small muted">This is how the call would be logged. Test calls aren't saved.</span>{captured.length > 0 && <div className="small" style={{ flexBasis: '100%' }}>Saved to the record on a real call: {captured.map((a) => `${a.label}: ${a.value}`).join(', ')}</div>}</div> : (
          <>
            <div className="row wrap">{['Yes, tell me more', "I'm busy, call me later", 'Not interested', 'Can I talk to a person?'].map((q) => <Btn sm key={q} onClick={() => answer(q)}>{q}</Btn>)}</div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); answer(text); }}>
              {Recognition && <Btn icon="Mic" aria-label={listening ? 'Listening' : 'Speak your reply'} disabled={listening} onClick={listen} />}
              <input className="input" aria-label="Your reply" placeholder={listening ? 'Listening…' : 'Type what the customer says…'} value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn primary" type="submit" disabled={!text.trim()} aria-label="Say this"><Send size={15} /></button>
            </form>
          </>
        )}
        {micError && <div className="small muted">{micError}</div>}
      </div>
    </Modal>
  );
}

function Agents() {
  const { db, can, create, update, remove, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const [test, setTest] = useState(null);
  const [del, setDel] = useState(null);
  const [script, setScript] = useState(null);
  const canEdit = can('aiVoice', 'edit');
  const rules = aiRules(db.settings);
  const fields = [
    { k: 'name', label: 'Agent name', req: true, full: true },
    { k: 'purpose', label: 'What it does', type: 'select', noBlank: true, list: 'aiPurpose' },
    { k: 'language', label: 'Language', type: 'select', noBlank: true, list: 'aiLanguage' },
    { k: 'voice', label: 'Voice', type: 'select', noBlank: true, list: 'aiVoice' },
    { k: 'handoff', label: 'Hand over to', type: 'select', noBlank: true, options: [{ value: 'owner', label: 'Record owner' }, { value: 'manager', label: "Owner's manager" }] },
    { k: 'greeting', label: 'Opening line', req: true, full: true, type: 'textarea', hint: '{name} becomes the person\'s first name. Write it in the language you chose.' },
    { k: 'instructions', label: 'Instructions for the agent', full: true, type: 'textarea', placeholder: 'For example: be brief, and never promise a discount.', hint: 'Saved with the agent. The simulation follows a fixed script, so a real AI model would need to be connected to use these.' },
    { k: 'inbound', label: 'Answer calls nobody picks up', type: 'select', noBlank: true, full: true, options: [{ value: 'no', label: 'No, log them as missed' }, { value: 'yes', label: 'Yes, this agent answers' }] },
  ];
  const save = (v) => {
    const { id, ...rest } = v;
    const rec = { ...rest, inbound: v.inbound === 'yes' };
    // One agent takes missed calls at a time.
    if (rec.inbound) db.aiAgents.filter((a) => a.inbound && a.id !== id).forEach((a) => update('aiAgents', a.id, { inbound: false }));
    if (id) update('aiAgents', id, rec); else create('aiAgents', { ...rec, active: true });
    toast('Agent saved');
  };
  return (
    <div>
      {canEdit && <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}><Btn kind="primary" icon="Plus" onClick={() => setEdit({ purpose: 'Lead qualification', language: 'English', voice: 'Asha (female)', handoff: 'owner', inbound: 'no', greeting: 'Hello {name}, this is an AI assistant calling from our team.' })}>New agent</Btn></div>}
      {!db.aiAgents.length && <div className="card"><Empty icon="AudioLines" text="No agents yet." /></div>}
      <div className="ai-grid">
        {db.aiAgents.map((a) => (
          <div key={a.id} className="card card-b ai-card">
            <div className="row"><span className="ai-icon"><Icon name="AudioLines" size={18} /></span><div className="grow" style={{ minWidth: 0 }}><div className="strong trunc">{a.name}</div><div className="small muted trunc">{a.purpose}</div></div>{canEdit && <Toggle on={a.active} label={`${a.name} active`} onChange={(x) => update('aiAgents', a.id, { active: x })} />}</div>
            <div className="row wrap"><Badge tone="muted" dot={false}>{a.language}</Badge><Badge tone="muted" dot={false}>{a.voice}</Badge>{a.inbound && <Badge tone="info" dot={false}>Answers missed calls</Badge>}{!a.active && <Badge tone="warn" dot={false}>Off</Badge>}</div>
            <p className="small muted ai-greeting">"{a.greeting}"</p>
            <div className="small muted">{num(db.aiCalls.filter((c) => c.agentId === a.id).length)} calls so far · {questionsOf(a).length} questions{a.faqs?.length ? ` · ${a.faqs.length} answers` : ''}</div>
            <div className="row wrap">
              <Btn sm kind="primary" icon="PhoneCall" onClick={() => setTest(a)}>Test call</Btn>
              {canEdit && <Btn sm icon="Pencil" onClick={() => setEdit({ ...a, inbound: a.inbound ? 'yes' : 'no' })}>Edit</Btn>}
              {canEdit && <Btn sm icon="ListChecks" onClick={() => setScript(a)}>Script</Btn>}
              {can('aiVoice', 'delete') && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${a.name}`} onClick={() => setDel(a)} />}
            </div>
          </div>
        ))}
      </div>
      {edit && <RecordModal title={edit.id ? 'Edit agent' : 'New agent'} initial={edit} fields={fields} onSave={save} onClose={() => setEdit(null)} check={(v) => (rules.disclose && !mentionsAi(v.greeting) ? { greeting: 'Your calling rules say the opening line must tell people this is an AI.' } : {})} />}
      {script && <ScriptEditor agent={script} onClose={() => setScript(null)} />}
      {test && <TestCall agent={test} onClose={() => { stopSpeaking(); setTest(null); }} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="Its past calls stay in the call history." onClose={() => setDel(null)} onConfirm={() => { remove('aiAgents', del.id); toast('Agent deleted'); }} />}
    </div>
  );
}

function NewCampaign({ onClose }) {
  const { db, me, can, scope, create, toast, companyName } = useStore();
  const agents = db.aiAgents.filter((a) => a.active);
  const [v, setV] = useState({ agentId: agents[0]?.id, audience: AUDIENCES[0], name: '' });
  const [errors, setErrors] = useState({});
  const contactOf = (companyId, contactId) => db.contacts.find((c) => c.id === contactId) || db.contacts.find((c) => c.companyId === companyId);
  const fromContact = (c, extra) => c && { name: `${c.first} ${c.last}`, phone: c.phone, relatedType: 'contact', relatedId: c.id, companyId: c.companyId, ownerId: c.ownerId, tz: db.companies.find((x) => x.id === c.companyId)?.timezone || '', ...extra };
  const targets = () => {
    const a = v.audience;
    const leads = (s) => (can('leads') ? scope(db.leads, 'leads') : []).filter(s).map((l) => ({ name: l.name, phone: l.phone, relatedType: 'lead', relatedId: l.id, companyId: '', ownerId: l.ownerId }));
    if (a === 'New leads') return leads((l) => l.status === 'New');
    if (a === 'All open leads') return leads((l) => !['Converted', 'Lost', 'Junk'].includes(l.status));
    if (a === 'Open opportunities') return (can('pipeline') ? scope(db.deals, 'pipeline') : []).filter((d) => d.status === 'open').map((d) => fromContact(contactOf(d.companyId, d.contactId), { ownerId: d.ownerId }));
    if (a === 'Customers with overdue invoices') return (can('billing') ? scope(db.invoices, 'billing') : []).filter((i) => i.total > (i.paid || 0) && i.due < today()).map((i) => fromContact(contactOf(i.companyId), { ownerId: i.ownerId }));
    return (can('contacts') ? scope(db.contacts, 'contacts') : []).map((c) => fromContact(c));
  };
  const seen = new Set();
  const blocked = new Set((db.aiDnc || []).map((x) => phoneKey(x.phone)));
  const all = targets().filter((t) => t?.phone && !seen.has(t.phone) && seen.add(t.phone));
  const list = all.filter((t) => !blocked.has(phoneKey(t.phone)));
  const rules = aiRules(db.settings);
  const queue = list.slice(0, MAX_CALLS);
  const fields = [
    { k: 'name', label: 'Campaign name', req: true, full: true },
    { k: 'agentId', label: 'Agent', type: 'select', req: true, noBlank: true, options: agents.map((a) => ({ value: a.id, label: a.name })) },
    { k: 'audience', label: 'Who to call', type: 'select', noBlank: true, options: AUDIENCES },
    { k: 'startAt', label: 'Start at', type: 'datetime-local', full: true, hint: 'Leave blank to start now.' },
  ];
  const start = () => {
    const er = validate(fields, v);
    setErrors(er);
    if (Object.keys(er).length || !queue.length) return;
    const later = v.startAt && new Date(v.startAt) > new Date();
    create('aiCampaigns', { name: v.name.trim(), agentId: v.agentId, audience: v.audience, queue, total: queue.length, done: 0, status: later ? 'Scheduled' : 'Running', startAt: later ? new Date(v.startAt).toISOString() : '', ownerId: me.id });
    toast(later ? `Campaign scheduled: ${queue.length} simulated calls` : `Campaign started: ${queue.length} simulated calls`);
    onClose();
  };
  return (
    <Modal size="sm" title="New campaign" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Play" disabled={!queue.length || !agents.length} onClick={start}>Start</Btn></>}>
      <div className="stack">
        {!agents.length && <p className="error-text">Turn on an agent first.</p>}
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
        {all.length > list.length && <div className="small muted">{all.length - list.length} skipped because they're on the do not call list.</div>}
        {!withinCallingHours(rules) && <div className="small muted">It's outside calling hours ({rules.from} to {rules.to}{rules.weekends ? '' : ', weekdays'}), so calls will wait until then.</div>}
        <div className="notice">{queue.length ? `${queue.length} ${queue.length === 1 ? 'person has' : 'people have'} a phone number${list.length > MAX_CALLS ? `, out of ${list.length}. The simulation calls up to ${MAX_CALLS} at a time` : ''}.` : 'Nobody in this group has a phone number you can see.'}{queue[0] && ` First up: ${queue[0].name}${queue[0].companyId ? `, ${companyName(queue[0].companyId)}` : ''}.`}</div>
      </div>
    </Modal>
  );
}

function Campaigns() {
  const { db, can, scope, update, userName } = useStore();
  const [adding, setAdding] = useState(false);
  const rows = scope(db.aiCampaigns, 'aiVoice');
  const canRun = can('aiVoice', 'create');
  return (
    <div>
      {canRun && <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}><Btn kind="primary" icon="Plus" onClick={() => setAdding(true)}>New campaign</Btn></div>}
      {!rows.length && <div className="card"><Empty icon="Megaphone" text="No campaigns yet. A campaign calls a group of people with one agent." /></div>}
      <div className="stack-s">
        {rows.map((c) => {
          const results = db.aiCalls.filter((x) => x.campaignId === c.id);
          const interested = results.filter((x) => x.outcome === 'Interested').length;
          return (
            <Card key={c.id} title={c.name} sub={`${db.aiAgents.find((a) => a.id === c.agentId)?.name || 'Deleted agent'} · ${c.audience} · ${userName(c.ownerId)}`} action={<span className="row"><Badge tone={c.status === 'Completed' ? 'good' : c.status === 'Running' ? 'info' : 'warn'}>{c.status === 'Running' && c.waiting ? 'Waiting for calling hours' : c.status === 'Scheduled' ? `Starts ${fmtDT(c.startAt)}` : c.status}</Badge>{canRun && c.status === 'Scheduled' && <Btn sm icon="X" onClick={() => update('aiCampaigns', c.id, { status: 'Paused' })}>Cancel</Btn>}{canRun && c.status === 'Running' && <Btn sm icon="Pause" onClick={() => update('aiCampaigns', c.id, { status: 'Paused' })}>Pause</Btn>}{canRun && c.status === 'Paused' && <Btn sm icon="Play" onClick={() => update('aiCampaigns', c.id, { status: 'Running' })}>Resume</Btn>}</span>}>
              <div className="ai-bar" role="progressbar" aria-label={`${c.name} progress`} aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.done}><span style={{ width: `${(c.done / c.total) * 100}%` }} /></div>
              <div className="small muted" style={{ marginTop: 6 }}>{c.done} of {c.total} called · {interested} interested{c.retried ? ` · ${c.retried} tried again` : ''}{c.skipped ? ` · ${c.skipped} skipped, do not call` : ''}</div>
            </Card>
          );
        })}
      </div>
      {adding && <NewCampaign onClose={() => setAdding(false)} />}
    </div>
  );
}

function CallDrawer({ call: start, onClose }) {
  const { db, userName, companyName } = useStore();
  const call = db.aiCalls.find((x) => x.id === start.id) || start;
  const agent = db.aiAgents.find((a) => a.id === call.agentId) || { language: 'English', voice: 'Asha (female)' };
  useEffect(() => stopSpeaking, []);
  return (
    <Drawer title={call.name} onClose={onClose}>
      <div className="stack">
        <div className="row wrap"><Badge tone={OUTCOME_TONE[call.outcome]}>{call.outcome}</Badge>{call.sentiment !== 'None' && <Badge tone={call.sentiment === 'Positive' ? 'good' : call.sentiment === 'Negative' ? 'bad' : 'muted'} dot={false}>{`${call.sentiment} tone`}</Badge>}<Badge tone="muted" dot={false}>{call.direction}</Badge></div>
        <div className="small muted">{call.phone}{call.companyId ? ` · ${companyName(call.companyId)}` : ''}<br />{fmtDT(call.at)} · {fmtDuration(call.duration)} · {call.agentName} · For {userName(call.ownerId)}</div>
        <div><div className="label">Summary</div><p style={{ margin: '4px 0 0' }}>{call.summary}</p></div>
        {call.answers?.length > 0 && <div><div className="label">Answers saved to the record</div><dl className="dl" style={{ marginTop: 4 }}>{call.answers.map((a) => <React.Fragment key={a.label}><dt>{a.label}</dt><dd>{a.value}</dd></React.Fragment>)}</dl></div>}
        {call.transcript.length > 0 && (
          <div>
            <div className="row between" style={{ marginBottom: 6 }}><div className="label">Transcript</div><Btn sm icon="Volume2" onClick={() => speak(call.transcript.map((l) => l.text).join(' '), agent)}>Read aloud</Btn></div>
            <div className="ai-transcript">{call.transcript.map((l, i) => <div key={i} className={`ai-line ${l.who}`}><span className="small strong">{l.who === 'ai' ? call.agentName : call.name}</span><div>{l.text}</div></div>)}</div>
          </div>
        )}
        {call.transcript.length > 0 && <CallReview key={call.id} call={call} />}
        <div className="notice">Simulated call. No phone was dialled and nobody heard this.</div>
      </div>
    </Drawer>
  );
}

function History() {
  const { db, scope, userName } = useStore();
  const [open, setOpen] = useState(null);
  const rows = scope(db.aiCalls, 'aiVoice');
  return (
    <>
      <DataTable rows={rows} exportName="ai-voice-calls" dateOf={(c) => c.at} initialSort={{ k: 'at', dir: 'desc' }} onRow={setOpen}
        statusTabs={{ options: ['Interested', 'Call back later', 'Asked for a person', 'Not interested', 'Do not call', 'No answer'], get: (c) => c.outcome }}
        filters={[{ k: 'review', label: 'Review', get: (c) => c.review || 'Not reviewed', options: ['Good', 'Needs work', 'Not reviewed'] }]}
        columns={[
          { k: 'name', label: 'Person', render: (c) => <span className="row"><Avatar name={c.name} size={26} /><span><div className="strong">{c.name}</div><div className="small muted">{c.phone}</div></span></span> },
          { k: 'agentName', label: 'Agent' },
          { k: 'outcome', label: 'Outcome', render: (c) => <Badge tone={OUTCOME_TONE[c.outcome]}>{c.outcome}</Badge> },
          { k: 'summary', label: 'Summary', render: (c) => <span className="small">{c.summary}</span> },
          { k: 'duration', label: 'Length', align: 'r', render: (c) => fmtDuration(c.duration) },
          { k: 'ownerId', label: 'Owner', value: (c) => userName(c.ownerId) },
          { k: 'at', label: 'When', render: (c) => <span className="small nowrap">{fmtDT(c.at)}</span> },
        ]} />
      {open && <CallDrawer call={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function AiVoice() {
  const { db, t, sec, scope } = useStore();
  const tabs = [{ k: 'agents', label: 'Agents', icon: 'AudioLines' }, { k: 'campaigns', label: 'Campaigns', icon: 'Megaphone' }, { k: 'history', label: 'Call history', icon: 'History' }, { k: 'reports', label: 'Reports', icon: 'ChartColumn' }, { k: 'rules', label: 'Rules and do not call', icon: 'ShieldCheck' }].filter((x) => sec('aiVoice', x.k));
  const [pref, setTab] = useState('agents');
  const tab = firstAllowed(tabs, pref);
  const calls = scope(db.aiCalls, 'aiVoice');
  const answered = calls.filter((c) => c.outcome !== 'No answer');
  if (!tab) return <div><PageHead title={t('aiVoice')} /><NoSections /></div>;
  return (
    <div>
      <PageHead title={t('aiVoice')} sub="AI agents that call your leads and customers, and answer calls nobody picks up." />
      <p className="notice" style={{ marginTop: 0 }}>Simulated. No phone is dialled and no AI model runs: calls follow fixed scripts with made-up results. Real AI calling needs a voice provider, and must follow each country's rules on consent and calling hours.</p>
      {sec('aiVoice', 'kpis') && (
        <div className="g4" style={{ marginBottom: 14 }}>
          <Kpi label="AI calls" value={num(calls.length)} icon="PhoneCall" />
          <Kpi label="Answered" value={pct(calls.length ? (answered.length / calls.length) * 100 : 0)} note={`${answered.length} of ${calls.length}`} icon="Target" />
          <Kpi label="Interested" value={num(calls.filter((c) => c.outcome === 'Interested').length)} note="A follow-up was added" icon="ThumbsUp" />
          <Kpi label="Talk time" value={`${Math.round(sum(calls, (c) => c.duration) / 60)} min`} icon="Timer" />
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'agents' && <Agents />}
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'history' && <History />}
      {tab === 'reports' && <Reports calls={calls} />}
      {tab === 'rules' && <RulesTab />}
    </div>
  );
}
