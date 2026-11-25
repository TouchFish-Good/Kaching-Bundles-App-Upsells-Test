type Failure = { status?: number; code?: string; requestId?: string; traceId?: string; durationMs?: number };

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = Object.assign(new Error('Startup read timed out.'), { code: 'STARTUP_READ_TIMEOUT' });
          reject(error);
          controller.abort();
        }, 15_000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

// Retry only reads. Each stage keeps its own budget, so a slow campaign read
// never clears the already verified shop or repeats a successful subscription read.
export async function readStartupResource<T>(read: (signal: AbortSignal) => Promise<T>, active: () => boolean): Promise<T> {
  const startedAt = Date.now();
  try { return await boundedRead(read); }
  catch (error) {
    const status = (error as Failure)?.status;
    let finalError = error;
    if (active() && (status === undefined || status >= 500 || status === 429 || status === 408)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (active()) {
        try { return await boundedRead(read); } catch (retryError) { finalError = retryError; }
      }
    }
    const failure = finalError as Failure;
    throw Object.assign(new Error('Startup read failed.'), {
      status: failure?.status, code: failure?.code, traceId: failure?.traceId ?? failure?.requestId,
      durationMs: Date.now() - startedAt,
    });
  }
}

const attemptId = globalThis.crypto?.randomUUID?.() ?? `startup-${Date.now()}`;
export function reportStartupFailure(stage: 'subscription' | 'shop' | 'campaigns' | 'bootstrap', error: unknown, fetcher: typeof fetch): void {
  const failure = error as Failure;
  // Never include tokens, query parameters, response bodies or merchant content.
  void fetcher('/api/observability/errors', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'request_failure', pagePath: window.location.pathname,
      requestPath: `/api/quantity-breaks/${stage}`, requestMethod: 'GET',
      code: `STARTUP_${stage.toUpperCase()}_FAILED`,
      ...(failure?.status ? { status: failure.status } : {}),
      ...(failure?.traceId ? { relatedTraceId: failure.traceId } : {}),
      message: JSON.stringify({ attemptId, stage, durationMs: failure?.durationMs, reason: failure?.code ?? 'READ_FAILED' }),
    }),
  }).catch(() => undefined);
}
