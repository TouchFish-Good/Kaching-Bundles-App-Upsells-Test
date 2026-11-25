import Client,{shared} from "@shoplineos/app-bridge";
import { getAppBridgeContext, isEmbeddedContext } from '../prototype/embedded-context';

type AppBridgeClient = ReturnType<typeof Client.createApp>;
type AppBridgeFactory = (config: { appKey: string; host: string }) => AppBridgeClient;

export function createEmbeddedApp({
  embedded,
  search,
  fallbackAppKey,
  getHost,
  createApp,
}: {
  embedded: boolean;
  search: string;
  fallbackAppKey?: string;
  getHost: () => string;
  createApp: AppBridgeFactory;
}): AppBridgeClient | null {
  if (!embedded) return null;
  const context = getAppBridgeContext(search, fallbackAppKey);
  const host = context.host || getAppBridgeContext('', undefined, getHost()).host;
  if (!host) throw new Error('A valid SHOPLINE parent host is required.');
  return createApp({
    appKey: context.appKey ?? '',
    host,
  });
}

let app: AppBridgeClient | null | undefined;
let appScope: string | undefined;

export const useAppBridge = () => {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const context = getAppBridgeContext(search, app?.config.appKey ?? import.meta.env.VITE_APP_KEY, app?.config.host);
  const scope = `${context.appKey ?? ''}:${context.host ?? ''}`;
  if (app === undefined || scope !== appScope) {
    app = createEmbeddedApp({
      embedded: typeof window !== 'undefined' && isEmbeddedContext(),
      search,
      fallbackAppKey: context.appKey,
      getHost: () => {
        if (context.host) return context.host;
        const parentOrigin = window.location.ancestorOrigins?.[0];
        return parentOrigin ? new URL(parentOrigin).host : shared.getHost();
      },
      createApp: Client.createApp,
    });
    appScope = app ? `${app.config.appKey ?? ''}:${app.config.host ?? ''}` : scope;
  }
  return app!;
};
