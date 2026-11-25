const TRACE_ID_HEADER = 'X-Trace-Id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const traceIds = new WeakMap<Request, string>();

export function isTraceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function createTraceId(request: Request): string {
  const candidate = request.headers.get(TRACE_ID_HEADER)?.trim() ?? '';
  return isTraceId(candidate) ? candidate : crypto.randomUUID();
}

export function traceIdFromRequest(request: Request): string {
  const existing = traceIds.get(request);
  if (existing) return existing;
  const traceId = createTraceId(request);
  traceIds.set(request, traceId);
  return traceId;
}

export function withTraceHeaders(response: Response, traceId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(TRACE_ID_HEADER, traceId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
