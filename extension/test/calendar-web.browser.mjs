// Start the web app on port 3014 (or set CALENDAR_WEB_URL) before running.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, eventually } from './calendar-browser-harness.mjs';

test('web note drafts stay with their owner when another interface starts a timer', async t => {
  const { page, context, storage } = await setup(t);
  await page.evaluate(async () => { const db = await import('/extension/src/lib/db.js'); await db.startTimer({ notes: 'A original', description: 'Timer A' }); });
  const firstId = storage.timer.entryId;
  await context.exposeBinding('__calendarRpc', async (_, { type, payload }) => page.evaluate(async ({ type, payload }) => {
    const db = await import('/extension/src/lib/db.js');
    if (type === 'getAll') return { projects: await db.listProjects({ includeArchived: true }), tasks: await db.listTasks(), entries: await db.listEntries(), tags: await db.listTags(), schedules: await db.listSchedules(), calendarPlans: await db.listCalendarPlans(), timer: await db.getTimer(), settings: await db.getSettings() };
    if (type === 'patchTimer') {
      const { expectedEntryId, noteOwnerEntryId, ...patch } = payload;
      return noteOwnerEntryId !== undefined ? db.saveTimerNotes({ entryId: noteOwnerEntryId, notes: patch.notes }) : db.patchTimer(patch, { expectedEntryId });
    }
    return db[type](payload);
  }, { type, payload }));
  await context.addInitScript(() => {
    window.chrome.runtime.sendMessage = (_id, message, callback) => window.__calendarRpc(message).then(data => callback({ ok: true, data })).catch(error => callback({ ok: false, error: error.message }));
  });
  const web = await context.newPage();
  const errors = [];
  web.on('pageerror', error => errors.push(error.message));
  await web.goto(process.env.CALENDAR_WEB_URL || 'http://localhost:3014');
  const notes = web.locator('.timer-panel textarea');
  await notes.waitFor({ state: 'visible' });
  await notes.fill('A late notes');
  await page.evaluate(async () => { const db = await import('/extension/src/lib/db.js'); await db.startTimer({ notes: 'B original', description: 'Timer B' }); });
  const secondId = storage.timer.entryId;
  await web.evaluate(() => window.dispatchEvent(new Event('focus')));
  await web.locator('.timer-panel input[placeholder="在做什麼？"]').waitFor();
  await web.waitForTimeout(750);
  await notes.press('End'); await notes.pressSequentially(' extra');
  await web.waitForTimeout(750);
  assert.notEqual(storage.timer.notes, 'A late notes extra');
  await web.locator('.timer-panel > button').click();
  await eventually(() => !storage.timer);
  assert.notEqual(storage.entries.find(entry => entry.id === secondId).notes, 'A late notes extra');
  assert.match(storage.entries.find(entry => entry.id === firstId).notes, /^A late notes/);
  assert.deepEqual(errors, []);
});
