const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfig() {
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return { url, key };
}

export async function supabaseFetch(path: string, init: RequestInit = {}) {
  const cfg = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set('apikey', cfg.key); headers.set('Authorization', `Bearer ${cfg.key}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${cfg.url}${path}`, { ...init, headers, cache: 'no-store' });
}
