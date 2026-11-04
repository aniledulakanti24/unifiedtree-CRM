import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Lucide from 'lucide-react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Inbox, Search, Star, Upload, X } from 'lucide-react';
import { downloadCsv, initials, toneOf } from './util';
import { useStore } from './store';
import { PICKLIST_BY_KEY, cleanOption } from './picklists';

const AVATAR = ['#0e7c66', '#2a64b8', '#7a4fc4', '#b5552a', '#a13c6e', '#2f7d32', '#8a6d00', '#3f6b8a'];
const hash = (s = '') => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export const Icon = ({ name, size = 16, ...rest }) => { const C = Lucide[name] || Lucide.Circle; return <C size={size} {...rest} />; };
export const Avatar = ({ name, size = 28 }) => (
  <span className="avatar notranslate" translate="no" title={name} style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR[hash(name) % AVATAR.length] }}>{initials(name)}</span>
);
export function UserChip({ id, sub }) {
  const { userName } = useStore();
  const n = userName(id);
  return <span className="row"><Avatar name={n} size={24} /><span className="trunc"><span className="notranslate" translate="no">{n}</span>{sub && <div className="small muted">{sub}</div>}</span></span>;
}
export const Badge = ({ children, tone, dot = true }) => {
  const store = useStore();
  const t = tone || toneOf(children);
  return <span className={`badge ${t}`}>{dot && <span className="dot" />}{typeof children === 'string' && store ? store.labelOf(children) : children}</span>;
};
export const Btn = ({ kind = '', sm, icon, children, className = '', ...rest }) => (
  <button type="button" className={`btn ${kind} ${sm ? 'sm' : ''} ${!children ? 'icon' : ''} ${className}`} {...rest}>
    {icon && <Icon name={icon} size={sm ? 14 : 16} />}{children}
  </button>
);
export const Card = ({ title, action, children, className = '', pad = true, sub }) => (
  <section className={`card ${className}`}>
    {(title || action) && (
      <div className="card-h"><div><div className="card-t">{title}</div>{sub && <div className="small muted">{sub}</div>}</div>{action}</div>
    )}
    {pad ? <div className="card-b">{children}</div> : children}
  </section>
);
export const Kpi = ({ label, value, note, icon }) => (
  <div className="card kpi">
    <div className="grow"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{note && <div className="kpi-note">{note}</div>}</div>
    {icon && <div className="kpi-ico"><Icon name={icon} size={17} /></div>}
  </div>
);
export const PageHead = ({ title, crumbs, sub, children }) => (
  <div className="page-head">
    <div className="grow">
      {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={c}>{i > 0 && '/ '}{c}</span>)}</div>}
      <h1 className="page-title">{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </div>
    {children && <div className="row wrap">{children}</div>}
  </div>
);
export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => {
      const k = t.k ?? t;
      return <button key={k} role="tab" aria-selected={value === k} className={`tab ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{t.icon && <Icon name={t.icon} size={15} />}{t.label ?? t}{t.count != null && <span className="muted small num">{t.count}</span>}</button>;
    })}
  </div>
);
export const Pills = ({ options, value, onChange }) => (
  <div className="pills" role="tablist">
    {options.map((o) => {
      const k = o.k ?? o;
      return <button key={k} className={`pill ${value === k ? 'on' : ''}`} onClick={() => onChange(k)} title={o.title}>{o.icon && <Icon name={o.icon} size={14} />}{o.label ?? (o.icon ? null : o)}{o.count != null && <span className="count">{o.count}</span>}</button>;
    })}
  </div>
);
export const Empty = ({ icon = 'Inbox', text = 'Nothing here yet.', children }) => (
  <div className="empty"><Icon name={icon} size={26} /><div>{text}</div>{children && <div style={{ marginTop: 10 }}>{children}</div>}</div>
);
// Keeps one failing page from blanking the whole app.
export class PageBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="card"><Empty icon="TriangleAlert" text="This page couldn't load. Try another page, or reload." /></div> : this.props.children; }
}
export const firstAllowed = (opts, pref) => (opts.some((o) => (o.k ?? o) === pref) ? pref : opts[0]?.k ?? opts[0]);
export const NoSections = () => <div className="card"><Empty icon="EyeOff" text="No sections here are assigned to you. Ask your admin if you need one." /></div>;
export const Progress = ({ value, color }) => <div className="progress"><i style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>;
export const Stars = ({ value = 0, onChange }) => (
  <span className="stars" role="group" aria-label={`Priority ${value} of 3`}>
    {[1, 2, 3].map((n) => (
      <button key={n} type="button" aria-label={`Set priority ${n}`} className={`star ${n <= value ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange?.(n === value ? 0 : n); }} style={{ cursor: onChange ? 'pointer' : 'default' }}><Star size={13} /></button>
    ))}
  </span>
);
export const Toggle = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
);

export function useEsc(fn) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') fn?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}
export function Modal({ title, onClose, children, footer, size = '' }) {
  useEsc(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="ov-head"><div className="ov-title">{title}</div><Btn kind="ghost" sm icon="X" aria-label="Close" onClick={onClose} /></div>
        <div className="ov-body">{children}</div>
        {footer && <div className="ov-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Drawer({ title, onClose, children, footer, actions }) {
  useEsc(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="ov-head"><div className="ov-title trunc">{title}</div><div className="row">{actions}<Btn kind="ghost" sm icon="X" aria-label="Close" onClick={onClose} /></div></div>
        <div className="ov-body">{children}</div>
        {footer && <div className="ov-foot">{footer}</div>}
      </aside>
    </div>
  );
}
export function Confirm({ title, text, confirmLabel = 'Delete', onConfirm, onClose, danger = true }) {
  return (
    <Modal size="sm" title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Btn></>}>
      <p className="sub">{text}</p>
    </Modal>
  );
}
export function Popover({ trigger, children, align = 'right', width = 240 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEsc(open ? () => setOpen(false) : null);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className="pop" style={{ top: '100%', marginTop: 6, [align === 'right' ? 'insetInlineEnd' : 'insetInlineStart']: 0, width, padding: 6, maxWidth: 'calc(100vw - 24px)' }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </span>
  );
}

export function TagsInput({ value = [], onChange, placeholder = 'Type and press Enter' }) {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim(); if (t && !value.includes(t)) onChange([...value, t]); setDraft(''); };
  return (
    <div className="tags-input">
      {value.map((t) => <span key={t} className="badge"><span>{t}</span><button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} style={{ border: 0, background: 'none', padding: 0, lineHeight: 0 }}><X size={12} /></button></span>)}
      <input value={draft} placeholder={value.length ? '' : placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }} />
    </div>
  );
}

const ADD_OPTION = '__add_option__';
// A dropdown or radio group people can add to while filling in a form. f.list is an editable list from
// picklists.js. f.onAdd(name) instead creates a record, such as a warehouse, and returns its value.
export function ListField({ f, value, onChange, err }) {
  const { can, optionsOf, addOption, labelOf } = useStore();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const def = f.list ? PICKLIST_BY_KEY[f.list] : null;
  const list = f.list ? optionsOf(f.list) : [];
  const show = f.format || def?.format || labelOf;
  const base = f.list ? list.map((o) => ({ value: o, label: show(o) })) : f.options.map((o) => (o.value !== undefined ? o : { value: o, label: o }));
  // A record keeps its value even after that option is removed from the list.
  const missing = f.list && value !== undefined && value !== null && value !== '' && !base.some((o) => String(o.value) === String(value));
  const options = missing ? [...base, { value, label: show(value) }] : base;
  const canAdd = f.list ? can('options', 'add') && !def.fixed : !!f.onAdd;
  const close = () => { setAdding(false); setText(''); setError(''); };
  const commit = () => {
    if (f.list) {
      const r = cleanOption(f.list, text, list);
      if (r.error) { setError(r.error); return; }
      if (!r.exists) addOption(f.list, r.value);
      onChange(f.k, r.value);
    } else {
      const name = text.trim().replace(/\s+/g, ' ');
      if (!name) { setError('Enter a name.'); return; }
      const same = base.find((o) => String(o.label).toLowerCase() === name.toLowerCase());
      onChange(f.k, same ? same.value : f.onAdd(name));
    }
    close();
  };
  return (
    <>
      {f.type === 'radio'
        ? <div className="row wrap" style={{ gap: 14, minHeight: 36 }}>
          {options.map((o) => <label key={o.value} className="check"><input type="radio" name={f.k} checked={value === o.value} onChange={() => onChange(f.k, o.value)} />{o.label}</label>)}
          {canAdd && !adding && <button type="button" className="link-btn" onClick={() => setAdding(true)}>+ Add option</button>}
        </div>
        : <select className={`select ${err ? 'err' : ''}`} disabled={f.disabled} aria-label={f.ariaLabel} value={value ?? ''} onChange={(e) => { if (e.target.value === ADD_OPTION) setAdding(true); else onChange(f.k, e.target.value); }}>
          {!f.noBlank && <option value="">{f.blankLabel || 'Select…'}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {canAdd && <option value={ADD_OPTION}>{f.addText || '+ Add new option…'}</option>}
        </select>}
      {adding && (
        <div className="add-option">
          <input className={`input ${error ? 'err' : ''}`} autoFocus aria-label={`New ${f.label} option`} placeholder={def?.placeholder || `New ${f.label.toLowerCase()}`} value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.stopPropagation(); close(); } }} />
          <Btn sm kind="primary" onClick={commit}>Add</Btn>
          <Btn sm onClick={close}>Cancel</Btn>
        </div>
      )}
      {adding && error && <span className="error-text">{error}</span>}
    </>
  );
}

export function FieldInput({ f, value, onChange, err }) {
  const { db, me, can, create, assignable } = useStore();
  const set = (v) => onChange(f.k, v);
  const cls = `input ${err ? 'err' : ''}`;
  switch (f.type) {
    case 'textarea': return <textarea className="textarea" rows={f.rows || 3} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
    case 'select': return f.list || f.onAdd ? <ListField f={f} value={value} onChange={onChange} err={err} /> : (
      <select className={`select ${err ? 'err' : ''}`} value={value ?? ''} onChange={(e) => set(e.target.value)}>
        {!f.noBlank && <option value="">Select…</option>}
        {f.options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    );
    case 'user': return (
      <select className={`select ${err ? 'err' : ''}`} value={value ?? ''} onChange={(e) => set(e.target.value)}>
        <option value="">Select…</option>
        {assignable().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    );
    case 'company': return (
      <ListField err={err} value={value} onChange={onChange} f={{ ...f, addText: '+ Add new customer…', options: [...db.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })), onAdd: can('customers', 'create') ? (name) => create('companies', { name, status: 'Prospect', ownerId: me.id, tags: [], notes: '' }).id : undefined }} />
    );
    case 'toggle': return <span className="row"><Toggle on={!!value} onChange={set} label={f.label} /><span className="sub">{value ? 'On' : 'Off'}</span></span>;
    case 'tags': return <TagsInput value={value || []} onChange={set} />;
    case 'radio': return f.list ? <ListField f={f} value={value} onChange={onChange} err={err} /> : <div className="row wrap" style={{ gap: 14, minHeight: 36 }}>{f.options.map((o) => <label key={o} className="check"><input type="radio" name={f.k} checked={value === o} onChange={() => set(o)} />{o}</label>)}</div>;
    case 'check': return <label className="check" style={{ minHeight: 36 }}><input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />{f.text || f.label}</label>;
    case 'file': return (
      <label className="dropzone"><Upload size={16} style={{ verticalAlign: -3, marginInlineEnd: 6 }} />{value || 'Click to attach a file'}<input type="file" hidden onChange={(e) => set(e.target.files[0]?.name || '')} /></label>
    );
    case 'number': return <input className={cls} type="number" min={f.min} step={f.step || 'any'} value={value ?? ''} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
    default: return <input className={cls} type={f.type || 'text'} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
  }
}

export function FormFields({ fields, values, onChange, errors = {} }) {
  return (
    <div className="form-grid">
      {fields.filter((f) => !f.hide).map((f) => (
        <div key={f.k} className={`field ${f.full || ['textarea', 'tags', 'file'].includes(f.type) ? 'full' : ''}`}>
          {f.type !== 'check' && <label className="label">{f.label}{f.req && <span className="req"> *</span>}</label>}
          <FieldInput f={f} value={values[f.k]} onChange={onChange} err={errors[f.k]} />
          {errors[f.k] && <span className="error-text">{errors[f.k]}</span>}
          {f.hint && !errors[f.k] && <span className="hint">{f.hint}</span>}
        </div>
      ))}
    </div>
  );
}
export function validate(fields, v) {
  const e = {};
  fields.filter((f) => !f.hide).forEach((f) => {
    const val = v[f.k];
    if (f.req && (val === '' || val == null || (Array.isArray(val) && !val.length))) e[f.k] = `${f.label} is required`;
    else if (f.type === 'email' && val && !/^\S+@\S+\.\S+$/.test(val)) e[f.k] = 'Enter a valid email address';
    else if (f.type === 'number' && val !== '' && val != null && f.min != null && val < f.min) e[f.k] = `Must be ${f.min} or more`;
  });
  return e;
}
export function RecordModal({ title, fields, initial = {}, onSave, onClose, saveLabel = 'Save', size, check }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const er = { ...validate(fields, v), ...check?.(v) };
    setErrors(er);
    if (Object.keys(er).length) return;
    onSave(v);
    onClose();
  };
  return (
    <Modal title={title} onClose={onClose} size={size} footer={<><Btn onClick={onClose}>Cancel</Btn><button type="submit" form="rec-form" className="btn primary">{saveLabel}</button></>}>
      <form id="rec-form" onSubmit={submit} noValidate>
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, val) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
      </form>
    </Modal>
  );
}

const colValue = (c, r) => (c.value ? c.value(r) : r[c.k]);
export function DataTable({ rows, columns: allColumns, onRow, rowKey = 'id', searchPlaceholder = 'Search…', filters = [], statusTabs, actions, bulk, exportName, initialSort, pageSize = 10, emptyText = 'No matching records.', isSelected, compact }) {
  const { labelOf } = useStore();
  const { can } = useStore();
  const columns = allColumns.filter((c) => !c.omit);
  const [q, setQ] = useState('');
  const [fv, setFv] = useState({});
  const [tab, setTab] = useState('All');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [hidden, setHidden] = useState(() => new Set(columns.filter((c) => c.hidden).map((c) => c.k)));
  const [sel, setSel] = useState(new Set());
  const visible = columns.filter((c) => !hidden.has(c.k));

  const filtered = useMemo(() => {
    let out = rows;
    if (statusTabs && tab !== 'All') out = out.filter((r) => statusTabs.get(r) === tab);
    filters.forEach((f) => { const val = fv[f.k]; if (val) out = out.filter((r) => String(f.get(r)) === val); });
    if (q.trim()) {
      const s = q.toLowerCase();
      out = out.filter((r) => columns.some((c) => { const v = colValue(c, r); return v != null && String(v).toLowerCase().includes(s); }));
    }
    if (sort) {
      const c = columns.find((x) => x.k === sort.k);
      if (c) {
        out = [...out].sort((a, b) => {
          const x = colValue(c, a); const y = colValue(c, b);
          const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, q, fv, tab, sort, columns, filters, statusTabs]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * size, cur * size);
  useEffect(() => { setPage(1); }, [q, fv, tab, size]);
  const toggleSort = (c) => { if (c.sort === false) return; setSort((s) => (s?.k === c.k ? { k: c.k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k: c.k, dir: 'asc' })); };
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r[rowKey]));
  const exportCsv = () => downloadCsv(exportName, [visible.map((c) => c.label), ...filtered.map((r) => visible.map((c) => colValue(c, r)))]);

  return (
    <div className="card">
      {statusTabs && (
        <div style={{ padding: '12px 12px 0' }}>
          <Pills value={tab} onChange={setTab} options={['All', ...statusTabs.options].map((o) => ({ k: o, label: labelOf(o), count: o === 'All' ? rows.length : rows.filter((r) => statusTabs.get(r) === o).length }))} />
        </div>
      )}
      <div className="tb-toolbar">
        <div className="tb-search"><Search size={15} /><input className="input" aria-label="Search table" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {filters.map((f) => (
          <select key={f.k} aria-label={f.label} className="select tb-filter" value={fv[f.k] || ''} onChange={(e) => setFv((p) => ({ ...p, [f.k]: e.target.value }))}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? labelOf(o)}</option>)}
          </select>
        ))}
        <div className="grow" />
        <Popover width={200} trigger={({ toggle }) => <button type="button" className="btn" onClick={toggle}><Columns3 size={15} />Columns</button>}>
          {columns.filter((c) => c.label).map((c) => (
            <label key={c.k} className="pop-item check"><input type="checkbox" checked={!hidden.has(c.k)} onChange={() => setHidden((p) => { const n = new Set(p); if (n.has(c.k)) n.delete(c.k); else n.add(c.k); return n; })} />{c.label}</label>
          ))}
        </Popover>
        {exportName && can('data', 'export') && <button type="button" className="btn" onClick={exportCsv}><Download size={15} />Export</button>}
        {actions}
      </div>
      {bulk && sel.size > 0 && (
        <div className="bulkbar">{sel.size} selected {bulk(rows.filter((r) => sel.has(r[rowKey])), () => setSel(new Set()))}<Btn kind="ghost" sm onClick={() => setSel(new Set())}>Clear</Btn></div>
      )}
      <div className="tb-wrap">
        <table className="table">
          <thead>
            <tr>
              {bulk && <th style={{ width: 34 }}><input type="checkbox" aria-label="Select page" checked={allShown} onChange={() => setSel((p) => { const n = new Set(p); shown.forEach((r) => (allShown ? n.delete(r[rowKey]) : n.add(r[rowKey]))); return n; })} /></th>}
              {visible.map((c) => (
                <th key={c.k} className={`${c.sort === false ? '' : 'sortable'} ${c.align === 'r' ? 'r' : ''}`} onClick={() => toggleSort(c)} aria-sort={sort?.k === c.k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.label}{sort?.k === c.k && (sort.dir === 'asc' ? <ArrowUp size={12} style={{ verticalAlign: -2, marginInlineStart: 3 }} /> : <ArrowDown size={12} style={{ verticalAlign: -2, marginInlineStart: 3 }} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r[rowKey]} className={`${onRow ? 'clickable' : ''} ${sel.has(r[rowKey]) || isSelected?.(r) ? 'sel' : ''}`} onClick={() => onRow?.(r)}>
                {bulk && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={sel.has(r[rowKey])} onChange={() => setSel((p) => { const n = new Set(p); if (n.has(r[rowKey])) n.delete(r[rowKey]); else n.add(r[rowKey]); return n; })} /></td>}
                {visible.map((c) => <td key={c.k} className={`${c.align === 'r' ? 'r num' : ''} ${c.nowrap ? 'nowrap' : ''}`} onClick={c.stop ? (e) => e.stopPropagation() : undefined}>{c.render ? c.render(r) : colValue(c, r) ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="empty"><Inbox size={24} /><div>{emptyText}</div></div>}
      </div>
      <div className="tb-foot">
        <span className="num">{filtered.length ? `${(cur - 1) * size + 1}–${Math.min(cur * size, filtered.length)} of ${filtered.length}` : '0 records'}</span>
        <span className="row">
          <select className="select" aria-label="Rows per page" style={{ width: 108, height: 30 }} value={size} onChange={(e) => setSize(Number(e.target.value))}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
          <button type="button" className="btn sm icon" aria-label="Previous page" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={15} /></button>
          <span className="num">{cur} / {pages}</span>
          <button type="button" className="btn sm icon" aria-label="Next page" disabled={cur >= pages} onClick={() => setPage(cur + 1)}><ChevronRight size={15} /></button>
        </span>
      </div>
    </div>
  );
}
