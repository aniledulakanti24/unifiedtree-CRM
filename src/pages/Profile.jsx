import React, { useState } from 'react';
import { ROLES, useStore } from '../store';
import { Avatar, Badge, Btn, Card, FormFields, PageHead, validate } from '../ui';

const FIELDS = [
  { k: 'name', label: 'Full name', req: true, full: true },
  { k: 'title', label: 'Job title', full: true },
  { k: 'phone', label: 'Phone', full: true },
];

export default function Profile() {
  const { db, me, update, toast } = useStore();
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
              <Badge tone="muted" dot={false}>{ROLES[me.role]}</Badge>
            </div>
          </div>
          <dl className="dl">
            <dt>Email</dt><dd>{me.email}</dd>
            <dt>Company</dt><dd>{db.settings.companyName}</dd>
            <dt>Team</dt><dd>{team || '—'}</dd>
          </dl>
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
