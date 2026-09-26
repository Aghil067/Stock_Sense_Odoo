import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, Filter, PackageCheck, Shuffle, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { LedgerEntry } from '../types';
import type { Category, Unit, Warehouse } from '../types';

type Dashboard = {
  kpis: { totalProductsInStock: number; lowStock: number; outOfStock: number; pendingReceipts: number; pendingDeliveries: number; scheduledTransfers: number };
  actions: Array<{ severity: 'HIGH' | 'MEDIUM' | 'OPERATIONS'; message: string; href: string }>;
  recentMovements: LedgerEntry[];
};

const metrics = [
  { key: 'totalProductsInStock', label: 'Products in stock', icon: Boxes, tone: 'ink' },
  { key: 'lowStock', label: 'Low stock', icon: AlertTriangle, tone: 'amber' },
  { key: 'outOfStock', label: 'Out of stock', icon: AlertTriangle, tone: 'red' },
  { key: 'pendingReceipts', label: 'Pending receipts', icon: PackageCheck, tone: 'green' },
  { key: 'pendingDeliveries', label: 'Pending deliveries', icon: Truck, tone: 'blue' },
  { key: 'scheduledTransfers', label: 'Transfers scheduled', icon: Shuffle, tone: 'slate' },
] as const;

export function DashboardPage() {
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<{ categories: Category[]; units: Unit[]; warehouses: Warehouse[] }>('/master-data') });
  const query = useQuery({ queryKey: ['dashboard', locationId, categoryId], queryFn: () => api<Dashboard>(`/dashboard?${new URLSearchParams({ ...(locationId ? { locationId } : {}), ...(categoryId ? { categoryId } : {}) })}`) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <EmptyState title="Dashboard unavailable" message="The live inventory summary could not be loaded. Check the API and try again." action={<button className="button" onClick={() => void query.refetch()}>Retry</button>} />;
  const { kpis, actions, recentMovements } = query.data;
  return <>
    <PageHeader eyebrow="Live inventory" title="Control center" description="What needs attention across every warehouse, right now." actions={<Link className="button primary" to="/operations/receipts">New receipt <ArrowRight size={17} /></Link>} />
    <section className="toolbar panel dashboard-toolbar"><div className="filter-context"><Filter size={16} /><strong>Scope dashboard</strong></div><div className="filter-group"><select aria-label="Filter dashboard by location" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All warehouses & locations</option>{master.data?.warehouses.flatMap((warehouse) => warehouse.locations.map((location) => <option key={location.id} value={location.id}>{warehouse.name} / {location.name}</option>))}</select><select aria-label="Filter dashboard by category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{master.data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></section>
    <section className="metric-grid" aria-label="Inventory KPIs">
      {metrics.map(({ key, label, icon: Icon, tone }) => <article className="metric-card" key={key}><div className={`metric-icon tone-${tone}`}><Icon size={19} /></div><span>{label}</span><strong>{kpis[key]}</strong><small>Live from PostgreSQL</small></article>)}
    </section>
    <div className="dashboard-grid">
      <section className="panel action-panel"><div className="panel-heading"><div><span className="eyebrow">Priority queue</span><h2>Action center</h2></div><span className="count-pill">{actions.length}</span></div>
        {actions.length ? <div className="action-list">{actions.map((action, index) => <Link to={action.href} key={`${action.message}-${index}`} className="action-row"><span className={`priority-dot priority-${action.severity.toLowerCase()}`} /><div><small>{action.severity}</small><strong>{action.message}</strong></div><ArrowRight size={16} /></Link>)}</div> : <EmptyState title="Operations are clear" message="No low-stock or pending-operation actions need attention." />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Audit trail</span><h2>Recent movements</h2></div><Link to="/ledger" className="text-link">View ledger</Link></div>
        {recentMovements.length ? <div className="movement-list">{recentMovements.map((entry) => <div className="movement-row" key={entry.id}><div className={`movement-icon ${Number(entry.quantity) >= 0 ? 'positive' : 'negative'}`}>{Number(entry.quantity) >= 0 ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="movement-main"><strong>{entry.product.name}</strong><span>{entry.reference} · {formatDate(entry.createdAt)}</span></div><div className="movement-qty"><strong>{Number(entry.quantity) > 0 ? '+' : ''}{formatQuantity(entry.quantity, entry.product.unit.symbol)}</strong><StatusBadge value={entry.movementType} /></div></div>)}</div> : <EmptyState title="No movements yet" message="Validated receipts, deliveries, transfers and counts will appear here." />}
      </section>
    </div>
  </>;
}
