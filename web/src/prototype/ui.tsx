import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { CampaignStatus, Toast } from "./model";
import { useTranslation } from 'react-i18next';
import { workspaceText } from './admin-workspace-messages';
import styles from "../pages/quantity-breaks.module.css";

export function Button({ children, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }) {
  return <button className={`${styles.button} ${styles[`button${variant}`]} ${className}`} {...props}>{children}</button>;
}

export function StatusPill({ status }: { status: CampaignStatus }) {
  const { i18n } = useTranslation();
  const unverifiedLabels: Record<string, string> = {
    en: 'Status unavailable', fr: 'Statut indisponible', de: 'Status nicht verfugbar', es: 'Estado no disponible', it: 'Stato non disponibile', nl: 'Status niet beschikbaar', sv: 'Status inte tillganglig', tr: 'Durum kullanilamiyor', 'pt-br': 'Status indisponivel', 'zh-hans': '状态暂无法核验', 'zh-hant': '狀態暫時無法核驗', ms: 'Status tidak tersedia', th: 'ไม่สามารถตรวจสอบสถานะได้', id: 'Status tidak tersedia', vi: 'Khong the xac minh trang thai', ja: 'ステータスを確認できません',
  };
  const label = status === 'Unverified'
    ? unverifiedLabels[i18n.language.toLowerCase()] ?? unverifiedLabels.en
    : workspaceText(i18n.language, `status${status}` as Parameters<typeof workspaceText>[1]);
  return <span className={`${styles.status} ${styles[`status${status === 'Starting' ? 'Pausing' : status}`]}`}>{label}</span>;
}

export function Section({ title, detail, children, action }: { title: string; detail?: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.section}><header className={styles.sectionHeader}><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>{children}</section>;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} disabled={disabled} className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}><span /></button>;
}

export function ToastRegion({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { i18n } = useTranslation();
  if (!toast) return null;
  return <div className={`${styles.toast} ${styles[`toast${toast.tone}`]}`} role={toast.tone === "error" ? "alert" : "status"} aria-live="polite"><span>{toast.message}</span><button onClick={onClose} aria-label={workspaceText(i18n.language, 'dismiss')} title={workspaceText(i18n.language, 'dismiss')}>{workspaceText(i18n.language, 'close')}</button></div>;
}
