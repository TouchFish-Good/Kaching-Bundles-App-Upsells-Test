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
import { hasEnabledOffers, offerConfigDigest, offerSelections, validOfferSelection, type OfferSelection } from '../services/offer-config';
import { supportedOfferFunction } from '../services/discounts';
import { OFFER_INDEX_NAMESPACE, OFFER_INDEX_KEY } from '../services/offer-index';
import { resolveQueuedOfferPreview } from '../services/offer-preview';
import { requireShoplineSession } from '../auth/session';
import { requireSubscriptionAccess } from './subscription-access';

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
    const v2 = params.get('clientFeatures') === 'gift-bundles-v1';
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
      if (v2 && !(await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).getInstalledStoreId(shop))) return c.json({ error: 'No published campaign for this product.' }, 404);
      const entitlement = await new D1SubscriptionRepository(c.env.DB).readEntitlement(c.env.SHOPLINE_APP_KEY, shop);
      if (!hasSubscriptionAccess(entitlement)) {
        return c.json({ error: 'No published campaign for this product.' }, 404);
      }
      const now = v2 ? (c.env.now?.() ?? Date.now()) : Date.now();
      const repository = new D1CampaignRepository(c.env.DB);
      // Function excludes accessory Products across every live published node,
      // including when this request negotiates only legacy main pricing.
      const published: Campaign[] = [];
      for (const campaign of await repository.list(shop)) {
        if (campaign.status !== 'active' || (campaign.startsAt && Date.parse(campaign.startsAt) > now) || (campaign.endsAt && Date.parse(campaign.endsAt) <= now)) continue;
        if ((await repository.getPublication(shop, campaign.id)).state === 'active') published.push(campaign);
      }
      if (published.some(campaign => offerSelections(campaign).some(selection => selection.productId === productId))) return c.json({ error: 'No published campaign for this product.' }, 404);
      const candidates = published.filter(campaign => !campaign.scope.excludedProductIds?.includes(productId) && ((os21 && campaign.scope.kind === 'collections') || includesProduct(campaign.scope, productId, collections)));
      if (os21 && !candidates.some(campaign => campaign.scope.kind === 'products' && includesProduct(campaign.scope, productId)) && candidates.some(campaign => campaign.scope.kind === 'collections')) {
        collections = { complete: true, ids: await resolveStorefrontCollections(shop, productId, c.env, v2) };
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
      const marketId = await resolveStorefrontMarketId(shop, countryCode, c.env, v2);
      const selected = preferred[0];
      if (v2 && hasEnabledOffers(selected)) {
        const digest = await offerConfigDigest(selected);
        const latest = await repository.get(shop, selected.id);
        if (!latest || latest.revision !== selected.revision) return c.json({ error: 'Campaign revision changed.', code: 'STALE_REVISION' }, 409);
        const currentNow = c.env.now?.() ?? Date.now();
        if (latest.status !== 'active' || (latest.startsAt && Date.parse(latest.startsAt) > currentNow) || (latest.endsAt && Date.parse(latest.endsAt) <= currentNow) || (await repository.getPublication(shop, selected.id)).state !== 'active' || !(await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).getInstalledStoreId(shop)) || !hasSubscriptionAccess(await new D1SubscriptionRepository(c.env.DB).readEntitlement(c.env.SHOPLINE_APP_KEY, shop))) return c.json({ error: 'No published campaign for this product.' }, 404);
        return c.json({ version: 2, clientFeatures: 'gift-bundles-v1', campaign: { ...publicCampaign(selected), revision: selected.revision, ...(marketId ? { marketId } : {}), widgetTitle: copy['widget.title']?.trim() ?? '', copy,
          ...(selected.gifts?.enabled ? { gifts: selected.gifts } : {}), ...(selected.bundles?.enabled ? { bundles: selected.bundles } : {}),
          offerTitles: { gifts: copy['widget.gifts.title'] ?? '🎁 Free gifts with your order', bundles: copy['widget.bundles.title'] ?? 'Frequently Bought Together' },
          catalogSource: 'theme', catalogIndex: { namespace: OFFER_INDEX_NAMESPACE, key: OFFER_INDEX_KEY, version: 1, digest },
          offerCapability: { protocol: 'gift-bundles-v1', functionVerified: supportedOfferFunction(shop, c.env) },
        } });
      }
      return c.json({ campaign: { ...publicCampaign(preferred[0]), ...(marketId ? { marketId } : {}), widgetTitle: copy['widget.title']?.trim() ?? '', copy } });
    } catch { return c.json({ error: 'Campaign data is unavailable.' }, 503); }
  });
  for (const path of ['/api/quantity-breaks/offer-preview', '/api/quantity-breaks/gifts/preview', '/api/quantity-breaks/bundles/preview']) app.post(path, bodyLimit({ maxSize: 64 * 1024 }), async c => {
    c.header('Cache-Control', 'no-store');
    const session = await requireShoplineSession(c.req.raw, c.env);
    if (session instanceof Response) return session;
    c.set('auth', session);
    const denied = await requireSubscriptionAccess(c.env.DB, c.env.SHOPLINE_APP_KEY, session.handle);
    if (denied) return denied;
    const limited = await requirePublicRateLimit(c.req.raw, c.env); if (limited) return limited;
    let body: { selection?: OfferSelection[]; marketId?: string; currencyCode?: string; countryCode?: string; locale?: string; revision?: string };
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid preview payload.' }, 400); }
    if (!body || !validOfferSelection(body.selection) || typeof body.revision !== 'string' || !body.revision || body.revision.length > 128 || [body.marketId, body.currencyCode, body.countryCode, body.locale].some(value => value !== undefined && (typeof value !== 'string' || value.length > 128))) return c.json({ error: 'Invalid preview payload.' }, 400);
    const locale = normalizeStorefrontLocale(body.locale) ?? 'en';
    try {
      const result = await resolveQueuedOfferPreview(session, body.selection, body, c.req.raw.signal);
      if (result.retryAfter) c.header('Retry-After', String(result.retryAfter));
      return c.json({ version: 2, revision: body.revision, locale, marketId: body.marketId ?? null, currencyCode: body.currencyCode ?? null, ...result }, result.retryAfter ? 429 : 200);
    } catch { return c.json({ error: 'Preview Product/variant identity is unavailable.' }, 422); }
  });

}
