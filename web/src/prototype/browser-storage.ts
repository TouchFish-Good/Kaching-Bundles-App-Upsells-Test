// Accessing the Storage property itself can throw in a restricted iframe.
const unavailableStorage = {
  getItem: (_key: string): string | null => null,
  setItem: (_key: string, _value: string): void => { throw new Error('Browser storage is unavailable.'); },
  removeItem: (_key: string): void => {},
};

export function browserStorage(kind: 'localStorage' | 'sessionStorage') {
  try { return window[kind]; } catch { return unavailableStorage; }
}
