import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLiveness, readNewLines } from './parse.mjs';

test('liveness from mtimes', () => {
  const now = 1_000_000;
  const l = computeLiveness({ now, folderExists: true, memberMtimes: { a: now - 5000, b: now - 90000 }, activeMs: 30000 });
  assert.equal(l.team, 'live');
  assert.equal(l.members.a, 'active');
  assert.equal(l.members.b, 'idle');
});

test('missing folder => ended', () => {
  assert.equal(computeLiveness({ now: 1, folderExists: false, memberMtimes: {} }).team, 'ended');
});

test('readNewLines returns whole lines and a stable offset on partial tail', () => {
  const buf = Buffer.from('aaa\nbbb\nccc');     // "ccc" has no newline yet
  const r = readNewLines(0, buf);
  assert.deepEqual(r.lines, ['aaa', 'bbb']);
  assert.equal(r.offset, 8);                     // start of "ccc"
  const r2 = readNewLines(r.offset, Buffer.from('aaa\nbbb\nccc\n'));
  assert.deepEqual(r2.lines, ['ccc']);
});
