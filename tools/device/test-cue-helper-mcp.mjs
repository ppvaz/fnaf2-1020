#!/usr/bin/env node
/** Stdio MCP contract test for the safe Cue Helper server. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const temp = await mkdtemp(join(tmpdir(), 'fnaf2-cue-helper-mcp-'));
const child = spawn(process.execPath, [join(root, 'tools/device/cue-helper-mcp.mjs')], {
  cwd: root,
  env: { ...process.env, CUE_HELPER_QUEUE_FILE: join(temp, 'jobs.json'), ANDROID_SERIAL: 'missing-device' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = createInterface({ input: child.stdout });
const next = async () => {
  const [line] = await once(lines, 'line');
  return JSON.parse(line);
};
const send = request => child.stdin.write(`${JSON.stringify(request)}\n`);

try {
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  const initialized = await next();
  assert.equal(initialized.result.serverInfo.name, 'fnaf2-cue-helper');

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const listed = await next();
  const names = listed.result.tools.map(tool => tool.name);
  assert.deepEqual(names, ['cue.setup', 'cue.queue.enqueue', 'cue.queue.list', 'cue.queue.run']);
  assert.equal(names.includes('shell.exec'), false);

  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'cue.queue.enqueue', arguments: { kind: 'menu-check' },
  } });
  const queued = await next();
  const queuedValue = JSON.parse(queued.result.content[0].text);
  assert.equal(queuedValue.status, 'QUEUED');

  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
    name: 'cue.queue.enqueue', arguments: {
      kind: 'menu-check', idempotencyKey: 'mcp-retry-menu-check',
    },
  } });
  const keyed = JSON.parse((await next()).result.content[0].text);
  assert.equal(keyed.status, 'QUEUED');

  send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: {
    name: 'cue.queue.enqueue', arguments: {
      kind: 'menu-check', idempotencyKey: 'mcp-retry-menu-check',
    },
  } });
  const keyedAgain = JSON.parse((await next()).result.content[0].text);
  assert.equal(keyedAgain.status, 'EXISTING');
  assert.equal(keyedAgain.job.id, keyed.job.id);

  send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'cue.queue.list', arguments: {} } });
  const listedJobs = JSON.parse((await next()).result.content[0].text);
  assert.equal(listedJobs.jobs.length, 2);
  assert.equal(listedJobs.jobs[0].state, 'PENDING');

  send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
    name: 'cue.queue.run', arguments: { waitSeconds: 0 },
  } });
  const held = JSON.parse((await next()).result.content[0].text);
  assert.equal(held.status, 'HOLD');
  assert.equal(held.ok, true);
} finally {
  child.kill('SIGTERM');
  await once(child, 'close').catch(() => {});
  lines.close();
  await rm(temp, { recursive: true, force: true });
}

console.log('Cue Helper stdio MCP initialize, tool catalog, queue, and safe hold passed');
