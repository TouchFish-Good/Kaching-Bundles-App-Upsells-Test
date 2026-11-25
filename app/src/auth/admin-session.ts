import type { Session } from '@shoplineos/shopline-api-js';

const REFRESH_AHEAD_MS = 5 * 60 * 1000;

type Dependencies = {
  loadSession: (id: string) => Promise<Session | undefined>;
  refreshToken: (handle: string) => Promise<Session>;
  storeSession: (session: Session) => Promise<unknown>;
  now?: () => number;
};

export function createCurrentAdminSessionLoader(dependencies: Dependencies) {
  const pendingRefreshes = new Map<string, Promise<Session>>();

  return async (handle: string): Promise<Session> => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error('Invalid SHOPLINE store handle');
    const session = await dependencies.loadSession(`offline_${handle}`);
    if (!session?.accessToken) throw new Error('SHOPLINE offline Admin session is unavailable');

    const expiresAt = session.expires?.getTime() || 0;
    if (expiresAt > (dependencies.now?.() ?? Date.now()) + REFRESH_AHEAD_MS) return session;

    const pending = pendingRefreshes.get(handle);
    if (pending) return pending;

    const refresh = (async () => {
      const fresh = await dependencies.refreshToken(handle);
      await dependencies.storeSession(fresh);
      return fresh;
    })();
    pendingRefreshes.set(handle, refresh);
    try { return await refresh; }
    finally { pendingRefreshes.delete(handle); }
  };
}
