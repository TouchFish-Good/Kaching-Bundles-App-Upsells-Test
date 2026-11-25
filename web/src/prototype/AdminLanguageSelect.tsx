import { APP_LOCALES, APP_LOCALE_NAMES } from './admin-locale';
import styles from '../pages/quantity-breaks.module.css';

export function AdminLanguageSelect({ value, onChange, label }: { value: string; onChange: (locale: string) => void; label: string }) {
  return <label className={styles.adminLanguage}>{label}<select value={APP_LOCALES.find((code) => code.toLowerCase() === value.toLowerCase()) ?? 'en'} onChange={(event) => onChange(event.target.value)}>{APP_LOCALES.map((code) => <option key={code} value={code}>{APP_LOCALE_NAMES[code]}</option>)}</select></label>;
}
