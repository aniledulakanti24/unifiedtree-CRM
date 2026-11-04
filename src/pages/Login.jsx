import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ROLES, useStore } from '../store';
import { Avatar } from '../ui';

const ROLE_INFO = {
  admin: 'Company overview, users, settings, operations and the audit log.',
  manager: 'Team dashboard, rep scorecard, approvals and lead assignment.',
  sales: 'My day, my pipeline, my customers, tasks and calendar.',
};

export default function Login() {
  const { db, login, orgs, orgId, switchOrg } = useStore();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
    if (u) login(u.id);
    else setErr('No demo user has that email. Pick a role below instead.');
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
            if (!u) return null;
            return (
              <button key={r} type="button" className="role-card" onClick={() => login(u.id)}>
                <Avatar name={u.name} size={36} />
                <span className="grow"><strong>{ROLES[r]}</strong><span className="muted small"> · {u.name}</span><div className="small sub">{ROLE_INFO[r]}</div></span>
                <ArrowRight size={16} color="var(--ink-3)" />
              </button>
            );
          })}
          <div className="row" style={{ margin: '14px 0' }}><hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} /><span className="small muted">or use a demo email</span><hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} /></div>
          <form onSubmit={submit} className="stack-s" noValidate>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className={`input ${err ? 'err' : ''}`} type="email" placeholder="tom@unifiedtree.demo" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
            {err && <span className="error-text">{err}</span>}
            <button className="btn primary" type="submit" style={{ width: '100%' }}>Continue</button>
          </form>
          <p className="notice" style={{ marginTop: 16 }}>Demo sign-in has no password check. Connect real authentication before storing live customer data.</p>
        </div>
      </div>
    </div>
  );
}
