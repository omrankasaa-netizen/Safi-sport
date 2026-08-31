import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRightLeft, CheckCircle2, XCircle } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import { formatPrice } from '@/lib/branches';

/**
 * Product image with a CSS fallback — no binary placeholders. When there is
 * no photo (or it fails to load) we render a graphite panel with the red
 * speed-slash, so the grid never shows a broken image.
 */
export function ProductImage({ src, alt = '', className = '', imgClassName = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-safi-graphite ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="h-3/5 w-[6px] -skew-x-[18deg] bg-safi-red/70" />
        <span className="absolute bottom-2 right-3 font-display text-xs font-bold uppercase italic tracking-widest text-safi-steel/50">
          SAFI/
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className={`${className} ${imgClassName}`}
    />
  );
}

export function ProductCard({ product, index = 0 }) {
  const nav = useNavigate();
  const anyStock = product.inStock.elmina + product.inStock.dam > 0;
  const tag = product.isNew ? 'NEW' : product.isTrending ? 'TRENDING' : null;

  return (
    <button
      onClick={() => nav(`/product/${product.slug}`)}
      className="group relative w-full text-left"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden rounded-sm bg-safi-graphite">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {tag && (
          <span
            className={`absolute left-2 top-2 rounded-sm px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.15em] ${
              tag === 'NEW' ? 'bg-safi-ice text-safi-black' : 'bg-safi-red text-white'
            }`}
          >
            {tag}
          </span>
        )}
        {!anyStock && (
          <span className="absolute inset-x-0 bottom-0 bg-safi-black/80 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-safi-steel">
            Out of stock
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
        <div>
          <p className="font-display text-base font-bold uppercase italic leading-tight text-safi-ice">
            {product.name}
          </p>
          <p className="mt-0.5 text-[11px] capitalize text-safi-steel">
            {product.audience} · {product.category}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-base font-extrabold italic text-safi-ice">
            {formatPrice(product.priceCents)}
          </p>
          {product.compareAtPriceCents != null && product.compareAtPriceCents > product.priceCents && (
            <p className="text-[11px] text-safi-steel line-through">
              {formatPrice(product.compareAtPriceCents)}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * The operational centrepiece: availability by branch for the chosen
 * colour + size, with cross-branch transfer request.
 *
 * stock = { elmina: qty, dam: qty } for the selected variant.
 */
export function BranchAvailability({ size, stock, fulfilBranch, onPickBranch }) {
  const [requested, setRequested] = useState(false);

  if (!size) {
    return (
      <div className="rounded-sm border border-dashed border-safi-line p-4 text-center text-xs text-safi-steel">
        Select a size to see live branch availability
      </div>
    );
  }

  const rows = [
    { id: 'elmina', qty: stock.elmina },
    { id: 'dam', qty: stock.dam },
  ];
  const other = fulfilBranch === 'elmina' ? 'dam' : 'elmina';
  const needTransfer = stock[fulfilBranch] === 0 && stock[other] > 0;

  return (
    <div className="rounded-sm border border-safi-line bg-safi-graphite/60">
      <div className="flex items-center justify-between border-b border-safi-line px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Availability by branch — Size {size}
        </p>
        <span className="rounded-sm bg-safi-red/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-safi-red">
          One inventory
        </span>
      </div>
      <div className="divide-y divide-safi-line/70">
        {rows.map(({ id, qty }) => (
          <button
            key={id}
            onClick={() => qty > 0 && onPickBranch(id)}
            disabled={qty === 0}
            className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
              fulfilBranch === id ? 'bg-safi-red/5' : ''
            } ${qty > 0 ? 'hover:bg-safi-panel' : 'opacity-80'}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  qty > 0 ? (qty <= 2 ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-safi-line'
                }`}
              />
              <div>
                <p className="font-display text-base font-bold uppercase italic text-safi-ice">
                  {BRANCHES[id].name}
                  {fulfilBranch === id && qty > 0 && (
                    <span className="ml-2 rounded-sm bg-safi-red px-1.5 py-0.5 font-body text-[9px] font-bold not-italic tracking-widest text-white">
                      Fulfils your order
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-safi-steel">{BRANCHES[id].area}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {qty > 0 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-sm font-semibold text-safi-ice">{qty} available</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-safi-red" />
                  <span className="text-sm font-semibold text-safi-red">Out of stock</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>

      {needTransfer && !requested && (
        <div className="border-t border-safi-line px-4 py-3">
          <p className="mb-2 text-[11px] leading-relaxed text-safi-steel">
            Not at {BRANCHES[fulfilBranch].name} right now — but SAFI has{' '}
            <span className="font-semibold text-safi-ice">
              {stock[other]} at {BRANCHES[other].name}
            </span>
            . One system, two branches.
          </p>
          <button
            onClick={() => setRequested(true)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-safi-red bg-safi-red/10 py-2.5 font-display text-sm font-bold uppercase italic tracking-wider text-safi-red transition-colors hover:bg-safi-red hover:text-white"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Request from {BRANCHES[other].name}
          </button>
        </div>
      )}

      {needTransfer && requested && (
        <div className="border-t border-safi-line bg-safi-red/5 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-safi-ice">
            <CheckCircle2 className="h-4 w-4 text-safi-red" />
            Branch transfer requested — {BRANCHES[other].name} → {BRANCHES[fulfilBranch].name}
          </p>
          <p className="mt-1 pl-6 text-[11px] text-safi-steel">
            We'll WhatsApp you as soon as it lands at {BRANCHES[fulfilBranch].name} — usually
            within 24 hours. Place your order as pickup and we handle the rest.
          </p>
        </div>
      )}
    </div>
  );
}
