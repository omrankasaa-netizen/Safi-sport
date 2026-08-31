import { lazy } from 'react';

/**
 * SAFI storefront route table. src/App.jsx spreads this inside the
 * `<Route element={<Layout />}>` group:
 *
 *   import { storefrontRoutes } from '@/pages/storefrontRoutes';
 *   ...
 *   <Route element={<Layout />}>
 *     {storefrontRoutes.map((r) => (
 *       <Route key={r.path} path={r.path} element={r.element} />
 *     ))}
 *   </Route>
 *
 * The storefront agent owns these pages; the admin agent owns App.jsx and
 * everything under /admin.
 */
const Home = lazy(() => import('@/pages/Home'));
const Shop = lazy(() => import('@/pages/Shop'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const OrderConfirmation = lazy(() => import('@/pages/OrderConfirmation'));
const TrackOrder = lazy(() => import('@/pages/TrackOrder'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export const storefrontRoutes = [
  { path: '/', element: <Home /> },
  { path: '/shop', element: <Shop /> },
  { path: '/product/:slug', element: <ProductPage /> },
  { path: '/checkout', element: <Checkout /> },
  { path: '/order/:orderNumber', element: <OrderConfirmation /> },
  { path: '/track', element: <TrackOrder /> },
  { path: '*', element: <NotFound /> },
];

export default storefrontRoutes;
