import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHTML } from './markdown.js';

test('renders headings as h1 elements', () => {
  assert.equal(markdownToHTML('# Heading'), '<h1>Heading</h1>');
});

test('renders consecutive unordered items in one ul', () => {
  assert.equal(
    markdownToHTML('- First\n- Second'),
    '<ul><li>First</li><li>Second</li></ul>',
  );
});

test('renders consecutive ordered items in one ol', () => {
  assert.equal(
    markdownToHTML('1. First\n2. Second'),
    '<ol><li>First</li><li>Second</li></ol>',
  );
});

test('renders blockquotes as blockquote elements', () => {
  assert.equal(markdownToHTML('> Quoted text'), '<blockquote>Quoted text</blockquote>');
});

test('renders fenced code and escapes code content', () => {
  assert.equal(
    markdownToHTML('```js\nconst value = <tag>;\n```'),
    '<pre><code>const value = &lt;tag&gt;;</code></pre>',
  );
});

test('escapes raw HTML in normal content and inline code', () => {
  assert.equal(
    markdownToHTML('<script>alert(1)</script> and `<tag>`'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; and <code>&lt;tag&gt;</code></p>',
  );
});
