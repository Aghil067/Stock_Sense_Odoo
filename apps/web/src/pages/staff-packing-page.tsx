import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Eye, PackageCheck, RotateCcw, Search, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, ApiClientError, formatDate, formatQuantity } from '../lib/api';
import type { Operation, Product } from '../types';

type PreviewLine = {
  product: Product;
  quantity: string;
  sourceBefore?: string;
  sourceAfter?: string;
  destinationBefore?: string;
  destinationAfter?: string;
};

export function StaffPackingPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'packing' | 'dispatch'>('packing');
  const [search, setSearch] = useState('');
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // 1. Query for Packing queue (WAITING)
  const packingQuery = useQuery({
    queryKey: ['staff-packing', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'DELIVERY',
          status: 'WAITING',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  // 2. Query for Dispatch queue (READY)
  const dispatchQuery = useQuery({
    queryKey: ['staff-dispatch', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'DELIVERY',
          status: 'READY',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  // 3. Preview query for validation
  const previewQuery = useQuery({
    queryKey: ['operation-preview', previewId],
    queryFn: () => api<PreviewLine[]>(`/operations/${previewId}/preview`),
    enabled: Boolean(previewId),
  });

  // Pack mutation (WAITING -> READY)
  const packMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/pack`, { method: 'POST' }),
    onSuccess: async () => {
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-picking'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-packing'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Failed to pack delivery order.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  // Validate mutation (READY -> DONE)
  const validateMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/validate`, { method: 'POST' }),
    onSuccess: async () => {
      setPreviewId(null);
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-packing'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Validation failed.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  const activeData = tab === 'packing' ? packingQuery : dispatchQuery;
  const isPacking = tab === 'packing';

  return (
    <div className="staff-packing-page">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Packing & Dispatch Queue"
        description="Verify picked packages, mark delivery orders as packed, and execute final stock validation upon dispatch."
      />

      {error && (
        <div className="notice error dismissible" style={{ marginBottom: '1rem' }}>
          {error}
          <button aria-label="Dismiss" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-group">
        <button
          className={`button ${isPacking ? 'primary' : ''}`}
          onClick={() => setTab('packing')}
        >
          <PackageCheck size={16} /> Packing Queue ({packingQuery.data?.length || 0})
        </button>
        <button
          className={`button ${!isPacking ? 'primary' : ''}`}
          onClick={() => setTab('dispatch')}
        >
          <Truck size={16} /> Ready to Dispatch ({dispatchQuery.data?.length || 0})
        </button>
      </div>

      <section className="toolbar panel">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, customer or product SKU…"
          />
        </div>
        {search && (
          <button type="button" className="button" onClick={() => setSearch('')}>
            <RotateCcw size={15} /> Reset search
          </button>
        )}
      </section>

      <section className="panel table-panel">
        {activeData.isLoading ? (
          <LoadingState />
        ) : activeData.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Source Location</th>
                  <th>Items</th>
                  <th>Scheduled / Created</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeData.data.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <strong>{op.reference}</strong>
                      <small className="table-sub">Created by {op.createdBy.name}</small>
                    </td>
                    <td>
                      <strong>{op.partnerName || '—'}</strong>
                    </td>
                    <td>
                      {op.sourceLocation
                        ? `${op.sourceLocation.warehouse?.name ?? 'Warehouse'} / ${op.sourceLocation.name}`
                        : 'Main Stock'}
                    </td>
                    <td>
                      {op.lines.length} line{op.lines.length === 1 ? '' : 's'}
                      <small className="table-sub">
                        {op.lines.map((l) => l.product.name).join(', ')}
                      </small>
                    </td>
                    <td>{formatDate(op.scheduledAt || op.createdAt)}</td>
                    <td>
                      <StatusBadge value={op.status} />
                    </td>
                    <td>
                      <div className="operation-actions">
                        {isPacking ? (
                          <button
                            className="button compact primary"
                            onClick={() => setSelectedOp(op)}
                          >
                            <Eye size={14} /> Inspect & Pack
                          </button>
                        ) : (
                          <button
                            className="button compact primary"
                            onClick={() => setPreviewId(op.id)}
                          >
                            <Truck size={14} /> Validate & Dispatch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={isPacking ? 'No shipments waiting to pack' : 'No shipments ready to dispatch'}
            message={
              isPacking
                ? 'All picked customer delivery orders have been packed.'
                : 'There are currently no packed deliveries waiting for final dispatch validation.'
            }
          />
        )}
      </section>

      {/* Inspect & Pack Modal */}
      {selectedOp && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="pack-dialog-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Step 2 — Packing Confirmation</span>
                <h2 id="pack-dialog-title">Pack Order {selectedOp.reference}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setSelectedOp(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-stack">
              <div className="form-grid">
                <div>
                  <small className="table-sub">Customer / Partner</small>
                  <strong>{selectedOp.partnerName || 'Unassigned'}</strong>
                </div>
                <div>
                  <small className="table-sub">Source Location</small>
                  <strong>
                    {selectedOp.sourceLocation
                      ? `${selectedOp.sourceLocation.warehouse?.name ?? ''} / ${selectedOp.sourceLocation.name}`
                      : 'Main Stock'}
                  </strong>
                </div>
                <div>
                  <small className="table-sub">Scheduled Date</small>
                  <strong>{selectedOp.scheduledAt ? formatDate(selectedOp.scheduledAt) : 'Immediate'}</strong>
                </div>
                <div>
                  <small className="table-sub">Current Status</small>
                  <div>
                    <StatusBadge value={selectedOp.status} />
                  </div>
                </div>
              </div>

              <div className="line-editor">
                <div className="line-editor-heading">
                  <strong>Picked Items to Pack ({selectedOp.lines.length})</strong>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product Name</th>
                        <th>SKU</th>
                        <th>Location</th>
                        <th>Quantity to Pack</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOp.lines.map((line, idx) => (
                        <tr key={line.id}>
                          <td>{idx + 1}</td>
                          <td>
                            <strong>{line.product.name}</strong>
                          </td>
                          <td><code>{line.product.sku}</code></td>
                          <td>{selectedOp.sourceLocation?.name || 'Main Stock'}</td>
                          <td>
                            <strong>{formatQuantity(line.quantity, line.product.unit?.symbol || '')}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="preview-note">
                Packing updates delivery order status from <strong>WAITING</strong> to <strong>READY</strong>. It signifies items are packed in shipping boxes and ready for final validation.
              </p>

              <div className="modal-actions">
                <button className="button" onClick={() => setSelectedOp(null)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={packMutation.isPending}
                  onClick={() => packMutation.mutate(selectedOp.id)}
                >
                  <Check size={16} />
                  {packMutation.isPending ? 'Packing…' : 'Confirm Packing'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Stock Preview & Final Validation Modal (READY -> DONE) */}
      {previewId && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Step 3 — Stock Preview & Final Dispatch</span>
                <h2 id="preview-title">Validate Delivery Shipment</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setPreviewId(null)}
              >
                <X size={18} />
              </button>
            </div>

            {previewQuery.isLoading ? (
              <LoadingState />
            ) : previewQuery.isError ? (
              <div className="notice error" role="alert">
                Could not calculate stock preview. Please check network connectivity.
              </div>
            ) : (
              <div className="preview-list">
                {previewQuery.data?.map((line) => {
                  const isInsufficient = line.sourceBefore != null && Number(line.sourceAfter) < 0;
                  return (
                    <article
                      className={`preview-card ${isInsufficient ? 'insufficient-stock' : ''}`}
                      key={line.product.id}
                    >
                      <div className="preview-card-header">
                        <strong>{line.product.name}</strong>
                        {isInsufficient && (
                          <span className="status-badge status-canceled">INSUFFICIENT STOCK</span>
                        )}
                      </div>
                      {line.sourceBefore != null && (
                        <div>
                          <span>
                            <small>Stock before</small>
                            {formatQuantity(line.sourceBefore, line.product.unit.symbol)}
                          </span>
                          <ArrowRight size={18} />
                          <span>
                            <small>Stock after dispatch</small>
                            {isInsufficient ? (
                              <strong style={{ color: 'var(--color-red-600, #dc2626)' }}>
                                INVALID ({formatQuantity(line.sourceAfter ?? 0, line.product.unit.symbol)})
                              </strong>
                            ) : (
                              formatQuantity(line.sourceAfter ?? 0, line.product.unit.symbol)
                            )}
                          </span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <p className="preview-note">
              Confirming validation will decrement source location inventory balances and generate immutable delivery stock ledger entries.
            </p>

            <div className="modal-actions">
              <button className="button" onClick={() => setPreviewId(null)}>
                Back
              </button>
              <button
                className="button primary"
                onClick={() => validateMutation.mutate(previewId)}
                disabled={
                  validateMutation.isPending ||
                  !previewQuery.data ||
                  Boolean(
                    previewQuery.data?.some(
                      (line) => line.sourceBefore != null && Number(line.sourceAfter) < 0
                    )
                  )
                }
              >
                <Check size={16} />
                {validateMutation.isPending ? 'Validating…' : 'Confirm & Validate Dispatch'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
