import type { SlotSelection } from "./model";

type StockVariant = { options?: SlotSelection; color?: string; size?: string; inventory: number; inventoryPolicy?: "deny" | "continue"; inventoryTracker?: boolean; available: boolean };
const variantOptions = (variant: StockVariant): SlotSelection => variant.options ?? { ...(variant.color ? { color: variant.color } : {}), ...(variant.size ? { size: variant.size } : {}) };

const sameOptions = (left: SlotSelection, right: SlotSelection) => Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([name, value]) => right[name] === value);

export function isVariantSoldOut(variant: StockVariant): boolean {
  return variant.inventoryTracker !== false && variant.inventoryPolicy !== "continue" && (!variant.available || variant.inventory <= 0);
}

export function hasPurchasableOption(
  variants: StockVariant[],
  option: string,
  value: string,
  current: SlotSelection | null,
): boolean {
  return variants.some((variant) => {
    const options = variantOptions(variant);
    if (options[option] !== value) return false;
    if (current && Object.entries(current).some(([name, selected]) => name !== option && options[name] !== selected)) return false;
    return !isVariantSoldOut(variant);
  });
}

export function extendSlotsWithInventory(current: (SlotSelection | null)[], quantity: number, variants: StockVariant[]): (SlotSelection | null)[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Quantity must be a positive integer.");
  const result = current.slice();
  while (result.length < quantity) {
    const next = variants.find((variant) => !isVariantSoldOut(variant) && (variant.inventoryTracker === false || variant.inventoryPolicy === "continue" || result.filter((slot) => slot && sameOptions(slot, variantOptions(variant))).length < variant.inventory));
    result.push(next ? { ...variantOptions(next) } : null);
  }
  return result;
}

export function chooseAvailableVariant(current: SlotSelection | null, patch: Partial<SlotSelection>, variants: StockVariant[]): SlotSelection | null {
  const desired: SlotSelection = Object.fromEntries(Object.entries({ ...current, ...patch }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const matchesPatch = (variant: StockVariant) => Object.entries(patch).every(([name, value]) => variantOptions(variant)[name] === value);
  const matching = variants.find((variant) => sameOptions(variantOptions(variant), desired));
  const fallback = matching ?? variants.find((variant) => !isVariantSoldOut(variant) && matchesPatch(variant)) ?? variants.find(matchesPatch);
  return fallback ? { ...variantOptions(fallback) } : current;
}

export function extendSlots(current: SlotSelection[], quantity: number, seed: SlotSelection): SlotSelection[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Quantity must be a positive integer.");
  return Array.from({ length: quantity }, (_, index) => current[index] ?? { ...seed });
}

export function retainSlotsForTier(current: SlotSelection[], quantity: number, seed: SlotSelection): SlotSelection[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Quantity must be a positive integer.");
  return current.length >= quantity ? current : extendSlots(current, quantity, seed);
}
