import { Boxes, ClipboardList, Gauge, LogOut, Menu, PackageSearch, Settings, SlidersHorizontal, Truck, Warehouse, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth-context';

const navigation = [
  { to: '/', label: 'Control center', icon: Gauge },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/operations/receipts', label: 'Receipts', icon: PackageSearch },
  { to: '/operations/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/operations/transfers', label: 'Internal transfers', icon: Warehouse },
  { to: '/operations/adjustments', label: 'Adjustments', icon: Settings },
  { to: '/ledger', label: 'Stock ledger', icon: ClipboardList },
  { to: '/settings', label: 'Warehouses & profile', icon: SlidersHorizontal },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-frame">
      <button className="mobile-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button>
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><span /></div>
          <div><strong>StockSense</strong><small>Inventory control</small></div>
          <button className="sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="avatar">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
          <div className="profile-copy"><strong>{user?.name}</strong><small>{user?.role.toLowerCase()}</small></div>
          <button className="icon-button dark" aria-label="Log out" onClick={() => void logout()}><LogOut size={17} /></button>
        </div>
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <main className="main-content">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><PackageSearch size={30} /><h3>{title}</h3><p>{message}</p>{action}</div>;
}

export function LoadingState() { return <div className="loading-state" aria-label="Loading"><span /><span /><span /></div>; }
