import { MapPin, Plus, Warehouse as WarehouseIcon, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth-context';
import { EmptyState, LoadingState, PageHeader } from '../components/app-shell';
import { api, ApiClientError } from '../lib/api';
import type { Category, Unit, Warehouse } from '../types';

type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };
type SetupKind = 'warehouse' | 'location' | 'category' | 'unit';
const endpoints: Record<SetupKind, string> = {
  warehouse: '/master-data/warehouses', location: '/master-data/locations',
  category: '/master-data/categories', unit: '/master-data/units',
};

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeForm, setActiveForm] = useState<SetupKind | null>(null);
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['master-data'], queryFn: () => api<MasterData>('/master-data') });
  const save = useMutation({
    mutationFn: ({ kind, payload }: { kind: SetupKind; payload: Record<string, string> }) =>
      api(endpoints[kind], { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['master-data'] });
      setError('');
      setActiveForm(null);
    },
    onError: (cause) => setError(cause instanceof ApiClientError ? cause.message : 'Could not save this setup record.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeForm) return;
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    save.mutate({ kind: activeForm, payload });
  }
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <EmptyState title="Setup unavailable" message="Warehouse and catalog setup could not be loaded." action={<button className="button" onClick={() => void query.refetch()}>Retry</button>} />;
  const { categories, units, warehouses } = query.data;
  const isManager = user?.role === 'MANAGER';
  return <>
    <PageHeader eyebrow="Configuration" title="Inventory setup" description="Define the warehouse network and product classifications used by every stock movement." />
    {!isManager && <div className="notice">Only inventory managers can change setup records. You can review the current configuration below.</div>}
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Location hierarchy</span><h2>Warehouse network</h2></div>{isManager && <button className="button compact" onClick={() => setActiveForm('warehouse')}><Plus size={14} /> Warehouse</button>}</div>
        {warehouses.length ? <div className="warehouse-list">{warehouses.map((warehouse) => <article key={warehouse.id}>
          <div className="warehouse-title"><div className="location-icon"><WarehouseIcon size={18} /></div><div><strong>{warehouse.name}</strong><span>{warehouse.code} · {warehouse.address || 'No address'}</span></div></div>
          <div className="warehouse-locations">{warehouse.locations.map((location) => <div key={location.id}><MapPin size={14} /><span>{location.name}</span><small>{location.code}</small></div>)}</div>
        </article>)}</div> : <EmptyState title="No warehouses" message="Create a warehouse and at least one stock location to begin." />}
        {isManager && <div className="panel-footer"><button className="button" onClick={() => setActiveForm('location')} disabled={!warehouses.length}><Plus size={15} /> Add stock location</button></div>}
      </section>
      <div className="setup-side">
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Product classification</span><h2>Categories</h2></div>{isManager && <button className="button compact" onClick={() => setActiveForm('category')}><Plus size={14} /> Add</button>}</div>
          {categories.length ? <div className="setup-list">{categories.map((category) => <span key={category.id}>{category.name}</span>)}</div> : <EmptyState title="No categories" message="Categories make catalog and dashboard filters useful." />}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Quantity language</span><h2>Units of measure</h2></div>{isManager && <button className="button compact" onClick={() => setActiveForm('unit')}><Plus size={14} /> Add</button>}</div>
          {units.length ? <div className="setup-list">{units.map((unit) => <span key={unit.id}>{unit.name} <small>{unit.symbol}</small></span>)}</div> : <EmptyState title="No units" message="Create units such as pieces, boxes, or kilograms." />}
        </section>
      </div>
    </div>
    {activeForm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title"><div className="modal-header"><div><span className="eyebrow">Manager setup</span><h2 id="setup-title">Add {activeForm}</h2></div><button className="icon-button" aria-label="Close" onClick={() => { setActiveForm(null); setError(''); }}><X size={18} /></button></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <form className="form-stack" onSubmit={submit}>
        <label>Name<input name="name" required minLength={2} maxLength={activeForm === 'unit' ? 60 : activeForm === 'category' ? 80 : 100} placeholder={activeForm === 'warehouse' ? 'Main Warehouse' : activeForm === 'location' ? 'Receiving Bay' : activeForm === 'category' ? 'Raw Materials' : 'Pieces'} /></label>
        {(activeForm === 'warehouse' || activeForm === 'location') && <label>Code<input name="code" required minLength={activeForm === 'warehouse' ? 2 : 1} maxLength={activeForm === 'warehouse' ? 12 : 20} pattern="[A-Za-z0-9_-]+" placeholder={activeForm === 'warehouse' ? 'MAIN' : 'BAY-A'} /></label>}
        {activeForm === 'unit' && <label>Symbol<input name="symbol" required maxLength={12} placeholder="pcs" /></label>}
        {activeForm === 'warehouse' && <label>Address (optional)<input name="address" maxLength={240} placeholder="Street, city" /></label>}
        {activeForm === 'location' && <label>Warehouse<select name="warehouseId" required><option value="">Choose warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>}
        <div className="modal-actions"><button className="button" type="button" onClick={() => setActiveForm(null)}>Cancel</button><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button></div>
      </form>
    </section></div>}
  </>;
}
