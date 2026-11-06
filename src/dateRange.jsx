// The date filter used across the CRM: a named period, or any two dates from the calendar.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react';
import { useStore } from './store';
import { addDays, iso, today } from './util';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL = 'All time';
const CUSTOM = 'Custom range';
const span = (a, b) => ({ from: iso(a), to: iso(b) });

// `fiscalStart` is the month name set in Settings, General.
export function presetRange(name, fiscalStart = 'January') {
  const now = new Date(`${today()}T00:00:00`);
  const y = now.getFullYear(); const m = now.getMonth(); const d = now.getDate();
  const week = d - now.getDay();
  const quarter = Math.floor(m / 3) * 3;
  const fy = Math.max(0, MONTHS.indexOf(fiscalStart));
  const fyYear = m >= fy ? y : y - 1;
  switch (name) {
    case 'Today': return span(now, now);
    case 'Yesterday': return { from: addDays(-1), to: addDays(-1) };
    case 'This Week': return span(new Date(y, m, week), new Date(y, m, week + 6));
    case 'Last Week': return span(new Date(y, m, week - 7), new Date(y, m, week - 1));
    case 'Last 7 Days': return { from: addDays(-6), to: iso(now) };
    case 'This Month': return span(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'Previous Month': return span(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'Last 30 Days': return { from: addDays(-29), to: iso(now) };
    case 'This Quarter': return span(new Date(y, quarter, 1), new Date(y, quarter + 3, 0));
    case 'Previous Quarter': return span(new Date(y, quarter - 3, 1), new Date(y, quarter, 0));
    case 'Current Fiscal Year': return span(new Date(fyYear, fy, 1), new Date(fyYear + 1, fy, 0));
    case 'Previous Fiscal Year': return span(new Date(fyYear - 1, fy, 1), new Date(fyYear, fy, 0));
    case 'Last 365 Days': return { from: addDays(-364), to: iso(now) };
    default: return { from: '', to: '' };
  }
}
const PRESETS = ['Today', 'Yesterday', 'This Week', 'Last Week', 'Last 7 Days', 'This Month', 'Previous Month', 'Last 30 Days', 'This Quarter', 'Previous Quarter', 'Current Fiscal Year', 'Previous Fiscal Year', 'Last 365 Days'];

export const inRange = (date, r) => {
  if (!r?.from) return true;
  const d = (date || '').slice(0, 10);
  return d >= r.from && d <= r.to;
};
// The same number of days just before a period. Future days are left out, so a part-finished year compares fairly.
export const previousOf = (r) => {
  if (!r?.from) return null;
  const to = r.to < today() ? r.to : today();
  if (to < r.from) return null;
  const start = new Date(`${r.from}T00:00:00`);
  const length = Math.round((new Date(`${to}T00:00:00`) - start) / 864e5) + 1;
  return { from: addDays(-length, start), to: addDays(-1, start) };
};
const nice = (s) => { const [y, m, d] = s.split('-'); return `${d} ${MONTHS[Number(m) - 1].slice(0, 3)} ${y}`; };
export const rangeText = (r) => (r?.from ? `${nice(r.from)} - ${nice(r.to)}` : '');

// Holds a filter's value. Tables start on All time so no record is hidden until someone asks.
export function useDateRange(start = ALL) {
  const { db } = useStore();
  const [range, setRange] = useState(() => ({ preset: start, ...presetRange(start, db.settings.fiscalStart) }));
  return [range, setRange];
}

function Calendar({ value, onApply, onCancel }) {
  // It opens empty on this month, unless it's showing dates already picked here.
  const picked = value.preset === CUSTOM;
  const [from, setFrom] = useState(picked ? value.from : '');
  const [to, setTo] = useState(picked ? value.to : '');
  const start = new Date(`${picked ? value.from : today()}T00:00:00`);
  const [y, setY] = useState(start.getFullYear());
  const [m, setM] = useState(start.getMonth());
  const moveMonth = (by) => { const d = new Date(y, m + by, 1); setY(d.getFullYear()); setM(d.getMonth()); };
  const first = new Date(y, m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - first.getDay() + i));
  const rows = cells[35].getMonth() === m ? cells : cells.slice(0, 35);
  const choose = (day) => {
    if (!from || to) { setFrom(day); setTo(''); return; }
    if (day < from) { setTo(from); setFrom(day); } else setTo(day);
  };
  const Nav = ({ by, label, onMove, Icon }) => <button type="button" className="dr-nav" aria-label={label} onClick={() => onMove(by)}><Icon size={15} /></button>;
  return (
    <div className="dr-cal">
      <div className="row between small"><span className={from ? 'strong' : 'muted'}>{from ? nice(from) : 'Select Start Date'}</span><span className={to ? 'strong' : 'muted'}>{to ? nice(to) : 'Select End Date'}</span></div>
      <div className="row between dr-head">
        <span className="row dr-step"><Nav by={-1} label="Previous month" onMove={moveMonth} Icon={ArrowLeft} /><span className="strong dr-month">{MONTHS[m]}</span><Nav by={1} label="Next month" onMove={moveMonth} Icon={ArrowRight} /></span>
        <span className="row dr-step"><Nav by={-1} label="Previous year" onMove={(by) => setY(y + by)} Icon={ArrowLeft} /><span className="strong">{y}</span><Nav by={1} label="Next year" onMove={(by) => setY(y + by)} Icon={ArrowRight} /></span>
      </div>
      <div className="dr-grid">
        {DAYS.map((d) => <span key={d} className="dr-dow">{d}</span>)}
        {rows.map((c) => {
          const day = iso(c);
          const ends = day === from || day === to;
          const between = from && to && day > from && day < to;
          return <button key={day} type="button" aria-label={nice(day)} aria-pressed={ends} className={`dr-day ${c.getMonth() !== m ? 'out' : ''} ${day === today() ? 'now' : ''} ${ends ? 'end' : ''} ${between ? 'mid' : ''}`} onClick={() => choose(day)}>{c.getDate()}</button>;
        })}
      </div>
      <div className="row dr-foot"><button type="button" className="btn sm" onClick={onCancel}>Cancel</button><button type="button" className="btn sm primary" disabled={!from} onClick={() => onApply({ preset: CUSTOM, from, to: to || from })}>OK</button></div>
    </div>
  );
}

export function DateRange({ value, onChange, allowAll = false }) {
  const { db } = useStore();
  const [open, setOpen] = useState(null);
  const [flip, setFlip] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => { if (open === 'list') listRef.current?.querySelector('.on')?.scrollIntoView?.({ block: 'nearest' }); }, [open]);
  const fiscal = db.settings.fiscalStart;
  // Near the right edge of the screen, the pop-up opens leftwards so it stays visible.
  const show = (which) => { setFlip(ref.current.getBoundingClientRect().left + 352 > window.innerWidth); setOpen(open === which ? null : which); };
  const pick = (name) => { onChange({ preset: name, ...presetRange(name, fiscal) }); setOpen(null); };
  return (
    <div className="dr" ref={ref}>
      <div className={`dr-field ${open ? 'open' : ''}`}>
        <button type="button" className="dr-main" aria-haspopup="listbox" aria-expanded={open === 'list'} aria-label={`Date filter: ${value.preset}`} onClick={() => show('list')}><CalendarDays size={15} /><span className="nowrap">{value.preset}</span></button>
        <button type="button" className="dr-pick" aria-expanded={open === 'cal'} aria-label="Pick dates from a calendar" title="Pick dates" onClick={() => show('cal')}><CalendarDays size={15} /></button>
      </div>
      {value.from && <span className="dr-text small strong nowrap">{rangeText(value)}</span>}
      {open === 'list' && (
        <div className={`pop dr-pop dr-list ${flip ? 'flip' : ''}`} role="listbox" ref={listRef}>
          {(allowAll ? [ALL, ...PRESETS] : PRESETS).map((name) => {
            const r = presetRange(name, fiscal);
            return <button key={name} type="button" role="option" aria-selected={value.preset === name} className={`dr-opt ${value.preset === name ? 'on' : ''}`} onClick={() => pick(name)}><span className="nowrap">{name}</span>{r.from && <span className="dr-opt-range small strong nowrap">{rangeText(r)}</span>}</button>;
          })}
        </div>
      )}
      {open === 'cal' && <div className={`pop dr-pop dr-cal-pop ${flip ? 'flip' : ''}`}><Calendar value={value} onCancel={() => setOpen(null)} onApply={(r) => { onChange(r); setOpen(null); }} /></div>}
    </div>
  );
}
