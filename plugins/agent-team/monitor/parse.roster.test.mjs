import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { buildRoster, extractMandates } from './parse.mjs';

const cfg = JSON.parse(readFileSync(join(FIX, 'config.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(FIX, 'meta.json'), 'utf8'));

test('merges meta role+model onto config members', () => {
  const r = buildRoster(cfg, meta);
  assert.equal(r.length, 3);
  assert.deepEqual(r[1], { name: 'backend', role: 'orders API & data', model: 'sonnet', agentId: 'a-back' });
});

test('falls back to agentType when meta is missing', () => {
  const r = buildRoster(cfg, null);
  assert.equal(r[0].role, 'architect');   // from "agent-team:architect"
  assert.equal(r[0].model, null);
});

test('mandates come from meta', () => {
  assert.equal(extractMandates(meta).length, 3);
  assert.deepEqual(extractMandates(null), []);
});
