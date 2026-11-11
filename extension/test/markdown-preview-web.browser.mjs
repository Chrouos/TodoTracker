// Start the web app on port 3000 (or set CALENDAR_WEB_URL) before running.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setup } from './calendar-browser-harness.mjs';

test('web notes: click outside previews, kept-focus buttons keep editing, Ctrl+E toggles', async t => {
  const { page, context } = await setup(t);
  await page.evaluate(async () => { const db = await import('/extension/src/lib/db.js'); await db.startTimer({ notes: '', description: 'Timer' }); });
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
  await web.goto(process.env.CALENDAR_WEB_URL || 'http://localhost:3000');

  const notes = web.locator('.timer-panel .markdown-text-editor textarea');
  const preview = web.locator('.timer-panel .markdown-text-preview');
  const description = web.locator('.timer-panel input[placeholder="在做什麼？"]');
  await notes.waitFor({ state: 'visible' });

  await notes.click();
  await description.click();
  assert.equal(await notes.isVisible(), true, 'empty notes keep their placeholder');

  await notes.fill('**web** notes');
  await web.locator('.timer-panel .livelog-head button').click();
  assert.equal(await notes.isVisible(), true, 'a button that keeps focus in the editor is still editing');
  assert.match(await notes.inputValue(), /\*\*web\*\* notes/);

  await description.click();
  await preview.waitFor();
  assert.equal(await notes.isVisible(), false);
  assert.equal(await preview.locator('strong').textContent(), 'web');
  assert.equal(await web.evaluate(() => document.activeElement?.tagName), 'INPUT', 'the clicked field keeps focus');

  await preview.locator('strong').click();
  await notes.waitFor({ state: 'visible' });
  await web.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');

  await web.keyboard.press('Control+e');
  await preview.waitFor();
  await web.waitForFunction(() => document.activeElement?.classList.contains('markdown-text-preview'));
  await web.keyboard.press('Control+e');
  await notes.waitFor({ state: 'visible' });
  await web.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
  assert.deepEqual(errors, []);
});
