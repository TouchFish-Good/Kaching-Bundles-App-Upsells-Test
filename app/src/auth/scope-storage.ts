import type { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import { assertAuthorizedSessionScopes } from './scopes';

export function scopeCheckedSessionStorage(storage: SQLiteSessionStorage) {
  return {
    storeSession: async (session: Parameters<SQLiteSessionStorage['storeSession']>[0]) => {
      assertAuthorizedSessionScopes(session.scope);
      return storage.storeSession(session);
    },
    loadSession: (id: string) => storage.loadSession(id),
    deleteSession: (id: string) => storage.deleteSession(id),
    deleteSessions: (ids: string[]) => storage.deleteSessions(ids),
    findSessionsByHandle: (handle: string) => storage.findSessionsByHandle(handle),
  };
}
