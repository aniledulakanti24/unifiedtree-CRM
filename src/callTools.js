// Calling rules that a phone provider would apply: local time, do-not-call, which number to show, opening hours and the phone menu.
const COUNTRIES = [
  ['+971', 'United Arab Emirates', 'Asia/Dubai'], ['+966', 'Saudi Arabia', 'Asia/Riyadh'], ['+353', 'Ireland', 'Europe/Dublin'], ['+234', 'Nigeria', 'Africa/Lagos'], ['+254', 'Kenya', 'Africa/Nairobi'],
  ['+44', 'United Kingdom', 'Europe/London'], ['+49', 'Germany', 'Europe/Berlin'], ['+33', 'France', 'Europe/Paris'], ['+34', 'Spain', 'Europe/Madrid'], ['+39', 'Italy', 'Europe/Rome'],
  ['+31', 'Netherlands', 'Europe/Amsterdam'], ['+46', 'Sweden', 'Europe/Stockholm'], ['+41', 'Switzerland', 'Europe/Zurich'], ['+48', 'Poland', 'Europe/Warsaw'], ['+91', 'India', 'Asia/Kolkata'],
  ['+86', 'China', 'Asia/Shanghai'], ['+81', 'Japan', 'Asia/Tokyo'], ['+82', 'South Korea', 'Asia/Seoul'], ['+65', 'Singapore', 'Asia/Singapore'], ['+61', 'Australia', 'Australia/Sydney'],
  ['+64', 'New Zealand', 'Pacific/Auckland'], ['+55', 'Brazil', 'America/Sao_Paulo'], ['+52', 'Mexico', 'America/Mexico_City'], ['+27', 'South Africa', 'Africa/Johannesburg'], ['+1', 'United States or Canada', 'America/New_York'],
];
export const COUNTRY_NAMES = [...new Set(COUNTRIES.map((c) => c[1]))].sort();
const digits = (s) => String(s || '').replace(/\D/g, '');
export const countryOf = (phone) => {
  const p = String(phone || '').trim();
  if (!p.startsWith('+')) return null;
  const hit = COUNTRIES.find(([code]) => p.replace(/\s/g, '').startsWith(code));
  return hit ? { code: hit[0], country: hit[1], tz: hit[2] } : null;
};
export const localTime = (phone, at = new Date()) => {
  const c = countryOf(phone);
  if (!c) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: c.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(at);
    const get = (t) => parts.find((x) => x.type === t)?.value;
    return { ...c, hour: Number(get('hour')), time: `${get('hour')}:${get('minute')}`, day: get('weekday') };
  } catch { return null; }
};
const hourOf = (hhmm, fallback) => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h + (m || 0) / 60 : fallback; };

export const DEFAULT_PHONE = {
  numbers: [], callFrom: '08:00', callTo: '21:00',
  hours: { on: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
  menu: { on: false, greeting: 'Thanks for calling. Press 1 for sales, or 2 for support.', options: [{ key: '1', label: 'Sales', to: 'owner' }, { key: '2', label: 'Support', to: '' }] },
  voicemail: true, voicemailGreeting: 'Sorry we missed you. Please leave a message and we will call you back.',
  autoRecord: false, announce: true, announceText: 'This call may be recorded for training and quality.',
  keywords: ['price', 'discount', 'competitor', 'contract', 'demo', 'budget'],
};
export const phoneOf = (settings) => ({ ...DEFAULT_PHONE, ...settings?.phone, hours: { ...DEFAULT_PHONE.hours, ...settings?.phone?.hours }, menu: { ...DEFAULT_PHONE.menu, ...settings?.phone?.menu } });

// Reasons to stop or think before calling. Do-not-call blocks; a late hour only warns.
export const callCheck = (db, phone, at = new Date()) => {
  const ph = phoneOf(db.settings);
  const key = digits(phone);
  const dnc = key.length >= 6 && (db.aiDnc || []).find((x) => digits(x.phone) === key);
  if (dnc) return { block: `${dnc.name || phone} is on the do-not-call list (${dnc.source || 'added by hand'}).` };
  const local = localTime(phone, at);
  if (!local) return {};
  const h = local.hour + Number(local.time.slice(3)) / 60;
  if (h < hourOf(ph.callFrom, 8) || h >= hourOf(ph.callTo, 21)) return { warn: `It is ${local.time} in ${local.country}. Your calling hours are ${ph.callFrom} to ${ph.callTo} their time.`, local };
  return { local };
};
// Shows a number from the customer's own country when you have one. People answer local numbers more often.
export const callerIdFor = (settings, phone) => {
  const c = countryOf(phone);
  const own = (phoneOf(settings).numbers || []).find((n) => c && countryOf(n.number)?.country === c.country);
  return own ? { number: own.number, why: `Your ${c.country} number` } : { number: settings.businessNumber, why: 'Your main number' };
};
const weekday = (tz, at) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const get = (t) => parts.find((x) => x.type === t)?.value;
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), h: Number(get('hour')) + Number(get('minute')) / 60 };
  } catch { return { day: at.getDay(), h: at.getHours() + at.getMinutes() / 60 }; }
};
// Opening hours use the company time zone in Settings.
export const isOpen = (settings, at = new Date()) => {
  const hrs = phoneOf(settings).hours;
  if (!hrs.on) return true;
  const { day, h } = weekday(settings.timezone || 'UTC', at);
  return (hrs.days || []).includes(day) && h >= hourOf(hrs.from, 9) && h < hourOf(hrs.to, 18);
};
// Who rings when the caller picks a menu option: the record owner, a team, or one person.
export const menuChain = (db, option, baseChain) => {
  const active = db.users.filter((u) => u.active);
  if (!option?.to || option.to === 'owner') return baseChain;
  if (option.to.startsWith('user:')) { const id = option.to.slice(5); return active.some((u) => u.id === id) ? [id, ...baseChain.filter((x) => x !== id)] : baseChain; }
  if (option.to.startsWith('team:')) {
    const team = db.teams.find((t) => t.id === option.to.slice(5));
    const members = active.filter((u) => u.teamId === team?.id && u.role === 'sales').map((u) => u.id);
    return [...new Set([...members, team?.managerId, ...baseChain])].filter((id) => id && active.some((u) => u.id === id));
  }
  return baseChain;
};

const VOICEMAILS = [
  'Hi, it is {name}. I wanted to ask about pricing for a larger order. Please call me back when you can.',
  'Hello, {name} here. We had a question about our last invoice. Could someone give me a ring?',
  'This is {name}. I saw your demo and would like to talk about next steps. Thanks.',
  'Hi, {name} calling about the contract renewal. I am free after two today.',
];
export const voicemailFor = (name, n = Math.floor(Math.random() * VOICEMAILS.length)) => {
  const text = VOICEMAILS[n % VOICEMAILS.length].replace('{name}', /^[+\d]/.test(name || '') ? 'a customer' : String(name).split(' ')[0]);
  return { text, seconds: 12 + text.length / 6 | 0 };
};

// Sample conversations, so call coaching has something to read. Nothing was really recorded.
const TALKS = [
  [['you', 'Hello {first}, thanks for taking the call. Is now still a good time?'], ['them', 'Yes, I have about fifteen minutes.'], ['you', 'Great. What made you look at a new system this quarter?'], ['them', 'Our team spends too long on spreadsheets, and we keep losing track of follow-ups.'], ['you', 'How many people would use it day to day?'], ['them', 'About twenty, maybe more next year.'], ['you', 'And how are you deciding between options?'], ['them', 'Price matters, but a competitor offered a discount, so we are comparing.'], ['you', 'That makes sense. Shall I set up a demo with your team next week?'], ['them', 'Yes, that works. Send me a few times.']],
  [['you', 'Hi {first}, I am calling about the proposal we sent.'], ['them', 'Right, we looked at it.'], ['you', 'Our package covers the whole team, with training included, and we can start within two weeks, and the price is fixed for the first year, which most customers like because it makes the budget easier to plan.'], ['them', 'The price is higher than we expected.'], ['you', 'I understand. The contract can be monthly to start.'], ['them', 'That could help. I need to check with finance.'], ['you', 'Of course. I will send a short summary today.']],
  [['you', 'Hello {first}, just checking in after the delivery.'], ['them', 'Thanks for calling. Everything arrived, and the team is happy.'], ['you', 'Great to hear. Is there anything we could do better?'], ['them', 'The setup guide was very helpful. Thanks again.'], ['you', 'Would you be open to talking about the renewal next month?'], ['them', 'Yes, put something in the calendar.']],
];
export const sampleTalk = (n, name) => {
  const first = String(name || 'there').split(' ')[0];
  return TALKS[n % TALKS.length].map(([who, text]) => ({ who, text: text.replace('{first}', first) }));
};

const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const GOOD = ['great', 'happy', 'thanks', 'helpful', 'works', 'yes', 'good', 'perfect'];
const BAD = ['expensive', 'higher than', 'problem', 'losing', 'not happy', 'cancel', 'too long', 'complaint'];
// Simple measures a coach looks at. Talk share near half, a few questions, and no long speeches.
export const coaching = (lines = [], keywords = DEFAULT_PHONE.keywords) => {
  if (!lines.length) return null;
  const mine = lines.filter((l) => l.who === 'you');
  const youWords = mine.reduce((a, l) => a + words(l.text), 0);
  const all = lines.reduce((a, l) => a + words(l.text), 0) || 1;
  let longest = 0; let run = 0;
  lines.forEach((l) => { run = l.who === 'you' ? run + words(l.text) : 0; longest = Math.max(longest, run); });
  const text = lines.map((l) => l.text.toLowerCase()).join(' ');
  const theirs = lines.filter((l) => l.who !== 'you').map((l) => l.text.toLowerCase()).join(' ');
  const mood = GOOD.filter((w) => theirs.includes(w)).length - BAD.filter((w) => theirs.includes(w)).length;
  const share = Math.round((youWords / all) * 100);
  const questions = mine.filter((l) => l.text.trim().endsWith('?')).length;
  const tips = [];
  if (share > 65) tips.push('You did most of the talking. Ask more and listen longer.');
  if (questions < 2) tips.push('Ask at least two open questions about their needs.');
  if (longest > 45) tips.push(`One stretch ran to ${longest} words. Break long explanations up with a question.`);
  if (!tips.length) tips.push('Good balance of talking and listening.');
  return { share, questions, longest, keywords: keywords.filter((k) => k && text.includes(String(k).toLowerCase())), mood: mood > 0 ? 'Positive' : mood < 0 ? 'Concerned' : 'Neutral', tips };
};

// Sample voicemails and recorded calls for the demo company, once.
export const upgradeSampleCalls = (d) => {
  if (d.callsV1) return d;
  let rec = 0; let vm = 0;
  const calls = d.calls.map((c, i) => {
    if (c.direction === 'Incoming' && c.outcome === 'No answer' && vm < 6) { vm += 1; return { ...c, voicemail: voicemailFor(c.name, i), handled: vm > 3 }; }
    if (c.outcome === 'Connected' && c.type === 'voice' && rec < 18 && i % 3 === 0) {
      rec += 1;
      const lines = sampleTalk(i, c.name);
      return { ...c, recording: true, sample: true, lines, summary: ['They want a demo next week and are comparing prices with a competitor.', 'Price is the concern. Offered a monthly contract; they will check with finance.', 'Happy customer. Agreed to talk about the renewal next month.'][i % 3] };
    }
    return c;
  });
  return { ...d, callsV1: true, calls };
};
