import assert from 'node:assert/strict';
import test from 'node:test';
import { createDriveOAuth } from './drive-oauth.js';
import { createDriveOAuthHandler } from '../../../supabase/functions/drive-oauth/handler.js';

const extensionId = 'lpjffffopipgkkodjjljkhnfdpppbgml';
const endpoint = 'https://example.supabase.co/functions/v1/drive-oauth';
const redirectUri = endpoint + '/callback';
const extensionRedirect = 'https://' + extensionId + '.chromiumapp.org/google-drive';
const scope = 'https://www.googleapis.com/auth/drive.file';

function fixture() {
  const googleRequests = [];
  const handler = createDriveOAuthHandler({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri,
    extensionIds: extensionId,
    async fetchRequest(url, { body }) {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      googleRequests.push(body);
      if (body.get('refresh_token') === 'revoked') {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      const refresh = body.get('grant_type') === 'refresh_token';
      return Response.json({
        access_token: refresh ? 'updated-access' : 'first-access',
        expires_in: 3600,
        scope,
        ...(refresh ? {} : { refresh_token: 'drive-refresh' }),
      });
    },
  });
  const fetchRequest = (url, init) => handler(new Request(url, init));
  const identity = {
    getRedirectURL: () => extensionRedirect,
    async launchWebAuthFlow({ url, interactive }) {
      assert.equal(interactive, true);
      const start = await fetchRequest(url);
      assert.equal(start.status, 302);
      const authorization = new URL(start.headers.get('Location'));
      assert.equal(authorization.origin, 'https://accounts.google.com');
      assert.equal(authorization.searchParams.get('scope'), scope);
      assert.equal(authorization.searchParams.get('access_type'), 'offline');
      assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({
        state: authorization.searchParams.get('state'), code: 'google-code',
      });
      const result = await fetchRequest(callback);
      assert.equal(result.status, 302);
      const redirect = new URL(result.headers.get('Location'));
      assert.equal(redirect.search, '');
      return redirect.href;
    },
  };
  return { googleRequests, fetchRequest, identity };
}

test('the extension exchanges a bound code, then refreshes without opening Google sign-in again', async () => {
  const { googleRequests, fetchRequest, identity } = fixture();
  const oauth = createDriveOAuth({ endpoint, identity, extensionId, fetchRequest });
  const credential = await oauth.connect();
  assert.deepEqual(credential, { endpoint, refreshToken: 'drive-refresh' });
  assert.equal(await oauth.getToken(credential), 'first-access');
  assert.equal(googleRequests[0].get('code'), 'google-code');
  assert.equal(googleRequests[0].get('client_secret'), 'test-secret');
  assert.equal(googleRequests[0].get('redirect_uri'), redirectUri);
  assert.equal(googleRequests.length, 1);

  const restarted = createDriveOAuth({ endpoint, identity, extensionId, fetchRequest });
  assert.equal(await restarted.getToken(credential), 'updated-access');
  assert.equal(googleRequests[1].get('refresh_token'), 'drive-refresh');
  await assert.rejects(restarted.getToken({ ...credential, refreshToken: 'revoked' }), /authorizationRequired/);
});

test('the relay rejects a different extension, an altered state and the wrong code verifier', async () => {
  const { googleRequests, fetchRequest } = fixture();
  const start = new URL(endpoint + '/start');
  start.searchParams.set('state', 'a'.repeat(32) + '.' + 'B'.repeat(43));
  start.searchParams.set('challenge', 'C'.repeat(43));
  assert.equal((await fetchRequest(start)).status, 400);

  start.searchParams.set('state', extensionId + '.' + 'B'.repeat(43));
  const response = await fetchRequest(start);
  const state = new URL(response.headers.get('Location')).searchParams.get('state');
  const altered = new URL(redirectUri);
  altered.search = new URLSearchParams({ code: 'code', state: state.replace('.CCC', '.DCC') });
  assert.equal((await fetchRequest(altered)).status, 400);
  const token = await fetchRequest(endpoint + '/token', {
    method: 'POST', body: new URLSearchParams({ code: 'code', state, code_verifier: 'X'.repeat(43) }),
  });
  assert.equal(token.status, 400);
  assert.equal(googleRequests.length, 0);
});

test('an OAuth response from another browser flow cannot exchange a code', async () => {
  const { identity, fetchRequest, googleRequests } = fixture();
  const launch = identity.launchWebAuthFlow;
  identity.launchWebAuthFlow = async (details) => {
    const result = new URL(await launch(details));
    return result.href.replace('#state=' + extensionId, '#state=' + 'a'.repeat(32));
  };
  const oauth = createDriveOAuth({ endpoint, identity, extensionId, fetchRequest });
  await assert.rejects(oauth.connect(), /authorizationRequired/);
  assert.equal(googleRequests.length, 0);
});
