import { useState } from "react";
import {
  offerEligible,
  offerDiscountMinor,
  offerQuota,
} from "../../../shared/offer-core.mjs";
import type {
  OfferModuleConfig,
  OfferModuleKind,
  OfferRule,
} from "../../../shared/offer-core.mjs";
import type { Tier } from "./model";
import { minorUnits } from "./money";
import type {
  OfferPreviewState,
  OfferPreviewVariant,
} from "./offer-preview-client";
// Only the simulated preview's expanded per-unit controls are bounded. Preserve
// configured quantities above this budget and mark that accessory unavailable;
// this is not a Product, campaign, or checkout quantity limit.
const MAX_PREVIEW_UNIT_CONTROLS = 100;
export function trustedOfferVariant(
  v: OfferPreviewVariant | undefined,
  currency?: string,
): v is OfferPreviewVariant & {
  price: NonNullable<OfferPreviewVariant["price"]>;
} {
  if (
    !v ||
    v.available !== true ||
    v.availability === "sold_out" || v.availability === "unknown" ||
    !v.price ||
    !Number.isSafeInteger(v.price.amountMinor) ||
    v.price.amountMinor < 0 ||
    !/^[A-Z]{3}$/.test(v.price.currencyCode) ||
    (currency && v.price.currencyCode !== currency)
  )
    return false;
  try {
    return (
      Intl.supportedValuesOf("currency").includes(v.price.currencyCode) &&
      minorUnits(v.price.currencyCode) === v.price.currencyDecimals
    );
  } catch {
    return false;
  }
}
export function useOfferSelection({
  gifts,
  bundles,
  preview,
  tiers,
  mainProductId,
  mainQuantity,
  currencyCode,
  marketId,
}: {
  gifts?: OfferModuleConfig;
  bundles?: OfferModuleConfig;
  preview?: OfferPreviewState;
  tiers: Tier[];
  mainProductId?: string;
  mainQuantity: number;
  currencyCode?: string;
  marketId?: string;
}) {
  const offerTiers = tiers.filter(
    (t): t is Tier & { tierId: string } => typeof t.tierId === "string",
  );
  const [choices, setChoices] = useState<string[]>([]);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const mainQualifies = ![gifts, bundles].some(module => module?.enabled && module.items.some(rule => rule.productId === mainProductId));
  const groups = (
    [
      ["gifts", gifts],
      ["bundles", bundles],
    ] as const
  )
    .filter(
      (p): p is readonly [OfferModuleKind, OfferModuleConfig] =>
        !!p[1]?.enabled,
    )
    .map(([kind, module]) => ({
      kind,
      module,
      cards: module.items.map((rule) => {
        const product =
          preview?.state === "ready"
            ? preview.products.find(
                (p) => p.id === rule.productId && p.identityVerified === true,
              )
            : undefined;
        const eligible =
          mainQualifies && offerEligible(rule, offerTiers, mainQuantity);
        const count =
          kind === "gifts"
            ? rule.quantity
            : Number.isSafeInteger(rule.quantity) && rule.quantity >= 1 ? 1 : 0;
        const options =
          product?.variants.filter((v) =>
            rule.allowedVariantIds.includes(v.id) && v.availability !== "sold_out",
          ) ?? [];
        const countPreviewable =
          Number.isSafeInteger(count) &&
          count >= 1 &&
          count <= MAX_PREVIEW_UNIT_CONTROLS;
        const selected = countPreviewable
          ? Array.from({ length: count }, (_, index) => {
              const saved = variants[`${kind}:${rule.ruleId}:${index}`];
              return options.find((v) => v.id === saved)
                ?? options.find((v) => v.availability === "available" || (v.available === true && v.availability !== "unknown"))
                ?? options[0];
            })
          : [];
        const ready =
          product?.available === true &&
          countPreviewable &&
          selected.length === count &&
          selected.every((v) => trustedOfferVariant(v, currencyCode));
        const cap = !mainQualifies ? 0 : mainProductId
          ? offerQuota(kind === "bundles" ? { ...rule, quantity: count } : rule, offerTiers, [
              { productId: mainProductId, quantity: mainQuantity },
            ])
          : offerEligible(rule, offerTiers, mainQuantity)
            ? count
            : 0;
        const override = marketId
          ? rule.marketOverrides?.[marketId]
          : undefined;
        // Unknown conversion / mismatching specified currency cannot produce a quoted discounted price.
        const discountReady =
          !override ||
          (override.mode === "specified_amount" &&
            selected.every(
              (v) => v?.price?.currencyCode === override.currencyCode,
            ));
        const original = ready
          ? selected.reduce((n, v) => n + v!.price!.amountMinor, 0)
          : 0;
        const savings =
          ready && eligible && discountReady
            ? selected.reduce(
                (n, v, i) =>
                  n +
                  (i < cap
                    ? offerDiscountMinor(v!.price!.amountMinor, rule, override)
                    : 0),
                0,
              )
            : 0;
        // Display the configured offer before unlock without including it in any quote/cart totals.
        const potentialSavings = ready && discountReady
          ? selected.reduce((n, v) => n + offerDiscountMinor(v!.price!.amountMinor, rule, override), 0) : 0;
        const safeMoney =
          Number.isSafeInteger(original) && Number.isSafeInteger(savings);
        return {
          rule,
          product,
          eligible,
          hidden: !!product && rule.allowedVariantIds.length > 0 && rule.allowedVariantIds.every(id => product.variants.some(v => v.id === id && v.availability === "sold_out")),
          selectable: !!product && countPreviewable && options.length > 0,
          chosen: kind === "gifts" ? eligible : choices.includes(rule.ruleId) && eligible,
          checked: kind === "bundles" && eligible && choices.includes(rule.ruleId),
          ready: ready && discountReady && safeMoney,
          options,
          selected,
          count,
          original: safeMoney ? original : 0,
          savings: safeMoney ? savings : 0,
          potentialSavings: safeMoney && Number.isSafeInteger(potentialSavings) ? potentialSavings : 0,
          included:
            safeMoney &&
            ((kind === "gifts" && eligible && ready && discountReady) ||
              (kind === "bundles" &&
                choices.includes(rule.ruleId) &&
                eligible &&
                ready &&
                discountReady)),
        };
      }).filter(card => !card.hidden),
    }));
  const bundle = groups.find((g) => g.kind === "bundles");
  if (bundle?.module.selectionMode === "single") {
    const selected = bundle.cards
      .filter((c) => c.checked)
      .sort((a, b) => Number(b.ready) - Number(a.ready) || b.savings - a.savings || a.rule.displayOrder - b.rule.displayOrder);
    for (const card of bundle.cards) {
      card.checked = selected[0] === card;
      card.chosen = card.checked && card.eligible;
      card.included = card.chosen && card.ready;
    }
  }
  const included = groups.flatMap((g) => g.cards.filter((c) => c.included));
  const original = included.reduce((n, c) => n + c.original, 0),
    savings = included.reduce((n, c) => n + c.savings, 0),
    quantity = included.reduce((n, c) => n + c.count, 0);
  const quoteReady = groups.every(g => g.cards.every(c => !c.chosen || c.ready));
  const safe = quoteReady &&
    Number.isSafeInteger(original) &&
    Number.isSafeInteger(savings) &&
    Number.isSafeInteger(quantity) &&
    Number.isSafeInteger(original - savings);
  return {
    groups,
    mainQualifies,
    original: safe ? original : 0,
    discounted: safe ? original - savings : 0,
    savings: safe ? savings : 0,
    quantity: safe ? quantity : 0,
    lines: safe ? included.flatMap((c) => c.selected.map((v) => v!.id)) : [],
    safe,
    quoteReady,
    select: (module: OfferModuleConfig, rule: OfferRule, checked: boolean) =>
      setChoices((current) =>
        !checked
          ? current.filter((id) => id !== rule.ruleId)
          : module.selectionMode === "single"
            ? [rule.ruleId]
            : [...current.filter((id) => id !== rule.ruleId), rule.ruleId],
      ),
    selectVariant: (
      kind: OfferModuleKind,
      id: string,
      index: number,
      variantId: string,
    ) =>
      setVariants((current) => ({
        ...current,
        [`${kind}:${id}:${index}`]: variantId,
      })),
  };
}
export type OfferSelection = ReturnType<typeof useOfferSelection>;
