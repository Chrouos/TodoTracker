import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridge = await readFile(new URL('../../web/lib/bridge.ts', import.meta.url), 'utf8');

assert.match(
  bridge,
  /process\.env\.NEXT_PUBLIC_EXTENSION_ID \|\| 'ifgemlmkijpnmeiniemmpmchpibicgon'/,
  'Web bridge should default to the published Chrome Web Store item ID',
);
