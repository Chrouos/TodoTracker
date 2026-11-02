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
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

assert.equal(await db.setTimerStart(ago(5)), null, 'nothing to correct without a running timer');

const started = await db.startTimer({ description: 'Forgot to start' });

const earlier = ago(30);
const moved = await db.setTimerStart(earlier);
assert.equal(moved.startedAt, earlier);
assert.equal(moved.entryId, started.entryId);

assert.equal(await db.setTimerStart(new Date(Date.now() + 60000).toISOString()), null, 'future starts are refused');
assert.equal(await db.setTimerStart('not a date'), null, 'invalid dates are refused');
assert.equal((await db.getTimer()).startedAt, earlier);

// 閒置點還在計時範圍內就繼續問，已經落在新的開始之前就不用問
await db.patchTimer({ idleSince: ago(20) });
assert.ok((await db.setTimerStart(ago(25))).idleSince);
assert.equal((await db.setTimerStart(ago(10))).idleSince, null);
