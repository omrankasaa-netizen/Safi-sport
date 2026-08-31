import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ChevronDown, MessageCircle, Search } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import {
  Empty,
  ErrorNote,
  Loading,
  PageHeader,
  STATUS_LABEL,
  StatusPill,
  btnGhost,
  btnPrimary,
  btnRed,
  inputCls,
  money,
  timeAgo,
  whatsappLink,
} from './ui';

const PIPELINE = ['new', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

function nextAction(order) {
  switch (order.status) {
    case 'new':
      return { label: 'Confirm order', to: 'confirmed' };
    case 'confirmed':
      return { label: 'Start preparing', to: 'preparing' };
    case 'preparing':
      return order.fulfilment === 'delivery'
        ? { label: 'Out for delivery', to: 'out_for_delivery' }
        : { label: 'Ready for pickup', to: 'ready_for_pickup' };
    case 'ready_for_pickup':
    case 'out_for_delivery':
      return { label: 'Mark delivered', to: 'delivered' };
    default:
      return null;
  }
}

function OrderCard({ order, open, onToggle }) {
  const utils = trpc.useUtils();
  const detail = trpc.orders.detail.useQuery({ id: order.id }, { enabled: open });
  const suggestions = trpc.transfers.suggestionsForOrder.useQuery({ orderId: order.id }, { enabled: open && !!order.needsTransfer });

  const invalidate = () => {
    utils.orders.list.invalidate();
    utils.orders.detail.invalidate({ id: order.id });
    utils.transfers.suggestionsForOrder.invalidate({ orderId: order.id });
    utils.transfers.list.invalidate();
  };
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: invalidate });
  const createTransfer = trpc.transfers.create.useMutation({ onSuccess: invalidate });

  const action = nextAction(order);
  const items = detail.data?.items ?? [];
  const customer = detail.data?.customer;

  return (
    <div
      className={`overflow-hidden rounded-sm border ${
        order.status === 'new' ? 'border-safi-red/50' : 'border-safi-line'
      } bg-safi-graphite/40`}
    >
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div className="flex min-w-0 items-center gap-3">
          {order.status === 'new' ? (
            <span className="flex shrink-0 items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-safi-red">
              <span className="h-2 w-2 rounded-full bg-safi-red pulse-red" /> New
            </span>
          ) : (
            <ChevronDown className={`h-4 w-4 shrink-0 text-safi-steel transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold italic text-safi-ice">
              {order.orderNumber}{' '}
              <span className="not-italic text-sm text-safi-steel">· {order.guestName} · {order.guestArea || '—'}</span>
            </p>
            <p className="text-[11px] text-safi-steel">
              {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · {timeAgo(order.createdAt)}
              {!!order.needsTransfer && (
                <span className="ml-2 font-bold uppercase tracking-widest text-safi-red">Needs transfer</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-display text-xl font-extrabold italic">{money(order.totalCents)}</span>
          <StatusPill status={order.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-safi-line px-4 py-4">
          {/* status stepper */}
          <div className="mb-5 flex items-center">
            {(order.fulfilment === 'delivery'
              ? PIPELINE
              : PIPELINE.filter((s) => s !== 'out_for_delivery')
            ).map((s, i, arr) => {
              const idx = arr.indexOf(order.status);
              const done = idx >= i;
              return (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-safi-red' : 'bg-safi-line'}`} />
                    <span className={`mt-1 hidden text-[8px] uppercase tracking-wider sm:block ${done ? 'text-safi-ice' : 'text-safi-steel/50'}`}>
                      {STATUS_LABEL[s]}
                    </span>
                  </div>
                  {i < arr.length - 1 && <div className={`mx-1 h-px flex-1 ${idx > i ? 'bg-safi-red' : 'bg-safi-line'}`} />}
                </div>
              );
            })}
          </div>

          {detail.isPending ? (
            <Loading label="Loading order…" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Items</p>
                {items.map((it) => (
                  <div key={it.id} className="mb-2 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-display text-sm font-bold uppercase italic text-safi-ice">{it.productName}</p>
                      <p className="text-[11px] text-safi-steel">
                        {it.color} · Size {it.size} × {it.qty}
                      </p>
                      <p className="text-[10px] text-safi-steel/70">
                        SKU {it.sku} · barcode {it.barcode}
                        {it.sourceBranchId ? ` · from ${it.sourceBranchId === 1 ? 'El Mina' : 'Dam w Farez'}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{money(it.unitPriceCents * it.qty)}</span>
                  </div>
                ))}
                <p className="mt-3 text-[11px] leading-relaxed text-safi-steel">
                  {order.fulfilment === 'pickup' ? 'Pickup in store' : 'Delivery'} · Cash on delivery
                  {order.deliveryFeeCents ? ` · fee ${money(order.deliveryFeeCents)}` : ''}
                  <br />
                  {order.guestPhone} {order.guestAddress ? `· ${order.guestAddress}` : ''}
                  {customer?.notes ? ` · Note: ${customer.notes}` : ''}
                </p>
                {order.guestPhone && (
                  <a
                    href={whatsappLink(order.guestPhone, `Hi ${order.guestName}, about your SAFI SPORT order ${order.orderNumber}…`)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-400/20"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp the customer
                  </a>
                )}
              </div>

              <div>
                {!!order.needsTransfer && (
                  <div className="mb-3 rounded-sm border border-safi-red/60 bg-safi-red/10 p-4">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-safi-red">
                      <AlertTriangle className="h-4 w-4" /> Stock is at the other branch
                    </p>
                    {(suggestions.data?.suggestions ?? []).map((s, i) => (
                      <p key={i} className="mt-1.5 text-xs text-safi-ice">
                        {s.label} — {s.fromBranchId === 1 ? 'El Mina' : 'Dam w Farez'} →{' '}
                        {s.toBranchId === 1 ? 'El Mina' : 'Dam w Farez'}
                      </p>
                    ))}
                    <button
                      onClick={() =>
                        (suggestions.data?.suggestions ?? []).forEach((s) =>
                          createTransfer.mutate({ ...s, orderId: order.id }),
                        )
                      }
                      disabled={createTransfer.isPending || (suggestions.data?.suggestions ?? []).length === 0}
                      className={`${btnRed} mt-3 flex w-full items-center justify-center gap-2 py-3`}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      {createTransfer.isPending ? 'Requesting…' : 'Request branch transfer'}
                    </button>
                  </div>
                )}

                <ErrorNote error={setStatus.error} />
                <div className="flex flex-wrap gap-2">
                  {action && (
                    <button
                      onClick={() => setStatus.mutate({ id: order.id, status: action.to })}
                      disabled={setStatus.isPending}
                      className={`${btnPrimary} flex-1 py-3`}
                    >
                      {action.label}
                    </button>
                  )}
                  {['new', 'confirmed'].includes(order.status) && (
                    <button
                      onClick={() => setStatus.mutate({ id: order.id, status: 'cancelled' })}
                      disabled={setStatus.isPending}
                      className={btnGhost}
                    >
                      Cancel
                    </button>
                  )}
                  {['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(order.status) && (
                    <button
                      onClick={() => setStatus.mutate({ id: order.id, status: 'returned' })}
                      disabled={setStatus.isPending}
                      className={btnGhost}
                    >
                      Returned
                    </button>
                  )}
                  {order.status === 'delivered' && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Complete
                    </span>
                  )}
                </div>
                {!!order.needsTransfer && (
                  <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-safi-steel">
                    Request the transfer above so the item reaches the right branch
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminOrders() {
  const [params] = useSearchParams();
  const [openId, setOpenId] = useState(() => Number(params.get('open')) || null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const list = trpc.orders.list.useQuery(
    {
      status: filter === 'all' ? undefined : filter,
      search: search || undefined,
      page: 1,
      pageSize: 50,
    },
    { refetchInterval: 30_000 },
  );

  const items = list.data?.items ?? [];
  const chips = ['all', ...PIPELINE, 'returned', 'cancelled'];

  return (
    <div>
      <PageHeader title="Orders" sub="New → Confirmed → Preparing → Ready / Out for delivery → Delivered" />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-safi-steel" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, name or phone…"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {chips.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
              filter === s ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
            }`}
          >
            {s === 'all' ? `All (${list.data?.total ?? 0})` : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <Loading label="Loading orders…" />
      ) : items.length === 0 ? (
        <Empty>No orders in this state</Empty>
      ) : (
        <div className="space-y-2.5">
          {items.map((o) => (
            <OrderCard key={o.id} order={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
