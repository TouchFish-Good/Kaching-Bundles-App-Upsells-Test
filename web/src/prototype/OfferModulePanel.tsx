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
import { OfferStyleEditor } from "./OfferStyleEditor";
import { offerText } from "./offer-messages";
import { formatMoneyInput, parseMoney } from "./money";
import styles from "./offers.module.css";
type Props = {
  kind: OfferModuleKind;
  value: OfferModuleConfig;
  onChange: (v: OfferModuleConfig) => void;
  tiers: Tier[];
  locale: string;
  fetcher: typeof fetch;
  currencyCode: string;
  onDraftError: (value: string) => void;
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
}: Props) {
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
  const ids = [...new Set(value.items.map((r) => r.productId))];
  useEffect(() => {
    if (!expanded || !value.enabled || !ids.length) return;
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
        Object.entries(drafts).filter(([id]) => retained.has(id)),
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
        trigger: { type: "quantity", operator: "gte", quantity: 2 },
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
  return (
    <section className={styles.panel} data-offer-panel={kind}>
      <header className={styles.panelHeader}>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={expanded && value.enabled}
          aria-controls={`offer-config-${kind}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRight
            size={16}
            className={expanded && value.enabled ? styles.rotated : ""}
            aria-hidden="true"
          />
          {kind === "gifts" ? (
            <Gift size={16} aria-hidden="true" />
          ) : (
            <Package size={16} aria-hidden="true" />
          )}
          <span>{title}</span>
        </button>
        <Toggle
          label={title}
          checked={value.enabled}
          onChange={() => onChange({ ...value, enabled: !value.enabled })}
        />
      </header>
      {value.enabled && expanded && (
        <div id={`offer-config-${kind}`} className={styles.panelBody}>
          {kind === "gifts" ? (
            <p>{text("allEligible")}</p>
          ) : (
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
                <fieldset className={styles.variantList}>
                  <legend>{text("variants")}</legend>
                  {product?.variants?.map((v) => (
                    <label key={v.id}>
                      <input
                        type="checkbox"
                        checked={rule.allowedVariantIds.includes(v.id)}
                        onChange={(e) =>
                          patch(rule.ruleId, {
                            allowedVariantIds: e.target.checked
                              ? [...rule.allowedVariantIds, v.id]
                              : rule.allowedVariantIds.filter(
                                  (id) => id !== v.id,
                                ),
                          })
                        }
                      />
                      {v.title || v.options.map((o) => o.value).join(" / ")}
                    </label>
                  ))}
                  {!rule.allowedVariantIds.length && (
                    <span role="alert">{text("noVariants")}</span>
                  )}
                </fieldset>
                <div className={styles.fields}>
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
                            setAmounts((a) => ({ ...a, [rule.ruleId]: "0" }));
                            const next = { ...errors };
                            delete next[rule.ruleId];
                            setErrors(next);
                            onDraftError(Object.values(next)[0] ?? "");
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
                  <label>
                    {text("condition")}
                    <select
                      value={rule.trigger.type}
                      onChange={(e) =>
                        patch(rule.ruleId, {
                          trigger:
                            e.target.value === "tiers"
                              ? {
                                  type: "tiers",
                                  tierIds: tiers[0]?.tierId
                                    ? [tiers[0].tierId]
                                    : [],
                                }
                              : {
                                  type: "quantity",
                                  operator: "gte",
                                  quantity: 2,
                                },
                        })
                      }
                    >
                      <option value="quantity">
                        {text("quantityCondition")}
                      </option>
                      <option value="tiers">{text("tiers")}</option>
                    </select>
                  </label>
                  {rule.trigger.type === "quantity" ? (
                    <>
                      <label>
                        {text("condition")}
                        <select
                          value={rule.trigger.operator}
                          onChange={(e) =>
                            patch(rule.ruleId, {
                              trigger: {
                                ...(rule.trigger as {
                                  type: "quantity";
                                  quantity: number;
                                }),
                                operator: e.target.value as "gte" | "gt" | "eq",
                              },
                            })
                          }
                        >
                          {(["gte", "gt", "eq"] as const).map((v) => (
                            <option key={v} value={v}>
                              {text(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {text("quantityCondition")}
                        <input
                          type="number"
                          min="1"
                          value={rule.trigger.quantity}
                          onChange={(e) =>
                            patch(rule.ruleId, {
                              trigger: {
                                ...(rule.trigger as {
                                  type: "quantity";
                                  operator: "gte" | "gt" | "eq";
                                }),
                                quantity: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <fieldset className={styles.variantList}>
                      <legend>{text("tiers")}</legend>
                      {tiers.map((t) => (
                        <label key={t.tierId}>
                          <input
                            type="checkbox"
                            checked={
                              rule.trigger.type === "tiers" &&
                              rule.trigger.tierIds.includes(t.tierId!)
                            }
                            onChange={(e) =>
                              patch(rule.ruleId, {
                                trigger: {
                                  type: "tiers",
                                  tierIds: e.target.checked
                                    ? [
                                        ...(rule.trigger.type === "tiers"
                                          ? rule.trigger.tierIds
                                          : []),
                                        t.tierId!,
                                      ]
                                    : (rule.trigger.type === "tiers"
                                        ? rule.trigger.tierIds
                                        : []
                                      ).filter((id) => id !== t.tierId),
                                },
                              })
                            }
                          />
                          {t.label}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <label>
                    {text("label")}
                    <input
                      value={rule.label}
                      onChange={(e) =>
                        patch(rule.ruleId, { label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {text("labelPosition")}
                    <select
                      value={rule.labelPosition}
                      onChange={(e) =>
                        patch(rule.ruleId, {
                          labelPosition: e.target.value as
                            "corner" | "below_title",
                        })
                      }
                    >
                      <option value="corner">{text("corner")}</option>
                      <option value="below_title">{text("below_title")}</option>
                    </select>
                  </label>
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
                </div>
              </fieldset>
            );
          })}
          <details>
            <summary>{text("style")}</summary>
            <div
              className={styles.device}
              role="group"
              aria-label={`${title} ${text("style")}`}
            >
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                >
                  {text(d)}
                </button>
              ))}
            </div>
            <OfferStyleEditor
              locale={locale}
              value={value.style[device]}
              onChange={(s) =>
                onChange({ ...value, style: { ...value.style, [device]: s } })
              }
            />
          </details>
        </div>
      )}
    </section>
  );
}
