# TodoTracker Extension i18n Design

## Goal

Add Traditional Chinese, English, and Japanese user-interface translations to the Chrome extension. Users can select a language in the options page; the default follows the browser language.

## Scope

This change covers the Chrome extension only:

- popup UI and its dynamic labels, empty states, tooltips, and actions;
- options UI and its static and dynamic text;
- service-worker action titles and Todo notifications;
- manifest-visible name and description where Chrome locale resources support them;
- locale-sensitive date, weekday, number, and duration presentation where the existing UI presents those values.

User-authored values are not translated: project names, Todo titles, tags, notes, descriptions, and imported data remain unchanged.

The Next.js web app, stored data shape other than the optional language setting, and business rules are out of scope.

## User experience

The options page Settings section gets a Language select with these choices:

- Auto (browser language)
- 繁體中文
- English
- 日本語

The persisted setting is one of `auto`, `zh-TW`, `en`, or `ja`. Missing or invalid values behave as `auto`, preserving compatibility with existing installations.

Locale resolution is deterministic:

| Browser locale | Resolved locale |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-Hant`, or another Traditional Chinese locale | `zh-TW` |
| `ja` or any `ja-*` locale | `ja` |
| all other locales | `en` |

Manual selection overrides browser detection. Changing the setting saves it in the existing `settings` object; popup and options load the setting on their next render/open. Background notifications resolve the same setting before creating a notification.

## Architecture

Create a dependency-free shared module at `extension/src/lib/i18n.js`.

The module owns:

- supported locale metadata and locale normalization;
- browser-locale resolution;
- translation dictionaries for `zh-TW`, `en`, and `ja`;
- `t(key, variables)` interpolation for dynamic messages;
- locale-aware formatting helpers used by UI code;
- a small DOM application helper for static HTML nodes, including text, `title`, `aria-label`, and `placeholder` attributes.

The translation API must return a deterministic fallback for a missing key. The fallback should make missing translations visible during development while keeping the UI usable; the implementation plan will choose the exact marker and test it.

Use semantic keys grouped by surface or feature, for example `nav.report`, `todo.status.done`, `notification.todoDue`, and `settings.language`. Do not use translated text as a lookup key.

Dynamic HTML renderers in `popup.js` and `options.js` call `t()` for generated interface text. User content continues through the existing escaping path. Static HTML gets stable `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`, or `data-i18n-placeholder` attributes so changing locale does not require duplicating whole HTML documents.

The page scripts initialize the locale before the first visible render, then apply translations to static nodes and use the resolved locale for later rendering. Existing data and UI state are preserved when a locale changes.

## Persistence and background behavior

Extend `DEFAULT_SETTINGS` with:

```js
language: 'auto'
```

`getSettings()` continues to merge old settings with defaults. `saveSettings()` stores the selected value alongside existing settings. The background listener already observes settings changes for idle detection; language changes do not require a worker restart and are read when a notification is emitted.

Use `chrome.i18n.getUILanguage()` as the service-worker browser-locale source when available, with a safe fallback for tests. Page contexts use `navigator.language`; both pass through the same resolver.

## Chrome metadata

Use Chrome `_locales/` resources for manifest `name` and `description`, with `default_locale` set to `en`. Runtime UI translations remain in the shared module because the extension supports an in-app language override. Metadata localization is additive and does not determine the runtime language setting.

## Translation coverage

The implementation will inventory every user-visible string in:

- `src/popup/popup.html` and `src/popup/popup.js`;
- `src/options/options.html` and `src/options/options.js`;
- `src/background.js`;
- shared modules that generate user-facing labels or summaries.

Developer comments, console diagnostics, CSV column names, and user-authored content are not UI translation keys unless they are shown to the user. Data export field names remain stable for compatibility.

## Testing and verification

Add focused unit tests for:

- manual locale normalization;
- browser-locale mapping and unsupported-locale fallback;
- interpolation and missing-key behavior;
- completeness of all three dictionaries;
- settings default and persistence compatibility;
- notification message selection where practical.

Add source/layout contract tests for the language control and static translation markers. Run the full extension Node test suite and `git diff --check`. Manually load the unpacked extension and verify popup, options, action title, and scheduled Todo notifications in all three languages.

## Alternatives considered

### Chrome `chrome.i18n` for all UI text

This is suitable for manifest strings and browser-locale-only extensions, but it makes an in-app override and shared formatting behavior less direct. It is retained for manifest metadata only.

### External i18n package

The extension has no build step and no runtime dependency system. A local module keeps loading deterministic and avoids adding a package solely for dictionary lookup and interpolation.

