import React, { useState } from 'react';
import { useStore } from '../store';
import { Btn, Card, Confirm, RecordModal } from '../ui';
import { companyFields, contactFields, dealFields, leadFields } from '../shared';
import { applyFormConfig } from '../engine';
import { uid } from '../util';

export const FORMS = {
  deal: { label: 'Opportunity', base: () => dealFields(null) },
  lead: { label: 'Lead', base: () => leadFields() },
  contact: { label: 'Contact', base: () => contactFields() },
  company: { label: 'Customer', base: () => companyFields() },
  product: { label: 'Product', base: () => [{ k: 'name', label: 'Product name', req: true }, { k: 'sku', label: 'SKU', req: true }, { k: 'category', label: 'Category', req: true }, { k: 'price', label: 'Sale price', req: true }, { k: 'cost', label: 'Cost' }, { k: 'tracked', label: 'Inventory' }, { k: 'reorder', label: 'Reorder level' }, { k: 'stock', label: 'Stock on hand' }, { k: 'warehouseId', label: 'Warehouse' }, { k: 'taxCode', label: 'Tax code' }, { k: 'taxRate', label: 'Tax rate' }, { k: 'supplier', label: 'Supplier' }, { k: 'active', label: 'Status' }, { k: 'description', label: 'Description' }] },
  case: { label: 'Support case', base: () => [{ k: 'subject', label: 'Subject', req: true }, { k: 'companyId', label: 'Account', req: true }, { k: 'type', label: 'Type', req: true }, { k: 'priority', label: 'Priority' }, { k: 'status', label: 'Status' }, { k: 'ownerId', label: 'Assigned user', req: true }, { k: 'description', label: 'Description' }, { k: 'attachment', label: 'Attachment' }] },
  event: { label: 'Appointment', base: () => [{ k: 'title', label: 'Title', req: true }, { k: 'category', label: 'Category' }, { k: 'companyId', label: 'Client' }, { k: 'start', label: 'Starts', req: true }, { k: 'end', label: 'Ends', req: true }, { k: 'location', label: 'Location' }, { k: 'ownerId', label: 'Assigned to', req: true }, { k: 'notes', label: 'Notes' }] },
};
const TYPES = [{ value: 'text', label: 'Short text' }, { value: 'textarea', label: 'Long text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Dropdown' }, { value: 'check', label: 'Tick box' }];

function FieldRow({ form, f, base, first, last, onMove }) {
  const { db, saveFormConfig, toast } = useStore();
  const cfg = db.formConfig?.[form] || {};
  const isCustom = f.k.startsWith('cf_');
  const core = base.find((x) => x.k === f.k);
  const put = (patch) => saveFormConfig(form, { ...cfg, ...patch });
  const [label, setLabel] = useState(f.label);
  const [del, setDel] = useState(false);
  const saveLabel = () => {
    const name = label.trim();
    if (!name) { setLabel(f.label); return; }
    if (name === f.label) return;
    if (isCustom) put({ custom: cfg.custom.map((x) => (x.k === f.k ? { ...x, label: name } : x)) });
    else put({ labels: { ...cfg.labels, [f.k]: name === core.label ? undefined : name } });
    toast('Field renamed');
  };
  return (
    <div className="opt-row wrap">
      <span className="row" style={{ gap: 2 }}>
        <Btn sm kind="ghost" icon="ArrowUp" aria-label={`Move ${f.label} up`} disabled={first} onClick={() => onMove(-1)} />
        <Btn sm kind="ghost" icon="ArrowDown" aria-label={`Move ${f.label} down`} disabled={last} onClick={() => onMove(1)} />
      </span>
      <input className="input grow" style={{ minWidth: 130, flexBasis: 130 }} aria-label={`Label for ${f.label}`} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
      {core?.req
        ? <span className="small muted nowrap" title="The CRM needs this field, so it stays required and visible.">Always required</span>
        : <>
          <label className="check small"><input type="checkbox" checked={!!cfg.required?.[f.k]} disabled={!!cfg.hidden?.[f.k]} onChange={(e) => put({ required: { ...cfg.required, [f.k]: e.target.checked } })} />Required</label>
          <label className="check small"><input type="checkbox" checked={!!cfg.hidden?.[f.k]} onChange={(e) => put({ hidden: { ...cfg.hidden, [f.k]: e.target.checked }, required: { ...cfg.required, [f.k]: e.target.checked ? false : cfg.required?.[f.k] } })} />Hidden</label>
        </>}
      {isCustom && <Btn sm kind="ghost" icon="Trash2" aria-label={`Delete ${f.label}`} onClick={() => setDel(true)} />}
      {del && <Confirm title={`Delete ${f.label}?`} text="The field leaves the form. Values already saved on records are kept but no longer shown." onClose={() => setDel(false)} onConfirm={() => { put({ custom: cfg.custom.filter((x) => x.k !== f.k) }); toast('Field deleted'); }} />}
    </div>
  );
}

export default function FormSetup() {
  const { db, saveFormConfig, toast } = useStore();
  const [form, setForm] = useState('deal');
  const [adding, setAdding] = useState(false);
  const cfg = db.formConfig?.[form] || {};
  const base = FORMS[form].base();
  const list = applyFormConfig({ ...cfg, hidden: {} }, base);
  const move = (i, d) => {
    const keys = list.map((f) => f.k);
    [keys[i], keys[i + d]] = [keys[i + d], keys[i]];
    saveFormConfig(form, { ...cfg, order: keys });
  };
  return (
    <div className="opt-layout">
      <div className="card" style={{ padding: 8 }}>
        <div className="pop-head">Forms</div>
        {Object.entries(FORMS).map(([k, x]) => <button key={k} type="button" className={`pop-item ${k === form ? 'selected' : ''}`} aria-current={k === form} onClick={() => setForm(k)}><span className="grow">{x.label}</span><span className="small muted">{(db.formConfig?.[k]?.custom || []).length || ''}</span></button>)}
      </div>
      <Card title={`${FORMS[form].label} form`} sub="Rename, reorder, hide or require fields, and add your own. Changes apply straight away." action={<Btn sm kind="primary" icon="Plus" onClick={() => setAdding(true)}>Add field</Btn>}>
        {list.map((f, i) => <FieldRow key={`${form}-${f.k}`} form={form} f={f} base={base} first={i === 0} last={i === list.length - 1} onMove={(d) => move(i, d)} />)}
      </Card>
      {adding && <RecordModal size="sm" title="Add a field" saveLabel="Add field" initial={{ type: 'text' }} onClose={() => setAdding(false)}
        fields={[{ k: 'label', label: 'Field name', req: true, full: true, placeholder: 'For example, VAT number' }, { k: 'type', label: 'Type', type: 'select', noBlank: true, options: TYPES, full: true }, { k: 'choices', label: 'Dropdown choices', full: true, hint: 'Separate them with commas. Only used for a dropdown.' }]}
        check={(v) => (v.type === 'select' && !v.choices?.trim() ? { choices: 'Add at least one choice.' } : {})}
        onSave={(v) => {
          const field = { k: `cf_${uid('f').slice(2)}`, label: v.label.trim(), type: v.type === 'text' ? undefined : v.type, ...(v.type === 'select' ? { options: v.choices.split(',').map((x) => x.trim()).filter(Boolean) } : {}), ...(v.type === 'check' ? { text: v.label.trim() } : {}) };
          saveFormConfig(form, { ...cfg, custom: [...(cfg.custom || []), field] });
          toast(`${field.label} added`);
        }} />}
    </div>
  );
}
