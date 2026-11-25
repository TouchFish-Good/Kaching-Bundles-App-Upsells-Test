import sqlite3 from 'sqlite3';

type Installation = { storeId: string; handle: string; scope: string; at: string };
type Uninstallation = { storeId: string; webhookId: string; at: string };
type ErrorEvent = { kind: string; severity: string; code: string; traceId?: string; storeId?: string; at: string };

export class AdminRegistry {
  private db: sqlite3.Database;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.db = new sqlite3.Database(path);
  }

  private run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => this.db.run(sql, params, (error) => error ? reject(error) : resolve()));
  }

  private get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => this.db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as T)));
  }

  private all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => this.db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[])));
  }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action, action);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async ready(): Promise<void> {
    await this.run('PRAGMA foreign_keys = ON');
    await this.run(`CREATE TABLE IF NOT EXISTS admin_stores (
      store_id TEXT PRIMARY KEY, handle TEXT NOT NULL, scope TEXT NOT NULL,
      status TEXT NOT NULL, installed_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    await this.run(`CREATE TABLE IF NOT EXISTS admin_installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL,
      installed_at TEXT NOT NULL, uninstalled_at TEXT,
      FOREIGN KEY(store_id) REFERENCES admin_stores(store_id)
    )`);
    await this.run('CREATE UNIQUE INDEX IF NOT EXISTS admin_installation_cycle ON admin_installations(store_id, installed_at)');
    await this.run('CREATE TABLE IF NOT EXISTS admin_webhook_events (webhook_id TEXT PRIMARY KEY, received_at TEXT NOT NULL)');
    await this.run(`CREATE TABLE IF NOT EXISTS admin_error_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, kind TEXT NOT NULL,
      severity TEXT NOT NULL, code TEXT NOT NULL, trace_id TEXT, occurred_at TEXT NOT NULL
    )`);
  }

  recordInstallation(input: Installation): Promise<void> {
    if (!input.storeId || !input.handle || !input.at) throw new Error('Invalid installation identity');
    return this.exclusive(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const previous = await this.get<{ status: string; installed_at: string; updated_at: string }>(
          'SELECT status, installed_at, updated_at FROM admin_stores WHERE store_id = ?', [input.storeId]);
        if (previous && input.at < previous.updated_at) {
          await this.run('COMMIT');
          return;
        }
        await this.run(`INSERT INTO admin_stores(store_id,handle,scope,status,installed_at,updated_at)
          VALUES(?,?,?,'installed',?,?) ON CONFLICT(store_id) DO UPDATE SET
          handle=excluded.handle,scope=excluded.scope,status='installed',
          installed_at=CASE WHEN admin_stores.status='installed' THEN admin_stores.installed_at ELSE excluded.installed_at END,
          updated_at=excluded.updated_at`, [input.storeId, input.handle, input.scope, input.at, input.at]);
        if (!previous || previous.status !== 'installed') {
          await this.run('INSERT OR IGNORE INTO admin_installations(store_id,installed_at) VALUES(?,?)', [input.storeId, input.at]);
        }
        await this.run('COMMIT');
      } catch (error) {
        await this.run('ROLLBACK');
        throw error;
      }
    });
  }

  recordUninstallation(input: Uninstallation): Promise<boolean> {
    if (!input.storeId || !input.webhookId || !input.at || Number.isNaN(Date.parse(input.at))) throw new Error('Invalid uninstall event');
    return this.exclusive(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const known = await this.get('SELECT webhook_id FROM admin_webhook_events WHERE webhook_id = ?', [input.webhookId]);
        if (known) { await this.run('COMMIT'); return false; }
        await this.run('INSERT INTO admin_webhook_events(webhook_id,received_at) VALUES(?,?)', [input.webhookId, input.at]);
        const store = await this.get<{ store_id: string; installed_at: string; updated_at: string; status: string }>(
          'SELECT store_id,installed_at,updated_at,status FROM admin_stores WHERE store_id = ?', [input.storeId]);
        if (store && store.status === 'installed' && input.at >= store.installed_at && input.at >= store.updated_at) {
          await this.run("UPDATE admin_stores SET status='uninstalled',updated_at=? WHERE store_id=?", [input.at, store.store_id]);
          await this.run(`UPDATE admin_installations SET uninstalled_at=? WHERE id=(
            SELECT id FROM admin_installations WHERE store_id=? AND uninstalled_at IS NULL ORDER BY id DESC LIMIT 1
          )`, [input.at, store.store_id]);
          await this.run('COMMIT');
          return true;
        }
        await this.run('COMMIT');
        return false;
      } catch (error) {
        await this.run('ROLLBACK');
        throw error;
      }
    });
  }

  async listStores(input: { query?: string; status?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.query) { where.push('(store_id LIKE ? OR handle LIKE ?)'); params.push(`%${input.query}%`, `%${input.query}%`); }
    if (input.status && input.status !== 'all') { where.push('status = ?'); params.push(input.status); }
    const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const count = await this.get<{ total: number }>(`SELECT count(*) AS total FROM admin_stores${filter}`, params);
    const rows = await this.all<{ store_id: string; handle: string; scope: string; status: string; installed_at: string; updated_at: string }>(
      `SELECT store_id,handle,scope,status,installed_at,updated_at FROM admin_stores${filter} ORDER BY updated_at DESC,store_id LIMIT ? OFFSET ?`,
      [...params, input.limit, input.offset]);
    return { total: count?.total || 0, items: rows.map((row) => this.storeView(row)) };
  }

  async getStore(storeId: string) {
    const row = await this.get<{ store_id: string; handle: string; scope: string; status: string; installed_at: string; updated_at: string }>(
      'SELECT store_id,handle,scope,status,installed_at,updated_at FROM admin_stores WHERE store_id=?', [storeId]);
    if (!row) return null;
    const cycles = await this.all<{ installed_at: string; uninstalled_at: string | null }>(
      'SELECT installed_at,uninstalled_at FROM admin_installations WHERE store_id=? ORDER BY id DESC', [storeId]);
    return { ...this.storeView(row), installations: cycles.map((cycle) => ({ installedAt: cycle.installed_at, uninstalledAt: cycle.uninstalled_at })) };
  }

  private storeView(row: { store_id: string; handle: string; scope: string; status: string; installed_at: string; updated_at: string }) {
    return { storeId: row.store_id, handle: row.handle, scope: row.scope, status: row.status, installedAt: row.installed_at, updatedAt: row.updated_at };
  }

  async countInstalled() {
    const row = await this.get<{ count: number }>("SELECT count(*) AS count FROM admin_stores WHERE status='installed'");
    return row?.count || 0;
  }

  async recordError(event: ErrorEvent): Promise<void> {
    await this.run('INSERT INTO admin_error_events(store_id,kind,severity,code,trace_id,occurred_at) VALUES(?,?,?,?,?,?)',
      [event.storeId || null, event.kind, event.severity, event.code, event.traceId || null, event.at]);
  }

  async listErrors(input: { limit: number; offset: number; storeId?: string; from?: string; to?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.storeId) { where.push('store_id=?'); params.push(input.storeId); }
    if (input.from) { where.push('occurred_at>=?'); params.push(input.from); }
    if (input.to) { where.push('occurred_at<=?'); params.push(input.to); }
    const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = await this.get<{ count: number }>(`SELECT count(*) AS count FROM admin_error_events${filter}`, params);
    const rows = await this.all<{ id: number; store_id: string | null; kind: string; severity: string; code: string; trace_id: string | null; occurred_at: string }>(
      `SELECT id,store_id,kind,severity,code,trace_id,occurred_at FROM admin_error_events${filter} ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, input.limit, input.offset]);
    return { total: total?.count || 0, items: rows.map((row) => ({ id: row.id, storeId: row.store_id, kind: row.kind, severity: row.severity, code: row.code, traceId: row.trace_id, occurredAt: row.occurred_at })) };
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => this.db.close((error) => error ? reject(error) : resolve()));
  }
}
