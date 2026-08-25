import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToHtml } from './markdown.ts';

test('renders the shared Markdown compatibility contract', () => {
  const html = markdownToHtml('# 標題\n\n**完成**\n\n- 一\n- 二\n\n`code`');
  assert.match(html, /<h1>標題<\/h1>/);
  assert.match(html, /<strong>完成<\/strong>/);
  assert.match(html, /<ul>[\s\S]*<li>一<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<code>code<\/code>/);
  assert.ok(!markdownToHtml('<script>alert(1)</script>').includes('<script>'));
  assert.equal(markdownToHtml('Before\n\n---\n\nAfter'), '<p>Before</p><hr><p>After</p>');
  assert.match(markdownToHtml('- [ ] Open\n- [x] Done'), /type="checkbox"/);
  assert.match(markdownToHtml('| A | B |\n| --- | --- |\n| x | y |'), /<table>/);
});
