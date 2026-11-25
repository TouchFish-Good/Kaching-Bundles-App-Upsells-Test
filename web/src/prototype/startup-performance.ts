export type StartupMark = 'react-mounted' | 'subscription-ready' | 'shop-ready' | 'campaigns-ready';

type PerformanceLike = Pick<Performance, 'mark'>;

export function markStartup(name: StartupMark, performanceRef: PerformanceLike | undefined = globalThis.performance): void {
  try { performanceRef?.mark(`quantity-breaks:${name}`); }
  catch { /* Performance telemetry must never affect rendering. */ }
}
