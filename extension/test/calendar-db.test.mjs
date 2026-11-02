import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
let storage;
globalThis.chrome = { storage: { local: {
  async get(key) { return structuredClone({ [key]: storage[key] }); },
  async set(patch) { Object.assign(storage, structuredClone(patch)); },
  async remove(key) { delete storage[key]; },
} } };
const db = await import('../src/lib/db.js');
const input = { title: 'Independent', allDay: false, startedAt: '2026-10-20T01:00:00.000Z', endedAt: '2026-10-20T03:00:00.000Z' };
beforeEach(() => { storage = {}; });

test('calendar CRUD persists independent plans, snapshots and multiple slots per task', async () => {
  assert.equal(typeof db.listCalendarPlans, 'function');
  assert.deepEqual(await db.listCalendarPlans(), []);
  const task = await db.upsertTask({ title: 'Work', projectId: null });
  const first = await db.upsertCalendarPlan({ ...input, taskId: task.id });
  await db.upsertCalendarPlan({ ...input, taskId: task.id });
  await db.upsertTask({ ...task, title: 'Changed' });
  const updated = await db.upsertCalendarPlan({ ...first, notes: 'note' });
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.title, 'Independent');
  assert.equal((await db.listCalendarPlans()).length, 2);
});

test('deleting todos and projects preserves calendar plans and tracked work', async () => {
  const project = await db.upsertProject({ name: 'Project' });
  const task = await db.upsertTask({ title: 'Work', projectId: project.id });
  const plan = await db.upsertCalendarPlan({ ...input, projectId: project.id, taskId: task.id });
  storage.entries = [{ id: 'e', planId: plan.id, projectId: project.id, taskId: task.id }];
  storage.timer = { entryId: 'running', planId: plan.id, projectId: project.id, taskId: task.id, notes: 'Keep' };
  await db.deleteProject(project.id);
  let saved = (await db.listCalendarPlans())[0];
  assert.equal(saved.title, 'Independent');
  assert.equal(saved.taskId, null);
  assert.equal(saved.projectId, null);
  assert.equal(storage.entries[0].id, 'e');
  assert.equal(storage.timer.projectId, null);
  assert.equal(storage.timer.taskId, null);
  await db.deleteCalendarPlan(plan.id);
  assert.equal(storage.entries[0].planId, null);
  assert.equal(storage.timer.planId, null);
  assert.equal(storage.timer.notes, 'Keep');
  assert.deepEqual(await db.listCalendarPlans(), []);
  const soloTask = await db.upsertTask({ title: 'Solo' });
  const soloPlan = await db.upsertCalendarPlan({ ...input, taskId: soloTask.id });
  await db.deleteTask(soloTask.id);
  saved = (await db.listCalendarPlans()).find(p => p.id === soloPlan.id);
  assert.equal(saved.taskId, null);
});

test('backup round-trip includes plans and accepts older version 1 backups', async () => {
  const plan = await db.upsertCalendarPlan(input);
  const backup = await db.exportAll();
  assert.equal(backup.version, 1);
  assert.equal(backup.calendarPlans[0].id, plan.id);
  await db.deleteCalendarPlan(plan.id);
  await db.importAll(backup);
  assert.equal((await db.listCalendarPlans())[0].id, plan.id);
  delete backup.calendarPlans;
  await db.importAll(backup);
  assert.deepEqual(await db.listCalendarPlans(), []);
});

test('invalid backup is rejected before any collection is overwritten', async () => {
  await db.upsertCalendarPlan(input);
  const before = structuredClone(storage);
  const backup = await db.exportAll();
  backup.projects = [{ id: 'should-not-write', name: 'Replace' }];
  backup.calendarPlans.push({ ...backup.calendarPlans[0], id: 'bad', endedAt: 'invalid' });
  await assert.rejects(() => db.importAll(backup));
  assert.deepEqual(storage, before);
  backup.calendarPlans = [backup.calendarPlans[0], backup.calendarPlans[0]];
  await assert.rejects(() => db.importAll(backup));
  assert.deepEqual(storage, before);
});

test('import removes dangling associations while preserving text and time', async () => {
  await db.importAll({ version: 1, calendarPlans: [{ ...input, id: 'p', projectId: 'gone', taskId: 'gone' }], entries: [{ id: 'e', planId: 'gone', projectId: 'gone', taskId: 'gone', description: 'Keep', startedAt: input.startedAt }] });
  const plan = (await db.listCalendarPlans())[0];
  assert.equal(plan.projectId, null);
  assert.equal(plan.taskId, null);
  assert.equal(storage.entries[0].planId, null);
  assert.equal(storage.entries[0].description, 'Keep');
  assert.equal(storage.entries[0].startedAt, input.startedAt);
});
