import { RequestHandler } from 'express';
import shopline from '../../shopline';
import { adminRegistry, adminRegistryReady } from '../../admin-read';
import { parseUninstallEvent } from '../../admin-read/install-event';

export const webhooksController: () => RequestHandler = () => async (_req, res) => {
  try {
    const data = await shopline.webhookAuthentication(_req);
    const { topic, session, webhookId, payload } = data;

    switch (topic) {
      case 'apps/installed_uninstalled':
        {
          const event = parseUninstallEvent(payload);
          if (!event) break;
          await adminRegistryReady;
          const applied = await adminRegistry.recordUninstallation({ ...event, webhookId });
          if (applied && session) await shopline.config.sessionStorage.deleteSession(session.id);
        }
        break;
      case 'products/create':
        break;
      case 'customers/redact':
        break;
      case 'merchants/redact':
        break;
      default:
        res.status(404).send({ success: false });
        return;
    }
    res.status(200).send({ success: true });
  } catch (error) {
    try {
      await adminRegistryReady;
      await adminRegistry.recordError({ kind: 'webhook', severity: 'error', code: 'WEBHOOK_PROCESSING_FAILED', at: new Date().toISOString() });
    } catch (_) { /* Avoid exposing storage failures in the webhook response. */ }
    console.error('Webhook processing failed');
    res.status(500).send({ success: false });
  }
};
