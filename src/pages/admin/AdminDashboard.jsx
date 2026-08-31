import React from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeftRight, BellRing, Package, ShoppingBag, Wallet } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/lib/AuthContext';
import { Empty, Loading, PageHeader, StatusPill, money, timeAgo } from './ui';

/**
 * Dashboard (SPEC §6): Today row, live order feed, low-stock list,
 * conflicts banner. Viewers see the read-only shell; staff+ see live data.
 */
export default function AdminDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isStaff = ['staff', 'manager', 'owner'].includes(user?.role);
  const isManager = ['manager', 'owner'].includes(user?.role);

  const orders = trpc.orders.list.useQuery(
    { page: 1, pageSize: 10 },
    { enabled: isStaff, refetchInterval: 30_000 },
  );
  const today = trpc.reports.todaySales.useQuery(undefined, { enabled: isManager });
  const pending = trpc.reports.pendingOrdersCount.useQuery(undefined, { enabled: isManager });
  const lowStock = trpc.inventory.lowStock.useQuery(undefined, { enabled: isStaff });
  const sync = trpc.sync.status.useQuery(undefined, { enabled: isStaff, refetchInterval: 60_000 });

  if (!isStaff) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-3xl font-extrabold uppercase italic text-safi-ice">Welcome to SAFI ops</p>
        <p className="mt-2 text-sm text-safi-steel">
          Your account is a viewer account — dashboards light up once an owner gives you a staff role.
        </p>
      </div>
    );
  }

  const items = orders.data?.items ?? [];
  const conflicts = sync.data?.unresolvedConflicts ?? 0;
  const lastRun = sync.data?.runs?.[0];

  const cards = [
    isManager && { label: "Today's sales", value: money(today.data?.totalCents ?? 0), icon: Wallet, accent: true },
    isManager && { label: 'Orders today', value: String(today.data?.ordersCount ?? 0), icon: ShoppingBag },
    isManager && { label: 'Pending orders', value: String(pending.data?.count ?? 0), icon: BellRing },
    { label: 'Low stock alerts', value: String(lowStock.data?.length ?? 0), icon: AlertTriangle },
    {
      label: 'Last sync',
      value: lastRun ? timeAgo(lastRun.startedAt) : 'never',
      icon: ArrowLeftRight,
      warn: conflicts > 0 || lastRun?.status === 'error',
    },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader title="Today at SAFI" sub="Both branches · one system" />

      {conflicts > 0 && (
        <button
          onClick={() => nav('/admin/inventory?tab=conflicts')}
          className="mb-5 flex w-full items-center gap-3 rounded-sm border border-safi-red/60 bg-safi-red/10 px-4 py-3 text-left"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-safi-red" />
          <p className="text-sm text-safi-ice">
            <b>{conflicts} stock sync conflict{conflicts === 1 ? '' : 's'}</b> need a decision — RBMsoft and the
            shop disagree. Tap to review.
          </p>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-sm border p-4 ${
              c.accent
                ? 'border-safi-red/50 bg-safi-red/10'
                : c.warn
                  ? 'border-amber-400/40 bg-amber-400/5'
                  : 'border-safi-line bg-safi-graphite/50'
            }`}
          >
            <c.icon className={`h-4 w-4 ${c.accent ? 'text-safi-red' : c.warn ? 'text-amber-300' : 'text-safi-steel'}`} />
            <p className="mt-2 font-display text-3xl font-extrabold italic text-safi-ice">{c.value}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase italic text-safi-ice">Live order feed</h2>
            <Link to="/admin/orders" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-red">
              All orders →
            </Link>
          </div>
          {orders.isPending ? (
            <Loading />
          ) : items.length === 0 ? (
            <Empty>No orders yet</Empty>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 6).map((o) => (
                <Link
                  key={o.id}
                  to={`/admin/orders?open=${o.id}`}
                  className="flex w-full items-center justify-between rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3 hover:border-safi-steel"
                >
                  <div className="flex items-center gap-3">
                    {o.status === 'new' && <span className="h-2 w-2 rounded-full bg-safi-red pulse-red" />}
                    <div>
                      <p className="font-display text-base font-bold italic text-safi-ice">
                        {o.orderNumber}{' '}
                        <span className="not-italic text-safi-steel">· {o.guestName}</span>
                      </p>
                      <p className="text-[11px] text-safi-steel">
                        {o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · {timeAgo(o.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-extrabold italic">{money(o.totalCents)}</span>
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase italic text-safi-ice">Low stock</h2>
            <Link to="/admin/inventory?tab=low" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-red">
              Inventory →
            </Link>
          </div>
          {lowStock.isPending ? (
            <Loading />
          ) : (lowStock.data?.length ?? 0) === 0 ? (
            <Empty>Nothing running low — nice</Empty>
          ) : (
            <div className="space-y-2">
              {lowStock.data.slice(0, 6).map(({ alert, variant, product }) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between rounded-sm border border-amber-400/25 bg-amber-400/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-amber-300" />
                    <div>
                      <p className="font-display text-base font-bold italic text-safi-ice">
                        {product.nameEn}{' '}
                        <span className="not-italic text-safi-steel">
                          · {variant.color} · {variant.size}
                        </span>
                      </p>
                      <p className="text-[11px] text-safi-steel">
                        {alert.qtyAtAlert} left at {BRANCH_NAMES[alert.branchId] ?? `branch #${alert.branchId}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Low stock</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const BRANCH_NAMES = { 1: 'El Mina', 2: 'Dam w Farez' };
