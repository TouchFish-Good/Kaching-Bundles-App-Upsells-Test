const sent = new Set();
function key(input) { return `${input.type}\n${input.pagePath}\n${input.requestPath ?? ''}\n${input.code ?? ''}\n${input.message ?? ''}`; }
export function reportBrowserError(input, fetcher = globalThis.fetch, token = '') {
  const fingerprint = key(input);
  if (sent.has(fingerprint)) return;
  sent.add(fingerprint);
  void fetcher('/api/observability/errors', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input) }).catch(() => undefined);
}
export function installBrowserErrorReporting(target = globalThis, fetcher = globalThis.fetch, getSessionToken = async () => '') {
  const send = (input) => void getSessionToken().then((token) => reportBrowserError(input, fetcher, token)).catch(() => undefined);
  const onError = (event) => send({ type: 'runtime', pagePath: target.location?.pathname ?? '/', code: 'RUNTIME_ERROR', message: event.message });
  const onRejection = (event) => send({ type: 'unhandled_rejection', pagePath: target.location?.pathname ?? '/', code: 'UNHANDLED_REJECTION', message: event.reason instanceof Error ? event.reason.message : String(event.reason ?? '') });
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => { target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); };
}
