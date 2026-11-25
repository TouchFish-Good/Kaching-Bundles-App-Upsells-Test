import type { OfferDeviceStyle } from "../../../shared/offer-core.mjs";
import { offerText } from "./offer-messages";
import styles from "./offers.module.css";
export function OfferStyleEditor({
  value,
  onChange,
  locale,
}: {
  value: OfferDeviceStyle;
  onChange: (v: OfferDeviceStyle) => void;
  locale: string;
}) {
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  return (
    <div className={styles.fields}>
      <label>
        {text("layout")}
        <select
          value={value.layout.mode}
          onChange={(e) =>
            onChange({
              ...value,
              layout: {
                ...value.layout,
                mode: e.target.value as "grid" | "carousel",
              },
            })
          }
        >
          {(["grid", "carousel"] as const).map((v) => (
            <option key={v} value={v}>
              {text(v)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {text("columns")}
        <select
          value={value.layout.columns}
          onChange={(e) =>
            onChange({
              ...value,
              layout: {
                ...value.layout,
                columns: Number(e.target.value) as 1 | 2 | 3,
              },
            })
          }
        >
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {(["columnGapPx", "rowGapPx"] as const).map((key, i) => (
        <label key={key}>
          {text(i ? "rowGap" : "columnGap")}
          <input
            type="number"
            min="0"
            max="64"
            value={value.layout[key]}
            onChange={(e) =>
              onChange({
                ...value,
                layout: { ...value.layout, [key]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}
      {(["sizePx", "radiusPx"] as const).map((key, i) => (
        <label key={key}>
          {text(i ? "radius" : "imageSize")}
          <input
            type="number"
            min={i ? 0 : 10}
            max={i ? 64 : 400}
            value={value.image[key]}
            onChange={(e) =>
              onChange({
                ...value,
                image: { ...value.image, [key]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}
      {(["background", "text"] as const).map((key, i) => (
        <label key={key}>
          {text(i ? "textColor" : "background")}
          <input
            type="color"
            value={value.colors?.[key] ?? (i ? "#171717" : "#ffffff")}
            onChange={(e) =>
              onChange({
                ...value,
                colors: { ...value.colors, [key]: e.target.value },
              })
            }
          />
        </label>
      ))}
      <label>
        {text("titleSize")}
        <input
          type="number"
          min="1"
          max="72"
          value={value.typography?.title?.sizePx ?? 14}
          onChange={(e) =>
            onChange({
              ...value,
              typography: {
                ...value.typography,
                title: {
                  sizePx: Number(e.target.value),
                  weight: value.typography?.title?.weight ?? 600,
                },
              },
            })
          }
        />
      </label>
      <label>
        {text("titleWeight")}
        <select
          value={value.typography?.title?.weight ?? 600}
          onChange={(e) =>
            onChange({
              ...value,
              typography: {
                ...value.typography,
                title: {
                  sizePx: value.typography?.title?.sizePx ?? 14,
                  weight: Number(e.target.value),
                },
              },
            })
          }
        >
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
