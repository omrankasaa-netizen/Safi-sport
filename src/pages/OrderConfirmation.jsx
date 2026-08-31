import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';
import { ProductImage } from '@/components/Product';
import { resolveStoreContact, waLink } from '@/lib/branches';
import { trpc } from '@/providers/trpc';
import { setPageMeta } from '@/lib/seo';
import { notifyPurchase, trackPurchasePixel } from '@/lib/metaPixel';

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;

export default function OrderConfirmation() {
  const { orderNumber: param } = useParams();
  const { state } = useLocation();
  const nav = useNavigate();
  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const contact = resolveStoreContact(settingsQ.data);
  const tracked = useRef(false);

  const orderNumber = state?.orderNumber ?? (param !== 'confirmed' ? param : null);
  const items = state?.items ?? [];
  const fulfilment = state?.fulfilment ?? 'delivery';
  const totalCents = state?.totalCents ?? 0;

  // Fire the browser Purchase twin + notify the server CAPI twin exactly once.
  useEffect(() => {
    setPageMeta({ title: 'Order confirmed', path: '/order' });
    if (tracked.current) return;
    tracked.current = true;
    if (state?.metaEventId && totalCents > 0) {
      trackPurchasePixel({
        eventId: state.metaEventId,
        value: totalCents / 100,
        currency: 'USD',
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      if (state?.orderId) {
        void notifyPurchase({ orderId: state.orderId, eventId: state.metaEventId });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-14">
      <div className="rounded-sm border border-safi-line bg-safi-graphite/50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-steel">
          Order received — pay on {fulfilment === 'delivery' ? 'delivery' : 'pickup'}
        </p>
        <h1 className="mt-2 font-display text-5xl font-extrabold uppercase italic text-safi-ice">
          {orderNumber ?? 'Thank you'}
        </h1>
        <p className="mt-3 text-sm text-safi-steel">
          {fulfilment === 'delivery' ? 'Home delivery' : 'Branch pickup'} · Cash on delivery
          {totalCents > 0 && (
            <>
              {' '}
              · <span className="text-safi-ice">{money(totalCents)}</span>
            </>
          )}
        </p>

        {items.length > 0 && (
          <div className="mt-6 space-y-2 text-left">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-safi-line/60 pb-2">
                <ProductImage src={it.image} alt="" className="h-12 w-12 rounded-sm object-cover" />
                <div className="flex-1">
                  <p className="font-display text-sm font-bold uppercase italic text-safi-ice">
                    {it.productName}
                  </p>
                  <p className="text-[11px] text-safi-steel">
                    {it.color} · Size {it.size} × {it.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  ${(it.unitPrice * it.quantity).toFixed(2).replace(/\.00$/, '')}
                </span>
              </div>
            ))}
          </div>
        )}

        <a
          href={waLink(
            `Hi SAFI SPORT! I just placed order ${orderNumber ?? ''} and have a question.`,
            contact.whatsapp,
          )}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm border border-safi-line py-3 text-xs font-semibold uppercase tracking-[0.2em] text-safi-ice transition-colors hover:border-safi-red hover:text-safi-red"
        >
          <MessageCircle className="h-4 w-4" /> Questions? WhatsApp us
        </a>
        <button
          onClick={() => nav('/track')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-safi-red py-4 font-display text-lg font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep"
        >
          Track this order <ArrowRight className="h-5 w-5" />
        </button>
        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-safi-steel">
          Keep your order number — you'll need it for tracking
        </p>
      </div>
    </main>
  );
}
