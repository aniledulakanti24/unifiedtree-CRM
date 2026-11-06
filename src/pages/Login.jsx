import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ROLES, useStore } from '../store';
import { Avatar } from '../ui';
import { DEMO_PASSWORD, demoHash, passwordMatches } from '../engine';
import { hoursBlocked, ipBlocked, makeCode, needsTwoStep, passwordExpired, passwordProblem, passwordRules, policyText, secOf, trustDevice, trusted, verifyTotp } from '../security';

const ROLE_INFO = {
  admin: 'Company overview, users, settings, operations and the audit log.',
  manager: 'Team dashboard, rep scorecard, approvals and lead assignment.',
  sales: 'My day, my pipeline, my customers, tasks and calendar.',
};

export default function Login() {
  const { db, signIn, noteFailedLogin, setPassword, authNote, orgs, orgId, switchOrg, redeemRecoveryCode } = useStore();
  const [trust, setTrust] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const sec = secOf(db.settings);
  const [step, setStep] = useState('login');
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [fresh, setFresh] = useState('');
  const [info, setInfo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPasswordInput] = useState('');
  const [err, setErr] = useState('');
  const needPassword = db.settings.requirePasswords;
  const start = (nextStep) => { setStep(nextStep); setTyped(''); setFresh(''); setErr(''); };
  const askCode = (u, method) => { setCode(makeCode()); setPending({ u, method }); setRecovery(false); setTrust(false); start(u.totpSecret ? 'app' : 'code'); };
  const afterPassword = (u, method) => {
    if (passwordExpired(u, sec.passwordPolicy)) { setPending({ u, method }); start('change'); return; }
    if ((needsTwoStep(u, sec) || u.totpSecret) && !trusted(u.id)) { askCode(u, method); return; }
    signIn(u.id, trusted(u.id) && (needsTwoStep(u, sec) || u.totpSecret) ? `${method}, trusted device` : method);
  };
  const findUser = () => db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
  const submit = (e) => {
    e.preventDefault();
    const u = findUser();
    if (!needPassword) {
      if (!u) { setErr('No demo user has that email. Pick a role below instead.'); return; }
      signIn(u.id, 'Demo email');
      return;
    }
    if (!u) { noteFailedLogin(null, email.trim()); setErr('That email or password is wrong.'); return; }
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
      noteFailedLogin(u, email.trim(), 'Locked');
      setErr(`This account is locked. Try again in ${Math.ceil((new Date(u.lockedUntil) - Date.now()) / 6e4)} minutes, or ask an admin to unlock it.`);
      return;
    }
    if (ipBlocked(u, sec)) { noteFailedLogin(u, email.trim(), 'Blocked', 'network address'); setErr("Sign-in isn't allowed from this network address."); return; }
    if (!passwordMatches(u, password)) {
      const left = sec.lockAfter > 0 ? sec.lockAfter - (u.failed || 0) - 1 : 0;
      noteFailedLogin(u, email.trim());
      setErr(sec.lockAfter > 0 && left <= 0 ? `This account is now locked for ${sec.lockMinutes} minutes.` : 'That email or password is wrong.');
      return;
    }
    // Only after the right password, so a stranger can't learn anything about the account.
    const late = hoursBlocked(u, sec);
    if (late) { noteFailedLogin(u, email.trim(), 'Blocked', 'outside sign-in hours'); setErr(late); return; }
    setPasswordInput('');
    afterPassword(u, 'Password');
  };
  const sso = (name) => {
    const u = findUser();
    if (!u) { setErr(`Enter your work email first, then choose ${name}.`); return; }
    if (ipBlocked(u, sec)) { noteFailedLogin(u, email.trim(), 'Blocked', 'network address'); setErr("Sign-in isn't allowed from this network address."); return; }
    const late = hoursBlocked(u, sec);
    if (late) { noteFailedLogin(u, email.trim(), 'Blocked', 'outside sign-in hours'); setErr(late); return; }
    signIn(u.id, `${name} (simulated)`);
  };
  const submitCode = (e) => {
    e.preventDefault();
    if (typed.trim() !== code) { setErr('That code is wrong.'); return; }
    if (trust) trustDevice(pending.u.id, sec.rememberDays);
    signIn(pending.u.id, `${pending.method} + code`);
  };
  const submitApp = async (e) => {
    e.preventDefault();
    if (recovery) {
      if (!redeemRecoveryCode(pending.u.id, typed)) { setErr("That recovery code is wrong or was already used."); return; }
      signIn(pending.u.id, `${pending.method} + recovery code`);
      return;
    }
    if (!(await verifyTotp(pending.u.totpSecret, typed))) { setErr('That code is wrong. Use the newest code in your authenticator app.'); return; }
    if (trust) trustDevice(pending.u.id, sec.rememberDays);
    signIn(pending.u.id, `${pending.method} + authenticator app`);
  };
  const submitChange = (e) => {
    e.preventDefault();
    const weak = passwordProblem(sec.passwordPolicy, fresh, passwordRules(sec, pending.u));
    if (weak) { setErr(weak); return; }
    if (passwordMatches(pending.u, fresh)) { setErr('Choose a password you have not just used.'); return; }
    setPassword(demoHash(fresh), pending.u.id);
    if (needsTwoStep(pending.u, sec)) askCode(pending.u, pending.method);
    else signIn(pending.u.id, pending.method);
  };
  const startForgot = () => {
    const u = findUser();
    if (!u) { setErr('Enter your work email first.'); return; }
    setCode(makeCode());
    setPending({ u, method: 'Password reset' });
    start('forgot');
  };
  const submitForgot = (e) => {
    e.preventDefault();
    if (typed.trim() !== code) { setErr('That code is wrong.'); return; }
    const weak = passwordProblem(sec.passwordPolicy, fresh, passwordRules(sec, pending.u));
    if (weak) { setErr(weak); return; }
    setPassword(demoHash(fresh), pending.u.id);
    setInfo('Password changed. Sign in with your new password.');
    setPasswordInput('');
    start('login');
  };
  const pickRole = (r) => db.users.find((u) => u.role === r && u.active);
  return (
    <div className="login">
      <div className="login-art">
        <svg aria-hidden="true" viewBox="0 0 600 600" style={{ position: 'absolute', right: -120, bottom: -90, width: 620, opacity: 0.16 }} fill="none" stroke="#5ee0c4" strokeWidth="3" strokeLinecap="round">
          <path d="M300 600V120M300 300L140 170M300 300l160-130M300 420L170 320M300 420l130-100M300 200l-70-70M300 200l70-70M140 170l-60-20M140 170l-20-60M460 170l60-20M460 170l20-60M170 320l-70 0M170 320l-40-60M430 320l70 0M430 320l40-60" />
        </svg>
        <div className="brand" style={{ padding: 0, fontSize: 17, position: 'relative' }}>
          <span className="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 2.5v19M12 10L5.5 5.5M12 10l6.5-4.5M12 16l-5-3.5M12 16l5-3.5" /></svg></span>
          {db.settings.companyName} CRM
        </div>
        <div style={{ position: 'relative' }}>
          <h1>Every customer, deal and delivery on one branch.</h1>
          <p>Sales, commerce, logistics and support share one record, so handovers between people never lose the story.</p>
        </div>
        <div className="small" style={{ color: '#8aa39c', position: 'relative' }}>Demo workspace with sample data</div>
      </div>
      <div className="login-form">
        <div className="login-box">
          {step === 'code' && <form onSubmit={submitCode} className="stack-s" noValidate>
            <h2 style={{ fontSize: 22, fontWeight: 680 }}>Enter your code</h2>
            <p className="notice">Simulated. Your code is <strong>{code}</strong>. A real system would text it to you or use an authenticator app.</p>
            <label className="label" htmlFor="code">6-digit code</label>
            <input id="code" className={`input ${err ? 'err' : ''}`} inputMode="numeric" autoFocus value={typed} onChange={(e) => { setTyped(e.target.value); setErr(''); }} />
            {err && <span className="error-text">{err}</span>}
            {sec.rememberDays > 0 && <label className="check small"><input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />Trust this device for {sec.rememberDays} days</label>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Verify</button>
            <button className="btn ghost" type="button" style={{ width: '100%' }} onClick={() => start('login')}>Back</button>
          </form>}
          {step === 'app' && <form onSubmit={submitApp} className="stack-s" noValidate>
            <h2 style={{ fontSize: 22, fontWeight: 680 }}>{recovery ? 'Use a recovery code' : 'Open your authenticator app'}</h2>
            <p className="sub">{recovery ? 'Each recovery code works once. You saved them when you set up the app.' : `Enter the 6-digit code for ${db.settings.companyName} CRM.`}</p>
            <label className="label" htmlFor="app-code">{recovery ? 'Recovery code' : '6-digit code'}</label>
            <input id="app-code" className={`input ${err ? 'err' : ''}`} inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus value={typed} onChange={(e) => { setTyped(e.target.value); setErr(''); }} />
            {err && <span className="error-text">{err}</span>}
            {!recovery && sec.rememberDays > 0 && <label className="check small"><input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />Trust this device for {sec.rememberDays} days</label>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Verify</button>
            <button className="btn ghost" type="button" style={{ width: '100%' }} onClick={() => { setRecovery(!recovery); setTyped(''); setErr(''); }}>{recovery ? 'Use my authenticator app' : 'Lost your phone? Use a recovery code'}</button>
            <button className="btn ghost" type="button" style={{ width: '100%' }} onClick={() => start('login')}>Back</button>
          </form>}
          {step === 'change' && <form onSubmit={submitChange} className="stack-s" noValidate>
            <h2 style={{ fontSize: 22, fontWeight: 680 }}>Choose a new password</h2>
            <p className="sub">{pending?.u.mustChangePassword ? 'An admin reset your password.' : 'Your password is too old.'} {policyText(sec.passwordPolicy)}.</p>
            <label className="label" htmlFor="new-pass">New password</label>
            <input id="new-pass" className={`input ${err ? 'err' : ''}`} type="password" autoComplete="new-password" autoFocus value={fresh} onChange={(e) => { setFresh(e.target.value); setErr(''); }} />
            {err && <span className="error-text">{err}</span>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Save and continue</button>
          </form>}
          {step === 'forgot' && <form onSubmit={submitForgot} className="stack-s" noValidate>
            <h2 style={{ fontSize: 22, fontWeight: 680 }}>Reset your password</h2>
            <p className="notice">Simulated. Your reset code is <strong>{code}</strong>. A real system would email it to {pending?.u.email}.</p>
            <label className="label" htmlFor="reset-code">Reset code</label>
            <input id="reset-code" className="input" inputMode="numeric" autoFocus value={typed} onChange={(e) => { setTyped(e.target.value); setErr(''); }} />
            <label className="label" htmlFor="reset-pass">New password</label>
            <input id="reset-pass" className="input" type="password" autoComplete="new-password" value={fresh} onChange={(e) => { setFresh(e.target.value); setErr(''); }} />
            <span className="hint">{policyText(sec.passwordPolicy)}</span>
            {err && <span className="error-text">{err}</span>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Change password</button>
            <button className="btn ghost" type="button" style={{ width: '100%' }} onClick={() => start('login')}>Back</button>
          </form>}
          {step === 'login' && <>
          {authNote && <p className="notice" style={{ marginBottom: 12 }}>{authNote}</p>}
          {info && <p className="notice" style={{ marginBottom: 12 }}>{info}</p>}
          <h2 style={{ fontSize: 22, fontWeight: 680, letterSpacing: '-.015em' }}>Log in</h2>
          <p className="sub" style={{ margin: '4px 0 18px' }}>Choose a role to explore how the CRM changes for each person.</p>
          {orgs.length > 1 && (
            <div className="stack-s" style={{ marginBottom: 14 }}>
              <label className="label" htmlFor="login-company">Company</label>
              <select id="login-company" className="select" value={orgId} onChange={(e) => { switchOrg(e.target.value); setErr(''); }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {['admin', 'manager', 'sales'].map((r) => {
            const u = pickRole(r);
            if (!u || needPassword) return null;
            return (
              <button key={r} type="button" className="role-card" onClick={() => signIn(u.id, 'Demo role')}>
                <Avatar name={u.name} size={36} />
                <span className="grow"><strong>{ROLES[r]}</strong><span className="muted small"> · {u.name}</span><div className="small sub">{ROLE_INFO[r]}</div></span>
                <ArrowRight size={16} color="var(--ink-3)" />
              </button>
            );
          })}
          {!needPassword && <div className="row" style={{ margin: '14px 0' }}><hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} /><span className="small muted">or use a demo email</span><hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} /></div>}
          <form onSubmit={submit} className="stack-s" noValidate>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className={`input ${err ? 'err' : ''}`} type="email" placeholder="tom@unifiedtree.demo" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
            {needPassword && <><label className="label" htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPasswordInput(e.target.value); setErr(''); }} /></>}
            {err && <span className="error-text">{err}</span>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Continue</button>
            {needPassword && <button type="button" className="btn ghost" style={{ width: '100%' }} onClick={startForgot}>Forgot password?</button>}
          </form>
          {needPassword && (sec.sso.google || sec.sso.microsoft || sec.sso.saml) && <div className="stack-s" style={{ marginTop: 12 }}>
            {sec.sso.google && <button type="button" className="btn" style={{ width: '100%' }} onClick={() => sso('Google')}>Continue with Google (simulated)</button>}
            {sec.sso.microsoft && <button type="button" className="btn" style={{ width: '100%' }} onClick={() => sso('Microsoft')}>Continue with Microsoft (simulated)</button>}
            {sec.sso.saml && <button type="button" className="btn" style={{ width: '100%' }} onClick={() => sso('Company login')}>Continue with company login (simulated)</button>}
          </div>}
          <p className="notice" style={{ marginTop: 16 }}>{needPassword ? `Simulated sign-in. Until someone changes it, each password is ${DEMO_PASSWORD}.` : 'Demo sign-in has no password check.'} Connect real authentication before storing live customer data.</p>
          </>}
        </div>
      </div>
    </div>
  );
}
