import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const FIX = join(here, 'fixtures');

test('fixtures load', () => {
  const cfg = JSON.parse(readFileSync(join(FIX, 'config.json'), 'utf8'));
  assert.equal(cfg.members.length, 3);
});
