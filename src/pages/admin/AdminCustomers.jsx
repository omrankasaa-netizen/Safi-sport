import React, { useState } from 'react';
import { MessageCircle, Search, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Empty, Loading, PageHeader, StatusPill, inputCls, money, timeAgo, whatsappLink } from './ui';

/** Customers (SPEC §6): manager-only list + detail drawer with order history. */
export default function AdminCustomers() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const list = trpc.customers.list.useQuery({ search: search || undefined, page: 1, pageSize: 50 });
  const detail = trpc.customers.detail.useQuery({ id: openId }, { enabled: openId != null });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Customers" sub="Everyone who ordered — no signup needed" />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-safi-steel" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className={`${inputCls} pl-9`}
        />
      </div>

      {list.isPending ? (
        <Loading label="Loading customers…" />
      ) : items.length === 0 ? (
        <Empty>No customers yet</Empty>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className="flex w-full items-center justify-between rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3 text-left hover:border-safi-steel"
            >
              <div>
                <p className="font-display text-base font-bold italic text-safi-ice">
                  {c.fullName} <span className="not-italic text-sm text-safi-steel">· {c.phone}</span>
                </p>
                <p className="text-[11px] text-safi-steel">
                  {c.area || '—'} · {c.ordersCount} order{c.ordersCount === 1 ? '' : 's'}
                </p>
              </div>
              <span className="font-display text-lg font-extrabold italic">{money(c.totalSpentCents)}</span>
            </button>
          ))}
        </div>
      )}

      {openId != null && (
        <div className="fixed inset-0 z-50 flex justify-end bg-safi-black/70 backdrop-blur-sm" onClick={() => setOpenId(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-safi-line bg-safi-black p-5" onClick={(e) => e.stopPropagation()}>
            {detail.isPending ? (
              <Loading label="Loading customer…" />
            ) : detail.data ? (
              (() => {
                const { customer, totals, orders } = detail.data;
                return (
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">{customer.fullName}</h3>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-safi-steel">
                          {customer.phone} · {customer.area || '—'}
                        </p>
                      </div>
                      <button onClick={() => setOpenId(null)} aria-label="Close">
                        <X className="h-5 w-5 text-safi-steel hover:text-safi-ice" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-sm border border-safi-line bg-safi-graphite/50 p-4">
                        <p className="font-display text-3xl font-extrabold italic text-safi-ice">{totals.ordersCount}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">Orders</p>
                      </div>
                      <div className="rounded-sm border border-safi-red/50 bg-safi-red/10 p-4">
                        <p className="font-display text-3xl font-extrabold italic text-safi-ice">{money(totals.totalSpentCents)}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">Total spent</p>
                      </div>
                    </div>

                    {customer.address && <p className="mt-4 text-xs text-safi-steel">Address: {customer.address}</p>}
                    {customer.notes && <p className="mt-1 text-xs text-safi-steel">Note: {customer.notes}</p>}
                    <a
                      href={whatsappLink(customer.whatsapp || customer.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-400/20"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>

                    <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Order history</p>
                    {orders.length === 0 ? (
                      <p className="text-sm text-safi-steel">No orders yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {orders.map((o) => (
                          <div key={o.id} className="rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3">
                            <div className="flex items-center justify-between">
                              <p className="font-display text-base font-bold italic text-safi-ice">{o.orderNumber}</p>
                              <StatusPill status={o.status} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-safi-steel">
                              {timeAgo(o.createdAt)} · {money(o.totalCents)}
                            </p>
                            <p className="mt-1 text-[11px] text-safi-steel">
                              {o.items.map((i) => `${i.productName} (${i.color} ${i.size}) ×${i.qty}`).join(', ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-safi-steel">Customer not found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
