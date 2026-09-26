import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, Filter, PackageCheck, RotateCcw, Shuffle, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { InventoryAnalytics } from '../components/inventory-analytics';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { Category, LedgerEntry, OperationStatus, OperationType, Unit, Warehouse } from '../types';

type Dashboard = {
  kpis: { totalProductsInStock: number; lowStock: number; outOfStock: number; pendingReceipts: number; pendingDeliveries: number; scheduledTransfers: number };
  actions: Array<{ severity: 'HIGH' | 'MEDIUM' | 'OPERATIONS'; message: string; href: string }>;
  matchingDocuments: Array<{ id: string; reference: string; type: OperationType; status: OperationStatus; createdAt: string; partnerName?: string; scheduledAt?: string; _count: { lines: number } }>;
  recentMovements: LedgerEntry[];
};
type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };
const operationPaths: Record<OperationType, string> = {
  RECEIPT: '/operations/receipts', DELIVERY: '/operations/deliveries',
  INTERNAL_TRANSFER: '/operations/transfers', ADJUSTMENT: '/operations/adjustments',
};
const metrics = [
  { key: 'totalProductsInStock', label: 'Products in stock', icon: Boxes, tone: 'ink' },
  { key: 'lowStock', label: 'Low stock', icon: AlertTriangle, tone: 'amber' },
  { key: 'outOfStock', label: 'Out of stock', icon: AlertTriangle, tone: 'red' },
  { key: 'pendingReceipts', label: 'Pending receipts', icon: PackageCheck, tone: 'green' },
  { key: 'pendingDeliveries', label: 'Pending deliveries', icon: Truck, tone: 'blue' },
  { key: 'scheduledTransfers', label: 'Pending transfers', icon: Shuffle, tone: 'slate' },
] as const;

export function DashboardPage() {
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<MasterData>('/master-data') });
  const hasActiveFilters = Boolean(type || status || warehouseId || locationId || categoryId);
  function resetFilters() {
    setType('');
    setStatus('');
    setWarehouseId('');
    setLocationId('');
    setCategoryId('');
  }
  const filters = new URLSearchParams({
    ...(type ? { type } : {}), ...(status ? { status } : {}),
    ...(warehouseId ? { warehouseId } : {}), ...(locationId ? { locationId } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const query = useQuery({ queryKey: ['dashboard', type, status, warehouseId, locationId, categoryId], queryFn: () => api<Dashboard>(`/dashboard?${filters}`) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <EmptyState title="Dashboard unavailable" message="The live inventory summary could not be loaded. Check the API and try again." action={<button className="button" onClick={() => void query.refetch()}>Retry</button>} />;
  const { kpis, actions, matchingDocuments, recentMovements } = query.data;
  const locations = master.data?.warehouses.filter((warehouse) => !warehouseId || warehouse.id === warehouseId).flatMap((warehouse) =>
    warehouse.locations.map((location) => ({ ...location, warehouseName: warehouse.name }))) ?? [];
  return <>
    <PageHeader eyebrow="Live inventory" title="Control center" description="Current balances and the documents needing attention across your warehouse network." actions={<Link className="button primary" to="/operations/receipts">New receipt <ArrowRight size={17} /></Link>} />
    <section className="toolbar panel dashboard-toolbar"><div className="filter-context"><Filter size={16} /><strong>Scope dashboard</strong></div><div className="filter-group dashboard-filters">
      <select aria-label="Filter document type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All document types</option><option value="RECEIPT">Receipts</option><option value="DELIVERY">Deliveries</option><option value="INTERNAL_TRANSFER">Internal transfers</option><option value="ADJUSTMENT">Adjustments</option></select>
      <select aria-label="Filter document status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'].map((item) => <option value={item} key={item}>{item}</option>)}</select>
      <select aria-label="Filter warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setLocationId(''); }}><option value="">All warehouses</option>{master.data?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
      <select aria-label="Filter location" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.warehouseName} / {location.name}</option>)}</select>
      <select aria-label="Filter product category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{master.data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      {hasActiveFilters && <button type="button" className="button" onClick={resetFilters}><RotateCcw size={15} /> Reset filters</button>}
    </div></section>
    <p className="filter-explainer">Stock cards show current balances for the selected warehouse/location and category. Document cards and lists also follow type and status.</p>
    <section className="metric-grid" aria-label="Inventory KPIs">{metrics.map(({ key, label, icon: Icon, tone }) => <article className="metric-card" key={key}><div className={`metric-icon tone-${tone}`}><Icon size={19} /></div><span>{label}</span><strong>{kpis[key]}</strong><small>Live from PostgreSQL</small></article>)}</section>
    <InventoryAnalytics warehouseId={warehouseId} locationId={locationId} categoryId={categoryId} />
    <div className="dashboard-grid">
      <section className="panel action-panel"><div className="panel-heading"><div><span className="eyebrow">Priority queue</span><h2>Action center</h2></div><span className="count-pill">{actions.length}</span></div>
        {actions.length ? <div className="action-list">{actions.map((action, index) => <Link to={action.href} key={`${action.message}-${index}`} className="action-row"><span className={`priority-dot priority-${action.severity.toLowerCase()}`} /><div><small>{action.severity}</small><strong>{action.message}</strong></div><ArrowRight size={16} /></Link>)}</div> : <EmptyState title="Operations are clear" message="No low-stock or pending-operation actions need attention." />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Filtered documents</span><h2>Matching operations</h2></div><span className="count-pill">{matchingDocuments.length}</span></div>
        {matchingDocuments.length ? <div className="document-list">{matchingDocuments.map((document) => <Link to={operationPaths[document.type]} key={document.id} className="document-row"><div><strong>{document.reference}</strong><small>{document.partnerName || `${document._count.lines} product line(s)`} · {formatDate(document.createdAt)}</small></div><StatusBadge value={document.type} /><StatusBadge value={document.status} /><ArrowRight size={15} /></Link>)}</div> : <EmptyState title="No matching documents" message="Change the filters or create a stock operation." />}
      </section>
    </div>
    <section className="panel dashboard-ledger"><div className="panel-heading"><div><span className="eyebrow">Audit trail</span><h2>Recent completed movements</h2></div><Link to="/ledger" className="text-link">View ledger</Link></div>
      {recentMovements.length ? <div className="movement-list">{recentMovements.map((entry) => <div className="movement-row" key={entry.id}><div className={`movement-icon ${Number(entry.quantity) >= 0 ? 'positive' : 'negative'}`}>{Number(entry.quantity) >= 0 ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="movement-main"><strong>{entry.product.name}</strong><span>{entry.reference} · {formatDate(entry.createdAt)}</span></div><div className="movement-qty"><strong>{Number(entry.quantity) > 0 ? '+' : ''}{formatQuantity(entry.quantity, entry.product.unit.symbol)}</strong><StatusBadge value={entry.movementType} /></div></div>)}</div> : <EmptyState title="No completed movements match" message="Validated stock movements appear here; draft and canceled documents have no ledger entry." />}
    </section>
  </>;
}
