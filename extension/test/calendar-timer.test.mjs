import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
let storage;
globalThis.chrome = { storage: { local: {
  async get(key) { return structuredClone({ [key]: storage[key] }); },
  async set(patch) { Object.assign(storage, structuredClone(patch)); },
  async remove(key) { delete storage[key]; },
} } };
const db = await import('../src/lib/db.js');
let plan;
beforeEach(async () => {
  storage = {};
  plan = await db.upsertCalendarPlan({ title: 'Plan', allDay: false, startedAt: '2026-10-20T01:00:00Z', endedAt: '2026-10-20T03:00:00Z' });
});

test('planned timer saves its source on every stop and entry edit', async () => {
  await db.startTimer({ planId: plan.id, description: 'Work' });
  assert.equal((await db.getTimer()).planId, plan.id);
  await db.patchTimer({ notes: 'Notes' });
  const entry = await db.stopTimer();
  assert.equal(entry.planId, plan.id);
  assert.equal((await db.upsertEntry({ ...entry, planId: undefined, description: 'Edit' })).planId, plan.id);
  assert.equal((await db.upsertEntry({ ...entry, planId: null })).planId, null);
  await db.startTimer({ planId: plan.id });
  await db.stopTimer();
  assert.equal((await db.listEntries()).length, 2);
  assert.equal((await db.listCalendarPlans())[0].startedAt, plan.startedAt);
});

test('changing timer work detaches its plan but changing notes does not', async () => {
  await db.startTimer({ planId: plan.id });
  await db.patchTimer({ description: 'Other description', notes: 'Keep', tagIds: ['tag'] });
  assert.equal((await db.getTimer()).planId, plan.id);
  await db.patchTimer({ projectId: 'different' });
  assert.equal((await db.getTimer()).planId, null);
  await db.startTimer({ planId: plan.id });
  await db.patchTimer({ taskId: 'different' });
  assert.equal((await db.getTimer()).planId, null);
  await db.startTimer();
  assert.equal((await db.getTimer()).planId, null);
});

test('late notes from a previous timer cannot overwrite the new timer', async () => {
  const first = await db.startTimer({ notes: 'First', planId: plan.id });
  const second = await db.startTimer({ notes: 'Second' });
  await db.patchTimer({ notes: 'Late first' }, { expectedEntryId: first.entryId });
  assert.equal((await db.getTimer()).notes, 'Second');
  await db.patchTimer({ notes: 'Second saved' }, { expectedEntryId: second.entryId });
  assert.equal((await db.getTimer()).notes, 'Second saved');
  assert.equal(storage.entries[0].notes, 'First');
});

test('source links survive idle handling, rounding and task completion', async () => {
  const task = await db.upsertTask({ title: 'Task' });
  plan = await db.upsertCalendarPlan({ ...plan, taskId: task.id });
  await db.saveSettings({ roundToMin: 15 });
  const timer = await db.startTimer({ taskId: task.id, planId: plan.id });
  await db.patchTimer({ idleSince: timer.startedAt });
  await db.resolveIdleTimer(0);
  const entry = await db.stopTimer(null, 0, { completeTask: true });
  assert.equal(entry.planId, plan.id);
  assert.equal((await db.listTasks())[0].status, 'done');
  assert.equal(db.durationSec(entry), 900);
});

test('saving an owned note after a timer switch preserves both the old record and new timer', async () => {
  const first = await db.startTimer({ notes: 'A original' });
  const second = await db.startTimer({ notes: 'B original' });
  assert.equal(typeof db.saveTimerNotes, 'function');
  await db.saveTimerNotes({ entryId: first.entryId, notes: 'A late notes' });
  assert.equal((await db.getTimer()).entryId, second.entryId);
  assert.equal((await db.getTimer()).notes, 'B original');
  assert.equal((await db.listEntries()).find(e => e.id === first.entryId).notes, 'A late notes');
  await db.saveTimerNotes({ entryId: second.entryId, notes: 'B saved' });
  assert.equal((await db.getTimer()).notes, 'B saved');
});
