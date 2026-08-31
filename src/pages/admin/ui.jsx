import React from 'react';
import { Loader2 } from 'lucide-react';

/** Money: DB stores integer cents (USD). */
export const money = (cents) => {
  const n = Number(cents ?? 0) / 100;
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
};

export const timeAgo = (ts) => {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return d.toLocaleDateString('en-LB', { day: 'numeric', month: 'short' });
};

export const hhmm = (ts) => {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('en-LB', { hour: '2-digit', minute: '2-digit' });
};

export function PageHeader({ title, sub, right }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-extrabold uppercase italic text-safi-ice">{title}</h1>
        {sub && <p className="text-[11px] uppercase tracking-[0.25em] text-safi-steel">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <p className="rounded-sm border border-dashed border-safi-line px-4 py-16 text-center font-display text-xl font-bold uppercase italic text-safi-steel">
      {children}
    </p>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <p className="flex items-center gap-2 py-16 justify-center text-safi-steel text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p className="rounded-sm border border-safi-red/40 bg-safi-red/10 px-4 py-3 text-sm text-safi-red">
      {error.message ?? String(error)}
    </p>
  );
}

export const inputCls =
  'w-full rounded-sm border border-safi-line bg-safi-panel px-3 py-2.5 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none';

export const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-safi-steel';

export const btnPrimary =
  'rounded-sm bg-safi-ice px-4 py-2.5 font-display text-sm font-bold uppercase italic tracking-wider text-safi-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-30';

export const btnRed =
  'rounded-sm bg-safi-red px-4 py-2.5 font-display text-sm font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep disabled:cursor-not-allowed disabled:opacity-40';

export const btnGhost =
  'rounded-sm border border-safi-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-safi-steel hover:border-safi-red hover:text-safi-red disabled:opacity-30';

/* Order pipeline (SPEC §2 orders.status) */
export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'returned',
  'cancelled',
];

export const STATUS_LABEL = {
  new: 'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const STATUS_COLOR = {
  new: 'text-safi-red border-safi-red/50 bg-safi-red/10',
  confirmed: 'text-sky-300 border-sky-400/40 bg-sky-400/10',
  preparing: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  ready_for_pickup: 'text-violet-300 border-violet-400/40 bg-violet-400/10',
  out_for_delivery: 'text-violet-300 border-violet-400/40 bg-violet-400/10',
  delivered: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  returned: 'text-orange-300 border-orange-400/40 bg-orange-400/10',
  cancelled: 'text-safi-steel border-safi-line bg-safi-panel',
};

export function StatusPill({ status }) {
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_COLOR[status] ?? STATUS_COLOR.cancelled}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** digits-only phone → wa.me link */
export function whatsappLink(phone, text) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const base = `https://wa.me/${digits.startsWith('961') ? digits : `961${digits.replace(/^0+/, '')}`}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export const BRANCH_LABEL = { elmina: 'El Mina', dam: 'Dam w Farez' };
export const branchName = (branches, id) => {
  const b = (branches ?? []).find((x) => x.id === id);
  return b ? b.nameEn : BRANCH_LABEL[b?.code] ?? (id ? `Branch #${id}` : '—');
};
