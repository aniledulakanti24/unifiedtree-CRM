import React, { useState } from 'react';
import { REQUIRED_OPTIONS } from '../engine';
import { TITLES, useStore } from '../store';
import { Btn, Card, Confirm, Icon, RecordModal } from '../ui';
import { MENU_WORDS, PICKLISTS, PICKLIST_BY_KEY, cleanOption } from '../picklists';

const GROUPS = [...new Set(PICKLISTS.map((p) => p.group))];

function OptionRow({ listKey, value, uses }) {
  const { optionsOf, renameOption, removeOption, labelOf, toast } = useStore();
  const def = PICKLIST_BY_KEY[listKey];
  const locked = def.locked?.includes(value);
  const shown = def.format ? def.format(value) : labelOf(value);
  const [text, setText] = useState(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const save = () => {
    const r = cleanOption(listKey, text, optionsOf(listKey));
    if (r.exists && r.value !== value) { setError('That option already exists.'); return; }
    if (r.error) { setError(r.error); return; }
    if (r.value !== shown) { renameOption(listKey, value, r.value); toast(`Renamed to ${r.value}`); }
    setText(null);
  };
  // Built-in words are renamed everywhere at once, so say where else this one appears.
  const alsoIn = locked ? PICKLISTS.filter((p) => p.key !== listKey && p.defaults.includes(value)).map((p) => p.label) : [];
  if (text !== null) {
    return (
      <div className="opt-row">
        <div className="grow">
          <input className={`input ${error ? 'err' : ''}`} autoFocus aria-label={`Rename ${value}`} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setText(null); }} />
          {error && <span className="error-text">{error}</span>}
          {alsoIn.length > 0 && <span className="hint">This also renames it in: {alsoIn.join(', ')}.</span>}
        </div>
        <Btn sm kind="primary" onClick={save}>Save</Btn>
        <Btn sm onClick={() => { setText(null); setError(''); }}>Cancel</Btn>
      </div>
    );
  }
  return (
    <div className="opt-row">
      <span className="grow" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{shown}</span>
      {def.used.length > 0 && <span className="small muted nowrap">{uses} {uses === 1 ? 'record' : 'records'}</span>}
      {locked && <span className="small muted nowrap" title="A rename changes this word everywhere it appears in the CRM. The CRM's rules keep working.">Built in</span>}
      {!def.noRename && <Btn sm kind="ghost" icon="Pencil" aria-label={`Rename ${value}`} onClick={() => setText(shown)} />}
      {!def.fixed && <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${shown}`} disabled={optionsOf(listKey).length < 2} onClick={() => setRemoving(true)} />}
      {removing && <Confirm title={`Remove ${shown}?`} text={uses ? `${uses} existing ${uses === 1 ? 'record keeps' : 'records keep'} this value, but it won't be offered for new ones.` : "It won't be offered in this dropdown any more."} confirmLabel="Remove" onClose={() => setRemoving(false)} onConfirm={() => { removeOption(listKey, value); toast(`${shown} removed`); }} />}
    </div>
  );
}

export default function DropdownOptions() {
  const { db, optionsOf, addOption, toast } = useStore();
  const [key, setKey] = useState(PICKLISTS[0].key);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const def = PICKLIST_BY_KEY[key];
  const list = optionsOf(key);
  const usesOf = (value) => def.used.reduce((n, [entity, field]) => n + db[entity].filter((r) => r[field] === value).length, 0);
  const add = (e) => {
    e.preventDefault();
    const r = cleanOption(key, text, list);
    if (r.exists) { setError('That option already exists.'); return; }
    if (r.error) { setError(r.error); return; }
    addOption(key, r.value);
    toast(`${def.format ? def.format(r.value) : r.value} added`);
    setText('');
  };
  return (
    <div className="opt-layout">
      <div className="card" style={{ padding: 8 }}>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="pop-head">{g}</div>
            {PICKLISTS.filter((p) => p.group === g).map((p) => (
              <button key={p.key} type="button" className={`pop-item ${p.key === key ? 'selected' : ''}`} aria-current={p.key === key} onClick={() => { setKey(p.key); setText(''); setError(''); }}>
                <span className="grow trunc">{p.label}</span><span className="small muted">{optionsOf(p.key).length}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <Card title={def.label} sub="These options apply to everyone in this company.">
        {def.fixed && <p className="sub" style={{ margin: '0 0 12px' }}>These are steps in a built-in workflow. You can rename them here. New steps can't be added yet.</p>}
        {!def.fixed && <form className="row" style={{ alignItems: 'flex-start', marginBottom: 12 }} onSubmit={add} noValidate>
          <div className="grow">
            <input className={`input ${error ? 'err' : ''}`} aria-label={`New ${def.label} option`} placeholder={def.placeholder || 'New option'} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} />
            {error && <span className="error-text">{error}</span>}
          </div>
          <button type="submit" className="btn primary"><Icon name="Plus" />Add</button>
        </form>}
        {list.map((o) => <OptionRow key={o} listKey={key} value={o} uses={usesOf(o)} />)}
      </Card>
    </div>
  );
}

const stageError = (stages, id, name, prob) => {
  if (!name.trim()) return 'Enter a name.';
  if (stages.some((s) => s.id !== id && s.name.toLowerCase() === name.trim().toLowerCase())) return 'That stage already exists.';
  if (prob === '' || !(Number(prob) >= 0 && Number(prob) <= 100)) return 'Probability must be 0 to 100.';
  return '';
};

function StageRow({ stage, index, last, uses }) {
  const { db, updateStage, moveStage, removeStage, setStageRequired, toast } = useStore();
  const won = stage.id === 'won';
  const [name, setName] = useState(stage.name);
  const [prob, setProb] = useState(stage.prob);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const dirty = name !== stage.name || Number(prob) !== stage.prob;
  const save = () => {
    const er = stageError(db.stages, stage.id, name, prob);
    setError(er);
    if (er) return;
    updateStage(stage.id, name.trim(), Number(prob));
    setName(name.trim());
    toast('Stage saved');
  };
  const others = db.stages.filter((s) => s.id !== stage.id && s.id !== 'won');
  return (
    <div className="opt-row wrap">
      <span className="row" style={{ gap: 2 }}>
        <Btn sm kind="ghost" icon="ArrowUp" aria-label={`Move ${stage.name} up`} disabled={won || index === 0} onClick={() => moveStage(stage.id, -1)} />
        <Btn sm kind="ghost" icon="ArrowDown" aria-label={`Move ${stage.name} down`} disabled={won || index >= last - 1} onClick={() => moveStage(stage.id, 1)} />
      </span>
      <input className="input grow" style={{ minWidth: 120, flexBasis: 120 }} aria-label={`Name of ${stage.name}`} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
      <span className="row" style={{ gap: 4 }}><input className="input" style={{ width: 72 }} type="number" min="0" max="100" disabled={won} aria-label={`Probability of ${stage.name}`} value={prob} onChange={(e) => { setProb(e.target.value); setError(''); }} />%</span>
      <span className="small muted nowrap">{uses} {uses === 1 ? 'deal' : 'deals'}</span>
      {dirty && <Btn sm kind="primary" onClick={save}>Save</Btn>}
      {won
        ? <span className="small muted nowrap row" style={{ gap: 4 }} title="Closing a deal as won depends on this stage. You can rename it."><Icon name="Lock" size={13} />Built in</span>
        : <Btn sm kind="ghost" icon="Trash2" aria-label={`Remove ${stage.name}`} disabled={!others.length} onClick={() => setRemoving(true)} />}
      {error && <span className="error-text" style={{ flexBasis: '100%' }}>{error}</span>}
      {removing && (uses
        ? <RecordModal size="sm" title={`Remove ${stage.name}?`} saveLabel="Move deals and remove" fields={[{ k: 'toId', label: `Move its ${uses} ${uses === 1 ? 'deal' : 'deals'} to`, type: 'select', req: true, full: true, options: others.map((s) => ({ value: s.id, label: s.name })) }]} onClose={() => setRemoving(false)} onSave={(v) => { removeStage(stage.id, v.toId); toast(`${stage.name} removed`); }} />
        : <Confirm title={`Remove ${stage.name}?`} text="No deals are on this stage." confirmLabel="Remove" onClose={() => setRemoving(false)} onConfirm={() => { removeStage(stage.id, others[0].id); toast(`${stage.name} removed`); }} />)}
      <div className="stage-req" role="group" aria-label={`What ${stage.name} requires`}>
        <span className="small muted">To enter this stage, require:</span>
        {REQUIRED_OPTIONS.map(([k, label]) => <label key={k} className="check small"><input type="checkbox" checked={(stage.required || []).includes(k)} onChange={() => setStageRequired(stage.id, (stage.required || []).includes(k) ? stage.required.filter((x) => x !== k) : [...(stage.required || []), k])} />{label}</label>)}
      </div>
    </div>
  );
}

export function DealStages() {
  const { db, addStage, updateSettings, toast } = useStore();
  const [name, setName] = useState('');
  const [prob, setProb] = useState(50);
  const [error, setError] = useState('');
  const add = (e) => {
    e.preventDefault();
    const er = stageError(db.stages, null, name, prob);
    setError(er);
    if (er) return;
    addStage(name.trim(), Number(prob));
    toast(`${name.trim()} added`);
    setName('');
  };
  return (
    <Card title="Deal stages" sub="The steps a deal moves through, for everyone in this company. New deals start on the first stage, and Won is always last.">
      <div className="field" style={{ maxWidth: 300, marginBottom: 12 }}><label className="label" htmlFor="stale-days">Flag a deal as stuck after this many days in one stage</label><input id="stale-days" className="input" type="number" min="1" value={db.settings.staleDays ?? 14} onChange={(e) => updateSettings({ staleDays: Math.max(1, Number(e.target.value) || 1) })} /></div>
      <form className="row wrap" style={{ alignItems: 'flex-start', marginBottom: 12 }} onSubmit={add} noValidate>
        <input className={`input grow ${error ? 'err' : ''}`} style={{ minWidth: 140, flexBasis: 140 }} aria-label="New stage name" placeholder="New stage" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
        <span className="row" style={{ gap: 4 }}><input className="input" style={{ width: 72 }} type="number" min="0" max="100" aria-label="New stage probability" value={prob} onChange={(e) => { setProb(e.target.value); setError(''); }} />%</span>
        <button type="submit" className="btn primary"><Icon name="Plus" />Add</button>
        {error && <span className="error-text" style={{ flexBasis: '100%' }}>{error}</span>}
      </form>
      {db.stages.map((s, i) => <StageRow key={s.id} stage={s} index={i} last={db.stages.length} uses={db.deals.filter((d) => d.stage === s.id).length} />)}
    </Card>
  );
}

function NameRow({ label, value, onSave }) {
  const [text, setText] = useState(value);
  const save = () => { if (text.trim() !== value) onSave(text.trim()); };
  return (
    <div className="opt-row">
      <span className="small muted grow" style={{ flexBasis: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      <input className="input" style={{ flex: 1, minWidth: 0 }} aria-label={`Name for ${label}`} placeholder="Keep the default" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
    </div>
  );
}

export function PageNames() {
  const { db, setLabel, setTitle, toast } = useStore();
  return (
    <div className="g2" style={{ alignItems: 'start' }}>
      <Card title="Pages" sub="A new name replaces the page's name for every role. Leave it blank to go back to the default.">
        {Object.entries(TITLES).map(([k, row]) => <NameRow key={k} label={[...new Set(Object.values(row))].join(' / ')} value={db.titles?.[k] || ''} onSave={(v) => { setTitle(k, v); toast('Name saved'); }} />)}
      </Card>
      <Card title="Menu groups and workspaces" sub="The headings in the sidebar and the workspace name under your company.">
        {MENU_WORDS.map((w) => <NameRow key={w} label={w} value={db.labels?.[w] || ''} onSave={(v) => { setLabel(w, v); toast('Name saved'); }} />)}
      </Card>
    </div>
  );
}
