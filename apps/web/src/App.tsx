import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth-context';
import { AppShell, LoadingState } from './components/app-shell';
import { AuthPage } from './pages/auth-page';
import { DashboardPage } from './pages/dashboard-page';
import { ProductsPage } from './pages/products-page';
import { ProductDetailPage } from './pages/product-detail-page';
import { OperationsPage } from './pages/operations-page';
import { LedgerPage } from './pages/ledger-page';
import { SettingsPage } from './pages/settings-page';
import { ProfilePage } from './pages/profile-page';
import { ReplenishmentPage } from './pages/replenishment-page';

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="screen-center"><LoadingState /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/products" element={<ProductsPage />} />
    <Route path="/products/:id" element={<ProductDetailPage />} />
    <Route path="/operations/:kind" element={<OperationsPage />} />
    <Route path="/ledger" element={<LedgerPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/replenishment" element={user.role === 'MANAGER' ? <ReplenishmentPage /> : <Navigate to="/" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppShell>;
}

export function App() {
  return <Routes><Route path="/login" element={<AuthPage />} /><Route path="/*" element={<ProtectedApp />} /></Routes>;
}

