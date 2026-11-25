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
export function trustedOfferVariant(
  v: OfferPreviewVariant | undefined,
  currency?: string,
): v is OfferPreviewVariant & {
  price: NonNullable<OfferPreviewVariant["price"]>;
} {
  if (
    !v ||
    v.available !== true ||
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
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
          offerEligible(rule, offerTiers, mainQuantity) &&
          rule.productId !== mainProductId;
        const count =
          kind === "gifts"
            ? rule.quantity
            : (quantities[rule.ruleId] ?? rule.quantity);
        const options =
          product?.variants.filter((v) =>
            rule.allowedVariantIds.includes(v.id),
          ) ?? [];
        const selected = Array.from({ length: count }, (_, index) => {
          const saved = variants[`${kind}:${rule.ruleId}:${index}`];
          return saved
            ? options.find((v) => v.id === saved)
            : options.find((v) => trustedOfferVariant(v, currencyCode));
        });
        const ready =
          product?.available === true &&
          Number.isSafeInteger(count) &&
          count >= 1 &&
          selected.length === count &&
          selected.every((v) => trustedOfferVariant(v, currencyCode));
        const cap = mainProductId
          ? offerQuota(rule, offerTiers, [
              { productId: mainProductId, quantity: mainQuantity },
            ])
          : offerEligible(rule, offerTiers, mainQuantity)
            ? rule.quantity
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
        const safeMoney =
          Number.isSafeInteger(original) && Number.isSafeInteger(savings);
        return {
          rule,
          product,
          eligible,
          ready: ready && discountReady && safeMoney,
          options,
          selected,
          count,
          original: safeMoney ? original : 0,
          savings: safeMoney ? savings : 0,
          included:
            safeMoney &&
            ((kind === "gifts" && eligible && ready && discountReady) ||
              (kind === "bundles" &&
                choices.includes(rule.ruleId) &&
                eligible &&
                ready &&
                discountReady)),
        };
      }),
    }));
  const bundle = groups.find((g) => g.kind === "bundles");
  if (bundle?.module.selectionMode === "single") {
    const selected = bundle.cards
      .filter((c) => c.included)
      .sort(
        (a, b) =>
          b.savings - a.savings || a.rule.displayOrder - b.rule.displayOrder,
      );
    for (const card of bundle.cards) card.included = selected[0] === card;
  }
  const included = groups.flatMap((g) => g.cards.filter((c) => c.included));
  const original = included.reduce((n, c) => n + c.original, 0),
    savings = included.reduce((n, c) => n + c.savings, 0);
  const safe = Number.isSafeInteger(original) && Number.isSafeInteger(savings);
  return {
    groups,
    original: safe ? original : 0,
    discounted: safe ? original - savings : 0,
    savings: safe ? savings : 0,
    quantity: included.reduce((n, c) => n + c.count, 0),
    lines: included.flatMap((c) => c.selected.map((v) => v!.id)),
    safe,
    toggle: (module: OfferModuleConfig, rule: OfferRule) =>
      setChoices((current) =>
        current.includes(rule.ruleId)
          ? current.filter((id) => id !== rule.ruleId)
          : module.selectionMode === "single"
            ? [rule.ruleId]
            : [...current, rule.ruleId],
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
    setQuantity: (id: string, count: number) =>
      setQuantities((current) => ({ ...current, [id]: count })),
  };
}
export type OfferSelection = ReturnType<typeof useOfferSelection>;
