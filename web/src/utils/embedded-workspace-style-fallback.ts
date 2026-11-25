import workspaceStyles from '../pages/quantity-breaks.module.css?inline';
import { ensureEmbeddedWorkspaceStyles } from './embedded-workspace-styles';

export function ensureEmbeddedWorkspaceStyleFallback(document: Document, rootClassName: string): boolean {
  return ensureEmbeddedWorkspaceStyles(document, rootClassName, workspaceStyles);
}
