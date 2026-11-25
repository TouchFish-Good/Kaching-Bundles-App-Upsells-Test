import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  effectiveOfferColumns,
  offerUnlockTier,
} from "../../../shared/offer-core.mjs";
import type { OfferModuleKind } from "../../../shared/offer-core.mjs";
import type { Tier } from "./model";
import type { OfferSelection } from "./offer-selection";
import type { OfferPreviewState } from "./offer-preview-client";
import {
  renderStorefrontCopy,
  type StorefrontTranslations,
} from "./storefront-copy";
import { offerText } from "./offer-messages";
import { formatMinorMoney } from "./money";
import styles from "./offers.module.css";
export function OfferPreview({
  selection,
  device,
  locale,
  translations,
  preview,
  tiers,
  onUnlock,
  mainTotal,
  mainReady,
  currencyCode,
}: {
  selection: OfferSelection;
  device: "desktop" | "mobile";
  locale: string;
  translations: StorefrontTranslations;
  preview?: OfferPreviewState;
  tiers: Tier[];
  onUnlock: (quantity: number) => void;
  mainTotal: number;
  mainReady: boolean;
  currencyCode: string;
}) {
  return (
    <>
      {selection.groups.map((group) => (
        <OfferGroup
          key={group.kind}
          {...{
            group,
            selection,
            device,
            locale,
            translations,
            preview,
            tiers,
            onUnlock,
            currencyCode,
          }}
        />
      ))}
      {selection.groups.some((g) => g.cards.length > 0) && (
        <div data-offer-summary className={styles.summary}>
          <span>
            {offerText(locale, "summary")}{" "}
            <strong>
              {formatMinorMoney(selection.discounted, currencyCode, locale)}
            </strong>
          </span>
          <span>
            {offerText(locale, "total")}{" "}
            <strong>
              {mainReady &&
              selection.safe &&
              Number.isSafeInteger(mainTotal + selection.discounted)
                ? formatMinorMoney(
                    mainTotal + selection.discounted,
                    currencyCode,
                    locale,
                  )
                : "…"}
            </strong>
          </span>
          <small>{offerText(locale, "simulated")}</small>
        </div>
      )}
    </>
  );
}
function OfferGroup({
  group,
  selection,
  device,
  locale,
  translations,
  preview,
  tiers,
  onUnlock,
  currencyCode,
}: {
  group: OfferSelection["groups"][number];
  selection: OfferSelection;
  device: "desktop" | "mobile";
  locale: string;
  translations: StorefrontTranslations;
  preview?: OfferPreviewState;
  tiers: Tier[];
  onUnlock: (quantity: number) => void;
  currencyCode: string;
}) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const style = group.module.style[device];
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const columns = effectiveOfferColumns(width, style.layout);
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  const title = renderStorefrontCopy(
    `widget.${group.kind}.title`,
    translations,
  );
  const carousel = style.layout.mode === "carousel";
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * (track.current.clientWidth + style.layout.columnGapPx),
      behavior: "smooth",
    });
  const css = {
    "--offer-columns": columns,
    "--offer-column-gap": `${style.layout.columnGapPx}px`,
    "--offer-row-gap": `${style.layout.rowGapPx}px`,
    "--offer-image-size": `${style.image.sizePx}px`,
    "--offer-image-radius": `${style.image.radiusPx}px`,
    "--offer-background": style.colors?.background ?? "#ffffff",
    "--offer-text": style.colors?.text ?? "#171717",
    "--offer-title-size": `${style.typography?.title?.sizePx ?? 14}px`,
    "--offer-title-weight": style.typography?.title?.weight ?? 600,
  } as CSSProperties;
  return (
    <section
      ref={root}
      className={styles.group}
      data-offer-kind={group.kind}
      data-columns={columns}
      data-layout={style.layout.mode}
      style={css}
      aria-busy={preview?.state === "loading"}
    >
      <div className={styles.groupHeading}>
        {title && <h3>{title}</h3>}
        {carousel && (
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label={`${text("previous")} ${text(group.kind)}`}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={`${text("next")} ${text(group.kind)}`}
              onClick={() => scroll(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      {preview?.state === "loading" && <p role="status">{text("loading")}</p>}
      {preview?.retryAt && (
        <p role="status">
          {text("unavailable")} · {text("retry")}{" "}
          {new Date(preview.retryAt).toLocaleTimeString(locale)}
        </p>
      )}
      <div
        ref={track}
        className={`${styles.cards} ${carousel ? styles.carousel : ""}`}
        tabIndex={carousel ? 0 : undefined}
        role={carousel ? "region" : undefined}
        aria-label={carousel ? title || text(group.kind) : undefined}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !carousel) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            scroll(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        {group.cards.map((card) => {
          const unlock = selection.mainQualifies ? offerUnlockTier(
            card.rule,
            tiers.filter(
              (t): t is Tier & { tierId: string } =>
                typeof t.tierId === "string",
            ),
          ) : undefined;
          return (
            <article
              key={card.rule.ruleId}
              className={`${styles.card} ${card.included ? styles.included : ""}`}
              data-rule-id={card.rule.ruleId}
              data-included={card.included}
            >
              {card.rule.label && card.rule.labelPosition === "corner" && (
                <span className={styles.badge}>{card.rule.label}</span>
              )}
              {card.rule.showImage &&
                (card.product?.imageUrl ? (
                  <img
                    className={styles.productImage}
                    src={card.product.imageUrl}
                    alt=""
                  />
                ) : (
                  <div className={styles.imageBlank} aria-hidden="true" />
                ))}
              <strong className={styles.productTitle}>
                {card.product?.title ??
                  text(
                    preview?.state === "loading" ? "loading" : "unavailable",
                  )}
              </strong>
              {card.rule.label && card.rule.labelPosition === "below_title" && (
                <span className={styles.inlineBadge}>{card.rule.label}</span>
              )}
              {group.kind === "bundles" && (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    aria-label={card.product?.title ?? text("bundles")}
                    checked={card.included}
                    disabled={!card.ready || (!card.eligible && !unlock)}
                    onChange={(event) => {
                      if (!card.eligible && unlock) onUnlock(unlock.quantity);
                      selection.select(group.module, card.rule, event.currentTarget.checked);
                    }}
                  />
                  {card.product?.title ?? text("bundles")}
                  {!card.eligible && unlock ? ` · ${text("locked")} · ${unlock.quantity}` : ""}
                </label>
              )}
              {!card.eligible && group.kind === "gifts" ? (
                <button type="button" disabled={!unlock} onClick={() => unlock && onUnlock(unlock.quantity)}>
                  {text("locked")}{unlock ? ` · ${unlock.quantity}` : ""}
                </button>
              ) : !card.ready ? (
                <span role="status">{text(preview?.state === "loading" ? "loading" : "unavailable")}</span>
              ) : card.eligible ? (
                <>
                  <span className={styles.price}>
                    {formatMinorMoney(card.original - card.savings, currencyCode, locale)}
                    {card.savings > 0 && <del>{formatMinorMoney(card.original, currencyCode, locale)}</del>}
                  </span>
                  {group.kind === "gifts" && <span>× {card.count}</span>}
                </>
              ) : null}
              {card.options.length > 0 &&
                card.selected.map((variant, index) => (
                  <label key={index}>
                    {renderStorefrontCopy("widget.choose_option", translations)}{" "}
                    #{index + 1}
                    <select
                      aria-label={`${text(group.kind)} ${card.product?.title} ${renderStorefrontCopy("widget.choose_option", translations)} ${index + 1}`}
                      value={variant?.id ?? ""}
                      onChange={(e) =>
                        selection.selectVariant(
                          group.kind as OfferModuleKind,
                          card.rule.ruleId,
                          index,
                          e.target.value,
                        )
                      }
                    >
                      <option value="" disabled>
                        {text("unavailable")}
                      </option>
                      {card.options.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title || v.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

            </article>
          );
        })}
      </div>
    </section>
  );
}

export function OfferReceipt({
  selection,
  locale,
  currencyCode,
}: {
  selection: OfferSelection;
  locale: string;
  currencyCode: string;
}) {
  if (
    !selection.groups.some((group) => group.cards.some((card) => card.included))
  )
    return null;
  return (
    <div data-offer-receipt className={styles.receipt}>
      {selection.groups.flatMap((group) =>
        group.cards
          .filter((card) => card.included)
          .map((card) => {
            const variants = new Map<
              string,
              { title: string; quantity: number }
            >();
            for (const variant of card.selected) {
              if (!variant) continue;
              const line = variants.get(variant.id);
              variants.set(variant.id, {
                title: variant.title ?? "",
                quantity: (line?.quantity ?? 0) + 1,
              });
            }
            return (
              <div key={`${group.kind}:${card.rule.ruleId}`}>
                <span>
                  {offerText(locale, group.kind)} · {card.product?.title} ·{" "}
                  {[...variants.values()]
                    .map((v) => `${v.title} × ${v.quantity}`)
                    .join(" / ")}
                </span>
                <strong>
                  {formatMinorMoney(
                    card.original - card.savings,
                    currencyCode,
                    locale,
                  )}
                </strong>
              </div>
            );
          }),
      )}
    </div>
  );
}
