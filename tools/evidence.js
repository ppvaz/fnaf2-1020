#!/usr/bin/env node
/** Inspect retained session/result bundles without re-entering measurements. */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@fnaf2-1020/core/contracts';
import { validateManifest } from '@fnaf2-1020/runtime';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ARTIFACTS = join(ROOT, 'artifacts');
const help = () => console.log('Usage: npm run evidence -- <list|show|diff|replay|why|promote> [RUN_ID]');

async function load(run) {
  if (!run || !/^[\w-]+$/.test(run)) throw new Error('a safe RUN_ID is required');
  const base = join(ARTIFACTS, run);
  const result = JSON.parse(await readFile(join(base, 'result.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(base, 'session-manifest.json'), 'utf8'));
  validateManifest(manifest);
  if (typeof result.evidenceId !== 'string' || typeof result.claimLevel !== 'string') throw new Error('result lacks evidence identity or claim ceiling');
  return { result, manifest };
}

async function list() {
  let entries = [];
  try { entries = await readdir(ARTIFACTS, { withFileTypes: true }); } catch { /* no runs is a valid clean checkout */ }
  const runs = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try { const { result } = await load(entry.name); runs.push({ id: result.evidenceId, outcome: result.outcome, claimLevel: result.claimLevel, profile: result.profile }); }
    catch { runs.push({ id: entry.name, outcome: 'INVALID_BUNDLE' }); }
  }
  console.log(JSON.stringify({ schema: 'evidence-index-v1', runs }, null, 2));
}

const stable = value => canonicalJson(value);

async function main([operation = 'help', first, second]) {
  if (operation === 'help' || operation === '--help') return help();
  if (operation === 'list') return list();
  if (operation === 'show') return console.log(JSON.stringify(await load(first), null, 2));
  if (operation === 'diff') {
    const [left, right] = await Promise.all([load(first), load(second)]);
    const changes = [];
    if (stable(left.result) !== stable(right.result)) changes.push('result');
    if (stable(left.manifest) !== stable(right.manifest)) changes.push('manifest');
    return console.log(JSON.stringify({ schema: 'evidence-diff-v1', left: first, right: second, changed: changes }, null, 2));
  }
  if (operation === 'replay') {
    const { result, manifest } = await load(first);
    if (!manifest.events?.length || !manifest.profileHash || !result.evidenceId) throw new Error('bundle lacks replay inputs');
    return console.log(`replay=${result.evidenceId} events=${manifest.events.length} claim=${result.claimLevel} status=READY`);
  }
  if (operation === 'why') {
    const { manifest } = await load(first);
    return console.log(JSON.stringify({ schema: 'causal-trace-v1', run: first, events: manifest.events.map(event => ({ type: event.type, component: event.component, at: event.at, data: event.data })) }, null, 2));
  }
  if (operation === 'promote') {
    const { result } = await load(first);
    return console.log(`promotion=PROPOSAL evidence=${result.evidenceId} claimCeiling=${result.claimLevel} authority=plans/12-end-to-end-evidence-campaign.md`);
  }
  throw new Error(`unknown evidence operation: ${operation}`);
}

main(process.argv.slice(2)).catch(error => { console.error(`evidence: ${error.message}`); process.exitCode = 2; });
