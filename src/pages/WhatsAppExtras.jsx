import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, Empty, FormFields, Kpi, Modal, NoSections, PageHead, Pills, Tabs, firstAllowed } from '../ui';
import { Bars } from '../charts';
import { COUNTRY_NAMES } from '../callTools';
import { CATEGORIES, LANGUAGES, VARIABLES, approved, audienceOf, campaignStats, fillTemplate, firstReplyMinutes, templateIssues, templatesOf, waOf } from '../whatsapp';
import { fmtDT, num, pct } from '../util';
import { localInput } from '../comms';
const localInputNow = (ms) => localInput(Date.now() + ms);

const STATUS_TONE = { Approved: 'good', Pending: 'warn', Rejected: 'bad', Draft: 'muted', Scheduled: 'info', Sent: 'good', Sending: 'info' };
const usd = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

function Bubble({ text, buttons }) {
  return (
    <div className="wa-preview">
      <div className="wa-preview-bubble">{text || <span className="muted">Your message shows here.</span>}</div>
      {(buttons || []).filter(Boolean).map((b) => <div key={b} className="wa-preview-btn">{b}</div>)}
    </div>
  );
}

function TemplateModal({ initial, onClose }) {
  const { create, update, toast, db } = useStore();
  const [v, setV] = useState({ name: '', category: 'Utility', language: 'English', body: '', buttons: [], ...initial, buttonsText: (initial.buttons || []).join('\n') });
  const [shown, setShown] = useState(false);
  const t = { ...v, buttons: v.buttonsText.split('\n').map((b) => b.trim()).filter(Boolean) };
  const issues = templateIssues(t);
  const save = () => {
    setShown(true);
    if (issues.length) return;
    const rec = { name: t.name.trim(), category: t.category, language: t.language, body: t.body.trim(), buttons: t.buttons, status: 'Pending', reason: '', submittedAt: new Date().toISOString() };
    if (initial.id && !initial.legacy) update('waTemplates', initial.id, rec); else create('waTemplates', rec);
    toast('Sent for review. Simulated: it takes about a minute.');
    onClose();
  };
  return (
    <Modal size="lg" title={initial.id ? `Edit ${initial.name}` : 'New WhatsApp template'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Send for review</Btn></>}>
      <div className="wa-tpl-grid">
        <div className="stack">
          {initial.status === 'Approved' && <div className="notice">Changing an approved template sends it for review again. Until then it can't be used.</div>}
          <FormFields values={v} onChange={(k, x) => setV({ ...v, [k]: x })} fields={[
            { k: 'name', label: 'Name', req: true, full: true },
            { k: 'category', label: 'Type', type: 'select', noBlank: true, options: CATEGORIES, hint: v.category === 'Marketing' ? 'Offers and news. Needs consent, and costs the most.' : v.category === 'Utility' ? 'Updates about an order, quote or meeting.' : 'Sign-in codes only.' },
            { k: 'language', label: 'Language', type: 'select', noBlank: true, options: LANGUAGES },
            { k: 'body', label: 'Message', type: 'textarea', rows: 5, req: true, full: true, hint: `You can use ${VARIABLES.join(', ')}. ${v.body.length} of 1,024 characters.` },
            { k: 'buttonsText', label: 'Quick-reply buttons, one on each line', type: 'textarea', rows: 3, full: true, hint: 'Up to 3. The customer taps one to reply.' },
          ]} />
          {shown && issues.length > 0 && <div className="error-text" role="alert"><ul style={{ margin: 0, paddingInlineStart: 18 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
        <div className="stack-s"><div className="label">Preview</div><Bubble text={fillTemplate(t.body, { name: 'Alex Morgan', company: db.settings.companyName, owner: 'Sam', code: '482913' })} buttons={t.buttons} /></div>
      </div>
    </Modal>
  );
}

export function Templates() {
  const { db, can, optionsOf, remove, toast } = useStore();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [show, setShow] = useState('All');
  const editable = can('whatsapp', 'setup');
  const all = templatesOf(db, optionsOf('messageTemplate'));
  const list = all.filter((t) => show === 'All' || t.status === show);
  return (
    <div className="stack">
      <div className="row between wrap">
        <Pills value={show} onChange={setShow} options={['All', 'Approved', 'Pending', 'Rejected'].map((k) => ({ k, label: k, count: k === 'All' ? all.length : all.filter((t) => t.status === k).length }))} />
        {editable && <Btn kind="primary" icon="Plus" onClick={() => setEdit({})}>New template</Btn>}
      </div>
      {!list.length ? <div className="card"><Empty icon="FileText" text="No templates here." /></div> : <div className="g2">{list.map((t) => (
        <Card key={t.id} title={<span className="row" style={{ gap: 8 }}>{t.name}<Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></span>} sub={`${t.category} · ${t.language}`} action={editable && <span className="row">
          <Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${t.name}`} onClick={() => setEdit(t)} />
          {!t.legacy && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)} />}
        </span>}>
          <Bubble text={fillTemplate(t.body, { name: 'Alex', company: db.settings.companyName, owner: 'Sam', code: '482913' })} buttons={t.buttons} />
          {t.status === 'Rejected' && <div className="error-text" style={{ marginTop: 8 }}>Turned down: {t.reason}</div>}
          {t.status === 'Pending' && <div className="small muted" style={{ marginTop: 8 }}>Sent {fmtDT(t.submittedAt)}. Simulated review, about a minute.</div>}
        </Card>
      ))}</div>}
      <p className="small muted">WhatsApp only lets a business start a conversation, or write after 24 hours, with an approved template. Simulated: the review runs in this browser with simple checks, not by WhatsApp.</p>
      {edit && <TemplateModal initial={edit} onClose={() => setEdit(null)} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="Messages already sent stay in the chats." onClose={() => setDel(null)} onConfirm={() => { remove('waTemplates', del.id); toast('Template deleted'); }} />}
    </div>
  );
}

function CampaignModal({ onClose }) {
  const { db, scope, optionsOf, userName, sendCampaign, create, toast } = useStore();
  const wa = waOf(db.settings);
  const temps = approved(templatesOf(db, optionsOf('messageTemplate')));
  const [v, setV] = useState({ name: '', templateId: temps.find((t) => t.category === 'Marketing')?.id || temps[0]?.id || '', status: '', ownerId: '', country: '', when: 'now', at: localInputNow(36e5) });
  const rows = scope(db.contacts);
  const tpl = temps.find((t) => t.id === v.templateId);
  const aud = audienceOf(db, rows, v, tpl, wa);
  const owners = [...new Set(rows.map((c) => c.ownerId))];
  const go = () => {
    if (!v.name.trim()) { toast('Give the campaign a name.', 'bad'); return; }
    if (!tpl || !aud.send.length) { toast('Pick a template and an audience with at least one person.', 'bad'); return; }
    const scheduled = v.when === 'later';
    if (scheduled && new Date(v.at) <= new Date()) { toast('Pick a time in the future.', 'bad'); return; }
    const rec = create('waCampaigns', { name: v.name.trim(), templateId: tpl.id, audience: { status: v.status, ownerId: v.ownerId, country: v.country }, status: scheduled ? 'Scheduled' : 'Sending', scheduledAt: scheduled ? new Date(v.at).toISOString() : undefined, recipients: [] });
    if (!scheduled) setTimeout(() => sendCampaign(rec.id), 0);
    toast(scheduled ? `Scheduled for ${fmtDT(new Date(v.at).toISOString())}` : `Sending to ${aud.send.length} (simulated)`);
    onClose();
  };
  return (
    <Modal size="lg" title="New WhatsApp campaign" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Send" disabled={!aud.send.length} onClick={go}>{v.when === 'later' ? 'Schedule' : `Send to ${aud.send.length}`}</Btn></>}>
      <div className="wa-tpl-grid">
        <div className="stack">
          <FormFields values={v} onChange={(k, x) => setV({ ...v, [k]: x })} fields={[
            { k: 'name', label: 'Campaign name', req: true, full: true },
            { k: 'templateId', label: 'Approved template', type: 'select', noBlank: true, full: true, options: temps.map((t) => ({ value: t.id, label: `${t.name} (${t.category})` })) },
            { k: 'status', label: 'Contact status', type: 'select', blankLabel: 'Any', options: optionsOf('contactStatus') },
            { k: 'country', label: 'Country', type: 'select', blankLabel: 'Any', options: COUNTRY_NAMES },
            { k: 'ownerId', label: 'Account owner', type: 'select', blankLabel: 'Anyone', options: owners.map((id) => ({ value: id, label: userName(id) })), full: true },
            { k: 'when', label: 'When', type: 'select', noBlank: true, options: [{ value: 'now', label: 'Send now' }, { value: 'later', label: 'Schedule' }] },
            { k: 'at', label: 'Send at', type: 'datetime-local', hide: v.when !== 'later' },
          ]} />
          <div className="wa-aud">
            <div><strong>{num(aud.send.length)}</strong> will get it</div>
            {aud.optedOut > 0 && <div className="small muted">{aud.optedOut} left out: they said stop</div>}
            {aud.notAsked > 0 && <div className="small muted">{aud.notAsked} left out: no consent to marketing yet</div>}
            {aud.noPhone > 0 && <div className="small muted">{aud.noPhone} left out: no phone number</div>}
            <div className="small">Estimated cost: <strong>{usd(aud.cost)}</strong> <span className="muted">(rough prices by country; check your provider)</span></div>
          </div>
        </div>
        <div className="stack-s"><div className="label">Preview</div><Bubble text={tpl && fillTemplate(tpl.body, { name: aud.send[0] ? aud.send[0].first : 'Alex', company: db.settings.companyName, owner: userName(aud.send[0]?.ownerId) })} buttons={tpl?.buttons} /></div>
      </div>
    </Modal>
  );
}

export function Campaigns() {
  const { db, can, optionsOf, remove, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const canSend = can('whatsapp', 'campaigns');
  const temps = templatesOf(db, optionsOf('messageTemplate'));
  const list = [...(db.waCampaigns || [])].sort((a, b) => (b.sentAt || b.scheduledAt || b.createdAt || '').localeCompare(a.sentAt || a.scheduledAt || a.createdAt || ''));
  return (
    <div className="stack">
      <div className="row between wrap"><div className="sub">Send an approved template to many contacts. People who said stop, or haven't agreed to marketing, are left out.</div>{canSend && <Btn kind="primary" icon="Megaphone" onClick={() => setAdding(true)}>New campaign</Btn>}</div>
      {!list.length ? <div className="card"><Empty icon="Megaphone" text="No campaigns yet." /></div> : list.map((c) => {
        const s = campaignStats(db, c);
        const tpl = temps.find((t) => t.id === c.templateId);
        return (
          <Card key={c.id} title={<span className="row" style={{ gap: 8 }}>{c.name}<Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></span>}
            sub={`${tpl?.name || 'Deleted template'} · ${c.status === 'Scheduled' ? `Goes out ${fmtDT(c.scheduledAt)}` : c.sentAt ? `Sent ${fmtDT(c.sentAt)}` : ''}${c.cost ? ` · About ${usd(c.cost)}` : ''}`}
            action={canSend && c.status === 'Scheduled' && <Btn sm kind="ghost" icon="X" onClick={() => setDel(c)}>Cancel</Btn>}>
            {c.status === 'Sent' ? (
              <div className="wa-stats">
                {[['Sent', s.sent], ['Delivered', s.delivered], ['Read', s.read], ['Replied', s.replied], ['Failed', s.failed]].map(([l, n]) => <div key={l}><div className="kpi-label">{l}</div><div className="kpi-value">{num(n)}</div><div className="small muted">{l === 'Sent' ? `${(c.skipped?.optedOut || 0) + (c.skipped?.notAsked || 0) + (c.skipped?.noPhone || 0)} left out` : s.sent ? pct((n / s.sent) * 100) : '—'}</div></div>)}
              </div>
            ) : <div className="small muted">{c.status === 'Scheduled' ? 'Nothing has gone out yet. The audience is worked out when it sends.' : 'Sending…'}</div>}
          </Card>
        );
      })}
      <p className="small muted">Simulated: delivery, reads and failures are made up by the demo network. Nothing reaches a real phone.</p>
      {adding && <CampaignModal onClose={() => setAdding(false)} />}
      {del && <Confirm title={`Cancel ${del.name}?`} text="It won't be sent." confirmLabel="Cancel campaign" onClose={() => setDel(null)} onConfirm={() => { remove('waCampaigns', del.id); toast('Campaign cancelled'); }} />}
    </div>
  );
}

export function Automation() {
  const { db, can, updateSettings, toast } = useStore();
  const editable = can('whatsapp', 'setup');
  const [v, setV] = useState(() => waOf(db.settings));
  const changed = JSON.stringify(v) !== JSON.stringify(waOf(db.settings));
  const put = (patch) => setV((p) => ({ ...p, ...patch }));
  const save = () => {
    const keywords = v.keywords.filter((k) => k.word.trim() && k.reply.trim());
    updateSettings({ wa: { ...v, keywords } });
    setV({ ...v, keywords });
    toast('WhatsApp setup saved');
  };
  return (
    <div className="stack">
      {!editable && <div className="notice">You can see the WhatsApp setup. Ask your Admin to change it.</div>}
      <fieldset disabled={!editable} className="plain-fieldset stack">
        <div className="g2">
          <Card title="Greeting" sub="Sent once, when someone writes for the first time">
            <FormFields values={v.greeting} onChange={(k, x) => put({ greeting: { ...v.greeting, [k]: x } })} fields={[{ k: 'on', label: 'Greeting', type: 'check', text: 'Send a greeting', full: true }, { k: 'text', label: 'Message', type: 'textarea', full: true, hide: !v.greeting.on, hint: '{name} is their name, {company} is your company.' }]} />
          </Card>
          <Card title="Away message" sub="Sent outside the opening hours in Calls, Phone setup">
            <FormFields values={v.away} onChange={(k, x) => put({ away: { ...v.away, [k]: x } })} fields={[{ k: 'on', label: 'Away message', type: 'check', text: 'Send an away message when closed', full: true }, { k: 'text', label: 'Message', type: 'textarea', full: true, hide: !v.away.on }]} />
          </Card>
        </div>
        <Card title="Keyword replies" sub="When a message contains a word, this reply goes out straight away">
          <div className="stack-s">
            {v.keywords.map((k, i) => (
              <div key={i} className="wa-kw">
                <input className="input" aria-label={`Keyword ${i + 1}`} placeholder="Word" value={k.word} onChange={(e) => put({ keywords: v.keywords.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)) })} />
                <input className="input" aria-label={`Reply ${i + 1}`} placeholder="Reply" value={k.reply} onChange={(e) => put({ keywords: v.keywords.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)) })} />
                <Btn sm kind="ghost" icon="X" aria-label={`Remove keyword ${i + 1}`} onClick={() => put({ keywords: v.keywords.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div><Btn sm icon="Plus" onClick={() => put({ keywords: [...v.keywords, { word: '', reply: '' }] })}>Add a keyword</Btn></div>
          </div>
        </Card>
        <div className="g2">
          <Card title="Consent" sub="Check the marketing rules in each country you sell in">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[
              { k: 'optInOnly', label: 'Marketing', type: 'check', text: 'Only send marketing templates to people who agreed', full: true },
              { k: 'optOutWords', label: 'Words that mean stop', full: true, hint: 'Separate with commas' },
              { k: 'optOutReply', label: 'Reply when someone stops', type: 'textarea', full: true },
              { k: 'optInWords', label: 'Words that mean sign me up', full: true },
              { k: 'optInReply', label: 'Reply when someone signs up', type: 'textarea', full: true },
            ]} />
          </Card>
          <Card title="New conversations" sub="From numbers that aren't a contact yet">
            <FormFields values={v} onChange={(k, x) => put({ [k]: x })} fields={[{ k: 'assign', label: 'Give them to', type: 'select', noBlank: true, full: true, options: [{ value: 'round', label: 'Salespeople in turn, whoever has fewest open chats' }, { value: 'none', label: 'Nobody. Leave them unassigned for a manager' }] }]} />
            <div className="small muted" style={{ marginTop: 8 }}>Chats with a known contact always go to the contact's owner.</div>
          </Card>
        </div>
        {editable && <div className="row"><Btn kind="primary" disabled={!changed} onClick={save}>Save WhatsApp setup</Btn>{changed && <Btn kind="ghost" onClick={() => setV(waOf(db.settings))}>Undo changes</Btn>}</div>}
      </fieldset>
    </div>
  );
}

export function WaResults() {
  const { db, me, scopeOf, userName } = useStore();
  const [days, setDays] = useState('30');
  const since = new Date(Date.now() - Number(days) * 864e5).toISOString();
  const sc = scopeOf('whatsapp');
  const teamIds = new Set(db.users.filter((u) => u.teamId && u.teamId === me.teamId).map((u) => u.id));
  const convs = db.conversations.filter((c) => c.kind === 'whatsapp' && (sc === 'all' || c.ownerId === me.id || (sc === 'team' && teamIds.has(c.ownerId))) && c.messages.some((m) => m.at >= since));
  const waits = convs.flatMap((c) => firstReplyMinutes({ ...c, messages: c.messages.filter((m) => m.at >= since) }));
  const avg = waits.length ? waits.reduce((a, x) => a + x, 0) / waits.length : 0;
  const people = [...new Set(convs.map((c) => c.ownerId || ''))].map((id) => ({ label: id ? userName(id) : 'Unassigned', open: convs.filter((c) => (c.ownerId || '') === id && (c.status || 'Open') === 'Open').length, resolved: convs.filter((c) => (c.ownerId || '') === id && c.status === 'Resolved').length })).sort((a, b) => b.open + b.resolved - a.open - a.resolved).slice(0, 10);
  const camps = (db.waCampaigns || []).filter((c) => c.status === 'Sent').map((c) => { const s = campaignStats(db, c); return { label: c.name, read: s.sent ? (s.read / s.sent) * 100 : 0, replied: s.sent ? (s.replied / s.sent) * 100 : 0 }; });
  const count = (n) => String(Math.round(n));
  const fmtWait = (m) => (m < 60 ? `${Math.round(m)} min` : `${Math.round((m / 60) * 10) / 10} h`);
  return (
    <div className="stack">
      <Pills value={days} onChange={setDays} options={[{ k: '7', label: '7 days' }, { k: '30', label: '30 days' }, { k: '90', label: '90 days' }]} />
      <div className="g4">
        <Kpi label="Conversations" value={num(convs.length)} note="With a message in this period" icon="MessageCircle" />
        <Kpi label="First reply" value={waits.length ? fmtWait(avg) : '—'} note="Average wait for a person to answer" icon="Timer" />
        <Kpi label="Resolved" value={pct(convs.length ? (convs.filter((c) => c.status === 'Resolved').length / convs.length) * 100 : 0)} note="Marked done" icon="CheckCircle2" />
        <Kpi label="Said stop" value={num(db.contacts.filter((c) => c.waOptOut).length)} note={`${num(db.contacts.filter((c) => c.waOptIn).length)} agreed to marketing`} icon="BellOff" />
      </div>
      <div className="g2">
        {sc !== 'own' && <Card title="Chats by person" sub="Open and resolved, same scale">{people.length ? <Bars horizontal data={people} series={[{ key: 'open', name: 'Open' }, { key: 'resolved', name: 'Resolved' }]} format={count} height={Math.max(160, people.length * 44)} /> : <Empty icon="Users" text="No chats in this period." />}</Card>}
        <Card title="Campaigns" sub="Share read and replied">{camps.length ? <Bars horizontal data={camps} series={[{ key: 'read', name: 'Read' }, { key: 'replied', name: 'Replied' }]} format={(x) => pct(x)} height={Math.max(160, camps.length * 54)} /> : <Empty icon="Megaphone" text="No campaigns sent yet." />}</Card>
      </div>
      <p className="small muted">Simulated: replies and reads come from the demo network.</p>
    </div>
  );
}

export function WhatsAppPage({ Inbox }) {
  const { t, can, sec, prefs, savePrefs } = useStore();
  const tabs = [{ k: 'inbox', label: 'Inbox', icon: 'Inbox' }, { k: 'campaigns', label: 'Campaigns', icon: 'Megaphone' }, { k: 'templates', label: 'Templates', icon: 'FileText' }, { k: 'automation', label: 'Automatic replies', icon: 'Bot' }, { k: 'results', label: 'Results', icon: 'BarChart3' }].filter((x) => x.k === 'inbox' || sec('whatsapp', x.k));
  const [picked, setPicked] = useState(prefs.waTab);
  const tab = firstAllowed(tabs, picked);
  if (!can('whatsapp')) return <NoSections />;
  return (
    <div>
      <PageHead title={t('whatsapp')} sub={tab === 'inbox' ? 'WhatsApp conversations with your contacts.' : 'Templates, campaigns and automatic replies for WhatsApp.'} />
      {tabs.length > 1 && <div style={{ marginBottom: 12 }}><Tabs value={tab} onChange={(k) => { setPicked(k); savePrefs({ waTab: k }); }} tabs={tabs} /></div>}
      {tab === 'inbox' && <Inbox embedded onCampaigns={() => { setPicked('campaigns'); savePrefs({ waTab: 'campaigns' }); }} />}
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'templates' && <Templates />}
      {tab === 'automation' && <Automation />}
      {tab === 'results' && <WaResults />}
    </div>
  );
}
