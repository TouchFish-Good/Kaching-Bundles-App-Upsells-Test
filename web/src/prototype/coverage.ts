import type { Campaign } from "./model";

export type PrototypeScope = "All products" | "Specific products" | "Product collections";
export type PrototypeCoverage = { state: "clear" | "conflict" | "unverified"; campaigns: Campaign[] };
export type CollectionPriorityNotice = { productTitle: string; campaignName: string };

export function findPrototypeCoverageConflicts(
  campaigns: Campaign[],
  scope: PrototypeScope,
  product: string,
  editingId?: string,
): PrototypeCoverage {
  if (scope === "Product collections") return { state: "unverified", campaigns: [] };
  const conflicts = campaigns.filter((campaign) => {
    if (campaign.id === editingId || !["Active", "Scheduled"].includes(campaign.status)) return false;
    if (scope === "All products" || campaign.products === "All eligible products") return true;
    return campaign.products === product || campaign.products.startsWith(`${product},`);
  });
  return { state: conflicts.length ? "conflict" : "clear", campaigns: conflicts };
}

export function findCollectionPriorityNotices(campaigns: Campaign[], products: Array<{ id: string; title: string }>, editingId?: string): CollectionPriorityNotice[] {
  const directCampaigns = campaigns.filter((campaign) => campaign.id !== editingId && ["Active", "Scheduled"].includes(campaign.status) && campaign.scope?.kind === 'products');
  const notices: CollectionPriorityNotice[] = [];
  for (const product of products) {
    for (const campaign of directCampaigns) {
      if (campaign.scope?.productIds?.includes(product.id)) notices.push({ productTitle: product.title, campaignName: campaign.name });
    }
  }
  return notices;
}
