import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './auth-context';
import { AppShell, LoadingState } from './components/app-shell';
import { AuthPage } from './pages/auth-page';
import { ProductsPage } from './pages/products-page';
import { ProductDetailPage } from './pages/product-detail-page';
import { OperationsPage } from './pages/operations-page';
import { LedgerPage } from './pages/ledger-page';
import { SettingsPage } from './pages/settings-page';
import { ProfilePage } from './pages/profile-page';
import { ReplenishmentPage } from './pages/replenishment-page';
import { StaffWorkspacePage } from './pages/staff-workspace-page';
import { StaffPickingPage } from './pages/staff-picking-page';
import { StaffPackingPage } from './pages/staff-packing-page';
import { StaffReceivingPage } from './pages/staff-receiving-page';
import { StaffTransfersPage } from './pages/staff-transfers-page';
import { StaffCountingPage } from './pages/staff-counting-page';

const DashboardPage = lazy(() => import('./pages/dashboard-page').then(module => ({ default: module.DashboardPage })));
const AiPage = lazy(() => import('./pages/ai-page').then(module => ({ default: module.AiPage })));

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="screen-center"><LoadingState /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const isManager = user.role === 'MANAGER';
  const homeRedirect = isManager ? '/dashboard' : '/staff';

  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}><Routes>
        <Route path="/" element={<Navigate to={homeRedirect} replace />} />
        
        {/* Manager-only routes */}
        <Route path="/ai" element={isManager ? <AiPage /> : <Navigate to="/staff" replace />} />
        <Route path="/dashboard" element={isManager ? <DashboardPage /> : <Navigate to="/staff" replace />} />
        <Route path="/products" element={isManager ? <ProductsPage /> : <Navigate to="/staff" replace />} />
        <Route path="/products/:id" element={isManager ? <ProductDetailPage /> : <Navigate to="/staff" replace />} />
        <Route path="/replenishment" element={isManager ? <ReplenishmentPage /> : <Navigate to="/staff" replace />} />
        <Route path="/settings" element={isManager ? <SettingsPage /> : <Navigate to="/staff" replace />} />

        {/* Staff routes */}
        <Route path="/staff" element={!isManager ? <StaffWorkspacePage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/staff/picking" element={<StaffPickingPage />} />
        <Route path="/staff/packing" element={<StaffPackingPage />} />
        <Route path="/staff/receiving" element={<StaffReceivingPage />} />
        <Route path="/staff/transfers" element={<StaffTransfersPage />} />
        <Route path="/staff/counting" element={<StaffCountingPage />} />

        {/* Shared operational & profile routes */}
        <Route path="/operations/:kind" element={<OperationsPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="*" element={<Navigate to={homeRedirect} replace />} />
      </Routes></Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}
