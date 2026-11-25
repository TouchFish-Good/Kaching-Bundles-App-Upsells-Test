import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import workspaceClassNames from "./pages/quantity-breaks.module.css";
import { initI18next } from "./utils/i18n";
import { installEmbeddedWorkspaceStyleGuard } from "./utils/embedded-workspace-styles";
import { resolveEntryHref, resolveEntryPath } from "./entry-route";
import QuantityBreaksPrototype from "./pages/quantity-breaks";
import { initEmbeddedOAuth, renderEmbeddedOAuthPending } from "./prototype/embedded-auth";
import { claimBootstrapRecovery, clearBootstrapRecovery } from "./prototype/bootstrap-recovery";
import { markStartup } from "./prototype/startup-performance";
import { browserStorage } from "./prototype/browser-storage";

function markStaticBootstrapReady() {
  window.__quantityBreaksBootstrapReady?.();
}

async function getEntryComponent() {
  if (window.location.pathname === "/preview/feedback-board") {
    return (await import("./prototype/feedback-preview-page")).default;
  }
  const entryPath = resolveEntryPath(window.location.pathname, window.location.search);
  if (entryPath !== window.location.pathname) {
    window.history.replaceState(window.history.state, "", resolveEntryHref(window.location.pathname, window.location.search, window.location.hash));
  }
  if (entryPath === "/quantity-breaks" || entryPath.startsWith("/quantity-breaks/") || entryPath.startsWith("/product-discount-customizations/")) {
    return QuantityBreaksPrototype;
  }

  return (await import("./App")).default;
}

function bootstrap() {
  let oauthStarted = false;
  try {
    oauthStarted = initEmbeddedOAuth();
  } catch (error) {
    console.error('[app-bootstrap] OAuth handoff failed', error);
    return;
  }
  if (oauthStarted) {
    markStaticBootstrapReady();
    renderEmbeddedOAuthPending();
    return;
  }
  // The document owns the one-time recovery timer. A slow initialization must
  // still mount when it completes, including after the second document holds.
  Promise.all([initI18next(), getEntryComponent()]).then(([, EntryComponent]) => {
    clearBootstrapRecovery(browserStorage('sessionStorage'));
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <EntryComponent />
      </React.StrictMode>
    );
    window.requestAnimationFrame(() => {
      installEmbeddedWorkspaceStyleGuard(document, workspaceClassNames.appShell, () => {
        void import('./utils/embedded-workspace-style-fallback').then(({ ensureEmbeddedWorkspaceStyleFallback }) => {
          ensureEmbeddedWorkspaceStyleFallback(document, workspaceClassNames.appShell);
        });
      });
    });
    markStartup('react-mounted');
    markStaticBootstrapReady();
  }).catch((error) => {
    console.error('[app-bootstrap] failed to initialize application', error);
    if (claimBootstrapRecovery(browserStorage('sessionStorage')) === 'reload') {
      window.location.reload();
    }
  });
}

bootstrap();
