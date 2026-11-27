import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupService, createDriveClient } from './drive-backup.js';

function fixture() {
  let state = {};
  let title = 'First task';
  let count = 0;
  const files = [];
  const drive = {
    async account() { return { permissionId: 'account' }; },
    async create(snapshot) {
      const id = String(++count);
      files.unshift({ id, name: 'TodoTracker.json', createdTime: snapshot.exportedAt });
      return { id };
    },
    async list() { return [...files]; },
    async trash(id) { files.splice(files.findIndex((file) => file.id === id), 1); },
    async download() { return { version: 1, tasks: [] }; },
  };
  const service = createBackupService({
    readState: async () => state,
    writeState: async (value) => { state = value; },
    authorize: async () => drive,
    forgetAuthorization: async () => {},
    exportAll: async () => ({
      version: 1, exportedAt: new Date().toISOString(), tasks: title ? [{ title }] : [],
    }),
    markBackedUp: async () => {},
  });
  return { service, drive, files, change: (value) => { title = value; } };
}

test('automatic backups require authorization and keep seven changed snapshots', async () => {
  const { service, files, change } = fixture();
  await service.run('automatic');
  assert.equal(files.length, 0);
  await service.run('connect');
  await Promise.all([service.run('automatic'), service.run('automatic')]);
  assert.equal(files.length, 1);
  for (let i = 0; i < 8; i++) {
    change(String(i));
    await service.run('automatic');
  }
  assert.equal(files.length, 7);
  assert.equal(files[0].id, '9');
  assert.equal(files.at(-1).id, '3');
});

test('failed upload keeps the prior success and retries on the next run', async () => {
  const { service, drive, files, change } = fixture();
  await service.run('connect');
  await service.run('automatic');
  const before = await service.run('status');
  change('Second task');
  const create = drive.create;
  drive.create = async () => { throw new Error('offline'); };
  await assert.rejects(service.run('automatic'), /offline/);
  assert.equal((await service.run('status')).lastBackupAt, before.lastBackupAt);
  assert.equal((await service.run('status')).error, 'backupFailed');
  drive.create = create;
  await service.run('automatic');
  assert.equal(files.length, 2);
  assert.equal((await service.run('status')).error, null);
});

test('a fresh device can list and restore without uploading an empty automatic snapshot', async () => {
  const { service, files, change } = fixture();
  change(null);
  await service.run('connect');
  await service.run('automatic');
  assert.equal(files.length, 0);
  await service.run('backup');
  const history = await service.run('list');
  assert.equal(history.length, 1);
  assert.equal((await service.run('download', history[0].id)).version, 1);
  await assert.rejects(service.run('download', 'other'), /invalidBackup/);
  await service.run('disconnect');
  assert.equal((await service.run('status')).enabled, false);
});

test('Drive client paginates managed files and retries a rejected cached token', async () => {
  const requests = [];
  const invalidated = [];
  const client = createDriveClient({
    getToken: async () => invalidated.length ? 'fresh' : 'expired',
    invalidateToken: async (token) => invalidated.push(token),
    fetchRequest: async (url, init) => {
      requests.push([new URL(url), init]);
      if (init.headers.Authorization === 'Bearer expired') return new Response(null, { status: 401 });
      return Response.json(new URL(url).searchParams.has('pageToken')
        ? { files: [{ id: '2' }] }
        : { nextPageToken: 'next', files: [{ id: '1' }] });
    },
  });
  assert.deepEqual(await client.list(), [{ id: '1' }, { id: '2' }]);
  assert.deepEqual(invalidated, ['expired']);
  assert.match(requests[0][0].searchParams.get('q'), /appProperties/);
  assert.equal(requests[2][0].searchParams.get('pageToken'), 'next');
});

test('automatic backup never sends data to a different Google account', async () => {
  const { service, drive, files } = fixture();
  await service.run('connect');
  drive.account = async () => ({ permissionId: 'other-account' });
  await assert.rejects(service.run('automatic'), /authorizationRequired/);
  assert.equal(files.length, 0);
  assert.equal((await service.run('status')).error, 'authorizationRequired');
});

test('the OAuth credential is saved only with a confirmed Drive account and cleared on disconnect', async () => {
  const writes = [];
  const credential = { refreshToken: 'local-only' };
  let state = {};
  let account = {};
  const service = createBackupService({
    readState: async () => state,
    async writeState(next, authorization) {
      writes.push({ state: next, credential: authorization });
      state = next;
    },
    async authorize() {
      return {
        credential,
        async account() {
          if (!account.permissionId) throw new Error('authorizationRequired');
          return account;
        },
      };
    },
    forgetAuthorization: async () => {},
  });

  await assert.rejects(service.run('connect'), /authorizationRequired/);
  assert.equal(writes.length, 0);
  account = { permissionId: 'confirmed-account' };
  await service.run('connect');
  assert.equal(writes[0].credential, credential);
  assert.equal((await service.run('status')).accountId, account.permissionId);
  assert.equal((await service.run('status')).credential, undefined);
  await service.run('disconnect');
  assert.equal(writes[1].credential, null);
});

test('Drive client uses an upload session for large snapshots', async () => {
  const requests = [];
  const client = createDriveClient({
    getToken: async () => 'token',
    invalidateToken: async () => {},
    fetchRequest: async (url, init) => {
      requests.push([new URL(url), init]);
      if (init.method === 'POST') return new Response(null, {
        headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' },
      });
      return Response.json({ id: 'large' });
    },
  });
  const snapshot = { version: 1, exportedAt: '2026-11-20T00:00:00.000Z', entries: ['x'.repeat(5_000_000)] };
  assert.deepEqual(await client.create(snapshot), { id: 'large' });
  assert.equal(requests[0][0].searchParams.get('uploadType'), 'resumable');
  assert.equal(requests[1][1].method, 'PUT');
  assert.equal(requests[1][1].body, JSON.stringify(snapshot));
});

test('Drive requests renewed consent when both tokens are rejected', async () => {
  const invalidated = [];
  const drive = createDriveClient({
    getToken: async () => invalidated.length ? 'fresh' : 'expired',
    invalidateToken: async (token) => invalidated.push(token),
    fetchRequest: async () => new Response(null, { status: 401 }),
  });
  await assert.rejects(drive.account(), /authorizationRequired/);
  assert.deepEqual(invalidated, ['expired', 'fresh']);
});
