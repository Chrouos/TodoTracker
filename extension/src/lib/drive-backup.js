const FILE_MARKER = 'todotracker-json-v1';
const RETENTION = 7;
const DRIVE_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

export function createDriveClient({ getToken, invalidateToken, fetchRequest = fetch }) {
  async function fetchDrive(url, init = {}) {
    const send = (token) => fetchRequest(url, {
      ...init,
      headers: { ...init.headers, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(25000),
    });
    let token = await getToken();
    let response = await send(token);
    if (response.status === 401) {
      await invalidateToken(token);
      token = await getToken();
      response = await send(token);
      if (response.status === 401) {
        await invalidateToken(token);
        throw new Error('authorizationRequired');
      }
    }
    if (!response.ok) throw new Error('driveRequestFailed');
    return response;
  }

  const request = async (url, init) => (await fetchDrive(url, init)).json();

  return {
    async account() {
      const { user } = await request(DRIVE_URL + '/about?fields=user(permissionId,emailAddress)');
      if (!user?.permissionId) throw new Error('authorizationRequired');
      return user;
    },
    async list() {
      const files = [];
      const params = new URLSearchParams({
        q: "trashed = false and appProperties has { key='todotrackerBackup' and value='" + FILE_MARKER + "' }",
        fields: 'nextPageToken,files(id,name,createdTime)',
        orderBy: 'createdTime desc',
        spaces: 'drive',
        pageSize: '100',
      });
      do {
        const page = await request(DRIVE_URL + '/files?' + params);
        files.push(...(page.files ?? []));
        if (!page.nextPageToken) break;
        params.set('pageToken', page.nextPageToken);
      } while (true);
      return files;
    },
    async create(snapshot) {
      const metadata = {
        name: 'TodoTracker-' + snapshot.exportedAt.replaceAll(':', '-') + '.json',
        mimeType: 'application/json',
        appProperties: { todotrackerBackup: FILE_MARKER },
      };
      const json = JSON.stringify(snapshot);
      if (new Blob([json]).size > 5_000_000) {
        const session = await fetchDrive(UPLOAD_URL + '/files?uploadType=resumable&fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/json' },
          body: JSON.stringify(metadata),
        });
        const location = session.headers.get('Location');
        if (!location || new URL(location).origin !== new URL(UPLOAD_URL).origin) {
          throw new Error('driveRequestFailed');
        }
        return request(location, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
      }
      const boundary = 'todotracker-' + crypto.randomUUID();
      const body = [
        '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
        '--' + boundary, 'Content-Type: application/json', '', json,
        '--' + boundary + '--', '',
      ].join('\r\n');
      return request(UPLOAD_URL + '/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body,
      });
    },
    trash(id) {
      return request(DRIVE_URL + '/files/' + encodeURIComponent(id) + '?fields=id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    },
    download(id) {
      return request(DRIVE_URL + '/files/' + encodeURIComponent(id) + '?alt=media');
    },
  };
}

async function snapshotHash(snapshot) {
  const { exportedAt, ...content } = snapshot;
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createBackupService({ readState, writeState, authorize, forgetAuthorization, exportAll, markBackedUp }) {
  let queue = Promise.resolve();

  async function run(action, id) {
    const state = await readState();
    if (action === 'status') return state;
    if (action === 'disconnect') {
      const disconnected = { enabled: false };
      await writeState(disconnected, null);
      await forgetAuthorization();
      return disconnected;
    }
    if (action === 'connect') {
      const drive = await authorize(true);
      const user = await drive.account();
      const previous = user.permissionId === state.accountId ? state : {};
      const connected = { ...previous, enabled: true, accountId: user.permissionId, email: user.emailAddress, error: null };
      await writeState(connected, drive.credential ?? null);
      return connected;
    }
    if (!state.enabled) {
      if (action === 'automatic') return state;
      throw new Error('authorizationRequired');
    }

    const isBackup = action === 'automatic' || action === 'backup';
    try {
      const snapshot = isBackup ? await exportAll() : null;
      const hash = snapshot ? await snapshotHash(snapshot) : null;
      const empty = snapshot && !Object.values(snapshot).some((value) => Array.isArray(value) && value.length);
      const unchanged = hash === state.hash;
      if (action === 'automatic' && !state.prunePending &&
          ((empty && !state.hash) || (unchanged && !state.error))) return state;

      const drive = await authorize(false);
      const user = await drive.account();
      if (user.permissionId !== state.accountId) throw new Error('authorizationRequired');
      if (action === 'list') return drive.list();
      if (action === 'download') {
        if (!(await drive.list()).some((file) => file.id === id)) throw new Error('invalidBackup');
        return drive.download(id);
      }

      if (!unchanged || action === 'backup') {
        await drive.create(snapshot);
        state.hash = hash;
        state.lastBackupAt = snapshot.exportedAt;
        state.prunePending = true;
        await writeState(state);
        await markBackedUp();
      }
      if (state.prunePending) {
        const files = await drive.list();
        for (const file of files.slice(RETENTION)) await drive.trash(file.id);
        state.prunePending = false;
      }
      state.error = null;
      await writeState(state);
      return state;
    } catch (error) {
      if (isBackup) {
        state.error = error.message === 'authorizationRequired' ? 'authorizationRequired' : 'backupFailed';
        await writeState(state);
      }
      throw error;
    }
  }

  return {
    run(action, id) {
      const result = queue.then(() => run(action, id));
      queue = result.catch(() => {});
      return result;
    },
  };
}
