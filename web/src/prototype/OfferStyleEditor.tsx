import { useId, useState } from 'react';
import type { OfferDeviceStyle, OfferLayout } from '../../../shared/offer-core.mjs';
import { campaignText, type CampaignEditorMessageKey } from './campaign-editor-messages';
import { offerText } from './offer-messages';
import { offerUiText } from './offer-ui-copy';
import { OfferColorPicker } from './OfferColorPicker';
import styles from '../pages/quantity-breaks.module.css';
import local from './offer-style-editor.module.css';

const layouts = ['stacked', 'horizontal', 'grid', 'list'] as const;
const layoutColumns = { stacked: 1, horizontal: 3, grid: 2, list: 1 } as const;
const colorFields = [
  { key: 'sectionTitle', label: 'styleColorsectionTitle', fallback: '#171717' },
  { key: 'title', label: null, fallback: '#171717' },
  { key: 'text', label: null, fallback: '#171717' },
  { key: 'background', label: null, fallback: '#ffffff' },
  { key: 'badgeText', label: 'styleColorbadgeText', fallback: '#ffffff' },
  { key: 'badgeBackground', label: 'styleColorbadgeBackground', fallback: '#171717' },
] as const;
const fonts = [
  { key: 'sectionTitle', label: 'styleTypesectionTitle', sizePx: 16, weight: 600 },
  { key: 'title', label: null, sizePx: 14, weight: 600 },
  { key: 'badge', label: 'styleTypebadge', sizePx: 11, weight: 600 },
] as const;

export function OfferStyleEditor({ value, onChange, locale }: {
  value: OfferDeviceStyle; onChange: (value: OfferDeviceStyle) => void; locale: string;
}) {
  const id = useId();
  const [openColor, setOpenColor] = useState<string | null>(null);
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  const label = (key: CampaignEditorMessageKey) => campaignText(locale, key);
  const cardLayout = value.layout.cardLayout ?? (value.layout.columns === 3 ? 'horizontal' : value.layout.columns === 2 ? 'grid' : 'stacked');
  const changeLayout = (patch: Partial<OfferLayout>) => onChange({ ...value, layout: { ...value.layout, ...patch } });
  return <div className={`${styles.campaignStyleEditor} ${local.editor}`}>
    <fieldset className={styles.styleGroup}>
      <legend>{text('layout')}</legend>
      <div className={styles.styleLayoutChoices}>
        {layouts.map((layout) => <label className={styles.styleLayoutChoice} key={layout}>
          <input type="radio" name={`${id}-layout`} value={layout} aria-label={label(`styleLayout${layout}`)} checked={cardLayout === layout} onChange={() => changeLayout({ cardLayout: layout, columns: layoutColumns[layout] })} />
          <span className={styles.styleLayoutThumbnail} data-layout={layout} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.srOnly}>{label(`styleLayout${layout}`)}</span>
        </label>)}
      </div>
      <label className={local.carousel}>
        <span>{text('carousel')}</span>
        <button type="button" role="switch" aria-label={text('carousel')} aria-checked={value.layout.mode === 'carousel'} onClick={() => changeLayout({ mode: value.layout.mode === 'carousel' ? 'grid' : 'carousel' })}><span /></button>
      </label>
      <div className={`${styles.styleFieldGrid} ${local.dimensions}`}>
        {(['columnGapPx', 'rowGapPx'] as const).map((key, i) => <label className={local.field} key={key}>{text(i ? 'rowGap' : 'columnGap')}
          <input aria-label={text(i ? 'rowGap' : 'columnGap')} type="number" min="0" max="128" value={value.layout[key]} onChange={(event) => changeLayout({ [key]: Number(event.target.value) })} />
        </label>)}
        {(['sizePx', 'radiusPx'] as const).map((key, i) => <label className={local.field} key={key}>{text(i ? 'radius' : 'imageSize')}
          <input aria-label={text(i ? 'radius' : 'imageSize')} type="number" min={i ? 0 : 10} max={i ? 64 : 400} value={value.image[key]} onChange={(event) => onChange({ ...value, image: { ...value.image, [key]: Number(event.target.value) } })} />
        </label>)}
      </div>
    </fieldset>
    <fieldset className={styles.styleGroup}>
      <legend>{label('styleColors')}</legend>
      <div className={styles.styleColorGrid}>
        {colorFields.map(({ key, label: message, fallback }) => <OfferColorPicker key={key}
          name={message ? label(message) : key === 'title' ? offerUiText(locale, 'productTitle') : text(key === 'text' ? 'textColor' : 'background')}
          value={value.colors?.[key] ?? ((key === "sectionTitle" || key === "title") ? value.colors?.text ?? fallback : fallback)} fallback={fallback} locale={locale} open={openColor === key}
          onOpen={(open) => setOpenColor(open ? key : null)}
          onChange={(color) => onChange({ ...value, colors: { ...value.colors, [key]: color } })} />)}
      </div>
    </fieldset>
    <fieldset className={styles.styleGroup}>
      <legend>{label('styleTypography')}</legend>
      <div className={styles.styleTypeGrid}>{fonts.map(({ key, label: message, sizePx, weight }) => {
        const font = value.typography?.[key] ?? { sizePx, weight };
        const name = message ? label(message) : offerUiText(locale, 'productTitle');
        const setFont = (patch: Partial<typeof font>) => onChange({ ...value, typography: { ...value.typography, [key]: { ...font, ...patch } } });
        return <div className={styles.styleTypeRow} data-offer-font={key} key={key}>
          <span>{name}</span>
          <label>{label('styleSize')}<input aria-label={`${name} size`} type="number" min="1" step="1" value={font.sizePx} onChange={(event) => setFont({ sizePx: Number(event.target.value) })} /></label>
          <label>{label('styleWeight')}<select aria-label={`${name} weight`} value={font.weight} onChange={(event) => setFont({ weight: Number(event.target.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>;
      })}</div>
    </fieldset>
  </div>;
}
