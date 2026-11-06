import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Drawer, Empty, Icon, ListField, Modal, NoSections, PageHead, Pills, Stat, Tabs, firstAllowed } from '../ui';
import { emailTemplatesOf, splitList, suppressedOf, validEmail } from '../emailTools';
import { BestTimeHint, EmailCampaigns, EmailResults, EmailSettings, EmailTemplates, LinkRecord } from './EmailExtras';
import { fmtDT, pct, relTime } from '../util';
import { WritingHelp } from '../askPanel';
import { suggestReply } from '../assistant';

const TONE = { Scheduled: 'info', Draft: 'muted', Sent: 'muted', Delivered: 'info', Opened: 'warn', Clicked: 'warn', Replied: 'good', Bounced: 'bad' };
const fill = (text, first, company, me) => String(text || '').replace(/\{name\}/g, first || 'there').replace(/\{company\}/g, company || 'your company').replace(/\{me\}/g, me);
const nowLocal = (mins) => { const d = new Date(Date.now() + mins * 6e4); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };

function Compose({ initial, onClose }) {
  const { db, me, can, scope, sendEmail, saveEmailDraft, removeEmail, prefs, savePrefs, companyName, toast, optionsOf } = useStore();
  const people = useMemo(() => [
    ...(can('contacts') ? scope(db.contacts) : []).filter((c) => c.email).map((c) => ({ email: c.email, first: c.first, label: `${c.first} ${c.last}`, company: companyName(c.companyId), relatedType: 'contact', relatedId: c.id })),
    ...(can('leads') ? scope(db.leads) : []).filter((l) => l.email).map((l) => ({ email: l.email, first: l.name.split(' ')[0], label: l.name, company: l.company, relatedType: 'lead', relatedId: l.id })),
  ], [db.contacts, db.leads]);
  const fwd = initial?.forward;
  const [v, setV] = useState(() => ({ to: '', cc: '', bcc: '', subject: '', body: '', ...initial, ...(fwd ? { to: '', subject: `Fwd: ${fwd.subject}`, body: `\n\n---------- Forwarded message ----------\n${fwd.incoming ? 'From' : 'To'}: ${fwd.to}\nDate: ${fmtDT(fwd.at)}\nSubject: ${fwd.subject}\n\n${fwd.body || ''}${fwd.reply ? `\n\n${fwd.name || fwd.to} replied:\n${fwd.reply}` : ''}` } : {}) }));
  const [showCc, setShowCc] = useState(!!(initial?.cc || initial?.bcc));
  const [templateId, setTemplateId] = useState(initial?.templateId || '');
  const [remind, setRemind] = useState('');
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const temps = emailTemplatesOf(db, optionsOf('emailTemplate'));
  const [files, setFiles] = useState(initial?.files || []);
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState(nowLocal(60));
  const [error, setError] = useState('');
  const put = (k, x) => { setV((p) => ({ ...p, [k]: x })); setError(''); };
  const match = people.find((p) => p.email.toLowerCase() === v.to.trim().toLowerCase());
  const signature = prefs.signature ?? `Regards,\n${me.name}`;
  const finalBody = () => { const b = fill(v.body, match?.first, match?.company, me.name); return v.reply || b.includes(signature) ? b : `${b}\n\n${signature}`; };
  const check = () => {
    if (!validEmail(v.to.trim())) { setError('Enter a valid email address.'); return false; }
    const extra = [...splitList(v.cc), ...splitList(v.bcc)];
    if (extra.some((x) => !validEmail(x))) { setError('Check the Cc and Bcc addresses.'); return false; }
    if (!v.subject.trim()) { setError('Add a subject.'); return false; }
    return true;
  };
  const blocked = suppressedOf(db, v.to);
  const send = () => {
    if (!check()) return;
    if (blocked && !confirmBlocked) { setConfirmBlocked(true); setError(`${v.to.trim()} is on the do-not-email list (${blocked.reason.toLowerCase()}). Press Send again to email them anyway.`); return; }
    const at = later ? new Date(when).toISOString() : null;
    if (later && at <= new Date().toISOString()) { setError('Pick a time in the future.'); return; }
    if (initial?.id) removeEmail(initial.id);
    sendEmail({ to: v.to.trim(), subject: fill(v.subject, match?.first, match?.company, me.name).trim(), body: finalBody(), ownerId: me.id, relatedType: match?.relatedType || '', relatedId: match?.relatedId || '', files, sendAt: at, name: match?.label, cc: splitList(v.cc).join(', '), bcc: splitList(v.bcc).join(', '), templateId: templateId || undefined, remindAt: remind ? new Date(new Date(at || Date.now()).getTime() + Number(remind) * 864e5).toISOString() : undefined });
    toast(at ? `Scheduled for ${fmtDT(at)}` : 'Sent (simulated)');
    onClose();
  };
  return (
    <Modal size="lg" title={initial?.id ? 'Edit draft' : fwd ? 'Forward email' : 'New email'} onClose={onClose} footer={<>{error && <span className="error-text" style={{ marginInlineEnd: 'auto' }}>{error}</span>}<Btn onClick={onClose}>Discard</Btn><Btn onClick={() => { saveEmailDraft({ ...v, files, ownerId: me.id }); toast('Draft saved'); onClose(); }}>Save draft</Btn><Btn kind="primary" icon={later ? 'Clock' : 'Send'} onClick={send}>{later ? 'Schedule' : 'Send'}</Btn></>}>
      <div className="stack-s">
        <div className="field"><label className="label" htmlFor="em-to">To</label><input id="em-to" className="input" list="em-people" autoFocus value={v.to} onChange={(e) => put('to', e.target.value)} placeholder="Name or email" /><datalist id="em-people">{people.slice(0, 200).map((p) => <option key={p.email + p.relatedId} value={p.email}>{p.label}</option>)}</datalist>{match && <span className="hint">{match.label}{match.company ? `, ${match.company}` : ''}. This email is saved on their record.</span>}</div>
        {!showCc && <div><button type="button" className="link-btn" onClick={() => setShowCc(true)}>Add Cc or Bcc</button></div>}
        {showCc && <div className="form-grid">
          <div className="field"><label className="label" htmlFor="em-cc">Cc</label><input id="em-cc" className="input" value={v.cc} onChange={(e) => put('cc', e.target.value)} placeholder="Separate with commas" /></div>
          <div className="field"><label className="label" htmlFor="em-bcc">Bcc</label><input id="em-bcc" className="input" value={v.bcc} onChange={(e) => put('bcc', e.target.value)} placeholder="Hidden from others" /></div>
        </div>}
        {blocked && <div className="notice">{v.to.trim()} is on the do-not-email list: {blocked.reason.toLowerCase()} on {fmtDT(blocked.at)}.</div>}
        <div className="field"><label className="label" htmlFor="em-subject">Subject</label><input id="em-subject" className="input" value={v.subject} onChange={(e) => put('subject', e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="em-tpl">Template</label><select id="em-tpl" className="select" value={templateId} onChange={(e) => { const t = temps.find((x) => x.id === e.target.value); setTemplateId(e.target.value); if (t) { setV((p) => ({ ...p, body: t.body, subject: t.subject && !p.subject ? fill(t.subject.replace('{our_company}', db.settings.companyName), match?.first, match?.company, me.name) : p.subject })); setError(''); } }}><option value="">Write my own</option>{temps.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.folder})</option>)}</select></div>
        <WritingHelp text={v.body} first={match?.first} company={match?.company} onDraft={(m) => { setV((p) => ({ ...p, subject: p.subject || m.subject, body: m.body })); setError(''); }} onText={(x) => put('body', x)} />
        <div className="field"><label className="label" htmlFor="em-body">Message</label><textarea id="em-body" className="textarea" rows={7} value={v.body} onChange={(e) => put('body', e.target.value)} /><span className="hint">{'{name}'}, {'{company}'} and {'{me}'} fill in when it's sent.</span></div>
        <div className="row wrap">
          <label className="btn sm" style={{ cursor: 'pointer' }}><Icon name="Paperclip" size={14} />Attach<input type="file" hidden onChange={(e) => { const f = e.target.files[0]; if (f) setFiles((p) => [...p, { name: f.name, size: f.size }]); e.target.value = ''; }} /></label>
          {files.map((f) => <span key={f.name} className="em-chip"><Icon name="Paperclip" size={12} />{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}><Icon name="X" size={12} /></button></span>)}
          <span className="grow" />
          <label className="check small"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />Send later</label>
          {later && <input className="input" style={{ width: 200 }} type="datetime-local" aria-label="When to send" value={when} onChange={(e) => setWhen(e.target.value)} />}
          <select className="select tb-filter" aria-label="Remind me if no reply" value={remind} onChange={(e) => setRemind(e.target.value)}><option value="">No reminder</option><option value="1">Remind me if no reply in 1 day</option><option value="3">Remind me if no reply in 3 days</option><option value="7">Remind me if no reply in a week</option></select>
        </div>
        {later && <BestTimeHint />}
        <details className="small"><summary className="muted" style={{ cursor: 'pointer' }}>Signature</summary><textarea className="textarea" rows={3} aria-label="Your signature" style={{ marginTop: 6 }} value={signature} onChange={(e) => savePrefs({ signature: e.target.value })} /></details>
      </div>
    </Modal>
  );
}

function Bulk({ onClose }) {
  const { db, me, can, scope, sendBulkEmail, companyName, toast } = useStore();
  const [audience, setAudience] = useState(can('leads') ? 'newLeads' : 'contacts');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hi {name},\n\n');
  const lists = {
    ...(can('leads') ? { newLeads: ['New leads', scope(db.leads).filter((l) => l.status === 'New' && l.email).map((l) => ({ email: l.email, first: l.name.split(' ')[0], company: l.company, relatedType: 'lead', relatedId: l.id, ownerId: l.ownerId }))] } : {}),
    ...(can('contacts') ? { contacts: ['All my contacts', scope(db.contacts).filter((c) => c.email).map((c) => ({ email: c.email, first: c.first, company: companyName(c.companyId), relatedType: 'contact', relatedId: c.id, ownerId: c.ownerId }))], warm: ['Warm contacts', scope(db.contacts).filter((c) => c.email && c.status === 'Warm').map((c) => ({ email: c.email, first: c.first, company: companyName(c.companyId), relatedType: 'contact', relatedId: c.id, ownerId: c.ownerId }))] } : {}),
  };
  const list = lists[audience]?.[1] || [];
  const send = () => { const n = sendBulkEmail(list.slice(0, 100).map((p) => ({ to: p.email, subject: fill(subject, p.first, p.company, me.name), body: `${fill(body, p.first, p.company, me.name)}\n\nRegards,\n${me.name}`, ownerId: p.ownerId || me.id, relatedType: p.relatedType, relatedId: p.relatedId, name: p.first }))); toast(`${n} emails sent (simulated)`); onClose(); };
  return (
    <Modal size="lg" title="Bulk email" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="Send" disabled={!list.length || !subject.trim() || !body.trim()} onClick={send}>Send to {Math.min(list.length, 100)}</Btn></>}>
      <div className="stack-s">
        <div className="field"><label className="label" htmlFor="bk-to">Send to</label><select id="bk-to" className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>{Object.entries(lists).map(([k, [l, rows]]) => <option key={k} value={k}>{l} ({rows.length})</option>)}</select>{list.length > 100 && <span className="hint">Limited to the first 100 at a time.</span>}</div>
        <div className="field"><label className="label" htmlFor="bk-subject">Subject</label><input id="bk-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="For example, A quick update for {company}" /></div>
        <div className="field"><label className="label" htmlFor="bk-body">Message</label><textarea id="bk-body" className="textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} /><span className="hint">Each person gets their own copy, with {'{name}'} and {'{company}'} filled in.</span></div>
        {list[0] && <div className="notice"><strong>Preview for {list[0].first}:</strong> {fill(subject, list[0].first, list[0].company, me.name) || '(no subject)'}</div>}
      </div>
    </Modal>
  );
}

const STEPS = ['Sent', 'Delivered', 'Opened', 'Clicked', 'Replied'];

export default function Emails() {
  const { db, t, can, scope, simulateEmailReply, simulateIncomingEmail, removeEmail, sendEmailReply, toast, me, sec, prefs, savePrefs } = useStore();
  const tabs = [{ k: 'mail', label: 'Mail', icon: 'Mail' }, { k: 'templates', label: 'Templates', icon: 'FileText' }, { k: 'campaigns', label: 'Campaigns', icon: 'Megaphone' }, { k: 'results', label: 'Results', icon: 'BarChart3' }, { k: 'settings', label: 'Settings', icon: 'Settings2' }].filter((x) => x.k === 'mail' || sec('emails', x.k));
  const [picked, setPicked] = useState(prefs.emailTab);
  const tab = firstAllowed(tabs, picked);
  const [folder, setFolder] = useState('inbox');
  const [compose, setCompose] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [reply, setReply] = useState('');
  const rows = scope(db.emails || [], 'emails');
  const open = rows.find((e) => e.id === openId);
  const inbox = rows.filter((e) => e.reply || e.incoming);
  const sent = rows.filter((e) => !e.incoming && !['Draft', 'Scheduled'].includes(e.status));
  const folders = { inbox, sent, scheduled: rows.filter((e) => e.status === 'Scheduled'), drafts: rows.filter((e) => e.status === 'Draft') };
  const shown = folders[folder].filter((e) => `${e.subject} ${e.to} ${e.name || ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.replyAt || b.at).localeCompare(a.replyAt || a.at));
  const unread = inbox.filter((e) => !e.seen).length;
  const measured = sent.filter((e) => e.status !== 'Bounced');
  const opened = measured.filter((e) => ['Opened', 'Clicked', 'Replied'].includes(e.status)).length;
  const replied = measured.filter((e) => e.status === 'Replied').length;
  const openMail = (e) => { if (e.status === 'Draft') { setCompose(e); return; } setOpenId(e.id); setReply(''); if ((e.reply || e.incoming) && !e.seen) sendEmailReply(e.id, null); };
  return (
    <div>
      <PageHead title={t('emails')} sub="A simulated mail network: messages move through delivered, opened and replied by themselves, but nothing leaves the CRM.">
        {tab === 'mail' && can('emails', 'create') && <Btn icon="Inbox" onClick={() => { simulateIncomingEmail(); toast('New email received (simulated)'); setFolder('inbox'); }}>Simulate incoming</Btn>}
        {tab === 'mail' && can('emails', 'create') && <Btn kind="primary" icon="PenLine" onClick={() => setCompose({})}>New email</Btn>}
      </PageHead>
      {tabs.length > 1 && <div style={{ marginBottom: 14 }}><Tabs value={tab} onChange={(k) => { setPicked(k); savePrefs({ emailTab: k }); }} tabs={tabs} /></div>}
      {tab === 'templates' && <EmailTemplates />}
      {tab === 'campaigns' && <EmailCampaigns />}
      {tab === 'results' && <EmailResults />}
      {tab === 'settings' && <EmailSettings />}
      {tab === 'mail' && <>
      <div className="g4" style={{ marginBottom: 14 }}>
        <Stat label="Sent" value={sent.length} icon="Send" />
        <Stat label="Open rate" value={measured.length ? pct((opened / measured.length) * 100) : '—'} note={`${opened} of ${measured.length} delivered`} icon="MailOpen" />
        <Stat label="Reply rate" value={measured.length ? pct((replied / measured.length) * 100) : '—'} note={`${replied} replies`} icon="Reply" />
        <Stat label="Unread" value={unread} note="In your inbox" icon="Inbox" />
      </div>
      <div className="row wrap between" style={{ marginBottom: 10 }}>
        <Pills value={folder} onChange={setFolder} options={[['inbox', 'Inbox'], ['sent', 'Sent'], ['scheduled', 'Scheduled'], ['drafts', 'Drafts']].map(([k, label]) => ({ k, label, count: folders[k].length }))} />
        <input className="input" style={{ maxWidth: 260 }} aria-label="Search email" placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card em-list">
        {!shown.length && <Empty icon="Mail" text={folder === 'inbox' ? 'No replies yet. Replies to your emails appear here.' : 'Nothing here.'} />}
        {shown.map((e) => (
          <button key={e.id} type="button" className={`em-row ${(e.reply || e.incoming) && !e.seen ? 'unread' : ''}`} onClick={() => openMail(e)}>
            <span className="em-to trunc">{folder === 'inbox' ? e.name || e.to : e.to || '(no recipient)'}</span>
            <span className="grow trunc"><strong>{e.subject || '(no subject)'}</strong> <span className="muted">{(e.reply || e.body || '').replace(/\s+/g, ' ').slice(0, 90)}</span></span>
            {e.files?.length > 0 && <Icon name="Paperclip" size={13} color="var(--ink-3)" />}
            {e.auto && <Badge tone="muted" dot={false}>Automation</Badge>}
            <Badge tone={TONE[e.status] || 'muted'} dot={false}>{e.status}</Badge>
            <span className="small muted nowrap">{relTime(e.status === 'Scheduled' ? e.sendAt : e.replyAt || e.at)}</span>
          </button>
        ))}
      </div>
      </>}
      {open && (
        <Drawer title={open.subject} onClose={() => setOpenId(null)} actions={open.status === 'Scheduled' ? <Btn sm kind="danger" onClick={() => { removeEmail(open.id); setOpenId(null); toast('Scheduled email cancelled'); }}>Cancel sending</Btn> : can('emails', 'create') ? <Btn sm icon="Forward" onClick={() => { setCompose({ forward: open }); setOpenId(null); }}>Forward</Btn> : undefined}>
          <div className="stack">
            <dl className="dl"><dt>{open.incoming ? 'From' : 'To'}</dt><dd>{open.to}</dd>{open.cc && <><dt>Cc</dt><dd>{open.cc}</dd></>}{open.bcc && <><dt>Bcc</dt><dd>{open.bcc}</dd></>}{open.remindAt && open.status !== 'Replied' && <><dt>Reminder</dt><dd>{open.reminded ? 'No reply came, so a follow-up was added' : `If no reply by ${fmtDT(open.remindAt)}`}</dd></>}<dt>{open.status === 'Scheduled' ? 'Sends' : 'Date'}</dt><dd>{fmtDT(open.status === 'Scheduled' ? open.sendAt : open.at)}</dd>{open.relatedId && <><dt>Linked to</dt><dd><Link to={open.relatedType === 'lead' ? `/leads?open=${open.relatedId}` : open.relatedType === 'deal' ? `/pipeline/${open.relatedId}` : open.relatedType === 'company' ? `/customers/${open.relatedId}` : `/contacts?open=${open.relatedId}`}>{open.name || `Open the ${open.relatedType}`}</Link></dd></>}</dl>
            {open.net && !open.incoming && open.status !== 'Scheduled' && (
              open.status === 'Bounced'
                ? <p className="notice" style={{ margin: 0 }}>This address bounced (simulated). Check that it's correct.{suppressedOf(db, open.to) ? ' It is now on the do-not-email list.' : ''}</p>
                : <div className="em-track" role="group" aria-label="Tracking">{STEPS.map((s) => { const done = STEPS.indexOf(open.status) >= STEPS.indexOf(s); return <span key={s} className={`em-step ${done ? 'on' : ''}`}><Icon name={done ? 'Check' : 'Circle'} size={12} />{s}</span>; })}</div>
            )}
            {open.unsubscribed && <p className="notice" style={{ margin: 0 }}>{open.name || open.to} unsubscribed from this email. Campaigns won't reach them again.</p>}
            {!open.relatedId && open.status !== 'Scheduled' && <LinkRecord email={open} />}
            <div className="em-msg"><div className="small muted">{open.incoming ? open.to : 'You'} · {fmtDT(open.at)}</div><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{open.body || '(No message)'}</div>{open.files?.map((f) => <div key={f.name} className="em-chip" style={{ marginTop: 6 }}><Icon name="Paperclip" size={12} />{f.name}</div>)}</div>
            {open.reply && <div className="em-msg in"><div className="small muted">{open.name || open.to} · {fmtDT(open.replyAt)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{open.reply}</div></div>}
            {(open.thread || []).map((m, i) => <div key={i} className={`em-msg ${m.mine ? '' : 'in'}`}><div className="small muted">{m.mine ? 'You' : open.name || open.to} · {fmtDT(m.at)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div></div>)}
            {open.status !== 'Scheduled' && can('emails', 'create') && (
              <div className="stack-s">
                <textarea className="textarea" rows={3} aria-label="Your reply" placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                {db.settings.aiWriter !== false && (open.reply || open.incoming) && <div><Btn sm icon="Sparkles" onClick={() => setReply(suggestReply(open.reply || open.body))}>Suggest a reply</Btn></div>}
                <div className="row wrap"><Btn kind="primary" icon="Reply" disabled={!reply.trim()} onClick={() => { sendEmailReply(open.id, `${reply.trim()}\n\nRegards,\n${me.name}`); setReply(''); toast('Reply sent (simulated)'); }}>Reply</Btn>{!open.incoming && open.status !== 'Replied' && open.status !== 'Bounced' && <Btn icon="Reply" onClick={() => { simulateEmailReply(open.id); toast('Customer reply simulated'); }}>Simulate customer reply</Btn>}</div>
              </div>
            )}
          </div>
        </Drawer>
      )}
      {compose && <Compose initial={compose.id || compose.forward ? compose : null} onClose={() => setCompose(null)} />}
      {bulk && <Bulk onClose={() => setBulk(false)} />}
    </div>
  );
}
