import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardList, Eye, RotateCcw, Save, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

type LineCountDraft = {
  lineId: string;
  productId: string;
  countedQuantity: string;
};

export function StaffCountingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [countsDraft, setCountsDraft] = useState<LineCountDraft[]>([]);
  const [error, setError] = useState('');

  const countingQuery = useQuery({
    queryKey: ['staff-counting', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'ADJUSTMENT',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  const pendingCounts = countingQuery.data?.filter(
    (op) => op.status === 'DRAFT' || op.status === 'WAITING' || op.status === 'READY'
  );

  const previewQuery = useQuery({
    queryKey: ['operation-preview', selectedOp?.id],
    queryFn: () => api<PreviewLine[]>(`/operations/${selectedOp?.id}/preview`),
    enabled: Boolean(selectedOp?.id),
  });

  useEffect(() => {
    if (selectedOp) {
      setCountsDraft(
        selectedOp.lines?.map((line) => ({
          lineId: line.id,
          productId: line.product.id,
          countedQuantity: line.countedQuantity != null ? String(line.countedQuantity) : '0',
        })) || []
      );
    } else {
      setCountsDraft([]);
    }
  }, [selectedOp]);

  // Save count draft mutation (PATCH /api/operations/:id/count)
  const saveCountMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/operations/${id}/count`, {
        method: 'PATCH',
        body: JSON.stringify({
          lines: countsDraft.map((c) => ({
            lineId: c.lineId,
            countedQuantity: Number(c.countedQuantity),
          })),
        }),
      }),
    onSuccess: async () => {
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-counting'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Failed to save physical counts.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  // Validate count mutation (POST /api/operations/:id/validate)
  const validateMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/validate`, { method: 'POST' }),
    onSuccess: async () => {
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-counting'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['replenishment'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Inventory count validation failed.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  function updateDraftCount(lineId: string, val: string) {
    setCountsDraft((current) =>
      current.map((c) => (c.lineId === lineId ? { ...c, countedQuantity: val } : c))
    );
  }

  const hasInvalidInput = countsDraft.some(
    (c) => c.countedQuantity === '' || Number.isNaN(Number(c.countedQuantity)) || Number(c.countedQuantity) < 0
  );

  return (
    <div className="staff-counting-page">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Inventory Counting"
        description="Perform physical inventory counts and reconcile recorded stock with physical location counts."
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
            aria-label="Search count tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, location, reason or SKU…"
          />
        </div>
        {search && (
          <button type="button" className="button" onClick={() => setSearch('')}>
            <RotateCcw size={15} /> Reset search
          </button>
        )}
      </section>

      <section className="panel table-panel">
        {countingQuery.isLoading ? (
          <LoadingState />
        ) : pendingCounts?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Stock Location</th>
                  <th>Reason / Memo</th>
                  <th>Items</th>
                  <th>Scheduled / Created</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pendingCounts.map((op) => {
                  const lineCount = op.lines?.length ?? 0;
                  const productList = op.lines?.map((l) => l.product?.name).filter(Boolean).join(', ') || '—';
                  const locName = op.sourceLocation
                    ? `${op.sourceLocation.warehouse?.name ?? 'Warehouse'} / ${op.sourceLocation.name}`
                    : 'Main Stock';

                  return (
                    <tr key={op.id}>
                      <td>
                        <strong>{op.reference}</strong>
                        <small className="table-sub">Created by {op.createdBy?.name || 'Staff'}</small>
                      </td>
                      <td>{locName}</td>
                      <td>
                        <strong>{op.reason || 'Physical Count'}</strong>
                      </td>
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
                            <ClipboardList size={14} /> Inspect & Count
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
            title="No inventory counting tasks"
            message="There are currently no physical stock count reconciliations pending."
          />
        )}
      </section>

      {/* Count Inspection & Reconcile Modal */}
      {selectedOp && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="count-dialog-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Physical Count & Reconciliation</span>
                <h2 id="count-dialog-title">Inventory Count {selectedOp.reference}</h2>
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
                  <small className="table-sub">Stock Location</small>
                  <strong>
                    {selectedOp.sourceLocation
                      ? `${selectedOp.sourceLocation.warehouse?.name ?? ''} / ${selectedOp.sourceLocation.name}`
                      : 'Main Stock'}
                  </strong>
                </div>
                <div>
                  <small className="table-sub">Reason / Memo</small>
                  <strong>{selectedOp.reason || 'Cycle count'}</strong>
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

              {/* Physical Counts & Discrepancy Table */}
              <div className="line-editor">
                <div className="line-editor-heading">
                  <strong>Items to Count ({selectedOp.lines?.length ?? 0})</strong>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product Name</th>
                        <th>SKU</th>
                        <th>System Stock</th>
                        <th>Physical Count</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOp.lines?.map((line, idx) => {
                        const prevLine = previewQuery.data?.find((p) => p.product.id === line.product.id);
                        const sysStock = prevLine?.sourceBefore != null ? Number(prevLine.sourceBefore) : 0;
                        const draftObj = countsDraft.find((c) => c.lineId === line.id);
                        const physCount = draftObj ? Number(draftObj.countedQuantity) : Number(line.countedQuantity ?? 0);
                        const diff = physCount - sysStock;
                        const symbol = line.product.unit?.symbol || '';

                        return (
                          <tr key={line.id}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{line.product.name}</strong>
                            </td>
                            <td><code>{line.product.sku}</code></td>
                            <td>{formatQuantity(sysStock, symbol)}</td>
                            <td style={{ minWidth: '140px' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                aria-label={`Physical count for ${line.product.name}`}
                                value={draftObj?.countedQuantity ?? ''}
                                onChange={(e) => updateDraftCount(line.id, e.target.value)}
                                style={{ width: '110px' }}
                                required
                              />
                            </td>
                            <td>
                              <strong
                                style={{
                                  color:
                                    diff > 0
                                      ? 'var(--color-green-700, #15803d)'
                                      : diff < 0
                                      ? 'var(--color-red-600, #dc2626)'
                                      : 'inherit',
                                }}
                              >
                                {diff > 0 ? `+${formatQuantity(diff, symbol)}` : formatQuantity(diff, symbol)}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="preview-note">
                Confirming count updates destination stock balance to match the verified physical count. Stock ledger entries will record the calculated difference.
              </p>

              <div className="modal-actions">
                <button className="button" onClick={() => setSelectedOp(null)}>
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={saveCountMutation.isPending || hasInvalidInput}
                  onClick={() => saveCountMutation.mutate(selectedOp.id)}
                >
                  <Save size={16} />
                  {saveCountMutation.isPending ? 'Saving…' : 'Save Physical Counts'}
                </button>
                <button
                  className="button primary"
                  disabled={validateMutation.isPending || saveCountMutation.isPending || hasInvalidInput}
                  onClick={() => validateMutation.mutate(selectedOp.id)}
                >
                  <Check size={16} />
                  {validateMutation.isPending ? 'Validating…' : 'Confirm & Validate Count'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
