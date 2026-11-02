// Run with: node --test extension/test/autogrow-scroll.browser.mjs
// Requires Playwright (or PLAYWRIGHT_MODULE pointing to an installed copy).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ts = require('../../web/node_modules/typescript');
const extensionSource = readFileSync(new URL('../src/lib/autogrow.js', import.meta.url), 'utf8')
  .replace('export function', 'function');
const webSource = ts.transpileModule(
  readFileSync(new URL('../../web/components/AutoTextarea.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

for (const implementation of ['extension', 'web']) {
  for (const container of ['page', 'dialog', 'textarea']) {
    test(`${implementation}: editing a long note preserves ${container} scroll position`, async () => {
      const browser = await chromium.launch({ headless: true, channel: 'chrome' });
      try {
        const page = await browser.newPage();
        await page.setContent(`
          <style>
            textarea { width: 700px; box-sizing: border-box; font: 16px/24px monospace; }
            .dialog { height: 450px; overflow: auto; }
          </style>
          <div class="${container}"><textarea></textarea></div>
        `);
        await page.addScriptTag({ content: extensionSource });
        await page.evaluate(({ implementation, webSource, container }) => {
          const textarea = document.querySelector('textarea');
          textarea.value = 'A long Markdown paragraph\n'.repeat(200);
          const max = container === 'textarea' ? 320 : Infinity;
          if (implementation === 'extension') {
            window.fit = autoGrow(textarea, { min: 160, max });
          } else {
            // Run the component's real layout effect against a real DOM textarea.
            // React hooks only provide the ref and capture the effect here.
            const exports = {};
            const react = {
              useRef: () => ({ current: textarea }),
              useCallback: (callback) => callback,
              useLayoutEffect: (effect) => { window.runEffect = effect; },
              jsx: () => null,
            };
            new Function('require', 'exports', webSource)(() => react, exports);
            window.fit = () => {
              window.cleanup?.();
              exports.default({ value: textarea.value, onChange() {}, min: 160, max });
              window.cleanup = window.runEffect();
            };
            window.fit();
          }
        }, { implementation, webSource, container });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const before = await page.evaluate((container) => {
          const scroller = container === 'page' ? document.scrollingElement : document.querySelector(container === 'dialog' ? '.dialog' : 'textarea');
          const textarea = document.querySelector('textarea');
          textarea.focus({ preventScroll: true });
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          scroller.scrollTop = 2400;
          return scroller.scrollTop;
        }, container);
        assert.equal(before, 2400, 'fixture must be scrolled into the long note');
        // Repeat input and explicit sync calls; measure after layout/scroll anchoring settles.
        for (let i = 0; i < 3; i += 1) {
          await page.evaluate((implementation) => {
            document.querySelector('textarea').value += 'typed';
            if (implementation === 'extension') document.querySelector('textarea').dispatchEvent(new Event('input'));
            else window.fit();
          }, implementation);
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const after = await page.evaluate((container) => (
            container === 'page' ? document.scrollingElement : document.querySelector(container === 'dialog' ? '.dialog' : 'textarea')
          ).scrollTop, container);
          assert.equal(after, before, 'resizing must not move the note being edited');
        }
        const shrink = await page.evaluate((container) => {
          const textarea = document.querySelector('textarea');
          const scroller = container === 'page' ? document.scrollingElement : document.querySelector(container === 'dialog' ? '.dialog' : 'textarea');
          const height = textarea.getBoundingClientRect().height;
          textarea.value = 'A long Markdown paragraph\n'.repeat(180);
          window.fit();
          return { height, nextHeight: textarea.getBoundingClientRect().height, scroll: scroller.scrollTop };
        }, container);
        assert.equal(shrink.scroll, before, 'deleting text below the viewport preserves position');
        if (container === 'textarea') assert.equal(shrink.nextHeight, 320, 'capped textareas keep their maximum height');
        else assert.ok(shrink.nextHeight < shrink.height, 'textareas still shrink when text is deleted');
      } finally {
        await browser.close();
      }
    });
  }
}
