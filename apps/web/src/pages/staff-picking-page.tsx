import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Eye, Filter, PackageSearch, RotateCcw, Search, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, ApiClientError, formatDate, formatQuantity } from '../lib/api';
import type { Operation } from '../types';

export function StaffPickingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [error, setError] = useState('');

  const pickingQuery = useQuery({
    queryKey: ['staff-picking', search],
    queryFn: () =>
      api<Operation[]>(
        `/operations?${new URLSearchParams({
          type: 'DELIVERY',
          status: 'DRAFT',
          ...(search ? { search } : {}),
        })}`
      ),
  });

  const pickMutation = useMutation({
    mutationFn: (id: string) => api(`/operations/${id}/pick`, { method: 'POST' }),
    onSuccess: async () => {
      setSelectedOp(null);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-picking'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-packing'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-workspace'] }),
      ]);
    },
    onError: (cause) => {
      let msg = cause instanceof ApiClientError ? cause.message : 'Failed to pick delivery order.';
      if (cause instanceof ApiClientError && cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
        const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
        if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
      }
      setError(msg);
    },
  });

  return (
    <div className="staff-picking-page">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Picking Queue"
        description="Select draft customer delivery orders to inspect items and confirm picking from source locations."
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
            aria-label="Search picking orders.."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, customer or, product SKU…"
          />
        </div>
        {search && (
          <button type="button" className="button" onClick={() => setSearch('')}>
            <RotateCcw size={15} /> Reset search
          </button>
        )}
      </section>

      <section className="panel table-panel">
        {pickingQuery.isLoading ? (
          <LoadingState />
        ) : pickingQuery.data?.length ? (
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
                {pickingQuery.data.map((op) => (
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
                        <button
                          className="button compact primary"
                          onClick={() => setSelectedOp(op)}
                        >
                          <Eye size={14} /> Inspect & Pick
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No picking tasks waiting"
            message="There are currently no draft delivery orders requiring picking."
          />
        )}
      </section>

      {/* Picking Inspection Modal */}
      {selectedOp && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="pick-dialog-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Step 1 — Picking Inspection</span>
                <h2 id="pick-dialog-title">Pick Order {selectedOp.reference}</h2>
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
                  <small className="table-sub">Status</small>
                  <div>
                    <StatusBadge value={selectedOp.status} />
                  </div>
                </div>
              </div>

              <div className="line-editor">
                <div className="line-editor-heading">
                  <strong>Items to Pick ({selectedOp.lines.length})</strong>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product Name</th>
                        <th>SKU</th>
                        <th>Location</th>
                        <th>Required Quantity</th>
                        <th>Available Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOp.lines.map((line, idx) => {
                        const locId = selectedOp.sourceLocationId || selectedOp.sourceLocation?.id;
                        const balance = line.product.balances?.find((b) => b.locationId === locId);
                        const avail = balance ? Number(balance.quantity) : Number(line.product.totalStock || 0);
                        const isShort = avail < Number(line.quantity);

                        return (
                          <tr key={line.id}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{line.product.name}</strong>
                            </td>
                            <td><code>{line.product.sku}</code></td>
                            <td>
                              {selectedOp.sourceLocation?.name || 'Main Stock'}
                            </td>
                            <td>
                              <strong>{formatQuantity(line.quantity, line.product.unit?.symbol || '')}</strong>
                            </td>
                            <td>
                              <span style={{ color: isShort ? 'var(--color-red-600, #dc2626)' : 'inherit' }}>
                                {formatQuantity(avail, line.product.unit?.symbol || '')}
                                {isShort && ' (Low Stock Alert)'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="preview-note">
                Picking changes order status from <strong>DRAFT</strong> to <strong>WAITING</strong> (Picked). Physical stock is not decremented until final validation/dispatch.
              </p>

              <div className="modal-actions">
                <button className="button" onClick={() => setSelectedOp(null)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={pickMutation.isPending}
                  onClick={() => pickMutation.mutate(selectedOp.id)}
                >
                  <Check size={16} />
                  {pickMutation.isPending ? 'Picking…' : 'Confirm Picking'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
