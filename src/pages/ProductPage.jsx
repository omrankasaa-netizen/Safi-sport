import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Package,
  RefreshCcw,
  Ruler,
  ShoppingBag,
  Truck,
  Zap,
} from 'lucide-react';
import { BranchAvailability, ProductCard, ProductImage } from '@/components/Product';
import { useCart } from '@/lib/cart';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { trpc } from '@/providers/trpc';
import { asList, normalizeCardProduct, normalizeDetail, stockFor, variantFor } from '@/lib/catalogModel';
import { BRANCHES, resolveStoreContact, waLink, formatPrice } from '@/lib/branches';
import { setPageMeta } from '@/lib/seo';
import { trackContact, trackViewContent } from '@/lib/metaPixel';

const SIZE_GUIDE = {
  apparel: [
    ['S', 'Chest 88–94 cm'],
    ['M', 'Chest 94–100 cm'],
    ['L', 'Chest 100–106 cm'],
    ['XL', 'Chest 106–112 cm'],
    ['XXL', 'Chest 112–118 cm'],
  ],
  shoe: [
    ['40', '25.0 cm foot'],
    ['41', '25.7 cm foot'],
    ['42', '26.3 cm foot'],
    ['43', '27.0 cm foot'],
    ['44', '27.7 cm foot'],
    ['45', '28.3 cm foot'],
  ],
};

export default function ProductPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { addItem } = useCart();

  const productQ = trpc.catalog.bySlug.useQuery({ slug }, { staleTime: 60_000 });
  const relatedQ = trpc.catalog.related.useQuery(
    { slug, limit: 4 },
    { staleTime: 60_000 },
  );
  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const contact = resolveStoreContact(settingsQ.data);

  const product = useMemo(() => normalizeDetail(productQ.data), [productQ.data]);
  const related = useMemo(
    () => asList(relatedQ.data).map(normalizeCardProduct).filter(Boolean).slice(0, 4),
    [relatedQ.data],
  );

  const [imgIdx, setImgIdx] = useState(0);
  const [colour, setColour] = useState('');
  const [size, setSize] = useState(null);
  const [branch, setBranch] = useState('elmina');
  const [guideOpen, setGuideOpen] = useState(false);
  const [sizeError, setSizeError] = useState(false);

  // Initialise the selected colour once the product loads.
  useEffect(() => {
    if (product && !colour) setColour(product.colors[0]?.name ?? '');
  }, [product, colour]);

  // SEO + ViewContent once the product is known.
  useEffect(() => {
    if (!product) return;
    setPageMeta({
      title: product.name,
      description: product.description?.slice(0, 160) || undefined,
      path: `/product/${product.slug}`,
      image: product.colors[0]?.images?.[0] || product.image || undefined,
      type: 'product',
    });
    trackViewContent(product);
  }, [product?.slug]);

  if (productQ.isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-sm bg-safi-graphite" />
          <div className="space-y-4">
            <div className="h-10 w-2/3 animate-pulse rounded-sm bg-safi-graphite" />
            <div className="h-6 w-1/4 animate-pulse rounded-sm bg-safi-graphite" />
            <div className="h-40 w-full animate-pulse rounded-sm bg-safi-graphite" />
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-24 text-center">
        <p className="font-display text-3xl font-bold uppercase italic text-safi-steel">
          Product not found
        </p>
        <button
          onClick={() => nav('/shop')}
          className="mt-4 text-sm text-safi-red underline underline-offset-4"
        >
          Back to shop
        </button>
      </main>
    );
  }

  const activeColour = product.colors.find((c) => c.name === colour) ?? product.colors[0];
  const images = activeColour?.images?.length ? activeColour.images : product.image ? [product.image] : [];
  const stock = size ? stockFor(product.variants, activeColour.name, size) : { elmina: 0, dam: 0 };
  const totalForSize = stock.elmina + stock.dam;
  const effectiveBranch =
    stock[branch] === 0 && stock[branch === 'elmina' ? 'dam' : 'elmina'] > 0
      ? branch === 'elmina'
        ? 'dam'
        : 'elmina'
      : branch;
  const variant = size ? variantFor(product.variants, activeColour.name, size) : null;
  const unitPriceCents = variant?.priceCents ?? product.priceCents;
  const tag = product.isNew ? 'NEW' : product.isTrending ? 'TRENDING' : null;
  const isShoe = product.sizeType === 'shoe' || product.category === 'shoes';

  const tryAdd = (goCheckout = false) => {
    if (!size || !variant) {
      setSizeError(true);
      document.getElementById('size-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    addItem({
      variantId: variant.id,
      productId: product.id,
      slug: product.slug,
      productName: product.name,
      image: images[0] ?? null,
      unitPrice: unitPriceCents / 100,
      color: activeColour.name,
      size,
      branchCode: effectiveBranch,
      quantity: 1,
    });
    if (goCheckout) nav('/checkout');
  };

  const waText = `Hi SAFI SPORT! I need sizing help with the ${product.name} (${activeColour.name}) — is size ${size ?? '…'} right for me?`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <button
        onClick={() => nav(-1)}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── gallery ── */}
        <div>
          <div className="relative overflow-hidden rounded-sm bg-safi-graphite">
            <ProductImage
              src={images[imgIdx]}
              alt={product.name}
              eager
              className="aspect-square w-full object-cover"
            />
            {tag && (
              <span
                className={`absolute left-3 top-3 rounded-sm px-2 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] ${
                  tag === 'NEW' ? 'bg-safi-ice text-safi-black' : 'bg-safi-red text-white'
                }`}
              >
                {tag}
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex gap-2">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`overflow-hidden rounded-sm border-2 ${
                    i === imgIdx ? 'border-safi-red' : 'border-transparent'
                  }`}
                >
                  <ProductImage src={src} alt="" className="h-16 w-16 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── buy panel ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
            {product.audience} · {product.category}
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold uppercase italic leading-[0.95] text-safi-ice md:text-5xl">
            {product.name}
          </h1>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-3xl font-extrabold italic text-safi-ice">
              {formatPrice(unitPriceCents)}
            </span>
            {product.compareAtPriceCents != null && product.compareAtPriceCents > unitPriceCents && (
              <>
                <span className="text-sm text-safi-steel line-through">
                  {formatPrice(product.compareAtPriceCents)}
                </span>
                <span className="rounded-sm bg-safi-red/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-safi-red">
                  Save {formatPrice(product.compareAtPriceCents - unitPriceCents)}
                </span>
              </>
            )}
          </div>
          {product.description && (
            <p className="mt-3 text-sm leading-relaxed text-safi-steel">{product.description}</p>
          )}

          {/* colour */}
          <div className="mt-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
              Colour — <span className="text-safi-ice">{activeColour.name}</span>
            </p>
            <div className="flex gap-2.5">
              {product.colors.map((c) => (
                <button
                  key={c.name}
                  title={c.name}
                  onClick={() => {
                    setColour(c.name);
                    setImgIdx(0);
                  }}
                  className={`h-9 w-9 rounded-full border-2 transition-all ${
                    activeColour.name === c.name ? 'scale-110 border-safi-red' : 'border-safi-line'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          {/* size */}
          <div className="mt-6" id="size-grid">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
                {isShoe ? 'Shoe size (EU)' : 'Size'}
                {sizeError && !size && (
                  <span className="ml-2 normal-case tracking-normal text-safi-red">
                    — pick a size first
                  </span>
                )}
              </p>
              <button
                onClick={() => setGuideOpen(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-safi-steel underline-offset-4 hover:text-safi-ice hover:underline"
              >
                <Ruler className="h-3.5 w-3.5" /> Size guide
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {product.sizes.map((s) => {
                const t = stockFor(product.variants, activeColour.name, s);
                const total = t.elmina + t.dam;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setSize(s);
                      setSizeError(false);
                    }}
                    className={`relative rounded-sm border py-2.5 text-sm font-semibold transition-colors ${
                      size === s
                        ? 'border-safi-red bg-safi-red text-white'
                        : total === 0
                          ? 'border-safi-line/50 text-safi-steel/40'
                          : 'border-safi-line text-safi-ice hover:border-safi-steel'
                    }`}
                  >
                    {s}
                    {total === 0 && (
                      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-safi-steel/40" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* branch availability — the centrepiece */}
          <div className="mt-6">
            <BranchAvailability
              size={size}
              stock={stock}
              fulfilBranch={branch}
              onPickBranch={setBranch}
            />
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => tryAdd(false)}
              disabled={!!size && totalForSize === 0}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-safi-red py-4 font-display text-lg font-bold uppercase italic tracking-wider text-white transition-colors hover:bg-safi-reddeep disabled:cursor-not-allowed disabled:bg-safi-panel disabled:text-safi-steel"
            >
              <ShoppingBag className="h-5 w-5" />
              {size && totalForSize === 0 ? 'Out of stock in this size' : 'Add to bag'}
            </button>
            <button
              onClick={() => tryAdd(true)}
              disabled={!!size && totalForSize === 0}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-safi-ice/40 py-4 font-display text-lg font-bold uppercase italic tracking-wider text-safi-ice transition-colors hover:bg-safi-ice hover:text-safi-black disabled:cursor-not-allowed disabled:border-safi-line disabled:text-safi-steel"
            >
              <Zap className="h-5 w-5" /> Buy now
            </button>
            <a
              href={waLink(waText, contact.whatsapp)}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackContact('pdp-sizing')}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-safi-line py-3 text-xs font-semibold uppercase tracking-[0.2em] text-safi-steel transition-colors hover:border-safi-red hover:text-safi-red"
            >
              <MessageCircle className="h-4 w-4" /> Not sure about size? WhatsApp us
            </a>
          </div>

          {/* delivery / exchange */}
          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="delivery" className="border-safi-line">
              <AccordionTrigger className="py-3 text-sm font-semibold text-safi-ice hover:no-underline">
                <span className="flex items-center gap-2.5">
                  <Truck className="h-4 w-4 text-safi-red" /> Delivery
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-safi-steel">
                Delivery available across Lebanon, or free pickup from El Mina or Dam w Farez.
                Cash on delivery supported. If your size sits in the other branch, we move it —
                usually ready within 24 hours.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="exchange" className="border-safi-line">
              <AccordionTrigger className="py-3 text-sm font-semibold text-safi-ice hover:no-underline">
                <span className="flex items-center gap-2.5">
                  <RefreshCcw className="h-4 w-4 text-safi-red" /> Exchange
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-safi-steel">
                Wrong size? Exchange at either branch — just bring the item unused with its tag.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="stock" className="border-safi-line">
              <AccordionTrigger className="py-3 text-sm font-semibold text-safi-ice hover:no-underline">
                <span className="flex items-center gap-2.5">
                  <Package className="h-4 w-4 text-safi-red" /> Branch stock promise
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-safi-steel">
                The numbers above are the same stock counters both branches work from — what you
                see is what's on the shelf.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="mt-16">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-display text-3xl font-extrabold uppercase italic text-safi-ice">
              Complete the kit
            </h2>
            <button
              onClick={() => nav('/shop')}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice"
            >
              Shop all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* size guide dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="border-safi-line bg-safi-black">
          <h3 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">
            Size guide
          </h3>
          <p className="text-xs text-safi-steel">
            {isShoe ? 'EU shoe sizing by foot length' : 'Menswear chest measurements'}
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-safi-line text-left text-[10px] uppercase tracking-[0.2em] text-safi-steel">
                <th className="py-2">Size</th>
                <th>{isShoe ? 'Foot length' : 'Fits chest'}</th>
              </tr>
            </thead>
            <tbody>
              {(isShoe ? SIZE_GUIDE.shoe : SIZE_GUIDE.apparel).map(([s, m]) => (
                <tr key={s} className="border-b border-safi-line/50 text-safi-ice">
                  <td className="py-2.5 font-display text-lg font-bold italic">{s}</td>
                  <td className="text-safi-steel">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-safi-steel">
            Between sizes?{' '}
            <a
              href={waLink(waText, contact.whatsapp)}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackContact('size-guide')}
              className="font-semibold text-safi-red underline underline-offset-4"
            >
              Ask us on WhatsApp
            </a>{' '}
            — we answer fast.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
