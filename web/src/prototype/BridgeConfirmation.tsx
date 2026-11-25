import { useEffect, useRef, type ReactNode } from 'react';
import { useAppBridge } from '../hooks/useAppBridge';
import { isEmbeddedAdmin, openAdminConfirmation } from './admin-feedback';

export function BridgeConfirmation({ title, content, type, onConfirm, onCancel, fallback }: {
  title: string;
  content: string;
  type: 'confirm' | 'danger' | 'warn';
  onConfirm: () => void;
  onCancel: () => void;
  fallback: ReactNode;
}) {
  const app = useAppBridge();
  const embedded = isEmbeddedAdmin();
  const callbacks = useRef({ onConfirm, onCancel });
  callbacks.current = { onConfirm, onCancel };
  useEffect(() => {
    if (!embedded) return;
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      cleanup = openAdminConfirmation(app, {
        title, content, type,
        onConfirm: () => callbacks.current.onConfirm(),
        onCancel: () => callbacks.current.onCancel(),
      });
    }, 0);
    return () => { window.clearTimeout(timer); cleanup?.(); };
  }, [app, embedded, title, content, type]);
  return embedded ? null : fallback;
}
