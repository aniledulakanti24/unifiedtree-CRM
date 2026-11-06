import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Card, Confirm, DataTable, Drawer, Empty, FormFields, Kpi, Modal, NoSections, PageHead, Pills, Progress, Tabs, firstAllowed } from '../ui';
import { Bars, Trend } from '../charts';
import { CONSENT_TEXT, TEMPLATES, answersOf, closedReason, contactError, formErrors, formItems, newForm, pagesOf, safeLink, shownItems, statDays, toInput, whereFrom } from '../formTools';
import { fmtDT, fmtShort, pct } from '../util';
import { FormBuilder } from './FormBuilder';

const accentStyle = (form) => (form.accent ? { '--brand': form.accent, '--brand-hover': form.accent, '--on-brand': '#fff' } : undefined);

// The form people fill in. The builder shows the same thing as a live preview.
export function FormRunner({ form, preview, company, onEvent, onSend }) {
  const items = useMemo(() => formItems(form), [form]);
  const [v, setV] = useState(() => Object.fromEntries(items.filter((i) => i.type === 'hidden').map((i) => [i.k, i.value || ''])));
  const [errors, setErrors] = useState({});
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [trap, setTrap] = useState('');
  const [sum] = useState(() => [2 + Math.floor(Math.random() * 7), 1 + Math.floor(Math.random() * 8)]);
  const opened = useRef(Date.now());
  const started = useRef(false);
  const head = useRef(null);
  const human = form.spam?.human && !preview;
  const pages = pagesOf(items, v);
  const at = Math.min(page, pages.length - 1);
  const last = at === pages.length - 1;
  const onPage = (n) => shownItems(items, v).filter((i) => (i.step || 1) === pages[n]);
  const shown = onPage(at);
  const extras = last ? [
    ...(form.consent ? [{ k: '__consent', label: 'Consent', type: 'check', req: true, text: form.consentText || CONSENT_TEXT }] : []),
    ...(human ? [{ k: '__human', label: `To show you're a person, what is ${sum[0]} + ${sum[1]}?`, req: true }] : []),
  ] : [];
  const change = (k, x) => {
    if (!started.current) { started.current = true; onEvent?.('start'); }
    setV((p) => ({ ...p, [k]: x }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const checkPage = (n) => {
    const er = { ...formErrors(onPage(n), v) };
    if (n === pages.length - 1) {
      extras.forEach((x) => { if (!v[x.k]) er[x.k] = x.k === '__consent' ? 'Please agree to carry on' : 'Please answer this'; });
      if (human && v.__human && Number(v.__human) !== sum[0] + sum[1]) er.__human = 'That answer is not right. Please try again.';
    }
    return er;
  };
  const go = (n) => { setPage(n); setTimeout(() => head.current?.focus(), 0); };
  const submit = (e) => {
    e.preventDefault();
    if (!last) {
      const er = checkPage(at);
      setErrors(er);
      if (Object.keys(er).length) return;
      onEvent?.('page', pages[at + 1]);
      go(at + 1);
      return;
    }
    // Check every page again, as answers on an earlier page may have changed what shows.
    for (let n = 0; n < pages.length; n++) {
      const er = checkPage(n);
      const reach = contactError(items, v);
      const mine = Object.keys(reach).some((k) => onPage(n).some((i) => i.k === k)) ? reach : {};
      const all = { ...er, ...mine };
      if (Object.keys(all).length) { setErrors(all); if (n !== at) go(n); return; }
    }
    const keep = new Set([...shownItems(items, v).map((i) => i.k), ...items.filter((i) => i.type === 'hidden').map((i) => i.k)]);
    const values = Object.fromEntries(Object.entries(v).filter(([k]) => keep.has(k)));
    onSend?.(values, { trap, seconds: Math.round((Date.now() - opened.current) / 100) / 10, consent: !!v.__consent });
    setDone(true);
  };
  useEffect(() => {
    if (!done || preview || form.after !== 'redirect' || !safeLink(form.redirect)) return undefined;
    const timer = setTimeout(() => { window.location.href = form.redirect.trim(); }, 1500);
    return () => clearTimeout(timer);
  }, [done]);
  const restart = () => { setV({}); setDone(false); setPage(0); setErrors({}); };
  return (
    <div className="wf-run" style={accentStyle(form)}>
      <h1 ref={head} tabIndex={-1} style={{ fontSize: 20, fontWeight: 680, outline: 'none' }}>{form.name || 'Untitled form'}</h1>
      <div className="sub" style={{ marginBottom: form.intro ? 6 : 16 }}>{company}</div>
      {form.intro && <p style={{ margin: '0 0 16px' }}>{form.intro}</p>}
      {done ? (
        <div className="stack-s">
          <div className="notice" role="status">{form.thanks || 'Thanks. We will be in touch soon.'}</div>
          {form.after === 'redirect' && safeLink(form.redirect) && <div className="small">{preview ? `After this, people go to ${form.redirect}` : <>Taking you on now. <a href={form.redirect}>Continue</a></>}</div>}
          {preview && <div><Btn sm icon="RotateCcw" onClick={restart}>Start again</Btn></div>}
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {pages.length > 1 && <div className="stack-s" aria-live="polite"><div className="small muted">Step {at + 1} of {pages.length}</div><Progress value={((at + 1) / pages.length) * 100} color={form.accent} /></div>}
          {!shown.length && !extras.length && <Empty icon="ListPlus" text="No fields on this form yet." />}
          <FormFields fields={[...shown.map(toInput), ...extras.map((x) => ({ ...x, full: true }))]} values={v} errors={errors} onChange={change} />
          <div className="wf-trap" aria-hidden="true"><label>Leave this empty<input tabIndex={-1} autoComplete="off" name="website_url" value={trap} onChange={(e) => setTrap(e.target.value)} /></label></div>
          <div className="row">
            {at > 0 && <Btn onClick={() => go(at - 1)}>Back</Btn>}
            <button type="submit" className="btn primary">{last ? form.button || 'Send' : 'Next'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PublicForm({ id }) {
  const { db, submitWebForm, trackForm } = useStore();
  const form = db.webForms?.find((f) => f.id === id);
  const query = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] || ''), []);
  const preview = query.get('preview') === '1';
  const closed = form && !preview ? closedReason(form) : '';
  const counted = useRef(false);
  useEffect(() => { if (form && !preview && !closed && !counted.current) { counted.current = true; trackForm(form.id, 'view'); } }, []);
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign'].map((k) => [k, (query.get(k) || '').slice(0, 80)]).filter(([, x]) => x));
  return (
    <div className="public-form">
      <div className="card card-b">
        {!form ? <Empty icon="FileX" text="This form isn't available." /> : closed ? (
          <div className="stack-s"><h1 style={{ fontSize: 20, fontWeight: 680 }}>{form.name}</h1><div className="notice">{closed}</div></div>
        ) : (
          <>
            {preview && <div className="notice" style={{ marginBottom: 12 }}>Preview. Nothing you send here is saved or counted.</div>}
            <FormRunner form={form} preview={preview} company={db.settings.companyName}
              onEvent={(kind, step) => !preview && trackForm(form.id, kind, step)}
              onSend={(values, meta) => !preview && submitWebForm(form, values, { ...meta, utm, referrer: document.referrer.slice(0, 200) })} />
          </>
        )}
        <div className="small muted" style={{ marginTop: 14 }}>Demo form. It only works in this browser until the CRM has a server.</div>
      </div>
    </div>
  );
}

const linkOf = (f, extra = '') => `${location.origin}${location.pathname}#/form/${f.id}${extra}`;
function ShareModal({ form, onClose }) {
  const { toast } = useStore();
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' });
  const q = Object.entries(utm).filter(([, x]) => x.trim()).map(([k, x]) => `${k}=${encodeURIComponent(x.trim())}`).join('&');
  const link = linkOf(form, q ? `?${q}` : '');
  const codes = [
    ['Link', link],
    ['Embed on a page', `<iframe src="${link}" title="${form.name}" width="100%" height="640" style="border:0"></iframe>`],
    ['Button that opens it', `<a href="${link}" target="_blank" rel="noopener">${form.button || 'Contact us'}</a>`],
  ];
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Copy did not work. Select the text and copy it.', 'warn'); } };
  return (
    <Modal title={`Share ${form.name}`} onClose={onClose} footer={<Btn onClick={onClose}>Done</Btn>}>
      <div className="stack">
        <div className="sub">Add a campaign so you can see which link brings enquiries. It shows on each enquiry and in Results.</div>
        <FormFields values={utm} onChange={(k, x) => setUtm({ ...utm, [k]: x })} fields={[{ k: 'utm_source', label: 'Source', placeholder: 'google' }, { k: 'utm_medium', label: 'Medium', placeholder: 'email' }, { k: 'utm_campaign', label: 'Campaign', placeholder: 'spring-offer', full: true }]} />
        {codes.map(([label, code]) => (
          <div key={label} className="field">
            <label className="label" htmlFor={`code-${label}`}>{label}</label>
            <textarea id={`code-${label}`} className="textarea wf-code" readOnly rows={label === 'Link' ? 2 : 3} value={code} onFocus={(e) => e.target.select()} />
            <div><Btn sm icon="Copy" onClick={() => copy(code, label)}>Copy</Btn></div>
          </div>
        ))}
        <p className="notice">Simulated: the form only works in this browser, so a copy on a real website won't send you leads until there's a server.</p>
      </div>
    </Modal>
  );
}

function FormsList({ canEdit, onEdit }) {
  const { db, create, update, remove, toast } = useStore();
  const [share, setShare] = useState(null);
  const [del, setDel] = useState(null);
  const forms = db.webForms || [];
  const totals = (f) => { const days = statDays(db.formStats, [f.id], 30); const views = days.reduce((a, x) => a + x.view, 0); const sent = days.reduce((a, x) => a + x.sent, 0); return { views, sent, rate: views ? (sent / views) * 100 : 0 }; };
  if (!forms.length) return <div className="card"><Empty icon="ClipboardList" text="No forms yet." /></div>;
  return (
    <div className="stack-s">
      {forms.map((f) => {
        const t = totals(f);
        const closed = closedReason(f);
        return (
          <Card key={f.id} title={<span className="row" style={{ gap: 8 }}>{f.name}<Badge tone={closed ? 'warn' : 'good'}>{closed ? (f.status === 'Paused' ? 'Paused' : 'Closed') : 'Live'}</Badge></span>}
            sub={`${f.submissions || 0} ${f.submissions === 1 ? 'enquiry' : 'enquiries'} in all · Last 30 days: ${t.views} views, ${t.sent} sent (${pct(t.rate)}) · Source: ${f.source}`}
            action={<span className="row wrap">
              <a className="btn sm" href={linkOf(f, '?preview=1')} target="_blank" rel="noreferrer">Preview</a>
              <Btn sm icon="Share2" onClick={() => setShare(f)}>Share</Btn>
              {canEdit && <Btn sm kind="ghost" icon={f.status === 'Paused' ? 'Play' : 'Pause'} aria-label={f.status === 'Paused' ? `Turn on ${f.name}` : `Pause ${f.name}`} onClick={() => { update('webForms', f.id, { status: f.status === 'Paused' ? 'Live' : 'Paused' }); toast(f.status === 'Paused' ? 'Form is live' : 'Form paused'); }} />}
              {canEdit && <Btn sm kind="ghost" icon="Pencil" aria-label={`Edit ${f.name}`} onClick={() => onEdit(f)} />}
              {canEdit && <Btn sm kind="ghost" icon="CopyPlus" aria-label={`Copy ${f.name}`} onClick={() => { const { id, createdAt, ...rest } = f; create('webForms', { ...rest, items: formItems(f), name: `${f.name} (copy)`, submissions: 0, status: 'Paused' }); toast('Copy made. It is paused until you turn it on.'); }} />}
              {canEdit && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${f.name}`} onClick={() => setDel(f)} />}
            </span>}>
            <div className="row wrap">{formItems(f).map((x) => <Badge key={x.k} tone="muted" dot={false}>{x.label}{x.req ? ' *' : ''}{x.showIf?.k ? ' (sometimes)' : ''}{(x.step || 1) > 1 ? ` · page ${x.step}` : ''}</Badge>)}</div>
            {closed && <div className="small muted" style={{ marginTop: 8 }}>{closed}</div>}
          </Card>
        );
      })}
      {share && <ShareModal form={share} onClose={() => setShare(null)} />}
      {del && <Confirm title={`Delete ${del.name}?`} text="Leads and enquiries it already brought in stay." onClose={() => setDel(null)} onConfirm={() => { remove('webForms', del.id); toast('Form deleted'); }} />}
    </div>
  );
}

const RESULT_TONE = { 'Lead created': 'good', 'Lead, known contact': 'good', 'Added to a lead': 'info', Spam: 'warn' };
function Enquiries({ canEdit }) {
  const { db, userName, enquiryNotSpam, removeEnquiries, toast } = useStore();
  const [formId, setFormId] = useState('');
  const [open, setOpen] = useState(null);
  const [del, setDel] = useState(null);
  const formName = (id) => db.webForms.find((f) => f.id === id)?.name || 'Deleted form';
  const rows = (db.formSubmissions || []).filter((s) => !formId || s.formId === formId);
  const cur = open && (db.formSubmissions || []).find((s) => s.id === open);
  const form = cur && db.webForms.find((f) => f.id === cur.formId);
  const spam = rows.filter((s) => s.status === 'Spam');
  return (
    <div className="stack">
      <div className="row wrap">
        <select className="select tb-filter" aria-label="Form" value={formId} onChange={(e) => setFormId(e.target.value)}><option value="">All forms</option>{db.webForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        {canEdit && spam.length > 0 && <Btn sm kind="ghost" icon="Trash2" onClick={() => setDel(spam.map((s) => s.id))}>Delete {spam.length} spam</Btn>}
      </div>
      <DataTable rows={rows} exportName="web-enquiries" initialSort={{ k: 'at', dir: 'desc' }} onRow={(r) => setOpen(r.id)} emptyText="No enquiries yet."
        statusTabs={{ options: ['Lead created', 'Lead, known contact', 'Added to a lead', 'Spam'], get: (s) => s.status }}
        columns={[
          { k: 'at', label: 'When', value: (s) => s.at, render: (s) => fmtDT(s.at), nowrap: true },
          { k: 'name', label: 'Name', value: (s) => (s.erased ? 'Erased person' : s.values?.name || s.values?.email || '—') },
          { k: 'email', label: 'Email', value: (s) => s.values?.email || '' },
          { k: 'form', label: 'Form', value: (s) => formName(s.formId) },
          { k: 'from', label: 'Came from', value: whereFrom },
          { k: 'owner', label: 'Went to', value: (s) => (s.ownerId ? userName(s.ownerId) : '—') },
          { k: 'status', label: 'Result', value: (s) => s.status, render: (s) => <Badge tone={RESULT_TONE[s.status] || 'muted'}>{s.status}</Badge> },
        ]} />
      {cur && (
        <Drawer title={cur.erased ? 'Erased enquiry' : cur.values?.name || cur.values?.email || 'Enquiry'} onClose={() => setOpen(null)} footer={canEdit && <>
          {cur.status === 'Spam' && <Btn kind="primary" icon="ShieldCheck" disabled={!form} onClick={() => { if (enquiryNotSpam(cur.id)) toast('Moved out of spam and sent to the right person'); }}>Not spam</Btn>}
          <Btn kind="ghost" icon="Trash2" onClick={() => setDel([cur.id])}>Delete</Btn>
        </>}>
          <div className="stack">
            <div className="row wrap"><Badge tone={RESULT_TONE[cur.status] || 'muted'}>{cur.status}</Badge><span className="small muted">{fmtDT(cur.at)} · {formName(cur.formId)}</span></div>
            {cur.reason && <div className="notice">Why it was held: {cur.reason}. People sending spam see the normal thank-you message.</div>}
            {cur.status === 'Spam' && !form && <div className="small muted">The form was deleted, so this can't be let through.</div>}
            <Card title="Answers" pad>
              {cur.erased ? <div className="muted">The details were erased at the person's request.</div> : (
                <dl className="wf-answers">{(form ? answersOf(form, cur.values || {}) : Object.entries(cur.values || {}).map(([k, value]) => ({ k, label: k, value: String(value) }))).map((a) => <React.Fragment key={a.k}><dt>{a.label}</dt><dd>{a.value}</dd></React.Fragment>)}</dl>
              )}
            </Card>
            <Card title="What happened" pad>
              <dl className="wf-answers">
                <dt>Came from</dt><dd>{whereFrom(cur)}{cur.utm?.utm_campaign ? ` · ${cur.utm.utm_campaign}` : ''}</dd>
                {cur.seconds != null && <><dt>Time to fill in</dt><dd>{cur.seconds} seconds</dd></>}
                {cur.ownerId && <><dt>Went to</dt><dd>{userName(cur.ownerId)}{cur.why ? `. ${cur.why}.` : ''}</dd></>}
                {cur.autoReply && <><dt>Reply sent</dt><dd>{cur.autoReply}</dd></>}
                {cur.leadId && <><dt>Lead</dt><dd><a href={`#/leads?open=${cur.leadId}`}>Open the lead</a></dd></>}
              </dl>
            </Card>
          </div>
        </Drawer>
      )}
      {del && <Confirm title={del.length > 1 ? `Delete ${del.length} enquiries?` : 'Delete this enquiry?'} text="The log entry goes. Any lead it made stays." confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => { removeEnquiries(del); setOpen(null); toast(del.length > 1 ? 'Enquiries deleted' : 'Enquiry deleted'); }} />}
    </div>
  );
}

function Results() {
  const { db } = useStore();
  const [days, setDays] = useState('30');
  const [formId, setFormId] = useState('');
  const ids = formId ? [formId] : (db.webForms || []).map((f) => f.id);
  const list = statDays(db.formStats, ids, Number(days));
  const total = (k) => list.reduce((a, x) => a + x[k], 0);
  const views = total('view');
  const sent = total('sent');
  const since = list[0]?.key;
  const subs = (db.formSubmissions || []).filter((s) => ids.includes(s.formId) && s.at.slice(0, 10) >= since && s.status !== 'Spam');
  const leads = db.leads.filter((l) => l.webFormId && ids.includes(l.webFormId));
  const form = formId && db.webForms.find((f) => f.id === formId);
  const pageSteps = form ? [...new Set(formItems(form).map((i) => i.step || 1))].sort((a, b) => a - b).slice(1) : [];
  const funnel = [['Opened the form', views], ['Started typing', total('start')], ...pageSteps.map((p) => [`Reached page ${p}`, list.reduce((a, x) => a + (x.pages[p] || 0), 0)]), ['Sent it', sent]];
  const by = (arr, key) => Object.entries(arr.reduce((a, x) => { const k = key(x); a[k] = (a[k] || 0) + 1; return a; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const count = (n) => String(Math.round(n));
  const trend = list.map((x) => ({ label: fmtShort(x.key), views: x.view, sent: x.sent }));
  return (
    <div className="stack">
      <div className="row wrap">
        <Pills value={days} onChange={setDays} options={[{ k: '7', label: '7 days' }, { k: '30', label: '30 days' }, { k: '90', label: '90 days' }]} />
        <select className="select tb-filter" aria-label="Form" value={formId} onChange={(e) => setFormId(e.target.value)}><option value="">All forms</option>{db.webForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      </div>
      <div className="g4">
        <Kpi label="Views" value={count(views)} note="Times a form was opened" icon="Eye" />
        <Kpi label="Sent" value={count(sent)} note={`${pct(views ? (sent / views) * 100 : 0)} of views`} icon="Send" />
        <Kpi label="Spam held back" value={count(total('spam'))} note="Kept out of your leads" icon="ShieldAlert" />
        <Kpi label="Became customers" value={count(leads.filter((l) => l.status === 'Converted').length)} note={`Of ${leads.length} leads from forms, all time`} icon="BadgeCheck" />
      </div>
      <Card title="Views and enquiries by day" sub="Both are counts, on the same scale.">
        <Trend data={trend} series={[{ key: 'views', name: 'Views' }, { key: 'sent', name: 'Sent' }]} format={count} height={240} />
      </Card>
      <div className="g2">
        <Card title="Where people stop" sub={form ? 'From opening the form to sending it' : 'Pick one form to see each page'}>
          <div className="stack-s">{funnel.map(([label, n]) => (
            <div key={label}><div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{label}</span><span className="small"><strong>{count(n)}</strong>{views ? ` · ${pct((n / views) * 100)}` : ''}</span></div><Progress value={views ? (n / views) * 100 : 0} /></div>
          ))}</div>
        </Card>
        <Card title="Where enquiries come from" sub="From the campaign in the link">
          {subs.length ? <Bars horizontal data={by(subs, whereFrom)} series={[{ key: 'value', name: 'Enquiries' }]} format={count} height={Math.max(140, by(subs, whereFrom).length * 38)} /> : <Empty icon="Link" text="No enquiries in this period." />}
        </Card>
      </div>
      <Card title="What happened to the leads" sub="Status of leads that came from these forms, all time">
        {leads.length ? <Bars horizontal data={by(leads, (l) => l.status)} series={[{ key: 'value', name: 'Leads' }]} format={count} height={Math.max(140, by(leads, (l) => l.status).length * 38)} /> : <Empty icon="Users" text="No leads from forms yet." />}
      </Card>
      <p className="small muted">Simulated: views only count opens in this browser. The sample company's history was made up once to show the page.</p>
    </div>
  );
}

function TemplatePicker({ onPick, onClose }) {
  return (
    <Modal title="New web form" onClose={onClose}>
      <div className="wf-templates">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" className="card wf-tpl" onClick={() => onPick(t)}>
            <strong>{t.name}</strong><span className="small muted">{t.text}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default function WebForms() {
  const { t, can, sec, prefs, savePrefs } = useStore();
  const [edit, setEdit] = useState(null);
  const [picking, setPicking] = useState(false);
  const canEdit = can('webforms', 'edit');
  const tabs = [{ k: 'forms', label: 'Forms', icon: 'ClipboardList' }, { k: 'enquiries', label: 'Enquiries', icon: 'Inbox' }, { k: 'results', label: 'Results', icon: 'BarChart3' }].filter((x) => sec('webforms', x.k));
  const tab = firstAllowed(tabs, prefs.webformsTab);
  return (
    <div>
      <PageHead title={t('webforms')} sub="Put a form on your website. Each enquiry becomes a lead, goes to the right person and runs your automation rules.">
        {canEdit && <Btn kind="primary" icon="Plus" onClick={() => setPicking(true)}>New form</Btn>}
      </PageHead>
      {!tabs.length ? <NoSections /> : <>
        <Tabs value={tab} onChange={(k) => savePrefs({ webformsTab: k })} tabs={tabs} />
        <div style={{ marginTop: 14 }}>
          {tab === 'forms' && <FormsList canEdit={canEdit} onEdit={setEdit} />}
          {tab === 'enquiries' && <Enquiries canEdit={canEdit} />}
          {tab === 'results' && <Results />}
        </div>
      </>}
      {picking && <TemplatePicker onClose={() => setPicking(false)} onPick={(tpl) => { setPicking(false); setEdit({ ...newForm(), ...tpl.make() }); }} />}
      {edit && <FormBuilder initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
