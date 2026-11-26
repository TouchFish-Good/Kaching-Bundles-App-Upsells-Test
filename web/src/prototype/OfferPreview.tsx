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
import tierStyles from "../pages/quantity-breaks.module.css";
import { offerUiText } from "./offer-ui-copy";
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
              {selection.quoteReady ? formatMinorMoney(selection.discounted, currencyCode, locale) : offerUiText(locale, "unknownPrice")}
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
                : offerUiText(locale, "unknownPrice")}
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
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelReveal = () => clearTimeout(revealTimer.current);
  useEffect(() => cancelReveal, []);
  const [width, setWidth] = useState(0);
  const [bounds, setBounds] = useState({ previous: false, next: false });
  const updateBounds = () => {
    const el = track.current;
    if (el) {
      const position = el.ownerDocument.defaultView?.getComputedStyle(el).direction === "rtl" ? -el.scrollLeft : el.scrollLeft;
      setBounds({ previous: position > 1, next: position + el.clientWidth < el.scrollWidth - 1 });
    }
  };
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
  const columns = effectiveOfferColumns(width, style.layout.cardLayout === "stacked" || style.layout.cardLayout === "list" ? { ...style.layout, columns: 1 } : style.layout);
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  const title = renderStorefrontCopy(
    `widget.${group.kind}.title`,
    translations,
  );
  const carousel = style.layout.mode === "carousel";
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(el);
    return () => observer.disconnect();
  }, [carousel, width, columns, group.cards.length]);
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * (track.current.ownerDocument.defaultView?.getComputedStyle(track.current).direction === "rtl" ? -1 : 1) * (track.current.clientWidth + style.layout.columnGapPx),
      behavior: "smooth",
    });
  const revealCard = (target: Element | null) => {
    const el = track.current;
    const card = target?.closest("article");
    if (!carousel || !el || !card || !el.contains(card)) return;
    const a = card.getBoundingClientRect(), b = el.getBoundingClientRect();
    const left = a.left < b.left ? a.left - b.left : a.right > b.right ? a.right - b.right : 0;
    if (left) el.scrollBy({ left, behavior: "instant" });
  };
  const scheduleReveal = (target: Element) => {
    cancelReveal();
    revealTimer.current = setTimeout(() => {
      if (target.ownerDocument.activeElement === target) revealCard(target);
    }, 350);
  };
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
    "--offer-title-color": style.colors?.title ?? style.colors?.text ?? "#171717",
    "--offer-section-color": style.colors?.sectionTitle ?? style.colors?.text ?? "#171717",
    "--offer-section-size": `${style.typography?.sectionTitle?.sizePx ?? 16}px`,
    "--offer-section-weight": style.typography?.sectionTitle?.weight ?? 600,
    "--offer-badge-text": style.colors?.badgeText ?? "#ffffff",
    "--offer-badge-background": style.colors?.badgeBackground ?? "#171717",
    "--offer-badge-size": `${style.typography?.badge?.sizePx ?? 11}px`,
    "--offer-badge-weight": style.typography?.badge?.weight ?? 600,
  } as CSSProperties;
  return (
    <section
      ref={root}
      className={styles.group}
      data-offer-kind={group.kind}
      data-columns={columns}
      data-layout={style.layout.mode}
      data-card-layout={style.layout.cardLayout ?? (style.layout.columns === 1 ? "stacked" : style.layout.columns === 2 ? "grid" : "horizontal")}
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
              disabled={!bounds.previous}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={`${text("next")} ${text(group.kind)}`}
              disabled={!bounds.next}
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
        onScroll={updateBounds}
        onPointerDown={cancelReveal}
        onTouchStart={cancelReveal}
        onWheel={cancelReveal}
        onFocusCapture={(event) => revealCard(event.target as Element)}
        onKeyUp={(event) => {
          if (event.target !== event.currentTarget && ["ArrowLeft", "ArrowRight"].includes(event.key)) scheduleReveal(event.target as Element);
        }}
        onKeyDown={(e) => {
          if (!carousel) return;
          if (e.target !== e.currentTarget) {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) scheduleReveal(e.target as Element);
            return;
          }
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            scroll((e.key === "ArrowRight" ? 1 : -1) * (e.currentTarget.ownerDocument.defaultView?.getComputedStyle(e.currentTarget).direction === "rtl" ? -1 : 1));
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
              {group.kind === "gifts" && <strong className={styles.productTitle}>
                {card.product?.title ??
                  text(
                    preview?.state === "loading" ? "loading" : "unavailable",
                  )}
              </strong>}
              {group.kind === "bundles" && (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    aria-label={card.product?.title ?? text("bundles")}
                    checked={card.checked}
                    disabled={!card.selectable || (!card.eligible && !unlock)}
                    onChange={(event) => {
                      if (!card.eligible && unlock) onUnlock(unlock.quantity);
                      selection.select(group.module, card.rule, event.currentTarget.checked);
                    }}
                  />
                  <strong className={styles.productTitle}>{card.product?.title ?? text("bundles")}</strong>
                  {!card.eligible && unlock ? ` · ${text("locked")} · ${unlock.quantity}` : ""}
                </label>
              )}
              {card.rule.label && card.rule.labelPosition === "below_title" && (
                <span className={styles.inlineBadge}>{card.rule.label}</span>
              )}
              {!card.eligible && group.kind === "gifts" ? (
                <button type="button" disabled={!unlock} onClick={() => unlock && onUnlock(unlock.quantity)}>
                  {text("locked")}{unlock ? ` · ${unlock.quantity}` : ""}
                </button>
              ) : !card.ready ? (
                <span role="status">{preview?.state === "loading" ? text("loading") : preview?.state === "unavailable" ? offerUiText(locale, "failed") : card.product?.unavailableReason?.startsWith("unsupported_") || card.product?.reason === "unsupported_market" ? offerUiText(locale, "unsupportedMarket") : card.selected.some(v => v?.availability === "unknown") ? offerUiText(locale, "unknownStock") : offerUiText(locale, "unknownPrice")}</span>
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
                  <label key={index} className={`${tierStyles.dropdownLine} ${styles.variantDropdown}`}>
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
                      {!variant && <option value="" disabled>{text("unavailable")}</option>}
                      {card.options.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.options?.map(o => o.value).join(" / ") || v.title || v.id}
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
