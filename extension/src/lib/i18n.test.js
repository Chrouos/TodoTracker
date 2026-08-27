import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANGUAGE_OPTIONS,
  MESSAGES,
  SUPPORTED_LOCALES,
  formatDuration,
  normalizeLanguagePreference,
  resolveLocale,
  translate,
} from './i18n.js';

test('supports the three runtime locales and auto preference', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['zh-TW', 'en', 'ja']);
  assert.deepEqual(LANGUAGE_OPTIONS.map(({ value }) => value), ['auto', 'zh-TW', 'en', 'ja']);
  assert.equal(normalizeLanguagePreference('invalid'), 'auto');
});

test('maps browser locales and honors manual selection', () => {
  assert.equal(resolveLocale('auto', 'zh-Hant-TW'), 'zh-TW');
  assert.equal(resolveLocale('auto', 'zh-HK'), 'zh-TW');
  assert.equal(resolveLocale('auto', 'ja-JP'), 'ja');
  assert.equal(resolveLocale('auto', 'de-DE'), 'en');
  assert.equal(resolveLocale('ja', 'en-US'), 'ja');
});

test('interpolates translated messages and marks missing keys', () => {
  assert.match(translate('en', 'notification.todoDue', { title: 'Plan', time: '09:00' }), /Plan/);
  assert.equal(translate('ja', 'missing.example'), '[[missing.example]]');
});

test('formats compact durations for each locale', () => {
  assert.equal(formatDuration(3660, 'en'), '1h 01m');
  assert.equal(formatDuration(3660, 'zh-TW'), '1 小時 01 分');
  assert.equal(formatDuration(3660, 'ja'), '1時間 01分');
});

test('all dictionaries expose the same translation keys', () => {
  const expectedKeys = Object.keys(MESSAGES['zh-TW']).sort();
  assert.ok(expectedKeys.length > 0);
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), expectedKeys);
  }
});
