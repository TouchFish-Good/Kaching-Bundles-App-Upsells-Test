import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { themeSetupGuideText } from './theme-setup-guide-messages';
import styles from '../pages/quantity-breaks.module.css';

const DISMISSED_KEY = 'quantity-breaks:theme-setup-guide-dismissed';
const GUIDE_STEP_ONE_IMAGE = 'https://img-va.myshopline.com/image/store/1726037928557/Multi-item-Discounts-Theme-Editor-Guide.png?w=1672&h=941';
const GUIDE_STEP_TWO_IMAGE = 'https://img-va.myshopline.com/image/store/1726037928557/Multi-item-Discounts-Theme-Editor-Guide-(1).png?w=1672&h=941';

function wasDismissed(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(DISMISSED_KEY) === 'true'; }
  catch { return false; }
}

export function ThemeSetupGuide({ language, onOpenGuide }: { language?: string; onOpenGuide?: () => void }) {
  const copy = themeSetupGuideText(language);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const dismiss = () => {
    try { window.localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* Storage can be unavailable in private browsing. */ }
    setDismissed(true);
  };

  if (dismissed) return null;

  return <section className={styles.themeSetupNotice} aria-label={copy.completeSetup}>
    <link rel="preload" as="image" href={GUIDE_STEP_ONE_IMAGE} />
    <link rel="preload" as="image" href={GUIDE_STEP_TWO_IMAGE} />
    <BookOpen size={18} aria-hidden="true" />
    <div className={styles.themeSetupNoticeCopy}><strong>{copy.completeSetup}</strong><p>{copy.description}</p></div>
    <button type="button" className={styles.themeSetupGuideButton} onClick={onOpenGuide}>{copy.setupGuide}</button>
    <button type="button" className={styles.themeSetupDismissButton} onClick={dismiss} data-theme-guide-dismiss aria-label={copy.dismiss} title={copy.dismiss}><X size={18} aria-hidden="true" /></button>
  </section>;
}

export function ThemeSetupGuideDialog({ language, onClose }: { language?: string; onClose: () => void }) {
  const copy = themeSetupGuideText(language);
  return <div className={styles.themeSetupGuideScrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.themeSetupGuideDialog} role="dialog" aria-modal="true" aria-label={copy.setupGuide}>
      <header><div><span>{copy.completeSetup}</span><h2>{copy.setupGuide}</h2></div><button type="button" onClick={onClose} aria-label={copy.close} title={copy.close}><X size={18} aria-hidden="true" /></button></header>
      <div className={styles.themeSetupGuideBody}>
        <article><span>1</span><div><h3>{copy.stepOneTitle}</h3><p>{copy.stepOneBody}</p><img src={GUIDE_STEP_ONE_IMAGE} alt={copy.stepOneTitle} /></div></article>
        <article><span>2</span><div><h3>{copy.stepTwoTitle}</h3><p>{copy.stepTwoBody}</p><img src={GUIDE_STEP_TWO_IMAGE} alt={copy.stepTwoTitle} /></div></article>
      </div>
    </section>
  </div>;
}
