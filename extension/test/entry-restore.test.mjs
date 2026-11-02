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

const entry = await db.upsertEntry({
  description: 'Undo test',
  startedAt: '2026-10-20T00:00:00.000Z',
  endedAt: '2026-10-20T01:00:00.000Z',
});

await db.deleteEntry(entry.id);
assert.deepEqual(await db.listEntries(), []);

await db.restoreEntry(entry.id);
const [restored] = await db.listEntries();
assert.equal(restored.id, entry.id);
assert.equal(restored.deletedAt, null);
assert.equal(restored.description, 'Undo test');
