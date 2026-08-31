import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/lib/AuthContext';
import { ErrorNote, Loading, PageHeader, btnGhost, btnRed, inputCls, labelCls, timeAgo } from './ui';

const ROLE_DESCRIPTIONS = {
  viewer: 'Viewer — can look at the dashboard, nothing else.',
  staff: 'Staff — can manage orders, products, photos and transfers. Cannot see money reports.',
  manager: 'Manager — everything staff can do, plus reports, customers and inventory thresholds.',
  owner: 'Owner — full access, including settings, users and financial reports.',
};

/** Users & roles (SPEC §6) — owner only. */
export default function AdminUsers() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.users.list.useQuery();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');

  const invalidate = () => utils.users.list.invalidate();
  const invite = trpc.users.inviteByEmail.useMutation({
    onSuccess: () => {
      setEmail('');
      setName('');
      invalidate();
    },
  });
  const setRoleMut = trpc.users.setRole.useMutation({ onSuccess: invalidate });
  const deactivate = trpc.users.deactivate.useMutation({ onSuccess: invalidate });

  return (
    <div>
      <PageHeader title="Users & roles" sub="Who can open the admin panel, and how much they can do" />

      {/* invite */}
      <form
        className="mb-6 rounded-sm border border-safi-line bg-safi-graphite/40 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate({ email: email.trim(), name: name.trim() || undefined, role });
        }}
      >
        <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          <UserPlus className="h-4 w-4" /> Invite by email — they sign in with an email code
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@safisport.com" />
          </div>
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
              {['staff', 'manager', 'owner'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-safi-steel">{ROLE_DESCRIPTIONS[role]}</p>
        <ErrorNote error={invite.error} />
        <button type="submit" disabled={invite.isPending || !email} className={`${btnRed} mt-3`}>
          {invite.isPending ? 'Adding…' : 'Add person'}
        </button>
      </form>

      {list.isPending ? (
        <Loading label="Loading team…" />
      ) : (
        <>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Approved emails</p>
          <div className="space-y-2">
            {(list.data?.staffDirectory ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold italic text-safi-ice">
                    {s.name || s.email} <span className="not-italic text-sm text-safi-steel">· {s.email}</span>
                  </p>
                  <p className="text-[11px] text-safi-steel">{ROLE_DESCRIPTIONS[s.role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className={`${inputCls} w-32 py-1.5`}
                    value={s.role}
                    disabled={s.email === me?.email}
                    onChange={(e) => setRoleMut.mutate({ email: s.email, role: e.target.value })}
                  >
                    {['staff', 'manager', 'owner'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {s.email !== me?.email && (
                    <button className={btnGhost} disabled={deactivate.isPending} onClick={() => deactivate.mutate({ email: s.email })}>
                      Remove access
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(list.data?.staffDirectory ?? []).length === 0 && (
              <p className="text-sm text-safi-steel">No one approved yet — add the first person above.</p>
            )}
          </div>

          <ErrorNote error={setRoleMut.error || deactivate.error} />

          <p className="mb-2 mt-8 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
            Signed-in accounts
          </p>
          <div className="space-y-2">
            {(list.data?.users ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold italic text-safi-ice">
                    {u.name || '(no name)'} <span className="not-italic text-sm text-safi-steel">· {u.email || '—'}</span>
                  </p>
                  <p className="text-[11px] text-safi-steel">
                    {u.role} · last sign-in {timeAgo(u.lastSignInAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
