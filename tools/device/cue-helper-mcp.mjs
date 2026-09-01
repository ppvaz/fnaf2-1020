#!/usr/bin/env node
/**
 * Minimal stdio MCP server for the safe Cue Helper setup/queue boundary.
 *
 * The server deliberately exposes no actuator, shell, coordinate, HID, or
 * game-control tool. Messages use MCP's newline-delimited JSON-RPC transport.
 */
import { createCueHelperMcp } from '../../apps/device/src/mcp.js';

const cue = createCueHelperMcp();
const SERVER = Object.freeze({ name: 'fnaf2-cue-helper', version: '0.1.0' });
const NO_ARGS = Object.freeze({ type: 'object', additionalProperties: false, properties: {} });
const SAFE = Object.freeze({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });

const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'cue.setup',
    description: 'Run the image-free Cue Helper setup and screen check. Uses only named helper/system controls; never taps the game or writes qualification evidence.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      install: { type: 'boolean', description: 'Install the checked-in helper APK first.' },
      probe: { type: 'boolean', description: 'Start the debug-only sensor probe; does not qualify the overlay.' },
      stop: { type: 'boolean', description: 'Stop helper capture and leave the target game unchanged.' },
      screen: { type: 'string', enum: ['menu', 'night'], default: 'menu' },
      waitSeconds: { type: 'number', minimum: 1, maximum: 300, default: 20 },
    }},
    annotations: SAFE,
  },
  {
    name: 'cue.queue.enqueue',
    description: 'Persist one safe setup or screen-check job. It works while the phone is absent or locked and performs no game input.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['kind'], properties: {
      kind: { type: 'string', enum: ['setup', 'menu-check', 'night-check'] },
      screen: { type: 'string', enum: ['menu', 'night'] },
      install: { type: 'boolean', description: 'For setup only: install the checked-in helper APK.' },
      probe: { type: 'boolean', description: 'For setup only: start the debug-only sensor probe.' },
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 128, description: 'Optional stable key: retries return the existing job.' },
    }},
    annotations: SAFE,
  },
  {
    name: 'cue.queue.list',
    description: 'List persisted Cue Helper jobs and their PENDING/RUNNING/DONE/FAILED state.',
    inputSchema: NO_ARGS,
    annotations: { ...SAFE, readOnlyHint: true },
  },
  {
    name: 'cue.queue.run',
    description: 'Run pending safe jobs only when exactly one ADB device is awake and unlocked. Otherwise returns HOLD and leaves jobs pending; it never auto-unlocks or taps the game.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      waitSeconds: { type: 'number', minimum: 0, maximum: 86400, default: 0, description: 'Keep polling for a ready phone for this many seconds.' },
      intervalSeconds: { type: 'number', minimum: 0.1, maximum: 300, default: 5 },
    }},
    annotations: SAFE,
  },
]);

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handle(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string')
    return rpcError(request?.id, -32600, 'invalid JSON-RPC request');
  if (request.method === 'notifications/initialized' || request.method.startsWith('notifications/')) return null;
  if (request.method === 'ping') return { jsonrpc: '2.0', id: request.id, result: {} };
  if (request.method === 'initialize') {
    const requested = request.params?.protocolVersion;
    return { jsonrpc: '2.0', id: request.id, result: {
      protocolVersion: typeof requested === 'string' ? requested : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions: 'Use cue.queue.enqueue while the device is absent or locked; cue.queue.run holds safely until the device is awake and unlocked.',
    } };
  }
  if (request.method === 'tools/list')
    return { jsonrpc: '2.0', id: request.id, result: { tools: TOOL_DEFINITIONS } };
  if (request.method === 'tools/call') {
    const name = request.params?.name;
    if (typeof name !== 'string') return rpcError(request.id, -32602, 'tools/call requires a tool name');
    const result = await cue.call(name, request.params?.arguments ?? {});
    return { jsonrpc: '2.0', id: request.id, result: {
      isError: result.ok === false,
      content: [{ type: 'text', text: JSON.stringify(result) }],
    } };
  }
  return rpcError(request.id, -32601, `method not found: ${request.method}`);
}

let buffer = '';
let serial = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    serial = serial.then(async () => {
      let request;
      try { request = JSON.parse(line); }
      catch { write(rpcError(null, -32700, 'parse error')); return; }
      try {
        const response = await handle(request);
        if (response) write(response);
      } catch (cause) {
        if (request.id !== undefined) write(rpcError(request.id, -32603, cause.message));
      }
    });
  }
});
