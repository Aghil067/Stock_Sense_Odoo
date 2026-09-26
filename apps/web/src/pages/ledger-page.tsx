import { ArrowDownLeft, ArrowUpRight, Filter, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/app-shell';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { LedgerEntry } from '../types';

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const query = useQuery({ queryKey: ['ledger', params.toString()], queryFn: () => api<LedgerEntry[]>(`/ledger?${params.toString()}`) });
  function update(key: string, value: string) { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); }
  return <>
    <PageHeader eyebrow="Immutable audit trail" title="Stock ledger" description="Every completed movement, who performed it, and the balance before and after." />
    <section className="toolbar panel"><div className="search-box"><Search size={17} /><input aria-label="Search ledger" value={params.get('search') ?? ''} onChange={(event) => update('search', event.target.value)} placeholder="Search reference, product or SKU…" /></div><div className="filter-group"><Filter size={16} /><select aria-label="Movement type" value={params.get('movementType') ?? ''} onChange={(event) => update('movementType', event.target.value)}><option value="">All movement types</option><option value="RECEIPT">Receipt</option><option value="DELIVERY">Delivery</option><option value="INTERNAL_TRANSFER">Internal transfer</option><option value="ADJUSTMENT">Adjustment</option></select><input aria-label="From date" type="date" value={params.get('from')?.slice(0,10) ?? ''} onChange={(event) => update('from', event.target.value)} /></div></section>
    <section className="panel table-panel">{query.isLoading ? <LoadingState /> : query.data?.length ? <div className="table-scroll"><table><thead><tr><th>Movement</th><th>Product</th><th>Route</th><th>Quantity</th><th>Balance change</th><th>Performed by</th></tr></thead><tbody>{query.data.map((entry) => <tr key={entry.id}><td><div className="ledger-reference"><div className={`movement-icon ${Number(entry.quantity) >= 0 ? 'positive' : 'negative'}`}>{Number(entry.quantity) >= 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</div><span><strong>{entry.reference}</strong><small>{formatDate(entry.createdAt)}</small></span></div></td><td><strong>{entry.product.name}</strong><small className="table-sub">{entry.product.sku}</small></td><td>{entry.sourceLocation?.name ?? 'External'} → {entry.destinationLocation?.name ?? 'External'}</td><td><strong>{Number(entry.quantity) > 0 ? '+' : ''}{formatQuantity(entry.quantity, entry.product.unit.symbol)}</strong><small className="table-sub"><StatusBadge value={entry.movementType} /></small></td><td>{entry.sourceBefore !== null && entry.sourceBefore !== undefined ? `${formatQuantity(entry.sourceBefore)} → ${formatQuantity(entry.sourceAfter ?? 0)}` : `${formatQuantity(entry.destinationBefore ?? 0)} → ${formatQuantity(entry.destinationAfter ?? 0)}`}</td><td>{entry.createdBy.name}<small className="table-sub">{entry.reason || 'Operational movement'}</small></td></tr>)}</tbody></table></div> : <EmptyState title="No ledger entries" message="Complete an inventory operation to create the first immutable movement record." />}</section>
  </>;
}

