import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRange, localDateRange } from './time.js';

test('activeRange highlights custom while custom controls are open', () => {
  assert.equal(activeRange('all', true), 'custom');
  assert.equal(activeRange('month', true), 'custom');
  assert.equal(activeRange('week', false), 'week');
});

test('localDateRange includes both local calendar dates', () => {
  const result = localDateRange('2026-08-10', '2026-08-12');
  assert.equal(result.from.getHours(), 0);
  assert.equal(result.from.getDate(), 10);
  assert.equal(result.to.getDate(), 13);
});

test('localDateRange rejects incomplete and reversed ranges', () => {
  assert.equal(localDateRange('', '2026-08-12'), null);
  assert.equal(localDateRange('2026-08-13', '2026-08-12'), null);
});
