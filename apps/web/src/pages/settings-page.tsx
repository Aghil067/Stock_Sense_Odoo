import { MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth-context';
import { EmptyState, LoadingState, PageHeader } from '../components/app-shell';
import { api } from '../lib/api';
import type { Category, Unit, Warehouse } from '../types';

type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };

export function SettingsPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['master-data'], queryFn: () => api<MasterData>('/master-data') });
  if (query.isLoading) return <LoadingState />;
  return <><PageHeader eyebrow="Configuration" title="Warehouses & profile" description="The locations that form your inventory network." />
    <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Location hierarchy</span><h2>Warehouse network</h2></div></div>{query.data?.warehouses.length ? <div className="warehouse-list">{query.data.warehouses.map((warehouse) => <article key={warehouse.id}><div className="warehouse-title"><div className="location-icon"><WarehouseIcon size={18} /></div><div><strong>{warehouse.name}</strong><span>{warehouse.code} · {warehouse.address || 'No address'}</span></div></div><div className="warehouse-locations">{warehouse.locations.map((location) => <div key={location.id}><MapPin size={14} /><span>{location.name}</span><small>{location.code}</small></div>)}</div></article>)}</div> : <EmptyState title="No warehouses" message="Create a warehouse and at least one stock location to begin." />}</section>
      <section className="panel profile-panel"><div className="panel-heading"><div><span className="eyebrow">Signed in</span><h2>My profile</h2></div></div><div className="profile-large"><div className="avatar large">{user?.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</div><h3>{user?.name}</h3><p>{user?.email}</p><span>{user?.role}</span></div><div className="metadata-list"><div><span>Categories</span><strong>{query.data?.categories.length ?? 0}</strong></div><div><span>Units of measure</span><strong>{query.data?.units.length ?? 0}</strong></div><div><span>Warehouses</span><strong>{query.data?.warehouses.length ?? 0}</strong></div></div></section></div>
  </>;
}
