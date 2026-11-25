import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('editor exit uses native cancel/exit labels and exits only after confirmation', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { openEditorExitConfirmation } = await vite.ssrLoadModule('/src/prototype/admin-feedback.ts');
    const sent = [];
    const handlers = new Map();
    const app = {
      dispatch: (action, payload) => sent.push({ action, payload }),
      subscribe: (action, callback) => { handlers.set(action, callback); return () => handlers.delete(action); },
    };
    let exited = 0;
    const dispose = openEditorExitConfirmation(app, { content: '当前修改尚未保存，确定不保存并退出吗？', confirmText: '退出', cancelText: '取消', onConfirm: () => exited++ });
    assert.deepEqual(sent.at(-1), { action: 'leaveCurrentPage', payload: { payLoad: { content: '当前修改尚未保存，确定不保存并退出吗？', okText: '退出', cancelText: '取消', reservedPage: true } } });
    assert.equal(exited, 0, 'opening or canceling the native dialog must not navigate');
    const confirm = handlers.get('leaveCurrentPage');
    confirm();
    confirm();
    assert.equal(exited, 1);
    assert.equal(handlers.size, 0);
    dispose();
    const cleanup = openEditorExitConfirmation(app, { content: 'Unsaved', confirmText: 'Exit', cancelText: 'Cancel', onConfirm: () => exited++ });
    cleanup();
    assert.equal(handlers.size, 0, 'unmounting removes stale exit callbacks');
  } finally { await vite.close(); }
});

test('App Bridge feedback subscribes to the native modal confirm and cancel events once', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { showAdminMessage, openAdminConfirmation } = await vite.ssrLoadModule('/src/prototype/admin-feedback.ts');
    const sent = [];
    const handlers = new Map();
    const app = {
      dispatch: (action, payload) => sent.push({ action, payload }),
      subscribe: (action, callback) => handlers.set(action, callback),
      unsubscribe: (action) => handlers.delete(action),
      propsActionSubscribe: (action, callback) => handlers.set(action, callback),
      propsActionUnsubscribe: (action) => handlers.delete(action),
    };

    showAdminMessage(app, 'Saved', 'success');
    assert.deepEqual(sent.at(-1), { action: 'message', payload: { payLoad: { type: 'success', messageInfo: 'Saved' } } });

    let confirmed = 0;
    let canceled = 0;
    openAdminConfirmation(app, { title: 'Delete?', content: 'Permanent', type: 'danger', onConfirm: () => confirmed++, onCancel: () => canceled++ });
    const firstModal = sent.at(-1).payload.payLoad;
    assert.equal(firstModal.type, 'danger');
    assert.equal(firstModal.title, 'Delete?');
    assert.equal(firstModal.content, 'Permanent');
    assert.equal(typeof handlers.get('modalclose'), 'function');
    assert.equal(typeof handlers.get('modalsave'), 'function');
    handlers.get('modalclose')();
    assert.equal(canceled, 1);
    assert.equal(confirmed, 0);
    assert.equal(handlers.size, 0);

    openAdminConfirmation(app, { title: 'Delete?', content: 'Permanent', type: 'danger', onConfirm: () => confirmed++, onCancel: () => canceled++ });
    handlers.get('modalsave')();
    handlers.get('modalclose')?.();
    assert.equal(confirmed, 1);
    assert.equal(canceled, 1);
    assert.equal(handlers.size, 0);
  } finally { await vite.close(); }
});

test('App Bridge loading feedback always triggers and exits the native top progress bar', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { beginAdminLoading } = await vite.ssrLoadModule('/src/prototype/admin-feedback.ts');
    assert.equal(typeof beginAdminLoading, 'function');
    const sent = [];
    const app = { dispatch: (action, payload) => sent.push({ action, payload }), subscribe: () => {}, unsubscribe: () => {} };
    const finish = beginAdminLoading(app);
    assert.deepEqual(sent, [{ action: 'triggerLoading', payload: { payLoad: {} } }]);
    finish();
    assert.deepEqual(sent.at(-1), { action: 'stopLoading', payload: { payLoad: {} } });
  } finally { await vite.close(); }
});
