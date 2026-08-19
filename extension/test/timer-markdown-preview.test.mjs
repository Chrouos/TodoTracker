import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
assert.match(css, /\.timer-notes-mode\s*\{[^}]*display:\s*inline-flex/s,
  'Timer notes mode buttons should be presented as a compact control');
assert.match(css, /\.timer-notes-head\s*\{[^}]*margin-bottom:\s*var\(--md\)/s,
  'Timer notes heading and mode buttons should have comfortable spacing');
assert.match(css, /\.timer-notes-preview\s*\{[^}]*max-height:\s*360px[^}]*overflow-y:\s*auto/s,
  'Timer notes preview should have a bounded scrollable height');

console.log('timer markdown preview contract passed');
