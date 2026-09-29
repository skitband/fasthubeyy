import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

// Manual refresh signal: mutations call refresh(), screens re-run selectors.
const RefreshContext = createContext<{ version: number; refresh: () => void }>({
  version: 0,
  refresh: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  return useContext(RefreshContext);
}

export function usePullToRefresh() {
  const { refresh } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const refreshInProgress = useRef(false);

  const onRefresh = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    try {
      refresh();
      await new Promise((resolve) => setTimeout(resolve, 450));
    } finally {
      refreshInProgress.current = false;
      setRefreshing(false);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}

/** Run a selector against the DB, recomputing on refresh() and whenever the screen regains focus. */
export function useDbData<T>(selector: (db: SQLiteDatabase) => T): T {
  const db = useSQLiteContext();
  const { version } = useRefresh();
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => selector(db), [db, version, tick]);
}
