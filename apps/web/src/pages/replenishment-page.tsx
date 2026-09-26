import { ArrowRight, ClipboardPlus, Filter, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, ApiClientError, formatQuantity } from '../lib/api';
import type { Category, Unit, Warehouse } from '../types';

type WorkItem = {
  product: { id: string; name: string; sku: string; unit: Unit; category: Category };
  location: { id: string; name: string; warehouse: { id: string; name: string } };
  minimumQty: string; onHand: string; pendingIncoming: string; pendingOutgoing: string;
  projected: string; suggestedQuantity: string; status: 'OUT_OF_STOCK' | 'REORDER' | 'COVERED';
};

export function ReplenishmentPage() {
  const queryClient = useQueryClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [error, setError] = useState('');
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<{ warehouses: Warehouse[] }>('/master-data') });
  const worklist = useQuery({ queryKey: ['replenishment', warehouseId], queryFn: () =>
    api<WorkItem[]>(`/replenishment?${new URLSearchParams(warehouseId ? { warehouseId } : {})}`) });
  const create = useMutation({
    mutationFn: ({ supplier, item }: { supplier: string; item: WorkItem }) => api('/operations', {
      method: 'POST',
      body: JSON.stringify({
        type: 'RECEIPT', partnerName: supplier, destinationLocationId: item.location.id,
        reason: 'Replenishment worklist suggestion',
        lines: [{ productId: item.product.id, quantity: Number(item.suggestedQuantity) }],
      }),
    }),
    onSuccess: async () => {
      setSelected(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (cause) => setError(cause instanceof ApiClientError ? cause.message : 'The receipt draft could not be created.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const supplier = String(new FormData(event.currentTarget).get('supplier') || '').trim();
    if (supplier.length < 2) { setError('Enter a supplier name of at least two characters.'); return; }
    create.mutate({ supplier, item: selected });
  }
  const rows = worklist.data ?? [];
  const needsAction = rows.filter((item) => Number(item.suggestedQuantity) > 0).length;
  return <>
    <PageHeader eyebrow="Manager decision support" title="Replenishment worklist" description="See which product-location pairs will fall below their reorder level after pending movements." actions={<Link className="button" to="/operations/receipts">View receipts <ArrowRight size={16} /></Link>} />
    <section className="toolbar panel"><div className="filter-context"><Filter size={16} /><strong>{needsAction} location(s) need attention</strong></div><div className="filter-group"><select aria-label="Filter replenishment by warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">All warehouses</option>{master.data?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div></section>
    <div className="notice replenishment-explainer">Projected stock = on-hand + pending receipts/transfers in − pending deliveries/transfers out. Suggested quantity brings projected stock up to the configured reorder level. Drafts do not change stock until validated.</div>
    <section className="panel table-panel">
      {worklist.isLoading ? <LoadingState /> : worklist.isError ? <EmptyState title="Worklist unavailable" message="Could not calculate replenishment from the live database." action={<button className="button" onClick={() => void worklist.refetch()}>Retry</button>} /> : rows.length ? <div className="table-scroll"><table><thead><tr><th>Product / location</th><th>On hand</th><th>Incoming</th><th>Outgoing</th><th>Projected</th><th>Reorder at</th><th>Suggested</th><th>Status</th><th aria-label="Action" /></tr></thead><tbody>{rows.map((item) => <tr key={`${item.product.id}:${item.location.id}`}>
        <td><strong>{item.product.name}</strong><small className="table-sub">{item.product.sku} · {item.location.warehouse.name} / {item.location.name}</small></td>
        <td>{formatQuantity(item.onHand, item.product.unit.symbol)}</td><td>{formatQuantity(item.pendingIncoming)}</td><td>{formatQuantity(item.pendingOutgoing)}</td>
        <td><strong>{formatQuantity(item.projected)}</strong></td><td>{formatQuantity(item.minimumQty)}</td><td><strong>{formatQuantity(item.suggestedQuantity)}</strong></td>
        <td><StatusBadge value={item.status} /></td><td>{Number(item.suggestedQuantity) > 0 && <button className="button compact primary" onClick={() => setSelected(item)}><ClipboardPlus size={14} /> Draft receipt</button>}</td>
      </tr>)}</tbody></table></div> : <EmptyState title="No reorder rules yet" message="Set a product reorder level for a location to generate live recommendations." action={<Link className="button" to="/products">Open products</Link>} />}
    </section>
    {selected && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="replenishment-title"><div className="modal-header"><div><span className="eyebrow">Review recommendation</span><h2 id="replenishment-title">Draft a receipt</h2></div><button className="icon-button" aria-label="Close" onClick={() => { setSelected(null); setError(''); }}><X size={18} /></button></div>
      <p className="preview-note">Prepare {formatQuantity(selected.suggestedQuantity, selected.product.unit.symbol)} of {selected.product.name} for {selected.location.warehouse.name} / {selected.location.name}. This creates a draft only; stock does not change yet.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <form className="form-stack" onSubmit={submit}><label>Supplier<input name="supplier" required minLength={2} maxLength={120} placeholder="Supplier name" /></label><div className="modal-actions"><button type="button" className="button" onClick={() => setSelected(null)}>Cancel</button><button className="button primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create receipt draft'}</button></div></form>
    </section></div>}
  </>;
}
