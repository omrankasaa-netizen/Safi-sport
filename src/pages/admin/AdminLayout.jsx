import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Users,
  UsersRound,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { LogoMark } from '@/components/Logo';
import { useAuth } from '@/lib/AuthContext';

const MENU = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard, minRole: 'viewer' },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, minRole: 'staff' },
  { to: '/admin/products', label: 'Products', icon: Package, minRole: 'staff' },
  { to: '/admin/inventory', label: 'Inventory', icon: Store, minRole: 'staff' },
  { to: '/admin/transfers', label: 'Transfers', icon: ArrowLeftRight, minRole: 'staff' },
  { to: '/admin/customers', label: 'Customers', icon: Users, minRole: 'manager' },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, minRole: 'manager' },
  { to: '/admin/users', label: 'Users & roles', icon: UsersRound, minRole: 'owner' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, minRole: 'owner' },
];

const LEVEL = { viewer: 0, staff: 1, manager: 2, owner: 3 };
const atLeast = (role, min) => (LEVEL[role] ?? 0) >= (LEVEL[min] ?? 0);

function SyncDot() {
  // Staff+ only query; viewers never fire it.
  const { data } = trpc.sync.status.useQuery(undefined, { refetchInterval: 60_000, retry: false });
  if (!data) return null;
  const last = data.runs?.[0];
  const bad = data.unresolvedConflicts > 0 || last?.status === 'error';
  const ok = last?.status === 'ok';
  return (
    <Link to="/admin/inventory" title={bad ? 'Sync needs attention' : 'Stock sync'} className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${
          bad ? 'bg-safi-red pulse-red' : ok ? 'bg-emerald-400' : 'bg-amber-300'
        }`}
      />
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-safi-steel sm:inline">
        {bad ? 'Sync issue' : 'Synced'}
      </span>
    </Link>
  );
}

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const role = user?.role ?? 'viewer';
  const visible = MENU.filter((m) => atLeast(role, m.minRole));

  const linkCls = ({ isActive }) =>
    `flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-display text-sm font-bold uppercase italic tracking-wider transition-colors ${
      isActive ? 'border-safi-red text-safi-ice' : 'border-transparent text-safi-steel hover:text-safi-ice'
    }`;

  return (
    <main className="min-h-screen bg-safi-black text-safi-ice">
      <div className="sticky top-0 z-40 border-b border-safi-line bg-safi-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" aria-label="SAFI SPORT admin">
              <LogoMark size="sm" />
            </Link>
            <span className="rounded-sm bg-safi-red px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white">
              OPS
            </span>
          </div>
          <div className="flex items-center gap-4">
            {atLeast(role, 'staff') && <SyncDot />}
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-safi-steel md:inline">
              {user?.full_name || user?.email} · {role}
            </span>
            <Link to="/" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice">
              View store →
            </Link>
            <button
              onClick={async () => {
                await logout(false);
                nav('/admin/login');
              }}
              aria-label="Log out"
              className="text-safi-steel hover:text-safi-red"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 no-scrollbar">
          {visible.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6 pb-24">{children ?? <Outlet />}</div>
    </main>
  );
}
