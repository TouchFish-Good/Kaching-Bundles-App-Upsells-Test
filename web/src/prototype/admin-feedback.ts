import { Loading, Message, Modal, ModalAction, SaveBar, SaveBarAction } from '@shoplineos/app-bridge';
import type { useAppBridge } from '../hooks/useAppBridge';
import { isEmbeddedContext } from './embedded-context';

type App = ReturnType<typeof useAppBridge>;
type Tone = 'success' | 'error' | 'notice';
const embeddedAtEntry = isEmbeddedContext();

export function isEmbeddedAdmin() {
  return embeddedAtEntry;
}

export function showAdminMessage(app: App, message: string, tone: Tone) {
  Message.create(app).open({ type: tone === 'notice' ? 'info' : tone, messageInfo: message });
}

export function beginAdminLoading(app: App) {
  const loading = Loading.create(app);
  loading.trigger();
  return () => loading.exit();
}

export function openEditorExitConfirmation(app: App, options: {
  content: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
}) {
  const saveBar = SaveBar.create(app);
  let closed = false;
  const cleanup = () => { if (closed) return; closed = true; unsubscribe(); };
  const unsubscribe = saveBar.subscribe(SaveBarAction.EXIT_SAVE_BAR_CONFIRM, () => {
    if (closed) return;
    cleanup();
    options.onConfirm();
  });
  saveBar.exitConfirm({ content: options.content, okText: options.confirmText, cancelText: options.cancelText, reservedPage: true });
  return cleanup;
}

export function openAdminConfirmation(app: App, options: {
  title: string;
  content: string;
  type: 'confirm' | 'danger' | 'warn';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const modal = Modal.create(app);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    app.propsActionUnsubscribe(ModalAction.MODAL_SAVE);
    app.propsActionUnsubscribe(ModalAction.MODAL_CLOSE);
  };
  modal.open({
    type: options.type,
    title: options.title,
    content: options.content,
    onOk: () => { cleanup(); options.onConfirm(); },
    onCancel: () => { cleanup(); options.onCancel(); },
  });
  return () => { cleanup(); modal.close(); };
}
