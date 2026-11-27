import assert from 'node:assert/strict';
import test from 'node:test';

// Every read and write yields, so unlocked read-modify-write cycles would overlap.
const storage = {};
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
globalThis.chrome = {
  storage: {
    local: {
      async get(key) { await tick(); return { [key]: structuredClone(storage[key]) }; },
      async set(patch) { await tick(); Object.assign(storage, structuredClone(patch)); },
      async remove(key) { await tick(); delete storage[key]; },
    },
  },
};

// Node versions without Web Locks need a shared lock across the simulated pages.
if (!globalThis.navigator?.locks) {
  const queues = new Map();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request(name, operation) {
          const result = (queues.get(name) ?? Promise.resolve()).then(operation);
          queues.set(name, result.catch(() => {}));
          return result;
        },
      },
    },
  });
}

// Separate module instances stand in for the popup, the options page and the service worker.
const popup = await import('../src/lib/db.js?instance=popup');
const worker = await import('../src/lib/db.js?instance=worker');
const entry = (id) => ({ id, startedAt: '2026-11-02T00:00:00.000Z', endedAt: '2026-11-02T01:00:00.000Z' });

test('writes from different pages all survive', async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? popup : worker).upsertTask({ id: `t${i}`, title: `Todo ${i}` })));
  assert.equal((await popup.listTasks()).length, 10);
});

test('writes to the same list from one page all survive', async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => popup.upsertEntry(entry(`e${i}`))));
  assert.equal((await popup.listEntries()).length, 10);
});

test('operations that call each other do not deadlock', async () => {
  const timer = await popup.startTimer({ description: 'first' });
  await popup.startTimer({ description: 'second', taskId: null }); // stops the first through the same lock
  assert.ok((await popup.listEntries()).some((item) => item.id === timer.entryId));
  await popup.stopTimer();
});

test('stopping twice at once records one entry', async () => {
  const timer = await popup.startTimer({ description: 'once' });
  const results = await Promise.all([popup.stopTimer(), worker.stopTimer()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await popup.listEntries()).filter((item) => item.id === timer.entryId).length, 1);
});

test('a failed write reports its error and releases the lock', async () => {
  await assert.rejects(popup.importAll({ version: 2 }));
  await popup.upsertTag({ id: 'after-failure', name: 'still works' });
  assert.ok((await popup.listTags()).some((tag) => tag.id === 'after-failure'));
});

test('without Web Locks, one page still queues its own writes', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    const page = await import('../src/lib/db.js?instance=no-locks');
    storage.schedules = [];
    await Promise.all(Array.from({ length: 5 }, (_, i) => page.upsertSchedule({ id: `s${i}`, title: `S${i}`, weekdays: [1], createTime: '09:00' })));
    assert.equal((await page.listSchedules()).length, 5);
    await assert.rejects(page.importAll({ version: 2 }));
    await page.upsertTag({ id: 'queue-alive', name: 'queue alive' });
    assert.ok((await page.listTags()).some((tag) => tag.id === 'queue-alive'));
  } finally {
    Object.defineProperty(globalThis, 'navigator', original);
  }
});
