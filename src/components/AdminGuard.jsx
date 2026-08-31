import React from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/lib/AuthContext';
import AdminLayout from '@/pages/admin/AdminLayout';
import { Loading } from '@/pages/admin/ui';

const LEVEL = { viewer: 0, staff: 1, manager: 2, owner: 3 };
export const hasRole = (user, minRole) =>
  (LEVEL[user?.role] ?? -1) >= (LEVEL[minRole] ?? 0);

/**
 * Role guard for /admin routes (roles: viewer < staff < manager < owner).
 * Renders the SAFI admin shell once authorized.
 */
export default function AdminGuard({ minRole = 'viewer', children }) {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-safi-black">
        <Loading label="Checking your sign-in…" />
      </main>
    );
  }
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-safi-black px-4">
        <div className="text-center">
          <p className="font-display text-3xl font-extrabold uppercase italic text-safi-ice">Staff only</p>
          <p className="mt-2 text-sm text-safi-steel">Log in with your work email to manage the store.</p>
          <Link
            to="/admin/login"
            className="mt-5 inline-block rounded-sm bg-safi-red px-6 py-3 font-display text-base font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }
  if (!hasRole(user, minRole)) {
    return (
      <AdminLayout>
        <div className="py-20 text-center">
          <p className="font-display text-3xl font-extrabold uppercase italic text-safi-ice">Access denied</p>
          <p className="mt-2 text-sm text-safi-steel">
            This page needs the “{minRole}” role. Your account is “{user.role}”.
          </p>
        </div>
      </AdminLayout>
    );
  }
  return <AdminLayout>{children}</AdminLayout>;
}
