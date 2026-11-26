import { useEffect, useId, useRef, type PointerEvent } from 'react';
import { formatColor, hsvToRgb, isHexColor, parseColor, pickerHsvForValue } from './color-picker';
import { campaignText } from './campaign-editor-messages';
import styles from '../pages/quantity-breaks.module.css';

/** Uses the same spectrum, HEX and alpha controls as the main campaign style editor. */
export function OfferColorPicker({ name, value, fallback, locale, open, onOpen, onChange }: {
  name: string; value: string; fallback: string; locale: string; open: boolean;
  onOpen: (open: boolean) => void; onChange: (value: string) => void;
}) {
  const id = useId();
  const control = useRef<HTMLDetailsElement>(null);
  const previous = useRef<{ value: string; hsv: { hue: number; saturation: number; brightness: number } }>();
  const valid = isHexColor(value), current = valid ? value : fallback;
  const rgba = parseColor(current), hsv = pickerHsvForValue(current, previous.current);
  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.PointerEvent) => { if (!control.current?.contains(event.target as Node)) onOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open, onOpen]);
  const setColor = (hue: number, saturation: number, brightness: number, alpha = rgba.alpha) => {
    const [red, green, blue] = hsvToRgb(hue, saturation, brightness);
    const next = formatColor(red, green, blue, alpha);
    previous.current = { value: next, hsv: { hue, saturation, brightness } };
    onChange(next);
  };
  const updateSpectrum = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setColor(hsv.hue,
      Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100)));
  };
  return <div className={styles.styleColorField}>
    <span>{name}</span>
    <details ref={control} className={styles.styleColorControl} open={open} onKeyDown={(event) => {
      if (event.key === 'Escape') { onOpen(false); control.current?.querySelector('summary')?.focus(); }
    }}>
      <summary aria-label={`${name} color`} onClick={(event) => { event.preventDefault(); onOpen(!open); }}>
        <span className={styles.styleColorSwatch} style={{ backgroundImage: `linear-gradient(${current},${current}),repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%)`, backgroundSize: '100% 100%,8px 8px' }} />
        <span>{value}</span>
      </summary>
      <div className={styles.styleColorPopover}>
        <div className={styles.styleColorSpectrum} role="slider" tabIndex={0} aria-label={`${name} picker`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.saturation)} aria-valuetext={`${Math.round(hsv.saturation)}% saturation, ${Math.round(hsv.brightness)}% brightness`} style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSpectrum(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSpectrum(event); }} onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            setColor(hsv.hue, Math.max(0, Math.min(100, hsv.saturation + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0))), Math.max(0, Math.min(100, hsv.brightness + (event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0))));
          }
        }}><span className={styles.styleColorCursor} style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.brightness}%` }} /></div>
        <input aria-label={`${name} hue`} type="range" min="0" max="359" value={Math.round(hsv.hue)} className={styles.styleHueSlider} onChange={(event) => setColor(Number(event.target.value), hsv.saturation, hsv.brightness)} />
        <label className={styles.styleOpacityLabel}>{campaignText(locale, 'styleOpacity')} <output>{Math.round(rgba.alpha / 255 * 100)}%</output>
          <input aria-label={`${name} opacity`} type="range" min="0" max="100" value={Math.round(rgba.alpha / 255 * 100)} className={styles.styleOpacitySlider} style={{ background: `linear-gradient(to right, transparent, #${current.slice(1, 7)})` }} onChange={(event) => setColor(hsv.hue, hsv.saturation, hsv.brightness, Math.round(Number(event.target.value) / 100 * 255))} />
        </label>
        <input aria-label={`${name} hex`} aria-invalid={!valid} aria-describedby={!valid ? id : undefined} value={value} maxLength={9} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        {!valid && <small id={id} className={styles.styleColorError} role="alert">{campaignText(locale, 'styleHexAlphaError')}</small>}
      </div>
    </details>
  </div>;
}
