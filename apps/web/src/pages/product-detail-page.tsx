import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { Product } from '../types';

export function ProductDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`), enabled: Boolean(id) });
  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <EmptyState title="Product unavailable" message="This product could not be loaded." />;
  const product = query.data;
  return <>
    <Link to="/products" className="back-link"><ArrowLeft size={15} /> Products</Link>
    <PageHeader eyebrow={product.sku} title={product.name} description={product.description || `${product.category.name} inventory`} actions={<StatusBadge value={product.stockStatus} />} />
    <section className="product-summary"><article className="summary-total"><span>Current stock</span><strong>{formatQuantity(product.totalStock, product.unit.symbol)}</strong><small>Across {product.balances.filter((item) => Number(item.quantity) !== 0).length} active location(s)</small></article><article><span>Category</span><strong>{product.category.name}</strong></article><article><span>Unit of measure</span><strong>{product.unit.name}</strong></article></section>
    <div className="detail-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Location balance</span><h2>Where it is</h2></div></div>{product.balances.length ? <div className="location-list">{product.balances.map((balance) => { const rule = product.reorderRules.find((item) => item.locationId === balance.locationId); return <div className="location-row" key={balance.id}><div className="location-icon"><MapPin size={17} /></div><div><strong>{balance.location.name}</strong><span>{balance.location.warehouse.name}</span></div><div><strong>{formatQuantity(balance.quantity, product.unit.symbol)}</strong><small>{rule ? `Reorder at ${formatQuantity(rule.minimumQty, product.unit.symbol)}` : 'No reorder rule'}</small></div></div>; })}</div> : <EmptyState title="No stock locations" message="Receive or adjust this product to establish a location balance." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Stock explainer</span><h2>Recent timeline</h2></div><Link className="text-link" to={`/ledger?productId=${product.id}`}>Full history</Link></div>{product.ledgerEntries?.length ? <div className="timeline">{product.ledgerEntries.map((entry) => <div className="timeline-item" key={entry.id}><span className="timeline-dot" /><div><div><StatusBadge value={entry.movementType} /><time>{formatDate(entry.createdAt)}</time></div><strong>{Number(entry.quantity) > 0 ? '+' : ''}{formatQuantity(entry.quantity, product.unit.symbol)}</strong><p>{entry.sourceLocation?.name ?? 'External'} <ArrowRight size={12} /> {entry.destinationLocation?.name ?? 'External'}</p></div></div>)}</div> : <EmptyState title="No stock history" message="Completed operations for this product will build its audit timeline." />}</section></div>
  </>;
}
