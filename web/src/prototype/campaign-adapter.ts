import { normalizeOfferModule, type OfferModuleConfig } from '../../../shared/offer-core.mjs';
import type { Campaign, Tier, CampaignListStatus } from './model';
import { defaultCampaignWidgetConfig, normalizeCampaignWidgetConfig, type CampaignWidgetConfig } from './widget-config';
import { campaignText } from './campaign-editor-messages';

export type ServerCampaign = {
  id: string; name: string; status: 'draft' | 'active' | 'scheduled' | 'paused' | 'ended';
  discountName?: string;
  scope: { kind: 'all' | 'products' | 'collections'; productIds?: string[]; collectionIds?: string[]; excludedProductIds: string[] };
  tiers: Array<{ tierId: string; displayOrder: number; quantity: number; discountType: 'none' | 'percentage' | 'fixed_amount' | 'fixed_price' | 'bundle_fixed_amount' | 'bundle_fixed_price'; discountValue?: number; marketOverrides?: Tier['marketOverrides']; recommended?: boolean; label?: string; subtitle?: string; tag?: string }>;
  combinesWith: { orderDiscounts: boolean; productDiscounts?: boolean; shippingDiscounts: boolean };
  startsAt?: string; endsAt?: string; neverExpires?: boolean; timeZone?: string; widget?: CampaignWidgetConfig;
  gifts?: OfferModuleConfig;
  bundles?: OfferModuleConfig;
  platformDiscountId?: string;
  platformStatus?: 'active' | 'paused' | 'missing' | 'unverified';
  platformOperationState?: 'idle' | 'publishing' | 'activating' | 'updating' | 'active' | 'pausing' | 'paused' | 'unpublishing' | 'deleting' | 'removed' | 'entitlement_revoked' | 'missing' | 'needs_reconciliation';
  platformState?: 'idle' | 'publishing' | 'activating' | 'updating' | 'active' | 'pausing' | 'paused' | 'unpublishing' | 'deleting' | 'removed' | 'entitlement_revoked' | 'missing' | 'needs_reconciliation';
  revision: number; updatedAt: string;
  collectionConflict?: { state: 'clear' | 'conflict' | 'unknown'; campaignIds: string[] };
};

const statusLabels: Record<ServerCampaign['status'], Campaign['status']> = { draft: 'Draft', active: 'Active', scheduled: 'Scheduled', paused: 'Paused', ended: 'Ended' };
const listStatusLabels: Record<Campaign['status'], CampaignListStatus> = { Active: 'Active', Scheduled: 'Scheduled', Paused: 'Ended', Pausing: 'Pausing', Starting: 'Starting', Draft: 'Draft', Ended: 'Ended', Unverified: 'Unverified' };

function startsInFuture(startsAt: string | undefined): boolean {
  const start = startsAt ? Date.parse(startsAt) : Number.NaN;
  return Number.isFinite(start) && start > Date.now();
}

function displayStatus(campaign: ServerCampaign): Campaign['status'] {
  if (['publishing', 'activating'].includes(campaign.platformOperationState ?? '') && (!campaign.platformStatus || campaign.platformStatus === 'unverified')) return 'Starting';
  if (campaign.platformOperationState === 'pausing' && campaign.platformStatus !== 'unverified') return 'Pausing';
  if (campaign.platformStatus === 'active') return campaign.platformDiscountId && startsInFuture(campaign.startsAt) ? 'Scheduled' : 'Active';
  if (campaign.platformStatus === 'paused') return 'Ended';
  if (campaign.platformStatus === 'missing') return 'Draft';
  if (campaign.platformStatus === 'unverified') return 'Unverified';
  return statusLabels[campaign.status];
}

export function formatCampaignDateTime(value: string | undefined, locale = 'en', timeZone?: string): string {
  if (!value) return ({ en: 'Ongoing', fr: 'En cours', de: 'Laufend', es: 'En curso', it: 'In corso', nl: 'Lopend', sv: 'Pågår', tr: 'Devam ediyor', 'pt-br': 'Em andamento', 'zh-hans': '持续进行', 'zh-hant': '持續進行' } as Record<string, string>)[locale.toLowerCase()] ?? 'Ongoing';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
  }
}

const tierLabels: Record<string, { type: string; quantity: string; ongoing: string }> = {
  en: { type: 'Original price', quantity: 'item', ongoing: 'Ongoing' },
  fr: { type: 'Prix normal', quantity: 'article', ongoing: 'En cours' },
  de: { type: 'Regulärer Preis', quantity: 'Artikel', ongoing: 'Laufend' },
  es: { type: 'Precio normal', quantity: 'artículo', ongoing: 'En curso' },
  it: { type: 'Prezzo pieno', quantity: 'articolo', ongoing: 'In corso' },
  nl: { type: 'Volledige prijs', quantity: 'item', ongoing: 'Lopend' },
  sv: { type: 'Ordinarie pris', quantity: 'vara', ongoing: 'Pågår' },
  tr: { type: 'Normal fiyat', quantity: 'ürün', ongoing: 'Devam ediyor' },
  'pt-br': { type: 'Preço integral', quantity: 'item', ongoing: 'Em andamento' },
  'zh-hans': { type: '原价', quantity: '件', ongoing: '持续进行' },
  'zh-hant': { type: '原價', quantity: '件', ongoing: '持續進行' },
};

export function formatTierSummary(tiers: Campaign['tiers'], locale = 'en'): string {
  const language = locale.toLowerCase();
  const labels = tierLabels[language] ?? tierLabels.en;
  return tiers.map((tier) => {
    const quantity = `${tier.quantity}${language.startsWith('zh') ? labels.quantity : ` ${labels.quantity}${tier.quantity === 1 ? '' : 's'}`}`;
    const mode = tier.discountType ?? (tier.discountPercent ? 'percentage' : 'none');
    const key = mode === 'none' ? 'originalPrice' : mode === 'percentage' ? 'percentageOff' : mode === 'fixed_amount' ? 'amountOff' : mode === 'fixed_price' ? 'fixedPrice' : mode === 'bundle_fixed_amount' ? 'bundleAmountOff' : 'bundleFixedPrice';
    const type = campaignText(locale, key);
    const rawValue = tier.discountValue ?? tier.discountPercent ?? 0;
    const value = mode === 'none' ? '' : ` ${mode === 'percentage' ? rawValue : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rawValue / 100)}`;
    return `${quantity} ${type}${value}`;
  }).join(' · ');
}

export function formatTierRows(tiers: Campaign['tiers'], locale = 'en'): string[] {
  return formatTierSummary(tiers, locale).split(' · ');
}

export function toAdminCampaign(server: ServerCampaign, productTitles: Record<string, string> = {}): Campaign & { revision: number } {
  const productIds = server.scope.productIds ?? [];
  const products = server.scope.kind === 'all'
    ? 'All eligible products'
    : server.scope.kind === 'products' && productIds.length === 1
      ? productTitles[productIds[0]] ?? `${productIds.length} selected products`
      : server.scope.kind === 'products'
        ? `${productIds.length} selected products`
        : `${server.scope.collectionIds?.length ?? 0} collections`;
  return {
    id: server.id, name: server.name, discountName: server.discountName?.trim() || server.name, products, scope: server.scope, status: displayStatus(server), listStatus: listStatusLabels[displayStatus(server)], revision: server.revision, collectionConflict: server.collectionConflict,
    gifts: normalizeOfferModule(server.gifts, 'gifts'),
    bundles: normalizeOfferModule(server.bundles, 'bundles'),
    widget: server.widget ? normalizeCampaignWidgetConfig(server.widget) : defaultCampaignWidgetConfig(),
    startsAt: server.startsAt, endsAt: server.endsAt, neverExpires: server.neverExpires ?? !server.endsAt, timeZone: server.timeZone, combineOrder: server.combinesWith.orderDiscounts, combineProduct: server.combinesWith.productDiscounts ?? false, combineShipping: server.combinesWith.shippingDiscounts,
    schedule: formatCampaignDateTime(server.startsAt, undefined, server.timeZone),
    startTime: formatCampaignDateTime(server.startsAt, undefined, server.timeZone),
    endTime: formatCampaignDateTime(server.endsAt, undefined, server.timeZone),
    updated: new Date(server.updatedAt).toLocaleDateString(),
    tiers: [...server.tiers].sort((a, b) => a.displayOrder - b.displayOrder).map((tier) => ({
      tierId: tier.tierId, quantity: tier.quantity, label: tier.label ?? '', subtitle: tier.subtitle, tag: tier.tag,
      discountType: tier.discountType, discountValue: tier.discountType === 'percentage' ? (tier.discountValue ?? 0) / 100 : tier.discountValue,
      discountPercent: tier.discountType === 'percentage' ? (tier.discountValue ?? 0) / 100 : 0,
      marketOverrides: tier.marketOverrides, recommended: tier.recommended,
    })),
  };
}

export function toCampaignDraft(admin: Campaign, original?: ServerCampaign): Omit<ServerCampaign, 'revision' | 'updatedAt'> {
  const scope = admin.scope ?? (admin.products === 'All eligible products' ? { kind: 'all' as const, excludedProductIds: original?.scope.excludedProductIds ?? [] } : undefined);
  if (!scope) throw new Error('Real product selection is required before saving this scope.');
  const collectionIds = scope.kind === 'collections' ? [...new Set(scope.collectionIds ?? [])] : undefined;
  if (scope.kind === 'collections' && !collectionIds?.length) throw new Error('Select at least one SHOPLINE collection.');
  const productIds = scope.kind === 'products' ? [...new Set(scope.productIds ?? [])] : undefined;
  if (scope.kind === 'products' && !productIds?.length) throw new Error('Select at least one SHOPLINE product.');
  return {
    id: admin.id, name: admin.name, discountName: admin.discountName?.trim() || admin.name, status: admin.status.toLowerCase() as ServerCampaign['status'],
    scope: scope.kind === 'products' ? { kind: 'products', productIds, excludedProductIds: scope.excludedProductIds } : scope.kind === 'collections' ? { kind: 'collections', collectionIds, excludedProductIds: scope.excludedProductIds } : { kind: 'all', excludedProductIds: scope.excludedProductIds },
    tiers: admin.tiers.map((tier, index) => {
      const discountType = tier.discountType ?? (tier.discountPercent ? 'percentage' : 'none');
      const discountValue = discountType === 'none' ? undefined : discountType === 'percentage' ? Math.round((tier.discountValue ?? tier.discountPercent) * 100) : tier.discountValue;
      return { tierId: tier.tierId ?? crypto.randomUUID(), displayOrder: index, quantity: tier.quantity, discountType, discountValue, marketOverrides: tier.marketOverrides, recommended: tier.recommended, label: tier.label, subtitle: tier.subtitle, tag: tier.tag };
    }),
    startsAt: admin.startsAt, endsAt: admin.neverExpires ? undefined : admin.endsAt, neverExpires: admin.neverExpires ?? !admin.endsAt, timeZone: original?.timeZone,
    combinesWith: {
      orderDiscounts: admin.combineOrder ?? original?.combinesWith.orderDiscounts ?? false,
      productDiscounts: admin.combineProduct ?? original?.combinesWith.productDiscounts ?? false,
      shippingDiscounts: admin.combineShipping ?? original?.combinesWith.shippingDiscounts ?? false,
    },
    widget: admin.widget ?? original?.widget,
    gifts: normalizeOfferModule(admin.gifts ?? original?.gifts, 'gifts'),
    bundles: normalizeOfferModule(admin.bundles ?? original?.bundles, 'bundles'),
  };
}
