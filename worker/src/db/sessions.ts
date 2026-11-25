import { decryptToken, encryptToken } from '../crypto';

export type ShoplineSession = {
  handle: string;
  storeId?: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: string;
  installed: boolean;
};

type SessionRow = {
  handle: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  scope: string;
  expires_at: string;
  installed: number;
  updated_at: string;
};

export class D1SessionStore {
  constructor(
    private readonly database: D1Database,
    private readonly encryptionKey: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(handle: string): Promise<ShoplineSession | null> {
    const row = await this.database
      .prepare(`SELECT handle, access_token_ciphertext, refresh_token_ciphertext, scope, expires_at, installed, updated_at
        FROM shopline_sessions WHERE handle = ?`)
      .bind(handle)
      .first<SessionRow>();
    if (!row) return null;

    const [accessToken, refreshToken] = await Promise.all([
      decryptToken(this.encryptionKey, handle, row.access_token_ciphertext),
      decryptToken(this.encryptionKey, handle, row.refresh_token_ciphertext),
    ]);

    return {
      handle: row.handle,
      accessToken,
      refreshToken,
      scope: row.scope,
      expiresAt: row.expires_at,
      installed: row.installed === 1,
    };
  }

  async listInstalled(input: { limit: number; offset: number }): Promise<{ total: number; sessions: ShoplineSession[] }> {
    const limit = Math.max(1, Math.min(input.limit, 100));
    const offset = Math.max(0, input.offset);
    const [count, rows] = await Promise.all([
      this.database.prepare('SELECT count(*) AS total FROM shopline_sessions WHERE installed = 1').first<{ total: number }>(),
      this.database.prepare(`SELECT handle, access_token_ciphertext, refresh_token_ciphertext, scope, expires_at, installed, updated_at
        FROM shopline_sessions WHERE installed = 1 ORDER BY handle ASC LIMIT ? OFFSET ?`).bind(limit, offset).all<SessionRow>(),
    ]);
    const sessions = await Promise.all(rows.results.map(async (row) => {
      const [accessToken, refreshToken] = await Promise.all([
        decryptToken(this.encryptionKey, row.handle, row.access_token_ciphertext),
        decryptToken(this.encryptionKey, row.handle, row.refresh_token_ciphertext),
      ]);
      return { handle: row.handle, accessToken, refreshToken, scope: row.scope, expiresAt: row.expires_at, installed: true };
    }));
    return { total: Number(count?.total ?? 0), sessions };
  }

  async getActiveStoreIdentity(handle: string): Promise<{ storeId: string; handle: string } | null> {
    const row = await this.database.prepare(`SELECT store_id, handle FROM admin_stores
      WHERE handle = ? AND status = 'installed'`).bind(handle).first<{ store_id: string; handle: string }>();
    return row ? { storeId: row.store_id, handle: row.handle } : null;
  }

  async getInstalledHandleByStoreId(storeId: string): Promise<string | null> {
    const rows = await this.database.prepare(`SELECT DISTINCT s.handle FROM shopline_sessions s
      LEFT JOIN admin_stores a ON a.handle = s.handle AND a.status = 'installed'
      WHERE s.installed = 1 AND COALESCE(s.store_id, a.store_id) = ? LIMIT 2`)
      .bind(storeId).all<{ handle: string }>();
    return rows.results.length === 1 ? rows.results[0].handle : null;
  }

  async getInstalledStoreId(handle: string): Promise<string | null> {
    const row = await this.database.prepare(`SELECT COALESCE(s.store_id,
      (SELECT store_id FROM admin_stores WHERE handle = s.handle AND status = 'installed')) AS store_id
      FROM shopline_sessions s WHERE s.handle = ? AND s.installed = 1`).bind(handle).first<{ store_id: string | null }>();
    return row?.store_id && /^\d+$/.test(row.store_id) ? row.store_id : null;
  }

  async upsert(session: ShoplineSession): Promise<void> {
    const [accessTokenCiphertext, refreshTokenCiphertext] = await Promise.all([
      encryptToken(this.encryptionKey, session.handle, session.accessToken),
      encryptToken(this.encryptionKey, session.handle, session.refreshToken),
    ]);
    const timestamp = this.now().toISOString();

    await this.database
      .prepare(`INSERT INTO shopline_sessions (
          handle, store_id, access_token_ciphertext, refresh_token_ciphertext, scope, expires_at, installed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(handle) DO UPDATE SET
          store_id = excluded.store_id,
          access_token_ciphertext = excluded.access_token_ciphertext,
          refresh_token_ciphertext = excluded.refresh_token_ciphertext,
          scope = excluded.scope,
          expires_at = excluded.expires_at,
          installed = excluded.installed,
          created_at = CASE WHEN shopline_sessions.installed = 0 THEN excluded.created_at ELSE shopline_sessions.created_at END,
          updated_at = excluded.updated_at`)
      .bind(
        session.handle,
        session.storeId ?? null,
        accessTokenCiphertext,
        refreshTokenCiphertext,
        session.scope,
        session.expiresAt,
        session.installed ? 1 : 0,
        timestamp,
        timestamp,
      )
      .run();
  }

  async markUninstalled(handle: string): Promise<void> {
    await this.database
      .prepare('UPDATE shopline_sessions SET installed = 0, updated_at = ? WHERE handle = ?')
      .bind(this.now().toISOString(), handle)
      .run();
  }

  async recordInstallation(input: { storeId: string; handle: string; scope: string; at: string }): Promise<void> {
    if (!/^\d+$/.test(input.storeId) || !input.handle || !input.scope || Number.isNaN(Date.parse(input.at))) throw new Error('Invalid installation identity');
    await this.database.batch([
      this.database.prepare(`INSERT INTO admin_installations (store_id, installed_at)
        SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_stores WHERE store_id = ? AND status = 'installed')`)
        .bind(input.storeId, input.at, input.storeId),
      this.database.prepare(`INSERT INTO admin_stores (store_id, handle, scope, status, installed_at, updated_at)
        VALUES (?, ?, ?, 'installed', ?, ?)
        ON CONFLICT(store_id) DO UPDATE SET handle = excluded.handle, scope = excluded.scope, status = 'installed',
          installed_at = CASE WHEN admin_stores.status = 'installed' THEN admin_stores.installed_at ELSE excluded.installed_at END,
          updated_at = excluded.updated_at`)
        .bind(input.storeId, input.handle, input.scope, input.at, input.at),
    ]);
  }

  async recordUninstalled(input: { handle: string; storeId: string; webhookId: string; topic: string; occurredAt: string }): Promise<void> {
    if (!input.handle || !/^\d+$/.test(input.storeId) || !input.webhookId || !input.topic || Number.isNaN(Date.parse(input.occurredAt))) throw new Error('Invalid uninstall event');
    await this.database.batch([
      this.database.prepare(`INSERT INTO webhook_events (webhook_id, shop_handle, topic, received_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(webhook_id) DO NOTHING`)
        .bind(input.webhookId, input.handle, input.topic, input.occurredAt),
      this.database.prepare(`UPDATE shopline_sessions SET installed = 0, updated_at = ?
        WHERE handle = ? AND store_id = ? AND installed = 1 AND created_at <= ?`)
        .bind(input.occurredAt, input.handle, input.storeId, input.occurredAt),
      this.database.prepare(`UPDATE admin_stores SET status = 'uninstalled', updated_at = ?
        WHERE store_id = ? AND status = 'installed' AND installed_at <= ?`)
        .bind(input.occurredAt, input.storeId, input.occurredAt),
      this.database.prepare(`UPDATE admin_installations SET uninstalled_at = ?
        WHERE store_id = ? AND uninstalled_at IS NULL AND EXISTS (
          SELECT 1 FROM admin_stores WHERE store_id = ? AND status = 'uninstalled' AND updated_at = ?
        )`)
        .bind(input.occurredAt, input.storeId, input.storeId, input.occurredAt),
    ]);
  }

  async updateRefreshed(previous: ShoplineSession, refreshed: ShoplineSession): Promise<boolean> {
    const [accessTokenCiphertext, refreshTokenCiphertext] = await Promise.all([
      encryptToken(this.encryptionKey, refreshed.handle, refreshed.accessToken),
      encryptToken(this.encryptionKey, refreshed.handle, refreshed.refreshToken),
    ]);
    const result = await this.database.prepare(`UPDATE shopline_sessions SET
      access_token_ciphertext = ?, refresh_token_ciphertext = ?, scope = ?, expires_at = ?, updated_at = ?
      WHERE handle = ? AND installed = 1 AND expires_at = ?`)
      .bind(accessTokenCiphertext, refreshTokenCiphertext, refreshed.scope, refreshed.expiresAt, this.now().toISOString(), previous.handle, previous.expiresAt)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }
}
