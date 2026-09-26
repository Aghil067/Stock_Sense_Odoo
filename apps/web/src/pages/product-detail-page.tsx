import { ArrowLeft, ArrowRight, MapPin, Pencil, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { Category, Product, Unit, Warehouse } from '../types';

export function ProductDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`), enabled: Boolean(id) });
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<{ categories: Category[]; units: Unit[]; warehouses: Warehouse[] }>('/master-data') });
  const update = useMutation({
    mutationFn: async (payload: { product: unknown; rule?: { locationId: string; minimumQty: number } }) => {
      await api(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload.product) });
      if (payload.rule) await api(`/products/${id}/reorder-rule`, { method: 'PUT', body: JSON.stringify(payload.rule) });
    },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['product', id] }), queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]); setEditing(false); },
  });
  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <EmptyState title="Product unavailable" message="This product could not be loaded." />;
  const product = query.data;
  return <>
    <Link to="/products" className="back-link"><ArrowLeft size={15} /> Products</Link>
    <PageHeader eyebrow={product.sku} title={product.name} description={product.description || `${product.category.name} inventory`} actions={<><StatusBadge value={product.stockStatus} />{user?.role === 'MANAGER' && <button className="button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>}</>} />
    <section className="product-summary"><article className="summary-total"><span>Current stock</span><strong>{formatQuantity(product.totalStock, product.unit.symbol)}</strong><small>Across {product.balances.filter((item) => Number(item.quantity) !== 0).length} active location(s)</small></article><article><span>Category</span><strong>{product.category.name}</strong></article><article><span>Unit of measure</span><strong>{product.unit.name}</strong></article></section>
    <div className="detail-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Location balance</span><h2>Where it is</h2></div></div>{product.balances.length || product.reorderRules.length ? <div className="location-list">
      {product.balances.map((balance) => { const rule = product.reorderRules.find((item) => item.locationId === balance.locationId); return <div className="location-row" key={balance.id}><div className="location-icon"><MapPin size={17} /></div><div><strong>{balance.location.name}</strong><span>{balance.location.warehouse.name}</span></div><div><strong>{formatQuantity(balance.quantity, product.unit.symbol)}</strong><small>{rule ? `Reorder at ${formatQuantity(rule.minimumQty, product.unit.symbol)}` : 'No reorder rule'}</small></div></div>; })}
      {product.reorderRules.filter((rule) => !product.balances.some((balance) => balance.locationId === rule.locationId)).map((rule) => <div className="location-row" key={rule.id}><div className="location-icon"><MapPin size={17} /></div><div><strong>{rule.location.name}</strong><span>{rule.location.warehouse.name}</span></div><div><strong>{formatQuantity(0, product.unit.symbol)}</strong><small>Reorder at {formatQuantity(rule.minimumQty, product.unit.symbol)}</small></div></div>)}
    </div> : <EmptyState title="No stock locations" message="Receive or adjust this product to establish a location balance." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Stock explainer</span><h2>Recent timeline</h2></div><Link className="text-link" to={`/ledger?productId=${product.id}`}>Full history</Link></div>{product.ledgerEntries?.length ? <div className="timeline">{product.ledgerEntries.map((entry) => <div className="timeline-item" key={entry.id}><span className="timeline-dot" /><div><div><StatusBadge value={entry.movementType} /><time>{formatDate(entry.createdAt)}</time></div><strong>{Number(entry.quantity) > 0 ? '+' : ''}{formatQuantity(entry.quantity, product.unit.symbol)}</strong><p>{entry.sourceLocation?.name ?? 'External'} <ArrowRight size={12} /> {entry.destinationLocation?.name ?? 'External'}</p></div></div>)}</div> : <EmptyState title="No stock history" message="Completed operations for this product will build its audit timeline." />}</section></div>
    {editing && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">Product control</span><h2>Edit product & reorder rule</h2></div><button className="icon-button" aria-label="Close" onClick={() => setEditing(false)}><X size={18} /></button></div>{update.isError && <div className="notice error">Product changes could not be saved.</div>}<form className="form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const locationId = String(form.get('locationId') || ''); update.mutate({ product: { name: form.get('name'), sku: form.get('sku'), description: form.get('description') || null, categoryId: form.get('categoryId'), unitId: form.get('unitId') }, ...(locationId ? { rule: { locationId, minimumQty: Number(form.get('minimumQty')) } } : {}) }); }}><div className="form-grid"><label>Product name<input name="name" defaultValue={product.name} required /></label><label>SKU / code<input name="sku" defaultValue={product.sku} required /></label><label>Category<select name="categoryId" defaultValue={product.category.id}>{master.data?.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Unit<select name="unitId" defaultValue={product.unit.id}>{master.data?.units.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Reorder location<select name="locationId" defaultValue={product.reorderRules[0]?.locationId ?? ''}><option value="">Do not change rule</option>{master.data?.warehouses.flatMap((warehouse) => warehouse.locations.map((location) => <option key={location.id} value={location.id}>{warehouse.name} / {location.name}</option>))}</select></label><label>Minimum quantity<input name="minimumQty" type="number" min="0" step="0.001" defaultValue={product.reorderRules[0]?.minimumQty ?? 0} /></label></div><label>Description<textarea name="description" defaultValue={product.description} /></label><div className="modal-actions"><button type="button" className="button" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</button></div></form></section></div>}
  </>;
}
