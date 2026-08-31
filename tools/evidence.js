#!/usr/bin/env node
/** Inspect retained session/result bundles without re-entering measurements. */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, stableHash, validateArtifactRef } from '@fnaf2-1020/core/contracts';
import { validateManifest } from '@fnaf2-1020/runtime';
import { replayModelResult } from '@fnaf2-1020/research';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ARTIFACTS = join(ROOT, 'artifacts');
const help = () => console.log('Usage: npm run evidence -- <list|show|diff|replay|why|promote> [RUN_ID]');

async function readVerifiedArtifact(base, ref) {
  const artifact = validateArtifactRef(ref);
  if (typeof artifact.locator !== 'string' || artifact.locator.startsWith('/') ||
      artifact.locator.split('/').some(part => part === '..'))
    throw new Error('artifact locator must remain inside its run bundle');
  const text = await readFile(join(base, artifact.locator), 'utf8');
  if (stableHash(text) !== artifact.hash || Buffer.byteLength(text) !== artifact.size)
    throw new Error(`artifact integrity mismatch: ${artifact.locator}`);
  return text;
}

async function load(run) {
  if (!run || !/^[\w-]+$/.test(run)) throw new Error('a safe RUN_ID is required');
  const base = join(ARTIFACTS, run);
  const result = JSON.parse(await readFile(join(base, 'result.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(base, 'session-manifest.json'), 'utf8'));
  validateManifest(manifest);
  if (typeof result.evidenceId !== 'string' || typeof result.claimLevel !== 'string') throw new Error('result lacks evidence identity or claim ceiling');
  if (manifest.id !== result.evidenceId) throw new Error('result and manifest identify different runs');
  if (manifest.resultHash && manifest.resultHash !== result.resultHash)
    throw new Error('manifest result hash does not match the result');
  if (manifest.specHash && manifest.specHash !== result.specHash)
    throw new Error('manifest spec hash does not match the result');
  if (manifest.artifacts.result?.schema === 'artifact-ref-v1') {
    await readVerifiedArtifact(base, manifest.artifacts.result);
    const payload = { ...result };
    delete payload.resultHash;
    if (result.resultHash !== stableHash(payload)) throw new Error('result hash does not match its payload');
  }
  let spec = null;
  if (manifest.artifacts.spec?.schema === 'artifact-ref-v1') {
    const specText = await readVerifiedArtifact(base, manifest.artifacts.spec);
    spec = JSON.parse(specText);
    if (result.specHash !== stableHash(spec)) throw new Error('experiment spec hash does not match the result');
  }
  if (manifest.manifestHash) {
    const manifestPayload = { ...manifest };
    delete manifestPayload.manifestHash;
    const fullPayloadMatches = manifest.manifestHash === stableHash(manifestPayload);
    const servicePayloadMatches = manifest.manifestHash === stableHash({
      id: manifest.id, profileHash: manifest.profileHash, modelHash: manifest.modelHash,
      policyHash: manifest.policyHash, events: manifest.events, artifacts: manifest.artifacts,
    });
    if (!fullPayloadMatches && !servicePayloadMatches) throw new Error('manifest hash does not match its payload');
  }
  return { result, manifest, spec };
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
    const { result, manifest, spec } = await load(first);
    if (!manifest.events?.length || !manifest.profileHash || !result.evidenceId) throw new Error('bundle lacks replay inputs');
    if (!manifest.reproducer?.case || !spec) throw new Error('bundle does not contain a deterministic experiment spec');
    if (spec.id !== manifest.reproducer.case) throw new Error('reproducer case does not match experiment spec');
    const { evaluation, resultHash: replayHash } = replayModelResult(spec, result);
    if (replayHash !== result.resultHash) throw new Error(`replay result hash mismatch: ${replayHash} != ${result.resultHash}`);
    return console.log(`replay=${result.evidenceId} evaluations=${evaluation.evaluations.length} resultHash=${replayHash} status=REPLAYED`);
  }
  if (operation === 'why') {
    const { manifest } = await load(first);
    return console.log(JSON.stringify({ schema: 'causal-trace-v1', run: first, events: manifest.events.map(event => ({ type: event.type, component: event.component, at: event.at, data: event.data })) }, null, 2));
  }
  if (operation === 'promote') {
    const { result, manifest } = await load(first);
    const checks = {
      offlineEvidence: result.claimLevel === 'DEVICE_MEASURED',
      terminalPass: result.outcome === 'PASS',
      manifestComplete: manifest.outcome === 'COMPLETED' && Boolean(manifest.artifacts?.result),
      plan12Attestation: manifest.plan12Gate?.status === 'PASS',
    };
    const accepted = Object.values(checks).every(Boolean);
    return console.log(JSON.stringify({
      schema: 'plan12-promotion-gate-v1', evidenceId: result.evidenceId,
      authority: 'plans/12-end-to-end-evidence-campaign.md', accepted, checks,
      status: accepted ? 'READY_FOR_REVIEW' : 'REFUSED',
      reason: accepted ? null : 'Plan 12 requires external evidence, a passing terminal result, and an explicit gate attestation',
    }, null, 2));
  }
  throw new Error(`unknown evidence operation: ${operation}`);
}

main(process.argv.slice(2)).catch(error => { console.error(`evidence: ${error.message}`); process.exitCode = 2; });
