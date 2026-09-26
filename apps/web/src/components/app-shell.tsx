import { AlertTriangle, ArrowRight, Bell, Boxes, ChevronDown, ClipboardList, Gauge, LogOut, Menu, PackageCheck, PackageSearch, RotateCw, Settings, SlidersHorizontal, Sparkles, Truck, UserRound, Warehouse, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth-context';
import { api, formatQuantity } from '../lib/api';
import type { Product } from '../types';

const managerNavigation = [
  { to: '/dashboard', label: 'Control center', icon: Gauge },
  { to: '/ai', label: 'StockSense AI', icon: Sparkles },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/replenishment', label: 'Replenishment', icon: RotateCw },
  { to: '/operations/receipts', label: 'Receipts', icon: PackageSearch },
  { to: '/operations/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/operations/transfers', label: 'Internal transfers', icon: Warehouse },
  { to: '/operations/adjustments', label: 'Adjustments', icon: Settings },
  { to: '/ledger', label: 'Stock ledger', icon: ClipboardList },
  { to: '/settings', label: 'Inventory setup', icon: SlidersHorizontal },
];

const staffNavigation = [
  { to: '/staff', label: 'Staff Workspace', icon: Gauge },
  { to: '/staff/picking', label: 'Picking', icon: PackageSearch },
  { to: '/staff/packing', label: 'Packing & Dispatch', icon: PackageCheck },
  { to: '/staff/receiving', label: 'Receiving & Shelving', icon: Truck },
  { to: '/staff/transfers', label: 'Internal transfers', icon: Warehouse },
  { to: '/staff/counting', label: 'Inventory counting', icon: ClipboardList },
  { to: '/ledger', label: 'Move history', icon: ClipboardList },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem('low_stock_banner_dismissed') === '1'
  );

  const alertsQuery = useQuery({
    queryKey: ['low-stock-notifications'],
    queryFn: () => api<Product[]>('/products'),
    staleTime: 30000,
    refetchInterval: 45000,
  });

  const lowStockAlerts = (alertsQuery.data || []).filter(
    (product) => product.stockStatus === 'LOW_STOCK' || product.stockStatus === 'OUT_OF_STOCK'
  );

  const navItems = user?.role === 'MANAGER' ? managerNavigation : staffNavigation;

  return (
    <div className="app-frame">
      <button className="mobile-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button>
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><span /></div>
          <div className="brand-title"><strong>StockSense</strong><small>{user?.role === 'MANAGER' ? 'Manager Portal' : 'Warehouse Staff'}</small></div>
          <div className="notif-anchor">
            <button
              type="button"
              className={`sidebar-notif-btn ${lowStockAlerts.length > 0 ? 'has-alerts' : ''}`}
              aria-label={`Low stock notifications (${lowStockAlerts.length} alerts)`}
              title="Low Stock Notifications"
              onClick={() => setNotifOpen((value) => !value)}
            >
              <Bell size={17} />
              {lowStockAlerts.length > 0 && <span className="notif-badge">{lowStockAlerts.length}</span>}
            </button>
            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <div className="notif-dropdown-title">
                    <AlertTriangle size={15} />
                    <strong>Low Stock Alerts</strong>
                  </div>
                  <span className="notif-pill">{lowStockAlerts.length}</span>
                </div>
                <div className="notif-dropdown-list">
                  {lowStockAlerts.length === 0 ? (
                    <div className="notif-empty">
                      <p>All stock levels are healthy.</p>
                    </div>
                  ) : (
                    lowStockAlerts.map((product) => (
                      <Link
                        key={product.id}
                        to={user?.role === 'MANAGER' ? `/products/${product.id}` : '/products'}
                        className="notif-item"
                        onClick={() => { setNotifOpen(false); setOpen(false); }}
                      >
                        <div className={`notif-status-dot ${product.stockStatus === 'OUT_OF_STOCK' ? 'dot-red' : 'dot-amber'}`} />
                        <div className="notif-item-body">
                          <strong>{product.name}</strong>
                          <small>
                            SKU: {product.sku} ·{' '}
                            <span className={product.stockStatus === 'OUT_OF_STOCK' ? 'text-danger' : 'text-warning'}>
                              {product.stockStatus === 'OUT_OF_STOCK' ? 'Out of stock (0)' : `Low: ${formatQuantity(product.totalStock, product.unit?.symbol)}`}
                            </span>
                          </small>
                        </div>
                        <ArrowRight size={13} />
                      </Link>
                    ))
                  )}
                </div>
                {lowStockAlerts.length > 0 && user?.role === 'MANAGER' && (
                  <div className="notif-dropdown-footer">
                    <Link
                      to="/replenishment"
                      className="button compact full"
                      onClick={() => { setNotifOpen(false); setOpen(false); }}
                    >
                      Open Replenishment
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/dashboard' || to === '/staff'} onClick={() => setOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="avatar">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
          <button className="profile-trigger" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}><span className="profile-copy"><strong>{user?.name}</strong><small>{user?.role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'}</small></span><ChevronDown size={15} /></button>
        </div>
        {profileOpen && <div className="profile-menu"><NavLink to="/profile" onClick={() => { setProfileOpen(false); setOpen(false); }}><UserRound size={16} /> My Profile</NavLink><button onClick={() => void logout()}><LogOut size={16} /> Logout</button></div>}
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <main className="main-content">
        {lowStockAlerts.length > 0 && !bannerDismissed && (
          <div className="low-stock-banner" role="alert">
            <div className="low-stock-banner-left">
              <span className="banner-alert-icon"><AlertTriangle size={16} /></span>
              <span>
                <strong>Low stock alert:</strong> {lowStockAlerts.length}{' '}
                {lowStockAlerts.length === 1 ? 'product requires' : 'products require'}{' '}
                replenishment ({lowStockAlerts.slice(0, 3).map((p) => p.name).join(', ')}
                {lowStockAlerts.length > 3 ? ` +${lowStockAlerts.length - 3} more` : ''}).
              </span>
            </div>
            <div className="low-stock-banner-right">
              {user?.role === 'MANAGER' && (
                <Link to="/replenishment" className="banner-action-link">
                  View Replenishment <ArrowRight size={13} />
                </Link>
              )}
              <button
                type="button"
                className="banner-close-btn"
                aria-label="Dismiss low stock alert notification"
                onClick={() => {
                  setBannerDismissed(true);
                  sessionStorage.setItem('low_stock_banner_dismissed', '1');
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {children}
      </main>
      {user?.role === 'MANAGER' && (
        <NavLink
          to="/ai"
          className="ai-floating-trigger"
          aria-label="StockSense AI Assistant"
          title="Open StockSense AI Assistant"
        >
          <Sparkles size={18} />
          <span>StockSense AI</span>
        </NavLink>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase().replaceAll(' ', '-')}`}>{value.replaceAll('_', ' ')}</span>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><PackageSearch size={30} /><h3>{title}</h3><p>{message}</p>{action}</div>;
}

export function LoadingState() { return <div className="loading-state" aria-label="Loading"><span /><span /><span /></div>; }
