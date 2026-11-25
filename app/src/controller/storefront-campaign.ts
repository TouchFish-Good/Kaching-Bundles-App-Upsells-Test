import type { Request, Response } from 'express';
import type { Campaign, CampaignScope } from '../service/campaign/model';
import type { CampaignRepository } from '../service/campaign/repository';
import type { TranslationRepository } from '../service/translations';

type PublicRepository = Pick<CampaignRepository, 'list'> & Partial<Pick<CampaignRepository, 'getPublication'>>;

function includesProduct(scope: CampaignScope, productId: string): boolean {
  if (scope.excludedProductIds?.includes(productId)) return false;
  if (scope.kind === 'all') return true;
  return (scope.kind === 'collections' ? scope.resolvedProductIds : scope.productIds)?.includes(productId) === true;
}

function publicCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    tiers: [...campaign.tiers].sort((a, b) => a.displayOrder - b.displayOrder).map((tier) => ({
      tierId: tier.tierId,
      quantity: tier.quantity,
      discountType: tier.discountType,
      ...(tier.discountValue === undefined ? {} : { discountValue: tier.discountValue }),
      ...(tier.marketOverrides ? { marketOverrides: tier.marketOverrides } : {}),
      ...(tier.label ? { label: tier.label } : {}),
      ...(tier.subtitle ? { subtitle: tier.subtitle } : {}),
      ...(tier.tag ? { tag: tier.tag } : {}),
      ...(tier.recommended ? { recommended: true } : {}),
    })),
    ...(campaign.widget ? { widget: campaign.widget } : {}),
  };
}

export function createStorefrontCampaignController(repository: PublicRepository, translations?: Pick<TranslationRepository, 'read'>) {
  return async (request: Request, response: Response) => {
    response.set('Cache-Control', 'no-store');
    response.set('Access-Control-Allow-Origin', '*');
    const shop = request.query.shop;
    const productId = request.query.productId;
    if (typeof shop !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/i.test(shop) ||
      typeof productId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(productId)) {
      response.status(400).json({ error: 'Valid shop and productId are required.' });
      return;
    }
    try {
      const now = Date.now();
      const matches = [];
      for (const campaign of await repository.list(shop)) {
        if (campaign.status !== 'active' || !includesProduct(campaign.scope, productId) ||
          campaign.startsAt && Date.parse(campaign.startsAt) > now ||
          campaign.endsAt && Date.parse(campaign.endsAt) <= now) continue;
        if (!repository.getPublication || (await repository.getPublication(shop, campaign.id)).state !== 'active') continue;
        matches.push(campaign);
      }
      if (matches.length > 1) {
        response.status(409).json({ error: 'Multiple published campaigns match this product.' });
        return;
      }
      if (!matches.length) {
        response.status(404).json({ error: 'No published campaign for this product.' });
        return;
      }
      const locale = typeof request.query.locale === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(request.query.locale)
        ? request.query.locale : 'en';
      let copy: Record<string, string> = {};
      if (translations) {
        try {
          copy = await translations.read(shop, locale);
        } catch {
          // Optional storefront copy must not suppress an otherwise published offer.
        }
      }
      response.status(200).json({ campaign: { ...publicCampaign(matches[0]), widgetTitle: copy['widget.title']?.trim() ?? '', copy } });
    } catch {
      response.status(503).json({ error: 'Campaign data is unavailable.' });
    }
  };
}
