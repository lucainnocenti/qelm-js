import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../scripts/build.mjs';
import * as source from '../src/index.js';
import * as bundled from '../dist/qelm.js';

test('dist/qelm.js is up to date (run npm run build)', () => {
  assert.equal(readFileSync(new URL('../dist/qelm.js', import.meta.url), 'utf8'), bundle());
});

test('bundle exports exactly the source API', () => {
  assert.deepEqual(Object.keys(bundled).sort(), Object.keys(source).sort());
  const a = new bundled.Random(5), b = new source.Random(5);
  assert.equal(a.normal(), b.normal());
});
