import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Database, Send, ShieldCheck, Sparkles, Trash2, AlertTriangle, Boxes, Shuffle, Truck } from 'lucide-react';
import { PageHeader, StatusBadge } from '../components/app-shell';
import { Dialog } from '../components/dialog';
import { api, formatDate, formatQuantity } from '../lib/api';
import type { Operation } from '../types';

type Transfer = { productId: string; product: string; sku: string; unit: string; sourceLocationId: string; source: string; destinationLocationId: string; destination: string; quantity: string };
type Evidence = { title: string; source: string; asOf: string; note: string; total: number; columns: string[]; rows: Record<string, string | number>[]; transfers?: Transfer[]; tool: string; metrics?: Array<{ label: string; value: string | number }> };
type Answer = { answer: string; evidence: Evidence[]; toolsUsed: string[]; asOf: string };
type Message = { id: number; role: 'user' | 'assistant'; content: string; result?: Answer };
const prompts = [
  { text: "What's low in stock?", icon: Boxes }, { text: 'What needs attention today?', icon: AlertTriangle },
  { text: 'Find transfer opportunities', icon: Shuffle }, { text: 'Which products may run out next week?', icon: Sparkles },
  { text: 'Show pending receipts', icon: Truck }, { text: 'Show recent inventory corrections', icon: ShieldCheck },
];

export function AiPage() {
  const [params] = useSearchParams();
  const [draft, setDraft] = useState(() => (params.get('q') ?? '').slice(0, 1500));
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [created, setCreated] = useState<Operation | null>(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ configured: boolean; provider: string; model: string | null }>('/ai/status'), retry: false });
  const chat = useMutation({ mutationFn: ({ question, history }: { question: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }) => api<Answer>('/ai/chat', { method: 'POST', body: JSON.stringify({ message: question, history }) }),
    onSuccess: result => { setMessages(current => [...current, { id: Date.now(), role: 'assistant' as const, content: result.answer, result }].slice(-24)); },
  });
  const transfer = useMutation({ mutationFn: (item: Transfer) => api<Operation>('/ai/transfer-drafts', { method: 'POST', body: JSON.stringify({ productId: item.productId, sourceLocationId: item.sourceLocationId, destinationLocationId: item.destinationLocationId }) }),
    onSuccess: async operation => { setCreated(operation); setSelectedTransfer(null); await client.invalidateQueries(); },
  });
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, chat.isPending, chat.isError]);
  function send(question = draft, retry = false) {
    const text = question.trim(); if (!text || text.length > 1500 || chat.isPending) return;
    const history = (retry ? messages.slice(0, -1) : messages).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 3000) }));
    if (!retry) setMessages(current => [...current, { id: Date.now(), role: 'user' as const, content: text }].slice(-24));
    setDraft(''); setLastQuestion(text); chat.mutate({ question: text, history });
  }
  const lastResult = [...messages].reverse().find(message => message.result)?.result;
  return <>
    <PageHeader eyebrow="Inventory intelligence" title="StockSense AI" description="A conversation with your inventory. Grounded in live PostgreSQL records." actions={<button className="button" disabled={chat.isPending || !messages.length} onClick={() => { setMessages([]); chat.reset(); setCreated(null); }}><Trash2 size={16} />New conversation</button>} />
    <div className="ai-workspace"><section className="panel ai-conversation" aria-label="Inventory conversation">
      <div className="ai-conversation-heading"><div className="ai-mark"><Sparkles size={21} /></div><div><strong>Your inventory intelligence assistant</strong><small>Read-only analysis · manager-controlled actions</small></div></div>
      {status.isError && <div className="notice error" role="alert">Cannot load AI configuration. <button className="text-link button-link" onClick={() => void status.refetch()}>Retry</button></div>}
      {status.data && !status.data.configured && <div className="notice" role="status"><strong>AI is not configured yet.</strong> Add AI_API_KEY and AI_MODEL to the backend environment and restart the API. No simulated answers will be shown. Your inventory workflows remain available.</div>}
      <div className="ai-transcript" aria-live="polite" aria-busy={chat.isPending}>
        {!messages.length && <div className="ai-welcome"><span className="ai-welcome-icon"><Sparkles size={34} /></span><span className="eyebrow">From stock to decisions</span><h2>What should we look into?</h2><p>Find shortages, understand stock movements, and discover where an internal transfer could help.</p><div className="prompt-grid">{prompts.map(({ text, icon: Icon }) => <button key={text} disabled={chat.isPending || !status.data?.configured} onClick={() => send(text)}><Icon size={18} /><span>{text}</span><ArrowRight size={15} /></button>)}</div></div>}
        {messages.map(message => <article className={`ai-message ai-message-${message.role}`} key={message.id}><div className="ai-message-label">{message.role === 'assistant' ? <><Sparkles size={15} />StockSense AI</> : 'You'}</div><p className="ai-answer-text">{message.content}</p>{message.result?.evidence.map((block, index) => <EvidenceCard key={`${block.tool}-${index}`} block={block} onTransfer={item => { transfer.reset(); setSelectedTransfer(item); }} />)}{message.result && <small className="ai-answer-time">Snapshot {formatDate(message.result.asOf)} · ask again to refresh</small>}</article>)}
        {chat.isPending && <div className="ai-thinking" role="status"><Sparkles size={17} /><span>StockSense is analyzing inventory…</span><span className="thinking-dots">•••</span></div>}
        {chat.isError && <div className="notice error" role="alert"><p>{chat.error.message}</p><button className="button" onClick={() => send(lastQuestion, true)}>Retry question</button></div>}
        {created && <div className="audit-link-card" role="status"><strong>Draft {created.reference} created</strong><p>No inventory moved. Review and validate through the normal transfer workflow.</p><Link className="text-link" to={`/operations/transfers?search=${encodeURIComponent(created.reference)}`}>Review transfer draft <ArrowRight size={14} /></Link></div>}
        <div ref={bottom} />
      </div>
      <form className="ai-composer" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor="inventory-question" className="sr-only">Ask about inventory</label><textarea id="inventory-question" value={draft} maxLength={1500} rows={2} placeholder="Ask about stock, replenishment, transfers or movement history…" disabled={chat.isPending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} /><div className="ai-composer-footer"><small>{draft.length}/1500 · Shift+Enter for a new line</small><button className="button primary" disabled={!draft.trim() || chat.isPending || !status.data?.configured}><Send size={16} />{chat.isPending ? 'Analyzing…' : 'Send'}</button></div></form>
    </section><aside className="ai-context"><section className="panel"><div className="panel-heading"><h2>Analysis context</h2><Database size={18} /></div><dl><dt>Provider</dt><dd>{status.data?.provider ?? 'Loading configuration'}</dd><dt>Availability</dt><dd>{status.isError ? 'Unavailable' : status.data?.configured ? 'Configured · not connection-tested' : status.isPending ? 'Loading' : 'Setup required'}</dd><dt>Database evidence</dt><dd>{lastResult ? `Last read ${formatDate(lastResult.asOf)}` : 'Read on each question'}</dd><dt>Scope</dt><dd>Manager inventory · all warehouses unless narrowed</dd></dl></section><section className="panel ai-context-note"><ShieldCheck size={22} /><h3>You stay in control</h3><p>AI tools can read inventory, not move it. Transfer drafts require your approval. Reversals are only available in the stock ledger.</p><p>Selected inventory facts are sent to OpenAI when you submit. Passwords, OTPs and API keys are never tool data.</p><Link to="/ledger" className="text-link">Open stock ledger</Link></section>{lastResult && <section className="panel ai-context-note"><h3>Tools used</h3><ul>{lastResult.toolsUsed.map(tool => <li key={tool}>{tool.replaceAll('_', ' ')}</li>)}</ul><p>Cards are calculated by backend services. AI text can still make mistakes; review the evidence before acting.</p></section>}</aside></div>
    {selectedTransfer && <Dialog label="Create recommended transfer draft" busy={transfer.isPending} onClose={() => setSelectedTransfer(null)}><div className="modal-header"><h2>Create transfer draft</h2></div><div className="form-stack"><p><strong>{selectedTransfer.product}</strong> · {selectedTransfer.sku}</p><p>{selectedTransfer.source} → {selectedTransfer.destination}</p><p>Suggested: <strong>{formatQuantity(selectedTransfer.quantity, selectedTransfer.unit)}</strong></p><div className="notice">The server recalculates the recommendation using current stock before saving. The draft quantity may change. This action does not move inventory.</div>{transfer.isError && <div className="notice error" role="alert">{transfer.error.message}</div>}<div className="modal-actions"><button className="button" disabled={transfer.isPending} onClick={() => setSelectedTransfer(null)}>Cancel</button><button className="button primary" disabled={transfer.isPending} onClick={() => transfer.mutate(selectedTransfer)}>{transfer.isPending ? 'Saving draft…' : 'Confirm draft'}</button></div></div></Dialog>}
  </>;
}

function EvidenceCard({ block, onTransfer }: { block: Evidence; onTransfer: (item: Transfer) => void }) {
  return <section className="evidence-card"><div className="evidence-heading"><div><span className="eyebrow">Database evidence</span><h3>{block.title}</h3></div><span className="count-pill">{block.total} matches</span></div>
    {block.metrics && <div className="evidence-metrics">{block.metrics.map(metric => <div key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></div>)}</div>}
    {!block.rows.length ? !block.metrics?.length && <p className="evidence-empty">No matching records found in this scope.</p> : block.transfers ? <div className="transfer-recommendations">{block.transfers.map((item, index) => <article key={`${item.productId}-${index}`}><div><strong>{item.product}</strong><small>{item.sku} · {item.source} → {item.destination}</small></div><strong>{formatQuantity(item.quantity, item.unit)}</strong><button className="button compact" onClick={() => onTransfer(item)}>Create transfer draft</button></article>)}</div> : <div className="table-scroll"><table><thead><tr>{block.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{block.columns.map(column => <td key={column}>{column === 'Risk' || column === 'Status' ? <StatusBadge value={String(row[column] ?? 'UNKNOWN')} /> : String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
    <p className="evidence-method">{block.note}</p><footer>Source: {block.source} · {block.columns.length ? `${block.rows.length} of ${block.total} rows shown` : `${block.metrics?.length ?? 0} metrics`} · {formatDate(block.asOf)}</footer></section>;
}
