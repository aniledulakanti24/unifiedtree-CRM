import React, { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Confirm, FormFields, Icon, Modal, Tabs } from '../ui';
import { DEFAULT_ROUTE, DEFAULT_SPAM, FIELD_TYPES, STANDARD_FIELDS, formItems, hasChoices, isStandard, luminanceContrast, newForm, safeLink } from '../formTools';
import { uid } from '../util';
import { FormRunner } from './WebForms';

const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((x) => [x.value, x.label]));

function FieldRow({ item, index, items, open, onOpen, onChange, onMove, onRemove }) {
  const earlier = items.slice(0, index).filter((x) => x.type !== 'hidden');
  const parent = items.find((x) => x.k === item.showIf?.k);
  const set = (k, x) => {
    if (k === 'options') return onChange({ options: String(x).split('\n') });
    if (k === 'showK') return onChange({ showIf: x ? { k: x, value: '' } : undefined });
    if (k === 'showV') return onChange({ showIf: { ...item.showIf, value: x } });
    if (k === 'step') return onChange({ step: Number(x) || 1 });
    if (k === 'type') return onChange({ type: x, ...(x === 'hidden' ? { req: false } : {}), ...(hasChoices(x) && !item.options?.length ? { options: ['Option 1', 'Option 2'] } : {}) });
    return onChange({ [k]: x });
  };
  const values = { ...item, options: (item.options || []).join('\n'), showK: item.showIf?.k || '', showV: item.showIf?.value || '' };
  const parentChoices = parent ? (hasChoices(parent.type) ? (parent.options || []).filter(Boolean) : parent.type === 'check' ? ['Yes', 'No'] : null) : null;
  return (
    <div className={`wf-field ${open ? 'open' : ''}`}>
      <div className="wf-field-head">
        <span className="wf-move">
          <Btn sm kind="ghost" icon="ChevronUp" aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => onMove(-1)} />
          <Btn sm kind="ghost" icon="ChevronDown" aria-label={`Move ${item.label} down`} disabled={index === items.length - 1} onClick={() => onMove(1)} />
        </span>
        <button type="button" className="wf-field-name" aria-expanded={open} onClick={onOpen}>
          <strong className="trunc">{item.label || 'Untitled field'}{item.req ? ' *' : ''}</strong>
          <span className="row wrap" style={{ gap: 4 }}>
            <Badge tone="muted" dot={false}>{TYPE_LABEL[item.type] || 'Short text'}</Badge>
            {(item.step || 1) > 1 && <Badge tone="info" dot={false}>Page {item.step}</Badge>}
            {item.showIf?.k && <Badge tone="info" dot={false}>Only if {parent?.label || 'a deleted field'} is {item.showIf.value || '…'}</Badge>}
          </span>
        </button>
        <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${item.label}`} onClick={onRemove} />
      </div>
      {open && (
        <div className="wf-field-body">
          <FormFields values={values} onChange={set} fields={[
            { k: 'label', label: 'Question', req: true, full: true },
            { k: 'type', label: 'Answer type', type: 'select', noBlank: true, options: FIELD_TYPES, readOnly: isStandard(item.k), hint: isStandard(item.k) ? 'Goes into the lead field of the same name' : 'Saved on the lead, in its notes' },
            { k: 'step', label: 'Page', type: 'select', noBlank: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `Page ${n}` })) },
            { k: 'req', label: 'Required', type: 'check', text: 'Must be answered', hide: item.type === 'hidden' },
            { k: 'hint', label: 'Help text', hide: item.type === 'hidden', full: true },
            { k: 'options', label: 'Choices, one on each line', type: 'textarea', hide: !hasChoices(item.type), full: true },
            { k: 'value', label: 'Value sent with every enquiry', hide: item.type !== 'hidden', full: true, hint: 'For example a campaign name. People never see it.' },
            { k: 'showK', label: 'Only show this when', type: 'select', blankLabel: 'Always show', options: earlier.map((x) => ({ value: x.k, label: x.label })), hide: !earlier.length },
            { k: 'showV', label: 'has the answer', type: parentChoices ? 'select' : undefined, options: parentChoices || undefined, hide: !item.showIf?.k },
          ]} />
        </div>
      )}
    </div>
  );
}

const cleanItems = (items) => items.map((i) => ({ ...i, label: i.label.trim(), options: hasChoices(i.type) ? [...new Set((i.options || []).map((o) => o.trim()).filter(Boolean))] : undefined }));
export const builderProblems = (f) => {
  const out = [];
  if (!f.name.trim()) out.push('Give the form a name.');
  if (!f.items.some((i) => i.type !== 'hidden')) out.push('Add at least one field people can fill in.');
  if (!f.items.some((i) => ['name', 'email', 'phone'].includes(i.k))) out.push('Ask for a name, email or phone, so the lead can be told apart and answered.');
  f.items.forEach((i) => {
    if (!i.label.trim()) out.push('Every field needs a question.');
    if (hasChoices(i.type) && !(i.options || []).some((o) => o.trim())) out.push(`"${i.label}" needs at least one choice.`);
    if (i.showIf?.k && !String(i.showIf.value || '').trim()) out.push(`"${i.label}" has a rule but no answer to match.`);
    if (i.type === 'hidden' && !String(i.value || '').trim()) out.push(`Hidden field "${i.label}" needs a value.`);
  });
  if (f.after === 'redirect' && !safeLink(f.redirect)) out.push('The page to go to must start with https:// or http://');
  if (f.autoReply && !f.items.some((i) => i.k === 'email')) out.push('An automatic reply needs an Email field on the form.');
  (f.route?.rules || []).forEach((r, n) => { if (!r.k || !String(r.value || '').trim() || !r.ownerId) out.push(`Routing rule ${n + 1} needs a field, a value and a person.`); });
  return [...new Set(out)];
};

export function FormBuilder({ initial, onClose }) {
  const { db, create, update, toast } = useStore();
  const [start] = useState(() => ({ ...newForm(), ...initial, items: formItems(initial).map((x) => ({ ...x })), spam: { ...DEFAULT_SPAM, ...initial.spam }, route: { ...DEFAULT_ROUTE, ...initial.route, rules: [...(initial.route?.rules || [])] } }));
  const [f, setF] = useState(start);
  const [tab, setTab] = useState('fields');
  const [open, setOpen] = useState(null);
  const [problems, setProblems] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const put = (patch) => { setF((p) => ({ ...p, ...patch })); setProblems([]); };
  const setItem = (k, patch) => put({ items: f.items.map((i) => (i.k === k ? { ...i, ...patch } : i)) });
  const move = (index, by) => {
    const items = [...f.items];
    const [it] = items.splice(index, 1);
    items.splice(index + by, 0, it);
    const broken = items.find((x, n) => x.showIf?.k && items.findIndex((y) => y.k === x.showIf.k) > n);
    if (broken) { toast(`"${broken.label}" depends on "${items.find((y) => y.k === broken.showIf.k)?.label}", so it has to stay below it.`, 'warn'); return; }
    put({ items });
  };
  const removeItem = (k) => {
    const deps = f.items.filter((i) => i.showIf?.k === k);
    put({ items: f.items.filter((i) => i.k !== k).map((i) => (i.showIf?.k === k ? { ...i, showIf: undefined } : i)), route: { ...f.route, rules: f.route.rules.filter((r) => r.k !== k) } });
    if (deps.length) toast(`${deps.map((d) => d.label).join(', ')} will now always show.`);
  };
  const add = (key) => {
    if (!key) return;
    const base = key.startsWith('std:') ? { ...STANDARD_FIELDS.find((x) => x.k === key.slice(4)) } : { k: uid('cf'), label: key.slice(5) === 'hidden' ? 'Campaign' : 'New question', type: key.slice(5) };
    const item = { step: Math.max(1, ...f.items.map((i) => i.step || 1)), ...base, ...(hasChoices(base.type) ? { options: ['Option 1', 'Option 2'] } : {}) };
    put({ items: [...f.items, item] });
    setOpen(item.k);
  };
  const changed = JSON.stringify(f) !== JSON.stringify(start);
  const attempt = () => { if (leaving) return; if (changed) setLeaving(true); else onClose(); };
  const save = () => {
    const list = builderProblems(f);
    setProblems(list);
    if (list.length) return;
    const rec = { ...f, name: f.name.trim(), items: cleanItems(f.items), limit: f.limit === '' ? '' : Number(f.limit) || '' };
    delete rec.fields;
    if (rec.id) { const { id, createdAt, submissions, ...patch } = rec; update('webForms', id, patch); } else create('webForms', rec);
    toast('Form saved');
    onClose();
  };
  const unused = STANDARD_FIELDS.filter((s) => !f.items.some((i) => i.k === s.k));
  const people = db.users.filter((u) => u.active);
  const fieldOptions = f.items.filter((i) => i.type !== 'hidden').map((i) => ({ value: i.k, label: i.label }));
  const contrast = luminanceContrast(f.accent);
  const tabs = [{ k: 'fields', label: 'Fields', icon: 'ListChecks', count: f.items.length }, { k: 'details', label: 'Details', icon: 'Palette' }, { k: 'after', label: 'After sending', icon: 'Send' }, { k: 'route', label: 'Who gets it', icon: 'Users' }, { k: 'spam', label: 'Spam', icon: 'ShieldAlert' }];
  const route = f.route;
  const setRule = (n, patch) => put({ route: { ...route, rules: route.rules.map((r, i) => (i === n ? { ...r, ...patch } : r)) } });
  return (
    <Modal size="xl" title={f.id ? `Edit ${start.name}` : 'New web form'} onClose={attempt} footer={<>
      {problems.length > 0 && <span className="error-text" style={{ marginInlineEnd: 'auto' }}>{problems.length === 1 ? problems[0] : `${problems.length} things to fix, listed at the top`}</span>}
      <Btn className="wf-preview-btn" icon="Eye" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Back to editing' : 'Preview'}</Btn>
      <Btn onClick={attempt}>Cancel</Btn><Btn kind="primary" onClick={save}>Save form</Btn>
    </>}>
      {problems.length > 1 && <div className="notice wf-problems" role="alert"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <div className={`wf-grid ${showPreview ? 'previewing' : ''}`}>
        <div className="wf-edit stack">
          <FormFields values={f} onChange={(k, x) => put({ [k]: x })} fields={[{ k: 'name', label: 'Form name', req: true, full: true }]} />
          <Tabs value={tab} onChange={setTab} tabs={tabs} />
          {tab === 'fields' && (
            <div className="stack-s">
              {f.items.map((item, n) => <FieldRow key={item.k} item={item} index={n} items={f.items} open={open === item.k} onOpen={() => setOpen(open === item.k ? null : item.k)} onChange={(patch) => setItem(item.k, patch)} onMove={(by) => move(n, by)} onRemove={() => removeItem(item.k)} />)}
              <select className="select" aria-label="Add a field" value="" onChange={(e) => add(e.target.value)}>
                <option value="">+ Add a field…</option>
                {unused.length > 0 && <optgroup label="Goes into a lead field">{unused.map((s) => <option key={s.k} value={`std:${s.k}`}>{s.label}</option>)}</optgroup>}
                <optgroup label="Your own question">{FIELD_TYPES.map((x) => <option key={x.value} value={`type:${x.value}`}>{x.label}</option>)}</optgroup>
              </select>
              <div className="small muted">Fields on page 2 and later show after Next. A field with a rule only shows when an earlier answer matches.</div>
            </div>
          )}
          {tab === 'details' && <>
            <FormFields values={f} onChange={(k, x) => put({ [k]: x })} fields={[
              { k: 'intro', label: 'Text at the top', type: 'textarea', full: true },
              { k: 'button', label: 'Send button says' },
              { k: 'source', label: 'Lead source', type: 'select', noBlank: true, list: 'leadSource' },
              { k: 'consent', label: 'Consent', type: 'check', text: 'Ask people to agree before sending', full: true },
              { k: 'consentText', label: 'What they agree to', type: 'textarea', full: true, hide: !f.consent, hint: 'Check the wording with your privacy rules for each country you sell in.' },
            ]} />
            <div className="field">
              <label className="label" htmlFor="wf-accent">Button and bar colour</label>
              <span className="row"><input id="wf-accent" type="color" value={f.accent || '#2563eb'} onChange={(e) => put({ accent: e.target.value })} />{f.accent && <Btn sm kind="ghost" onClick={() => put({ accent: '' })}>Use the CRM colour</Btn>}</span>
              {f.accent && contrast < 4.5 && <span className="error-text">White text on this colour is hard to read. Pick a darker one.</span>}
            </div>
          </>}
          {tab === 'after' && <FormFields values={{ ...f, redirectOn: f.after === 'redirect' }} onChange={(k, x) => (k === 'redirectOn' ? put({ after: x ? 'redirect' : 'message' }) : put({ [k]: x }))} fields={[
            { k: 'thanks', label: 'Thank-you message', type: 'textarea', full: true },
            { k: 'redirectOn', label: 'Go to another page', type: 'check', text: 'Then send people to another page', full: true },
            { k: 'redirect', label: 'Page to go to', placeholder: 'https://', full: true, hide: f.after !== 'redirect' },
            { k: 'autoReply', label: 'Automatic reply', type: 'check', text: 'Email a reply to the person straight away', full: true },
            { k: 'autoSubject', label: 'Subject', full: true, hide: !f.autoReply },
            { k: 'autoBody', label: 'Message', type: 'textarea', rows: 5, full: true, hide: !f.autoReply, hint: '{{name}} is their name, {{company}} is your company, {{form}} is this form. Simulated: it is logged in Email, not sent.' },
            { k: 'limit', label: 'Stop after this many enquiries', type: 'number', min: 0, hint: 'Leave empty for no limit' },
            { k: 'closesOn', label: 'Close on', type: 'date' },
          ]} />}
          {tab === 'route' && <>
            <FormFields values={{ mode: route.mode, ownerId: route.ownerId, dupes: f.dupes }} onChange={(k, x) => (k === 'dupes' ? put({ dupes: x }) : put({ route: { ...route, [k]: x } }))} fields={[
              { k: 'mode', label: 'Give each new lead to', type: 'select', noBlank: true, options: [{ value: 'round', label: 'Salespeople in turn, whoever has fewest new leads' }, { value: 'owner', label: 'One person' }], full: true },
              { k: 'ownerId', label: 'Person', type: 'select', options: people.map((u) => ({ value: u.id, label: u.name })), hide: route.mode !== 'owner' },
              { k: 'dupes', label: 'When the same person writes again', type: 'select', noBlank: true, options: [{ value: 'update', label: 'Add it to their open lead' }, { value: 'new', label: 'Make a new lead each time' }], full: true },
            ]} />
            <div className="stack-s">
              <div className="label">Rules, checked first, top to bottom</div>
              {route.rules.map((r, n) => (
                <div key={n} className="wf-rule">
                  <select className="select" aria-label={`Rule ${n + 1} field`} value={r.k} onChange={(e) => setRule(n, { k: e.target.value })}><option value="">Field…</option>{fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  <span className="small">contains</span>
                  <input className="input" aria-label={`Rule ${n + 1} value`} value={r.value} onChange={(e) => setRule(n, { value: e.target.value })} />
                  <span className="small">goes to</span>
                  <select className="select" aria-label={`Rule ${n + 1} person`} value={r.ownerId} onChange={(e) => setRule(n, { ownerId: e.target.value })}><option value="">Person…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                  <Btn sm kind="ghost" icon="X" aria-label={`Remove rule ${n + 1}`} onClick={() => put({ route: { ...route, rules: route.rules.filter((_, i) => i !== n) } })} />
                </div>
              ))}
              <div><Btn sm icon="Plus" onClick={() => put({ route: { ...route, rules: [...route.rules, { k: f.items.some((i) => i.k === 'country') ? 'country' : '', value: '', ownerId: '' }] } })}>Add a rule</Btn></div>
              <div className="small muted">For example, Country contains Germany goes to your person for Germany. Someone who is already a contact goes to that contact's owner.</div>
            </div>
            <fieldset className="wf-notify"><legend className="label">Also tell</legend>
              <div className="row wrap">{people.map((u) => <label key={u.id} className="check"><input type="checkbox" checked={(f.alsoNotify || []).includes(u.id)} onChange={(e) => put({ alsoNotify: e.target.checked ? [...(f.alsoNotify || []), u.id] : (f.alsoNotify || []).filter((x) => x !== u.id) })} />{u.name}</label>)}</div>
            </fieldset>
          </>}
          {tab === 'spam' && <>
            <FormFields values={f.spam} onChange={(k, x) => put({ spam: { ...f.spam, [k]: x } })} fields={[
              { k: 'trap', label: 'Hidden trap', type: 'check', text: 'Add a field people can\'t see but robots fill in', full: true },
              { k: 'minSeconds', label: 'Hold if sent within (seconds)', type: 'number', min: 0, hint: 'People take longer than a few seconds' },
              { k: 'perHour', label: 'Most from one email in an hour', type: 'number', min: 0, hint: '0 means no limit' },
              { k: 'human', label: 'Question', type: 'check', text: 'Ask a simple sum before sending', full: true },
              { k: 'domains', label: 'Blocked email domains', type: 'textarea', full: true, placeholder: 'example.com, spam.net' },
              { k: 'words', label: 'Blocked words', type: 'textarea', full: true, placeholder: 'casino, prize' },
            ]} />
            <div className="small muted">Held enquiries go to Enquiries, under Spam, where you can let a real one through. The sender sees the normal thank-you message. Simulated: there is no real robot check without a server.</div>
          </>}
        </div>
        <div className="wf-preview" aria-label="Preview">
          <div className="small muted wf-preview-label"><Icon name="Eye" size={13} /> Live preview. Nothing is saved from here.</div>
          <div className="card card-b"><FormRunner form={f} preview company={db.settings.companyName} /></div>
        </div>
      </div>
      {leaving && <Confirm title="Discard your changes?" text="Changes to this form won't be saved." confirmLabel="Discard" onClose={() => setLeaving(false)} onConfirm={onClose} />}
    </Modal>
  );
}
