import { useState } from 'react';
import type { Product } from './CampaignProductPicker';
import { productPickerLabels } from './CampaignProductPicker';
import { SelectionDialog } from './SelectionDialog';
import { offerText } from './offer-messages';
import { offerUiText } from './offer-ui-copy';
import shared from '../pages/quantity-breaks.module.css';
import styles from './offers.module.css';

export function OfferVariantPicker({ product, selected, onChange, locale }: { product?: Product; selected: string[]; onChange: (ids: string[]) => void; locale: string }) {
  const [open, setOpen] = useState(false);
  const variants = product?.variants ?? [];
  const variantLabel = (variant: NonNullable<Product['variants']>[number]) => {
    const name = variant.title || variant.options?.map(option => option.value).join(' / ') || variant.id;
    const soldOut = variant.inventoryTracker === true && variant.inventoryPolicy === 'deny' && Number.isFinite(variant.inventory) && variant.inventory <= 0;
    return `${name}${soldOut ? ' (Sold out)' : ''}`;
  };
  const labels = productPickerLabels(locale);
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...selected.filter(v => v !== id), id] : selected.filter(v => v !== id));
  const title = `${offerUiText(locale, 'viewVariants')} (${selected.length})`;
  const list = <ul className={`${shared.selectorResults} ${styles.variantDialogList}`} data-variant-list>{variants.map(v => <li key={v.id}><label><input type="checkbox" checked={selected.includes(v.id)} onChange={e => toggle(v.id, e.target.checked)} />{v.imageUrl ? <img src={v.imageUrl} alt="" /> : <span className={shared.selectorImageFallback} aria-hidden="true" />}<span>{variantLabel(v)}</span></label></li>)}</ul>;
  return <fieldset className={styles.variantList}>
    <legend>{offerText(locale, 'variants')}</legend>
    {variants.length > 5 ? <button type="button" className={shared.scopePickerView} onClick={() => setOpen(true)}>{title}</button> : <div data-variant-list>{variants.map(v => <label key={v.id}><input type="checkbox" checked={selected.includes(v.id)} onChange={e => toggle(v.id, e.target.checked)} />{variantLabel(v)}</label>)}</div>}
    {!selected.length && <span role="alert">{offerText(locale, 'noVariants')}</span>}
    {open && <SelectionDialog ariaLabel={title} title={`${product?.title ?? ''} · ${title}`} closeLabel={labels.close} onClose={() => setOpen(false)} footer={<button type="button" data-dialog-autofocus onClick={() => setOpen(false)}>{labels.close}</button>}>{list}</SelectionDialog>}
  </fieldset>;
}
