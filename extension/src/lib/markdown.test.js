import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMarkdownShortcut,
  markdownToHTML,
  renderBlocks,
  renderMarkdown,
  shouldShowMarkdownToggle,
  toggleTaskItem,
} from './markdown.js';

test('detects quote and fenced-code shortcuts only at an empty block start', () => {
  assert.deepEqual(detectMarkdownShortcut('> '), { type: 'quote' });
  assert.deepEqual(detectMarkdownShortcut('``` '), { type: 'codeBlock' });
  assert.equal(detectMarkdownShortcut('text > '), null);
  assert.equal(detectMarkdownShortcut('```` '), null);
});

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

test('renders lists that end with a trailing newline', () => {
  assert.equal(
    markdownToHTML('- First\n'),
    '<ul><li>First</li></ul>',
  );
});

test('renders blockquotes as blockquote elements', () => {
  assert.equal(markdownToHTML('> Quoted text'), '<blockquote><p>Quoted text</p></blockquote>');
});

test('renders Markdown horizontal rules as full-width hr elements', () => {
  assert.equal(markdownToHTML('Before\n\n---\n\nAfter'), '<p>Before</p><hr><p>After</p>');
});

test('renders fenced code and escapes code content', () => {
  assert.equal(
    markdownToHTML('```js\nconst value = <tag>;\n```'),
    '<pre><code class="language-js">const value = &lt;tag&gt;;</code></pre>',
  );
});

test('escapes raw HTML in normal content and inline code', () => {
  assert.equal(
    markdownToHTML('<script>alert(1)</script> and `<tag>`'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; and <code>&lt;tag&gt;</code></p>',
  );
});

test('keeps Markdown syntax literal inside inline code', () => {
  assert.equal(
    markdownToHTML('`**literal**`'),
    '<p><code>**literal**</code></p>',
  );
});

test('treats indented fences as literal paragraph text in the shared contract', () => {
  assert.equal(
    markdownToHTML('   ```\n<literal>\n   ```'),
    '<p>   ``<code>\n&lt;literal&gt;\n   </code>``</p>',
  );
});

test('renders markdown tables with aligned cells and inline markdown', () => {
  assert.equal(
    markdownToHTML('| Name | Hours | Note |\n| :--- | ---: | :---: |\n| **API** | 2h | `fast` |'),
    '<table><thead><tr><th style="text-align:left">Name</th><th style="text-align:right">Hours</th><th style="text-align:center">Note</th></tr></thead><tbody><tr><td style="text-align:left"><strong>API</strong></td><td style="text-align:right">2h</td><td style="text-align:center"><code>fast</code></td></tr></tbody></table>',
  );
});

test('escapes table cells and pads short rows', () => {
  assert.equal(
    markdownToHTML('| A | B |\n| --- | --- |\n| <x> |'),
    '<table><thead><tr><th style="text-align:left">A</th><th style="text-align:left">B</th></tr></thead><tbody><tr><td style="text-align:left">&lt;x&gt;</td><td style="text-align:left"></td></tr></tbody></table>',
  );
});

test('only shows the toggle when the note is textually and visually long', () => {
  assert.equal(shouldShowMarkdownToggle('15:34 等待中', 240, 180), false);
  assert.equal(shouldShowMarkdownToggle('x'.repeat(121), 240, 180), true);
  assert.equal(shouldShowMarkdownToggle('x'.repeat(121), 200, 180), false);
});

test('renders escaped table pipes as cell content rather than delimiters', () => {
  assert.equal(
    markdownToHTML('| A | B |\n| --- | --- |\n| left\\|right | `code\\|pipe` |'),
    '<table><thead><tr><th style="text-align:left">A</th><th style="text-align:left">B</th></tr></thead><tbody><tr><td style="text-align:left">left|right</td><td style="text-align:left"><code>code|pipe</code></td></tr></tbody></table>',
  );
});

test('uses the shared renderer for disabled read-only task checkboxes', () => {
  assert.equal(
    markdownToHTML('- [ ] Open\n- [x] Done'),
    '<ul class="markdown-task-list"><li><input type="checkbox" class="task-checkbox" disabled>Open</li><li><input type="checkbox" class="task-checkbox" disabled checked>Done</li></ul>',
  );
});

test('gives mixed nested task lists unique paths consumed by the toggle resolver', () => {
  const html = renderMarkdown('- Parent\n  - Plain child\n  - [ ] Nested task\n- [ ] Sibling task', { interactiveTasks: true });
  assert.match(html, /data-markdown-task-path="0\.0\.1\.0"/);
  assert.match(html, /data-markdown-task-path="1\.0"/);
});

test('uses every mixed child-block index and toggles only task B', () => {
  const blocks = [{ type: 'list', ordered: false, items: [{ inlines: [{ type: 'text', value: 'Parent' }], children: [
    { type: 'taskList', items: [{ checked: false, inlines: [{ type: 'text', value: 'Task A' }], children: [] }] },
    { type: 'paragraph', inlines: [{ type: 'text', value: 'Plain child block' }] },
    { type: 'taskList', items: [{ checked: false, inlines: [{ type: 'text', value: 'Task B' }], children: [] }] },
  ] }] }];
  const html = renderBlocks(blocks, { interactiveTasks: true });

  assert.match(html, /data-markdown-task-path="0\.0\.0\.0"/);
  assert.match(html, /data-markdown-task-path="0\.0\.2\.0"/);
  const next = toggleTaskItem(blocks, [0, 0, 2, 0]);
  assert.equal(next[0].items[0].children[0].items[0].checked, false);
  assert.equal(next[0].items[0].children[2].items[0].checked, true);
});

test('renders nested quote, list, and task paths with accessible escaped context', () => {
  const blocks = [{ type: 'quote', blocks: [{ type: 'list', ordered: false, items: [{
    inlines: [{ type: 'text', value: 'Parent' }],
    children: [{ type: 'quote', blocks: [{ type: 'taskList', items: [{
      checked: false,
      inlines: [{ type: 'text', value: 'Ship <now> & "later"' }],
      children: [],
    }] }] }],
  }] }] }];
  const html = renderBlocks(blocks, { interactiveTasks: true });

  assert.match(html, /data-markdown-task-path="0\.0\.0\.0\.0\.0"/);
  assert.match(html, /aria-label="Toggle task Ship &lt;now&gt; &amp; &quot;later&quot; \(0\.0\.0\.0\.0\.0\)"/);
  const next = toggleTaskItem(blocks, [0, 0, 0, 0, 0, 0]);
  assert.equal(next[0].blocks[0].items[0].children[0].blocks[0].items[0].checked, true);
});
