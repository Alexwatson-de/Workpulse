import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X, AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, set] = useState<{ id: number; message: string; error: boolean }[]>([]);
  const push = (message: string, error = false) => { const id = Date.now() + Math.random(); set(t => [...t.slice(-3), { id, message, error }]); setTimeout(() => set(t => t.filter(v => v.id !== id)), 7000); };
  return <ToastContext.Provider value={push}>{children}<div className="toasts" aria-live="polite">{toasts.map(t => <div className={`toast ${t.error ? 'error' : ''}`} key={t.id}>{t.error ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{t.message}</span><button aria-label="Dismiss notification" onClick={() => set(v => v.filter(x => x.id !== t.id))}><X size={16}/></button></div>)}</div></ToastContext.Provider>;
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const root = document.getElementById('root'); const wasInert = root?.inert ?? false; if (root) root.inert = true;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(e => !e.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); if (e.key === 'Tab') { const els = focusables(); const first = els[0], last = els.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; if (root) root.inert = wasInert; if (before?.isConnected) before.focus(); };
  }, []);
  return createPortal(<div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X/></button></div>{children}</div></div>, document.body);
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><div className="empty-icon"><Inbox size={26}/></div><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
export function Skeleton() { return <div className="skeleton-grid" aria-label="Loading records" role="status">{[1, 2, 3, 4].map(v => <div className="skeleton" key={v}/>)}</div>; }
export function Badge({ status }: { status: string }) { return <span className={`badge ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>; }
export function Stat({ title, value, note, icon }: { title: string; value: ReactNode; note: string; icon: ReactNode }) { return <div className="stat card"><div className="stat-top"><span>{title}</span><div className="stat-icon">{icon}</div></div><strong>{value}</strong><small>{note}</small></div>; }
export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) { return <>{busy ? <LoaderCircle size={16} className="spin"/> : null}{children}</>; }
export function download(name: string, content: string, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function Pagination({ page, setPage, total, size = 10 }: { page: number; setPage: (v: number) => void; total: number; size?: number }) { const pages = Math.max(1, Math.ceil(total / size)); return <div className="pagination"><span>{total ? `${Math.min((page - 1) * size + 1, total)}–${Math.min(page * size, total)} of ${total}` : '0 records'}</span><div><button className="button secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span> {page} / {pages} </span><button className="button secondary small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>; }
