import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

assert.deepEqual(
  manifest.externally_connectable,
  { matches: ['http://localhost/*', 'http://127.0.0.1/*'] },
  'Manifest should allow the web bridge only from local development origins',
);
