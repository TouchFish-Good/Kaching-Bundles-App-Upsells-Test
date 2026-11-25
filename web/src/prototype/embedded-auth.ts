import Client, { ADMIN_SECTION, Redirect, shared } from '@shoplineos/app-bridge';
import { getAppBridgeContext, isEmbeddedContext } from './embedded-context';

export type EmbeddedOAuthConfig = {
  appKey: string;
  host: string;
  scope: string;
  redirectUri: string;
};

export function readEmbeddedOAuthConfig(search: string): EmbeddedOAuthConfig | null {
  const params = new URLSearchParams(search);
  if (params.get('uninstalled') !== 'true') return null;

  const appKey = params.get('appkey') ?? '';
  const host = params.get('host') ?? '';
  const scope = params.get('scope') ?? '';
  const redirectUri = params.get('redirectUri') ?? '';
  if (!appKey || !host || !scope || !redirectUri) return null;
  return { appKey, host, scope, redirectUri };
}

export function startEmbeddedOAuth(
  app: Parameters<typeof Redirect.create>[0],
  search: string,
  createRedirect: (value: Parameters<typeof Redirect.create>[0]) => Pick<ReturnType<typeof Redirect.create>, 'toAdminPage'> = (value) => Redirect.create(value),
): boolean {
  const config = readEmbeddedOAuthConfig(search);
  if (!config) return false;

  createRedirect(app).toAdminPage(ADMIN_SECTION.OAUTH, {
    oauthInfo: {
      appKey: config.appKey,
      scope: config.scope,
      redirectUri: decodeURIComponent(config.redirectUri),
    },
  });
  return true;
}

export function startEmbeddedOAuthFromUrl(
  app: Parameters<typeof Redirect.create>[0],
  rawUrl: string,
  origin: string,
  createRedirect: (value: Parameters<typeof Redirect.create>[0]) => Pick<ReturnType<typeof Redirect.create>, 'toAdminPage'> = (value) => Redirect.create(value),
): boolean {
  try {
    const target = new URL(rawUrl, origin);
    if (target.origin !== new URL(origin).origin) return false;
    return startEmbeddedOAuth(app, target.search, createRedirect);
  } catch {
    return false;
  }
}

export function initEmbeddedOAuth(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  if (typeof window === 'undefined' || !isEmbeddedContext()) return false;
  const config = readEmbeddedOAuthConfig(search);
  if (!config) return false;

  const context = getAppBridgeContext(search, config.appKey, config.host);
  const app = Client.createApp({
    appKey: context.appKey ?? config.appKey,
    host: context.host ?? config.host ?? shared.getHost(),
  });
  return startEmbeddedOAuth(app, search);
}

export function renderEmbeddedOAuthPending(documentRef: Document = document): void {
  const root = documentRef.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const main = documentRef.createElement('main');
  main.setAttribute('role', 'status');
  main.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;background:#f6f6f6;color:#102a2a;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center';
  const content = documentRef.createElement('div');
  const title = documentRef.createElement('h1');
  title.textContent = '正在打开 SHOPLINE 授权页面';
  title.style.cssText = 'margin:0 0 12px;font-size:22px';
  const body = documentRef.createElement('p');
  body.textContent = '正在自动跳转，请稍候。';
  body.style.cssText = 'margin:0;color:#536865';
  content.append(title, body);
  main.append(content);
  root.append(main);
}
