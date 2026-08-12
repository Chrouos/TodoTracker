import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');

assert.match(html, /id="tdParent"/, 'Todo 表單應提供上層任務選擇');
assert.match(options, /parentId:/, '儲存 Todo 時應保留上層任務');
assert.match(options, /flattenTaskTree/, 'Todo 清單應使用任務樹排序');
assert.match(css, /\.task-item[^}]*padding-left/s, '子任務應有明顯階層樣式');

console.log('task hierarchy contract passed');
