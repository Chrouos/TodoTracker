import assert from 'node:assert/strict';

const storage = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: storage[key] };
      },
      async set(patch) {
        Object.assign(storage, patch);
      },
      async remove(key) {
        delete storage[key];
      },
    },
  },
};

const db = await import('../src/lib/db.js');

assert.equal(typeof db.resolveIdleTimer, 'function');

await db.startTimer({
  projectId: 'project-idle',
  taskId: 'task-idle',
  description: 'Idle timer test',
});

const now = Date.now();
const originalStart = new Date(now - 60 * 60 * 1000).toISOString();
const idleSince = new Date(now - 10 * 60 * 1000).toISOString();

await db.patchTimer({ startedAt: originalStart, idleSince });
const kept = await db.resolveIdleTimer(0);

assert.ok(await db.getTimer());
assert.equal(kept.startedAt, originalStart);
assert.equal(kept.idleSince, null);
assert.deepEqual(await db.listEntries(), []);

await db.patchTimer({ startedAt: originalStart, idleSince });
const discarded = await db.resolveIdleTimer(5 * 60);

assert.ok(await db.getTimer());
assert.equal(
  new Date(discarded.startedAt).getTime(),
  new Date(originalStart).getTime() + 5 * 60 * 1000,
);
assert.equal(discarded.idleSince, null);
assert.deepEqual(await db.listEntries(), []);

console.log('idle timer tests passed');
