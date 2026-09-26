import { ArrowDownLeft, ArrowUpRight, Eye, Filter, RotateCcw, Search, Shuffle, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, apiPage, formatDate, formatQuantity } from '../lib/api';
import type { Category, LedgerEntry, Product, Unit, Warehouse } from '../types';
import { useAuth } from '../auth-context';
import { RecoveryDialog } from '../components/recovery-dialog';
import { Dialog } from '../components/dialog';

type LedgerResponse = {
  data: LedgerEntry[];
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

function formatRoute(entry: LedgerEntry) {
  if (entry.reversalOfId && entry.movementType === 'INTERNAL_TRANSFER') return `${entry.destinationLocation?.name ?? 'Original destination'} → ${entry.sourceLocation?.name ?? 'Original source'} (reversal)`;
  const srcLoc = entry.sourceLocation;
  const dstLoc = entry.destinationLocation;

  const srcStr = srcLoc ? `${srcLoc.warehouse ? srcLoc.warehouse.name + ' / ' : ''}${srcLoc.name}` : 'External';
  const dstStr = dstLoc ? `${dstLoc.warehouse ? dstLoc.warehouse.name + ' / ' : ''}${dstLoc.name}` : 'External';

  if (entry.movementType === 'ADJUSTMENT') {
    const loc = srcLoc || dstLoc;
    return loc ? `${loc.warehouse ? loc.warehouse.name + ' / ' : ''}${loc.name}` : 'Stock Location';
  }

  return `${srcStr} → ${dstStr}`;
}

function formatBalanceChange(entry: LedgerEntry) {
  if (entry.movementType === 'RECEIPT') {
    return `Dest: ${formatQuantity(entry.destinationBefore ?? 0)} → ${formatQuantity(entry.destinationAfter ?? 0)}`;
  }
  if (entry.movementType === 'DELIVERY') {
    return `Src: ${formatQuantity(entry.sourceBefore ?? 0)} → ${formatQuantity(entry.sourceAfter ?? 0)}`;
  }
  if (entry.movementType === 'INTERNAL_TRANSFER') {
    return `Src: ${formatQuantity(entry.sourceBefore ?? 0)} → ${formatQuantity(entry.sourceAfter ?? 0)} | Dest: ${formatQuantity(entry.destinationBefore ?? 0)} → ${formatQuantity(entry.destinationAfter ?? 0)}`;
  }
  if (entry.movementType === 'ADJUSTMENT') {
    const before = entry.sourceBefore ?? entry.destinationBefore ?? 0;
    const after = entry.sourceAfter ?? entry.destinationAfter ?? 0;
    return `Loc: ${formatQuantity(before)} → ${formatQuantity(after)}`;
  }
  return '—';
}

function formatQuantityWithSign(entry: LedgerEntry) {
  const qty = Number(entry.quantity);
  const symbol = entry.product?.unit?.symbol ?? '';

  if (entry.movementType === 'RECEIPT') {
    return `${entry.reversalOfId ? '-' : '+'}${formatQuantity(Math.abs(qty), symbol)}`;
  }
  if (entry.movementType === 'DELIVERY') {
    return `${entry.reversalOfId ? '+' : '-'}${formatQuantity(Math.abs(qty), symbol)}`;
  }
  if (entry.movementType === 'ADJUSTMENT') {
    const sign = qty > 0 ? '+' : qty < 0 ? '-' : '';
    return `${sign}${formatQuantity(Math.abs(qty), symbol)}`;
  }
  return formatQuantity(Math.abs(qty), symbol);
}

export function LedgerPage() {
  const { user } = useAuth();
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [params, setParams] = useSearchParams();
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', 'ledger-filter'],
    queryFn: () => api<Product[]>('/products'),
  });

  const masterQuery = useQuery({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data'),
  });

  const query = useQuery({
    queryKey: ['ledger', params.toString()],
    queryFn: () => apiPage<LedgerResponse>(`/ledger?${params.toString()}`),
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
  const movementTypeVal = params.get('movementType') ?? '';
  const productIdVal = params.get('productId') ?? '';
  const locationIdVal = params.get('locationId') ?? '';
  const fromVal = params.get('from')?.slice(0, 10) ?? '';
  const toVal = params.get('to')?.slice(0, 10) ?? '';
  const currentPage = Number(params.get('page') || '1');

  const hasActiveFilters = Boolean(searchVal || movementTypeVal || productIdVal || locationIdVal || fromVal || toVal || params.get('audit'));

  const locations = masterQuery.data?.warehouses.flatMap((warehouse) =>
    warehouse.locations.map((location) => ({
      ...location,
      warehouseName: warehouse.name,
    }))
  ) ?? [];

  const ledgerData = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  return (
    <>
      <PageHeader
        eyebrow="Immutable audit trail"
        title="Stock ledger"
        description="Every completed movement, who performed it, and the stock balance before and after."
      />

      <section className="toolbar panel">
        <select aria-label="Audit record type" value={params.get('audit') ?? ''} onChange={event => update('audit', event.target.value)}><option value="">All audit records</option><option value="original">Original movements</option><option value="reversed">Reversed originals</option><option value="reversal">Reversal entries</option></select>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search ledger"
            value={searchVal}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search reference, product or SKU…"
          />
        </div>
        <div className="filter-group">
          <Filter size={16} />
          <select
            aria-label="Movement type"
            value={movementTypeVal}
            onChange={(event) => update('movementType', event.target.value)}
          >
            <option value="">All movement types</option>
            <option value="RECEIPT">Receipt</option>
            <option value="DELIVERY">Delivery</option>
            <option value="INTERNAL_TRANSFER">Internal transfer</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>

          <select
            aria-label="Filter by product"
            value={productIdVal}
            onChange={(event) => update('productId', event.target.value)}
          >
            <option value="">All products</option>
            {productsQuery.data?.map((prod) => (
              <option key={prod.id} value={prod.id}>
                {prod.name} ({prod.sku})
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

          <input
            aria-label="From date"
            type="date"
            value={fromVal}
            onChange={(event) => update('from', event.target.value ? new Date(event.target.value).toISOString() : '')}
          />
          <input
            aria-label="To date"
            type="date"
            value={toVal}
            onChange={(event) => {
              if (!event.target.value) {
                update('to', '');
              } else {
                const d = new Date(event.target.value);
                d.setHours(23, 59, 59, 999);
                update('to', d.toISOString());
              }
            }}
          />

          {hasActiveFilters && (
            <button type="button" className="button" onClick={resetFilters}>
              <RotateCcw size={15} /> Reset filters
            </button>
          )}
        </div>
      </section>

      <section className="panel table-panel">
        {query.isLoading ? (
          <LoadingState />
        ) : ledgerData.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Movement</th>
                    <th>Product</th>
                    <th>Route</th>
                    <th>Quantity</th>
                    <th>Balance change</th>
                    <th>Performed by</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.map((entry) => {
                    const isPositive = Number(entry.quantity) > 0;
                    const isNegative = Number(entry.quantity) < 0;
                    const isTransfer = entry.movementType === 'INTERNAL_TRANSFER';

                    return (
                      <tr key={entry.id}>
                        <td>
                          <div className="ledger-reference">
                            <div
                              className={`movement-icon ${
                                isTransfer ? 'tone-blue' : isPositive ? 'positive' : isNegative ? 'negative' : 'tone-slate'
                              }`}
                            >
                              {isTransfer ? (
                                <Shuffle size={15} />
                              ) : isPositive ? (
                                <ArrowDownLeft size={15} />
                              ) : (
                                <ArrowUpRight size={15} />
                              )}
                            </div>
                            <span>
                              <strong>{entry.reference}</strong>
                              {(entry.reversalOfId || entry.reversal) && <span className="audit-badge">{entry.reversalOfId ? 'Reversal' : 'Reversed'}</span>}
                              <small>{formatDate(entry.createdAt)}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong>{entry.product.name}</strong>
                          <small className="table-sub">{entry.product.sku}</small>
                        </td>
                        <td>{formatRoute(entry)}</td>
                        <td>
                          <strong>{formatQuantityWithSign(entry)}</strong>
                          <small className="table-sub">
                            <StatusBadge value={entry.movementType} />
                          </small>
                        </td>
                        <td>{formatBalanceChange(entry)}</td>
                        <td>
                          {entry.createdBy.name}
                          <small className="table-sub">{entry.reason || 'Operational movement'}</small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="View movement details"
                            title="View movement details"
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <Eye size={16} />
                          </button>
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
                  Showing Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total movements)
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
            title="No ledger entries found"
            message={
              hasActiveFilters
                ? 'No inventory movements match the selected filters. Try clearing or relaxing your filter options.'
                : 'Complete an inventory operation to create the first immutable movement record.'
            }
            action={
              hasActiveFilters ? (
                <button type="button" className="button" onClick={resetFilters}>
                  <RotateCcw size={15} /> Reset filters
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      {selectedEntry && (
        <Dialog label="Stock movement detail" onClose={() => setSelectedEntry(null)}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Immutable audit record</span>
                <h2>Stock movement detail</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close detail modal"
                onClick={() => setSelectedEntry(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-stack">
              {selectedEntry.reversalOf && <div className="audit-link-card"><strong>Compensating reversal</strong><p>Original record: <button className="text-link button-link" onClick={() => { setSelectedEntry(null); setParams({ search: selectedEntry.reversalOf!.reference }); }}>{selectedEntry.reversalOf.reference}</button></p><p>The location labels below refer to the original operation; before/after values show this correction's actual effect.</p></div>}
              {selectedEntry.reversal && <div className="audit-link-card"><strong>This movement has been reversed</strong><p><button className="text-link button-link" onClick={() => { setSelectedEntry(null); setParams({ search: selectedEntry.reversal!.reference }); }}>{selectedEntry.reversal.reference}</button> · {selectedEntry.reversal.createdBy.name} · {formatDate(selectedEntry.reversal.createdAt)}</p><p>{selectedEntry.reversal.reason}</p></div>}
              <div className="preview-card">
                <div style={{ borderTop: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <small>Operation Reference</small>
                    <strong style={{ fontSize: '16px' }}>{selectedEntry.reference}</strong>
                  </div>
                  <StatusBadge value={selectedEntry.movementType} />
                </div>
              </div>

              <div className="form-grid">
                <div className="preview-card">
                  <small>Product information</small>
                  <strong>{selectedEntry.product.name}</strong>
                  <span className="table-sub">SKU: {selectedEntry.product.sku}</span>
                  <span className="table-sub">Unit: {selectedEntry.product.unit.name} ({selectedEntry.product.unit.symbol})</span>
                </div>

                <div className="preview-card">
                  <small>Movement quantity</small>
                  <strong style={{ fontSize: '18px' }}>{formatQuantityWithSign(selectedEntry)}</strong>
                  <span className="table-sub">Movement Type: {selectedEntry.movementType}</span>
                  <span className="table-sub">Timestamp: {formatDate(selectedEntry.createdAt)}</span>
                </div>
              </div>

              <div className="form-grid">
                {selectedEntry.sourceLocation ? (
                  <div className="preview-card">
                    <small>Source location</small>
                    <strong>
                      {selectedEntry.sourceLocation.warehouse?.name} / {selectedEntry.sourceLocation.name}
                    </strong>
                    {selectedEntry.sourceBefore !== undefined && selectedEntry.sourceBefore !== null && (
                      <div style={{ marginTop: '8px' }}>
                        <small>Stock balance change</small>
                        <span>
                          {formatQuantity(selectedEntry.sourceBefore, selectedEntry.product.unit.symbol)} →{' '}
                          {formatQuantity(selectedEntry.sourceAfter ?? 0, selectedEntry.product.unit.symbol)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="preview-card">
                    <small>Source location</small>
                    <strong>External Supplier / Vendor</strong>
                    <span className="table-sub">Incoming receipt from external source</span>
                  </div>
                )}

                {selectedEntry.destinationLocation ? (
                  <div className="preview-card">
                    <small>Destination location</small>
                    <strong>
                      {selectedEntry.destinationLocation.warehouse?.name} / {selectedEntry.destinationLocation.name}
                    </strong>
                    {selectedEntry.destinationBefore !== undefined && selectedEntry.destinationBefore !== null && (
                      <div style={{ marginTop: '8px' }}>
                        <small>Stock balance change</small>
                        <span>
                          {formatQuantity(selectedEntry.destinationBefore, selectedEntry.product.unit.symbol)} →{' '}
                          {formatQuantity(selectedEntry.destinationAfter ?? 0, selectedEntry.product.unit.symbol)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="preview-card">
                    <small>Destination location</small>
                    <strong>External Customer / Consignee</strong>
                    <span className="table-sub">Outgoing shipment to external customer</span>
                  </div>
                )}
              </div>

              <div className="preview-card">
                <small>Audit attribution & reason</small>
                <div>
                  <span>Performed By</span>
                  <span><strong>{selectedEntry.createdBy.name}</strong></span>
                </div>
                <div>
                  <span>Movement Reason / Note</span>
                  <span>{selectedEntry.reason || 'Standard operational movement'}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              {user?.role === 'MANAGER' && selectedEntry.operationLine && !selectedEntry.reversalOfId && !selectedEntry.reversal && <button className="button" onClick={() => { setRecoveryId(selectedEntry.operationLine!.operationId); setSelectedEntry(null); }}>Reverse entire operation ({selectedEntry.operationLine.operation._count.lines} lines)</button>}
              <button type="button" className="button" onClick={() => setSelectedEntry(null)}>
                Close
              </button>
            </div>
        </Dialog>
      )}
      {success && <div className="notice" role="status">{success}<button className="text-link button-link" onClick={() => setSuccess('')}>Dismiss</button></div>}
      {recoveryId && <RecoveryDialog operationId={recoveryId} onClose={() => setRecoveryId(null)} onSuccess={reference => { setRecoveryId(null); setSuccess(`Reversal ${reference} recorded. The original audit record is preserved.`); setParams({ search: reference }); }} />}
    </>
  );
}


