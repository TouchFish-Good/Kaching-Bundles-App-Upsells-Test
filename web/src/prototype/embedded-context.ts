export function isEmbeddedContext(
  currentWindow: object | null = typeof window === 'undefined' ? null : window.self,
  topWindow: object | null = typeof window === 'undefined' ? null : window.top,
): boolean {
  return currentWindow !== null && topWindow !== null && currentWindow !== topWindow;
}

export function getAppBridgeContext(search: string, fallbackAppKey?: string, fallbackHost?: string): { appKey?: string; host?: string } {
  const params = new URLSearchParams(search);
  const handle = params.get('handle')?.toLowerCase();
  const storeHost = handle && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(handle) ? `${handle}.myshopline.com` : undefined;
  const validHost = (host: string | null | undefined) => host && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopline\.com$/i.test(host) ? host.toLowerCase() : undefined;
  return {
    appKey: params.get('appkey') || fallbackAppKey,
    // Recovery reloads can make document.referrer point to our own app.
    // Keep Bridge messages scoped to the store, never that self-referrer.
    host: storeHost || validHost(params.get('host')) || validHost(fallbackHost),
  };
}
