import { Filter, Plus, Search, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, ApiClientError, formatQuantity } from '../lib/api';
import type { Category, Product, Unit, Warehouse } from '../types';

type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };

export function ProductsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<MasterData>('/master-data') });
  const products = useQuery({
    queryKey: ['products', search, categoryId, locationId, stockStatus],
    queryFn: () => api<Product[]>(`/products?${new URLSearchParams({ ...(search ? { search } : {}), ...(categoryId ? { categoryId } : {}), ...(locationId ? { locationId } : {}), ...(stockStatus ? { stockStatus } : {}) })}`),
  });
  const create = useMutation({
    mutationFn: (payload: unknown) => api<Product>('/products', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]); setOpen(false); setError(''); },
    onError: (cause) => setError(cause instanceof ApiClientError ? cause.message : 'Product could not be created.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if ((Number(form.get('initialStock') || 0) > 0 || form.get('reorderLevel') !== '') && !form.get('initialLocationId')) {
      setError('Choose a location for opening stock or the reorder level.');
      return;
    }
    setError('');
    create.mutate({
      name: form.get('name'), sku: form.get('sku'), categoryId: form.get('categoryId'), unitId: form.get('unitId'),
      description: form.get('description') || undefined, initialStock: Number(form.get('initialStock') || 0),
      initialLocationId: form.get('initialLocationId') || undefined, reorderLevel: form.get('reorderLevel') === '' ? undefined : Number(form.get('reorderLevel')),
    });
  }

  return <>
    <PageHeader eyebrow="Catalog" title="Products" description="Current availability by SKU, category and warehouse location." actions={user?.role === 'MANAGER' && <button className="button primary" onClick={() => setOpen(true)}><Plus size={17} /> Add product</button>} />
    <section className="toolbar panel"><div className="search-box"><Search size={17} /><input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU…" /></div><div className="filter-group"><Filter size={16} /><select aria-label="Filter category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{master.data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select aria-label="Filter product location" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{master.data?.warehouses.flatMap((warehouse) => warehouse.locations.map((location) => <option key={location.id} value={location.id}>{warehouse.name} / {location.name}</option>))}</select><select aria-label="Filter stock status" value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="">All stock states</option><option value="HEALTHY">Healthy</option><option value="LOW_STOCK">Low stock</option><option value="OUT_OF_STOCK">Out of stock</option></select></div></section>
    <section className="panel table-panel">
      {products.isLoading ? <LoadingState /> : products.data?.length ? <div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Available</th><th>Locations</th><th>Reorder status</th></tr></thead><tbody>{products.data.map((product) => <tr key={product.id}><td><Link className="product-cell" to={`/products/${product.id}`}><span className="product-monogram">{product.name.slice(0,2).toUpperCase()}</span><span><strong>{product.name}</strong><small>{product.sku}</small></span></Link></td><td>{product.category.name}</td><td><strong>{formatQuantity(product.totalStock, product.unit.symbol)}</strong></td><td>{product.balances.filter((balance) => Number(balance.quantity) !== 0).length || '—'}</td><td><StatusBadge value={product.stockStatus} /></td></tr>)}</tbody></table></div> : <EmptyState title="No products found" message="Change the filters or add your first trackable product." action={user?.role === 'MANAGER' && <button className="button" onClick={() => setOpen(true)}>Add product</button>} />}
    </section>
    {open && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><div className="modal-header"><div><span className="eyebrow">Catalog setup</span><h2 id="product-dialog-title">Add product</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></div>{error && <div className="notice error">{error}</div>}<form className="form-stack" onSubmit={submit}><div className="form-grid"><label>Product name<input name="name" required minLength={2} placeholder="Steel Rods" /></label><label>SKU / code<input name="sku" required pattern="[A-Za-z0-9][A-Za-z0-9_-]+" placeholder="RM-STEEL-01" /></label><label>Category<select name="categoryId" required><option value="">Select category</option>{master.data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Unit of measure<select name="unitId" required><option value="">Select unit</option>{master.data?.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</select></label><label>Opening stock<input name="initialStock" type="number" min="0" step="0.001" defaultValue="0" /></label><label>Opening location<select name="initialLocationId"><option value="">No opening location</option>{master.data?.warehouses.flatMap((warehouse) => warehouse.locations.map((location) => <option key={location.id} value={location.id}>{warehouse.name} / {location.name}</option>))}</select></label><label>Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" placeholder="20" /></label></div><label>Description<textarea name="description" placeholder="Operational notes about this product" /></label><div className="modal-actions"><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create product'}</button></div></form></section></div>}
  </>;
}

