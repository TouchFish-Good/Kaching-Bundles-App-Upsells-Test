import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultCampaignWidgetConfig, type CampaignWidgetStyleConfig, type WidgetTypography } from './widget-config';
import { formatColor, hsvToRgb, isHexColor, parseColor, pickerHsvForValue } from './color-picker';
import { campaignText, type CampaignEditorMessageKey } from './campaign-editor-messages';
import styles from '../pages/quantity-breaks.module.css';

type Props = { device?: 'desktop' | 'mobile'; value: CampaignWidgetStyleConfig; onChange: (next: CampaignWidgetStyleConfig) => void; autoOpenColor?: keyof CampaignWidgetStyleConfig['colors'] };

const layouts: Array<{ value: CampaignWidgetStyleConfig['layout']; label: string }> = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];
const colors: Array<{ key: keyof CampaignWidgetStyleConfig['colors']; label: string }> = [
  { key: 'card', label: 'Card background' }, { key: 'selected', label: 'Selected background' },
  { key: 'cardBorder', label: 'Card border' }, { key: 'border', label: 'Selected card border' }, { key: 'sectionTitle', label: 'Section title' },
  { key: 'title', label: 'Tier title' }, { key: 'subtitle', label: 'Subtitle' },
  { key: 'price', label: 'Sale price' }, { key: 'comparePrice', label: 'Original price' },
  { key: 'badgeBackground', label: 'Badge background' }, { key: 'badgeText', label: 'Badge text' },
  { key: 'tierSavingsBadgeBackground', label: 'Tier savings badge background' }, { key: 'tierSavingsBadgeText', label: 'Tier savings badge text' },
  { key: 'variantTitle', label: 'Variant title' }, { key: 'variantValue', label: 'Variant value' },
  { key: 'variantPrice', label: 'Variant sale price' }, { key: 'variantOriginalPrice', label: 'Variant original price' }, { key: 'slotNumber', label: 'Item number' },
  { key: 'variantBorder', label: 'Variant border' }, { key: 'variantBackground', label: 'Variant background' }, { key: 'variantSelectedBorder', label: 'Selected variant border' }, { key: 'variantSelectedBackground', label: 'Selected variant background' }, { key: 'variantSelectedText', label: 'Selected variant text' }, { key: 'status', label: 'Status message' },
  { key: 'cartLine', label: 'Cart item' }, { key: 'summaryLabel', label: 'Summary label' },
  { key: 'summaryAmount', label: 'Summary amount' }, { key: 'savingsLabel', label: 'Savings label' }, { key: 'savingsPrice', label: 'Savings price' },
  { key: 'addButtonBackground', label: 'Add button background' }, { key: 'addButtonBorder', label: 'Add button border' }, { key: 'addButtonText', label: 'Add button text' },
];
const typography: Array<{ key: Exclude<keyof CampaignWidgetStyleConfig['typography'], 'bodyPx'>; label: string }> = [
  { key: 'sectionTitle', label: 'Section title' },
  { key: 'title', label: 'Tier title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'price', label: 'Sale price' },
  { key: 'comparePrice', label: 'Original price' },
  { key: 'badge', label: 'Badge' },
  { key: 'tierSavingsBadge', label: 'Tier savings badge' },
  { key: 'slotNumber', label: 'Item number' },
  { key: 'variantTitle', label: 'Variant title' },
  { key: 'variantValue', label: 'Variant value' },
  { key: 'variantPrice', label: 'Variant sale price' },
  { key: 'variantOriginalPrice', label: 'Variant original price' },
  { key: 'cartLine', label: 'Cart item' },
  { key: 'summaryLabel', label: 'Summary label' },
  { key: 'summaryAmount', label: 'Summary amount' },
  { key: 'savingsLabel', label: 'Savings label' },
  { key: 'savingsPrice', label: 'Savings price' },
  { key: 'checkoutNote', label: 'Checkout note' },
  { key: 'status', label: 'Status message' },
  { key: 'addButton', label: 'Add to cart button' },
];
const defaultColors = defaultCampaignWidgetConfig().colors;
const colorGroups: Array<{ title: string; keys: Array<keyof CampaignWidgetStyleConfig['colors']> }> = [
  { title: 'styleColorGeneral', keys: ['sectionTitle', 'card', 'selected', 'cardBorder', 'border'] },
  { title: 'styleColorOffer', keys: ['title', 'subtitle', 'price', 'comparePrice'] },
  { title: 'styleColorBadge', keys: ['badgeBackground', 'badgeText'] },
  { title: 'styleColorTierSavingsBadge', keys: ['tierSavingsBadgeBackground', 'tierSavingsBadgeText'] },
  { title: 'styleColorVariants', keys: ['variantBackground', 'variantSelectedBackground', 'slotNumber', 'variantTitle', 'variantValue', 'variantSelectedText', 'variantBorder', 'variantSelectedBorder', 'variantPrice', 'variantOriginalPrice'] },
  { title: 'styleColorCheckout', keys: ['cartLine', 'summaryLabel', 'summaryAmount', 'savingsLabel', 'savingsPrice', 'status', 'addButtonBackground', 'addButtonBorder', 'addButtonText'] },
];

export function CampaignStyleEditor({ device = 'desktop', value, onChange, autoOpenColor }: Props) {
  const { i18n } = useTranslation();
  const [openColor, setOpenColor] = useState<keyof CampaignWidgetStyleConfig['colors'] | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const hsvByColor = useRef<Partial<Record<keyof CampaignWidgetStyleConfig['colors'], { value: string; hsv: { hue: number; saturation: number; brightness: number } }>>>({});
  useEffect(() => {
    if (!autoOpenColor) return;
    setOpenColor(autoOpenColor);
    const frame = requestAnimationFrame(() => document.getElementById(`widget-color-${device}-${autoOpenColor}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoOpenColor, device]);
  useEffect(() => {
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!editorRef.current?.contains(event.target as Node)) setOpenColor(null);
      else if (!(event.target as Element).closest(`.${styles.styleColorControl}`)) setOpenColor(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const label = (key: string, fallback: string) => {
    try { return campaignText(i18n.language ?? 'en', key as CampaignEditorMessageKey) || fallback; }
    catch { return fallback; }
  };
  const visibilityLabel = (kind: 'cart' | 'summary') => {
    const language = i18n.language?.toLowerCase() ?? '';
    if (language.startsWith('zh-hant')) return kind === 'cart' ? '顯示購物車規格明細' : '顯示價格彙總';
    if (language.startsWith('zh')) return kind === 'cart' ? '显示购物车规格明细' : '显示价格汇总';
    return kind === 'cart' ? 'Show cart variant details' : 'Show price summary';
  };
  const tierSavingsBadgeLabel = () => {
    return label('styleShowTierSavingsBadge', 'Show tier savings badge');
  };
  const tierSavingsBadgeRadiusLabel = () => {
    return label('styleTierSavingsBadgeRadius', 'Tier savings badge radius');
  };
  const setCard = (patch: Partial<CampaignWidgetStyleConfig['card']>) => onChange({ ...value, card: { ...value.card, ...patch } });
  const setVariant = (patch: Partial<CampaignWidgetStyleConfig['variants']>) => onChange({ ...value, variants: { ...value.variants, ...patch } });
  const setTypography = (key: Exclude<keyof CampaignWidgetStyleConfig['typography'], 'bodyPx'>, patch: Partial<WidgetTypography>) =>
    onChange({ ...value, typography: { ...value.typography, [key]: { ...value.typography[key], ...patch } } });

  const variantGroup = <fieldset className={styles.styleGroup}>
    <legend>{label('styleVariants', 'Variants')}</legend>
    <div className={styles.styleToggleGrid}>
      <label><input type="checkbox" checked={value.variants.showSelectors} onChange={(event) => setVariant({ showSelectors: event.target.checked })} />{label('styleShowSelectors', 'Show variant selectors')}</label>
      <label><input type="checkbox" checked={value.showCartVariantDetails} onChange={(event) => onChange({ ...value, showCartVariantDetails: event.target.checked })} />{visibilityLabel('cart')}</label>
      <label><input type="checkbox" checked={value.showPriceSummary} onChange={(event) => onChange({ ...value, showPriceSummary: event.target.checked })} />{visibilityLabel('summary')}</label>
      <label className={styles.styleCheck}><input type="checkbox" checked={value.variants.showImageColorValue} onChange={(event) => setVariant({ showImageColorValue: event.target.checked })} />{label('styleShowColorValue', 'Show color value below image')}</label>
      <label><input type="checkbox" checked={value.showTierSavingsBadge} onChange={(event) => onChange({ ...value, showTierSavingsBadge: event.target.checked })} />{tierSavingsBadgeLabel()}</label>
    </div>
    <div className={styles.styleFieldGrid}>
      <label className={styles.field}>{label('styleVariantDisplay', 'Variant display')}<select value={value.variants.selectorStyle} onChange={(event) => setVariant({ selectorStyle: event.target.value as CampaignWidgetStyleConfig['variants']['selectorStyle'] })}><option value="dropdown">{label('styleDropdown', 'Dropdown')}</option><option value="image">{label('styleImages', 'Original variant images')}</option><option value="text">{label('styleText', 'Text values')}</option></select></label>
      <label className={styles.field}>{label('styleDefaultSelection', 'Default selection')}<select value={value.variants.defaultSelection} onChange={(event) => setVariant({ defaultSelection: event.target.value as CampaignWidgetStyleConfig['variants']['defaultSelection'] })}><option value="first_available">{label('styleFirstAvailable', 'First available')}</option><option value="none">{label('styleNoPreselection', 'No preselection')}</option></select></label>
      <label className={styles.field}>{label('styleImageSize', 'Image size')} <output>{value.variants.imageSizePx}px</output><input type="range" min="10" max="96" value={value.variants.imageSizePx} onChange={(event) => setVariant({ imageSizePx: Number(event.target.value) })} /></label>
      <label className={styles.field}>{label('styleImageRadius', 'Image radius')} <output>{value.variants.imageRadiusPx}px</output><input type="range" min="0" max="24" value={value.variants.imageRadiusPx} onChange={(event) => setVariant({ imageRadiusPx: Number(event.target.value) })} /></label>
    </div>
  </fieldset>;

  return <div className={styles.campaignStyleEditor} ref={editorRef}>
    <fieldset className={styles.styleGroup}>
      <legend>{label('styleLayout', 'Layout')}</legend>
      <div className={styles.styleLayoutChoices}>
        {layouts.map((layout) => <label key={layout.value} className={styles.styleLayoutChoice}>
          <input type="radio" name="widget-layout" value={layout.value} aria-label={label(`styleLayout${layout.value}`, layout.label)} checked={value.layout === layout.value} onChange={() => onChange({ ...value, layout: layout.value })} />
          <span className={styles.styleLayoutThumbnail} data-layout={layout.value} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.srOnly}>{label(`styleLayout${layout.value}`, layout.label)}</span>
        </label>)}
      </div>
    </fieldset>

    {variantGroup}

    <fieldset className={styles.styleGroup}>
      <legend>{label('styleCards', 'Cards')}</legend>
      <div className={styles.styleFieldGrid}>
        <label className={styles.field}>{label('styleCardRadius', 'Card radius')} <output>{value.card.radiusPx}px</output><input type="range" min="0" max="24" value={value.card.radiusPx} onChange={(event) => setCard({ radiusPx: Number(event.target.value) })} /></label>
        <label className={styles.field}>{label('styleCardSpacing', 'Card spacing')} <output>{value.card.gapPx}px</output><input type="range" min="0" max="32" value={value.card.gapPx} onChange={(event) => setCard({ gapPx: Number(event.target.value) })} /></label>
        <label className={styles.field}>{tierSavingsBadgeRadiusLabel()} <output>{value.card.tierSavingsBadgeRadiusPx}px</output><input type="range" min="0" max="50" value={value.card.tierSavingsBadgeRadiusPx} onChange={(event) => setCard({ tierSavingsBadgeRadiusPx: Number(event.target.value) })} /></label>
        <div className={styles.styleBadgePosition}><span>{label('styleBadgePosition', 'Badge position')}</span><div>
        <label><input type="radio" name="badge-position" value="corner" checked={value.badgePosition === 'corner'} onChange={() => onChange({ ...value, badgePosition: 'corner' })} />{label('styleBadgeCorner', 'Top right')}</label>
        <label><input type="radio" name="badge-position" value="below_subtitle" checked={value.badgePosition === 'below_subtitle'} onChange={() => onChange({ ...value, badgePosition: 'below_subtitle' })} />{label('styleBadgeBelow', 'Below subtitle')}</label>
      </div></div>
      </div>
    </fieldset>

    <fieldset className={styles.styleGroup}>
      <legend>{label('styleColors', 'Colors')}</legend>
      {colorGroups.map((group) => <section className={styles.styleColorGroup} key={group.title}>
        <h3>{label(group.title, group.title === 'styleColorGeneral' ? 'General' : group.title === 'styleColorOffer' ? 'Offer text' : group.title === 'styleColorBadge' ? 'Badge' : group.title === 'styleColorTierSavingsBadge' ? 'Tier savings badge' : group.title === 'styleColorVariants' ? 'Variants' : 'Cart and checkout')}</h3>
        <div className={styles.styleColorGrid}>{group.keys.map((key) => {
          const color = colors.find((item) => item.key === key)!;
          const name = key === 'variantOriginalPrice'
            ? (i18n.language?.toLowerCase().startsWith('zh') ? '规格原价' : color.label)
            : label(`styleColor${key}`, color.label);
          const valid = isHexColor(value.colors[key]);
          const current = valid ? value.colors[key] : defaultColors[key];
          const rgba = parseColor(current);
          const hsv = pickerHsvForValue(current, hsvByColor.current[key]);
          const setColor = (hue: number, saturation: number, brightness: number, alpha = rgba.alpha) => {
            const [red, green, blue] = hsvToRgb(hue, saturation, brightness);
            const next = formatColor(red, green, blue, alpha);
            hsvByColor.current[key] = { value: next, hsv: { hue, saturation, brightness } };
            onChange({ ...value, colors: { ...value.colors, [key]: next } });
          };
          const updateSpectrum = (event: PointerEvent<HTMLDivElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const saturation = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
            const brightness = Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100));
            setColor(hsvByColor.current[key]?.hsv.hue ?? hsv.hue, saturation, brightness);
          };
          return <div className={styles.styleColorField} key={key}>
            <span>{name}</span>
            <details className={styles.styleColorControl} open={openColor === key} onKeyDown={(event) => { if (event.key === 'Escape') { setOpenColor(null); (event.currentTarget.querySelector('summary') as HTMLElement)?.focus(); } }}>
              <summary aria-label={`${name} color`} onClick={(event) => { event.preventDefault(); setOpenColor(openColor === key ? null : key); }}><span className={styles.styleColorSwatch} style={{ backgroundImage: `linear-gradient(${current},${current}),repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%)`, backgroundSize: '100% 100%,8px 8px' }} /><span>{value.colors[key]}</span></summary>
              <div className={styles.styleColorPopover}>
                <div className={styles.styleColorSpectrum} role="slider" tabIndex={0} aria-label={`${name} picker`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.saturation)} aria-valuetext={`${Math.round(hsv.saturation)}% saturation, ${Math.round(hsv.brightness)}% brightness`} style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSpectrum(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSpectrum(event); }} onKeyDown={(event) => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); setColor(hsv.hue, Math.max(0, Math.min(100, hsv.saturation + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0))), Math.max(0, Math.min(100, hsv.brightness + (event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0)))); } }}><span className={styles.styleColorCursor} style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.brightness}%` }} /></div>
                <input aria-label={`${name} hue`} type="range" min="0" max="359" value={Math.round(hsv.hue)} className={styles.styleHueSlider} onChange={(event) => setColor(Number(event.target.value), hsv.saturation, hsv.brightness)} />
                <label className={styles.styleOpacityLabel}>{label('styleOpacity', 'Opacity')} <output>{Math.round(rgba.alpha / 255 * 100)}%</output><input aria-label={`${name} opacity`} type="range" min="0" max="100" value={Math.round(rgba.alpha / 255 * 100)} className={styles.styleOpacitySlider} style={{ background: `linear-gradient(to right, transparent, #${current.slice(1,7)})` }} onChange={(event) => setColor(hsv.hue, hsv.saturation, hsv.brightness, Math.round(Number(event.target.value) / 100 * 255))} /></label>
                <input id={`widget-color-${device}-${key}`} aria-label={`${name} hex`} aria-invalid={!valid} aria-describedby={!valid ? `widget-color-${device}-${key}-error` : undefined} value={value.colors[key]} maxLength={9} onChange={(event) => onChange({ ...value, colors: { ...value.colors, [key]: event.target.value.toUpperCase() } })} />
                {!valid && <small id={`widget-color-${device}-${key}-error`} className={styles.styleColorError} role="alert">{label('styleHexAlphaError', 'Enter a 6- or 8-digit HEX color.')}</small>}
              </div>
            </details>
          </div>;
        })}</div>
      </section>)}
    </fieldset>

    <fieldset className={styles.styleGroup}>
      <legend>{label('styleTypography', 'Typography')}</legend>
      <div className={styles.styleTypeGrid}>{typography.map(({ key, label: fallbackLabel }) => <div className={styles.styleTypeRow} key={key}>
        <span>{key === 'variantOriginalPrice' ? (i18n.language?.toLowerCase().startsWith('zh') ? '规格原价' : fallbackLabel) : label(`styleType${key}`, fallbackLabel)}</span>
        <label>{campaignText(i18n.language ?? 'en', 'styleSize')} <input aria-label={`${fallbackLabel} size`} type="number" min="1" step="1" value={value.typography[key].sizePx} onChange={(event) => setTypography(key, { sizePx: Number(event.target.value) })} /></label>
        <label>{campaignText(i18n.language ?? 'en', 'styleWeight')} <select aria-label={`${fallbackLabel} weight`} value={value.typography[key].weight} onChange={(event) => setTypography(key, { weight: Number(event.target.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select></label>
      </div>)}</div>
    </fieldset>

  </div>;
}
