import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ children, label, onClose, busy = false }: { children: ReactNode; label: string; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={ref} className="native-dialog" aria-label={label} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
