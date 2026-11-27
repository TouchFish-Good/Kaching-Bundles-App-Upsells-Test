import shared from "../pages/quantity-breaks.module.css";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Gift, Package, Trash2 } from "lucide-react";
import type {
  OfferModuleConfig,
  OfferModuleKind,
  OfferRule,
} from "../../../shared/offer-core.mjs";
import type { Tier } from "./model";
import { CampaignProductPicker, type Product } from "./CampaignProductPicker";
import { Toggle } from "./ui";
import { OfferVariantPicker } from "./OfferVariantPicker";
import { OfferTriggerEditor } from "./OfferTriggerEditor";
import { OfferStyleEditor } from "./OfferStyleEditor";
import { offerText } from "./offer-messages";
import { offerRefinementText } from "./offer-ui-copy";
import { formatMoneyInput, parseMoney } from "./money";
import { campaignText } from "./campaign-editor-messages";
import type { MarketsResponse } from "./market-config";
import styles from "./offers.module.css";
import controls from "./offer-module-controls.module.css";
type Props = {
  kind: OfferModuleKind;
  value: OfferModuleConfig;
  onChange: (v: OfferModuleConfig) => void;
  tiers: Tier[];
  locale: string;
  fetcher: typeof fetch;
  currencyCode: string;
  onDraftError: (value: string) => void;
  markets?: { state: "loading" | "ready" | "error"; data?: MarketsResponse };
  onRetryMarkets?: () => void;
};
export function OfferModulePanel({
  kind,
  value,
  onChange,
  tiers,
  locale,
  fetcher,
  currencyCode,
  onDraftError,
  markets,
  onRetryMarkets,
}: Props) {
  const [tab, setTab] = useState<"settings" | "style">("settings");
  const [expanded, setExpanded] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const latest = useRef(value);
  latest.current = value;
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  const title = text(kind);
  const ct = (key: Parameters<typeof campaignText>[1]) => campaignText(locale, key);
  const ids = [...new Set(value.items.map((r) => r.productId))];
  useEffect(() => {
    if (!expanded || !ids.length) return;
    const controller = new AbortController();
    setLoadError(false);
    void fetcher(
      `/api/quantity-breaks/products?ids=${encodeURIComponent(ids.join(","))}`,
      { credentials: "same-origin", signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<{ products: Product[] }>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setProducts((current) => ({
          ...current,
          ...Object.fromEntries(data.products.map((p) => [p.id, p])),
        }));
        let changed = false;
        const items = latest.current.items.map((rule) => {
          if (!pending.current.has(rule.ruleId)) return rule;
          const product = data.products.find((p) => p.id === rule.productId);
          if (!product?.variants?.length) return rule;
          pending.current.delete(rule.ruleId);
          changed = true;
          return {
            ...rule,
            allowedVariantIds: product.variants.map((v) => v.id),
          };
        });
        if (changed) onChange({ ...latest.current, items });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [ids.join(","), expanded, value.enabled, fetcher, retry]);
  const patch = (id: string, change: Partial<OfferRule>) =>
    onChange({
      ...value,
      items: value.items.map((r) =>
        r.ruleId === id ? { ...r, ...change } : r,
      ),
    });
  const replaceItems = (items: OfferRule[]) => {
    const retained = new Set(items.map((rule) => rule.ruleId));
    const retainDrafts = (drafts: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(drafts).filter(([id]) => [...retained].some(ruleId => id === ruleId || id.startsWith(`${ruleId}:market:`))),
      );
    const nextErrors = retainDrafts(errors);
    setErrors(nextErrors);
    setAmounts(retainDrafts);
    for (const id of pending.current) {
      if (!retained.has(id)) pending.current.delete(id);
    }
    onDraftError(Object.values(nextErrors)[0] ?? "");
    onChange({ ...value, items });
  };
  const selectProducts = (selected: string[]) => {
    const items = selected.map((id, index) => {
      const old = value.items.find((r) => r.productId === id);
      if (old) return { ...old, displayOrder: index };
      const ruleId = crypto.randomUUID();
      pending.current.add(ruleId);
      return {
        ruleId,
        displayOrder: index,
        productId: id,
        allowedVariantIds: [],
        quantity: 1,
        label: "",
        labelPosition: "corner",
        showImage: true,
        discountType: kind === "gifts" ? "fixed_price" : "percentage",
        discountValue: 0,
        trigger: {
          type: "tiers",
          tierIds: (() => {
            const valid = tiers.filter(tier => !!tier.tierId);
            const matching = valid.filter(tier => tier.quantity >= 2);
            return (matching.length ? matching : valid.slice(0, 1)).map(tier => tier.tierId!);
          })(),
        },
      } as OfferRule;
    });
    replaceItems(items);
  };
  const amount = (rule: OfferRule, input: string) => {
    setAmounts((current) => ({ ...current, [rule.ruleId]: input }));
    const next = { ...errors };
    try {
      const n =
        rule.discountType === "percentage"
          ? parseMoney(input, "USD", "Percentage")
          : parseMoney(input, currencyCode, "Amount");
      if (rule.discountType === "percentage" && n > 10000)
        throw Error(text("invalid"));
      patch(rule.ruleId, { discountValue: n });
      delete next[rule.ruleId];
    } catch {
      next[rule.ruleId] = text("invalid");
    }
    setErrors(next);
    onDraftError(Object.values(next)[0] ?? "");
  };
  const clearDraft = (key: string, allMarkets = false) => {
    const keep = ([id]: [string, string]) => id !== key && !(allMarkets && id.startsWith(`${key}:market:`));
    setAmounts(current => Object.fromEntries(Object.entries(current).filter(keep)));
    const next = Object.fromEntries(Object.entries(errors).filter(keep));
    setErrors(next);
    onDraftError(Object.values(next)[0] ?? "");
  };
  const marketAmount = (rule: OfferRule, marketId: string, currency: string, input: string) => {
    const key = `${rule.ruleId}:market:${marketId}`;
    setAmounts(current => ({ ...current, [key]: input }));
    const next = { ...errors };
    try {
      const amountMinor = parseMoney(input, currency, ct("marketAmount"));
      patch(rule.ruleId, { marketOverrides: { ...rule.marketOverrides, [marketId]: { mode: "specified_amount", currencyCode: currency, amountMinor } } });
      delete next[key];
    } catch { next[key] = text("invalid"); }
    setErrors(next);
    onDraftError(Object.values(next)[0] ?? "");
  };
  return (
    <section className={styles.panel} data-offer-panel={kind}>
      <header className={styles.panelHeader}>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={expanded}
          aria-controls={`offer-config-${kind}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRight
            size={16}
            className={expanded ? styles.rotated : ""}
            aria-hidden="true"
          />
          {kind === "gifts" ? (
            <Gift size={16} aria-hidden="true" />
          ) : (
            <Package size={16} aria-hidden="true" />
          )}
          <span>{title}</span>
        </button>
        {expanded && tab === "style" && <div className={shared.styleDeviceToggle} role="group" aria-label={`${title} ${text("style")}`}>
          <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>PC</button>
          <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile</button>
        </div>}
        <Toggle
          label={title}
          checked={value.enabled}
          onChange={() => onChange({ ...value, enabled: !value.enabled })}
        />
      </header>
      {expanded && (
        <div id={`offer-config-${kind}`} className={styles.panelBody}>
          <div role="tablist" aria-label={title} className={controls.tabs}>
            {(["settings", "style"] as const).map(name => <button key={name} type="button" role="tab" id={`offer-${kind}-${name}-tab`} aria-selected={tab === name} aria-controls={`offer-${kind}-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "settings" : event.key === "End" ? "style" : name === "settings" ? "style" : "settings";
              setTab(next);
              document.getElementById(`offer-${kind}-${next}-tab`)?.focus();
            }}>{ct(name)}</button>)}
          </div>
          {tab === "settings" && <div role="tabpanel" id={`offer-${kind}-settings`} aria-labelledby={`offer-${kind}-settings-tab`}>
          {kind === "bundles" && (
            <label>
              {text("selection")}
              <select
                value={value.selectionMode}
                onChange={(e) =>
                  onChange({
                    ...value,
                    selectionMode: e.target.value as "single" | "multiple",
                  })
                }
              >
                <option value="single">{text("single")}</option>
                <option value="multiple">{text("multiple")}</option>
              </select>
            </label>
          )}
          <CampaignProductPicker
            fetcher={fetcher}
            selectedIds={ids}
            onChange={selectProducts}
            locale={locale}
            mode="dialog"
            showSelectedItems={false}
          />
          {loadError && (
            <p role="alert">
              {text("unavailable")}{" "}
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                {text("retry")}
              </button>
            </p>
          )}
          {value.items.map((rule) => {
            const product = products[rule.productId];
            return (
              <fieldset key={rule.ruleId} className={styles.rule}>
                <legend>
                  {product?.title ??
                    text(loadError ? "unavailable" : "loading")}
                </legend>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`${text("remove")} ${product?.title ?? ""}`}
                  onClick={() =>
                    replaceItems(value.items.filter((r) => r.ruleId !== rule.ruleId))
                  }
                >
                  <Trash2 size={16} />
                </button>
                <OfferVariantPicker product={product} selected={rule.allowedVariantIds} onChange={ids => patch(rule.ruleId, {allowedVariantIds: ids})} locale={locale} />
                <div className={styles.fields}>
                  {kind === "gifts" && (
                  <label>
                    {text("quantity")}
                    <input
                      type="number"
                      min="1"
                      value={rule.quantity}
                      onChange={(e) =>
                        patch(rule.ruleId, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  )}
                  {kind === "gifts" && <>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={rule.showImage}
                      onChange={(e) =>
                        patch(rule.ruleId, { showImage: e.target.checked })
                      }
                    />
                    {text("showImage")}
                  </label>
                  {kind === "gifts" && <label className={styles.check}>
                    <input type="checkbox" checked={rule.showSavings !== false} onChange={event => patch(rule.ruleId, { showSavings: event.target.checked })} />
                    {offerRefinementText(locale, 'showSavings')}
                  </label>}
                  </>}
                  <label>
                    {text("label")}
                    <input
                      value={rule.label}
                      onChange={(e) =>
                        patch(rule.ruleId, { label: e.target.value })
                      }
                    />
                  </label>
                  <div className={`${shared.styleBadgePosition} ${styles.badgePositions}`}>
                    <span>{text("labelPosition")}</span><div>
                      {(["corner", "below_title"] as const).map(position => <label key={position}><input type="radio" name={`${kind}-${rule.ruleId}-badge-position`} value={position} checked={rule.labelPosition === position} onChange={() => patch(rule.ruleId, {labelPosition: position})} />{offerRefinementText(locale, position === "below_title" ? "belowTitle" : kind === "gifts" ? "giftBorder" : "bundleCorner")}</label>)}
                    </div>
                  </div>
                  <OfferTriggerEditor value={rule.trigger} onChange={trigger => patch(rule.ruleId, {trigger})} tiers={tiers} locale={locale} />
                  {kind === "bundles" && <>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={rule.showImage}
                      onChange={(e) =>
                        patch(rule.ruleId, { showImage: e.target.checked })
                      }
                    />
                    {text("showImage")}
                  </label>
                  </>}
                  {kind === "bundles" && (
                    <>
                      <label>
                        {text("discount")}
                        <select
                          value={rule.discountType}
                          onChange={(e) => {
                            patch(rule.ruleId, {
                              discountType: e.target
                                .value as OfferRule["discountType"],
                              discountValue: 0,
                              marketOverrides: undefined,
                            });
                            clearDraft(rule.ruleId, true);
                          }}
                        >
                          {(
                            [
                              "fixed_amount",
                              "fixed_price",
                              "percentage",
                            ] as const
                          ).map((v) => (
                            <option key={v} value={v}>
                              {text(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {text(rule.discountType)}
                        {rule.discountType === "percentage"
                          ? " (%)"
                          : ` (${currencyCode})`}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            amounts[rule.ruleId] ??
                            formatMoneyInput(
                              rule.discountValue,
                              rule.discountType === "percentage"
                                ? "USD"
                                : currencyCode,
                            )
                          }
                          aria-invalid={!!errors[rule.ruleId]}
                          onChange={(e) => amount(rule, e.target.value)}
                        />
                        {errors[rule.ruleId] && (
                          <span role="alert">{errors[rule.ruleId]}</span>
                        )}
                      </label>
                    </>
                  )}
                  {kind === "bundles" && rule.discountType !== "percentage" && <div className={shared.tierMarkets}>
                    <div className={shared.tierMarketsHeading}><b>{ct("marketAmounts")}</b><span>{ct("marketConversion")}</span></div>
                    {(!markets || markets.state === "loading") && <p role="status">{ct("loadingMarkets")}</p>}
                    {markets?.state === "error" && <p role="alert">{ct("marketUnavailable")} <button type="button" onClick={onRetryMarkets}>{text("retry")}</button></p>}
                    {markets?.state === "ready" && !markets.data?.markets.length && <p>{ct("noMarkets")}</p>}
                    {markets?.state === "ready" && markets.data?.markets.map(market => {
                      const override = rule.marketOverrides?.[market.id] ?? { mode: "auto_convert" as const };
                      const key = `${rule.ruleId}:market:${market.id}`;
                      const supported = market.enabled && market.specifiedAmountSupported && !!market.currencyCode;
                      return <div key={market.id} data-offer-market={market.id} className={shared.tierMarketRow}>
                        <div><strong>{market.name}</strong><span>{market.currencyCode ?? (market.regionCurrencyCodes.join(" / ") || ct("currencyUnavailable"))}{market.enabled ? "" : ` · ${ct("disabled")}`}</span></div>
                        <label>{ct("amountMode")}<select value={override.mode} disabled={!supported} onChange={event => {
                          if (event.target.value === "auto_convert") {
                            patch(rule.ruleId, { marketOverrides: { ...rule.marketOverrides, [market.id]: { mode: "auto_convert" } } });
                            clearDraft(key);
                          } else {
                            // Keep an empty draft visibly invalid until an exact amount is entered.
                            patch(rule.ruleId, { marketOverrides: { ...rule.marketOverrides, [market.id]: { mode: "specified_amount", currencyCode: market.currencyCode!, amountMinor: 0 } } });
                            setAmounts(current => ({ ...current, [key]: "" }));
                            const next = { ...errors, [key]: text("invalid") };
                            setErrors(next);
                            onDraftError(Object.values(next)[0] ?? "");
                          }
                        }}><option value="auto_convert">{ct("autoConvert")}</option><option value="specified_amount">{ct("specifyAmount")}</option></select></label>
                        {override.mode === "specified_amount" && market.currencyCode && <label>{ct("marketAmount")} ({market.currencyCode})<input type="text" inputMode="decimal" disabled={!supported} value={amounts[key] ?? (override.amountMinor === undefined ? "" : formatMoneyInput(override.amountMinor, market.currencyCode))} aria-invalid={!!errors[key]} onChange={event => marketAmount(rule, market.id, market.currencyCode!, event.target.value)} />{errors[key] && <span role="alert">{errors[key]}</span>}</label>}
                        {!market.specifiedAmountSupported && <small>{ct("specifiedUnavailable")}</small>}
                      </div>;
                    })}
                  </div>}
                </div>
              </fieldset>
            );
          })}
          </div>}
          {tab === "style" && <div role="tabpanel" id={`offer-${kind}-style`} aria-labelledby={`offer-${kind}-style-tab`}>
            <OfferStyleEditor
              kind={kind}
              locale={locale}
              value={value.style[device]}
              onChange={(s) =>
                onChange({ ...value, style: { ...value.style, [device]: s } })
              }
            />
          </div>}
        </div>
      )}
    </section>
  );
}
