/**
 * bridge.ts — 網頁 → 擴充的 RPC。
 *
 * 沒有後端。資料真正的家是擴充的 chrome.storage.local，
 * 網頁只是另一個前端，透過 chrome.runtime.sendMessage 讀寫。
 * 擴充的 manifest 用固定 key 鎖住 extension id，所以這裡可以寫死。
 */

export const EXTENSION_ID =
  process.env.NEXT_PUBLIC_EXTENSION_ID || 'lpjffffopipgkkodjjljkhnfdpppbgml';

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function runtime(): any | null {
  if (typeof window === 'undefined') return null;
  const c = (window as any).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

export function bridgeAvailable(): boolean {
  return runtime() !== null;
}

export function call<T = unknown>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const rt = runtime();
    if (!rt) return reject(new Error('NO_CHROME'));

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('TIMEOUT')); }
    }, 5000);

    try {
      rt.sendMessage(EXTENSION_ID, { type, payload }, (res: Reply<T> | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // 擴充沒安裝／沒啟用時 lastError 會被設定
        const err = rt.lastError;
        if (err) return reject(new Error('NO_EXTENSION'));
        if (!res) return reject(new Error('NO_RESPONSE'));
        if (!res.ok) return reject(new Error(res.error));
        resolve(res.data);
      });
    } catch {
      clearTimeout(timer);
      reject(new Error('NO_EXTENSION'));
    }
  });
}
