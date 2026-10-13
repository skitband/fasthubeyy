// Native uses expo-sqlite directly; web resolves to ./sqlite.web.tsx (sql.js), which needs no cross-origin isolation.
export {
  SQLiteProvider,
  useSQLiteContext,
  deserializeDatabaseAsync,
  backupDatabaseAsync,
} from 'expo-sqlite';
export type { SQLiteDatabase } from 'expo-sqlite';
