import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Eye, PackageSearch, RotateCcw, Search, Warehouse, X } from 'lucide-react';
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

export function StaffTransfersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [error, setError] = useState('');

  const transfersQuery = useQuery({
    queryKey: ['staff-transfers', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'INTERNAL_TRANSFER',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  // Filter for pending internal transfers (DRAFT, WAITING, READY)
  const pendingTransfers = transfersQuery.data?.filter(
    (op) => op.status === 'DRAFT' || op.status === 'WAITING' || op.status === 'READY'
  );

  // Preview query for selected transfer
  const previewQuery = useQuery({
    queryKey: ['operation-preview', selectedOp?.id],
    queryFn: () => api<PreviewLine[]>(`/operations/${selectedOp?.id}/preview`),
    enabled: Boolean(selectedOp?.id),
  });

  // Validate transfer mutation (DRAFT -> DONE)
  const validateMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/validate`, { method: 'POST' }),
    onSuccess: async () => {
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-transfers'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Transfer execution failed.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  return (
    <div className="staff-transfers-page">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Internal Transfers"
        description="Inspect and execute scheduled stock transfers between internal warehouse locations."
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
            aria-label="Search internal transfers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, reason, location or SKU…"
          />
        </div>
        {search && (
          <button type="button" className="button" onClick={() => setSearch('')}>
            <RotateCcw size={15} /> Reset search
          </button>
        )}
      </section>

      <section className="panel table-panel">
        {transfersQuery.isLoading ? (
          <LoadingState />
        ) : pendingTransfers?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Source Location</th>
                  <th>Destination Location</th>
                  <th>Items</th>
                  <th>Scheduled / Created</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pendingTransfers.map((op) => {
                  const lineCount = op.lines?.length ?? 0;
                  const productList = op.lines?.map((l) => l.product?.name).filter(Boolean).join(', ') || '—';
                  const sourceLoc = op.sourceLocation
                    ? `${op.sourceLocation.warehouse?.name ?? 'Warehouse'} / ${op.sourceLocation.name}`
                    : 'Main Stock';
                  const destLoc = op.destinationLocation
                    ? `${op.destinationLocation.warehouse?.name ?? 'Warehouse'} / ${op.destinationLocation.name}`
                    : 'Main Stock';

                  return (
                    <tr key={op.id}>
                      <td>
                        <strong>{op.reference}</strong>
                        <small className="table-sub">Created by {op.createdBy?.name || 'Staff'}</small>
                      </td>
                      <td>{sourceLoc}</td>
                      <td>{destLoc}</td>
                      <td>
                        {lineCount} line{lineCount === 1 ? '' : 's'}
                        <small className="table-sub">{productList}</small>
                      </td>
                      <td>
                        {formatDate(op.scheduledAt || op.createdAt)}
                        {op.reason && <small className="table-sub">{op.reason}</small>}
                      </td>
                      <td>
                        <StatusBadge value={op.status} />
                      </td>
                      <td>
                        <div className="operation-actions">
                          <button
                            className="button compact primary"
                            onClick={() => setSelectedOp(op)}
                          >
                            <Warehouse size={14} /> Inspect & Transfer
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
            title="No pending transfers"
            message="There are currently no internal stock movements requiring transfer execution."
          />
        )}
      </section>

      {/* Transfer Inspection & Confirmation Modal */}
      {selectedOp && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Internal Transfer Inspection</span>
                <h2 id="transfer-dialog-title">Execute Transfer {selectedOp.reference}</h2>
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
                  <small className="table-sub">Source Location</small>
                  <strong>
                    {selectedOp.sourceLocation
                      ? `${selectedOp.sourceLocation.warehouse?.name ?? ''} / ${selectedOp.sourceLocation.name}`
                      : 'Main Stock'}
                  </strong>
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
                  <small className="table-sub">Reason / Memo</small>
                  <strong>{selectedOp.reason || 'Production allocation'}</strong>
                </div>
                <div>
                  <small className="table-sub">Status</small>
                  <div>
                    <StatusBadge value={selectedOp.status} />
                  </div>
                </div>
              </div>

              {/* Same Location Protection Notice */}
              {selectedOp.sourceLocationId &&
                selectedOp.destinationLocationId &&
                selectedOp.sourceLocationId === selectedOp.destinationLocationId && (
                  <div className="notice error" role="alert">
                    Source and destination locations cannot be identical. Please edit or cancel this transfer document.
                  </div>
                )}

              {/* Stock Movement Preview */}
              <div className="line-editor">
                <div className="line-editor-heading">
                  <strong>Transfer Items ({selectedOp.lines?.length ?? 0})</strong>
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
                          <th>Transfer Qty</th>
                          <th>Source Stock (Before → After)</th>
                          <th>Destination Stock (Before → After)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOp.lines?.map((line, idx) => {
                          const prevLine = previewQuery.data?.find((p) => p.product.id === line.product.id);
                          const srcBefore = prevLine?.sourceBefore != null ? prevLine.sourceBefore : '0';
                          const srcAfter = prevLine?.sourceAfter != null ? prevLine.sourceAfter : '0';
                          const destBefore = prevLine?.destinationBefore != null ? prevLine.destinationBefore : '0';
                          const destAfter = prevLine?.destinationAfter != null ? prevLine.destinationAfter : '0';
                          const isInsufficient = Number(srcAfter) < 0;

                          return (
                            <tr key={line.id}>
                              <td>{idx + 1}</td>
                              <td>
                                <strong>{line.product.name}</strong>
                              </td>
                              <td><code>{line.product.sku}</code></td>
                              <td>
                                <strong>{formatQuantity(line.quantity, line.product.unit?.symbol || '')}</strong>
                              </td>
                              <td>
                                {formatQuantity(srcBefore, line.product.unit?.symbol || '')} →{' '}
                                <span style={{ color: isInsufficient ? 'var(--color-red-600, #dc2626)' : 'inherit' }}>
                                  {formatQuantity(srcAfter, line.product.unit?.symbol || '')}
                                  {isInsufficient && ' (Insufficient Stock)'}
                                </span>
                              </td>
                              <td>
                                {formatQuantity(destBefore, line.product.unit?.symbol || '')} →{' '}
                                <strong>{formatQuantity(destAfter, line.product.unit?.symbol || '')}</strong>
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
                Confirming transfer will atomically move stock from source to destination location. Company-wide total stock balance remains unchanged.
              </p>

              <div className="modal-actions">
                <button className="button" onClick={() => setSelectedOp(null)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={
                    validateMutation.isPending ||
                    (selectedOp.sourceLocationId != null &&
                      selectedOp.sourceLocationId === selectedOp.destinationLocationId) ||
                    Boolean(
                      previewQuery.data?.some((line) => line.sourceBefore != null && Number(line.sourceAfter) < 0)
                    )
                  }
                  onClick={() => validateMutation.mutate(selectedOp.id)}
                >
                  <Check size={16} />
                  {validateMutation.isPending ? 'Executing…' : 'Confirm & Execute Transfer'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
