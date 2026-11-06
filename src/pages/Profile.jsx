import React, { useState } from 'react';
import { ROLES, roleNameOf, useStore } from '../store';
import { demoHash, passwordMatches } from '../engine';
import { newSecret, otpUrl, passwordProblem, passwordRules, policyText, recoveryCodes, secOf, verifyTotp } from '../security';
import { InstallCard } from '../install';
import { PersonalFormats } from './TaxExtras';
import { Link } from 'react-router-dom';
import { Avatar, Badge, Btn, Card, FormFields, PageHead, validate } from '../ui';

const FIELDS = [
  { k: 'name', label: 'Full name', req: true, full: true },
  { k: 'title', label: 'Job title', full: true },
  { k: 'phone', label: 'Phone', full: true },
];

export default function Profile() {
  const { db, me, update, toast, setPassword, setAuthenticator } = useStore();
  const [setup, setSetup] = useState(null);
  const [appCode, setAppCode] = useState('');
  const [appErr, setAppErr] = useState('');
  const [shown, setShown] = useState(null);
  const [pw, setPw] = useState({});
  const [pwErrors, setPwErrors] = useState({});
  const changePassword = (e) => {
    e.preventDefault();
    const er = {};
    if (!passwordMatches(me, pw.current || '')) er.current = 'That is not your current password.';
    const weak = passwordProblem(secOf(db.settings).passwordPolicy, pw.next || '', passwordRules(secOf(db.settings), me));
    if (weak) er.next = weak;
    setPwErrors(er);
    if (Object.keys(er).length) return;
    setPassword(demoHash(pw.next));
    setPw({});
    toast('Password changed');
  };
  const [v, setV] = useState({ name: me.name, title: me.title, phone: me.phone });
  const [errors, setErrors] = useState({});
  const team = db.teams.find((x) => x.id === me.teamId)?.name;
  const save = (e) => {
    e.preventDefault();
    const clean = { ...v, name: v.name.trim() };
    const er = validate(FIELDS, clean);
    setErrors(er);
    if (Object.keys(er).length) return;
    update('users', me.id, clean);
    toast('Profile saved');
  };
  return (
    <div>
      <PageHead title="My profile" sub="How you appear to others in this company" />
      <div className="g2" style={{ alignItems: 'start' }}>
        <Card>
          <div className="row" style={{ gap: 14, marginBottom: 16 }}>
            <Avatar name={me.name} size={64} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="strong" style={{ fontSize: 17 }}>{me.name}</div>
              <div className="small muted" style={{ marginBottom: 4 }}>{me.title}</div>
              <Badge tone="muted" dot={false}>{roleNameOf(db, me)}</Badge>
            </div>
          </div>
          <dl className="dl">
            <dt>Email</dt><dd>{me.email}</dd>
            <dt>Company</dt><dd>{db.settings.companyName}</dd>
            <dt>Team</dt><dd>{team || '—'}</dd>
          </dl>
        </Card>
        <InstallCard />
        <PersonalFormats />
        <Card title="Alerts" sub="Choose what you hear about, quiet hours and a daily summary."><Link className="btn" to="/alerts">Open alert settings</Link></Card>
        <Card title="Two-step sign-in" sub="Simulated. After your password, you enter a code that the login page shows you.">
          <label className="check"><input type="checkbox" checked={!!me.twoStep || secOf(db.settings).twoStep === 'all' || (secOf(db.settings).twoStep === 'admins' && me.role === 'admin')} disabled={secOf(db.settings).twoStep === 'all' || (secOf(db.settings).twoStep === 'admins' && me.role === 'admin')} onChange={(e) => { update('users', me.id, { twoStep: e.target.checked }); toast(e.target.checked ? 'Two-step sign-in on' : 'Two-step sign-in off'); }} />Ask for a code when I sign in</label>
        </Card>
        <Card title="Authenticator app" sub="Codes from an app on your phone, such as Google or Microsoft Authenticator. The codes are real; this demo keeps your key in this browser.">
          {me.totpSecret && !setup && <div className="stack-s">
            <div className="row"><Badge tone="good">On</Badge><span className="small muted">{(me.recoveryHashes || []).length} recovery codes left</span></div>
            <div className="row wrap"><Btn sm onClick={() => { const codes = recoveryCodes(); setAuthenticator(me.id, me.totpSecret, codes); setShown(codes); }}>New recovery codes</Btn><Btn sm kind="ghost" onClick={() => { setAuthenticator(me.id, null, []); toast('Authenticator app turned off'); }}>Turn off</Btn></div>
          </div>}
          {!me.totpSecret && !setup && <Btn icon="Smartphone" onClick={() => { setSetup(newSecret()); setAppCode(''); setAppErr(''); }}>Set up an authenticator app</Btn>}
          {setup && <div className="stack-s">
            <ol className="small" style={{ margin: 0, paddingInlineStart: 18 }}><li>In your app, add an account and choose to enter a key.</li><li>Type this key, or open the link on your phone.</li><li>Enter the 6-digit code it shows.</li></ol>
            <div className="totp-key" aria-label="Your setup key">{setup.match(/.{1,4}/g).join(' ')}</div>
            <a className="small" href={otpUrl(setup, me.email, `${db.settings.companyName} CRM`)}>Open in an authenticator app</a>
            <div className="row"><input className={`input ${appErr ? 'err' : ''}`} style={{ maxWidth: 160 }} inputMode="numeric" aria-label="Code from your app" placeholder="123456" value={appCode} onChange={(e) => { setAppCode(e.target.value); setAppErr(''); }} /><Btn kind="primary" onClick={async () => { if (!(await verifyTotp(setup, appCode))) { setAppErr("That code doesn't match. Check the key and try the newest code."); return; } const codes = recoveryCodes(); setAuthenticator(me.id, setup, codes); setSetup(null); setShown(codes); toast('Authenticator app is on'); }}>Turn on</Btn><Btn kind="ghost" onClick={() => setSetup(null)}>Cancel</Btn></div>
            {appErr && <span className="error-text">{appErr}</span>}
          </div>}
          {shown && <div className="notice" style={{ marginTop: 10 }}><strong>Save these recovery codes now.</strong> Each one signs you in once if you lose your phone. They won't be shown again.<div className="totp-codes">{shown.map((c) => <code key={c}>{c}</code>)}</div><Btn sm onClick={() => setShown(null)}>I saved them</Btn></div>}
        </Card>
        <Card title="Password" sub={`Simulated sign-in, not real security. Don't reuse a real password here. ${policyText(secOf(db.settings).passwordPolicy)}.`}>
          <form className="stack" onSubmit={changePassword} noValidate>
            <FormFields fields={[{ k: 'current', label: 'Current password', type: 'password', full: true }, { k: 'next', label: 'New password', type: 'password', full: true }]} values={pw} errors={pwErrors} onChange={(k, x) => { setPw((p) => ({ ...p, [k]: x })); setPwErrors((p) => ({ ...p, [k]: undefined })); }} />
            <div><Btn type="submit">Change password</Btn></div>
          </form>
        </Card>
        <Card title="Your details">
          <form className="stack" onSubmit={save} noValidate>
            <FormFields fields={FIELDS} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
            <div><Btn kind="primary" type="submit">Save</Btn></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
