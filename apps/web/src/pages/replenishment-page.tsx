import { ArrowRight, ClipboardPlus, Filter, RotateCcw, Search, Shuffle, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, apiPage, ApiClientError, formatQuantity } from '../lib/api';
import type { Category, Unit, Warehouse } from '../types';

type InternalSource = {
  locationId: string;
  locationName: string;
  warehouseName: string;
  availableQty: string;
};

type WorkItem = {
  product: { id: string; name: string; sku: string; unit: Unit; category: Category };
  location: { id: string; name: string; warehouse: { id: string; name: string } };
  minimumQty: string;
  onHand: string;
  pendingIncoming: string;
  pendingOutgoing: string;
  projected: string;
  suggestedQuantity: string;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY';
  internalAvailable?: InternalSource[];
};

type ReplenishmentResponse = {
  data: WorkItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

type MasterData = {
  categories: Category[];
  units: Unit[];
  warehouses: Warehouse[];
};

export function ReplenishmentPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [receiptTarget, setReceiptTarget] = useState<WorkItem | null>(null);
  const [transferTarget, setTransferTarget] = useState<WorkItem | null>(null);
  const [selectedSourceLocId, setSelectedSourceLocId] = useState<string>('');
  const [error, setError] = useState('');

  const master = useQuery({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data'),
  });

  const query = useQuery({
    queryKey: ['replenishment', params.toString()],
    queryFn: () => apiPage<ReplenishmentResponse>(`/replenishment?${params.toString()}`),
  });

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setParams(next);
  }

  function resetFilters() {
    setParams(new URLSearchParams());
  }

  const searchVal = params.get('search') ?? '';
  const warehouseIdVal = params.get('warehouseId') ?? '';
  const locationIdVal = params.get('locationId') ?? '';
  const categoryIdVal = params.get('categoryId') ?? '';
  const statusVal = params.get('status') ?? '';
  const currentPage = Number(params.get('page') || '1');

  const hasActiveFilters = Boolean(searchVal || warehouseIdVal || locationIdVal || categoryIdVal || statusVal);

  const createReceipt = useMutation({
    mutationFn: ({ supplier, item }: { supplier: string; item: WorkItem }) =>
      api('/operations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'RECEIPT',
          partnerName: supplier,
          destinationLocationId: item.location.id,
          reason: 'Replenishment worklist suggestion',
          lines: [{ productId: item.product.id, quantity: Number(item.suggestedQuantity) }],
        }),
      }),
    onSuccess: async () => {
      setReceiptTarget(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (cause) =>
      setError(cause instanceof ApiClientError ? cause.message : 'The receipt draft could not be created.'),
  });

  const createTransfer = useMutation({
    mutationFn: ({ sourceLocId, item }: { sourceLocId: string; item: WorkItem }) =>
      api('/operations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'INTERNAL_TRANSFER',
          sourceLocationId: sourceLocId,
          destinationLocationId: item.location.id,
          reason: 'Replenishment internal stock rebalancing',
          lines: [{ productId: item.product.id, quantity: Number(item.suggestedQuantity) }],
        }),
      }),
    onSuccess: async () => {
      setTransferTarget(null);
      setSelectedSourceLocId('');
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (cause) =>
      setError(cause instanceof ApiClientError ? cause.message : 'The transfer draft could not be created.'),
  });

  function handleReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiptTarget) return;
    const supplier = String(new FormData(event.currentTarget).get('supplier') || '').trim();
    if (supplier.length < 2) {
      setError('Enter a supplier name of at least two characters..');
      return;
    }
    createReceipt.mutate({ supplier, item: receiptTarget });
  }

  function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferTarget || !selectedSourceLocId) {
      setError('Select a source location with available internal stock.');
      return;
    }
    createTransfer.mutate({ sourceLocId: selectedSourceLocId, item: transferTarget });
  }

  const rows = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  const needsAction = rows.filter((item) => Number(item.suggestedQuantity) > 0).length;

  const locations = master.data?.warehouses
    .filter((wh) => !warehouseIdVal || wh.id === warehouseIdVal)
    .flatMap((wh) => wh.locations.map((loc) => ({ ...loc, warehouseName: wh.name }))) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Manager decision support"
        title="Replenishment worklist"
        description="See which product-location pairs need stock replenishment based on real-time reorder thresholds."
        actions={
          <Link className="button" to="/operations/receipts">
            View receipts <ArrowRight size={16} />
          </Link>
        }
      />

      <section className="toolbar panel">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search product or SKU"
            value={searchVal}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search product name or SKU…"
          />
        </div>
        <div className="filter-group">
          <Filter size={16} />
          <select
            aria-label="Filter by warehouse"
            value={warehouseIdVal}
            onChange={(event) => {
              update('warehouseId', event.target.value);
              update('locationId', '');
            }}
          >
            <option value="">All warehouses</option>
            {master.data?.warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by location"
            value={locationIdVal}
            onChange={(event) => update('locationId', event.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.warehouseName} / {loc.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by category"
            value={categoryIdVal}
            onChange={(event) => update('categoryId', event.target.value)}
          >
            <option value="">All categories</option>
            {master.data?.categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by replenishment status"
            value={statusVal}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ATTENTION">Attention required</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="HEALTHY">Healthy / Covered</option>
          </select>

          {hasActiveFilters && (
            <button type="button" className="button" onClick={resetFilters}>
              <RotateCcw size={15} /> Reset filters
            </button>
          )}
        </div>
      </section>

      <div className="notice replenishment-explainer">
        Projected stock = on-hand + pending receipts/transfers in − pending deliveries/transfers out. Suggested quantity brings projected stock up to the configured reorder level. Drafts do not change stock until validated.
      </div>

      <section className="panel table-panel">
        {query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <EmptyState
            title="Worklist unavailable"
            message="Could not calculate replenishment from the live database."
            action={
              <button type="button" className="button" onClick={() => void query.refetch()}>
                Retry
              </button>
            }
          />
        ) : rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product / Location</th>
                    <th>On hand</th>
                    <th>Incoming</th>
                    <th>Outgoing</th>
                    <th>Projected</th>
                    <th>Reorder level</th>
                    <th>Shortage</th>
                    <th>Status</th>
                    <th>Internal stock</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const hasShortage = Number(item.suggestedQuantity) > 0;
                    const internalSources = item.internalAvailable ?? [];

                    return (
                      <tr key={`${item.product.id}:${item.location.id}`}>
                        <td>
                          <strong>{item.product.name}</strong>
                          <small className="table-sub">
                            {item.product.sku} · {item.location.warehouse.name} / {item.location.name}
                          </small>
                        </td>
                        <td>{formatQuantity(item.onHand, item.product.unit.symbol)}</td>
                        <td>{formatQuantity(item.pendingIncoming)}</td>
                        <td>{formatQuantity(item.pendingOutgoing)}</td>
                        <td>
                          <strong>{formatQuantity(item.projected)}</strong>
                        </td>
                        <td>{formatQuantity(item.minimumQty)}</td>
                        <td>
                          <strong>{formatQuantity(item.suggestedQuantity)}</strong>
                        </td>
                        <td>
                          <StatusBadge value={item.status} />
                        </td>
                        <td>
                          {internalSources.length > 0 ? (
                            <div className="table-sub" style={{ color: 'var(--green)' }}>
                              {internalSources.map((src) => (
                                <div key={src.locationId}>
                                  {src.warehouseName} / {src.locationName}: {formatQuantity(src.availableQty, item.product.unit.symbol)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="table-muted">None</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                            {hasShortage && (
                              <button
                                type="button"
                                className="button compact primary"
                                onClick={() => {
                                  setReceiptTarget(item);
                                  setError('');
                                }}
                              >
                                <ClipboardPlus size={14} /> Draft receipt
                              </button>
                            )}
                            {hasShortage && internalSources.length > 0 && (
                              <button
                                type="button"
                                className="button compact"
                                onClick={() => {
                                  setTransferTarget(item);
                                  setSelectedSourceLocId(internalSources[0].locationId);
                                  setError('');
                                }}
                              >
                                <Shuffle size={14} /> Transfer stock
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="panel-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="table-sub" style={{ fontSize: '12px' }}>
                  Showing Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} items matching filters)
                </span>
                <div className="filter-group">
                  <button
                    type="button"
                    className="button compact"
                    disabled={currentPage <= 1}
                    onClick={() => update('page', String(currentPage - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button compact"
                    disabled={currentPage >= pagination.totalPages}
                    onClick={() => update('page', String(currentPage + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title={hasActiveFilters ? 'No matching items' : 'No reorder rules configured'}
            message={
              hasActiveFilters
                ? 'No replenishment items match the selected filter criteria.'
                : 'Set a product reorder level for a location to generate live replenishment recommendations.'
            }
            action={
              hasActiveFilters ? (
                <button type="button" className="button" onClick={resetFilters}>
                  <RotateCcw size={15} /> Reset filters
                </button>
              ) : (
                <Link className="button" to="/products">
                  Open products
                </Link>
              )
            }
          />
        )}
      </section>

      {receiptTarget && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="receipt-draft-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">External replenishment</span>
                <h2 id="receipt-draft-title">Draft a receipt</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setReceiptTarget(null);
                  setError('');
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="preview-note">
              Prepare {formatQuantity(receiptTarget.suggestedQuantity, receiptTarget.product.unit.symbol)} of{' '}
              {receiptTarget.product.name} for {receiptTarget.location.warehouse.name} / {receiptTarget.location.name}.
              This creates a draft receipt only; stock balance changes ONLY when the receipt is validated.
            </p>

            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}

            <form className="form-stack" onSubmit={handleReceiptSubmit}>
              <label>
                Supplier / Vendor name
                <input name="supplier" required minLength={2} maxLength={120} placeholder="Supplier name" />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setReceiptTarget(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={createReceipt.isPending}>
                  {createReceipt.isPending ? 'Creating…' : 'Create receipt draft'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {transferTarget && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="transfer-draft-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Internal stock rebalancing</span>
                <h2 id="transfer-draft-title">Draft an internal transfer</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setTransferTarget(null);
                  setSelectedSourceLocId('');
                  setError('');
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="preview-note">
              Transfer suggested {formatQuantity(transferTarget.suggestedQuantity, transferTarget.product.unit.symbol)} of{' '}
              {transferTarget.product.name} to {transferTarget.location.warehouse.name} / {transferTarget.location.name}.
              This creates a draft transfer only; stock balance changes ONLY when the transfer is validated.
            </p>

            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}

            <form className="form-stack" onSubmit={handleTransferSubmit}>
              <label>
                Source location with available stock
                <select
                  value={selectedSourceLocId}
                  onChange={(event) => setSelectedSourceLocId(event.target.value)}
                  required
                >
                  <option value="">Select source location</option>
                  {transferTarget.internalAvailable?.map((src) => (
                    <option key={src.locationId} value={src.locationId}>
                      {src.warehouseName} / {src.locationName} (Available: {formatQuantity(src.availableQty, transferTarget.product.unit.symbol)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setTransferTarget(null);
                    setSelectedSourceLocId('');
                    setError('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={createTransfer.isPending}>
                  {createTransfer.isPending ? 'Creating…' : 'Create transfer draft'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
