import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Btn, Card, Empty, FormFields, Pills, PageHead, Tabs } from '../ui';
import { ALERT_KINDS, CHANNELS, alertHabits, alertPrefs, channelOn, groupAlerts, inQuietHours, isAway, isAwake, kindLabel, kindOf } from '../alerts';
import { addDays, relTime } from '../util';

const deviceSupport = () => 'Notification' in window;

// Shows a real browser pop-up when a new alert arrives, if this person allowed it.
export function useDeviceAlerts() {
  const { db, me } = useStore();
  const nav = useNavigate();
  const seen = useRef(null);
  const mine = db.notifications.filter((n) => n.to === me.id);
  const unread = mine.filter((n) => !n.read && isAwake(n)).length;
  useEffect(() => {
    const ids = new Set(mine.map((n) => n.id));
    const known = seen.current;
    seen.current = ids;
    if (!known || !deviceSupport() || Notification.permission !== 'granted') return;
    const prefs = alertPrefs(db.prefs?.[me.id]?.alerts);
    mine.filter((n) => !known.has(n.id) && !n.read && channelOn(prefs, kindOf(n.link), 'device') && !inQuietHours(prefs, new Date(), kindOf(n.link))).slice(0, 3).forEach((n) => {
      // An installed app shows it through its service worker, with Open and Snooze buttons on the alert itself.
      const shown = navigator.serviceWorker?.controller && navigator.serviceWorker.ready.then((reg) => reg.showNotification(db.settings.companyName, { body: n.text, tag: n.id, icon: 'icon-192.png', badge: 'icon-192.png', data: { id: n.id, link: n.link || '/alerts' }, actions: [{ action: 'open', title: 'Open' }, { action: 'snooze', title: 'Snooze 1 hour' }] }));
      if (shown) { shown.catch(() => {}); return; }
      try {
        const pop = new Notification(db.settings.companyName, { body: n.text, tag: n.id });
        pop.onclick = () => { window.focus(); if (n.link) nav(n.link); pop.close(); };
      } catch { /* phones only allow pop-ups through an installed app */ }
    });
  }, [db.notifications]);
  useEffect(() => {
    // Shows the number on the app's icon where the phone or computer supports it.
    if (navigator.setAppBadge) (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge?.())?.catch?.(() => {});
    document.title = document.title.replace(/^\(\d+\) /, '');
    if (unread) document.title = `(${unread}) ${document.title}`;
  });
  return unread;
}

function AlertList() {
  const { db, me, markRead, openAlert, snoozeAlert, toast } = useStore();
  const [expanded, setExpanded] = useState({});
  const nav = useNavigate();
  const [show, setShow] = useState('Unread');
  const [kind, setKind] = useState('');
  const now = new Date().toISOString();
  const mine = db.notifications.filter((n) => n.to === me.id);
  const snoozed = mine.filter((n) => !isAwake(n, now));
  const awake = mine.filter((n) => isAwake(n, now));
  const rows = (show === 'Snoozed' ? snoozed : show === 'Unread' ? awake.filter((n) => !n.read) : awake).filter((n) => !kind || kindOf(n.link) === kind);
  const unread = rows.filter((n) => !n.read);
  const tomorrow = () => `${addDays(1)}T08:00:00`;
  return (
    <Card pad={false}>
      <div className="tb-toolbar">
        <Pills value={show} onChange={setShow} options={['Unread', 'All', 'Snoozed']} />
        <select className="select tb-filter" aria-label="Kind of alert" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{ALERT_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}</select>
        <div className="grow" />
        {unread.length > 0 && <Btn sm onClick={() => markRead(unread.map((n) => n.id))}>Mark all as read</Btn>}
      </div>
      {!rows.length && <Empty icon="BellOff" text={show === 'Unread' ? "You're all caught up." : 'No alerts here.'} />}
      <div className="alert-list">
        {groupAlerts(rows.slice(0, 120)).flatMap((g) => [g.first, ...(expanded[g.key] ? g.rest : [])].map((n, gi) => ({ n, g, gi }))).slice(0, 80).map(({ n, g, gi }) => (
          <div key={n.id} className={`alert-row ${n.read ? '' : 'unread'} ${gi > 0 ? 'grouped' : ''}`}>
            <button type="button" className="alert-open" onClick={() => { openAlert(n.id); if (n.link) nav(n.link); }}>
              <span className="alert-dot" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="alert-text">{n.text}</span>
                <span className="small muted">{kindLabel(kindOf(n.link))} · {relTime(n.at)}{n.snoozeUntil && !isAwake(n, now) ? ' · snoozed' : ''}</span>
                {gi === 0 && g.rest.length > 0 && <span className="small"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [g.key]: !p[g.key] })); }}>{expanded[g.key] ? 'Show fewer' : `+${g.rest.length} more like this`}</button>{!expanded[g.key] && g.rest.some((x) => !x.read) && <button type="button" className="link-btn" style={{ marginInlineStart: 10 }} onClick={(e) => { e.stopPropagation(); markRead([g.first.id, ...g.rest.map((x) => x.id)]); }}>Mark these read</button>}</span>}
                {!!n.also?.length && <span className="row wrap" style={{ gap: 4, marginTop: 4 }}>{n.also.map((c) => <Badge key={c} tone="muted" dot={false}>{c} (simulated)</Badge>)}</span>}
              </span>
            </button>
            {!n.snoozeUntil || isAwake(n, now) ? <span className="row alert-actions">
              <Btn sm kind="ghost" onClick={() => { snoozeAlert(n.id, new Date(Date.now() + 36e5).toISOString()); toast('Snoozed for an hour'); }}>1 hour</Btn>
              <Btn sm kind="ghost" onClick={() => { snoozeAlert(n.id, new Date(tomorrow()).toISOString()); toast('Snoozed until tomorrow'); }}>Tomorrow</Btn>
            </span> : <span className="alert-actions"><Btn sm kind="ghost" onClick={() => snoozeAlert(n.id, null)}>Wake now</Btn></span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AlertSettings() {
  const { db, me, savePrefs, pushNotification, sendDigest, toast } = useStore();
  const prefs = alertPrefs(db.prefs?.[me.id]?.alerts);
  const save = (patch) => savePrefs({ alerts: { ...prefs, ...patch } });
  const [permission, setPermission] = useState(deviceSupport() ? Notification.permission : 'unsupported');
  const ask = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    toast(result === 'granted' ? 'Pop-ups are on for this device' : "Pop-ups weren't allowed. You can change that in your browser's settings.", result === 'granted' ? 'good' : 'bad');
  };
  const setChannel = (kind, channel, on) => save({ kinds: { ...prefs.kinds, [kind]: { ...prefs.kinds[kind], [channel]: on } } });
  const habits = alertHabits(db.notifications.filter((n) => n.to === me.id));
  const deviceText = { granted: 'Pop-ups are on for this device.', denied: "Pop-ups are blocked in this browser's settings.", default: 'Allow pop-ups to get alerts while the CRM is in the background.', unsupported: "This browser can't show pop-ups." }[permission];
  return (
    <div className="stack">
      <Card title="This device" sub={deviceText} action={permission === 'default' && <Btn kind="primary" icon="BellRing" onClick={ask}>Allow pop-ups</Btn>}>
        <Btn icon="Send" onClick={() => { pushNotification(me.id, 'This is a test alert.', '/alerts'); toast('Test alert sent'); }}>Send me a test alert</Btn>
      </Card>
      <Card title="What to alert me about" pad={false}>
        <div className="tb-wrap"><table className="table">
          <thead><tr><th>Kind of alert</th>{CHANNELS.map(([k, l]) => <th key={k} className="c">{l}</th>)}</tr></thead>
          <tbody>{ALERT_KINDS.map((kind) => <tr key={kind.k}>
            <td><div className="strong">{kind.label}</div><div className="small muted">{kind.hint}</div></td>
            {CHANNELS.map(([c, l]) => <td key={c} className="c"><input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} aria-label={`${kind.label}: ${l}`} disabled={kind.locked && c === 'bell'} checked={channelOn(prefs, kind.k, c)} onChange={(e) => setChannel(kind.k, c, e.target.checked)} /></td>)}
          </tr>)}</tbody>
        </table></div>
      </Card>
      {habits.length > 0 && <Card title="How you use your alerts" sub="Last 30 days. Alerts you rarely open can go to the CRM only, without pop-ups.">
        <div className="stack-s">{habits.map((h) => (
          <div key={h.k} className="dashlet">
            <span className="grow"><strong>{h.label}</strong><span className="small muted"> · {h.total} received, {h.opened} opened, {h.ignored} left unread for days</span></span>
            {h.total >= 4 && h.ignored / h.total >= 0.5 && !h.locked && channelOn(prefs, h.k, 'device') ? <Btn sm onClick={() => { setChannel(h.k, 'device', false); toast(`No more pop-ups for ${h.label.toLowerCase()}`); }}>Stop pop-ups for these</Btn> : null}
          </div>
        ))}</div>
      </Card>}
      <div className="g2" style={{ alignItems: 'start' }}>
        <Card title="Quiet hours" sub="Alerts still arrive in the CRM, but no pop-ups or simulated pushes.">
          <FormFields values={prefs.quiet} onChange={(k, x) => save({ quiet: { ...prefs.quiet, [k]: x } })} fields={[
            { k: 'on', label: 'Quiet hours', type: 'check', text: 'Turn on quiet hours', full: true },
            { k: 'from', label: 'From', type: 'time' },
            { k: 'to', label: 'Until', type: 'time' },
            { k: 'weekends', label: 'Weekends', type: 'check', text: 'Quiet all weekend', full: true },
          ]} />
          <fieldset className="plain-fieldset" style={{ marginTop: 10 }}><legend className="label">Let these through anyway</legend><div className="row wrap">{ALERT_KINDS.filter((k) => k.k !== 'general').map((k) => <label key={k.k} className="check small"><input type="checkbox" checked={(prefs.quiet.urgent || []).includes(k.k)} onChange={(e) => save({ quiet: { ...prefs.quiet, urgent: e.target.checked ? [...(prefs.quiet.urgent || []), k.k] : (prefs.quiet.urgent || []).filter((x) => x !== k.k) } })} />{k.label}</label>)}</div></fieldset>
        </Card>
        <Card title="Away" sub="While you're away, a colleague gets a copy of your alerts.">
          <FormFields values={prefs.away} onChange={(k, x) => save({ away: { ...prefs.away, [k]: x } })} fields={[
            { k: 'on', label: 'Away', type: 'check', text: "I'm away", full: true },
            { k: 'to', label: 'Send my alerts to', type: 'select', blankLabel: 'Choose someone…', full: true, options: db.users.filter((u) => u.active && u.id !== me.id).map((u) => ({ value: u.id, label: u.name })) },
            { k: 'until', label: 'Until', type: 'date', hint: 'Turns off by itself after this day' },
          ]} />
          {prefs.away.on && !prefs.away.to && <div className="error-text">Choose who gets your alerts.</div>}
          {isAway(prefs) && <div className="notice" style={{ marginTop: 8 }}>{db.users.find((u) => u.id === prefs.away.to)?.name} gets a copy of your alerts{prefs.away.until ? ` until ${prefs.away.until}` : ''}.</div>}
        </Card>
        <Card title="Daily summary" sub="One alert a day with your overdue tasks, deals closing soon and unread alerts.">
          <div className="stack">
            <FormFields values={prefs.digest} onChange={(k, x) => save({ digest: { ...prefs.digest, [k]: k === 'hour' ? Number(x) : x } })} fields={[
              { k: 'on', label: 'Daily summary', type: 'check', text: 'Send me a daily summary', full: true },
              { k: 'hour', label: 'Send at', type: 'select', noBlank: true, options: Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` })) },
            ]} />
            <div><Btn onClick={() => { sendDigest(); toast('Summary sent to your alerts'); }}>Send one now</Btn></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [tab, setTab] = useState('list');
  return (
    <div>
      <PageHead title="Alerts" sub="Everything that needs your attention, and how you want to hear about it" />
      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'list', label: 'My alerts', icon: 'Bell' }, { k: 'settings', label: 'Alert settings', icon: 'SlidersHorizontal' }]} />
      {tab === 'list' ? <AlertList /> : <AlertSettings />}
    </div>
  );
}
