import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, Empty, FormFields, Kpi, Modal, Pills } from '../ui';
import { Bars } from '../charts';
import { FOLDERS, audienceOf, bestHour, emailOf, emailTemplatesOf, fill, footerText, rates, suppressedOf, validEmail, winnerOf } from '../emailTools';
import { fmtDT, num, pct } from '../util';

const STATUS_TONE = { Sent: 'good', Scheduled: 'info', Sending: 'info', Draft: 'muted' };
const nowLocal = (mins) => { const d = new Date(Date.now() + mins * 6e4); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// Everyone you can email: contacts and leads you can see.
export const usePeople = () => {
  const { db, can, scope, companyName } = useStore();
  return useMemo(() => [
    ...(can('contacts') ? scope(db.contacts) : []).map((c) => ({ id: c.id, kind: 'contact', email: c.email, first: c.first, label: `${c.first} ${c.last}`, company: companyName(c.companyId), status: c.status, ownerId: c.ownerId })),
    ...(can('leads') ? scope(db.leads) : []).map((l) => ({ id: l.id, kind: 'lead', email: l.email, first: l.name.split(' ')[0], label: l.name, company: l.company, status: l.status, ownerId: l.ownerId })),
  ], [db.contacts, db.leads]);
};

export function BestTimeHint() {
  const { db, scope } = useStore();
  const best = bestHour(scope(db.emails || [], 'emails'));
  return best ? <span className="hint">Your emails are opened most around {hourLabel(best.hour)}. Sending a little before then helps.</span> : null;
}

export function LinkRecord({ email }) {
  const { patchQuiet, toast } = useStore();
  const people = usePeople();
  const [pick, setPick] = useState('');
  const guess = people.find((p) => p.email && p.email.toLowerCase() === String(email.to).toLowerCase());
  const save = (p) => { patchQuiet('emails', email.id, { relatedType: p.kind, relatedId: p.id, name: email.name || p.label }); toast(`Linked to ${p.label}`); };
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <span className="small muted">Not linked to a record.</span>
      {guess && <Btn sm icon="Link" onClick={() => save(guess)}>Link to {guess.label}</Btn>}
      <select className="select tb-filter" aria-label="Link to a record" value={pick} onChange={(e) => { setPick(e.target.value); const p = people.find((x) => `${x.kind}:${x.id}` === e.target.value); if (p) save(p); }}>
        <option value="">Link to someone else…</option>
        {people.slice(0, 300).map((p) => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.label} ({p.kind})</option>)}
      </select>
    </div>
  );
}

function TemplateModal({ initial, onClose }) {
  const { create, update, toast, db, me } = useStore();
  const [v, setV] = useState({ name: '', folder: 'Sales', subject: '', body: 'Hi {name},\n\n', ...initial });
  const [err, setErr] = useState('');
  const save = () => {
    if (!v.name.trim() || !v.body.trim()) { setErr('Add a name and a message.'); return; }
    const rec = { name: v.name.trim(), folder: v.folder, subject: v.subject.trim(), body: v.body };
    if (initial.id && !initial.legacy) update('emailTemplates', initial.id, rec); else create('emailTemplates', rec);
    toast('Template saved');
    onClose();
  };
  const sample = { first: 'Alex', company: 'Northwind', me: me.name, ours: db.settings.companyName };
  return (
    <Modal size="lg" title={initial.id ? `Edit ${initial.name}` : 'New email template'} onClose={onClose} footer={<>{err && <span className="error-text" style={{ marginInlineEnd: 'auto' }}>{err}</span>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save template</Btn></>}>
      <div className="wa-tpl-grid">
        <FormFields values={v} onChange={(k, x) => { setV({ ...v, [k]: x }); setErr(''); }} fields={[
          { k: 'name', label: 'Name', req: true },
          { k: 'folder', label: 'Folder', type: 'select', noBlank: true, options: FOLDERS },
          { k: 'subject', label: 'Subject', full: true },
          { k: 'body', label: 'Message', type: 'textarea', rows: 8, req: true, full: true, hint: '{name} their first name, {company} their company, {me} your name, {our_company} your company.' },
        ]} />
        <div className="stack-s"><div className="label">Preview</div><div className="em-msg"><div className="strong">{fill(v.subject, sample) || '(no subject)'}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{fill(v.body, sample)}</div></div></div>
      </div>
    </Modal>
  );
}

export function EmailTemplates() {
  const { db, can, optionsOf, remove, toast, scope } = useStore();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [folder, setFolder] = useState('All');
  const editable = can('emails', 'create');
  const all = emailTemplatesOf(db, optionsOf('emailTemplate'));
  const sent = scope(db.emails || [], 'emails').filter((e) => e.templateId && !e.incoming && !['Draft', 'Scheduled'].includes(e.status));
  const list = all.filter((t) => folder === 'All' || t.folder === folder);
  return (
    <div className="stack">
      <div className="row between wrap">
        <Pills value={folder} onChange={setFolder} options={['All', ...FOLDERS].map((k) => ({ k, label: k, count: k === 'All' ? all.length : all.filter((t) => t.folder === k).length }))} />
        {editable && <Btn kind="primary" icon="Plus" onClick={() => setEdit({})}>New template</Btn>}
      </div>
      {!list.length ? <div className="card"><Empty icon="FileText" text="No templates in this folder." /></div> : <div className="g2">{list.map((t) => {
        const r = rates(sent.filter((e) => e.templateId === t.id));
        return (
          <Card key={t.id} title={t.name} sub={`${t.folder}${r.sent ? ` · Used ${r.sent} times · ${pct(r.delivered ? (r.opened / r.delivered) * 100 : 0)} opened · ${pct(r.delivered ? (r.replied / r.delivered) * 100 : 0)} replied` : ' · Not used yet'}`} action={editable && <span className="row">
            <Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${t.name}`} onClick={() => setEdit(t)} />
            {!t.legacy && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)} />}
          </span>}>
            <div className="strong small">{t.subject || '(no subject)'}</div>
            <div className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.body.slice(0, 220)}{t.body.length > 220 ? '…' : ''}</div>
          </Card>
        );
      })}</div>}
      {edit && <TemplateModal initial={edit} onClose={() => setEdit(null)} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="Emails already sent stay." onClose={() => setDel(null)} onConfirm={() => { remove('emailTemplates', del.id); toast('Template deleted'); }} />}
    </div>
  );
}

function CampaignModal({ onClose }) {
  const { db, me, optionsOf, create, sendEmailCampaign, toast } = useStore();
  const people = usePeople();
  const temps = emailTemplatesOf(db, optionsOf('emailTemplate'));
  const [v, setV] = useState({ name: '', templateId: temps[0]?.id || '', subject: temps[0]?.subject || '', subjectB: '', kind: 'contact', status: '', when: 'now', at: nowLocal(60) });
  const tpl = temps.find((t) => t.id === v.templateId);
  const aud = audienceOf(db, people, { kind: v.kind, status: v.status });
  const limit = emailOf(db.settings).dailyLimit;
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = (db.emails || []).filter((e) => e.campaignId && (e.at || '').slice(0, 10) === today).length;
  const statuses = v.kind === 'lead' ? optionsOf('leadStatus') : optionsOf('contactStatus');
  const go = () => {
    if (!v.name.trim() || !v.subject.trim() || !tpl) { toast('Add a name, a template and a subject.', 'bad'); return; }
    if (!aud.send.length) { toast('Nobody in this audience can get it.', 'bad'); return; }
    if (sentToday + aud.send.length > Number(limit)) { toast(`That goes over your daily limit of ${limit}. Pick a smaller audience or send tomorrow.`, 'bad'); return; }
    const later = v.when === 'later';
    if (later && new Date(v.at) <= new Date()) { toast('Pick a time in the future.', 'bad'); return; }
    const rec = create('emailCampaigns', { name: v.name.trim(), templateId: tpl.id, subject: v.subject.trim(), subjectB: v.subjectB.trim(), audience: { kind: v.kind, status: v.status, ids: aud.send.map((p) => `${p.kind}:${p.id}`) }, status: later ? 'Scheduled' : 'Sending', scheduledAt: later ? new Date(v.at).toISOString() : undefined, ownerId: me.id });
    if (!later) setTimeout(() => sendEmailCampaign(rec.id), 0);
    toast(later ? `Scheduled for ${fmtDT(new Date(v.at).toISOString())}` : `Sending to ${aud.send.length} (simulated)`);
    onClose();
  };
  const first = aud.send[0];
  return (
    <Modal size="lg" title="New email campaign" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Send" disabled={!aud.send.length} onClick={go}>{v.when === 'later' ? 'Schedule' : `Send to ${aud.send.length}`}</Btn></>}>
      <div className="wa-tpl-grid">
        <div className="stack">
          <FormFields values={v} onChange={(k, x) => setV((p) => ({ ...p, [k]: x, ...(k === 'templateId' ? { subject: temps.find((t) => t.id === x)?.subject || p.subject } : {}), ...(k === 'kind' ? { status: '' } : {}) }))} fields={[
            { k: 'name', label: 'Campaign name', req: true, full: true },
            { k: 'templateId', label: 'Template', type: 'select', noBlank: true, full: true, options: temps.map((t) => ({ value: t.id, label: `${t.name} (${t.folder})` })) },
            { k: 'subject', label: 'Subject', req: true, full: true },
            { k: 'subjectB', label: 'Second subject to test (optional)', full: true, hint: 'Half get each subject. Results show which was opened more.' },
            { k: 'kind', label: 'Send to', type: 'select', noBlank: true, options: [{ value: 'contact', label: 'Contacts' }, { value: 'lead', label: 'Leads' }] },
            { k: 'status', label: 'Status', type: 'select', blankLabel: 'Any', options: statuses },
            { k: 'when', label: 'When', type: 'select', noBlank: true, options: [{ value: 'now', label: 'Send now' }, { value: 'later', label: 'Schedule' }] },
            { k: 'at', label: 'Send at', type: 'datetime-local', hide: v.when !== 'later' },
          ]} />
          <BestTimeHint />
          <div className="wa-aud">
            <div><strong>{num(aud.send.length)}</strong> will get it</div>
            {aud.suppressed > 0 && <div className="small muted">{aud.suppressed} left out: unsubscribed or bounced before</div>}
            {aud.noEmail > 0 && <div className="small muted">{aud.noEmail} left out: no email address</div>}
            <div className="small muted">Today: {sentToday} of your {limit} daily campaign emails used.</div>
          </div>
        </div>
        <div className="stack-s"><div className="label">Preview{first ? ` for ${first.first}` : ''}</div>
          <div className="em-msg"><div className="strong">{fill(v.subject, { first: first?.first, company: first?.company, me: me.name, ours: db.settings.companyName }) || '(no subject)'}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{fill(tpl?.body, { first: first?.first, company: first?.company, me: me.name, ours: db.settings.companyName })}</div><div className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 6 }}>{footerText(db.settings)}</div></div>
          {v.subjectB && <div className="small">Second subject: <strong>{fill(v.subjectB, { first: first?.first, company: first?.company })}</strong></div>}
        </div>
      </div>
    </Modal>
  );
}

export function EmailCampaigns() {
  const { db, can, remove, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const canSend = can('emails', 'campaigns');
  const list = [...(db.emailCampaigns || [])].sort((a, b) => (b.sentAt || b.scheduledAt || b.createdAt || '').localeCompare(a.sentAt || a.scheduledAt || a.createdAt || ''));
  return (
    <div className="stack">
      <div className="row between wrap"><div className="sub">Send one template to many people. Everyone gets their own copy with an unsubscribe line, and people who unsubscribed or bounced are left out.</div>{canSend && <Btn kind="primary" icon="Megaphone" onClick={() => setAdding(true)}>New campaign</Btn>}</div>
      {!list.length ? <div className="card"><Empty icon="Megaphone" text="No campaigns yet." /></div> : list.map((c) => {
        const mails = (db.emails || []).filter((e) => e.campaignId === c.id);
        const r = rates(mails);
        const ab = winnerOf(c, mails);
        const of = (n) => (r.delivered ? pct((n / r.delivered) * 100) : '—');
        return (
          <Card key={c.id} title={<span className="row" style={{ gap: 8 }}>{c.name}<Badge tone={STATUS_TONE[c.status] || 'muted'}>{c.status}</Badge></span>} sub={c.status === 'Scheduled' ? `Goes out ${fmtDT(c.scheduledAt)}` : c.sentAt ? `Sent ${fmtDT(c.sentAt)}` : ''}
            action={canSend && c.status === 'Scheduled' && <Btn sm kind="ghost" icon="X" onClick={() => setDel(c)}>Cancel</Btn>}>
            {c.status === 'Sent' ? <div className="stack-s">
              <div className="wa-stats em-stats">{[['Sent', r.sent, `${c.skipped ? c.skipped.suppressed + c.skipped.noEmail : 0} left out`], ['Opened', r.opened, of(r.opened)], ['Clicked', r.clicked, of(r.clicked)], ['Replied', r.replied, of(r.replied)], ['Bounced', r.bounced, r.sent ? pct((r.bounced / r.sent) * 100) : '—'], ['Unsubscribed', r.unsub, of(r.unsub)]].map(([l, n, s]) => <div key={l}><div className="kpi-label">{l}</div><div className="kpi-value">{num(n)}</div><div className="small muted">{s}</div></div>)}</div>
              {ab && <div className="em-ab">
                {[['A', c.subject, ab.a], ['B', c.subjectB, ab.b]].map(([k, s, x]) => <div key={k} className={ab.winner === k ? 'win' : ''}><span className="small muted">Subject {k}{ab.winner === k ? ' · more opens' : ''}</span><div className="strong trunc">{s}</div><div className="small">{x.delivered ? pct((x.opened / x.delivered) * 100) : '—'} opened of {x.delivered}</div></div>)}
                {ab.winner === 'Tie' && <div className="small muted">Too close to call.</div>}
                {!ab.winner && <div className="small muted">Waiting for enough opens to compare.</div>}
              </div>}
            </div> : <div className="small muted">{c.status === 'Scheduled' ? 'Nothing has gone out yet.' : 'Sending…'}</div>}
          </Card>
        );
      })}
      <p className="small muted">Simulated: opens, clicks, bounces and unsubscribes come from the demo mail network. Nothing leaves the CRM.</p>
      {adding && <CampaignModal onClose={() => setAdding(false)} />}
      {del && <Confirm title={`Cancel ${del.name}?`} text="It won't be sent." confirmLabel="Cancel campaign" onClose={() => setDel(null)} onConfirm={() => { remove('emailCampaigns', del.id); toast('Campaign cancelled'); }} />}
    </div>
  );
}

export function EmailResults() {
  const { db, scope, scopeOf, userName, optionsOf } = useStore();
  const [days, setDays] = useState('30');
  const since = new Date(Date.now() - Number(days) * 864e5).toISOString();
  const sent = scope(db.emails || [], 'emails').filter((e) => !e.incoming && !['Draft', 'Scheduled'].includes(e.status) && (e.at || '') >= since);
  const r = rates(sent);
  const of = (n) => (r.delivered ? pct((n / r.delivered) * 100) : '—');
  const count = (n) => String(Math.round(n));
  const people = [...new Set(sent.map((e) => e.ownerId))].map((id) => { const x = rates(sent.filter((e) => e.ownerId === id)); return { label: userName(id), opened: x.delivered ? (x.opened / x.delivered) * 100 : 0, replied: x.delivered ? (x.replied / x.delivered) * 100 : 0, n: x.sent }; }).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 10);
  const best = bestHour(sent);
  const hours = best ? best.counts.map((value, h) => ({ label: hourLabel(h), value })).filter((_, h) => h >= 7 && h <= 20) : [];
  const temps = emailTemplatesOf(db, optionsOf('emailTemplate')).map((t) => { const x = rates(sent.filter((e) => e.templateId === t.id)); return { label: t.name, opened: x.delivered ? (x.opened / x.delivered) * 100 : 0, replied: x.delivered ? (x.replied / x.delivered) * 100 : 0, n: x.sent }; }).filter((x) => x.n);
  return (
    <div className="stack">
      <Pills value={days} onChange={setDays} options={[{ k: '7', label: '7 days' }, { k: '30', label: '30 days' }, { k: '90', label: '90 days' }]} />
      <div className="g4">
        <Kpi label="Sent" value={num(r.sent)} note={`${num(r.bounced)} bounced (${r.sent ? pct((r.bounced / r.sent) * 100) : '—'})`} icon="Send" />
        <Kpi label="Opened" value={of(r.opened)} note={`${num(r.opened)} of ${num(r.delivered)} delivered`} icon="MailOpen" />
        <Kpi label="Replied" value={of(r.replied)} note={`${num(r.replied)} replies`} icon="Reply" />
        <Kpi label="Unsubscribed" value={num(r.unsub)} note={`${num((db.emailSuppressed || []).length)} on the do-not-email list`} icon="MailX" />
      </div>
      <div className="g2">
        {scopeOf('emails') !== 'own' && <Card title="By person" sub="Share opened and replied">{people.length ? <Bars horizontal data={people} series={[{ key: 'opened', name: 'Opened' }, { key: 'replied', name: 'Replied' }]} format={(x) => pct(x)} height={Math.max(160, people.length * 44)} /> : <Empty icon="Users" text="Not enough emails in this period." />}</Card>}
        <Card title="Best time to send" sub={best ? `Most opens around ${hourLabel(best.hour)}` : 'Opens by hour of the day'}>{hours.length ? <Bars data={hours} series={[{ key: 'value', name: 'Opens' }]} format={count} height={220} /> : <Empty icon="Clock" text="Not enough opens yet." />}</Card>
        <Card title="Templates" sub="Share opened and replied">{temps.length ? <Bars horizontal data={temps} series={[{ key: 'opened', name: 'Opened' }, { key: 'replied', name: 'Replied' }]} format={(x) => pct(x)} height={Math.max(160, temps.length * 44)} /> : <Empty icon="FileText" text="No template emails in this period." />}</Card>
      </div>
      <p className="small muted">Simulated: opens and replies come from the demo mail network.{emailOf(db.settings).tracking ? '' : ' Open tracking is off, so new emails stop at delivered.'}</p>
    </div>
  );
}

export function EmailSettings() {
  const { db, can, create, remove, updateSettings, toast } = useStore();
  const editable = can('emails', 'setup');
  const [v, setV] = useState(() => emailOf(db.settings));
  const [add, setAdd] = useState('');
  const [del, setDel] = useState(null);
  const [show, setShow] = useState('All');
  const changed = JSON.stringify(v) !== JSON.stringify(emailOf(db.settings));
  const list = (db.emailSuppressed || []).filter((x) => show === 'All' || x.reason === show);
  return (
    <div className="stack">
      {!editable && <div className="notice">You can see the email setup. Ask your Admin to change it.</div>}
      <div className="g2">
        <Card title="Campaign emails" sub="Added to the end of every campaign email">
          <fieldset disabled={!editable} className="plain-fieldset stack-s">
            <FormFields values={v} onChange={(k, x) => setV({ ...v, [k]: x })} fields={[
              { k: 'address', label: 'Your postal address', full: true, hint: 'Many countries ask for it in marketing email.' },
              { k: 'footer', label: 'Footer', type: 'textarea', rows: 3, full: true, hint: '{company} and {address} fill in.' },
              { k: 'dailyLimit', label: 'Most campaign emails a day', type: 'number', min: 1 },
              { k: 'tracking', label: 'Tracking', type: 'check', text: 'Track opens and clicks', full: true, hint: 'Some privacy rules ask you to turn this off or to ask first.' },
              { k: 'suppressBounces', label: 'Bounces', type: 'check', text: 'Stop emailing addresses that bounce', full: true },
            ]} />
            {editable && <div className="row"><Btn kind="primary" disabled={!changed} onClick={() => { updateSettings({ email: { ...v, dailyLimit: Number(v.dailyLimit) || 500 } }); toast('Email setup saved'); }}>Save</Btn></div>}
          </fieldset>
        </Card>
        <Card title="Do-not-email list" sub="Campaigns skip these addresses. One-to-one emails ask first." action={<Pills value={show} onChange={setShow} options={['All', 'Unsubscribed', 'Bounced', 'Added by hand']} />}>
          <div className="stack-s">
            {editable && <div className="row"><input className="input" aria-label="Email address to block" placeholder="name@example.com" value={add} onChange={(e) => setAdd(e.target.value)} /><Btn icon="Ban" onClick={() => { if (!validEmail(add)) { toast('Enter a valid email address.', 'bad'); return; } if (suppressedOf(db, add)) { toast('Already on the list.', 'bad'); return; } create('emailSuppressed', { email: add.trim().toLowerCase(), reason: 'Added by hand', at: new Date().toISOString() }); setAdd(''); toast('Address added'); }}>Add</Btn></div>}
            {!list.length ? <Empty icon="MailX" text="Nobody here." /> : list.slice(0, 40).map((x) => (
              <div key={x.id} className="dashlet"><span className="grow trunc"><strong>{x.email}</strong> <span className="small muted">{x.reason} · {fmtDT(x.at)}</span></span>{editable && <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${x.email}`} onClick={() => setDel(x)} />}</div>
            ))}
          </div>
        </Card>
      </div>
      {del && <Confirm title={`Remove ${del.email}?`} text={del.reason === 'Unsubscribed' ? 'They asked to stop. Only remove them if they asked to sign up again.' : 'Campaigns could reach this address again.'} confirmLabel="Remove" onClose={() => setDel(null)} onConfirm={() => { remove('emailSuppressed', del.id); toast('Removed from the list'); }} />}
    </div>
  );
}
