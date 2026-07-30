'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { call } from './bridge';
import { EMPTY_SNAPSHOT, type Snapshot } from './types';

type Status = 'loading' | 'ok' | 'disconnected';

type Store = {
  status: Status;
  data: Snapshot;
  error: string | null;
  refresh: () => Promise<void>;
  /** 呼叫擴充的 RPC，成功後自動重新載入 */
  act: <T = unknown>(type: string, payload?: unknown) => Promise<T | null>;
};

const Ctx = createContext<Store | null>(null);

const POLL_MS = 5000;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const snap = await call<Snapshot>('getAll');
      setData({ ...EMPTY_SNAPSHOT, ...snap });
      setStatus('ok');
      setError(null);
    } catch (e) {
      setStatus('disconnected');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  }, []);

  const act = useCallback(
    async <T,>(type: string, payload?: unknown): Promise<T | null> => {
      try {
        const r = await call<T>(type, payload);
        await refresh();
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const value = useMemo(
    () => ({ status, data, error, refresh, act }),
    [status, data, error, refresh, act],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore 必須放在 StoreProvider 裡面');
  return c;
}
