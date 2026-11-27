const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const STATE_LIFETIME = 10 * 60 * 1000;
const STATE_PATTERN = /^([a-p]{32})\.([A-Za-z0-9_-]{43})$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const encoder = new TextEncoder();

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fail(status) {
  return new Response(null, { status, headers: PRIVATE_HEADERS });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: url.href } });
}

export function createDriveOAuthHandler({ clientId, clientSecret, redirectUri, extensionIds, fetchRequest = fetch }) {
  const allowedIds = new Set((extensionIds ?? '').split(',').map((id) => id.trim()));
  const callback = redirectUri ? new URL(redirectUri) : null;
  const key = clientSecret && crypto.subtle.importKey(
    'raw', encoder.encode(clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );

  const extensionId = (state) => {
    const id = STATE_PATTERN.exec(state ?? '')?.[1];
    return allowedIds.has(id) ? id : null;
  };

  async function sign(state, challenge) {
    const payload = [state, Date.now() + STATE_LIFETIME, challenge].join('.');
    const signature = await crypto.subtle.sign('HMAC', await key, encoder.encode(payload));
    return payload + '.' + base64Url(new Uint8Array(signature));
  }

  async function verify(proof) {
    if (!proof || proof.length > 200) return null;
    const [id, nonce, expires, challenge, signature, ...extra] = proof.split('.');
    if (extra.length || !extensionId(id + '.' + nonce) || !/^\d{13}$/.test(expires) ||
        Number(expires) <= Date.now() || !CHALLENGE_PATTERN.test(challenge) ||
        !CHALLENGE_PATTERN.test(signature)) return null;
    const signatureBytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/') + '='), (char) => char.charCodeAt(0));
    const payload = proof.slice(0, proof.lastIndexOf('.'));
    return await crypto.subtle.verify('HMAC', await key, signatureBytes, encoder.encode(payload))
      ? { id, challenge } : null;
  }

  async function token(request) {
    if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return fail(415);
    if (Number(request.headers.get('Content-Length')) > 8192) return fail(413);
    const body = await request.text();
    if (body.length > 8192) return fail(413);
    const params = new URLSearchParams(body);
    const refreshToken = params.get('refresh_token');
    const fields = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    if (refreshToken && refreshToken.length <= 2048 && !params.has('code')) {
      fields.set('grant_type', 'refresh_token');
      fields.set('refresh_token', refreshToken);
    } else {
      const code = params.get('code');
      const verifier = params.get('code_verifier');
      const state = await verify(params.get('state'));
      if (!code || code.length > 2048 || !CHALLENGE_PATTERN.test(verifier) || !state) return fail(400);
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
      if (base64Url(new Uint8Array(digest)) !== state.challenge) return fail(400);
      fields.set('grant_type', 'authorization_code');
      fields.set('code', code);
      fields.set('code_verifier', verifier);
      fields.set('redirect_uri', redirectUri);
    }

    const response = await fetchRequest(GOOGLE_TOKEN, {
      method: 'POST', body: fields, redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) return fail(result.error === 'invalid_grant' ? 401 : 502);
    if (result.scope && !result.scope.split(' ').includes(SCOPE)) return fail(401);
    const access = { access_token: result.access_token, expires_in: result.expires_in };
    if (!refreshToken) access.refresh_token = result.refresh_token;
    return Response.json(access, { headers: PRIVATE_HEADERS });
  }

  return async function handle(request) {
    if (!clientId || !key || callback?.protocol !== 'https:' ||
        callback.pathname !== '/functions/v1/drive-oauth/callback') return fail(503);
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/functions\/v1\//, '/');
      if (request.method === 'GET' && path === '/drive-oauth/start') {
        const state = url.searchParams.get('state');
        const challenge = url.searchParams.get('challenge');
        if (!extensionId(state) || !CHALLENGE_PATTERN.test(challenge)) return fail(400);
        const authorize = new URL(GOOGLE_AUTH);
        authorize.search = new URLSearchParams({
          client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
          access_type: 'offline', prompt: 'consent select_account', code_challenge: challenge,
          code_challenge_method: 'S256', state: await sign(state, challenge),
        }).toString();
        return redirect(authorize);
      }
      if (request.method === 'GET' && path === '/drive-oauth/callback') {
        const proof = url.searchParams.get('state');
        const state = await verify(proof);
        if (!state) return fail(400);
        const code = url.searchParams.get('code');
        if (!url.searchParams.has('error') && (!code || code.length > 2048)) return fail(400);
        const extension = new URL('https://' + state.id + '.chromiumapp.org/google-drive');
        extension.hash = new URLSearchParams(url.searchParams.has('error')
          ? { state: proof, error: 'authorization_denied' }
          : { state: proof, code }).toString();
        return redirect(extension);
      }
      if (request.method === 'POST' && path === '/drive-oauth/token') return await token(request);
      return fail(404);
    } catch {
      return fail(502);
    }
  };
}
