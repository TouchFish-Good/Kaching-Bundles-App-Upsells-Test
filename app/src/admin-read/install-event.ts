type InstallEvent = { store_id?: unknown; operate?: unknown; timestamp?: unknown };

export function parseUninstallEvent(payload: unknown): { storeId: string; at: string } | null {
  const event = (typeof payload === 'string' ? JSON.parse(payload) : payload) as InstallEvent | null;
  if (!event || event.operate !== 'UNINSTALL' || !event.store_id) return null;
  const millis = Number(event.timestamp);
  if (!Number.isSafeInteger(millis) || millis <= 0 || Number.isNaN(new Date(millis).getTime())) {
    throw new Error('Invalid uninstall event timestamp');
  }
  return { storeId: String(event.store_id), at: new Date(millis).toISOString() };
}
