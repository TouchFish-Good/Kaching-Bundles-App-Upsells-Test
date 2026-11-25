import { DatabaseSync } from 'node:sqlite';

// Execute the real repository SQL locally; this is not a Cloudflare runtime emulator.
export function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  function prepare(sql, values = []) {
    return {
      bind: (...next) => prepare(sql, next),
      async first(column) { const row = db.prepare(sql).get(...values); return row ? (column ? row[column] : { ...row }) : null; },
      async all() { return { success: true, results: db.prepare(sql).all(...values).map(row => ({ ...row })) }; },
      async run() { const result = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
  }
  return {
    prepare,
    async batch(statements) {
      db.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
