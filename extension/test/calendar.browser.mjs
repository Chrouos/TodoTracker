import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setup, eventually, root } from './calendar-browser-harness.mjs';

test('calendar views navigate, filter and show real versus planned work', async t => {
  const { page, errors } = await setup(t);
  await page.locator('[data-cal-view="day"]').click();
  assert.match(await page.locator('#p-calendar').innerText(), /日曆介面設計/);
  assert.match(await page.locator('#p-calendar').innerText(), /製作日曆原型/);
  await page.locator('[data-cal-view="month"]').click();
  assert.equal(await page.locator('.cal-month-week').count(), 5);
  await page.locator('[data-cal-view="agenda"]').click();
  assert.equal(await page.locator('.cal-agenda-day').count(), 7);
  await page.locator('[data-cal-project]').selectOption('none');
  assert.equal(await page.locator('[data-cal-plan]').count(), 0);
  assert.deepEqual(errors, []);
});

test('plan editor saves standalone all-day work and preserves drafts across refresh and failure', async t => {
  const { page, storage, publish, fail, errors } = await setup(t);
  await page.locator('[data-cal-new]').click();
  const dialog = page.locator('[data-cal-dialog]');
  await dialog.locator('[name="title"]').fill('獨立安排');
  await dialog.locator('[name="allDay"]').check();
  await dialog.locator('[name="startDate"]').fill('2026-10-20');
  await dialog.locator('[name="endDate"]').fill('2026-10-21');
  await publish({ entries: { newValue: storage.entries } });
  await page.waitForTimeout(150);
  assert.equal(await dialog.locator('[name="title"]').inputValue(), '獨立安排');
  fail();
  await dialog.locator('[data-cal-save]').click();
  await dialog.locator('[data-cal-form-error]').filter({ hasText: '儲存失敗' }).waitFor();
  assert.equal(await dialog.isVisible(), true);
  assert.match(await dialog.locator('[data-cal-form-error]').innerText(), /儲存失敗/);
  await dialog.locator('[data-cal-save]').click();
  await dialog.waitFor({ state: 'hidden' });
  const created = storage.calendarPlans.find(p => p.title === '獨立安排');
  assert.equal(created.endDate, '2026-10-22');
  assert.equal(created.taskId, null);
  await page.locator('[data-cal-view="day"]').click();
  await page.locator('[data-cal-plan="plan"]').click();
  await dialog.locator('[name="taskId"]').selectOption('task');
  assert.equal(await dialog.locator('[name="projectId"]').inputValue(), 'project');
  await dialog.locator('[name="projectId"]').selectOption('personal');
  assert.equal(await dialog.locator('[name="taskId"]').inputValue(), '');
  await dialog.locator('[data-cal-cancel]').click();
  assert.deepEqual(errors, []);
});

test('pointer creation, moving and resizing persist plans and Escape cancels', async t => {
  const { page, storage, errors } = await setup(t);
  await page.locator('[data-cal-view="day"]').click();
  const scroller = page.locator('.cal-time-scroll');
  await scroller.evaluate(el => { el.scrollTop = 8 * 64; });
  if (process.env.CALENDAR_DEBUG) await page.evaluate(() => {
    window.__pointerTrace = [];
    for (const name of ['pointerdown', 'pointermove', 'pointerup']) document.addEventListener(name, e => window.__pointerTrace.push({ type: name, x: e.clientX, y: e.clientY, target: e.target.className, scroll: document.querySelector('.cal-time-scroll').scrollTop, hit: document.elementFromPoint(e.clientX, e.clientY)?.className }), true);
  });
  const event = page.locator('[data-cal-plan="plan"]');
  const original = storage.calendarPlans.find(p => p.id === 'plan').startedAt;
  let box = await event.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 25, box.y + 52, { steps: 8 });
  await page.mouse.up();
  await eventually(() => new Date(storage.calendarPlans.find(p => p.id === 'plan').startedAt).getMinutes() === 30);
  if (process.env.CALENDAR_DEBUG) console.log(JSON.stringify({ box, original, plan: storage.calendarPlans.find(p => p.id === 'plan'), trace: await page.evaluate(() => window.__pointerTrace), errors }));
  assert.equal(new Date(storage.calendarPlans.find(p => p.id === 'plan').startedAt).getMinutes(), 30);
  await page.waitForFunction(() => document.querySelector('[data-cal-plan="plan"]')?.title.includes('09:30'));
  const before = storage.calendarPlans.find(p => p.id === 'plan').endedAt;
  const handle = event.locator('[data-cal-resize="resize-end"]');
  await handle.scrollIntoViewIfNeeded();
  box = await handle.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 35, { steps: 8 });
  await page.mouse.up();
  await eventually(() => storage.calendarPlans.find(p => p.id === 'plan').endedAt !== before);
  assert.equal(new Date(storage.calendarPlans.find(p => p.id === 'plan').endedAt).getHours(), 12);
  await page.waitForFunction(() => document.querySelector('[data-cal-plan="plan"]')?.title.includes('12:00'));
  box = await event.boundingBox();
  const unchanged = storage.calendarPlans.find(p => p.id === 'plan').startedAt;
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 52, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(storage.calendarPlans.find(p => p.id === 'plan').startedAt, unchanged);
  await scroller.evaluate(el => { el.scrollTop = 6 * 64; });
  const slot = page.locator('[data-cal-slot="2026-10-20"]');
  box = await slot.boundingBox();
  await page.mouse.click(box.x + 20, box.y + 7 * 64 + 8);
  await page.locator('[data-cal-dialog]').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
});

test('planned timers retain notes and source links through management and popup', async t => {
  const { page, context, base, storage, errors } = await setup(t);
  await page.locator('[data-cal-view="day"]').click();
  await page.locator('[data-cal-plan="plan"]').click();
  await page.locator('[data-cal-start]').click();
  await eventually(() => storage.timer?.planId === 'plan');
  await page.locator('#mgTimerPlanSource').waitFor({ state: 'visible' });
  const firstId = storage.timer.entryId;
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-plan="plan"]').click();
  await page.locator('[data-cal-start]').click();
  await page.locator('#p-timer').waitFor({ state: 'visible' });
  assert.equal(storage.timer.entryId, firstId);
  await page.locator('#mgTimerNotes').fill('切換安排前的筆記');
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-plan="walk"]').click();
  await page.locator('[data-cal-start]').click();
  await eventually(() => storage.timer?.planId === 'walk');
  assert.equal(storage.entries.find(entry => entry.id === firstId).notes, '切換安排前的筆記');
  assert.equal(storage.entries.find(entry => entry.id === firstId).planId, 'plan');
  const popup = await context.newPage();
  await popup.goto(base + '/extension/src/popup/popup.html');
  await popup.locator('#initialLoading').waitFor({ state: 'hidden' });
  assert.match(await popup.locator('#popupPlanSource').innerText(), /散步與午餐/);
  await page.locator('[data-tab="calendar"]').click();
  await popup.locator('#toggle').click();
  await eventually(() => !storage.timer);
  await page.locator('[data-cal-entry]').first().waitFor();
  assert.equal(storage.entries.filter(entry => entry.planId === 'walk').length, 1);
  assert.deepEqual(errors, []);
});

for (const locale of ['zh-TW', 'en', 'ja']) {
  test(`calendar fits narrow layouts and renders ${locale} labels`, async t => {
    const { page, errors } = await setup(t, { width: locale === 'zh-TW' ? 1440 : 390, locale });
    assert.equal((await page.locator('#p-calendar').innerText()).includes('[['), false);
    assert.ok(await page.locator('[data-cal-plan="plan"]').isVisible());
    if (process.env.CALENDAR_DEBUG) console.log(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body > *, .wrap > *, #p-calendar > *')].map(el => ({ name: el.id || el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width, overflow: getComputedStyle(el).overflowX })) })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    if (process.env.CALENDAR_SCREENSHOTS) {
      const directory = path.join(root, 'docs/images/calendar');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: path.join(directory, `calendar-week-${locale}.png`), fullPage: true });
      await page.locator('[data-cal-view="month"]').click();
      await page.screenshot({ path: path.join(directory, `calendar-month-${locale}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
  });
}

test('a remotely deleted plan disables saving but the editor can still be closed', async t => {
  const { page, storage, publish } = await setup(t);
  await page.locator('[data-cal-view="day"]').click();
  await page.locator('[data-cal-plan="plan"]').click();
  storage.calendarPlans = storage.calendarPlans.filter(p => p.id !== 'plan');
  await publish({ calendarPlans: { newValue: storage.calendarPlans } });
  await page.locator('[data-cal-form-error]').filter({ hasText: '已在其他視窗刪除' }).waitFor();
  assert.equal(await page.locator('[data-cal-save]').isDisabled(), true);
  await page.locator('[data-cal-cancel]').click();
  await page.locator('[data-cal-dialog]').waitFor({ state: 'hidden', timeout: 3000 });
});

for (const surface of ['popup', 'management']) {
  test(`${surface} note ownership survives a different window starting a new timer`, async t => {
    const { page, context, base, storage } = await setup(t);
    await page.evaluate(async () => { const db = await import('/extension/src/lib/db.js'); await db.startTimer({ description: 'Timer A', notes: 'A original', planId: 'plan' }); });
    const firstId = storage.timer.entryId;
    let editorPage = page;
    if (surface === 'popup') {
      editorPage = await context.newPage();
      await editorPage.goto(base + '/extension/src/popup/popup.html');
      await editorPage.locator('#initialLoading').waitFor({ state: 'hidden' });
    } else { await page.waitForTimeout(150); await page.locator('[data-tab="timer"]').click(); }
    const notes = editorPage.locator(surface === 'popup' ? '#liveText' : '#mgTimerNotes');
    await notes.fill('A late notes');
    await page.evaluate(async () => { const db = await import('/extension/src/lib/db.js'); await db.startTimer({ description: 'Timer B', notes: 'B original', planId: 'walk' }); });
    const secondId = storage.timer.entryId;
    await editorPage.waitForTimeout(750);
    assert.equal(storage.timer.notes, 'B original');
    if (surface === 'management') { await notes.press('End'); await notes.pressSequentially(' extra'); await editorPage.waitForTimeout(750); assert.notEqual(storage.timer.notes, 'A late notes extra'); }
    await editorPage.locator(surface === 'popup' ? '#toggle' : '#mgTimerToggle').click();
    await eventually(() => !storage.timer);
    assert.notEqual(storage.entries.find(e => e.id === secondId).notes, 'A late notes');
    assert.notEqual(storage.entries.find(e => e.id === secondId).notes, 'A late notes extra');
    assert.match(storage.entries.find(e => e.id === firstId).notes, /^A late notes/);
  });
}

test('month continuation dragging moves the whole span by one day', async t => {
  const { page, storage } = await setup(t);
  await page.locator('[data-cal-view="month"]').click();
  const continuation = page.locator('[data-cal-plan="trip"]').nth(1);
  await continuation.scrollIntoViewIfNeeded();
  const from = await continuation.boundingBox();
  const destination = await page.locator('[data-cal-drop-date="2026-10-27"]').boundingBox();
  await page.mouse.move(from.x + 15, from.y + 10); await page.mouse.down();
  await page.mouse.move(destination.x + 15, from.y + 10, { steps: 8 }); await page.mouse.up();
  await eventually(() => storage.calendarPlans.find(p => p.id === 'trip').startDate !== '2026-10-24');
  assert.equal(storage.calendarPlans.find(p => p.id === 'trip').startDate, '2026-10-25');
  assert.equal(storage.calendarPlans.find(p => p.id === 'trip').endDate, '2026-10-28');
});
