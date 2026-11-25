import { shoplineApp } from '@shoplineos/shopline-app-express';
import { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import 'dotenv/config';
import { assertAuthorizedSessionScopes, resolveShoplineScopes } from './auth/scopes';
import { scopeCheckedSessionStorage } from './auth/scope-storage';
import { registerWebhooksBestEffort } from './auth/webhook-registration';
import { adminRegistry, adminRegistryReady } from './admin-read';
import { fetchShopIdentity } from './admin-read/shop-identity';

const DB_PATH = `${process.cwd()}/database.sqlite`;

const shopline = shoplineApp({
  appKey: process.env.SHOPLINE_APP_KEY || '',
  appSecret: process.env.SHOPLINE_APP_SECRET || '',
  appUrl: process.env.SHOPLINE_APP_URL || '',
  authPathPrefix: '/api/auth',
  scopes: resolveShoplineScopes(process.env.SCOPES),
  sessionStorage: scopeCheckedSessionStorage(new SQLiteSessionStorage(DB_PATH)),
  isEmbeddedApp: true,
  webhooks: {
    'apps/installed_uninstalled': {
      callbackUrl: '/api/webhooks',
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      assertAuthorizedSessionScopes(session.scope);
      await registerWebhooksBestEffort(() => shopline.registerWebhooks({ session }));
      // The local 436 probe avoids shop identity lookup; a handle is not a durable registry ID.
      if (process.env.NODE_ENV === 'development') return;
      let stage = 'shop_lookup';
      try {
        const identity = await fetchShopIdentity(session.handle, session.accessToken);
        stage = 'registry_ready';
        await adminRegistryReady;
        stage = 'registry_write';
        await adminRegistry.recordInstallation({
          storeId: identity.storeId,
          handle: session.handle,
          scope: session.scope || '',
          at: new Date().toISOString(),
        });
      } catch (error) {
        const status = error instanceof Error ? /SHOPLINE shop lookup failed: (\d{3})/.exec(error.message)?.[1] : undefined;
        console.error('Store identity sync failed', { stage, status });
        try {
          await adminRegistryReady;
          await adminRegistry.recordError({
            kind: 'authorization', severity: 'error', code: 'STORE_ID_SYNC_FAILED', at: new Date().toISOString(),
          });
        } catch {
          console.error('Store identity error recording failed');
        }
      }
    },
  },
});

export default shopline;
