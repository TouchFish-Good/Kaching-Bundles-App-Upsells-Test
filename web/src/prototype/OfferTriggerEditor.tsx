import { useState } from 'react';
import type { OfferTrigger } from '../../../shared/offer-core.mjs';
import type { Tier } from './model';
import { offerText } from './offer-messages';
import { offerUiText } from './offer-ui-copy';
import styles from './offers.module.css';

export function OfferTriggerEditor({ value, onChange, tiers, locale }: { value: OfferTrigger; onChange: (v: OfferTrigger) => void; tiers: Tier[]; locale: string }) {
  const [custom, setCustom] = useState(false);
  const valid = tiers.filter((t): t is Tier & { tierId: string } => !!t.tierId);
  const text = (key: Parameters<typeof offerText>[1]) => offerText(locale, key);
  let preset = 'custom';
  if (!custom && value.type === 'tiers') {
    for (let i = 0; i < valid.length; i++) {
      const ids = valid.slice(i).map(t => t.tierId);
      if (ids.length > 1 && ids.length === value.tierIds.length && ids.every(id => value.tierIds.includes(id))) { preset = `from:${valid[i].tierId}`; break; }
      if (value.tierIds.length === 1 && value.tierIds[0] === valid[i].tierId) preset = `only:${valid[i].tierId}`;
    }
  }
  return <div className={styles.triggerEditor}>
    <label>{text('condition')}<select data-offer-trigger value={preset} onChange={e => {
      const selected = e.target.value; setCustom(selected === 'custom');
      if (selected === 'custom') return;
      const [mode, id] = selected.split(':'); const index = valid.findIndex(t => t.tierId === id);
      onChange({ type: 'tiers', tierIds: mode === 'from' ? valid.slice(index).map(t => t.tierId) : [id] });
    }}>
      {valid.flatMap((tier, index) => [index < valid.length - 1 && <option key={`from:${tier.tierId}`} value={`from:${tier.tierId}`}>{offerUiText(locale, 'bar')} #{index + 1} · {tier.label} — {offerUiText(locale, 'from')}</option>, <option key={`only:${tier.tierId}`} value={`only:${tier.tierId}`}>{offerUiText(locale, 'bar')} #{index + 1} · {tier.label} — {offerUiText(locale, 'only')}</option>])}
      <option value="custom">{offerUiText(locale, 'custom')}</option>
    </select></label>
    {preset === 'custom' && <>
      <label>{text('condition')}<select value={value.type} onChange={e => onChange(e.target.value === 'tiers' ? { type: 'tiers', tierIds: valid[0] ? [valid[0].tierId] : [] } : { type: 'quantity', operator: 'gte', quantity: 2 })}><option value="quantity">{text('quantityCondition')}</option><option value="tiers">{text('tiers')}</option></select></label>
      {value.type === 'quantity' ? <div className={styles.fields}><label>{text('condition')}<select value={value.operator} onChange={e => onChange({ ...value, operator: e.target.value as 'gte' | 'gt' | 'eq' })}>{(['gte', 'gt', 'eq'] as const).map(v => <option key={v} value={v}>{text(v)}</option>)}</select></label><label>{text('quantityCondition')}<input type="number" min="1" value={value.quantity} onChange={e => onChange({ ...value, quantity: Number(e.target.value) })} /></label></div> : <fieldset className={styles.variantList}><legend>{text('tiers')}</legend>{valid.map((t, i) => <label key={t.tierId}><input type="checkbox" checked={value.tierIds.includes(t.tierId)} onChange={e => onChange({ type: 'tiers', tierIds: e.target.checked ? [...value.tierIds, t.tierId] : value.tierIds.filter(id => id !== t.tierId) })} />{offerUiText(locale, 'bar')} #{i + 1} · {t.label}</label>)}</fieldset>}
    </>}
  </div>;
}
