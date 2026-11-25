const SENSITIVE_KEY = /(?:authorization|cookie|access[_ -]?token|refresh[_ -]?token|password|secret|credential|api[_ -]?key)/i;
const SENSITIVE_VALUE = /(?:bearer\s+\S+|(?:access|refresh)[_ -]?token\s*[:=]|authorization\s*[:=]|cookie\s*[:=]|password\s*[:=]|secret\s*[:=])/i;
const MAX_DEPTH = 5;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 30;
const MAX_STRING_LENGTH = 1024;
const MAX_SERIALIZED_LENGTH = 8192;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value) ? '[redacted]' : value.slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
  if (typeof value !== 'object') return '[unsupported]';
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .slice(0, MAX_OBJECT_KEYS)
    .map(([key, nested]) => [key, redact(nested, depth + 1)]));
}

export function diagnosticResponseBody(payload: unknown): string | undefined {
  const serialized = JSON.stringify(redact(payload));
  if (!serialized || serialized === '{}') return undefined;
  if (serialized.length <= MAX_SERIALIZED_LENGTH) return serialized;
  return JSON.stringify({ truncated: true, preview: serialized.slice(0, 4096) });
}

export function validDiagnosticResponseBody(value: string | undefined): string | null {
  if (typeof value !== 'string' || value.length > MAX_SERIALIZED_LENGTH) return null;
  try { return diagnosticResponseBody(JSON.parse(value)) ?? null; } catch { return null; }
}
