import assert from 'node:assert/strict';
import { markdownToHtml } from './markdown';

const html = markdownToHtml('# 標題\n\n**完成**\n\n- 一\n- 二\n\n`code`');
assert.match(html, /<h1>標題<\/h1>/);
assert.match(html, /<strong>完成<\/strong>/);
assert.match(html, /<ul>[\s\S]*<li>一<\/li>[\s\S]*<\/ul>/);
assert.match(html, /<code>code<\/code>/);
assert.ok(!markdownToHtml('<script>alert(1)</script>').includes('<script>'));
