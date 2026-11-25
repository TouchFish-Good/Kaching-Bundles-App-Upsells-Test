import type { Hono } from 'hono';
import { requireShoplineSession, ShoplineTokenRefreshError, type AuthContext } from '../auth/session';
import { reauthorizationRequired } from '../auth/reauthorization';
import { D1CampaignRepository } from '../db/campaigns';
import { D1SessionStore } from '../db/sessions';
import { D1SubscriptionRepository } from '../db/subscriptions';
import type { Env } from '../env';
import { ShoplineAdminApiError } from '../services/collection-publication';
import { campaignResponse } from './campaigns';
import { fetchStoreIdWithTokenRecovery } from './catalog';
import { scheduleSubscriptionReconciliation, subscriptionResponse } from './subscription';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;

export function registerBootstrapRoutes(app: App): void {
  app.get('/api/quantity-breaks/bootstrap', async (c) => {
    const session = await requireShoplineSession(c.req.raw, c.env);
    if (session instanceof Response) return session;
    c.set('auth', session);

    const includeCampaigns = c.req.query('campaigns') === '1';
    const entitlementRead = new D1SubscriptionRepository(c.env.DB).readEntitlement(c.env.SHOPLINE_APP_KEY, session.handle);
    const shopRead = new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY)
      .getInstalledStoreId(session.handle)
      .then((id) => id ?? fetchStoreIdWithTokenRecovery(session, c.env));
    const campaignsRead = includeCampaigns
      ? new D1CampaignRepository(c.env.DB).listProjections(session.handle)
      : Promise.resolve(null);
    const supportingReads = Promise.allSettled([shopRead, campaignsRead] as const);
    let entitlement;
    try { entitlement = await entitlementRead; }
    catch {
      return c.json({ error: 'Subscription status is temporarily unavailable.', code: 'SUBSCRIPTION_UNAVAILABLE' }, 503);
    }
    const subscription = subscriptionResponse(entitlement);
    await scheduleSubscriptionReconciliation(c, session.handle);
    if (!subscription.access) return c.json({ subscription });

    const [shopResult, campaignsResult] = await supportingReads;

    if (shopResult.status === 'rejected') {
      const failure = shopResult.reason;
      if ((failure instanceof ShoplineAdminApiError || failure instanceof ShoplineTokenRefreshError)
        && (failure.status === 401 || failure.status === 403)) return reauthorizationRequired(session.handle, c.env);
      return c.json({ error: 'Store identity is temporarily unavailable.', code: 'SHOP_UNAVAILABLE' }, 503);
    }
    if (campaignsResult.status === 'rejected') {
      return c.json({ error: 'Campaign configuration is temporarily unavailable.', code: 'CAMPAIGNS_UNAVAILABLE' }, 503);
    }
    return c.json({
      subscription,
      shop: { storeId: shopResult.value },
      ...(campaignsResult.value === null ? {} : {
        campaigns: campaignsResult.value.map((projection) => campaignResponse(projection,
          projection.publication.discountId ? 'unverified' : undefined)),
      }),
    });
  });
}
