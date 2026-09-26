import { ArrowRight, Check, Eye, Filter, PackagePlus, Plus, Search, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, ApiClientError, formatDate, formatQuantity } from '../lib/api';
import type { Category, Operation, OperationStatus, OperationType, Product, Unit, Warehouse } from '../types';

type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };
type LineDraft = { key: number; productId: string; quantity: string; countedQuantity: string };
type PreviewLine = { product: Product; quantity: string; sourceBefore?: string; sourceAfter?: string; destinationBefore?: string; destinationAfter?: string };
const configs: Record<string, { type: OperationType; eyebrow: string; title: string; description: string; action: string }> = {
  receipts: { type: 'RECEIPT', eyebrow: 'Incoming stock', title: 'Receipts', description: 'Register vendor arrivals and increase stock only after validation.', action: 'New receipt' },
  deliveries: { type: 'DELIVERY', eyebrow: 'Outgoing stock', title: 'Delivery orders', description: 'Pick, pack and validate customer shipments without overselling stock.', action: 'New delivery' },
  transfers: { type: 'INTERNAL_TRANSFER', eyebrow: 'Location movement', title: 'Internal transfers', description: 'Move inventory between locations while preserving the company-wide total.', action: 'New transfer' },
  adjustments: { type: 'ADJUSTMENT', eyebrow: 'Physical count', title: 'Inventory adjustments', description: 'Reconcile recorded stock with verified physical quantities.', action: 'New adjustment' },
};

export function OperationsPage() {
  const { kind = 'receipts' } = useParams();
  const config = configs[kind] ?? configs.receipts;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ key: 1, productId: '', quantity: '1', countedQuantity: '' }]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const products = useQuery({ queryKey: ['products', 'operation-picker'], queryFn: () => api<Product[]>('/products') });
  const master = useQuery({ queryKey: ['master-data'], queryFn: () => api<MasterData>('/master-data') });
  const operations = useQuery({
    queryKey: ['operations', config.type, status, search],
    queryFn: () => api<Operation[]>(`/operations?${new URLSearchParams({ type: config.type, ...(status ? { status } : {}), ...(search ? { search } : {}) })}`),
  });
  const preview = useQuery({ queryKey: ['operation-preview', previewId], queryFn: () => api<PreviewLine[]>(`/operations/${previewId}/preview`), enabled: Boolean(previewId) });

  const action = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api(`/operations/${id}/${name}`, { method: 'POST' }),
    onSuccess: async () => { setPreviewId(null); await Promise.all([queryClient.invalidateQueries({ queryKey: ['operations'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['ledger'] })]); },
    onError: (cause) => setError(cause instanceof ApiClientError ? cause.message : 'The operation could not be updated.'),
  });
  const create = useMutation({
    mutationFn: (payload: unknown) => api('/operations', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => { setOpen(false); setLines([{ key: Date.now(), productId: '', quantity: '1', countedQuantity: '' }]); setError(''); await queryClient.invalidateQueries({ queryKey: ['operations'] }); },
    onError: (cause) => setError(cause instanceof ApiClientError ? cause.message : 'The draft could not be created.'),
  });
  const locations = useMemo(() => master.data?.warehouses.flatMap((warehouse) => warehouse.locations.map((location) => ({ ...location, warehouseName: warehouse.name }))) ?? [], [master.data]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    create.mutate({
      type: config.type,
      partnerName: form.get('partnerName') || undefined,
      reason: form.get('reason') || undefined,
      sourceLocationId: form.get('sourceLocationId') || undefined,
      destinationLocationId: form.get('destinationLocationId') || undefined,
      scheduledAt: form.get('scheduledAt') || undefined,
      lines: lines.map((line) => ({ productId: line.productId, quantity: config.type === 'ADJUSTMENT' ? 1 : Number(line.quantity), ...(config.type === 'ADJUSTMENT' ? { countedQuantity: Number(line.countedQuantity) } : {}) })),
    });
  }
  function updateLine(key: number, field: keyof LineDraft, value: string) { setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line)); }

  return <>
    <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} actions={<button className="button primary" onClick={() => setOpen(true)}><Plus size={17} />{config.action}</button>} />
    {error && <div className="notice error dismissible">{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={15} /></button></div>}
    <section className="toolbar panel"><div className="search-box"><Search size={17} /><input aria-label="Search operations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, partner or SKU…" /></div><div className="filter-group"><Filter size={16} /><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['DRAFT','WAITING','READY','DONE','CANCELED'].map((item) => <option key={item}>{item}</option>)}</select></div></section>
    <section className="panel table-panel">{operations.isLoading ? <LoadingState /> : operations.data?.length ? <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Route / partner</th><th>Products</th><th>Created</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{operations.data.map((operation) => <tr key={operation.id}><td><strong>{operation.reference}</strong><small className="table-sub">{operation.createdBy.name}</small></td><td><strong>{operation.partnerName || `${operation.sourceLocation?.name ?? 'External'} → ${operation.destinationLocation?.name ?? 'External'}`}</strong><small className="table-sub">{operation.reason || operation.scheduledAt ? (operation.reason || `Scheduled ${formatDate(operation.scheduledAt!)}`) : '—'}</small></td><td>{operation.lines.length} line{operation.lines.length === 1 ? '' : 's'}<small className="table-sub">{operation.lines.map((line) => line.product.name).join(', ')}</small></td><td>{formatDate(operation.createdAt)}</td><td><StatusBadge value={operation.status} /></td><td><OperationActions operation={operation} busy={action.isPending} onAction={(name) => action.mutate({ id: operation.id, name })} onPreview={() => setPreviewId(operation.id)} /></td></tr>)}</tbody></table></div> : <EmptyState title={`No ${config.title.toLowerCase()} yet`} message={`Create a draft to begin the ${config.title.toLowerCase()} workflow.`} action={<button className="button" onClick={() => setOpen(true)}>{config.action}</button>} />}</section>
    {open && <div className="modal-backdrop"><section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="operation-dialog-title"><div className="modal-header"><div><span className="eyebrow">{config.eyebrow}</span><h2 id="operation-dialog-title">{config.action}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></div>{error && <div className="notice error">{error}</div>}<form className="form-stack" onSubmit={submit}><div className="form-grid">
      {config.type === 'RECEIPT' && <label>Supplier<input name="partnerName" required placeholder="Supplier name" /></label>}
      {config.type === 'DELIVERY' && <label>Customer<input name="partnerName" required placeholder="Customer name" /></label>}
      {(config.type === 'DELIVERY' || config.type === 'INTERNAL_TRANSFER' || config.type === 'ADJUSTMENT') && <label>{config.type === 'ADJUSTMENT' ? 'Counted location' : 'Source location'}<select name="sourceLocationId" required><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.warehouseName} / {location.name}</option>)}</select></label>}
      {(config.type === 'RECEIPT' || config.type === 'INTERNAL_TRANSFER') && <label>Destination location<select name="destinationLocationId" required><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.warehouseName} / {location.name}</option>)}</select></label>}
      {config.type !== 'ADJUSTMENT' && <label>Scheduled date<input name="scheduledAt" type="datetime-local" /></label>}
      {(config.type === 'INTERNAL_TRANSFER' || config.type === 'ADJUSTMENT') && <label>Reason<input name="reason" required placeholder={config.type === 'ADJUSTMENT' ? 'Cycle count / damage' : 'Production allocation'} /></label>}
    </div><div className="line-editor"><div className="line-editor-heading"><strong>Product lines</strong><button type="button" className="text-link button-link" onClick={() => setLines((current) => [...current, { key: Date.now(), productId: '', quantity: '1', countedQuantity: '' }])}><Plus size={14} /> Add line</button></div>{lines.map((line, index) => <div className="operation-line" key={line.key}><span>{index + 1}</span><select aria-label={`Product line ${index + 1}`} value={line.productId} onChange={(event) => updateLine(line.key, 'productId', event.target.value)} required><option value="">Select product</option>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select><input aria-label={config.type === 'ADJUSTMENT' ? 'Physical count' : 'Quantity'} type="number" min={config.type === 'ADJUSTMENT' ? '0' : '0.001'} step="0.001" value={config.type === 'ADJUSTMENT' ? line.countedQuantity : line.quantity} onChange={(event) => updateLine(line.key, config.type === 'ADJUSTMENT' ? 'countedQuantity' : 'quantity', event.target.value)} placeholder={config.type === 'ADJUSTMENT' ? 'Physical count' : 'Quantity'} required /><button type="button" className="icon-button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><X size={15} /></button></div>)}</div><div className="modal-actions"><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create draft'}</button></div></form></section></div>}
    {previewId && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">What-if preview</span><h2>Confirm stock movement</h2></div><button className="icon-button" aria-label="Close" onClick={() => setPreviewId(null)}><X size={18} /></button></div>{preview.isLoading ? <LoadingState /> : <div className="preview-list">{preview.data?.map((line) => <article className="preview-card" key={line.product.id}><strong>{line.product.name}</strong><div><span><small>Source before</small>{formatQuantity(line.sourceBefore ?? 0, line.product.unit.symbol)}</span><ArrowRight size={18} /><span><small>Source after</small>{formatQuantity(line.sourceAfter ?? 0, line.product.unit.symbol)}</span></div><div><span><small>Destination before</small>{formatQuantity(line.destinationBefore ?? 0, line.product.unit.symbol)}</span><ArrowRight size={18} /><span><small>Destination after</small>{formatQuantity(line.destinationAfter ?? 0, line.product.unit.symbol)}</span></div></article>)}</div>}<p className="preview-note">The database is unchanged until you confirm. For internal transfers, total company stock remains constant.</p><div className="modal-actions"><button className="button" onClick={() => setPreviewId(null)}>Back</button><button className="button primary" onClick={() => action.mutate({ id: previewId, name: 'validate' })} disabled={action.isPending}><Check size={16} /> Confirm and validate</button></div></section></div>}
  </>;
}

function OperationActions({ operation, busy, onAction, onPreview }: { operation: Operation; busy: boolean; onAction: (action: string) => void; onPreview: () => void }) {
  if (operation.status === 'DONE' || operation.status === 'CANCELED') return <span className="table-muted">Finalized</span>;
  if (operation.type === 'DELIVERY') {
    if (operation.status === 'DRAFT') return <button className="button compact" disabled={busy} onClick={() => onAction('pick')}>Pick</button>;
    if (operation.status === 'WAITING') return <button className="button compact" disabled={busy} onClick={() => onAction('pack')}>Pack</button>;
    return <button className="button compact primary" disabled={busy} onClick={() => onAction('validate')}>Validate</button>;
  }
  if (operation.type === 'INTERNAL_TRANSFER') return <button className="button compact" disabled={busy} onClick={onPreview}><Eye size={14} /> Preview</button>;
  return <button className="button compact primary" disabled={busy} onClick={() => onAction('validate')}>Validate</button>;
}
