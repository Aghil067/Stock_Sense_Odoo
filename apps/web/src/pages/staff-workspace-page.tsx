import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, PackageCheck, PackageSearch, Truck, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, formatDate } from '../lib/api';
import type { Operation, StaffWorkspaceData } from '../types';

export function StaffWorkspacePage() {
  const workspaceQuery = useQuery({
    queryKey: ['staff-workspace'],
    queryFn: () => api<StaffWorkspaceData>('/staff/workspace'),
  });

  if (workspaceQuery.isLoading) {
    return <LoadingState />;
  }

  if (workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <div className="notice error" role="alert">
        Failed to load staff workspace tasks. Please refresh or try again.
      </div>
    );
  }

  const { summary, picking, packing, receiving, transfers, counting } = workspaceQuery.data;

  return (
    <div className="staff-workspace">
      <PageHeader
        eyebrow="Warehouse Operations"
        title="Staff Workspace"
        description="Quick access to active warehouse task queues: picking, packing, receiving, internal transfers, and physical counts."
      />

      {/* Operational Task Metric Cards */}
      <section className="stats-grid" aria-label="Warehouse Task Queues">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Picking Queue</span>
            <div className="stat-icon-wrapper tone-blue"><PackageSearch size={19} /></div>
          </div>
          <div className="stat-value">{summary?.pickingCount ?? 0}</div>
          <p className="stat-subtext">Deliveries waiting to be picked</p>
          <Link to="/staff/picking" className="text-link">
            Go to Picking <ArrowRight size={14} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Packing & Dispatch</span>
            <div className="stat-icon-wrapper tone-green"><PackageCheck size={19} /></div>
          </div>
          <div className="stat-value">{summary?.packingCount ?? 0}</div>
          <p className="stat-subtext">Picked shipments ready to pack</p>
          <Link to="/staff/packing" className="text-link">
            Go to Packing <ArrowRight size={14} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Receiving / Shelving</span>
            <div className="stat-icon-wrapper tone-ink"><Truck size={19} /></div>
          </div>
          <div className="stat-value">{summary?.receivingCount ?? 0}</div>
          <p className="stat-subtext">Incoming vendor receipts</p>
          <Link to="/staff/receiving" className="text-link">
            Go to Receiving <ArrowRight size={14} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Internal Transfers</span>
            <div className="stat-icon-wrapper tone-slate"><Warehouse size={19} /></div>
          </div>
          <div className="stat-value">{summary?.transfersCount ?? 0}</div>
          <p className="stat-subtext">Inter-location movements</p>
          <Link to="/staff/transfers" className="text-link">
            Go to Transfers <ArrowRight size={14} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Inventory Counting</span>
            <div className="stat-icon-wrapper tone-amber"><ClipboardList size={19} /></div>
          </div>
          <div className="stat-value">{summary?.countingCount ?? 0}</div>
          <p className="stat-subtext">Physical stock adjustments</p>
          <Link to="/staff/counting" className="text-link">
            Go to Counting <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Task Queue Detail Tables */}
      <div className="workspace-sections">
        {/* Picking Tasks */}
        <section className="panel table-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Task Queue · Picking</span>
              <h2>Picking Tasks (Draft Deliveries)</h2>
              <small className="table-sub">Deliveries requiring stock reservation and picking</small>
            </div>
            <Link to="/staff/picking" className="button compact">
              Go to Picking Queue <ArrowRight size={14} />
            </Link>
          </div>
          <OperationTable operations={picking} targetRoute="/staff/picking" emptyTitle="No pending picking tasks" emptyMsg="All customer delivery orders have been picked or processed." />
        </section>

        {/* Packing Tasks */}
        <section className="panel table-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Task Queue · Packing</span>
              <h2>Packing Tasks (Picked Deliveries)</h2>
              <small className="table-sub">Picked orders ready for final validation and shipping</small>
            </div>
            <Link to="/staff/packing" className="button compact">
              Go to Packing Queue <ArrowRight size={14} />
            </Link>
          </div>
          <OperationTable operations={packing} targetRoute="/staff/packing" emptyTitle="No pending packing tasks" emptyMsg="All picked items are packed." />
        </section>

        {/* Receiving / Shelving */}
        <section className="panel table-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Task Queue · Receiving</span>
              <h2>Receiving & Shelving</h2>
              <small className="table-sub">Vendor shipments awaiting receipt validation into warehouse locations</small>
            </div>
            <Link to="/staff/receiving" className="button compact">
              Go to Receiving Queue <ArrowRight size={14} />
            </Link>
          </div>
          <OperationTable operations={receiving} targetRoute="/staff/receiving" emptyTitle="No pending receipts" emptyMsg="No incoming shipments waiting for reception." />
        </section>

        {/* Internal Transfers */}
        <section className="panel table-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Task Queue · Transfers</span>
              <h2>Internal Transfers</h2>
              <small className="table-sub">Stock movements pending between internal warehouse locations</small>
            </div>
            <Link to="/staff/transfers" className="button compact">
              Go to Transfer Queue <ArrowRight size={14} />
            </Link>
          </div>
          <OperationTable operations={transfers} targetRoute="/staff/transfers" emptyTitle="No pending transfers" emptyMsg="No inter-location moves currently scheduled." />
        </section>

        {/* Inventory Counting */}
        <section className="panel table-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Task Queue · Audits</span>
              <h2>Inventory Counting / Physical Adjustments</h2>
              <small className="table-sub">Pending physical inventory count reconciliations</small>
            </div>
            <Link to="/staff/counting" className="button compact">
              Go to Counting Queue <ArrowRight size={14} />
            </Link>
          </div>
          <OperationTable operations={counting} targetRoute="/staff/counting" emptyTitle="No pending counts" emptyMsg="No physical inventory count tasks requiring validation." />
        </section>
      </div>
    </div>
  );
}

function OperationTable({
  operations,
  targetRoute,
  emptyTitle,
  emptyMsg,
}: {
  operations?: Operation[];
  targetRoute?: string;
  emptyTitle: string;
  emptyMsg: string;
}) {
  if (!operations || !operations.length) {
    return <EmptyState title={emptyTitle} message={emptyMsg} />;
  }

  const kindMap: Record<string, string> = {
    RECEIPT: '/staff/receiving',
    DELIVERY: '/staff/picking',
    INTERNAL_TRANSFER: '/staff/transfers',
    ADJUSTMENT: '/staff/counting',
  };

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Route / Partner</th>
            <th>Products</th>
            <th>Scheduled / Created</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => {
            const lineCount = op.lines?.length ?? 0;
            const productNames = op.lines?.map((l) => l.product?.name).filter(Boolean).join(', ') || '—';
            const routeOrPartner =
              op.partnerName ||
              (op.sourceLocation?.name || op.destinationLocation?.name
                ? `${op.sourceLocation?.name ?? 'External'} → ${op.destinationLocation?.name ?? 'External'}`
                : '—');

            return (
              <tr key={op.id}>
                <td>
                  <strong>{op.reference}</strong>
                  <small className="table-sub">Created by {op.createdBy?.name || 'Staff'}</small>
                </td>
                <td>
                  <strong>{routeOrPartner}</strong>
                  {op.reason && <small className="table-sub">{op.reason}</small>}
                </td>
                <td>
                  {lineCount} line{lineCount === 1 ? '' : 's'}
                  <small className="table-sub">{productNames}</small>
                </td>
                <td>{formatDate(op.scheduledAt || op.createdAt)}</td>
                <td>
                  <StatusBadge value={op.status} />
                </td>
                <td>
                  <Link
                    to={targetRoute || kindMap[op.type] || '/staff'}
                    className="button compact primary"
                  >
                    Open Task <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
