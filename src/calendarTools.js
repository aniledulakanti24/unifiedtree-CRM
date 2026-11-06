// Dates and availability for tasks and appointments. Nothing here touches the screen.
import { iso, today } from './util';

export const REPEATS = ['Never', 'Daily', 'Weekdays', 'Weekly', 'Monthly'];
const addOne = (date, repeat) => {
  const d = new Date(date);
  if (repeat === 'Monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'Weekly') d.setDate(d.getDate() + 7);
  else {
    d.setDate(d.getDate() + 1);
    if (repeat === 'Weekdays') while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  }
  return d;
};
// The next due date for a repeating task, never in the past.
export const nextDue = (due, repeat) => {
  let d = addOne(`${due}T12:00:00`, repeat);
  while (iso(d) < today()) d = addOne(d, repeat);
  return iso(d);
};
export const seriesStarts = (start, repeat, until, max = 26) => {
  const out = [new Date(start)];
  if (!repeat || repeat === 'Never') return out;
  const end = until ? new Date(`${until}T23:59:59`) : null;
  let d = new Date(start);
  while (out.length < max) {
    d = addOne(d, repeat);
    if (end && d > end) break;
    out.push(new Date(d));
  }
  return out;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
export const eventsFor = (events, userId) => events.filter((e) => e.ownerId === userId || e.attendeeIds?.includes(userId));
export const clashes = (events, userIds, start, end, ignoreId) => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return events.filter((x) => x.id !== ignoreId && x.category !== 'Holiday' && overlaps(s, e, new Date(x.start).getTime(), new Date(x.end).getTime()) && userIds.some((u) => x.ownerId === u || x.attendeeIds?.includes(u)));
};
// The first slot when everyone is free, in working hours on weekdays.
export const firstFree = (events, userIds, minutes, from = new Date(), { startHour = 9, endHour = 17, days = 14 } = {}) => {
  const step = 30 * 6e4;
  let t = new Date(Math.ceil(from.getTime() / step) * step);
  const limit = t.getTime() + days * 864e5;
  while (t.getTime() < limit) {
    const end = new Date(t.getTime() + minutes * 6e4);
    const hour = t.getHours() + t.getMinutes() / 60;
    const fits = ![0, 6].includes(t.getDay()) && hour >= startHour && hour + minutes / 60 <= endHour;
    if (fits && !clashes(events, userIds, t, end).length) return t;
    t = new Date(t.getTime() + step);
  }
  return null;
};

export const bookingOf = (prefs) => ({ on: false, from: '09:00', to: '17:00', length: 30, ...(prefs?.booking || {}) });
export const bookingSlots = (events, userId, booking, day) => {
  if ([0, 6].includes(day.getDay())) return [];
  const [fh, fm] = booking.from.split(':').map(Number);
  const [th, tm] = booking.to.split(':').map(Number);
  const length = Number(booking.length) || 30;
  const start = new Date(day); start.setHours(fh, fm, 0, 0);
  const stop = new Date(day); stop.setHours(th, tm, 0, 0);
  const out = [];
  for (let t = start; t.getTime() + length * 6e4 <= stop.getTime(); t = new Date(t.getTime() + length * 6e4)) {
    if (t > new Date() && !clashes(events, [userId], t, new Date(t.getTime() + length * 6e4)).length) out.push(new Date(t));
  }
  return out;
};

const stamp = (s) => new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const clean = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
// A calendar file that Google, Outlook and Apple calendars can open.
export const icsFile = (events, company = 'Unifiedtree CRM') => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${clean(company)}//CRM//EN`, 'CALSCALE:GREGORIAN',
  ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.id}@unifiedtree`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${clean(e.title)}`, ...(e.location ? [`LOCATION:${clean(e.location)}`] : []), ...(e.notes ? [`DESCRIPTION:${clean(e.notes)}`] : []), 'END:VEVENT']),
  'END:VCALENDAR',
].join('\r\n');
