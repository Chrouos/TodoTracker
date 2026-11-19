import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTheme, normalizeTheme } from './theme.js';

test('theme selection supports explicit colors and falls back to the system', () => {
  const root = { dataset: {} };
  for (const theme of ['light', 'dark']) {
    applyTheme(theme, root);
    assert.equal(root.dataset.theme, theme);
  }
  for (const value of ['auto', undefined, 'invalid']) {
    assert.equal(normalizeTheme(value), 'auto');
    applyTheme(value, root);
    assert.equal(root.dataset.theme, undefined);
  }
});
