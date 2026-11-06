// The simulated assistant: fixed rules and word matching over the CRM's own records. No AI model is involved.
import { presetRange } from './dateRange';
import { dealInsights, lastTouch, nextActivity } from './engine';
import { addDays, money, moneyK, num, pct, rateFor, sum, today } from './util';

const DAY = 864e5;
const CLOSED = ['Closed', 'Rejected'];
const unpaid = (i) => (i.total || 0) - (i.paid || 0);
const daysSince = (s) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / DAY) : Infinity);

/* ---------- Win chance ---------- */
export function dealScore(db, d) {
  if (d.status !== 'open') return null;
  const reasons = [[`Stage: ${db.stages.find((s) => s.id === d.stage)?.name || d.stage}`, Math.round((d.probability || 0) * 0.6)]];
  const idle = daysSince(lastTouch(db, d.id) || d.createdAt);
  if (idle <= 7) reasons.push(['Recent activity', 12]);
  if (idle >= 14) reasons.push([`No activity for ${idle} days`, -15]);
  if (nextActivity(d.id, db.activities)) reasons.push(['A next step is planned', 8]); else reasons.push(['No next step planned', -8]);
  if (d.closeDate && d.closeDate < today()) reasons.push(['Closing date has passed', -15]);
  reasons.push(d.contactId ? ['A contact is linked', 5] : ['No contact linked', -5]);
  if ((d.people || []).length > 1) reasons.push(['Several people involved', 5]);
  const quotes = db.quotes.filter((q) => q.dealId === d.id);
  if (quotes.some((q) => q.status === 'Accepted')) reasons.push(['Quote accepted', 15]);
  else if (quotes.some((q) => q.status === 'Sent')) reasons.push(['Quote sent', 8]);
  if (d.priority >= 2) reasons.push(['Marked as high priority', 5]);
  // How deals like this have gone before.
  const rate = (list) => { const n = list.length; return n >= 5 ? list.filter((x) => x.status === 'won').length / n : null; };
  const closed = db.deals.filter((x) => x.status !== 'open');
  const bySource = rate(closed.filter((x) => x.source && x.source === d.source));
  const byOwner = rate(closed.filter((x) => x.ownerId === d.ownerId));
  if (bySource != null && bySource >= 0.6) reasons.push([`${d.source} deals often win`, 6]);
  if (byOwner != null && byOwner >= 0.6) reasons.push(['This salesperson wins often', 6]);
  if (byOwner != null && byOwner <= 0.35) reasons.push(['This salesperson wins less often', -4]);
  return { score: Math.max(1, Math.min(99, 10 + sum(reasons, (r) => r[1]))), reasons };
}

/* ---------- Customer health ---------- */
export function customerHealth(db, c) {
  const reasons = [];
  const dates = [...db.orders.filter((o) => o.companyId === c.id && o.status !== 'Cancelled').map((o) => o.date), ...db.deals.filter((d) => d.companyId === c.id && d.status === 'won').map((d) => d.closeDate)].filter(Boolean).sort();
  const last = dates[dates.length - 1];
  if (!last) return { label: 'New', tone: 'info', score: null, reasons: [['Has not bought yet', 0]] };
  const days = daysSince(last);
  if (days <= 60) reasons.push([days <= 1 ? 'Bought in the last day' : `Bought ${days} days ago`, 15]);
  else if (days <= 180) reasons.push([`Last bought ${days} days ago`, -10]);
  else reasons.push([`Nothing bought for ${days} days`, -30]);
  const overdue = db.invoices.filter((i) => i.companyId === c.id && unpaid(i) > 0 && i.due < today());
  if (overdue.length) reasons.push([`${money(sum(overdue, unpaid))} overdue`, -20]);
  const cases = db.cases.filter((x) => x.companyId === c.id && !CLOSED.includes(x.status));
  if (cases.some((x) => x.priority === 'Urgent')) reasons.push(['An urgent support case is open', -15]);
  else if (cases.length >= 2) reasons.push([`${cases.length} support cases open`, -8]);
  if (db.deals.some((d) => d.companyId === c.id && d.status === 'open')) reasons.push(['An open deal in progress', 8]);
  const score = Math.max(1, Math.min(99, 70 + sum(reasons, (r) => r[1])));
  return { score, reasons, label: score >= 70 ? 'Healthy' : score >= 45 ? 'Watch' : 'At risk', tone: score >= 70 ? 'good' : score >= 45 ? 'warn' : 'bad' };
}

/* ---------- What to do first ---------- */
export function nextActions({ db, tasks, open, leads, invoices, cases, companyName }) {
  const now = today();
  const items = [];
  tasks.filter((a) => a.status !== 'done' && a.due < now).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3).forEach((a) => items.push({ weight: 60 + Math.min(20, daysSince(a.due)), icon: 'AlarmClock', title: a.summary, why: `Task overdue by ${daysSince(a.due)} days`, to: a.relatedType === 'deal' ? `/pipeline/${a.relatedId}` : '/tasks' }));
  open.forEach((d) => {
    const { flags } = dealInsights(db, d);
    if (d.closeDate < now) items.push({ weight: 55 + Math.min(30, d.value / 3000), icon: 'CalendarX', title: `Update ${d.title}`, why: `${moneyK(d.value)} deal past its closing date`, to: `/pipeline/${d.id}` });
    else if (flags.length >= 2) items.push({ weight: 40 + Math.min(30, d.value / 3000), icon: 'ShieldAlert', title: `Rescue ${d.title}`, why: flags[0], to: `/pipeline/${d.id}` });
  });
  leads.filter((l) => l.status === 'New').sort((a, b) => b.score - a.score).slice(0, 3).forEach((l) => items.push({ weight: 35 + l.score / 2, icon: 'Flame', title: `Contact ${l.name}`, why: `${l.company}, lead score ${l.score}`, to: `/leads?open=${l.id}` }));
  invoices.filter((i) => unpaid(i) > 0 && i.due < now).forEach((i) => items.push({ weight: 45 + Math.min(30, unpaid(i) / 500), icon: 'Receipt', title: `Chase ${i.number}`, why: `${money(unpaid(i))} overdue from ${companyName(i.companyId)}`, to: '/billing' }));
  cases.filter((c) => c.priority === 'Urgent' && !CLOSED.includes(c.status)).forEach((c) => items.push({ weight: 80, icon: 'Siren', title: `Reply to case #${c.number}`, why: c.subject, to: `/cases?open=${c.id}` }));
  return items.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/* ---------- Writing ---------- */
export const DRAFT_KINDS = [['follow', 'Follow up'], ['intro', 'Introduce myself'], ['quote', 'Remind about a quote'], ['payment', 'Remind about a payment'], ['thanks', 'Say thank you'], ['meeting', 'Ask for a meeting']];
export function draftEmail(kind, { first, company = 'your company', me = '' } = {}) {
  const hi = first ? `Hi ${first},` : 'Hello,';
  const bodies = {
    follow: [first ? `Following up, ${first}` : 'Following up', `${hi}\n\nI wanted to follow up on our last conversation about ${company}. Is there anything you need from me to move this forward?\n\nHappy to talk whenever suits you.`],
    intro: [`Introduction from ${me.split(' ')[0] || 'our team'}`, `${hi}\n\nI'm ${me || 'getting in touch'}, and I help businesses like ${company} save time on sales and operations. Could we have a short call this week to see if we can help?`],
    quote: ['Your quote', `${hi}\n\nI sent a quote for ${company} recently. Have you had a chance to look through it? I'm happy to walk you through anything or adjust it.`],
    payment: ['Payment reminder', `${hi}\n\nOur records show an invoice for ${company} is now due. Could you let me know when we can expect the payment? If it's already on its way, please ignore this note.`],
    thanks: ['Thank you', `${hi}\n\nThank you for your time and for choosing to work with us. Please reach out any time you need something.`],
    meeting: [first ? `Could we meet this week, ${first}?` : 'Could we meet this week?', `${hi}\n\nCould we find 20 minutes this week to talk about ${company}? Let me know a time that works and I'll send an invite.`],
  };
  const [subject, body] = bodies[kind] || bodies.follow;
  return { subject, body };
}
const sentences = (t) => t.match(/[^.!?\n]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) || [];
export function rewrite(text, tone) {
  const t = String(text || '').trim();
  if (!t) return t;
  if (tone === 'shorter') {
    const lines = t.split('\n').map((x) => x.trim()).filter(Boolean);
    const greet = /^(hi|hello|dear|hey)\b/i.test(lines[0]) && lines[0].length < 40 ? lines.shift() : '';
    const rest = sentences(lines.join(' ')).slice(0, 2).join(' ');
    return greet ? `${greet}\n\n${rest}` : rest;
  }
  if (tone === 'formal') {
    return t.replace(/Hi there/g, 'Hello').replace(/\bHi\b/g, 'Dear').replace(/\bHey\b/g, 'Dear').replace(/\bThanks\b/g, 'Thank you').replace(/\bI'm\b/g, 'I am').replace(/\bI'll\b/g, 'I will').replace(/\bit's\b/gi, 'it is').replace(/\bdon't\b/gi, 'do not').replace(/\bcan't\b/gi, 'cannot').replace(/\bHappy to\b/g, 'I would be glad to');
  }
  const lines = t.split('\n');
  if (/^(hi|hello|dear)\b/i.test(lines[0])) lines.splice(1, 0, '', 'I hope you are having a good week!');
  else lines.unshift('I hope you are having a good week!', '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\bDear\b/g, 'Hi');
}
export function suggestReply(text) {
  const s = String(text || '').toLowerCase();
  if (/price|pricing|cost|quote|rate/.test(s)) return 'Happy to share the pricing. Could you confirm the quantity you need?';
  if (/discount|expensive|budget/.test(s)) return 'I understand. Let me see what I can do and come back to you today.';
  if (/deliver|shipment|dispatch|when will/.test(s)) return 'Let me check the delivery status and update you shortly.';
  if (/call|talk|speak|meet/.test(s)) return 'Of course. Would tomorrow morning suit you for a quick call?';
  if (/thank/.test(s)) return 'You are welcome. Let me know if you need anything else.';
  if (/not right now|next month|later/.test(s)) return 'No problem. I will check back with you next month.';
  if (/next step|send|details/.test(s)) return 'Great, I will send the details over today.';
  return 'Thanks for your message. I will get back to you shortly.';
}
export function actionItems(lines = [], note = '') {
  const said = [...lines.map((l) => l.text), note].join(' ').toLowerCase();
  const out = [];
  if (/send|share/.test(said)) out.push('Send the details we discussed');
  if (/pric/.test(said)) out.push('Prepare pricing');
  if (/meet|demo/.test(said)) out.push('Schedule a meeting');
  if (/call (me |them )?back|tomorrow|next week/.test(said)) out.push('Call back as agreed');
  return out.length ? out : ['Follow up on this call'];
}

/* ---------- Answering questions ---------- */
const PERIODS = [[/\btoday\b/, 'Today'], [/\byesterday\b/, 'Yesterday'], [/\bthis week\b/, 'This Week'], [/\blast week\b/, 'Last Week'], [/\bthis month\b/, 'This Month'], [/\b(last|previous) month\b/, 'Previous Month'], [/\bthis quarter\b/, 'This Quarter'], [/\b(last|previous) quarter\b/, 'Previous Quarter'], [/\b(this|current) (fiscal |financial )?year\b/, 'Current Fiscal Year'], [/\b(last|previous) (fiscal |financial )?year\b/, 'Previous Fiscal Year'], [/\blast 7 days\b/, 'Last 7 Days'], [/\blast 30 days\b/, 'Last 30 Days'], [/\blast 365 days\b/, 'Last 365 Days']];
const dueFrom = (s) => {
  if (/\btoday\b/.test(s)) return today();
  if (/\bnext week\b/.test(s)) return addDays(7);
  const m = s.match(/in (\d+) days?/);
  return m ? addDays(Number(m[1])) : addDays(1);
};
export const SUGGESTIONS = {
  admin: ['Give me my daily brief', 'Sales by month', 'How much did we win this month?', 'Which invoices are overdue?', 'Who is behind target?', 'Show deals at risk', 'Best lead source', 'Tell me about customers at risk'],
  manager: ['Give me my daily brief', 'Sales by rep', 'How is my team doing?', 'Who is behind target?', 'Show deals at risk', 'Which leads are waiting?', 'What should I do first?', 'Why are we losing deals?'],
  sales: ['Give me my daily brief', 'What should I do first?', 'My tasks today', 'Which deals are closing this month?', 'Show my hot leads', 'How close am I to target?', 'Remind me to call Hana tomorrow'],
};

// `ctx` holds only what this person may see, so an answer can never show more than the rest of the CRM does.
export function answer(question, ctx) {
  const { db, me, role, scope, can, userName, companyName, canRoute } = ctx;
  const s = ` ${question.toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const has = (re) => re.test(s);
  const hit = PERIODS.find(([re]) => re.test(s));
  const range = hit ? { ...presetRange(hit[1], db.settings.fiscalStart), name: hit[1] } : null;
  const inR = (d) => !range || ((d || '').slice(0, 10) >= range.from && (d || '').slice(0, 10) <= range.to);
  const when = range ? ` ${range.name.toLowerCase().replace('current ', 'this ').replace('previous ', 'last ')}` : '';
  const person = db.users.find((u) => u.active && s.includes(` ${u.name.split(' ')[0].toLowerCase()} `) && u.id !== me.id);
  // Someone outside what this person can see gets a clear no, not a misleading zero.
  if (person && (role === 'sales' || (role === 'manager' && person.teamId !== me.teamId))) return { text: `You can't see ${person.name.split(' ')[0]}'s records, so I can't answer that. Ask your manager or admin.` };
  const mineOnly = has(/ (my|i|me|am i) /) && role !== 'sales';
  const who = (list) => (person ? list.filter((r) => r.ownerId === person.id) : mineOnly ? list.filter((r) => r.ownerId === me.id) : list);
  const whoName = person ? `${person.name.split(' ')[0]} ` : '';
  const deals = can('pipeline') ? who(scope(db.deals, 'pipeline')) : [];
  const open = deals.filter((d) => d.status === 'open');
  const dealRow = (d) => ({ title: d.title, sub: `${companyName(d.companyId)} · ${userName(d.ownerId)}`, value: moneyK(d.value), to: `/pipeline/${d.id}` });
  const leads = can('leads') ? who(scope(db.leads, 'leads')) : [];
  const leadRow = (l) => ({ title: l.name, sub: `${l.company} · score ${l.score}`, value: moneyK(l.expected), to: `/leads?open=${l.id}` });
  const invoices = can('billing') ? who(scope(db.invoices, 'billing')) : [];
  const tasks = can('tasks') ? who(scope(db.activities, 'tasks')) : who(scope(db.activities, 'pipeline'));
  const cases = can('cases') ? who(scope(db.cases, 'cases')) : [];
  const orders = can('orders') ? who(scope(db.orders, 'orders')) : [];
  const noAccess = (what) => ({ text: `You don't have access to ${what}, so I can't answer that. Ask your admin if you need it.` });

  if (has(/ (help|what can you|how do you work) /)) return { text: 'I can look through your CRM records and answer questions like the ones below. I follow fixed rules rather than a real AI model, so I may not understand every way of asking.' };

  const stopWords = new Set(['the', 'and', 'for', 'our', 'his', 'her', 'its', 'why', 'how', 'set', 'has', 'are', 'not', 'all', 'can', 'you', 'low', 'deal', 'move', 'change', 'value', 'assign', 'update', 'stage', 'that', 'this', 'about', 'tell', 'with', 'from', 'note', 'amount', 'revenue', 'chance', 'risk', 'what', 'show', 'give']);
  const asked = (extra = []) => s.trim().split(' ').filter((w) => w.length >= 3 && !stopWords.has(w) && !extra.includes(w));
  const matches = (name, words) => words.some((w) => (name || '').toLowerCase().split(/[^a-z0-9]+/).includes(w));
  const focusDeal = () => (ctx.focus?.kind === 'deal' && has(/ (it|this|that) /) ? scope(db.deals, 'pipeline').find((d) => d.id === ctx.focus.id) : null);
  const findDeal = (extra = []) => focusDeal() || (can('pipeline') ? scope(db.deals, 'pipeline').filter((d) => d.status === 'open').find((d) => matches(d.title, asked(extra))) || scope(db.deals, 'pipeline').find((d) => matches(d.title, asked(extra))) : null);
  const noDeal = 'Which deal? Use a word from its name, such as "Move Meridian to Proposal".';

  // A short catch-up on your day.
  if (has(/ (daily brief|brief me|catch me up|my day|morning brief) /)) {
    const now = today();
    const mine = (l) => l.filter((r) => r.ownerId === me.id);
    const myTasks = can('tasks') ? mine(scope(db.activities, 'tasks')).filter((a) => a.status !== 'done') : [];
    const myDeals = mine(open);
    const due = myTasks.filter((a) => a.due <= now);
    const closing = myDeals.filter((d) => d.closeDate >= now && d.closeDate <= addDays(7));
    const myLeads = mine(leads).filter((l) => l.status === 'New');
    const first = nextActions({ db, tasks: myTasks, open: myDeals, leads: myLeads, invoices: mine(invoices), cases: mine(cases), companyName })[0];
    return { text: `Good day, ${me.name.split(' ')[0]}. You have ${num(due.length)} ${due.length === 1 ? 'task' : 'tasks'} due, ${num(closing.length)} ${closing.length === 1 ? 'deal' : 'deals'} closing this week worth ${money(sum(closing, (d) => d.value))}, and ${num(myLeads.length)} new ${myLeads.length === 1 ? 'lead' : 'leads'}.${first ? ` Start with: ${first.title}.` : ''}`, rows: [...due.slice(0, 3).map((a) => ({ title: a.summary, sub: `Due ${a.due}`, to: '/tasks' })), ...closing.slice(0, 3).map(dealRow)] };
  }
  // A chart, not just a number.
  const by = s.match(/ (?:sales|revenue|won|wins) (?:by|per) (month|stage|source|rep|salesperson) /)?.[1];
  if (by) {
    if (!can('pipeline')) return noAccess('deals');
    const won = deals.filter((d) => d.status === 'won');
    const rows = new Map();
    if (by === 'stage') open.forEach((d) => { const k = db.stages.find((x) => x.id === d.stage)?.name || d.stage; rows.set(k, (rows.get(k) || 0) + d.value); });
    else won.forEach((d) => { const k = by === 'month' ? (d.closeDate || '').slice(0, 7) : by === 'source' ? d.source || 'Not recorded' : userName(d.ownerId); rows.set(k, (rows.get(k) || 0) + d.value); });
    const data = [...rows.entries()].map(([label, value]) => ({ label, Value: value }));
    const sorted = by === 'month' ? data.sort((a, b) => a.label.localeCompare(b.label)).slice(-12) : data.sort((a, b) => b.Value - a.Value).slice(0, 8);
    return { text: by === 'stage' ? 'Open deals by stage.' : `Revenue won by ${by === 'rep' ? 'salesperson' : by}.`, chart: sorted };
  }

  // Changes to a record. Nothing happens until the person confirms.
  if (has(/ move /) && has(/ to /)) {
    if (!can('pipeline', 'edit')) return noAccess('changing deals');
    const stage = db.stages.find((x) => s.includes(` ${x.name.toLowerCase()} `));
    if (!stage) return { text: `Which stage? Try: ${db.stages.map((x) => x.name).join(', ')}.` };
    if (/^(won|lost)$/i.test(stage.name)) return { text: `Please mark a deal as ${stage.name.toLowerCase()} on its own page, so nothing is skipped.` };
    const d = findDeal(stage.name.toLowerCase().split(' '));
    if (!d) return { text: noDeal };
    const from = db.stages.find((x) => x.id === d.stage)?.name || d.stage;
    return { text: 'Confirm this change:', focus: { kind: 'deal', id: d.id }, action: { type: 'change', kind: 'stage', title: `Move ${d.title}`, detail: `${from} to ${stage.name}`, id: d.id, stage: stage.id, before: d.stage } };
  }
  // Read from the original words, because commas and points matter in a number.
  const amount = has(/ (set|change|update) /) && has(/ (value|amount|revenue) /) ? question.match(/\bto\s+[^0-9]*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|m)?\b/i) : null;
  if (amount) {
    if (!can('pipeline', 'edit')) return noAccess('changing deals');
    const d = findDeal();
    if (!d) return { text: noDeal };
    const typed = Number(amount[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[(amount[2] || '').toLowerCase()] || 1);
    const value = typed / rateFor(d);
    return { text: 'Confirm this change:', focus: { kind: 'deal', id: d.id }, action: { type: 'change', kind: 'field', entity: 'deals', title: `Change ${d.title}`, detail: `Expected revenue ${money(d.value)} to ${money(value)}`, id: d.id, patch: { value }, before: { value: d.value } } };
  }
  if (has(/ assign /) && has(/ to /)) {
    const target = db.users.find((u) => u.active && s.includes(` to ${u.name.split(' ')[0].toLowerCase()} `));
    if (!target) return { text: 'Who to? Use their first name, such as "Assign Kai to Rohan".' };
    const extra = [target.name.split(' ')[0].toLowerCase()];
    const lead = can('leads', 'assign') ? scope(db.leads, 'leads').find((l) => matches(`${l.name} ${l.company}`, asked(extra))) : null;
    if (lead) return { text: 'Confirm this change:', action: { type: 'change', kind: 'field', entity: 'leads', title: `Assign ${lead.name}`, detail: `${userName(lead.ownerId)} to ${target.name}`, id: lead.id, patch: { ownerId: target.id }, before: { ownerId: lead.ownerId } } };
    return { text: "I can only assign leads you're allowed to assign. Use a word from the lead's name." };
  }
  const noteMatch = question.match(/\b(?:add|log)\s+(?:a\s+)?note\s+(?:on|to|for)\s+(.+?)\s*:\s*(.+)$/i);
  if (noteMatch) {
    const words = noteMatch[1].toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const d = can('pipeline', 'edit') ? scope(db.deals, 'pipeline').find((x) => matches(x.title, words)) : null;
    const c = !d && can('customers', 'edit') ? scope(db.companies, 'customers').find((x) => matches(x.name, words)) : null;
    const rec = d || c;
    if (!rec) return { text: "I can't find that record, or you can't change it." };
    return { text: 'Confirm this note:', action: { type: 'change', kind: 'field', entity: d ? 'deals' : 'companies', title: `Note on ${d ? d.title : c.name}`, detail: noteMatch[2], id: rec.id, patch: { notes: rec.notes ? `${noteMatch[2]}\n${rec.notes}` : noteMatch[2] }, before: { notes: rec.notes || '' } } };
  }
  // Why a deal looks the way it does, and what to do.
  if (has(/ (why|chance|score|at risk|next step|what should i do about) /) && !has(/ (deals|losing deals) /)) {
    const d = findDeal();
    const scored = d && dealScore(db, d);
    if (scored) {
      const bad = scored.reasons.filter(([, n]) => n < 0).map(([t]) => t);
      const good = scored.reasons.filter(([, n]) => n > 0).map(([t]) => t);
      return { text: `${d.title} has a ${scored.score}% win chance.${good.length ? ` Helping: ${good.join(', ')}.` : ''}${bad.length ? ` Hurting: ${bad.join(', ')}.` : ''}`, focus: { kind: 'deal', id: d.id }, rows: [dealRow(d)] };
    }
  }

  // Doing something, not just answering.
  if (has(/^ (remind me|create (a )?task|add (a )?task|new task) /)) {
    if (!can('tasks', 'create')) return noAccess('creating tasks');
    const summary = question.replace(/^(remind me to|remind me|create a task to|create a task|create task|add a task to|add a task|add task|new task)\s*/i, '').replace(/\b(today|tomorrow|next week|in \d+ days?)\b/i, '').replace(/\s+/g, ' ').trim().replace(/[?.]$/, '');
    if (!summary) return { text: 'What should the task say? For example, "Remind me to call Hana tomorrow".' };
    const due = dueFrom(s);
    return { text: `I can add this task, due ${due}:`, action: { type: 'task', summary: summary[0].toUpperCase() + summary.slice(1), due } };
  }
  if (has(/ (draft|write)( an| a)? (email|message|mail) /)) {
    const c = can('contacts') ? scope(db.contacts, 'contacts').find((x) => s.includes(` ${x.first.toLowerCase()} `) || s.includes(` ${x.last.toLowerCase()} `)) : null;
    const kind = has(/ payment|invoice /) ? 'payment' : has(/ quote /) ? 'quote' : has(/ thank /) ? 'thanks' : has(/ meeting|meet /) ? 'meeting' : has(/ intro/) ? 'intro' : 'follow';
    const mail = draftEmail(kind, { first: c?.first, company: c ? companyName(c.companyId) : undefined, me: me.name });
    return { text: c ? `Here's a draft for ${c.first} ${c.last}:` : "Here's a draft. Name a contact and I'll address it to them.", draft: { ...mail, to: c?.email || '' } };
  }

  if (has(/ (do first|prioriti|focus on|what should i do|what next) /)) {
    const items = nextActions({ db, tasks, open, leads, invoices, cases, companyName });
    return { text: items.length ? 'These look most important right now:' : "Nothing urgent. You're in good shape.", rows: items.map((x) => ({ title: x.title, sub: x.why, to: x.to })) };
  }
  if (has(/ (tasks?|to-?dos?|due) /) && !has(/ invoice/)) {
    const list = tasks.filter((a) => a.status !== 'done' && (has(/ overdue /) ? a.due < today() : has(/ today /) ? a.due <= today() : inR(a.due))).sort((a, b) => a.due.localeCompare(b.due));
    return { text: `${list.length ? `${num(list.length)} open ${list.length === 1 ? 'task' : 'tasks'}` : 'No open tasks'}${has(/ overdue /) ? ' overdue' : when}.`, rows: list.slice(0, 8).map((a) => ({ title: a.summary, sub: `${a.relatedLabel || ''} · ${userName(a.ownerId)}`, value: a.due, to: '/tasks' })) };
  }
  if (has(/ (overdue|owe|owes|unpaid|outstanding|receivable)/) || has(/ invoices? /)) {
    if (!can('billing')) return noAccess('invoices');
    const overdue = has(/ unpaid|outstanding|owe /) ? invoices.filter((i) => unpaid(i) > 0) : invoices.filter((i) => unpaid(i) > 0 && i.due < today());
    return { text: overdue.length ? `${money(sum(overdue, unpaid))} across ${num(overdue.length)} ${overdue.length === 1 ? 'invoice' : 'invoices'}.` : 'Nothing overdue. Well done.', rows: overdue.sort((a, b) => unpaid(b) - unpaid(a)).slice(0, 8).map((i) => ({ title: i.number, sub: `${companyName(i.companyId)} · due ${i.due}`, value: money(unpaid(i)), to: '/billing' })) };
  }
  if (has(/ (behind|on track|ahead|target|how is my team|team doing|top performer|best (sales|rep|person)|leaderboard)/)) {
    if (!can('pipeline')) return noAccess('deals');
    const y = String(new Date().getFullYear());
    const elapsed = (Date.now() - new Date(Number(y), 0, 1).getTime()) / (365 * DAY);
    const people = role === 'sales' ? [me] : db.users.filter((u) => u.active && u.role !== 'admin' && (role === 'admin' || u.teamId === me.teamId));
    const rows = people.map((u) => { const won = sum(scope(db.deals, 'pipeline').filter((d) => d.ownerId === u.id && d.status === 'won' && (d.closeDate || '').startsWith(y)), (d) => d.value); return { u, won, pace: u.target ? (won / (u.target * elapsed)) * 100 : null, att: u.target ? (won / u.target) * 100 : null }; }).sort((a, b) => b.won - a.won);
    if (role === 'sales') { const r = rows[0]; return { text: r.att == null ? "You don't have a target set." : `You've won ${money(r.won)} of ${money(me.target)}, which is ${pct(r.att)} of your target. ${r.pace >= 100 ? "You're ahead of pace." : `You're behind where you should be by now (${pct(r.pace)} of pace).`}` }; }
    const list = has(/ behind /) ? rows.filter((r) => r.pace != null && r.pace < 100).sort((a, b) => a.pace - b.pace) : rows;
    return { text: has(/ behind /) ? (list.length ? `${list.length} ${list.length === 1 ? 'person is' : 'people are'} behind target pace.` : 'Everyone is on pace.') : `${rows[0]?.u.name} leads with ${money(rows[0]?.won || 0)} won this year.`, rows: list.slice(0, 8).map((r) => ({ title: r.u.name, sub: r.att != null ? `${pct(r.att)} of yearly target` : 'No target', value: moneyK(r.won), to: canRoute('/insights') ? '/insights' : undefined })) };
  }
  if (has(/ (risk|stuck|slipping|in danger) /) && !has(/ customers? /)) {
    if (!can('pipeline')) return noAccess('deals');
    const list = open.map((d) => ({ d, r: dealInsights(db, d) })).filter((x) => x.r.flags.length >= 2).sort((a, b) => b.r.flags.length - a.r.flags.length || b.d.value - a.d.value);
    return { text: list.length ? `${num(list.length)} open ${list.length === 1 ? 'deal looks' : 'deals look'} at risk, worth ${money(sum(list, (x) => x.d.value))}.` : 'No deals look at risk.', rows: list.slice(0, 8).map((x) => ({ title: x.d.title, sub: x.r.flags[0], value: moneyK(x.d.value), to: `/pipeline/${x.d.id}` })) };
  }
  if (has(/ (lose|losing|lost) /)) {
    if (!can('pipeline')) return noAccess('deals');
    const lost = deals.filter((d) => d.status === 'lost' && inR(d.closeDate));
    const counts = {}; lost.forEach((d) => { const k = d.lostReason || 'No reason given'; counts[k] = (counts[k] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { text: top.length ? `${num(lost.length)} deals lost${when}. The top reason is "${top[0][0]}" (${top[0][1]}).` : `No lost deals${when}.`, rows: top.slice(0, 6).map(([k, n]) => ({ title: k, value: `${n} deals` })) };
  }
  if (has(/ (closing|close soon|likely to (win|close)|forecast|expected)/)) {
    if (!can('pipeline')) return noAccess('deals');
    const list = (range ? open.filter((d) => inR(d.closeDate)) : open.filter((d) => d.closeDate >= today() && d.closeDate <= addDays(30))).map((d) => ({ d, x: dealScore(db, d) })).sort((a, b) => b.x.score - a.x.score);
    return { text: `${num(list.length)} ${list.length === 1 ? 'deal is' : 'deals are'} due to close${when || ' in the next 30 days'}, worth ${money(sum(list, (r) => r.d.value))}. About ${money(sum(list, (r) => (r.d.value * r.x.score) / 100))} is likely, going by win chance.`, rows: list.slice(0, 8).map(({ d, x }) => ({ title: d.title, sub: `${x.score}% win chance · closes ${d.closeDate}`, value: moneyK(d.value), to: `/pipeline/${d.id}` })) };
  }
  if (has(/ (won|win|revenue|sales|sold|earned|made) /)) {
    if (!can('pipeline')) return noAccess('deals');
    const list = deals.filter((d) => d.status === 'won' && inR(d.closeDate));
    return { text: `${whoName ? `${whoName}won` : role === 'sales' || mineOnly ? 'You won' : role === 'manager' ? 'Your team won' : 'The company won'} ${money(sum(list, (d) => d.value))} from ${num(list.length)} ${list.length === 1 ? 'deal' : 'deals'}${when}.`, rows: [...list].sort((a, b) => b.value - a.value).slice(0, 6).map(dealRow) };
  }
  if (has(/ (pipeline|open deals?|opportunit|deals?) /)) {
    if (!can('pipeline')) return noAccess('deals');
    const stage = db.stages.find((x) => s.includes(` ${x.name.toLowerCase()} `));
    const list = stage ? open.filter((d) => d.stage === stage.id) : open;
    return { text: `${whoName}${num(list.length)} open ${list.length === 1 ? 'deal' : 'deals'}${stage ? ` in ${stage.name}` : ''}, worth ${money(sum(list, (d) => d.value))} (${money(sum(list, (d) => (d.value * d.probability) / 100))} after probability).`, rows: [...list].sort((a, b) => b.value - a.value).slice(0, 6).map(dealRow) };
  }
  if (has(/ (lead source|best source|source) /)) {
    if (!can('leads')) return noAccess('leads');
    const by = {}; leads.forEach((l) => { const k = l.source || 'Unknown'; by[k] = by[k] || { n: 0, c: 0 }; by[k].n += 1; if (l.status === 'Converted') by[k].c += 1; });
    const list = Object.entries(by).map(([k, v]) => ({ k, ...v, r: v.n ? (v.c / v.n) * 100 : 0 })).sort((a, b) => b.r - a.r || b.n - a.n);
    return { text: list[0] ? `${list[0].k} converts best, at ${pct(list[0].r)} of ${list[0].n} leads.` : 'No leads yet.', rows: list.map((x) => ({ title: x.k, sub: `${x.n} leads`, value: pct(x.r) })) };
  }
  if (has(/ leads? /)) {
    if (!can('leads')) return noAccess('leads');
    const list = (has(/ hot /) ? leads.filter((l) => l.score >= 70 && !['Converted', 'Unqualified'].includes(l.status)) : has(/ wait|uncontacted|not contacted|new /) ? leads.filter((l) => l.status === 'New') : leads.filter((l) => inR(l.createdAt))).sort((a, b) => b.score - a.score);
    return { text: `${num(list.length)} ${has(/ hot /) ? 'hot ' : has(/ wait|new /) ? 'new ' : ''}${list.length === 1 ? 'lead' : 'leads'}${when}.`, rows: list.slice(0, 8).map(leadRow) };
  }
  if (has(/ customers? /) && has(/ risk|unhappy|churn|quiet|health /)) {
    if (!can('customers')) return noAccess('customers');
    const list = who(scope(db.companies, 'customers')).map((c) => ({ c, h: customerHealth(db, c) })).filter((x) => x.h.label === 'At risk' || x.h.label === 'Watch').sort((a, b) => a.h.score - b.h.score);
    return { text: list.length ? `${num(list.filter((x) => x.h.label === 'At risk').length)} customers look at risk, and ${num(list.filter((x) => x.h.label === 'Watch').length)} are worth watching.` : 'All your customers look healthy.', rows: list.slice(0, 8).map(({ c, h }) => ({ title: c.name, sub: h.reasons.filter((r) => r[1] < 0)[0]?.[0] || h.label, value: h.label, to: `/customers/${c.id}` })) };
  }
  if (has(/ (cases?|support|tickets?|complaints?) /)) {
    if (!can('cases')) return noAccess('support cases');
    const list = cases.filter((c) => !CLOSED.includes(c.status) && (!has(/ urgent /) || c.priority === 'Urgent'));
    return { text: `${num(list.length)} open ${has(/ urgent /) ? 'urgent ' : ''}${list.length === 1 ? 'case' : 'cases'}.`, rows: list.slice(0, 8).map((c) => ({ title: `#${c.number} ${c.subject}`, sub: `${c.priority} · ${companyName(c.companyId)}`, to: `/cases?open=${c.id}` })) };
  }
  if (has(/ orders? /)) {
    if (!can('orders')) return noAccess('orders');
    const list = orders.filter((o) => inR(o.date) && (!has(/ pending|fulfil|ship /) || ['Pending', 'Processing'].includes(o.status)));
    return { text: `${num(list.length)} ${list.length === 1 ? 'order' : 'orders'}${when}, worth ${money(sum(list, (o) => o.total))}.`, rows: list.slice(0, 8).map((o) => ({ title: o.number, sub: `${companyName(o.companyId)} · ${o.status}`, value: moneyK(o.total), to: `/orders?open=${o.id}` })) };
  }
  if (has(/ (stock|inventory|reorder) /)) {
    if (!can('products')) return noAccess('products');
    const low = db.products.filter((p) => p.tracked && p.stock <= p.reorder);
    return { text: low.length ? `${num(low.length)} ${low.length === 1 ? 'product is' : 'products are'} at or below the reorder level.` : 'Stock levels look fine.', rows: low.slice(0, 8).map((p) => ({ title: p.name, sub: `Reorder at ${p.reorder}`, value: `${p.stock} left`, to: '/products' })) };
  }

  // A name: summarise that customer, deal, contact or lead.
  const words = s.trim().split(' ').filter((w) => w.length >= 4);
  const nameHit = (name) => words.some((w) => (name || '').toLowerCase().split(/[^a-z0-9]+/).includes(w));
  const namedDeal = has(/ (deal|opportunity) /) || ctx.focus?.kind === 'deal' ? findDeal() : null;
  if (namedDeal) {
    const scored = dealScore(db, namedDeal);
    return { text: `${namedDeal.title}: ${namedDeal.status}, ${money(namedDeal.value)}${scored ? `, ${scored.score}% win chance` : ''}. Closing ${namedDeal.closeDate}.`, focus: { kind: 'deal', id: namedDeal.id }, rows: [dealRow(namedDeal)] };
  }
  const company = can('customers') ? scope(db.companies, 'customers').find((c) => nameHit(c.name)) : null;
  if (company) {
    const h = customerHealth(db, company);
    const open2 = db.deals.filter((d) => d.companyId === company.id && d.status === 'open');
    return { text: `${company.name}: ${h.label.toLowerCase()}. ${h.reasons.map((r) => r[0]).join('. ')}. ${num(open2.length)} open ${open2.length === 1 ? 'deal' : 'deals'} worth ${money(sum(open2, (d) => d.value))}.`, rows: [{ title: company.name, sub: 'Open the customer', to: `/customers/${company.id}` }] };
  }
  const contact = can('contacts') ? scope(db.contacts, 'contacts').find((c) => nameHit(`${c.first} ${c.last}`)) : null;
  if (contact) return { text: `${contact.first} ${contact.last}, ${contact.title || 'contact'} at ${companyName(contact.companyId)}. Phone ${contact.phone || 'not recorded'}.`, rows: [{ title: `${contact.first} ${contact.last}`, sub: 'Open the contact', to: `/contacts?open=${contact.id}` }] };
  const lead = can('leads') ? scope(db.leads, 'leads').find((l) => nameHit(l.name) || nameHit(l.company)) : null;
  if (lead) return { text: `${lead.name} at ${lead.company}: ${lead.status}, lead score ${lead.score}.`, rows: [leadRow(lead)] };

  return { text: "I'm not sure about that one. I follow fixed rules rather than a real AI model, so try asking about sales, deals, leads, invoices, tasks, customers, orders, stock or your team.", unknown: true };
}
