export function reorderTier<T extends { tierId: string }>(tiers: T[], sourceId: string, targetId: string): T[] {
  const source = tiers.findIndex((tier) => tier.tierId === sourceId);
  const target = tiers.findIndex((tier) => tier.tierId === targetId);
  if (source < 0 || target < 0 || source === target) return tiers;
  const reordered = [...tiers];
  const [moved] = reordered.splice(source, 1);
  reordered.splice(target, 0, moved);
  return reordered;
}

export function reorderFromDragEnd<T extends { tierId: string }>(tiers: T[], sourceId: string, targetId: string | null): T[] {
  return targetId ? reorderTier(tiers, sourceId, targetId) : tiers;
}
