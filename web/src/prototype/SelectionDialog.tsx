import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from '../pages/quantity-breaks.module.css';

type Props = {
  ariaLabel: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function SelectionDialog({ ariaLabel, title, closeLabel, onClose, children, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const focusInitialControl = () => (dialogRef.current?.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? dialogRef.current?.querySelector<HTMLElement>('button, input, [tabindex]'))?.focus();
    const frame = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(focusInitialControl) : window.setTimeout(focusInitialControl, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
      document.removeEventListener('keydown', onKeyDown);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  return <div className={styles.selectionDialogScrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={styles.selectionDialog} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <header><h2>{title}</h2><button type="button" className={styles.selectionDialogClose} aria-label={closeLabel} title={closeLabel} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
      <div className={styles.selectionDialogBody}>{children}</div>
      {footer && <footer className={styles.selectionDialogFooter}>{footer}</footer>}
    </section>
  </div>;
}
