// The AI Voice simulation: fixed scripts and made-up outcomes. Nothing here calls a phone or an AI model.
const SCRIPTS = {
  'Lead qualification': ['Are you looking for a solution like this at the moment?', 'Roughly how many people would use it?', 'When would you want to get started?'],
  'Payment reminder': ['We have an invoice from you that is now due. Have you had a chance to look at it?', 'When can we expect the payment?'],
  'Appointment booking': ['Would you like to book a short meeting with our team?', 'Does this week or next week suit you better?'],
  'Order status': ['I can see your latest order. Would you like the delivery date?', 'Is the delivery address still correct?'],
  'Customer feedback': ['How happy are you with our service, from one to five?', 'What is one thing we could do better?'],
  'Answer incoming calls': ['What can I help you with today?', 'Could I take your name and the best time to reach you?'],
};
const GENERIC = ['What can I help you with today?', 'Is there anything else I should tell the team?'];
const ANSWERS = ['Yes, that works for me.', 'Around ten people.', 'Next month would be good.', 'Yes, please go ahead.', 'This week is better.'];

export const scriptFor = (purpose) => SCRIPTS[purpose] || GENERIC;
// An agent's own questions, or the standard ones for what it does.
export const questionsOf = (agent) => (agent.questions?.length ? agent.questions : scriptFor(agent.purpose).map((text) => ({ text, saveAs: '' })));
export const phoneKey = (p) => String(p || '').replace(/\D/g, '');
export const aiRules = (s) => ({ from: '09:00', to: '20:00', weekends: false, retry: 1, disclose: true, ...(s.aiRules || {}) });
export const withinCallingHours = (rules, at = new Date(), zone) => {
  let day = at.getDay();
  let now = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (zone) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
      day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
      now = `${parts.hour}:${parts.minute}`;
    } catch { /* an unknown time zone falls back to this device's time */ }
  }
  if (!rules.weekends && [0, 6].includes(day)) return false;
  return now >= rules.from && now < rules.to;
};
export const mentionsAi = (text) => /\b(ai|a\.i\.|virtual assistant|automated|robot)\b/i.test(text || '');
const CLOSING = 'Thank you for your time. Someone from our team will follow up with you. Goodbye.';

// `said` is what the person typed in a test call. `step` is the next question to ask.
export const aiReply = (agent, step, said) => {
  const s = said.toLowerCase();
  if (/\b(do not call|don't call|stop calling|remove me|take me off)\b/.test(s)) return { text: "I understand. We won't call you again. Goodbye.", end: true, outcome: 'Do not call' };
  const faq = (agent.faqs || []).find((f) => f.keywords.toLowerCase().split(/[\s,]+/).filter(Boolean).some((w) => s.includes(w)));
  if (faq) { const next = questionsOf(agent)[step - 1]; return { text: next ? `${faq.answer} ${next.text}` : faq.answer, faq: true }; }
  if (/\b(person|human|manager|someone|agent|representative)\b/.test(s)) return { text: 'Of course. I will ask a member of our team to call you right away. Goodbye.', end: true, outcome: 'Asked for a person' };
  if (/\b(busy|later|tomorrow|not now|driving)\b/.test(s)) return { text: 'No problem. I will arrange a call back at a better time. Goodbye.', end: true, outcome: 'Call back later' };
  if (/\b(not interested|no thanks|stop|remove)\b/.test(s)) return { text: 'Understood. Thank you for your time. Goodbye.', end: true, outcome: 'Not interested' };
  const script = questionsOf(agent);
  if (step < script.length) return { text: script[step].text };
  return { text: CLOSING, end: true, outcome: 'Interested' };
};

// `roll` picks the outcome, so sample data can stay repeatable.
export const simulateAiCall = (agent, name, roll = Math.random(), incoming = false) => {
  const first = name.split(' ')[0];
  const outcome = !incoming && roll < 0.18 ? 'No answer' : roll < 0.5 ? 'Interested' : roll < 0.72 ? 'Call back later' : roll < 0.84 ? 'Not interested' : roll < 0.97 ? 'Asked for a person' : 'Do not call';
  if (outcome === 'No answer') return { outcome, duration: 0, sentiment: 'None', transcript: [], answers: [], summary: `${first} didn't answer.` };
  const lines = [{ who: 'ai', text: agent.greeting.replace('{name}', first) }];
  const script = questionsOf(agent);
  const asked = outcome === 'Interested' ? script.length : 1;
  const answers = [];
  script.slice(0, asked).forEach((q, i) => {
    lines.push({ who: 'ai', text: q.text });
    if (i < asked - 1 || outcome === 'Interested') {
      const said = ANSWERS[i % ANSWERS.length];
      lines.push({ who: 'person', text: said });
      if (q.saveAs) answers.push({ label: q.saveAs, value: said });
    }
  });
  if (outcome === 'Do not call') lines.push({ who: 'person', text: 'Please stop calling me.' }, { who: 'ai', text: "I understand. We won't call you again. Goodbye." });
  if (outcome === 'Call back later') lines.push({ who: 'person', text: "I'm busy right now. Can you call me tomorrow?" }, { who: 'ai', text: 'No problem. I will arrange a call back at a better time. Goodbye.' });
  if (outcome === 'Not interested') lines.push({ who: 'person', text: "No thanks, I'm not interested." }, { who: 'ai', text: 'Understood. Thank you for your time. Goodbye.' });
  if (outcome === 'Asked for a person') lines.push({ who: 'person', text: 'Can I talk to a person, please?' }, { who: 'ai', text: 'Of course. I will ask a member of our team to call you right away. Goodbye.' });
  if (outcome === 'Interested') lines.push({ who: 'ai', text: CLOSING });
  const summary = {
    Interested: `${first} answered every question and is open to a follow-up.`,
    'Call back later': `${first} was busy and asked for a call tomorrow.`,
    'Not interested': `${first} said they aren't interested.`,
    'Asked for a person': `${first} asked to speak to a person.`,
    'Do not call': `${first} asked not to be called again.`,
  }[outcome];
  const sentiment = outcome === 'Interested' ? 'Positive' : ['Not interested', 'Do not call'].includes(outcome) ? 'Negative' : 'Neutral';
  return { outcome, duration: 15 + lines.length * 9 + Math.round(roll * 20), sentiment, transcript: lines, answers, summary };
};

const LANGS = { English: 'en-US', Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Portuguese: 'pt-BR', Arabic: 'ar-SA', Mandarin: 'zh-CN', Japanese: 'ja-JP', Korean: 'ko-KR', Hindi: 'hi-IN', Telugu: 'te-IN', Tamil: 'ta-IN', Kannada: 'kn-IN', Marathi: 'mr-IN' };
// Reads text aloud with the voices installed in this browser, so the sound depends on the device.
export const speak = (text, agent) => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const lang = LANGS[agent.language] || 'en-US';
  const voices = synth.getVoices();
  const voice = voices.find((x) => x.lang === lang) || voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.lang = lang;
  u.pitch = /female/i.test(agent.voice) ? 1.15 : 0.85;
  synth.speak(u);
};
export const stopSpeaking = () => window.speechSynthesis?.cancel();
