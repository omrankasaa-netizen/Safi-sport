import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Banknote, MapPin, Package, Store as StoreIcon, Truck } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { ProductImage } from '@/components/Product';
import { api } from '@/lib/apiClient';
import { BRANCHES, resolveStoreContact } from '@/lib/branches';
import { trpc } from '@/providers/trpc';
import { setPageMeta } from '@/lib/seo';
import {
  genEventId,
  trackInitiateCheckout,
  updateAdvancedMatching,
} from '@/lib/metaPixel';

const CITIES = ['Tripoli', 'El Mina', 'Beirut', 'Jbeil', 'Batroun', 'Zgharta', 'Saida', 'Other'];

/** Normalise a Lebanese phone to E.164 (+961…). Accepts local 0X / 7X forms. */
export function toE164(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('961')) return `+${digits}`;
  return `+961${digits.replace(/^0+/, '')}`;
}

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const nav = useNavigate();
  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const contact = resolveStoreContact(settingsQ.data);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Tripoli');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [company, setCompany] = useState(''); // honeypot — never visible
  const [fulfilment, setFulfilment] = useState('delivery'); // 'delivery' | 'pickup-elmina' | 'pickup-dam'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const deliveryFee = fulfilment === 'delivery' ? contact.deliveryFeeCents / 100 : 0;
  const grand = subtotal + deliveryFee;

  useEffect(() => {
    setPageMeta({ title: 'Fast Checkout', path: '/checkout' });
    if (items.length) trackInitiateCheckout({ items, value: grand });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(
    () => items.length > 0 && !submitting,
    [items.length, submitting],
  );

  const submit = async () => {
    if (!canSubmit) return;
    const e164 = toE164(phone);
    if (!name.trim() || !/^\+[1-9]\d{6,14}$/.test(e164)) {
      setError('Name and a valid phone number are needed to confirm a COD order.');
      return;
    }
    if (fulfilment === 'delivery' && !address.trim()) {
      setError('Delivery address is required for home delivery.');
      return;
    }
    setError('');
    setSubmitting(true);

    // Meta advanced matching from checkout contact data (hashed only).
    const [firstName, ...rest] = name.trim().split(/\s+/);
    void updateAdvancedMatching({
      phone: e164,
      firstName,
      lastName: rest.join(' ') || undefined,
      city,
      country: 'lb',
    });
    const metaEventId = genEventId();

    try {
      const input = {
        fullName: name.trim(),
        phone: e164,
        fulfilment: fulfilment === 'delivery' ? 'delivery' : 'pickup',
        pickupBranchCode:
          fulfilment === 'pickup-dam' ? 'dam' : fulfilment === 'pickup-elmina' ? 'elmina' : undefined,
        address: fulfilment === 'delivery' ? address.trim() : undefined,
        area: fulfilment === 'delivery' ? city : undefined,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({ variantId: Number(i.variantId), qty: i.quantity })),
        metaEventId,
        company: company || undefined, // honeypot
      };
      let result;
      try {
        result = await api.checkout.create.mutate(input);
      } catch (e) {
        // Fall back to orders.create if the checkout namespace isn't deployed yet.
        result = await api.orders.create.mutate(input);
      }
      const orderId = result?.orderId ?? result?.id ?? null;
      const orderNumber = result?.orderNumber ?? result?.order?.orderNumber ?? null;
      clear();
      nav(`/order/${orderNumber ?? orderId ?? 'confirmed'}`, {
        state: {
          orderNumber,
          orderId,
          metaEventId,
          fulfilment,
          totalCents: Math.round(grand * 100),
          items: items.map((i) => ({
            productName: i.productName,
            image: i.image,
            color: i.color,
            size: i.size,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            variantId: i.variantId,
          })),
          deliveryFeeCents: Math.round(deliveryFee * 100),
        },
      });
      window.scrollTo(0, 0);
    } catch (e) {
      setError(
        e?.message?.includes('stock')
          ? 'One of these items just sold out — refresh the product page and try again.'
          : 'Could not place the order. Please try again or WhatsApp us and we will take it manually.',
      );
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <Package className="mx-auto h-8 w-8 text-safi-steel" />
        <p className="mt-3 font-display text-2xl font-bold uppercase italic text-safi-steel">
          Your bag is empty
        </p>
        <button
          onClick={() => nav('/shop')}
          className="mt-4 text-sm font-semibold text-safi-red underline underline-offset-4"
        >
          Back to the shop
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
        Guest checkout
      </p>
      <h1 className="mt-1 font-display text-5xl font-extrabold uppercase italic leading-none text-safi-ice">
        Fast Checkout
      </h1>
      <p className="mt-2 text-xs text-safi-steel">
        No account. No card. Cash on delivery — the way Lebanon shops.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-7">
          {/* contact */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold uppercase italic tracking-wide text-safi-ice">
              01 — Your details
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
                className="rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (e.g. 70 123 456)"
                inputMode="tel"
                autoComplete="tel"
                className="rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
              />
            </div>
            {/* honeypot — invisible to humans, bots fill it and get a fake success */}
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
              placeholder="Company"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the courier (optional)"
              rows={2}
              className="mt-3 w-full rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
            />
          </section>

          {/* fulfilment */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold uppercase italic tracking-wide text-safi-ice">
              02 — How do you want it?
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {[
                ['delivery', 'Home delivery', `Across Lebanon · ${money(deliveryFee || 3)}`, Truck],
                ['pickup-elmina', 'Pick up — El Mina', 'Free · ready today', StoreIcon],
                ['pickup-dam', 'Pick up — Dam w Farez', 'Free · ready today', StoreIcon],
              ].map(([id, label, note, Icon]) => (
                <button
                  key={id}
                  onClick={() => setFulfilment(id)}
                  className={`rounded-sm border p-4 text-left transition-colors ${
                    fulfilment === id
                      ? 'border-safi-red bg-safi-red/10'
                      : 'border-safi-line hover:border-safi-steel'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${fulfilment === id ? 'text-safi-red' : 'text-safi-steel'}`} />
                  <p className="mt-2 font-display text-base font-bold uppercase italic leading-tight text-safi-ice">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-safi-steel">{note}</p>
                </button>
              ))}
            </div>

            {fulfilment === 'delivery' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice focus:border-safi-red focus:outline-none"
                >
                  {CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, building, floor…"
                  autoComplete="street-address"
                  className="rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
                />
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2.5 rounded-sm border border-safi-line bg-safi-graphite/50 p-3.5 text-xs leading-relaxed text-safi-steel">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-safi-red" />
                <span>
                  {BRANCHES[fulfilment === 'pickup-elmina' ? 'elmina' : 'dam'].name} branch, Tripoli
                  · Open daily 10:00 – 20:30. If your size is at the other branch, we transfer it —
                  you'll get a WhatsApp when it's ready.
                </span>
              </div>
            )}
          </section>

          {/* payment */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold uppercase italic tracking-wide text-safi-ice">
              03 — Payment
            </h2>
            <div className="flex items-center gap-3 rounded-sm border border-safi-red bg-safi-red/10 p-4">
              <Banknote className="h-6 w-6 text-safi-red" />
              <div>
                <p className="font-display text-base font-bold uppercase italic text-safi-ice">
                  Cash on delivery
                </p>
                <p className="text-[11px] text-safi-steel">
                  Pay cash when you receive it, or at the branch counter. Card/online payments plug
                  in later — not needed to launch.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="h-fit rounded-sm border border-safi-line bg-safi-graphite/50 p-5">
          <h2 className="font-display text-lg font-bold uppercase italic tracking-wide text-safi-ice">
            Order summary
          </h2>
          <div className="mt-4 space-y-3">
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-3">
                <ProductImage src={it.image} alt="" className="h-12 w-12 rounded-sm object-cover" />
                <div className="flex-1">
                  <p className="font-display text-sm font-bold uppercase italic leading-tight text-safi-ice">
                    {it.productName}
                  </p>
                  <p className="text-[11px] text-safi-steel">
                    {it.color} · {it.size} × {it.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold">{money(it.unitPrice * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-safi-line pt-4 text-sm">
            <div className="flex justify-between text-safi-steel">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-safi-steel">
              <span>{fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
              <span>{deliveryFee === 0 ? 'Free' : money(deliveryFee)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-xs uppercase tracking-[0.2em] text-safi-steel">Total (COD)</span>
              <span className="font-display text-2xl font-extrabold italic text-safi-ice">
                {money(grand)}
              </span>
            </div>
          </div>
          {error && <p className="mt-3 text-xs font-semibold text-safi-red">{error}</p>}
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-safi-red py-4 font-display text-lg font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep disabled:cursor-not-allowed disabled:bg-safi-panel disabled:text-safi-steel"
          >
            {submitting ? 'Placing order…' : `Place order — ${money(grand)}`}
            {!submitting && <ArrowRight className="h-5 w-5" />}
          </button>
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.25em] text-safi-steel">
            Cash on delivery · no card needed
          </p>
        </aside>
      </div>
    </main>
  );
}
