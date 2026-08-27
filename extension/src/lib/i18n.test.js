import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LANGUAGE_OPTIONS,
  MESSAGES,
  SUPPORTED_LOCALES,
  formatDuration,
  getBrowserLocale,
  normalizeLanguagePreference,
  resolveLocale,
  translate,
} from './i18n.js';
import { DEFAULT_SETTINGS } from './db.js';

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

test('uses the page browser locale when navigator is available', () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'ja-JP' },
  });
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { i18n: { getUILanguage: () => 'de-DE' } },
  });
  assert.equal(getBrowserLocale(), 'ja-JP');
  if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
  else delete globalThis.navigator;
  if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
  else delete globalThis.chrome;
});

test('static translation markers and settings fallbacks stay valid', async () => {
  const [optionsHtml, popupHtml] = await Promise.all([
    readFile(new URL('../options/options.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup/popup.html', import.meta.url), 'utf8'),
  ]);
  const markers = [...`${optionsHtml}\n${popupHtml}`.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)]
    .map(([, key]) => key);
  assert.ok(markers.length > 0);
  for (const key of markers) {
    for (const locale of SUPPORTED_LOCALES) assert.ok(MESSAGES[locale][key], `${locale} is missing ${key}`);
  }
  for (const locale of SUPPORTED_LOCALES) {
    for (const value of Object.values(MESSAGES[locale])) assert.notEqual(value.trim(), '');
  }
  assert.equal(DEFAULT_SETTINGS.language, 'auto');
  assert.equal(normalizeLanguagePreference(undefined), 'auto');
  assert.equal(normalizeLanguagePreference('not-supported'), 'auto');
});
