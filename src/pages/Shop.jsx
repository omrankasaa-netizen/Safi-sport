import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '@/components/Product';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { trpc } from '@/providers/trpc';
import { asList, normalizeCardProduct } from '@/lib/catalogModel';
import { setPageMeta } from '@/lib/seo';

const CATEGORY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'training', label: 'Training' },
  { id: 'jackets', label: 'Jackets' },
  { id: 'hoodies', label: 'Hoodies' },
  { id: 'pants', label: 'Pants' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'tees', label: 'Tees' },
  { id: 'sets', label: 'Sets' },
  { id: 'accessories', label: 'Accessories' },
];

const ALL_SIZES = {
  shoe: ['40', '41', '42', '43', '44', '45'],
  'shoe-kids': ['31', '32', '33', '34', '35', '36'],
  apparel: ['S', 'M', 'L', 'XL', 'XXL'],
  'apparel-kids': ['4Y', '6Y', '8Y', '10Y', '12Y', '14Y'],
};

const ALL_COLOURS = [
  { name: 'Black', hex: '#141519' },
  { name: 'Red', hex: '#E1261C' },
  { name: 'White', hex: '#F4F5F7' },
  { name: 'Graphite', hex: '#3A3C42' },
];

const MAX_PRICE = 100;
const DEFAULT_FILTERS = {
  audience: 'all',
  category: 'all',
  size: null,
  colour: null,
  maxPrice: MAX_PRICE,
  inStockOnly: false,
  branch: 'all',
};

export default function Shop() {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState('featured');
  const [f, setF] = useState({
    ...DEFAULT_FILTERS,
    audience: params.get('audience') || 'all',
    category: params.get('category') || 'all',
  });

  useEffect(() => {
    const title =
      f.audience === 'kids' ? 'Kids' : f.audience === 'men' ? 'Men' : 'Shop All';
    setPageMeta({ title: `${title} — Shop`, path: '/shop' });
  }, [f.audience, f.category]);

  // Server-side filtering per SPEC §4 catalog.list — the same filters the UI exposes.
  const queryInput = useMemo(
    () => ({
      audience: f.audience === 'all' ? undefined : f.audience,
      category: f.category === 'all' ? undefined : f.category,
      size: f.size ?? undefined,
      color: f.colour ?? undefined,
      maxPriceCents: f.maxPrice >= MAX_PRICE ? undefined : f.maxPrice * 100,
      branch: f.branch === 'all' ? undefined : f.branch,
      inStock: f.inStockOnly || undefined,
      sort: sort === 'featured' ? undefined : sort === 'low' ? 'price_asc' : 'price_desc',
      limit: 60,
    }),
    [f, sort],
  );
  const listQ = trpc.catalog.list.useQuery(queryInput, { staleTime: 60_000 });

  const results = useMemo(() => {
    let list = asList(listQ.data).map(normalizeCardProduct).filter(Boolean);
    // Client-side fallback filtering keeps the UI correct even if the server
    // ignores a filter it doesn't implement yet.
    list = list.filter((p) => {
      if (f.audience !== 'all' && p.audience !== f.audience && p.audience !== 'unisex') return false;
      if (f.category !== 'all' && p.category !== f.category) return false;
      if (p.priceCents > f.maxPrice * 100) return false;
      if (f.inStockOnly) {
        const stock =
          f.branch === 'all' ? p.inStock.elmina + p.inStock.dam : p.inStock[f.branch] ?? 0;
        if (stock <= 0) return false;
      }
      return true;
    });
    if (sort === 'low') list = [...list].sort((a, b) => a.priceCents - b.priceCents);
    if (sort === 'high') list = [...list].sort((a, b) => b.priceCents - a.priceCents);
    return list;
  }, [listQ.data, f, sort]);

  const activeCount =
    (f.audience !== 'all' ? 1 : 0) +
    (f.category !== 'all' ? 1 : 0) +
    (f.size ? 1 : 0) +
    (f.colour ? 1 : 0) +
    (f.maxPrice < MAX_PRICE ? 1 : 0) +
    (f.inStockOnly ? 1 : 0) +
    (f.branch !== 'all' ? 1 : 0);

  const FilterBody = (
    <div className="space-y-7">
      {/* Audience */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Who
        </p>
        <div className="flex gap-2">
          {['all', 'men', 'kids'].map((a) => (
            <button
              key={a}
              onClick={() => setF({ ...f, audience: a })}
              className={`flex-1 rounded-sm border py-2 font-display text-sm font-bold uppercase italic tracking-wider transition-colors ${
                f.audience === a
                  ? 'border-safi-red bg-safi-red text-white'
                  : 'border-safi-line text-safi-steel hover:border-safi-steel'
              }`}
            >
              {a === 'all' ? 'All' : a}
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Category
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => setF({ ...f, category: c.id })}
              className={`rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors ${
                f.category === c.id
                  ? 'border-safi-red bg-safi-red/15 text-safi-red'
                  : 'border-safi-line text-safi-steel hover:border-safi-steel'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Size
        </p>
        {[
          ['Shoes (Men)', 'shoe'],
          ['Shoes (Kids)', 'shoe-kids'],
          ['Apparel (Men)', 'apparel'],
          ['Apparel (Kids)', 'apparel-kids'],
        ].map(([label, key]) => (
          <div key={key} className="mb-3">
            <p className="mb-1.5 text-[10px] text-safi-steel/70">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SIZES[key].map((s) => (
                <button
                  key={s}
                  onClick={() => setF({ ...f, size: f.size === s ? null : s })}
                  className={`min-w-9 rounded-sm border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    f.size === s
                      ? 'border-safi-red bg-safi-red text-white'
                      : 'border-safi-line text-safi-steel hover:border-safi-steel'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Colour */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Colour
        </p>
        <div className="flex gap-2.5">
          {ALL_COLOURS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => setF({ ...f, colour: f.colour === c.name ? null : c.name })}
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                f.colour === c.name ? 'scale-110 border-safi-red' : 'border-safi-line'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      {/* Price */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Max price — <span className="text-safi-ice">${f.maxPrice}</span>
        </p>
        <input
          type="range"
          min={10}
          max={MAX_PRICE}
          step={5}
          value={f.maxPrice}
          onChange={(e) => setF({ ...f, maxPrice: Number(e.target.value) })}
          className="w-full accent-safi-red"
        />
      </div>

      {/* Branch + availability */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Branch stock
        </p>
        <div className="flex gap-2">
          {[
            ['all', 'Both branches'],
            ['elmina', 'El Mina'],
            ['dam', 'Dam w Farez'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setF({ ...f, branch: id })}
              className={`flex-1 rounded-sm border px-2 py-2 text-[11px] font-semibold transition-colors ${
                f.branch === id
                  ? 'border-safi-red bg-safi-red/15 text-safi-red'
                  : 'border-safi-line text-safi-steel hover:border-safi-steel'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-safi-ice">
          <input
            type="checkbox"
            checked={f.inStockOnly}
            onChange={(e) => setF({ ...f, inStockOnly: e.target.checked })}
            className="h-4 w-4 accent-safi-red"
          />
          In stock only
        </label>
      </div>

      <button
        onClick={() => setF(DEFAULT_FILTERS)}
        className="w-full rounded-sm border border-safi-line py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-safi-steel hover:border-safi-red hover:text-safi-red"
      >
        Reset filters
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
          SAFI SPORT — Shop
        </p>
        <h1 className="mt-1 font-display text-5xl font-extrabold uppercase italic leading-none text-safi-ice">
          {f.audience === 'kids' ? 'Kids' : f.audience === 'men' ? 'Men' : 'All Products'}
          {f.category !== 'all' && (
            <span className="text-safi-steel">
              {' '}
              / {CATEGORY_OPTIONS.find((c) => c.id === f.category)?.label}
            </span>
          )}
        </h1>
        <p className="mt-2 text-xs text-safi-steel">
          {results.length} product{results.length === 1 ? '' : 's'} · live stock across both
          branches
        </p>
      </div>

      <div className="flex gap-10">
        {/* desktop filters */}
        <aside className="hidden w-60 shrink-0 lg:block">{FilterBody}</aside>

        <div className="flex-1">
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-sm border border-safi-line px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-safi-ice lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeCount > 0 && (
                <span className="rounded-full bg-safi-red px-1.5 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-sm border border-safi-line bg-safi-black px-3 py-2 text-xs font-semibold text-safi-ice"
            >
              <option value="featured">Featured</option>
              <option value="low">Price: low → high</option>
              <option value="high">Price: high → low</option>
            </select>
          </div>

          {listQ.isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-sm bg-safi-graphite" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-sm border border-dashed border-safi-line py-20 text-center">
              <p className="font-display text-2xl font-bold uppercase italic text-safi-steel">
                Nothing matches
              </p>
              <p className="mt-1 text-xs text-safi-steel/70">Try clearing a filter or two.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {results.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* mobile filter sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto border-safi-line bg-safi-black px-5 pb-8 pt-4"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold uppercase italic text-safi-ice">
              Filters
            </h2>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-5 w-5 text-safi-steel" />
            </button>
          </div>
          {FilterBody}
          <button
            onClick={() => setOpen(false)}
            className="mt-6 w-full rounded-sm bg-safi-red py-3.5 font-display text-lg font-bold uppercase italic tracking-wider text-white"
          >
            Show {results.length} results
          </button>
        </SheetContent>
      </Sheet>
    </main>
  );
}
