import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowRight, Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { BRANCH_LIST, resolveStoreContact, waLink } from '@/lib/branches';
import { formatPrice } from '@/lib/branches';
import { ProductCard } from '@/components/Product';
import { trpc } from '@/providers/trpc';
import { asList, normalizeCardProduct } from '@/lib/catalogModel';
import { setPageMeta } from '@/lib/seo';
import { trackContact } from '@/lib/metaPixel';

function SectionTitle({ kicker, title, action }) {
  const nav = useNavigate();
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
          {kicker}
        </p>
        <h2 className="mt-1 font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight text-safi-ice md:text-4xl">
          {title}
        </h2>
      </div>
      {action && (
        <button
          onClick={() => nav(action.to)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel transition-colors hover:text-safi-ice"
        >
          {action.label} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    setPageMeta({ path: '/' });
    if (loc.hash === '#branches') {
      setTimeout(() => document.getElementById('branches')?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [loc.hash]);

  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const contact = resolveStoreContact(settingsQ.data);

  const newQ = trpc.catalog.newArrivals.useQuery({ limit: 10 }, { staleTime: 60_000 });
  const trendQ = trpc.catalog.trending.useQuery({ limit: 8 }, { staleTime: 60_000 });
  const lookQ = trpc.catalog.list.useQuery(
    { category: 'training', limit: 3 },
    { staleTime: 60_000 },
  );

  const newArrivals = asList(newQ.data).map(normalizeCardProduct).filter(Boolean);
  const trending = asList(trendQ.data).map(normalizeCardProduct).filter(Boolean);
  const lookItems = asList(lookQ.data).map(normalizeCardProduct).filter(Boolean).slice(0, 3);

  const cats = [
    { label: 'Shoes', to: '/shop?category=shoes', note: 'Men & Kids' },
    { label: 'Jackets & Hoodies', to: '/shop?category=jackets', note: 'New season' },
    { label: 'Training', to: '/shop?category=training', note: 'Tees · Shorts · Pants' },
    { label: 'Kids', to: '/shop?audience=kids', note: 'Sizes 4Y – 14Y' },
  ];

  return (
    <main className="bg-safi-black">
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative flex min-h-[92svh] items-end overflow-hidden">
        {/* layered gradient hero (no binary imagery in repo) */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#1B1C21_0%,#0A0A0C_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-safi-black via-safi-black/35 to-safi-black/55" />
        {/* diagonal speed accent */}
        <div className="absolute -right-24 top-0 h-full w-40 -skew-x-12 bg-safi-red/10" />
        <div className="absolute -left-32 bottom-0 h-64 w-64 -skew-x-12 rounded-full bg-safi-red/5 blur-3xl" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-14">
          <p className="rise rise-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-safi-red">
            Move Different<span className="text-safi-ice/60"> — Tripoli</span>
          </p>
          <h1 className="rise rise-2 mt-2 font-display text-[20vw] font-extrabold uppercase italic leading-[0.84] tracking-tight sm:text-8xl md:text-9xl">
            <span className="text-safi-ice">
              SAFI<span className="text-safi-red">/</span>
            </span>
            <br />
            <span className="text-stroke-strong">SPORT</span>
          </h1>
          <p className="rise rise-3 mt-4 max-w-sm text-sm leading-relaxed text-safi-ice/75">
            Adult &amp; kids sportswear, shoes, training kits, jackets and hoodies — from two
            branches in Tripoli to delivery across Lebanon.
          </p>
          <div className="rise rise-4 mt-7 flex flex-col gap-2.5 sm:flex-row">
            {[
              { label: 'Shop Men', to: '/shop?audience=men', primary: true },
              { label: 'Shop Kids', to: '/shop?audience=kids' },
              { label: 'Shop Shoes', to: '/shop?category=shoes' },
            ].map((c) => (
              <button
                key={c.label}
                onClick={() => nav(c.to)}
                className={`flex items-center justify-center gap-2 rounded-sm px-7 py-3.5 font-display text-base font-bold uppercase italic tracking-wider transition-all ${
                  c.primary
                    ? 'bg-safi-red text-white hover:bg-safi-reddeep'
                    : 'border border-safi-ice/30 text-safi-ice backdrop-blur-sm hover:border-safi-ice hover:bg-safi-ice hover:text-safi-black'
                }`}
              >
                {c.label} <ArrowRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────── */}
      <div className="overflow-hidden border-y border-safi-line bg-safi-graphite py-2.5">
        <div className="ticker flex w-max gap-10 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-10">
              {[
                'New arrivals weekly',
                'Cash on delivery',
                'Delivery across Lebanon',
                'El Mina · Dam w Farez',
                'Adults & Kids',
                'WhatsApp sizing help',
              ].map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-10 font-display text-sm font-semibold uppercase italic tracking-[0.2em] text-safi-steel"
                >
                  {t} <span className="text-safi-red">/</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── NEW ARRIVALS ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionTitle kicker="Just landed" title="New Arrivals" action={{ label: 'View all', to: '/shop' }} />
        {newArrivals.length === 0 && !newQ.isLoading ? (
          <p className="rounded-sm border border-dashed border-safi-line py-10 text-center text-xs uppercase tracking-[0.25em] text-safi-steel">
            New drops landing soon — follow {contact.instagram === '' ? '@safi.sport' : 'us'} for the first look
          </p>
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {(newArrivals.length ? newArrivals : Array.from({ length: 4 }, () => null)).map((p, i) =>
              p ? (
                <div key={p.id} className="w-[62vw] shrink-0 snap-start sm:w-64">
                  <ProductCard product={p} index={i} />
                </div>
              ) : (
                <div key={i} className="aspect-square w-[62vw] shrink-0 animate-pulse rounded-sm bg-safi-graphite sm:w-64" />
              ),
            )}
          </div>
        )}
      </section>

      {/* ── SHOP BY CATEGORY ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <SectionTitle kicker="Find your kit" title="Shop by Category" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cats.map((c) => (
            <button
              key={c.label}
              onClick={() => nav(c.to)}
              className="group relative overflow-hidden rounded-sm text-left"
            >
              <div className="relative aspect-[3/4] w-full bg-gradient-to-b from-safi-panel to-safi-graphite transition-transform duration-700 group-hover:scale-105">
                <span className="absolute right-4 top-4 h-10 w-[4px] -skew-x-12 bg-safi-red/40 transition-colors group-hover:bg-safi-red" />
                <span className="absolute bottom-16 left-4 font-display text-6xl font-extrabold uppercase italic leading-none text-safi-ice/5">
                  {c.label.split(' ')[0]}
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-safi-black/90 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="font-display text-xl font-extrabold uppercase italic leading-none text-safi-ice">
                  {c.label}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-safi-steel">
                  {c.note}
                </p>
              </div>
              <div className="absolute right-3 top-3 h-6 w-[3px] -skew-x-12 bg-safi-red opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </section>

      {/* ── TRENDING ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionTitle kicker="Most wanted" title="Trending Now" action={{ label: 'View all', to: '/shop' }} />
        {trending.length === 0 && !trendQ.isLoading ? (
          <p className="rounded-sm border border-dashed border-safi-line py-10 text-center text-xs uppercase tracking-[0.25em] text-safi-steel">
            Trending pieces appear here as they sell
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(trending.length ? trending : Array.from({ length: 4 }, () => null)).map((p, i) =>
              p ? (
                <ProductCard key={p.id} product={p} index={i} />
              ) : (
                <div key={i} className="aspect-square animate-pulse rounded-sm bg-safi-graphite" />
              ),
            )}
          </div>
        )}
      </section>

      {/* ── SHOP THE LOOK ────────────────────────────────── */}
      <section className="border-y border-safi-line bg-safi-graphite/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2 md:items-center">
          <div className="relative overflow-hidden rounded-sm">
            <div className="relative aspect-[4/3] w-full bg-[radial-gradient(ellipse_at_bottom_left,#1B1C21_0%,#0A0A0C_70%)]">
              <span className="absolute left-1/2 top-1/2 h-32 w-[8px] -translate-x-1/2 -translate-y-1/2 -skew-x-[18deg] bg-safi-red/60" />
            </div>
            <span className="absolute left-3 top-3 rounded-sm bg-safi-black/80 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-safi-red backdrop-blur">
              Shop the look
            </span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
              The full kit
            </p>
            <h2 className="mt-2 font-display text-4xl font-extrabold uppercase italic leading-[0.9] text-safi-ice md:text-5xl">
              One look.
              <br />
              Ready to train.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-safi-steel">
              Tee, track pants and runners — built together, priced together. Whatever your branch
              has in your size, the other branch can send over.
            </p>
            <div className="mt-6 space-y-2">
              {lookItems.map((p) => (
                <button
                  key={p.id}
                  onClick={() => nav(`/product/${p.slug}`)}
                  className="flex w-full items-center justify-between rounded-sm border border-safi-line bg-safi-black px-4 py-3 transition-colors hover:border-safi-red"
                >
                  <span className="font-display text-base font-bold uppercase italic text-safi-ice">
                    {p.name}
                  </span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-safi-steel">
                    {formatPrice(p.priceCents)} <ArrowRight className="h-3.5 w-3.5 text-safi-red" />
                  </span>
                </button>
              ))}
              {lookItems.length === 0 && (
                <button
                  onClick={() => nav('/shop?category=training')}
                  className="flex w-full items-center justify-between rounded-sm border border-safi-line bg-safi-black px-4 py-3 transition-colors hover:border-safi-red"
                >
                  <span className="font-display text-base font-bold uppercase italic text-safi-ice">
                    Browse training kit
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-safi-red" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── TWO BRANCHES ─────────────────────────────────── */}
      <section id="branches" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14">
        <SectionTitle kicker="Find us in Tripoli" title="Two Branches" />
        <div className="grid gap-4 md:grid-cols-2">
          {BRANCH_LIST.map((b, i) => (
            <div key={b.code} className="overflow-hidden rounded-sm border border-safi-line bg-safi-graphite/50">
              <div className="relative">
                <div className="relative aspect-[2/1] w-full bg-[radial-gradient(ellipse_at_center,#1B1C21_0%,#0A0A0C_75%)]">
                  <span className="absolute left-1/2 top-1/2 h-20 w-[6px] -translate-x-1/2 -translate-y-1/2 -skew-x-[18deg] bg-safi-red/50" />
                  <span className="absolute bottom-3 right-4 font-display text-4xl font-extrabold uppercase italic text-safi-ice/10">
                    {b.name}
                  </span>
                </div>
                <span className="absolute left-3 top-3 rounded-sm bg-safi-red px-2 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  Branch 0{i + 1}
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">
                  {b.name}
                </h3>
                <div className="mt-3 space-y-2 text-sm text-safi-steel">
                  <p className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-safi-red" /> {b.area}
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-safi-red" /> Open daily · {contact.hours ?? b.hours}
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 text-safi-red" /> {b.phone}
                  </p>
                </div>
                <a
                  href={waLink(`Hi SAFI SPORT ${b.name}! I have a question about a product.`, b.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackContact(`branch-${b.code}`)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-safi-line py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-safi-ice transition-colors hover:border-safi-red hover:text-safi-red"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp this branch
                </a>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.25em] text-safi-steel">
          One connected inventory — if one branch has it, you can get it
        </p>
      </section>

      {/* ── INSTAGRAM ────────────────────────────────────── */}
      <section className="border-t border-safi-line bg-safi-graphite/40">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
                The community
              </p>
              <h2 className="mt-1 font-display text-3xl font-extrabold uppercase italic text-safi-ice md:text-4xl">
                @safi.sport
              </h2>
            </div>
            <a
              href={contact.instagram}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice"
            >
              Follow <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <a
                key={i}
                href={contact.instagram}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-square overflow-hidden rounded-sm bg-safi-graphite"
              >
                <span className="absolute left-1/2 top-1/2 h-10 w-[4px] -translate-x-1/2 -translate-y-1/2 -skew-x-[18deg] bg-safi-red/30 transition-colors group-hover:bg-safi-red" />
              </a>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-safi-steel">
            New drops land on the feed first — follow along, then order here with cash on delivery.
          </p>
        </div>
      </section>
    </main>
  );
}
