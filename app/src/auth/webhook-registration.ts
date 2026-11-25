export async function registerWebhooksBestEffort(register: () => Promise<unknown>): Promise<void> {
  try { await register(); }
  catch { console.error('SHOPLINE webhook registration failed after authorization'); }
}
