import { useState } from 'react';
import { offerEligible, type OfferTrigger } from '../../../shared/offer-core.mjs';
import type { Tier } from './model';
import { offerText } from './offer-messages';
import { offerUiText } from './offer-ui-copy';
import styles from './offers.module.css';

export function OfferTriggerEditor({ value, onChange, tiers, locale }: { value: OfferTrigger; onChange: (v: OfferTrigger) => void; tiers: Tier[]; locale: string }) {
  const [custom, setCustom] = useState(false);
  const valid = tiers.filter((t): t is Tier & { tierId: string } => !!t.tierId);
  const selectedIds = value.type === 'tiers' ? value.tierIds : valid.filter(t => offerEligible({ trigger: value }, valid, t.quantity)).map(t => t.tierId);
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
      if (selected === 'custom') {
        onChange({ type: 'tiers', tierIds: selectedIds });
        return;
      }
      const separator = selected.indexOf(':');
      const mode = selected.slice(0, separator), id = selected.slice(separator + 1);
      const index = valid.findIndex(t => t.tierId === id);
      if (index < 0) return;
      onChange({ type: 'tiers', tierIds: mode === 'from' ? valid.slice(index).map(t => t.tierId) : [id] });
    }}>
      {valid.flatMap((tier, index) => [index < valid.length - 1 && <option key={`from:${tier.tierId}`} value={`from:${tier.tierId}`}>{offerUiText(locale, 'bar')} #{index + 1} · {tier.label} — {offerUiText(locale, 'from')}</option>, <option key={`only:${tier.tierId}`} value={`only:${tier.tierId}`}>{offerUiText(locale, 'bar')} #{index + 1} · {tier.label} — {offerUiText(locale, 'only')}</option>])}
      <option value="custom">{offerUiText(locale, 'custom')}</option>
    </select></label>
    {preset === 'custom' && <fieldset className={styles.variantList}><legend>{text('tiers')}</legend>{valid.map((t, i) => <label key={t.tierId}><input type="checkbox" checked={selectedIds.includes(t.tierId)} onChange={e => { setCustom(true); onChange({ type: 'tiers', tierIds: e.target.checked ? [...selectedIds, t.tierId] : selectedIds.filter(id => id !== t.tierId) }); }} />{offerUiText(locale, 'bar')} #{i + 1} · {t.label}</label>)}</fieldset>}
  </div>;
}
