import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Btn, Card, FormFields, Modal, PageHead, Progress, RecordModal, validate } from '../ui';
import { money, moneyK, pct, sum } from '../util';

function TeamDialog({ team, onClose }) {
  const { db, create, update, toast } = useStore();
  const [v, setV] = useState(team || { name: '', managerId: '', target: 100000, email: '', description: '' });
  const [members, setMembers] = useState(() => db.users.filter((u) => u.teamId === team?.id).map((u) => u.id));
  const [errors, setErrors] = useState({});
  const eligible = db.users.filter((u) => u.role !== 'admin' && u.active);
  const fields = [
    { k: 'name', label: 'Team name', req: true },
    { k: 'managerId', label: 'Team leader', type: 'select', req: true, options: db.users.filter((u) => u.role === 'manager').map((u) => ({ value: u.id, label: u.name })) },
    { k: 'email', label: 'Email alias', type: 'email' },
    { k: 'target', label: 'Annual invoicing target', type: 'number', min: 0 },
    { k: 'description', label: 'Description', type: 'textarea' },
  ];
  const save = () => {
    const e = validate(fields, v);
    setErrors(e);
    if (Object.keys(e).length) return;
    let id = team?.id;
    if (team) { const { id: _i, ...rest } = v; update('teams', id, rest); } else id = create('teams', v).id;
    const all = new Set([...members, v.managerId]);
    db.users.forEach((u) => {
      if (all.has(u.id) && u.teamId !== id) update('users', u.id, { teamId: id });
      else if (!all.has(u.id) && u.teamId === id) update('users', u.id, { teamId: null });
    });
    toast('Team saved');
    onClose();
  };
  return (
    <Modal title={team ? `Edit ${team.name}` : 'New sales team'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="stack">
        <FormFields fields={fields} values={v} errors={errors} onChange={(k, x) => { setV((p) => ({ ...p, [k]: x })); setErrors((p) => ({ ...p, [k]: undefined })); }} />
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Members</div>
          <div className="form-grid">
            {eligible.map((u) => (
              <label key={u.id} className="check">
                <input type="checkbox" checked={members.includes(u.id)} onChange={() => setMembers((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))} />
                <span className="trunc">{u.name}{u.teamId && u.teamId !== team?.id ? <span className="muted small"> · other team</span> : null}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Teams() {
  const { db, me, sec, scopeOf, t, can } = useStore();
  const [edit, setEdit] = useState(null);
  const y = String(new Date().getFullYear());
  return (
    <div>
      <PageHead title={t('teams')} sub={scopeOf('teams') === 'all' ? 'Targets, pipeline and members per team' : 'Your target, pipeline and people'}>
        {can('teams', 'create') && <Btn kind="primary" icon="Plus" onClick={() => setEdit({})}>New team</Btn>}
      </PageHead>
      <div className="g2">
        {db.teams.filter((x) => scopeOf('teams') === 'all' || x.id === me.teamId).map((t) => {
          const members = db.users.filter((u) => u.teamId === t.id);
          const ids = new Set(members.map((u) => u.id));
          const deals = db.deals.filter((d) => ids.has(d.ownerId));
          const open = deals.filter((d) => d.status === 'open');
          const won = sum(deals.filter((d) => d.status === 'won' && (d.closeDate || '').startsWith(y)), (d) => d.value);
          const p = t.target ? (won / t.target) * 100 : 0;
          return (
            <Card key={t.id} title={t.name} sub={t.description} action={can('teams', 'edit') && <Btn sm icon="Pencil" onClick={() => setEdit(t)}>Edit</Btn>}>
              <div className="stack">
                <div className="g3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <div className="hl"><div className="k small muted">Open deals</div><div className="strong num" style={{ fontSize: 18 }}>{open.length}</div></div>
                  <div className="hl"><div className="k small muted">Pipeline</div><div className="strong num" style={{ fontSize: 18 }}>{moneyK(sum(open, (d) => d.value))}</div></div>
                  <div className="hl"><div className="k small muted">Won this year</div><div className="strong num" style={{ fontSize: 18 }}>{moneyK(won)}</div></div>
                </div>
                {sec('teams', 'target') && <div>
                  <div className="row between small"><span className="muted">Annual target</span><span className="num strong">{pct(p)} of {money(t.target)}</span></div>
                  <div style={{ marginTop: 4 }}><Progress value={p} /></div>
                </div>}
                {sec('teams', 'members') && <div>
                  <div className="filter-title">Members ({members.length})</div>
                  {members.map((u) => {
                    const uw = sum(db.deals.filter((d) => d.ownerId === u.id && d.status === 'won' && (d.closeDate || '').startsWith(y)), (d) => d.value);
                    return (
                      <div key={u.id} className="dashlet">
                        <Avatar name={u.name} size={28} />
                        <div className="grow"><div className="strong trunc">{u.name}{u.id === t.managerId ? <span className="muted small"> · Team leader</span> : null}</div><div className="small muted trunc">{u.title}</div></div>
                        <span className="num small">{moneyK(uw)} won</span>
                      </div>
                    );
                  })}
                </div>}
              </div>
            </Card>
          );
        })}
      </div>
      {edit && <TeamDialog team={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  );
}
