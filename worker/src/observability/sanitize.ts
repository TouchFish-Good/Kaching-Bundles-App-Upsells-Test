const SENSITIVE = /(?:authorization|cookie|(?:access|refresh)[_ -]?token|bearer\s+\S+|password|secret|(?:api[_ -]?)?key)\s*(?::|=|\s)\s*\S+/i;
const CODE = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

export function sanitizePath(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const pathname = new URL(value, 'https://observability.invalid').pathname;
    return pathname.startsWith('/') && pathname.length <= 200 ? pathname : null;
  } catch { return null; }
}

export function sanitizeObservableMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return SENSITIVE.test(normalized) ? '[REDACTED]' : normalized.slice(0, 500);
}

export function sanitizeObservableCode(value: string | undefined, fallback = 'UNKNOWN_ERROR'): string {
  return value && CODE.test(value) ? value : fallback;
}

export async function eventFingerprint(input: { source: string; operation: string; route?: string | null; code: string; message?: string | null }): Promise<string> {
  const data = new TextEncoder().encode([input.source, input.operation, input.route ?? '', input.code, input.message ?? ''].join('\n'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
