import type { Tier } from './model';

type IdentifiedTier = Tier & { tierId: string };

export function copyTierAfter<T extends IdentifiedTier>(tiers: T[], sourceId: string, newId: string): T[] {
  const index = tiers.findIndex((tier) => tier.tierId === sourceId);
  if (index < 0 || !newId || tiers.some((tier) => tier.tierId === newId)) return tiers;
  const usedQuantities = new Set(tiers.map((tier) => tier.quantity));
  let quantity = Math.max(1, tiers[index].quantity + 1);
  while (usedQuantities.has(quantity)) quantity++;
  const copy = { ...structuredClone(tiers[index]), tierId: newId, quantity, recommended: false } as T;
  return [...tiers.slice(0, index + 1), copy, ...tiers.slice(index + 1)];
}

export function removeTierById<T extends IdentifiedTier>(tiers: T[], id: string): T[] {
  if (tiers.length <= 1 || !tiers.some((tier) => tier.tierId === id)) return tiers;
  return tiers.filter((tier) => tier.tierId !== id);
}
