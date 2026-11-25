import type { Hono } from 'hono';
import { D1SessionStore } from '../db/sessions';
import { resolveStorefrontCollections } from '../services/storefront-collections';
import { bodyLimit } from 'hono/body-limit';
import type { Campaign, CampaignScope } from '../domain/campaign';
import { D1CampaignRepository } from '../db/campaigns';
import { D1TranslationRepository } from '../db/translations';
import type { Env } from '../env';
import type { AuthContext } from '../auth/session';
import { requirePublicRateLimit } from '../auth/rate-limit';
import { D1SubscriptionRepository } from '../db/subscriptions';
import { hasSubscriptionAccess } from './subscription-access';
import { normalizeStorefrontLocale } from '../services/locales';
import { resolveStorefrontMarketId } from '../services/storefront-market';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;

type CollectionContext = { complete: boolean; ids: string[] };

function includesProduct(scope: CampaignScope, productId: string, collections?: CollectionContext): boolean {
  if (scope.excludedProductIds?.includes(productId)) return false;
  if (scope.kind === 'all') return true;
  // Theme membership is display context only; never persist it or use it for checkout.
  // A new theme reporting an empty/incomplete list must not fall back to a stale snapshot.
  if (scope.kind === 'collections' && collections) {
    return collections.complete && (scope.collectionIds ?? []).some((id) => collections.ids.includes(id));
  }
  return (scope.kind === 'collections' ? scope.resolvedProductIds : scope.productIds)?.includes(productId) === true;
}

function scopePriority(scope: CampaignScope): number {
  return scope.kind === 'products' ? 2 : scope.kind === 'collections' ? 1 : 0;
}

function publicCampaign(campaign: Campaign) {
  return {
    id: campaign.id, name: campaign.name,
    tiers: [...campaign.tiers].sort((left, right) => left.displayOrder - right.displayOrder).map((tier) => ({
      tierId: tier.tierId, quantity: tier.quantity, discountType: tier.discountType,
      ...(tier.discountValue === undefined ? {} : { discountValue: tier.discountValue }),
      ...(tier.marketOverrides ? { marketOverrides: tier.marketOverrides } : {}),
      ...(tier.label ? { label: tier.label } : {}), ...(tier.subtitle ? { subtitle: tier.subtitle } : {}),
      ...(tier.tag ? { tag: tier.tag } : {}), ...(tier.recommended ? { recommended: true } : {}),
    })), ...(campaign.widget ? { widget: campaign.widget } : {}),
  };
}

export function registerStorefrontRoutes(app: App): void {
  app.use('/public/quantity-breaks/campaign', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Access-Control-Allow-Origin', '*');
    await next();
  });
  app.on(['GET', 'POST'], '/public/quantity-breaks/campaign', bodyLimit({ maxSize: 128 * 1024 }), async (c) => {
    const limited = await requirePublicRateLimit(c.req.raw, c.env);
    if (limited) return limited;
    let params: URLSearchParams;
    if (c.req.method === 'POST') {
      if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return c.json({ error: 'Expected form data.' }, 415);
      params = new URLSearchParams(await c.req.text());
    } else params = new URL(c.req.url).searchParams;
    let shop = params.get('shop');
    const shopId = params.get('shopId');
    const os21 = params.get('themeVersion') === '2.1';
    if (shopId !== null) {
      if (!os21 || !/^\d{1,64}$/.test(shopId)) return c.json({ error: 'Invalid shop identity.' }, 400);
      const resolved = await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).getInstalledHandleByStoreId(shopId);
      if (!resolved) return c.json({ error: 'No published campaign for this product.' }, 404);
      if (shop && shop !== resolved) return c.json({ error: 'Shop identity mismatch.' }, 400);
      shop = resolved;
    }
    if (os21 && !shopId) return c.json({ error: 'Shop ID required for OS2.1.' }, 400);
    const productId = params.get('productId');
    if (!shop || !/^[a-z0-9][a-z0-9-]{0,127}$/i.test(shop) || !productId || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(productId)) return c.json({ error: 'Valid shop and productId are required.' }, 400);
    let collections: CollectionContext | undefined;
    if (c.req.method === 'POST' || params.has('collectionsComplete') || params.has('collectionIds')) {
      const complete = params.get('collectionsComplete');
      const ids = params.get('collectionIds') ? params.get('collectionIds')!.split(',') : [];
      const count = params.get('collectionCount');
      if (!['true', 'false'].includes(complete ?? '') || ids.length > 1000 || ids.some((id) => !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) || new Set(ids).size !== ids.length || !/^\d{1,7}$/.test(count ?? '') || (complete === 'true' && Number(count) !== ids.length)) {
        return c.json({ error: 'Invalid product collection context.' }, 400);
      }
      collections = { complete: complete === 'true', ids };
    }
    try {
      const entitlement = await new D1SubscriptionRepository(c.env.DB).readEntitlement(c.env.SHOPLINE_APP_KEY, shop);
      if (!hasSubscriptionAccess(entitlement)) {
        return c.json({ error: 'No published campaign for this product.' }, 404);
      }
      const now = Date.now();
      const repository = new D1CampaignRepository(c.env.DB);
      const candidates: Campaign[] = [];
      for (const campaign of await repository.list(shop)) {
        if (campaign.status !== 'active' || campaign.scope.excludedProductIds?.includes(productId) || (campaign.startsAt && Date.parse(campaign.startsAt) > now) || (campaign.endsAt && Date.parse(campaign.endsAt) <= now)) continue;
        if ((!os21 || campaign.scope.kind !== 'collections') && !includesProduct(campaign.scope, productId, collections)) continue;
        if ((await repository.getPublication(shop, campaign.id)).state === 'active') candidates.push(campaign);
      }
      if (os21 && !candidates.some(campaign => campaign.scope.kind === 'products' && includesProduct(campaign.scope, productId)) && candidates.some(campaign => campaign.scope.kind === 'collections')) {
        collections = { complete: true, ids: await resolveStorefrontCollections(shop, productId, c.env) };
      }
      const matches: Campaign[] = [];
      for (const campaign of candidates) {
        if (!includesProduct(campaign.scope, productId, collections)) continue;
        matches.push(campaign);
      }
      if (!matches.length) return c.json({ error: 'No published campaign for this product.' }, 404);
      const priority = Math.max(...matches.map((campaign) => scopePriority(campaign.scope)));
      const preferred = matches.filter((campaign) => scopePriority(campaign.scope) === priority);
      if (preferred.length > 1) return c.json({ error: 'Multiple published campaigns match this product.' }, 409);
      const locale = normalizeStorefrontLocale(params.get('locale') ?? undefined) ?? 'en';
      const copy: Record<string, string> = await new D1TranslationRepository(c.env.DB).read(shop, locale).catch(() => ({}));
      const countryCode = params.get('countryCode') ?? undefined;
      const marketId = await resolveStorefrontMarketId(shop, countryCode, c.env);
      return c.json({ campaign: { ...publicCampaign(preferred[0]), ...(marketId ? { marketId } : {}), widgetTitle: copy['widget.title']?.trim() ?? '', copy } });
    } catch { return c.json({ error: 'Campaign data is unavailable.' }, 503); }
  });
}
