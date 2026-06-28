import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { extractMessages } from './parse.mjs';

test('extracts SendMessage from a lead transcript', () => {
  const text = readFileSync(join(FIX, 'lead.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'lead');
  assert.equal(msgs.length, 2);
  assert.deepEqual(
    { from: msgs[0].from, to: msgs[0].to, type: msgs[0].type },
    { from: 'lead', to: 'backend', type: 'message' }
  );
  assert.match(msgs[0].body, /begin the orders API/);
  assert.equal(msgs[0].ts, '2026-06-27T09:13:00.000Z');
});

test('owner becomes the sender for a teammate transcript', () => {
  const text = readFileSync(join(FIX, 'sub-backend.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'backend');
  assert.equal(msgs[1].from, 'backend');
  assert.equal(msgs[1].to, 'team-lead');
  assert.equal(msgs[1].type, 'relay');
});

test('ignores blank and non-JSON lines', () => {
  assert.deepEqual(extractMessages('\nnot json\n{}\n', 'lead'), []);
});

test('captures an incoming lead→teammate <teammate-message> envelope', () => {
  const text = readFileSync(join(FIX, 'team-architect.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'architect');
  const incoming = msgs.find(m => m.from === 'team-lead');
  assert.ok(incoming, 'lead→teammate message must be captured from the teammate transcript');
  assert.equal(incoming.to, 'architect');
  assert.match(incoming.body, /begin the orders API/);
  assert.equal(incoming.summary, 'kickoff');
});

test('attributes outgoing from per-line agentName, not the owner arg', () => {
  const text = readFileSync(join(FIX, 'team-architect.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'WRONG-OWNER');
  const outgoing = msgs.find(m => m.to === 'backend');
  assert.ok(outgoing, 'outgoing SendMessage must be captured');
  assert.equal(outgoing.from, 'architect');
});

test('skips a <teammate-message> whose sender is the file owner (self-echo)', () => {
  const text = readFileSync(join(FIX, 'team-backend.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'backend');
  assert.ok(!msgs.some(m => m.body.includes('self-note')), 'self-addressed envelope must be skipped');
});

test('parses envelope attributes regardless of order (color before summary)', () => {
  const text = readFileSync(join(FIX, 'team-backend.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'backend');
  const fromArch = msgs.find(m => m.from === 'architect');
  assert.ok(fromArch, 'architect→backend incoming must be captured even with a color="" attr present');
  assert.equal(fromArch.summary, 'contract frozen');
});

test('object-valued message body is JSON-stringified, not [object Object]', () => {
  const line = JSON.stringify({
    timestamp: '2026-06-27T10:00:00.000Z',
    message: {
      content: [{
        type: 'tool_use',
        name: 'SendMessage',
        input: {
          to: 'x',
          type: 'shutdown_request',
          message: { reason: 'done', graceful: true },
        },
      }],
    },
  });
  const msgs = extractMessages(line, 'lead');
  assert.equal(msgs.length, 1);
  assert.equal(typeof msgs[0].body, 'string', 'body must be a string');
  assert.ok(msgs[0].body.includes('done'), `body should contain "done", got: ${msgs[0].body}`);
  assert.notEqual(msgs[0].body, '[object Object]', 'body must not be [object Object]');
});
