import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { Dialog } from './dialog';
import { LoadingState } from './app-shell';
import { api, formatQuantity } from '../lib/api';

type Preview = { reference: string; type: string; canReverse: boolean; warning: string; lines: Array<{ originalLineId: string; product: { name: string; sku: string; unit: string }; effects: Array<{ side: string; locationId: string; locationName: string; delta: string; before: string; after: string }> }> };
export function RecoveryDialog({ operationId, onClose, onSuccess }: { operationId: string; onClose: () => void; onSuccess: (reference: string) => void }) {
  const client = useQueryClient();
  const [reason, setReason] = useState(''); const [notes, setNotes] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const preview = useQuery({ queryKey: ['reversal-preview', operationId], queryFn: () => api<Preview>(`/operations/${operationId}/reversal-preview`), staleTime: 0, retry: false });
  const mutation = useMutation({ mutationFn: () => api<{ reference: string }>(`/operations/${operationId}/reverse`, { method: 'POST', body: JSON.stringify({ reason, notes: notes.trim() }) }),
    onSuccess: async result => { await client.invalidateQueries(); onSuccess(result.reference); },
    onError: () => { setConfirmed(false); void preview.refetch(); },
  });
  return <Dialog label="Reverse inventory operation" busy={mutation.isPending} onClose={onClose}>
    <div className="modal-header"><div><span className="eyebrow">Inventory recovery</span><h2>Reverse movement</h2></div><button className="icon-button" aria-label="Close recovery" disabled={mutation.isPending} onClick={onClose}><X size={18} /></button></div>
    <div className="recovery-warning"><AlertTriangle size={22} /><div><strong>This reverses the entire operation, not just one product.</strong><p>The original record stays unchanged. A new, linked correction offsets its stock effect against current balances.</p></div></div>
    {preview.isPending ? <LoadingState /> : preview.isError ? <div className="notice error" role="alert">{preview.error.message}</div> : <form className="form-stack" onSubmit={event => { event.preventDefault(); if (confirmed && preview.data.canReverse) mutation.mutate(); }}>
      <div className="recovery-reference"><strong>{preview.data.reference}</strong><span>{preview.data.lines.length} affected product line(s)</span></div>
      <div className="table-scroll"><table><thead><tr><th>Product / location</th><th>Current</th><th>Correction</th><th>After reversal</th></tr></thead><tbody>{preview.data.lines.flatMap(line => line.effects.map(effect => <tr key={`${line.originalLineId}-${effect.side}`}><td><strong>{line.product.name}</strong><small className="table-sub">{line.product.sku} · {effect.locationName}</small></td><td>{formatQuantity(effect.before, line.product.unit)}</td><td>{Number(effect.delta) > 0 ? '+' : ''}{formatQuantity(effect.delta, line.product.unit)}</td><td><strong className={Number(effect.after) < 0 ? 'negative' : ''}>{formatQuantity(effect.after, line.product.unit)}</strong></td></tr>))}</tbody></table></div>
      <p className={preview.data.canReverse ? 'chart-note' : 'notice error'}>{preview.data.warning}</p>
      <label>Reason<select value={reason} onChange={event => setReason(event.target.value)} required disabled={mutation.isPending}><option value="">Choose a reason</option>{['Wrong quantity', 'Wrong product', 'Wrong location', 'Duplicate operation', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Audit notes<textarea value={notes} onChange={event => setNotes(event.target.value)} minLength={5} maxLength={1000} required disabled={mutation.isPending} placeholder="Explain the correction for the next person reviewing this audit trail." rows={3} /></label>
      <label className="confirmation-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={mutation.isPending} />I reviewed every affected line and authorize this compensating stock movement.</label>
      {mutation.isError && <div className="notice error" role="alert">{mutation.error.message}</div>}
      <div className="modal-actions"><button type="button" className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button><button className="button primary" disabled={!preview.data.canReverse || !confirmed || !reason || notes.trim().length < 5 || mutation.isPending}><ShieldCheck size={16} />{mutation.isPending ? 'Recording reversal…' : 'Confirm reversal'}</button></div>
    </form>}
  </Dialog>;
}
