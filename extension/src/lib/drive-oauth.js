function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function createDriveOAuth({ endpoint, identity, extensionId, fetchRequest = fetch }) {
  const configured = Boolean(endpoint && identity?.launchWebAuthFlow && identity?.getRedirectURL);
  let cached;

  async function requestToken(fields) {
    const response = await fetchRequest(endpoint + '/token', {
      method: 'POST',
      body: new URLSearchParams(fields),
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) throw new Error('authorizationRequired');
    if (!response.ok) throw new Error('backupFailed');
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !token.access_token ||
        !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
      throw new Error('backupFailed');
    }
    return token;
  }

  function cacheToken(credential, token) {
    cached = {
      credential,
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
  }

  return {
    configured,
    async connect() {
      const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = base64Url(new Uint8Array(digest));
      const state = extensionId + '.' + base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const expectedRedirect = new URL(identity.getRedirectURL('google-drive'));
      const start = new URL(endpoint + '/start');
      start.search = new URLSearchParams({ state, challenge }).toString();
      let redirect;
      try {
        redirect = new URL(await identity.launchWebAuthFlow({ interactive: true, url: start.href }));
      } catch {
        throw new Error('authorizationRequired');
      }
      const result = new URLSearchParams(redirect.hash.slice(1));
      const proof = result.get('state');
      const code = result.get('code');
      if (redirect.origin !== expectedRedirect.origin || redirect.pathname !== expectedRedirect.pathname ||
          !proof?.startsWith(state + '.') || !code || result.has('error')) {
        throw new Error('authorizationRequired');
      }
      const token = await requestToken({ code, state: proof, code_verifier: verifier });
      if (typeof token.refresh_token !== 'string' || !token.refresh_token) {
        throw new Error('authorizationRequired');
      }
      const credential = { endpoint, refreshToken: token.refresh_token };
      cacheToken(credential, token);
      return credential;
    },
    async getToken(credential) {
      if (!configured || credential.endpoint !== endpoint || !credential.refreshToken) {
        throw new Error('authorizationRequired');
      }
      if (cached?.credential.refreshToken === credential.refreshToken && cached.expiresAt > Date.now() + 60000) {
        return cached.accessToken;
      }
      const token = await requestToken({ refresh_token: credential.refreshToken });
      cacheToken(credential, token);
      return token.access_token;
    },
    invalidateToken(token) {
      if (cached?.accessToken === token) cached = undefined;
    },
    clear() {
      cached = undefined;
    },
  };
}
