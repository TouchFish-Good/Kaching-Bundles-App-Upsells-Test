const FALLBACK_STYLE_ID = 'quantity-breaks-embedded-workspace-styles';

export function workspaceStylesAreApplied(document: Document, rootClassName: string): boolean {
  const root = document.getElementsByClassName(rootClassName).item(0) as HTMLElement | null;
  const view = document.defaultView;
  if (!root || !view) return true;
  return view.getComputedStyle(root).display === 'grid';
}

export function installEmbeddedWorkspaceStyleGuard(document: Document, rootClassName: string, recover: () => void): void {
  const verify = () => {
    const root = document.getElementsByClassName(rootClassName).item(0);
    if (!root) return false;
    if (!workspaceStylesAreApplied(document, rootClassName)) recover();
    return true;
  };
  if (verify()) return;

  const mountRoot = document.getElementById('root');
  const MutationObserver = document.defaultView?.MutationObserver;
  if (!mountRoot || !MutationObserver) return;
  const observer = new MutationObserver(() => {
    if (verify()) observer.disconnect();
  });
  observer.observe(mountRoot, { childList: true, subtree: true });
}

/**
 * SHOPLINE's embedded frame occasionally completes React before its linked
 * stylesheet is applied. Keep the Vite stylesheet as the normal path and only
 * inline the identical compiled CSS when that condition is observed.
 */
export function ensureEmbeddedWorkspaceStyles(document: Document, rootClassName: string, cssText: string): boolean {
  if (document.getElementById(FALLBACK_STYLE_ID) || workspaceStylesAreApplied(document, rootClassName)) return false;
  const style = document.createElement('style');
  style.id = FALLBACK_STYLE_ID;
  style.textContent = cssText;
  document.head.append(style);
  return true;
}
