import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const optionsPath = fileURLToPath(new URL('../src/options/options.js', import.meta.url));

assert.doesNotThrow(
  () => execFileSync(process.execPath, [
    '--experimental-vm-modules',
    '-e',
    "const fs = require('node:fs'); const vm = require('node:vm'); new vm.SourceTextModule(fs.readFileSync(process.argv[1], 'utf8'));",
    optionsPath,
  ], { stdio: 'pipe' }),
  'options.js should parse as an ES module',
);
