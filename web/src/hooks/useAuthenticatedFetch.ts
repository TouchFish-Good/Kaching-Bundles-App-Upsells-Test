import { useEffect, useMemo } from 'react';
import { shared } from '@shoplineos/app-bridge';
import { useAppBridge } from './useAppBridge';
import { createAuthenticatedFetch } from '../prototype/authenticated-fetch';
import { getAppBridgeContext, isEmbeddedContext } from '../prototype/embedded-context';
import { startEmbeddedOAuthFromUrl } from '../prototype/embedded-auth';
import { installBrowserErrorReporting } from '../observability/browser-errors.mjs';

const embeddedAtEntry = isEmbeddedContext();
const clients = new WeakMap<object, ReturnType<typeof createAuthenticatedFetch>>();

export function useAuthenticatedFetch(): typeof fetch {
  const app = useAppBridge();
  const client = useMemo(() => {
    if (app && clients.has(app)) return clients.get(app)!;
    const bridgeScope = `${app?.config.appKey ?? ''}:${app?.config.host ?? ''}`;
    const getSessionScope = () => {
      const context = getAppBridgeContext(typeof window === 'undefined' ? '' : window.location.search, app?.config.appKey, app?.config.host);
      return `${context.appKey ?? ''}:${context.host ?? ''}`;
    };
    const created = createAuthenticatedFetch({
    fetcher: globalThis.fetch.bind(globalThis),
    embedded: embeddedAtEntry,
    getSessionToken: () => {
      if (app && bridgeScope !== getSessionScope()) return Promise.reject(Object.assign(new Error('SHOPLINE session context changed.'), { code: 'SESSION_CONTEXT_CHANGED' }));
      return shared.getSessionToken(app);
    },
    getSessionScope,
    redirectToAuth: (url) => startEmbeddedOAuthFromUrl(app, url, window.location.origin),
    onSubscriptionRequired: () => {
      if (typeof window === 'undefined' || window.location.pathname === '/quantity-breaks/plan') return;
      window.history.replaceState(window.history.state, '', `/quantity-breaks/plan${window.location.search}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    origin: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
    });
    if (app) clients.set(app, created);
    return created;
  }, [app]);
  useEffect(() => installBrowserErrorReporting(window, globalThis.fetch, client.getSessionToken), [client]);
  return client;
}
