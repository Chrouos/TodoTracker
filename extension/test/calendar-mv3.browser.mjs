// Requires Playwright's Chromium: playwright install chromium
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('real MV3 calendar loads with CSP and persists a plan through its service worker', async () => {
  const extension = fileURLToPath(new URL('../', import.meta.url));
  const profile = await mkdtemp(path.join(tmpdir(), 'todotracker-calendar-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await worker.evaluate(() => chrome.storage.local.set({ settings: { language: 'zh-TW', weekStartsOn: 1 } }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/src/options/options.html`);
    await page.locator('#initialLoading').waitFor({ state: 'hidden' });
    await page.locator('[data-tab="calendar"]').click();
    await page.locator('[data-cal-new]').click();
    await page.locator('[data-cal-dialog] [name="title"]').fill('MV3 smoke plan');
    await page.locator('[data-cal-save]').click();
    await page.locator('[data-cal-dialog]').waitFor({ state: 'hidden' });
    const plans = await worker.evaluate(async () => (await chrome.storage.local.get('calendarPlans')).calendarPlans);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].title, 'MV3 smoke plan');
    assert.deepEqual(errors, []);
  } finally {
    await context?.close();
    if (path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('todotracker-calendar-')) await rm(profile, { recursive: true, force: true });
  }
});
