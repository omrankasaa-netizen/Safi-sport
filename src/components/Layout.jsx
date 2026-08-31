import React from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header, CartDrawer, Footer } from '@/components/Chrome';
import ConsentBanner from '@/components/ConsentBanner';
import { trackPageView } from '@/lib/metaPixel';

/** Fires a deduplicated Meta PageView (browser + CAPI twin) on every
 * client-side route change — Meta requires PageView on every page. */
function RoutePageViewTracker() {
  const { pathname, search } = useLocation();
  React.useEffect(() => {
    trackPageView();
  }, [pathname, search]);
  return null;
}

/**
 * SAFI storefront chrome: red service strip + header, cart drawer, footer,
 * consent banner. Admin routes (/admin/*) render through their own layout.
 */
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-safi-black text-safi-ice">
      <ScrollToTop />
      <Header />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
      <CartDrawer />
      <ConsentBanner />
      <RoutePageViewTracker />
    </div>
  );
}
