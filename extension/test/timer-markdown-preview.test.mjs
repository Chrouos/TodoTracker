import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { renderMarkdown, shouldShowMarkdownToggle } from '../src/lib/markdown.js';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');

assert.match(html, /id="mgTimerNotesEditToggle"[^>]*type="button"/,
  'Timer notes should expose an edit mode button');
assert.match(html, /id="mgTimerNotesPreviewToggle"[^>]*type="button"/,
  'Timer notes should expose a Markdown preview mode button');
assert.match(html,
  /class="timer-notes-head"[\s\S]*id="mgTimerNotesEditToggle"[\s\S]*id="mgTimerNotesPreviewToggle"[\s\S]*id="mgTimerNotes"/,
  'Timer notes mode buttons should stay above the note content');
assert.match(html, /id="mgTimerNotesPreview"[^>]*hidden/,
  'Timer notes should expose a hidden preview container');
assert.match(html, /id="mgTimerIdleNotice"/, 'Timer should expose a no-running-timer reminder');
assert.match(options, /function renderTimerNotesPreview\(\)/,
  'Timer should render notes through a dedicated preview function');
assert.match(options, /renderMarkdownPreview\(\$\('mgTimerNotes'\)\.value/,
  'Timer notes preview should reuse the Markdown renderer');
assert.match(options, /initializeMarkdownPreviews\(container, false, true\)/,
  'Timer notes preview should render full Markdown without an inner expand action');
assert.match(options, /function syncTimerNotesMode\(\)/,
  'Timer notes should synchronize the active edit and preview buttons');
assert.match(options, /mgTimerNotesEditToggle.*addEventListener\('click'/s,
  'Timer notes should provide a direct edit action');
assert.match(options, /mgTimerNotesPreviewToggle.*addEventListener\('click'/s,
  'Timer notes should provide a direct preview action');
assert.match(options, /mgTimerIdleNotice.*hidden\s*=\s*Boolean\(timer\)/s,
  'Timer should show the reminder only when no timer is running');
assert.doesNotMatch(options, /growTimerNotes/,
  'Timer notes should not resize the page while typing');
assert.match(css, /\.timer-notes-mode\s*\{[^}]*display:\s*inline-flex/s,
  'Timer notes mode buttons should be presented as a compact control');
assert.match(css, /\.timer-notes-head\s*\{[^}]*margin-bottom:\s*var\(--md\)/s,
  'Timer notes heading and mode buttons should have comfortable spacing');
assert.match(css, /\.timer-notes-preview\s*\{[^}]*min-height:\s*300px[^}]*overflow-x:\s*auto/s,
  'Timer notes preview should allow wide text tables to scroll horizontally');
assert.match(css, /\.timer-notes-field textarea\s*\{[^}]*min-height:\s*300px[^}]*max-height:\s*none/s,
  'Timer notes should grow with the full text instead of nesting fixed scroll areas');

console.log('timer markdown preview contract passed');

test('full-note previews remain uncollapsed when checkbox updates or resize remeasure them', () => {
  const renderSource = options.slice(options.indexOf('function renderMarkdownPreview('), options.indexOf('const markdownEditors'));
  const measureSource = options.slice(options.indexOf('function setMarkdownPreviewExpanded('), options.indexOf('function initializeMarkdownPreviews('));
  const api = runInNewContext(`${renderSource}\n${measureSource}\n({ renderMarkdownPreview, measureMarkdownPreview })`, {
    renderMarkdown,
    shouldShowMarkdownToggle,
    getComputedStyle: () => ({ getPropertyValue: () => '180' }),
    translateText: () => 'Expand all',
    esc: (text) => text,
  });
  const note = `- [ ] Task\n\n${'A long note line\n'.repeat(60)}`;
  let rendered = api.renderMarkdownPreview(note, '', { alwaysExpanded: true });
  for (const fullNote of [true, true, true, false]) {
    if (!fullNote) rendered = api.renderMarkdownPreview(note);
    const classes = new Set();
    let expandControl = null;
    const preview = {
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
      hasAttribute: (name) => rendered.includes(` ${name}`),
      querySelector: (selector) => selector === '[data-markdown-content]'
        ? { textContent: note, scrollHeight: 1200 } : expandControl,
      querySelectorAll: () => expandControl ? [expandControl] : [],
      insertAdjacentHTML: () => { expandControl = { setAttribute() {}, remove() { expandControl = null; } }; },
    };
    // Re-rendering and resize callers omit the original explicit expansion flag.
    api.measureMarkdownPreview(preview, true);
    assert.equal(classes.has('is-collapsible'), !fullNote);
    assert.equal(Boolean(expandControl), !fullNote);
    rendered = api.renderMarkdownPreview(note.replace('[ ]', '[x]'), '', {
      alwaysExpanded: preview.hasAttribute('data-markdown-preview-full'),
    });
  }
});
