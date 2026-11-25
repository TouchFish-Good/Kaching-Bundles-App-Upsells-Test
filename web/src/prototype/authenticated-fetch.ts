type AuthenticatedFetchOptions = {
  fetcher: typeof fetch;
  embedded: boolean;
  getSessionToken: () => Promise<string>;
  redirectToAuth: (url: string) => void;
  origin: string;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  getSessionScope?: () => string;
  onSubscriptionRequired?: () => void;
};
import { reportBrowserError } from '../observability/browser-errors.mjs';
import { requestFailurePayload } from '../observability/request-failure.mjs';

const REAUTHORIZE = 'X-SHOPLINE-API-Request-Failure-Reauthorize';
const REAUTHORIZE_URL = 'X-SHOPLINE-API-Request-Failure-Reauthorize-Url';
class SessionTokenTimeoutError extends Error {
  readonly code = 'SESSION_TOKEN_TIMEOUT';
  constructor() { super('SHOPLINE session token request timed out.'); }
}

function authDestination(raw: string | null, origin: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, origin);
    const handle = url.searchParams.get('handle') ?? '';
    const redirectUri = url.searchParams.get('redirectUri') ?? '';
    const callback = new URL(redirectUri);
    if (
      url.origin !== origin
      || url.pathname !== '/'
      || url.username
      || url.password
      || url.hash
      || url.searchParams.get('uninstalled') !== 'true'
      || url.searchParams.get('embedded') !== '1'
      || !url.searchParams.get('appkey')
      || !handle
      || url.searchParams.get('host') !== `${handle}.myshopline.com`
      || !url.searchParams.get('scope')
      || callback.origin !== origin
      || callback.pathname !== '/api/auth/callback'
      || callback.username
      || callback.password
      || callback.hash
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type AuthenticatedFetch = typeof fetch & { getSessionToken: () => Promise<string> };

function tokenExpiry(token: string): number {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
  } catch { return 0; }
}

export function createAuthenticatedFetch(options: AuthenticatedFetchOptions): AuthenticatedFetch {
  let redirectStarted = false;
  const wait = options.wait || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now || (() => Date.now());
  let pendingSessionToken: Promise<string> | null = null;
  let pendingBridgeToken: Promise<string> | null = null;
  let cachedToken: { token: string; expiresAt: number } | null = null;
  const currentScope = () => options.getSessionScope?.() ?? '';
  let sessionScope = currentScope();
  const deferredSessionReports = new Map<string, ReturnType<typeof requestFailurePayload>>();
  const contextChanged = () => Object.assign(new Error('SHOPLINE session context changed.'), { code: 'SESSION_CONTEXT_CHANGED' });

  function readBridgeToken(): Promise<string> {
    if (!pendingBridgeToken) {
      try { pendingBridgeToken = options.getSessionToken(); }
      catch (error) { return Promise.reject(error); }
      const request = pendingBridgeToken;
      void request.then(
        () => { if (pendingBridgeToken === request) pendingBridgeToken = null; },
        () => { if (pendingBridgeToken === request) pendingBridgeToken = null; },
      );
    }
    return pendingBridgeToken;
  }

  async function tokenBeforeDeadline(remaining: number): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        readBridgeToken(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new SessionTokenTimeoutError()), remaining);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async function waitForSessionToken(): Promise<string> {
    const deadline = now() + 5_000;
    let lastError: unknown;
    do {
      try {
        const token = await tokenBeforeDeadline(Math.max(0, deadline - now()));
        if (token) return token;
        lastError = new Error('SHOPLINE session token is unavailable.');
      } catch (error) {
        if (error instanceof SessionTokenTimeoutError) throw error;
        lastError = error;
      }
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await wait(Math.min(200, remaining));
    } while (now() < deadline);
    if (lastError instanceof Error) throw lastError;
    throw new Error('SHOPLINE session token is unavailable.');
  }

  function readSessionToken(): Promise<string> {
    const scope = currentScope();
    if (scope !== sessionScope) {
      sessionScope = scope;
      cachedToken = null;
      pendingSessionToken = null;
      pendingBridgeToken = null;
      deferredSessionReports.clear();
      redirectStarted = false;
    }
    // exp is a cache hint only. The Worker still verifies every JWT and checks
    // installation and subscription permissions on every protected operation.
    if (cachedToken && cachedToken.expiresAt > now() + 30_000) return Promise.resolve(cachedToken.token);
    if (!pendingSessionToken) {
      const request = waitForSessionToken().then((token) => {
        if (scope !== currentScope()) throw contextChanged();
        cachedToken = { token, expiresAt: tokenExpiry(token) };
        return token;
      });
      pendingSessionToken = request;
      void request.then(
        () => { if (pendingSessionToken === request) pendingSessionToken = null; },
        () => { if (pendingSessionToken === request) pendingSessionToken = null; },
      );
    }
    return pendingSessionToken;
  }

  const authenticatedFetch: typeof fetch = async (input, init) => {
    const requestScope = currentScope();
    const requestUrl = new URL(input instanceof Request ? input.url : String(input), options.origin);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const readOnly = method === 'GET' || method === 'HEAD';
    const maxAttempts = options.embedded && readOnly ? 3 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let token = '';
      if (options.embedded) {
        try { token = await readSessionToken(); }
        catch (error) {
          if (requestUrl.pathname !== '/api/observability/errors') {
            // No unauthenticated telemetry endpoint: defer until App Bridge
            // supplies a valid token on a later read.
            deferredSessionReports.set(requestUrl.pathname, {
              type: 'request_failure', pagePath: typeof window === 'undefined' ? '/' : window.location.pathname,
              requestPath: requestUrl.pathname, requestMethod: method,
              code: error instanceof SessionTokenTimeoutError ? error.code : 'SESSION_TOKEN_UNAVAILABLE',
              message: 'App Bridge session acquisition failed before the API request was sent.',
            });
          }
          throw error;
        }
        headers.set('Authorization', `Bearer ${token}`);
        for (const report of deferredSessionReports.values()) reportBrowserError(report, options.fetcher, token);
        deferredSessionReports.clear();
      }

      if (options.embedded && requestScope !== currentScope()) throw contextChanged();
      if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');

      let response: Response;
      try {
        response = await options.fetcher(input, { ...init, headers });
      } catch (error) {
        if (requestUrl.pathname !== '/api/observability/errors') reportBrowserError(requestFailurePayload({ pagePath: window.location.pathname, requestPath: requestUrl.pathname, requestMethod: method, error }), globalThis.fetch.bind(globalThis), token);
        throw error;
      }
      if (options.embedded && requestScope !== currentScope()) throw contextChanged();
      if (response.status === 401 || response.headers.get(REAUTHORIZE) === '1') {
        if (cachedToken?.token === token) cachedToken = null;
      }
      if (response.status >= 500 && requestUrl.pathname !== '/api/observability/errors') {
        reportBrowserError(requestFailurePayload({ pagePath: window.location.pathname, requestPath: requestUrl.pathname, requestMethod: method, status: response.status, relatedTraceId: response.headers.get('X-Trace-Id') ?? undefined }), globalThis.fetch.bind(globalThis), token);
      }
      if (response.status === 403 && options.onSubscriptionRequired) {
        try {
          const body = await response.clone().json() as { code?: unknown };
          if (body.code === 'SUBSCRIPTION_REQUIRED') options.onSubscriptionRequired();
        } catch { /* Non-JSON 403 responses remain ordinary errors. */ }
      }
      if (options.embedded && response.headers.get(REAUTHORIZE) === '1') {
        const url = authDestination(response.headers.get(REAUTHORIZE_URL), options.origin);
        if (!redirectStarted && url) {
          redirectStarted = true;
          options.redirectToAuth(url);
        }
        return response;
      }
      if (response.status !== 401 || attempt === maxAttempts - 1) return response;
      await wait(1000);
    }
    throw new Error('SHOPLINE session token retry was exhausted.');
  };
  return Object.assign(authenticatedFetch, { getSessionToken: readSessionToken });
}
