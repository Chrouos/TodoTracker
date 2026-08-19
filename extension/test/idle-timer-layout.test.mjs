import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');

assert.match(popup, /db\.resolveIdleTimer\(0\)/);
assert.match(popup, /db\.resolveIdleTimer\(sec\)/);

const idleDropStart = popup.indexOf("$('idleDrop').addEventListener");
assert.notEqual(idleDropStart, -1);
const idleDrop = popup.slice(idleDropStart, idleDropStart + 500);
assert.doesNotMatch(idleDrop, /db\.stopTimer\(/);
