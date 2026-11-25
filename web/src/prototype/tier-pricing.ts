import type { Tier } from "./model";

export type TierPrice = { original: number; discounted: number; savings: number };

export function validateTierPricing(tier: Tier, _variantPrices: number[] = []): string {
  const mode = tier.discountType ?? "percentage";
  if (mode === "percentage") {
    const percent = tier.discountValue ?? tier.discountPercent;
    return Number.isInteger(percent) && percent >= 0 && percent <= 100 ? "" : "Percentage must be between 0 and 100.";
  }
  if (mode === "none") return "";
  if (!Number.isSafeInteger(tier.discountValue) || (tier.discountValue ?? -1) < 0) return mode === "fixed_price" || mode === "bundle_fixed_price" ? "Fixed price must be zero or greater." : "Discount amount must be zero or greater.";
  return "";
}

export function calculateTierPricing(variantPrices: number[], tier: Tier): TierPrice {
  const error = validateTierPricing(tier, variantPrices);
  if (error) throw new Error(error);
  const mode = tier.discountType ?? "percentage";
  const original = variantPrices.reduce((sum, price) => sum + price, 0);
  if (mode === "bundle_fixed_amount") {
    const savings = Math.min(original, tier.discountValue!);
    return { original, discounted: original - savings, savings };
  }
  if (mode === "bundle_fixed_price") {
    const discounted = Math.min(original, tier.discountValue!);
    return { original, discounted, savings: original - discounted };
  }
  const discounted = variantPrices.reduce((sum, price) => {
    if (!Number.isSafeInteger(price) || price < 0) throw new Error("Variant price must be a non-negative integer in minor units.");
    if (mode === "none") return sum + price;
    if (mode === "fixed_amount") return sum + Math.max(0, price - tier.discountValue!);
    if (mode === "fixed_price") return sum + Math.min(price, tier.discountValue!);
    const numerator = BigInt(price) * BigInt(100 - (tier.discountValue ?? tier.discountPercent)) + 50n;
    return sum + Number(numerator / 100n);
  }, 0);
  return { original, discounted, savings: original - discounted };
}
