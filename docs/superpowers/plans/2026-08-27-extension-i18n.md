# Extension i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the Chrome extension's popup, options page, action title, notifications, and manifest metadata into Traditional Chinese, English, and Japanese with a persistent manual override and browser-language default.

**Architecture:** Add a dependency-free `src/lib/i18n.js` that owns supported locales, browser-locale resolution, dictionaries, interpolation, DOM translation markers, and display formatting. Store `language: 'auto'` inside the existing settings object; both page scripts resolve the same locale and the service worker resolves it when emitting action titles or notifications. Keep user-authored data and ISO date keys unchanged.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript ES modules, `chrome.storage.local`, `chrome.i18n.getUILanguage()`, `Intl`, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-extension-i18n-design.md`

## Global Constraints

- Extension only; the Next.js web app is out of scope.
- Supported runtime locales are exactly `zh-TW`, `en`, and `ja`.
- Persist exactly `auto`, `zh-TW`, `en`, or `ja`; missing and invalid values resolve as `auto`.
- `zh-TW`/`zh-HK`/`zh-MO`/`zh-Hant*` resolve to `zh-TW`; `ja-*` resolves to `ja`; all other browser locales resolve to `en`.
- User-authored project names, Todo titles, tags, notes, descriptions, and imported data are never translated.
- Keep CSV field names and ISO `YYYY-MM-DD` values stable; never use localized display text as a date-key or storage key.
- Do not add an external dependency or a build step.
- Use two-space indentation, semicolons, and the existing single-quote JavaScript style.
- Write a failing test before each implementation change and run the narrow test before moving on.

## File Map

### New files

- `src/lib/i18n.js`: locale constants, dictionaries, resolution, interpolation, DOM marker application, and display formatters.
- `src/lib/i18n.test.js`: Node unit tests for locale behavior, interpolation, formatting, and dictionary completeness.
- `_locales/en/messages.json`: Chrome manifest metadata messages and English labels required by Chrome.
- `_locales/zh_TW/messages.json`: Traditional Chinese manifest metadata messages.
- `_locales/ja/messages.json`: Japanese manifest metadata messages.
- `docs/superpowers/plans/2026-08-27-extension-i18n.md`: this execution plan.

### Modified files

- `src/lib/db.js`: add the backward-compatible `language: 'auto'` default.
- `src/lib/todo-filter.js`: make priority, status, and count labels locale-aware without changing their normalized values.
- `src/lib/tasks.js`: make due, lead-time, and timestamp labels locale-aware.
- `src/lib/summary.js`: make copied Markdown summaries use the selected locale while retaining user content and stable data values.
- `src/lib/charts.js`: localize chart titles and hover text generated in the shared renderer.
- `src/options/options.html`: add translation markers, language setting controls, and initial loading guard.
- `src/options/options.js`: resolve/apply locale, translate dynamic renderers, and persist language changes.
- `src/popup/popup.html`: add translation markers and initial loading guard.
- `src/popup/popup.js`: resolve/apply locale and translate dynamic popup content.
- `src/background.js`: resolve the saved locale for action titles and scheduled Todo notifications.
- `manifest.json`: use Chrome locale message substitutions and declare `default_locale`.
- `test/options-layout.test.mjs`: assert the language control and translation hooks exist.
- `test/popup-layout.test.mjs` (create if no existing popup layout test exists): assert popup translation hooks exist.
- `test/background-layout.test.mjs` (create if no existing background contract test exists): assert notification paths use the translator.

---

### Task 1: Build the shared locale engine

**Files:**

- Create: `src/lib/i18n.test.js`
- Create: `src/lib/i18n.js`

**Interfaces:**

- Produces `SUPPORTED_LOCALES`, `LANGUAGE_OPTIONS`, `normalizeLanguagePreference(value)`, `resolveLocale(preference, browserLocale)`, `getBrowserLocale()`, `translate(locale, key, variables)`, `applyTranslations(root, locale)`, `formatDisplayDate(value, locale)`, `formatDisplayTime(value, locale)`, and `formatDuration(seconds, locale)` for all later tasks.
- `translate()` returns `[[key]]` for a missing translation key so incomplete UI text is visible during development.

- [ ] **Step 1: Write the failing tests**

  Add tests covering the exact contracts:

  ```js
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
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run `node --test src/lib/i18n.test.js`.

  Expected: FAIL because `src/lib/i18n.js` and its exports do not yet exist.

- [ ] **Step 3: Implement the minimal locale engine**

  Define all three dictionaries in one `MESSAGES` object with identical key sets. Include the key namespaces needed by later tasks: `app.*`, `nav.*`, `common.*`, `timer.*`, `report.*`, `project.*`, `todo.*`, `schedule.*`, `tag.*`, `entry.*`, `settings.*`, `popup.*`, `notification.*`, and `metadata.*`.

  Implement `resolveLocale()` by lower-casing the browser locale, checking `zh-hant`, `zh-tw`, `zh-hk`, and `zh-mo` before `ja`, and returning English for every unsupported locale. Implement interpolation by replacing `{name}` tokens from the variables object without evaluating code. Implement `applyTranslations()` for `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`, and `data-i18n-placeholder` attributes, including the root element when it carries one of those attributes.

  Keep `formatDisplayDate()` and `formatDisplayTime()` separate from `fmtDate()` and `fmtClock()` so date-key calculations remain ISO/local-time stable. Use `Intl.DateTimeFormat` and the locale mapping above. Implement `formatDuration()` with the exact short forms asserted by the tests.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run `node --test src/lib/i18n.test.js`.

  Expected: PASS, including dictionary key parity and the three duration outputs.

- [ ] **Step 5: Commit the locale engine**

  ```bash
  git add extension/src/lib/i18n.js extension/src/lib/i18n.test.js
  git commit -m "feat: add extension locale engine"
  ```

### Task 2: Persist the language setting and add the options control

**Files:**

- Modify: `src/lib/db.js:8-15`
- Modify: `src/options/options.html:370-410`
- Modify: `src/options/options.js:1-180,2263-2278,2430-2440`
- Modify: `test/options-layout.test.mjs`

**Interfaces:**

- Consumes `normalizeLanguagePreference()`, `resolveLocale()`, `getBrowserLocale()`, and `applyTranslations()` from Task 1.
- Produces `S.settings.language` and a visible `#stLanguage` select with values `auto`, `zh-TW`, `en`, and `ja`.

- [ ] **Step 1: Write the failing tests**

  Extend the layout contract to require `id="stLanguage"`, all four option values, an import from `../lib/i18n.js`, a call to `applyTranslations`, and `language:` in the settings save payload. Add a source assertion that `DEFAULT_SETTINGS` contains `language: 'auto'`.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run `node --test test/options-layout.test.mjs`.

  Expected: FAIL because the settings field, import, and default are absent.

- [ ] **Step 3: Implement settings persistence and bootstrap**

  Add `language: 'auto'` to `DEFAULT_SETTINGS`. Add a settings field labelled through `data-i18n="settings.language"` with options labelled through `data-i18n` markers. In `options.js`, keep a module-level `currentLocale`, resolve it after `db.getSettings()` returns, call `applyTranslations(document, currentLocale)` before `renderAll()`, and remove the initial loading guard after translations are applied. Set `stLanguage` from the normalized preference in `renderSettings()`.

  Add `language: normalizeLanguagePreference($('stLanguage').value)` to the existing save payload. After saving, reload the state and rerender the active page so every dynamic string changes immediately while preserving the selected tab.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run `node --test test/options-layout.test.mjs`.

  Expected: PASS.

- [ ] **Step 5: Commit the settings slice**

  ```bash
  git add extension/src/lib/db.js extension/src/options/options.html extension/src/options/options.js extension/test/options-layout.test.mjs
  git commit -m "feat: add extension language setting"
  ```

### Task 3: Localize shared labels, date display, and copied summaries

**Files:**

- Modify: `src/lib/todo-filter.js`
- Modify: `src/lib/tasks.js`
- Modify: `src/lib/summary.js`
- Modify: `src/lib/charts.js`
- Modify: `src/lib/i18n.js`
- Modify: `src/lib/i18n.test.js`
- Modify: `test/todo-priority.test.mjs`

**Interfaces:**

- Consumes a resolved locale string from page renderers.
- Extends `priorityLabel(priority, locale = 'zh-TW')`, `statusLabel(status, locale = 'zh-TW')`, `taskCountLabel(tasks, showDone, status = '', locale = 'zh-TW')`, `leadLabel(leadMs, locale = 'zh-TW')`, `dueLabel(metrics, done, locale = 'zh-TW')`, and `stampLabel(iso, locale = 'zh-TW')`.
- Extends `buildSummary({ dates, entries, projects, tasks, includeTodos, locale = 'zh-TW' })` without changing its existing input data shape.

- [ ] **Step 1: Write the failing tests**

  Add assertions that `priorityLabel('high', 'en')` is `High`, `statusLabel('done', 'ja')` is `完了`, `taskCountLabel([{ status: 'done' }], true, 'done', 'en')` contains `completed`, `dueLabel({ dueDelta: 0 }, false, 'ja')` contains `期限`, and `buildSummary({ dates: [], entries: [], projects: [], locale: 'en' })` accepts the locale argument. Keep the existing default-language assertions unchanged.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run `node --test src/lib/i18n.test.js test/todo-priority.test.mjs`.

  Expected: FAIL on the new locale arguments and translated expectations.

- [ ] **Step 3: Implement locale-aware shared labels**

  Replace hard-coded display labels with `translate(locale, key, variables)`, preserving normalized enum values and the existing default `zh-TW` output. Pass `locale` through summary generation and chart title/hover text. Use `formatDisplayDate`, `formatDisplayTime`, and `formatDuration` only for display strings; retain `fmtDate` in filtering, grouping, and chart data keys. Keep CSV headers unchanged.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run `node --test src/lib/i18n.test.js test/todo-priority.test.mjs src/lib/time.test.js`.

  Expected: PASS with existing Traditional Chinese behavior preserved by default.

- [ ] **Step 5: Commit shared localization**

  ```bash
  git add extension/src/lib/i18n.js extension/src/lib/i18n.test.js extension/src/lib/todo-filter.js extension/src/lib/tasks.js extension/src/lib/summary.js extension/src/lib/charts.js extension/test/todo-priority.test.mjs
  git commit -m "feat: localize shared extension labels"
  ```

### Task 4: Localize the options page static and dynamic UI

**Files:**

- Modify: `src/options/options.html` (all fixed visible labels, hints, option text, titles, and aria labels)
- Modify: `src/options/options.js` (all generated labels and messages)
- Modify: `test/options-layout.test.mjs`

**Interfaces:**

- Consumes `currentLocale`, `translate()`, `formatDisplayDate()`, `formatDisplayTime()`, `formatDuration()`, and locale-aware shared label functions.
- Produces an options page with no hard-coded user-visible Traditional Chinese strings outside translation dictionaries.

- [ ] **Step 1: Write the failing source contract**

  Add assertions that fixed controls carry translation markers, that `options.js` imports `translate` and `formatDuration`, and that representative dynamic paths call `translate` for report status, Todo labels, schedule actions, entry empty states, and confirmation alerts.

- [ ] **Step 2: Run the focused contract to verify it fails**

  Run `node --test test/options-layout.test.mjs`.

  Expected: FAIL because the existing HTML and render functions still contain literal Traditional Chinese UI text.

- [ ] **Step 3: Mark and translate fixed HTML**

  Add `data-i18n` to the header, navigation, timer, report, project, Todo, schedule, tag, entry, settings, and dialog labels. Add `data-i18n-placeholder`, `data-i18n-title`, and `data-i18n-aria-label` for attributes. For `<option>` elements, use stable `data-i18n` keys while keeping their `value` attributes unchanged. Preserve `TodoTracker`, user-entered fields, and HTML structure.

- [ ] **Step 4: Translate generated options UI**

  Replace literals in report cards, charts, Todo Tracker rows, project workspace, Todo lists, schedule lists, tags, entries, dialogs, alerts, and export/import feedback with translation calls. Pass `currentLocale` into `priorityLabel`, `taskCountLabel`, `dueLabel`, `leadLabel`, `stampLabel`, and summary generation. Replace display-only `fmtDate`/`fmtClock`/`fmtHM` calls with the locale display helpers while leaving range comparisons and date keys untouched.

- [ ] **Step 5: Run the focused contract and full extension tests**

  Run `node --test test/options-layout.test.mjs src/lib/*.test.js test/*.test.mjs`.

  Expected: PASS with no changed behavior in filtering, navigation, Todo Tracker collapse, or report targeting.

- [ ] **Step 6: Commit options localization**

  ```bash
  git add extension/src/options/options.html extension/src/options/options.js extension/test/options-layout.test.mjs
  git commit -m "feat: localize options page"
  ```

### Task 5: Localize the popup UI

**Files:**

- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.js`
- Create: `test/popup-layout.test.mjs`

**Interfaces:**

- Consumes the same locale engine and `state.settings.language` used by options.
- Produces popup text, placeholders, tooltips, Todo labels, empty states, and copied-summary feedback in the resolved locale.

- [ ] **Step 1: Write the failing source contract**

  Assert that popup markup has translation markers for the fixed controls and that `popup.js` imports `resolveLocale`, `getBrowserLocale`, `applyTranslations`, and `translate`.

- [ ] **Step 2: Run the focused contract to verify it fails**

  Run `node --test test/popup-layout.test.mjs`.

  Expected: FAIL because popup markup and script currently contain literal Traditional Chinese UI strings.

- [ ] **Step 3: Implement popup bootstrap and fixed labels**

  Add the loading guard, resolve locale after settings load, apply static markers before `render()`, and remove the guard after the first render. Mark the track/todo tabs, timer controls, log form, advanced Todo controls, filters, and buttons in `popup.html`.

- [ ] **Step 4: Implement popup dynamic translations**

  Replace dynamic timer state, idle prompt, project/task placeholders, tag empty state, recent-entry labels, Todo priority/status labels, delete/start/log tooltips, and copy feedback with `translate()` and locale-aware formatters. Keep draft and user-authored text untouched.

- [ ] **Step 5: Run focused and full tests**

  Run `node --test test/popup-layout.test.mjs src/lib/*.test.js test/*.test.mjs`.

  Expected: PASS.

- [ ] **Step 6: Commit popup localization**

  ```bash
  git add extension/src/popup/popup.html extension/src/popup/popup.js extension/test/popup-layout.test.mjs
  git commit -m "feat: localize popup"
  ```

### Task 6: Localize service-worker messages and manifest metadata

**Files:**

- Modify: `src/background.js`
- Modify: `manifest.json`
- Create: `_locales/en/messages.json`
- Create: `_locales/zh_TW/messages.json`
- Create: `_locales/ja/messages.json`
- Create: `test/background-layout.test.mjs`

**Interfaces:**

- Consumes `getSettings()`, `getBrowserLocale()`, `resolveLocale()`, and `translate()`.
- Produces locale-aware action titles, new-Todo notifications, due reminders, and Chrome metadata.

- [ ] **Step 1: Write the failing tests**

  Add source contracts requiring `background.js` to import the locale helpers, resolve `settings.language` before `chrome.notifications.create`, and use translated keys for both scheduled notification branches. Assert `manifest.json` has `default_locale: 'en'`, `name: '__MSG_extensionName__'`, and `description: '__MSG_extensionDescription__'`. Assert all three messages files define both metadata keys.

- [ ] **Step 2: Run the focused contract to verify it fails**

  Run `node --test test/background-layout.test.mjs`.

  Expected: FAIL because the worker and manifest currently use literal Traditional Chinese strings and have no locale resources.

- [ ] **Step 3: Implement worker localization**

  Add a `currentLocale()` helper that calls `getSettings()` and resolves `settings.language` using `getBrowserLocale()`. Use it in `refreshBadge()` for action titles and in `tickSchedules()` for `notification.todoCreated` and `notification.todoDue`, passing title and due time as variables. Keep notification IDs, alarm behavior, timer calculations, and storage behavior unchanged.

- [ ] **Step 4: Add Chrome locale resources**

  Set `default_locale` to `en`, replace manifest name/description with message substitutions, and add `extensionName` and `extensionDescription` to each `_locales/*/messages.json`. Use valid Chrome locale directory names: `en`, `zh_TW`, and `ja`.

- [ ] **Step 5: Run focused and full tests**

  Run `node --test test/background-layout.test.mjs src/lib/*.test.js test/*.test.mjs`.

  Expected: PASS.

- [ ] **Step 6: Commit worker and metadata localization**

  ```bash
  git add extension/src/background.js extension/manifest.json extension/_locales extension/test/background-layout.test.mjs
  git commit -m "feat: localize extension notifications"
  ```

### Task 7: Verify translation completeness and integration behavior

**Files:**

- Modify: `src/lib/i18n.test.js`
- Modify: `test/options-layout.test.mjs`
- Modify: `test/popup-layout.test.mjs`
- Modify: `test/background-layout.test.mjs`
- Modify: `README.md` to document the supported languages and the `auto` browser-language default if the extension feature list is maintained there.

- [ ] **Step 1: Add completeness assertions**

  Assert that every key in the Traditional Chinese dictionary exists in English and Japanese, every static marker references an existing key, and no translation value is empty. Assert settings values remain valid after loading a settings object with no `language` field and after loading an invalid language value.

- [ ] **Step 2: Run the complete automated verification**

  From the repository root, run:

  ```bash
  node --test extension/src/lib/*.test.js extension/test/*.test.mjs
  git diff --check
  ```

  Expected: all tests pass and `git diff --check` produces no output.

- [ ] **Step 3: Manually verify all three locales**

  Load `extension/` through `chrome://extensions`, open options, choose each language, and verify that the options page and popup update. Confirm `auto` follows a browser locale mapping for Traditional Chinese, Japanese, and an unsupported locale. Start/stop a timer, inspect action titles, create a scheduled Todo, and verify both notification message types. Confirm project names, Todo titles, notes, imported data, and CSV headers remain unchanged.

- [ ] **Step 4: Review the final diff and commit the verification changes**

  ```bash
  git status --short
  git diff --stat
  git add extension docs
  git commit -m "test: verify extension i18n coverage"
  ```
