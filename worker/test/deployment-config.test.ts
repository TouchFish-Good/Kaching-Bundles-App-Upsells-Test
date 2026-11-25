import { describe, expect, it } from 'vitest';
import { DEPLOYMENT_CONFIG } from '../src/deployment-config';

describe('deployment configuration', () => {
  it('uses the test app domain in SHOPLINE configuration', async () => {
    expect(DEPLOYMENT_CONFIG.appUrl).toBe('https://app-test.vswwy.cn');
    expect(DEPLOYMENT_CONFIG.callbackUrl).toBe('https://app-test.vswwy.cn/api/auth/callback');
  });

  it('keeps the Worker and D1 names aligned', async () => {
    expect(DEPLOYMENT_CONFIG.workerName).toBe('shopline-quantity-breaks-test');
    expect(DEPLOYMENT_CONFIG.d1Binding).toBe('DB');
    expect(DEPLOYMENT_CONFIG.d1DatabaseName).toBe('shopline-quantity-breaks-test');
  });
});
