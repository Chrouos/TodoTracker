import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');

assert.match(html, /id="mgTimerNotesPreviewToggle"[^>]*type="button"/,
  'Timer notes should expose a Markdown preview toggle button');
assert.match(html, /id="mgTimerNotesPreview"[^>]*hidden/,
  'Timer notes should expose a hidden preview container');
assert.match(options, /function renderTimerNotesPreview\(\)/,
  'Timer should render notes through a dedicated preview function');
assert.match(options, /renderMarkdownPreview\(\$\('mgTimerNotes'\)\.value/,
  'Timer notes preview should reuse the Markdown renderer');
assert.match(options, /mgTimerNotesPreviewToggle.*addEventListener\('click'/s,
  'Timer notes preview should be user-toggleable');
assert.match(css, /\.timer-notes-preview\s*\{[^}]*max-height:\s*360px[^}]*overflow-y:\s*auto/s,
  'Timer notes preview should have a bounded scrollable height');

console.log('timer markdown preview contract passed');
