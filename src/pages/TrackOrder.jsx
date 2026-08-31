import { useEffect, useState } from 'react';
import { Search, Package, Truck, Store as StoreIcon, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { setPageMeta } from '@/lib/seo';
import { toE164 } from '@/pages/Checkout';

const STATUS_STEPS = ['new', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
const STATUS_LABELS = {
  new: 'Received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;

export default function TrackOrder() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    setPageMeta({ title: 'Track your order', path: '/track' });
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) {
      setError('Enter your order number and the phone you ordered with.');
      return;
    }
    setError('');
    setLoading(true);
    setOrder(null);
    try {
      const result = await api.orders.track.mutate({
        orderNumber: orderNumber.trim(),
        phone: toE164(phone),
      });
      setOrder(result?.order ?? result ?? null);
      if (!(result?.order ?? result)) setError('No order found for that number and phone.');
    } catch {
      setError('No order found for that number and phone. Check both and try again.');
    } finally {
      setLoading(false);
    }
  };

  const status = order?.status ?? 'new';
  const stepIdx = STATUS_STEPS.indexOf(status);

  return (
    <main className="mx-auto max-w-xl px-4 py-14">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-safi-red">
        SAFI SPORT
      </p>
      <h1 className="mt-1 font-display text-5xl font-extrabold uppercase italic leading-none text-safi-ice">
        Track Order
      </h1>
      <p className="mt-2 text-xs text-safi-steel">
        Your order number (SF-…) and the phone number you ordered with.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Order number (e.g. SF-0001)"
          className="w-full rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (e.g. 70 123 456)"
          inputMode="tel"
          className="w-full rounded-sm border border-safi-line bg-safi-graphite px-4 py-3 text-sm text-safi-ice placeholder:text-safi-steel/60 focus:border-safi-red focus:outline-none"
        />
        {error && <p className="text-xs font-semibold text-safi-red">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-safi-red py-3.5 font-display text-lg font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep disabled:bg-safi-panel disabled:text-safi-steel"
        >
          <Search className="h-4 w-4" /> {loading ? 'Checking…' : 'Find my order'}
        </button>
      </form>

      {order && (
        <div className="mt-8 rounded-sm border border-safi-line bg-safi-graphite/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">
              {order.orderNumber}
            </h2>
            <span className="rounded-sm bg-safi-red/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-safi-red">
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>

          {status !== 'cancelled' && status !== 'returned' ? (
            <ol className="mt-5 space-y-3">
              {(order.fulfilment === 'pickup'
                ? ['new', 'confirmed', 'preparing', 'ready_for_pickup', 'delivered']
                : ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']
              ).map((s, i) => {
                const reached = stepIdx >= STATUS_STEPS.indexOf(s);
                const Icon =
                  s === 'ready_for_pickup' ? StoreIcon : s === 'out_for_delivery' ? Truck : s === 'delivered' ? CheckCircle2 : Package;
                return (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                        reached ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel/50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`text-sm font-semibold ${reached ? 'text-safi-ice' : 'text-safi-steel/50'}`}
                    >
                      {STATUS_LABELS[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-safi-steel">
              This order was {status}. WhatsApp us if that looks wrong.
            </p>
          )}

          {Array.isArray(order.items) && order.items.length > 0 && (
            <div className="mt-5 space-y-1.5 border-t border-safi-line pt-4 text-sm">
              {order.items.map((it, i) => (
                <div key={i} className="flex justify-between text-safi-steel">
                  <span>
                    {it.productName ?? it.name} · {it.color} · {it.size} × {it.qty ?? it.quantity}
                  </span>
                  <span className="text-safi-ice">
                    {money((it.unitPriceCents ?? 0) * (it.qty ?? it.quantity ?? 1))}
                  </span>
                </div>
              ))}
              {order.totalCents != null && (
                <div className="flex justify-between pt-1">
                  <span className="text-xs uppercase tracking-[0.2em] text-safi-steel">Total</span>
                  <span className="font-display text-xl font-extrabold italic text-safi-ice">
                    {money(order.totalCents)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
