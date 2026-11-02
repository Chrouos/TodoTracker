import assert from 'node:assert/strict';
import test from 'node:test';
const storage = {};
let external;
const event = () => ({ addListener() {} });
globalThis.chrome = {
  runtime: { onInstalled: event(), onStartup: event(), onMessageExternal: { addListener(fn) { external = fn; } } },
  alarms: { onAlarm: event() }, idle: { onStateChanged: event() },
  notifications: { onClicked: event() },
  commands: { onCommand: event() },
  storage: { onChanged: event(), local: {
    async get(key) { return structuredClone({ [key]: storage[key] }); },
    async set(patch) { Object.assign(storage, structuredClone(patch)); },
    async remove(key) { delete storage[key]; },
  } },
};
await import('../src/background.js');
const call = (type, payload, origin = 'http://localhost:3000') => new Promise(resolve => external({ type, payload }, { origin }, resolve));

test('external calendar CRUD returns snapshots and rejects invalid inputs and origins', async () => {
  assert.deepEqual((await call('getAll')).data.calendarPlans, []);
  const created = await call('upsertCalendarPlan', { title: 'Plan', allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' });
  assert.equal(created.ok, true);
  assert.equal((await call('getAll')).data.calendarPlans[0].title, 'Plan');
  assert.equal((await call('upsertCalendarPlan', { title: '' })).ok, false);
  assert.deepEqual(await call('getAll', null, 'https://example.com'), { ok: false, error: 'origin_not_allowed' });
  await call('deleteCalendarPlan', { id: created.data.id });
  assert.deepEqual((await call('getAll')).data.calendarPlans, []);
});

test('RPC forwards timer note guards without storing transport metadata', async () => {
  const first = (await call('startTimer', { notes: 'First' })).data;
  const second = (await call('startTimer', { notes: 'Second' })).data;
  await call('patchTimer', { notes: 'Late', expectedEntryId: first.entryId });
  assert.equal(storage.timer.notes, 'Second');
  await call('patchTimer', { notes: 'Saved', expectedEntryId: second.entryId });
  assert.equal(storage.timer.notes, 'Saved');
  assert.equal('expectedEntryId' in storage.timer, false);
  await call('patchTimer', { notes: 'First late saved', expectedEntryId: first.entryId, noteOwnerEntryId: first.entryId });
  assert.equal(storage.entries.find(entry => entry.id === first.entryId).notes, 'First late saved');
  assert.equal(storage.timer.notes, 'Saved');
  assert.equal('noteOwnerEntryId' in storage.timer, false);
});
