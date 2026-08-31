import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, Truck, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Empty, ErrorNote, Loading, PageHeader, btnGhost, btnPrimary, btnRed, inputCls, labelCls, timeAgo } from './ui';

const STATUS_LABEL = {
  requested: 'Requested',
  in_transit: 'On the way',
  received: 'Received',
  cancelled: 'Cancelled',
};

function CreateTransfer({ branches, onClose }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    variantId: '',
    qty: '1',
    fromBranchId: branches[0]?.id ?? '',
    toBranchId: branches[1]?.id ?? '',
    note: '',
  });
  const create = trpc.transfers.create.useMutation({
    onSuccess: () => {
      utils.transfers.list.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-safi-black/80 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-sm border border-safi-line bg-safi-black p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-extrabold uppercase italic text-safi-ice">New transfer</h3>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-safi-steel" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Variant ID</label>
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="Find IDs in Inventory"
              value={form.variantId}
              onChange={(e) => setForm({ ...form, variantId: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>From</label>
              <select className={inputCls} value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: Number(e.target.value) })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>To</label>
              <select className={inputCls} value={form.toBranchId} onChange={(e) => setForm({ ...form, toBranchId: Number(e.target.value) })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Qty</label>
            <input className={inputCls} inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div>
            <label className={labelCls}>Note (optional)</label>
            <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <ErrorNote error={create.error} />
          <button
            className={`${btnRed} w-full py-3`}
            disabled={create.isPending || !form.variantId || !form.qty || form.fromBranchId === form.toBranchId}
            onClick={() =>
              create.mutate({
                variantId: Number(form.variantId),
                qty: Number(form.qty),
                fromBranchId: Number(form.fromBranchId),
                toBranchId: Number(form.toBranchId),
                note: form.note || undefined,
              })
            }
          >
            {create.isPending ? 'Requesting…' : 'Request transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTransfers() {
  const [filter, setFilter] = useState(undefined);
  const [creating, setCreating] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.transfers.list.useQuery({ status: filter }, { refetchInterval: 30_000 });
  const grid = trpc.inventory.grid.useQuery({ page: 1, pageSize: 1 });

  const invalidate = () => {
    utils.transfers.list.invalidate();
    utils.inventory.grid.invalidate();
  };
  const inTransit = trpc.transfers.markInTransit.useMutation({ onSuccess: invalidate });
  const receive = trpc.transfers.markReceived.useMutation({ onSuccess: invalidate });
  const cancel = trpc.transfers.cancel.useMutation({ onSuccess: invalidate });

  const branches = grid.data?.branches ?? [];
  const branchName = (id) => branches.find((b) => b.id === id)?.nameEn ?? `Branch #${id}`;
  const items = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Branch transfers"
        sub="Stock moving between El Mina and Dam w Farez"
        right={
          <button className={btnPrimary} onClick={() => setCreating(true)}>
            <ArrowLeftRight className="mr-1 inline h-4 w-4" /> New transfer
          </button>
        }
      />

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {[undefined, 'requested', 'in_transit', 'received', 'cancelled'].map((s) => (
          <button
            key={String(s)}
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
              filter === s ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
            }`}
          >
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <Loading label="Loading transfers…" />
      ) : items.length === 0 ? (
        <Empty>No transfers yet</Empty>
      ) : (
        <div className="space-y-2.5">
          {items.map((t) => (
            <div
              key={t.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-sm border px-4 py-3.5 ${
                t.status === 'requested'
                  ? 'border-safi-red/40 bg-safi-red/5'
                  : t.status === 'in_transit'
                    ? 'border-violet-400/30 bg-violet-400/5'
                    : 'border-safi-line bg-safi-graphite/40'
              }`}
            >
              <div>
                <p className="font-display text-lg font-bold italic text-safi-ice">
                  {t.transferNumber}{' '}
                  <span className="not-italic text-sm text-safi-steel">
                    · {t.product.nameEn} · {t.variant.color} · Size {t.variant.size} × {t.qty}
                  </span>
                </p>
                <p className="text-[11px] text-safi-steel">
                  {branchName(t.fromBranchId)} → {branchName(t.toBranchId)} · {timeAgo(t.createdAt)}
                  {t.orderId && <span className="text-safi-red"> · for order #{t.orderId}</span>}
                  {t.note ? ` · ${t.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {t.status === 'requested' && (
                  <>
                    <button className={btnPrimary} disabled={inTransit.isPending} onClick={() => inTransit.mutate({ id: t.id })}>
                      <Truck className="mr-1 inline h-4 w-4" /> Sent
                    </button>
                    <button className={btnGhost} disabled={cancel.isPending} onClick={() => cancel.mutate({ id: t.id })}>
                      Cancel
                    </button>
                  </>
                )}
                {t.status === 'in_transit' && (
                  <button className={btnRed} disabled={receive.isPending} onClick={() => receive.mutate({ id: t.id })}>
                    Mark received
                  </button>
                )}
                {t.status === 'received' && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Received — stock updated
                  </span>
                )}
                {t.status === 'cancelled' && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-safi-steel">Cancelled</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateTransfer branches={branches} onClose={() => setCreating(false)} />}
    </div>
  );
}
