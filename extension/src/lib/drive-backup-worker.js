import * as db from './db.js';
import { createBackupService, createDriveClient } from './drive-backup.js';
import { createDriveOAuth } from './drive-oauth.js';
import { driveOAuthEndpoint } from './drive-oauth-config.js';

const STATE_KEY = 'driveBackupState';
const CREDENTIAL_KEY = 'driveBackupOAuth';
const ALARM = 'tt-drive-backup';
const ACTIONS = new Set(['status', 'connect', 'disconnect', 'backup', 'list', 'download']);
const ERRORS = new Set(['authorizationRequired', 'invalidBackup', 'backupFailed', 'setupRequired']);

const readState = async () => (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] ?? {};
// Create this lazily so loading the background module has no OAuth side effects.
let webOAuth;
function getWebOAuth() {
  webOAuth ??= createDriveOAuth({
    endpoint: driveOAuthEndpoint,
    identity: chrome.identity,
    extensionId: chrome.runtime.id,
  });
  return webOAuth;
}

const nativeConfigured = () => chrome.runtime.getManifest().oauth2?.client_id?.endsWith('.apps.googleusercontent.com');
const configured = () => getWebOAuth().configured || Boolean(nativeConfigured());

async function getNativeToken(interactive) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (result.token) return result.token;
  } catch {
    // Chrome can require renewed consent or a signed-in browser profile.
  }
  throw new Error('authorizationRequired');
}

let cachedNativeToken;
const service = createBackupService({
  readState,
  writeState(state, credential) {
    const changes = { [STATE_KEY]: state };
    if (credential !== undefined) changes[CREDENTIAL_KEY] = credential;
    return chrome.storage.local.set(changes);
  },
  async authorize(interactive) {
    if (!configured()) throw new Error('setupRequired');
    const oauth = getWebOAuth();
    const credential = interactive && oauth.configured
      ? await oauth.connect()
      : (await chrome.storage.local.get(CREDENTIAL_KEY))[CREDENTIAL_KEY];
    const getToken = async (prompt) => {
      if (credential) return oauth.getToken(credential);
      cachedNativeToken = await getNativeToken(prompt);
      return cachedNativeToken;
    };
    let token = await getToken(interactive);
    let accountChecked = false;
    const drive = createDriveClient({
      getToken: async () => {
        if (token) return token;
        // Revalidate the account on the next operation before sending backup data.
        if (accountChecked) throw new Error('authorizationRequired');
        token = await getToken(false);
        return token;
      },
      async invalidateToken(invalidToken) {
        token = null;
        if (credential) {
          oauth.invalidateToken(invalidToken);
        } else {
          cachedNativeToken = null;
          await chrome.identity.removeCachedAuthToken({ token: invalidToken });
        }
      },
    });
    return {
      ...drive,
      credential,
      async account() {
        const user = await drive.account();
        accountChecked = true;
        return user;
      },
    };
  },
  async forgetAuthorization() {
    getWebOAuth().clear();
    if (!cachedNativeToken && nativeConfigured()) {
      try { cachedNativeToken = await getNativeToken(false); } catch { return; }
    }
    if (cachedNativeToken) await chrome.identity.removeCachedAuthToken({ token: cachedNativeToken });
    cachedNativeToken = null;
  },
  exportAll: db.exportAll,
  markBackedUp: db.markBackedUp,
});

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 60 });
  }
}

function automaticBackup() {
  return service.run('automatic').catch(() => {});
}

export function registerDriveBackup() {
  chrome.runtime.onInstalled.addListener(ensureAlarm);
  chrome.runtime.onStartup.addListener(async () => {
    await ensureAlarm();
    await automaticBackup();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) automaticBackup();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'drive-backup' || sender.url !== chrome.runtime.getURL('src/options/options.html')) return;
    if (!ACTIONS.has(message.action)) return;
    service.run(message.action, message.id).then(async (value) => {
      if (message.action === 'connect') await ensureAlarm();
      respond({ ok: true, value: message.action === 'status' ? { ...value, configured: configured() } : value });
    }).catch((error) => respond({
      ok: false,
      error: ERRORS.has(error.message) ? error.message : 'backupFailed',
    }));
    return true;
  });
}
