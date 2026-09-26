import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Eye, PackageSearch, RotateCcw, Search, Truck, X } from 'lucide-react';
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

export function StaffReceivingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [error, setError] = useState('');

  const receivingQuery = useQuery({
    queryKey: ['staff-receiving', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'RECEIPT',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  // Filter for pending receipts (DRAFT, WAITING, READY)
  const pendingReceipts = receivingQuery.data?.filter(
    (op) => op.status === 'DRAFT' || op.status === 'WAITING' || op.status === 'READY'
  );

  // Preview query for selected receipt
  const previewQuery = useQuery({
    queryKey: ['operation-preview', selectedOp?.id],
    queryFn: () => api<PreviewLine[]>(`/operations/${selectedOp?.id}/preview`),
    enabled: Boolean(selectedOp?.id),
  });

  // Validate receipt mutation (DRAFT -> DONE)
  const validateMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/validate`, { method: 'POST' }),
    onSuccess: async () => {
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-receiving'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Receipt validation failed.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  return (
    <div className="staff-receiving-page">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Receiving & Shelving"
        description="Review incoming vendor shipments and confirm stock placement into warehouse locations."
      />

      {error && (
        <div className="notice error dismissible" style={{ marginBottom: '1rem' }}>
          {error}
          <button aria-label="Dismiss" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}

      <section className="toolbar panel">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search receipts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, supplier or product SKU…"
          />
        </div>
        {search && (
          <button type="button" className="button" onClick={() => setSearch('')}>
            <RotateCcw size={15} /> Reset search
          </button>
        )}
      </section>

      <section className="panel table-panel">
        {receivingQuery.isLoading ? (
          <LoadingState />
        ) : pendingReceipts?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Supplier</th>
                  <th>Destination Location</th>
                  <th>Items</th>
                  <th>Scheduled / Created</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pendingReceipts.map((op) => {
                  const lineCount = op.lines?.length ?? 0;
                  const productList = op.lines?.map((l) => l.product?.name).filter(Boolean).join(', ') || '—';
                  const destLoc = op.destinationLocation
                    ? `${op.destinationLocation.warehouse?.name ?? 'Warehouse'} / ${op.destinationLocation.name}`
                    : 'Main Stock';

                  return (
                    <tr key={op.id}>
                      <td>
                        <strong>{op.reference}</strong>
                        <small className="table-sub">Created by {op.createdBy?.name || 'Staff'}</small>
                      </td>
                      <td>
                        <strong>{op.partnerName || 'Supplier'}</strong>
                      </td>
                      <td>{destLoc}</td>
                      <td>
                        {lineCount} line{lineCount === 1 ? '' : 's'}
                        <small className="table-sub">{productList}</small>
                      </td>
                      <td>{formatDate(op.scheduledAt || op.createdAt)}</td>
                      <td>
                        <StatusBadge value={op.status} />
                      </td>
                      <td>
                        <div className="operation-actions">
                          <button
                            className="button compact primary"
                            onClick={() => setSelectedOp(op)}
                          >
                            <Truck size={14} /> Inspect & Shelve
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No incoming receipts"
            message="There are currently no vendor shipments waiting for reception and shelving."
          />
        )}
      </section>

      {/* Receiving & Shelving Inspection Modal */}
      {selectedOp && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="receive-dialog-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Receiving & Shelving Inspection</span>
                <h2 id="receive-dialog-title">Receive Shipment {selectedOp.reference}</h2>
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
                  <small className="table-sub">Supplier / Vendor</small>
                  <strong>{selectedOp.partnerName || 'Unassigned'}</strong>
                </div>
                <div>
                  <small className="table-sub">Destination Location</small>
                  <strong>
                    {selectedOp.destinationLocation
                      ? `${selectedOp.destinationLocation.warehouse?.name ?? ''} / ${selectedOp.destinationLocation.name}`
                      : 'Main Stock'}
                  </strong>
                </div>
                <div>
                  <small className="table-sub">Scheduled Date</small>
                  <strong>{selectedOp.scheduledAt ? formatDate(selectedOp.scheduledAt) : 'Immediate'}</strong>
                </div>
                <div>
                  <small className="table-sub">Status</small>
                  <div>
                    <StatusBadge value={selectedOp.status} />
                  </div>
                </div>
              </div>

              {/* Stock Movement Preview */}
              <div className="line-editor">
                <div className="line-editor-heading">
                  <strong>Incoming Items to Shelve ({selectedOp.lines?.length ?? 0})</strong>
                </div>

                {previewQuery.isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Product Name</th>
                          <th>SKU</th>
                          <th>Received Qty</th>
                          <th>Current Stock</th>
                          <th>Stock After Shelving</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOp.lines?.map((line, idx) => {
                          const prevLine = previewQuery.data?.find((p) => p.product.id === line.product.id);
                          const destBefore = prevLine?.destinationBefore != null ? prevLine.destinationBefore : '0';
                          const destAfter = prevLine?.destinationAfter != null ? prevLine.destinationAfter : line.quantity;

                          return (
                            <tr key={line.id}>
                              <td>{idx + 1}</td>
                              <td>
                                <strong>{line.product.name}</strong>
                              </td>
                              <td><code>{line.product.sku}</code></td>
                              <td>
                                <strong>+{formatQuantity(line.quantity, line.product.unit?.symbol || '')}</strong>
                              </td>
                              <td>{formatQuantity(destBefore, line.product.unit?.symbol || '')}</td>
                              <td>
                                <strong style={{ color: 'var(--color-green-700, #15803d)' }}>
                                  {formatQuantity(destAfter, line.product.unit?.symbol || '')}
                                </strong>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="preview-note">
                Confirming receipt verifies that incoming goods have been physically checked and placed into destination stock locations. Inventory balances will be updated immediately.
              </p>

              <div className="modal-actions">
                <button className="button" onClick={() => setSelectedOp(null)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={validateMutation.isPending}
                  onClick={() => validateMutation.mutate(selectedOp.id)}
                >
                  <Check size={16} />
                  {validateMutation.isPending ? 'Confirming…' : 'Confirm Receipt & Shelve'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
