import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ShoppingBag, Menu, X, Trash2, ArrowRight, MessageCircle } from 'lucide-react';
import { LogoMark } from './Logo';
import { ProductImage } from './Product';
import { useCart } from '@/lib/cart';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BRANCHES, BRANCH_LIST, INSTAGRAM, INSTAGRAM_HANDLE, resolveStoreContact, waLink } from '@/lib/branches';
import { trackContact } from '@/lib/metaPixel';
import { trpc } from '@/providers/trpc';
import { formatPrice } from '@/lib/branches';

export function Header() {
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();

  const links = [
    { label: 'Shop All', to: '/shop' },
    { label: 'Men', to: '/shop?audience=men' },
    { label: 'Kids', to: '/shop?audience=kids' },
    { label: 'Shoes', to: '/shop?category=shoes' },
    { label: 'Branches', to: '/#branches' },
    { label: 'Track Order', to: '/track' },
  ];

  return (
    <>
      {/* service strip */}
      <div className="bg-safi-red px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-white">
        Cash on delivery · Delivery across Lebanon · Two branches in Tripoli
      </div>
      <header className="sticky top-0 z-40 border-b border-safi-line bg-safi-black/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button className="text-safi-ice lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="shrink-0" aria-label="SAFI SPORT home">
            <LogoMark size="md" />
          </Link>
          <nav className="hidden items-center gap-7 lg:flex">
            {links.map((l) => (
              <button
                key={l.label}
                onClick={() => nav(l.to)}
                className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-safi-steel transition-colors hover:text-safi-ice"
              >
                {l.label}
              </button>
            ))}
          </nav>
          <button className="relative text-safi-ice" onClick={() => setOpen(true)} aria-label="Cart">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-safi-red px-1 text-[9px] font-bold text-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* mobile menu */}
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-72 border-safi-line bg-safi-black p-0">
          <div className="flex items-center justify-between border-b border-safi-line px-5 py-4">
            <LogoMark size="sm" />
            <button onClick={() => setMenu(false)} aria-label="Close">
              <X className="h-5 w-5 text-safi-steel" />
            </button>
          </div>
          <nav className="flex flex-col px-5 py-4">
            {links.map((l, i) => (
              <button
                key={l.label}
                onClick={() => {
                  setMenu(false);
                  nav(l.to);
                }}
                className="border-b border-safi-line/60 py-4 text-left font-display text-2xl font-bold uppercase italic tracking-wide text-safi-ice"
              >
                <span className="mr-3 text-xs not-italic text-safi-red">0{i + 1}</span>
                {l.label}
              </button>
            ))}
          </nav>
          <div className="px-5 pt-6 text-xs text-safi-steel">
            <p>El Mina · Dam w Farez</p>
            <p className="mt-1">Open daily 10:00 – 20:30</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function CartDrawer() {
  const { items, open, setOpen, removeItem, updateQty, subtotal } = useCart();
  const nav = useNavigate();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full max-w-md flex-col border-safi-line bg-safi-black p-0">
        <div className="flex items-center justify-between border-b border-safi-line px-5 py-4">
          <h2 className="font-display text-xl font-bold uppercase italic tracking-wide">
            Your Bag <span className="text-safi-red">({items.length})</span>
          </h2>
          <button onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-5 w-5 text-safi-steel" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ShoppingBag className="mb-3 h-8 w-8 text-safi-steel" />
              <p className="font-display text-lg font-semibold uppercase tracking-wide text-safi-steel">
                Bag is empty
              </p>
              <button
                onClick={() => setOpen(false)}
                className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-safi-red"
              >
                Continue shopping
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((it) => (
                <li key={it.key} className="flex gap-3 border-b border-safi-line/60 pb-4">
                  <ProductImage
                    src={it.image}
                    alt={it.productName}
                    className="h-20 w-20 rounded-sm object-cover"
                  />
                  <div className="flex-1">
                    <p className="font-display text-base font-bold uppercase italic leading-tight">
                      {it.productName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-safi-steel">
                      {it.color} · Size {it.size}
                    </p>
                    {it.branchCode && BRANCHES[it.branchCode] && (
                      <p className="text-[11px] text-safi-steel">
                        Pickup branch:{' '}
                        <span className="text-safi-ice">{BRANCHES[it.branchCode].name}</span>
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3">
                      <div className="flex items-center rounded-sm border border-safi-line">
                        <button
                          onClick={() => updateQty(it.key, it.quantity - 1)}
                          className="px-2 py-0.5 text-safi-steel hover:text-safi-ice"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center text-sm font-semibold">
                          {it.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(it.key, it.quantity + 1)}
                          className="px-2 py-0.5 text-safi-steel hover:text-safi-ice"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-semibold">
                        ${(it.unitPrice * it.quantity).toFixed(2).replace(/\.00$/, '')}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => removeItem(it.key)} aria-label="Remove">
                    <Trash2 className="h-4 w-4 text-safi-steel hover:text-safi-red" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-safi-line px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-safi-steel">Subtotal</span>
              <span className="font-display text-2xl font-extrabold italic">
                ${subtotal.toFixed(2).replace(/\.00$/, '')}
              </span>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                nav('/checkout');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-safi-red py-3.5 font-display text-lg font-bold uppercase italic tracking-wider text-white transition-colors hover:bg-safi-reddeep"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.25em] text-safi-steel">
              Cash on delivery · pickup or home delivery
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Footer() {
  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const contact = resolveStoreContact(settingsQ.data);

  return (
    <footer className="border-t border-safi-line bg-safi-black">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <LogoMark size="lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-safi-steel">
              Sportswear for adults and kids — shoes, training, jackets and hoodies. Two branches
              in Tripoli, one connected store.
            </p>
          </div>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em] text-safi-ice">
              Branches
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-safi-steel">
              {BRANCH_LIST.map((b) => (
                <li key={b.code}>
                  <span className="text-safi-ice">{b.name}</span> — {b.area} · {b.phone}
                  <br />
                  <span className="text-xs">
                    Open daily · {contact.hours ?? b.hours}
                  </span>
                </li>
              ))}
            </ul>
            <a
              href={waLink('Hi SAFI SPORT!', contact.whatsapp)}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackContact('footer-whatsapp')}
              className="mt-4 inline-flex items-center gap-2 text-sm text-safi-steel underline-offset-4 hover:text-safi-ice hover:underline"
            >
              <MessageCircle className="h-4 w-4 text-safi-red" /> WhatsApp {contact.whatsapp}
            </a>
          </div>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em] text-safi-ice">
              Follow
            </h3>
            <a
              href={contact.instagram}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-safi-steel underline-offset-4 hover:text-safi-ice hover:underline"
            >
              {INSTAGRAM_HANDLE} on Instagram
            </a>
            <div className="mt-5 flex gap-2">
              <Link
                to="/track"
                className="rounded-sm border border-safi-line px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-safi-steel hover:border-safi-ice hover:text-safi-ice"
              >
                Track your order
              </Link>
              <Link
                to="/admin/login"
                className="rounded-sm border border-safi-line px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-safi-steel hover:border-safi-ice hover:text-safi-ice"
              >
                Staff login
              </Link>
            </div>
            <p className="mt-6 text-[11px] leading-relaxed text-safi-steel/70">
              Cash on delivery across Lebanon. One connected inventory — if one branch has it, you
              can get it.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
