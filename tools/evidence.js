#!/usr/bin/env node
/** Inspect retained session/result bundles without re-entering measurements. */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, stableHash, validateArtifactRef } from '@fnaf2-1020/core/contracts';
import { validateManifest } from '@fnaf2-1020/runtime';
import { replayModelResult } from '@fnaf2-1020/research';
import { BUNDLE_SCHEMA, validateBundle } from './device/bundle.mjs';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ARTIFACTS = join(ROOT, 'artifacts');
const SESSION_RESULT_SCHEMAS = new Set(['device-run-result-v1', 'experiment-result-v1']);
const CLAIM_LEVELS = new Set(['MODEL_ONLY', 'FIXTURE', 'DEVICE_MEASURED']);
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
  if (!SESSION_RESULT_SCHEMAS.has(result.schema)) throw new Error('result schema is not a supported session result');
  if (typeof result.evidenceId !== 'string' || typeof result.claimLevel !== 'string' ||
      typeof result.outcome !== 'string' || !CLAIM_LEVELS.has(result.claimLevel))
    throw new Error('result lacks evidence identity, outcome, or valid claim ceiling');
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

async function loadDeviceBundle(run) {
  if (!run || !/^[\w-]+$/.test(run)) throw new Error('a safe RUN_ID is required');
  const base = join(ARTIFACTS, run);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8'));
  if (manifest.schema !== BUNDLE_SCHEMA) throw new Error('not a device bundle');
  return { bundle: validateBundle(base), kind: 'device-bundle' };
}

async function loadAny(run) {
  try { return { ...(await load(run)), kind: 'session' }; }
  catch (sessionError) {
    try { return await loadDeviceBundle(run); }
    catch { throw sessionError; }
  }
}

async function list() {
  let entries = [];
  try { entries = await readdir(ARTIFACTS, { withFileTypes: true }); } catch { /* no runs is a valid clean checkout */ }
  const runs = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const base = join(ARTIFACTS, entry.name);
    try {
      const { result } = await load(entry.name);
      runs.push({ id: result.evidenceId, kind: 'session', outcome: result.outcome,
        claimLevel: result.claimLevel, profile: result.profile });
      continue;
    } catch { /* classify the other retained artifact families below */ }
    try {
      const result = JSON.parse(await readFile(join(base, 'result.json'), 'utf8'));
      if (SESSION_RESULT_SCHEMAS.has(result.schema)) {
        runs.push({ id: result.evidenceId ?? entry.name, kind: 'session', outcome: 'INVALID_SESSION',
          reason: 'session result or manifest failed validation' });
        continue;
      }
    } catch { /* not a session result; inspect device and historical schemas */ }
    try {
      const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8'));
      if (manifest.schema === BUNDLE_SCHEMA) {
        try {
          const bundle = validateBundle(base);
          runs.push({ id: entry.name, kind: 'device-bundle', outcome: 'READY',
            claimLevel: bundle.manifest.gate?.claimLevel ?? 'MODEL_ONLY',
            profile: bundle.profile.id });
        } catch (error) {
          runs.push({ id: entry.name, kind: 'device-bundle', outcome: 'INVALID_BUNDLE',
            reason: error.message });
        }
      } else {
        // Historical manifests are retained for diagnosis, but are not runtime
        // session bundles and must not be reported as malformed current runs.
        runs.push({ id: entry.name, kind: 'legacy-artifact', outcome: 'LEGACY_ARCHIVE' });
      }
      continue;
    } catch { /* no manifest: distinguish scratch output from a known bundle */ }
    try {
      const winner = JSON.parse(await readFile(join(base, 'winner.json'), 'utf8'));
      runs.push({ id: entry.name, kind: winner.schema === 'winner-v1' ? 'incomplete-device-bundle' : 'unindexed',
        outcome: 'INCOMPLETE_BUNDLE' });
    } catch {
      runs.push({ id: entry.name, kind: 'unindexed', outcome: 'UNRECOGNIZED_ARTIFACT' });
    }
  }
  console.log(JSON.stringify({ schema: 'evidence-index-v1', runs }, null, 2));
}

const stable = value => canonicalJson(value);

async function main([operation = 'help', first, second]) {
  if (operation === 'help' || operation === '--help') return help();
  if (operation === 'list') return list();
  if (operation === 'show') return console.log(JSON.stringify(await loadAny(first), null, 2));
  if (operation === 'diff') {
    const [left, right] = await Promise.all([load(first), load(second)]);
    const changes = [];
    if (stable(left.result) !== stable(right.result)) changes.push('result');
    if (stable(left.manifest) !== stable(right.manifest)) changes.push('manifest');
    return console.log(JSON.stringify({ schema: 'evidence-diff-v1', left: first, right: second, changed: changes }, null, 2));
  }
  if (operation === 'replay') {
    const loaded = await loadAny(first);
    if (loaded.kind === 'device-bundle') {
      const { bundle } = loaded;
      return console.log(`replay=${first} evaluations=${bundle.replay.results.length} resultHash=${bundle.manifest.replay.hash} status=REPLAYED`);
    }
    const { result, manifest, spec } = loaded;
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
    const loaded = await loadAny(first);
    if (loaded.kind === 'device-bundle') {
      const { bundle } = loaded;
      const gate = bundle.manifest.gate ?? {};
      const checks = {
        offlineEvidence: gate.claimLevel === 'DEVICE_MEASURED',
        terminalPass: gate.status === 'PASS' && bundle.replay.results.every(item => item.won === true),
        manifestComplete: true,
        plan12Attestation: bundle.manifest.plan12Gate?.status === 'PASS',
      };
      const accepted = Object.values(checks).every(Boolean);
      return console.log(JSON.stringify({
        schema: 'plan12-promotion-gate-v1', evidenceId: first,
        authority: 'plans/12-end-to-end-evidence-campaign.md', accepted, checks,
        status: accepted ? 'READY_FOR_REVIEW' : 'REFUSED',
        reason: accepted ? null : 'Plan 12 requires external evidence, a passing terminal result, and an explicit gate attestation',
      }, null, 2));
    }
    const { result, manifest } = loaded;
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
