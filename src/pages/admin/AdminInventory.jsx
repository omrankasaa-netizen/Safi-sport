import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Check, Search } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/lib/AuthContext';
import { Empty, ErrorNote, Loading, PageHeader, btnGhost, hhmm, inputCls, timeAgo } from './ui';

/**
 * Inventory (SPEC §6): product→variant grid with per-branch qty, RBMsoft vs
 * manual badges, thresholds (manager+), qty override (owner), low-stock tab,
 * conflicts tab (owner resolves).
 */
export default function AdminInventory() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'grid';
  const setTab = (t) => setParams(t === 'grid' ? {} : { tab: t });
  const { user } = useAuth();
  const isManager = ['manager', 'owner'].includes(user?.role);
  const isOwner = user?.role === 'owner';

  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState(undefined);
  const grid = trpc.inventory.grid.useQuery(
    { search: search || undefined, branchId, page: 1, pageSize: 100 },
    { refetchInterval: 60_000 },
  );
  const lowStock = trpc.inventory.lowStock.useQuery(undefined, { enabled: tab === 'low' });
  const conflicts = trpc.sync.conflicts.useQuery(undefined, { enabled: tab === 'conflicts' && isOwner, retry: false });
  const syncStatus = trpc.sync.status.useQuery(undefined, { enabled: tab === 'conflicts' });

  const utils = trpc.useUtils();
  const setThreshold = trpc.inventory.setThreshold.useMutation({
    onSuccess: () => utils.inventory.grid.invalidate(),
  });
  const overrideQty = trpc.inventory.overrideQty.useMutation({
    onSuccess: () => utils.inventory.grid.invalidate(),
  });
  const acknowledge = trpc.inventory.acknowledgeLowStock.useMutation({
    onSuccess: () => {
      utils.inventory.lowStock.invalidate();
      utils.inventory.grid.invalidate();
    },
  });
  const resolveConflict = trpc.sync.resolveConflict.useMutation({
    onSuccess: () => {
      utils.sync.conflicts.invalidate();
      utils.sync.status.invalidate();
    },
  });

  const branches = grid.data?.branches ?? [];
  const items = grid.data?.items ?? [];

  const tabBtn = (id, label, count) => (
    <button
      onClick={() => setTab(id)}
      className={`rounded-sm border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${
        tab === id ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
      }`}
    >
      {label}
      {count != null && count > 0 ? ` (${count})` : ''}
    </button>
  );

  return (
    <div>
      <PageHeader title="Inventory" sub="Stock numbers come from RBMsoft · overrides stay manual" />

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {tabBtn('grid', 'Stock grid')}
        {tabBtn('low', 'Low stock', lowStock.data?.length)}
        {tabBtn('conflicts', 'Sync conflicts', syncStatus.data?.unresolvedConflicts)}
      </div>

      {tab === 'grid' && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-safi-steel" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, SKU or barcode…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setBranchId(undefined)}
                className={`rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
                  branchId == null ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
                }`}
              >
                Both
              </button>
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranchId(b.id)}
                  className={`rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
                    branchId === b.id ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
                  }`}
                >
                  {b.nameEn}
                </button>
              ))}
            </div>
          </div>

          {grid.isPending ? (
            <Loading label="Loading stock…" />
          ) : items.length === 0 ? (
            <Empty>No variants match</Empty>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-safi-line">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-safi-line bg-safi-graphite/60 text-left text-[10px] uppercase tracking-[0.2em] text-safi-steel">
                    <th className="px-4 py-3">Variant</th>
                    {branches.map((b) => (
                      <th key={b.id} className="px-2 py-3 text-center">{b.nameEn}</th>
                    ))}
                    <th className="px-4 py-3 text-center">Total</th>
                    {isManager && <th className="px-4 py-3 text-right">Threshold</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ variant, product, stock }) => {
                    const total = stock.reduce((a, s) => a + s.available, 0);
                    return (
                      <tr key={variant.id} className={`border-b border-safi-line/50 ${total === 0 ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-display text-sm font-bold uppercase italic leading-tight text-safi-ice">
                            {product.nameEn}
                          </p>
                          <p className="text-[10px] text-safi-steel">
                            {variant.color} · Size {variant.size} · {variant.barcode}
                            {total === 0 && <span className="ml-2 font-bold uppercase tracking-widest text-safi-red">Out</span>}
                          </p>
                        </td>
                        {stock.map((s) => (
                          <td key={s.branchId} className="px-2 py-2.5 text-center">
                            <p
                              className={`font-display text-lg font-extrabold italic ${
                                s.available === 0 ? 'text-safi-red' : s.available <= s.lowStockThreshold ? 'text-amber-300' : 'text-safi-ice'
                              }`}
                            >
                              {s.available}
                              {s.reservedOnline > 0 && (
                                <span className="ml-1 align-middle text-[9px] font-bold uppercase tracking-widest text-safi-steel">
                                  ({s.reservedOnline} held)
                                </span>
                              )}
                            </p>
                            <p className="text-[9px] uppercase tracking-widest text-safi-steel">
                              {s.syncSource === 'manual' ? (
                                <span className="font-bold text-sky-300">manual</span>
                              ) : (
                                <>RBMsoft {hhmm(s.lastSyncedAt) ?? ''}</>
                              )}
                            </p>
                            {isOwner && (
                              <button
                                className="mt-1 text-[9px] font-bold uppercase tracking-widest text-safi-steel underline hover:text-safi-red"
                                onClick={() => {
                                  const v = window.prompt(
                                    `Set physical qty for ${product.nameEn} (${variant.color} ${variant.size}) at this branch:`,
                                    String(s.qtyOnHand),
                                  );
                                  if (v != null && /^\d+$/.test(v.trim())) {
                                    overrideQty.mutate({
                                      variantId: variant.id,
                                      branchId: s.branchId,
                                      qtyOnHand: Number(v.trim()),
                                      reason: 'manual count',
                                    });
                                  }
                                }}
                              >
                                Override
                              </button>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center font-display text-lg font-extrabold italic text-safi-ice">{total}</td>
                        {isManager && (
                          <td className="px-4 py-2.5 text-right">
                            {stock.map((s) => (
                              <button
                                key={s.branchId}
                                className="ml-2 rounded-sm border border-safi-line px-2 py-1 text-[10px] font-bold text-safi-steel hover:border-safi-red hover:text-safi-red"
                                title={`Low-stock alert threshold at ${s.branchCode}`}
                                onClick={() => {
                                  const v = window.prompt(
                                    `Alert when stock drops to (branch ${s.branchCode}):`,
                                    String(s.lowStockThreshold),
                                  );
                                  if (v != null && /^\d+$/.test(v.trim())) {
                                    setThreshold.mutate({ variantId: variant.id, branchId: s.branchId, threshold: Number(v.trim()) });
                                  }
                                }}
                              >
                                {s.branchCode}: {s.lowStockThreshold}
                              </button>
                            ))}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ErrorNote error={overrideQty.error || setThreshold.error} />
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-safi-steel">
            “Manual” counts are not overwritten by sync until released
          </p>
        </>
      )}

      {tab === 'low' && (
        <div className="space-y-2">
          {lowStock.isPending ? (
            <Loading />
          ) : (lowStock.data?.length ?? 0) === 0 ? (
            <Empty>Nothing running low — nice</Empty>
          ) : (
            lowStock.data.map(({ alert, variant, product }) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-sm border border-amber-400/25 bg-amber-400/5 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                  <div>
                    <p className="font-display text-base font-bold italic text-safi-ice">
                      {product.nameEn}{' '}
                      <span className="not-italic text-safi-steel">· {variant.color} · {variant.size}</span>
                    </p>
                    <p className="text-[11px] text-safi-steel">
                      {alert.qtyAtAlert} left · {timeAgo(alert.createdAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => acknowledge.mutate({ id: alert.id })}
                  disabled={acknowledge.isPending}
                  className={btnGhost}
                >
                  <Check className="mr-1 inline h-3.5 w-3.5" /> Got it
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'conflicts' && (
        <div className="space-y-2">
          {!isOwner ? (
            <Empty>Only the owner can resolve sync conflicts</Empty>
          ) : conflicts.isPending ? (
            <Loading />
          ) : (conflicts.data?.length ?? 0) === 0 ? (
            <Empty>No conflicts — RBMsoft and the shop agree</Empty>
          ) : (
            conflicts.data.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-safi-red/40 bg-safi-red/5 px-4 py-3"
              >
                <div>
                  <p className="font-display text-base font-bold uppercase italic text-safi-ice">
                    {String(c.kind).replace(/_/g, ' ')}
                  </p>
                  <p className="text-[11px] text-safi-steel">
                    Variant #{c.variantId} · Branch #{c.branchId} · {timeAgo(c.createdAt)}
                  </p>
                  {c.detail != null && (
                    <p className="mt-1 max-w-md truncate font-mono text-[10px] text-safi-steel/70">
                      {JSON.stringify(c.detail)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => resolveConflict.mutate({ id: c.id })}
                  disabled={resolveConflict.isPending}
                  className={btnGhost}
                >
                  <Check className="mr-1 inline h-3.5 w-3.5" /> Accept physical count
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
