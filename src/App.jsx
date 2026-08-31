import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Route, Routes } from 'react-router';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { I18nProvider } from '@/lib/i18n';
import { CartProvider } from '@/lib/cart';
import Layout from '@/components/Layout';
import AdminGuard from '@/components/AdminGuard';
import { storefrontRoutes } from '@/pages/storefrontRoutes';

// Route-level code splitting: the storefront and the admin back office ship
// as separate chunks, so a shopper never downloads the admin bundle.
const AdminLogin = lazy(() => import('@/pages/admin/Login'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminOrders = lazy(() => import('@/pages/admin/AdminOrders'));
const AdminProducts = lazy(() => import('@/pages/admin/AdminProducts'));
const AdminInventory = lazy(() => import('@/pages/admin/AdminInventory'));
const AdminTransfers = lazy(() => import('@/pages/admin/AdminTransfers'));
const AdminCustomers = lazy(() => import('@/pages/admin/AdminCustomers'));
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));

const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-safi-black">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-safi-panel border-t-safi-red"></div>
  </div>
);

const AuthenticatedApp = () => (
  <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* SAFI storefront (src/pages/storefrontRoutes.jsx, includes 404) */}
      <Route element={<Layout />}>
        {storefrontRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Route>

      {/* Admin back office */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminGuard minRole="viewer"><AdminDashboard /></AdminGuard>} />
      <Route path="/admin/orders" element={<AdminGuard minRole="staff"><AdminOrders /></AdminGuard>} />
      <Route path="/admin/products" element={<AdminGuard minRole="staff"><AdminProducts /></AdminGuard>} />
      <Route path="/admin/inventory" element={<AdminGuard minRole="staff"><AdminInventory /></AdminGuard>} />
      <Route path="/admin/transfers" element={<AdminGuard minRole="staff"><AdminTransfers /></AdminGuard>} />
      <Route path="/admin/customers" element={<AdminGuard minRole="manager"><AdminCustomers /></AdminGuard>} />
      <Route path="/admin/reports" element={<AdminGuard minRole="manager"><AdminReports /></AdminGuard>} />
      <Route path="/admin/users" element={<AdminGuard minRole="owner"><AdminUsers /></AdminGuard>} />
      <Route path="/admin/settings" element={<AdminGuard minRole="owner"><AdminSettings /></AdminGuard>} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <CartProvider>
          <ScrollToTop />
          <AuthenticatedApp />
        </CartProvider>
      </I18nProvider>
      <Toaster />
    </AuthProvider>
  );
}

export default App;
