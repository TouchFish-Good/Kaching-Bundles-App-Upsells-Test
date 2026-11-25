import { useEffect, useRef } from 'react';
import styles from '../pages/quantity-breaks.module.css';
import { BridgeConfirmation } from './BridgeConfirmation';

type Props = {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: HTMLElement | null;
};

export function TierDeleteDialog({ title, body, cancelLabel, confirmLabel, onCancel, onConfirm, returnFocus }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancelRef.current(); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);

  return <BridgeConfirmation title={title} content={body} type="danger" onCancel={onCancel} onConfirm={onConfirm} fallback={<div className={styles.modalScrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tier-delete-title" aria-describedby="tier-delete-body">
      <h2 id="tier-delete-title">{title}</h2>
      <p id="tier-delete-body">{body}</p>
      <div className={styles.tierDialogActions}>
        <button ref={cancelRef} type="button" className={styles.tierDialogCancel} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={styles.tierDialogDelete} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>} />;
}
