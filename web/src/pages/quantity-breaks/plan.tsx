import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { startSubscriptionCheckout, readSubscription, SubscriptionApiError, type SubscriptionResponse } from '../../prototype/subscription-api';
import { resolveSubscriptionLocale, subscriptionLocaleName, subscriptionLocales, subscriptionPlanFeatures, subscriptionPlanUi, subscriptionText } from '../../prototype/subscription-messages';
import { useAuthenticatedFetch } from '../../hooks/useAuthenticatedFetch';
import { useAppBridge } from '../../hooks/useAppBridge';
import { openNativePackagePurchase } from '../../prototype/subscription-navigation';
import './plan.css';

export default function QuantityBreaksPlan() {
  const { i18n } = useTranslation();
  const fetcher = useAuthenticatedFetch();
  const app = useAppBridge();
  const locale = resolveSubscriptionLocale(i18n.language);
  const ui = subscriptionPlanUi(locale);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'redirecting'>('loading');
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);

  const paymentState = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('payment');

  const load = () => {
    setState('loading');
    setError(null);
    void readSubscription(fetcher).then((value) => {
      if (!(value.planPageRequired ?? !value.access) && paymentState !== 'review_pending' && typeof window !== 'undefined') {
        setState('loading');
        window.history.replaceState(window.history.state, '', `/quantity-breaks${window.location.search}`);
        window.dispatchEvent(new window.PopStateEvent('popstate'));
        return;
      }
      setSubscription(value);
      setState('ready');
    }).catch((reason: Error) => {
      setError({ message: reason.message, requestId: reason instanceof SubscriptionApiError ? reason.requestId : null });
      setState('error');
    });
  };
  useEffect(load, [fetcher, paymentState]);
  useEffect(() => { document.title = `${ui.appName} - ${ui.pageTitle}`; }, [ui.appName, ui.pageTitle]);

  useEffect(() => {
    if (paymentState !== 'review_pending') return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 30_000;
    setPaymentVerified(false);

    const poll = async () => {
      if (cancelled) return;
      try {
        const value = await readSubscription(fetcher);
        if (cancelled) return;
        setSubscription(value);
        setError(null);
        setState('ready');
        const state = value.entitlement?.state;
        if (state === 'trial' || state === 'active' || state === 'grace') {
          setPaymentVerified(true);
          setState('loading');
          window.history.replaceState(window.history.state, '', `/quantity-breaks${window.location.search}`);
          window.dispatchEvent(new window.PopStateEvent('popstate'));
          return;
        }
      } catch {
        // Keep the page fail-closed while Partner/D1 visibility catches up.
      }
      if (!cancelled && Date.now() < deadline) timer = setTimeout(() => { void poll(); }, 2_000);
    };

    timer = setTimeout(() => { void poll(); }, 2_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [fetcher, paymentState]);

  const checkout = async () => {
    setState('redirecting');
    try {
      if (app?.config.appKey) {
        openNativePackagePurchase(app);
        return;
      }
      const result = await startSubscriptionCheckout(fetcher);
      window.location.assign(result.checkoutUrl);
    } catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : subscriptionText(locale, 'checkoutError'), requestId: reason instanceof SubscriptionApiError ? reason.requestId : null });
      setState('ready');
    }
  };

  const status = paymentState === 'review_pending' && !paymentVerified ? 'review_pending' : subscription?.entitlement?.state;
  const action = !status || status === 'unknown' || status === 'review_pending' ? subscriptionText(locale, 'subscribe') : status === 'active' || status === 'grace' || status === 'inactive' ? subscriptionText(locale, 'renew') : subscriptionText(locale, 'subscribe');
  const message = status === 'grace' ? subscriptionText(locale, 'grace') : status === 'inactive' ? subscriptionText(locale, 'inactive') : status === 'active' ? subscriptionText(locale, 'subscribed') : '';
  const isRedirecting = state === 'redirecting';
  const header = <header className="subscription-plan__toolbar"><h1 id="subscription-plan-title">{ui.pageTitle}</h1><label className="subscription-plan__language"><span>{ui.languageLabel}</span><span className="subscription-plan__select-wrap"><select value={locale} onChange={(event) => { void i18n.changeLanguage(event.target.value); }} aria-label={ui.languageLabel}>{subscriptionLocales.map((item) => <option key={item} value={item}>{subscriptionLocaleName(item)}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></span></label></header>;

  if (state === 'loading') return <main className="subscription-plan" aria-busy="true"><div className="subscription-plan__content">{header}<p className="subscription-plan__loading" role="status">{subscriptionText(locale, 'loading')}</p></div></main>;
  if (state === 'error') return <main className="subscription-plan"><div className="subscription-plan__content">{header}<section className="subscription-plan__card subscription-plan__card--error" role="alert"><p className="subscription-plan__error">{subscriptionText(locale, 'error')}</p><p className="subscription-plan__error-detail">{error?.message}</p><button type="button" onClick={load}>{subscriptionText(locale, 'retry')}</button></section></div></main>;
  return <main className="subscription-plan"><div className="subscription-plan__content">{header}<section className="subscription-plan__card" aria-labelledby="subscription-plan-title"><div className="subscription-plan__card-header"><h2>Ultra</h2><div className="subscription-plan__price"><strong className="billing-price">{ui.billingPrice}</strong><small id="billingGrowthCycle">{ui.billingCycle}</small></div></div><div className="subscription-plan__action"><p className="subscription-plan__trial-hint">{ui.trialAction}</p>{message && <p className={`subscription-plan__notice subscription-plan__notice--${status}`}>{message}</p>}{error && <div className="subscription-plan__checkout-error" role="alert"><strong>{subscriptionText(locale, 'checkoutError')}</strong><p>{error.message}</p>{error.requestId && <p className="subscription-plan__reference">{subscriptionText(locale, 'reference')}: <code>{error.requestId}</code></p>}</div>}<div className="subscription-plan__actions"><button type="button" onClick={() => { void checkout(); }} disabled={isRedirecting} aria-busy={isRedirecting}>{action}</button></div></div><ul className="subscription-plan__features">{subscriptionPlanFeatures(locale).map((feature) => <li key={feature.title}><Check size={18} strokeWidth={2.5} aria-hidden="true" /><div><strong>{feature.title}</strong><p>{feature.description}</p></div></li>)}</ul><p className="subscription-plan__contact">{ui.supportLabel} <a href="mailto:appideasbox@gmail.com">appideasbox@gmail.com</a></p></section></div></main>;
}
