const BOOTSTRAP_RECOVERY_KEY = 'quantity-breaks:bootstrap-recovery';

export const BOOTSTRAP_TIMEOUT_MS = 5_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type BootstrapRecovery = 'reload' | 'hold';

export function claimBootstrapRecovery(storage: StorageLike): BootstrapRecovery {
  try {
    if (storage.getItem(BOOTSTRAP_RECOVERY_KEY) === '1') return 'hold';
    storage.setItem(BOOTSTRAP_RECOVERY_KEY, '1');
    return 'reload';
  } catch {
    // Without a persistent marker, a reload could repeat on every document.
    return 'hold';
  }
}

export function clearBootstrapRecovery(storage: StorageLike): void {
  try { storage.removeItem(BOOTSTRAP_RECOVERY_KEY); } catch { /* Storage is optional. */ }
}
