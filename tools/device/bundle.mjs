// Winner -> device bundle compiler and validator.
//
// The bundle is deliberately a host-side, content-addressed handoff.  A
// runner may consume it, but it must not reconstruct a policy from loose
// environment variables.  New strategies register an emitter and a replay
// adapter below; the bundle format and validation gates stay shared.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitPlan as emitToysPlan, KNOBS0 as TOYS_KNOBS,
  replay as replayToys } from './minus-toys-plan.mjs';
import { build as buildMinus7, devicePlan as emitMinus7Plan,
  idleUntilMs as minus7IdleUntil, replay as replayMinus7 } from './recipe.mjs';
import { compileArtifactPlans, persistArtifactPlans } from './artifact-commands.mjs';
import { canonicalJson, stableHash, validateProfile } from '@fnaf2-1020/core/contracts';

export const WINNER_SCHEMA = 'winner-v1';
export const BUNDLE_SCHEMA = 'device-bundle-v1';
export const REPLAY_SCHEMA = 'bundle-replay-v1';
export const ARTIFACT_SCHEMA = 'device-artifact-v1';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '../..'));
const PROFILE_DIR = join(ROOT, 'apps/device/profiles');
const MAX_REPLAY_SEEDS = 8;
const CONTROL_NAMES = new Set([
  'monitor', 'mask', 'wind', 'hall', 'ventl',
  'cam4', 'cam5', 'cam7', 'cam9', 'cam10', 'cam11',
]);
const ROW_KINDS = new Set(['tap', 'hold', 'hall', 'hallraise', 'maskraise', 'sweep', 'read', 'camdrop']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`device bundle: ${message}`); };
const nonNegativeInt = (value, label) => {
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
  return value;
};
const sha256 = text => createHash('sha256').update(text).digest('hex');
const jsonRead = path => JSON.parse(readFileSync(path, 'utf8'));
const jsonWrite = (path, value) => writeFileSync(path, canonicalJson(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function normalizeStrategy(strategy) {
  const aliases = { 'minus-7': 'minus7', 'minus-07': 'minus7', 'minus_toys': 'minus-toys' };
  const normalized = aliases[strategy] ?? strategy;
  if (!['minus-toys', 'minus7'].includes(normalized))
    fail(`no device emitter is registered for strategy ${JSON.stringify(strategy)}`);
  return normalized;
}

function nightsOf(winner) {
  const nights = winner.nights ?? (winner.night === undefined ? undefined : [winner.night]);
  if (!Array.isArray(nights) || nights.length === 0) fail('nights must be a non-empty array');
  const unique = [...new Set(nights.map((night, index) => nonNegativeInt(night, `nights[${index}]`)))];
  if (unique.some(night => night < 1 || night > 7)) fail('nights must be in the range 1..7');
  if (unique.length !== nights.length) fail('nights must not contain duplicates');
  return unique;
}

function validateGate(gate, engineHash, nights, seeds) {
  if (!isRecord(gate)) fail('gate is required');
  if (gate.status !== 'PASS') fail(`gate status must be PASS, got ${JSON.stringify(gate.status)}`);
  if (gate.engineHash !== undefined && gate.engineHash !== engineHash)
    fail('gate.engineHash does not match winner.engineHash');
  if (gate.nights !== undefined && !same(gate.nights, nights)) fail('gate.nights does not match winner.nights');
  if (gate.seeds !== undefined && !same(gate.seeds, seeds)) fail('gate.seeds does not match winner.seeds');
  if (gate.claimLevel !== undefined && !['MODEL_ONLY', 'FIXTURE', 'DEVICE_MEASURED'].includes(gate.claimLevel))
    fail('gate.claimLevel is invalid');
  return gate;
}

export function validateWinner(input) {
  if (!isRecord(input) || input.schema !== WINNER_SCHEMA) fail('winner schema mismatch');
  const strategy = normalizeStrategy(input.strategy);
  if (!isRecord(input.knobs) && typeof input.knobs !== 'string') fail('knobs must be an object or named preset');
  if (strategy === 'minus7' && !isRecord(input.knobs)) fail('minus7 knobs must be an object');
  if (typeof input.engineHash !== 'string' || input.engineHash.length === 0) fail('engineHash is required');
  const nights = nightsOf(input);
  if (!Array.isArray(input.seeds) || input.seeds.length === 0) fail('seeds must be a non-empty array');
  const seeds = input.seeds.map((seed, index) => nonNegativeInt(seed, `seeds[${index}]`));
  if (input.replaySeeds !== undefined) {
    if (!Array.isArray(input.replaySeeds) || input.replaySeeds.length === 0)
      fail('replaySeeds must be a non-empty array when present');
    input.replaySeeds.forEach((seed, index) => nonNegativeInt(seed, `replaySeeds[${index}]`));
  }
  validateGate(input.gate, input.engineHash, nights, seeds);
  if (input.profile !== undefined && typeof input.profile !== 'string' && !isRecord(input.profile))
    fail('profile must be a profile id, path, or object');
  const knobs = strategy === 'minus-toys' ? toysKnobs(input.knobs) : { ...input.knobs };
  return { ...input, schema: WINNER_SCHEMA, strategy, nights, seeds, knobs };
}

function resolveProfile(spec) {
  if (isRecord(spec)) {
    validateProfile(spec);
    return spec;
  }
  const id = spec ?? 'fixture-hid-screencap';
  if (typeof id !== 'string' || id.length === 0) fail('profile id is invalid');
  const path = id.endsWith('.json') ? resolve(ROOT, id) : join(PROFILE_DIR, `${id}.json`);
  let profile;
  try { profile = jsonRead(path); } catch (error) {
    fail(`cannot read profile ${JSON.stringify(id)}: ${error.message}`);
  }
  validateProfile(profile);
  return profile;
}

function numberToken(value, label, { integer = false, positive = false } = {}) {
  if (!/^\d+(?:\.\d+)?$/.test(value ?? '')) fail(`${label} is not a non-negative number`);
  const result = Number(value);
  if (integer && !Number.isInteger(result)) fail(`${label} must be an integer`);
  if (positive && result <= 0) fail(`${label} must be positive`);
  return result;
}

function parseRow(line, cycle) {
  const fields = line.trim().split(/\s+/);
  const at = numberToken(fields.shift(), `${cycle} row time`, { integer: true });
  const kind = fields.shift();
  if (!ROW_KINDS.has(kind)) fail(`${cycle} contains unsupported instruction ${JSON.stringify(kind)}`);
  if (kind === 'tap' || kind === 'hold') {
    if (fields.length !== 2 || !CONTROL_NAMES.has(fields[0])) fail(`${cycle} ${kind} row has an unsupported control`);
    const duration = numberToken(fields[1], `${cycle} ${kind} contact`, { positive: true });
    return { at, kind, control: fields[0], duration };
  }
  if (kind === 'hall') {
    if (fields.length !== 1) fail(`${cycle} hall row shape is invalid`);
    return { at, kind, duration: numberToken(fields[0], `${cycle} hall contact`, { positive: true }) };
  }
  if (kind === 'hallraise') {
    if (fields.length !== 1) fail(`${cycle} hallraise row shape is invalid`);
    return { at, kind, duration: numberToken(fields[0], `${cycle} hallraise contact`, { positive: true }) };
  }
  if (kind === 'maskraise') {
    if (fields.length !== 3 || !['hall', 'up'].includes(fields[1])) fail(`${cycle} maskraise row shape is invalid`);
    const gap = numberToken(fields[0], `${cycle} maskraise gap`, { positive: true });
    const duration = numberToken(fields[2], `${cycle} maskraise duration`, { positive: true });
    if (gap <= 33) fail(`${cycle} maskraise gap must leave released time after the 33 ms mask contact`);
    return { at, kind, gap, mode: fields[1], duration };
  }
  if (kind === 'camdrop') {
    if (fields.length !== 3) fail(`${cycle} camdrop row shape is invalid`);
    return { at, kind, lead: numberToken(fields[0], `${cycle} camdrop lead`),
      contact: numberToken(fields[1], `${cycle} camdrop monitor contact`, { positive: true }),
      tail: numberToken(fields[2], `${cycle} camdrop tail`) };
  }
  if (kind === 'sweep') {
    if (fields.length !== 3) fail(`${cycle} sweep row shape is invalid`);
    const spacing = numberToken(fields[0], `${cycle} sweep spacing`, { positive: true });
    const contact = numberToken(fields[1], `${cycle} sweep contact`, { positive: true });
    const cams = fields[2].split(',');
    if (cams.length < 2 || cams.some(cam => !/^cam(?:4|5|7|9|10|11)(?::\d+)?$/.test(`cam${cam}`)))
      fail(`${cycle} sweep contains an unsupported camera list`);
    if (spacing <= contact) fail(`${cycle} sweep spacing must exceed contact`);
    for (const cam of cams) {
      const [name, override] = cam.split(':');
      if (override !== undefined) numberToken(override, `${cycle} sweep ${name} contact`, { positive: true });
    }
    return { at, kind, spacing, contact, cams };
  }
  // read duration gap [hallAt hallDuration [bangage hallAge]]
  if (fields.length < 2 || fields.length > 6) fail(`${cycle} read row shape is invalid`);
  const duration = numberToken(fields[0], `${cycle} read duration`, { positive: true });
  const gap = numberToken(fields[1], `${cycle} read gap`);
  if (fields.length === 2) return { at, kind, duration, gap };
  if (fields.length < 4) fail(`${cycle} read hall fields are incomplete`);
  const hallAt = numberToken(fields[2], `${cycle} read hall offset`);
  const hallDuration = numberToken(fields[3], `${cycle} read hall contact`, { positive: true });
  if (fields.length === 4) return { at, kind, duration, gap, hallAt, hallDuration };
  if (fields[4] !== 'bangage' || fields.length !== 6)
    fail(`${cycle} read conditional hall fields are invalid`);
  return { at, kind, duration, gap, hallAt, hallDuration,
    hallMode: 'bangage', hallAge: numberToken(fields[5], `${cycle} read bang age`, { positive: true }) };
}

function profileControlKey(control) {
  if (control === 'ventl') return 'ventL';
  if (/^cam\d+$/.test(control)) return `cam:${control.slice(3)}`;
  if (control === 'hall') return 'light';
  return control;
}

function assertProfileControls(row, profile, cycle) {
  if (!profile?.controlMap) fail('profile has no controlMap');
  const controls = row.kind === 'tap' || row.kind === 'hold' ? [row.control]
    : row.kind === 'camdrop' ? ['light', 'monitor']
      : row.kind === 'sweep' ? row.cams.map(cam => `cam${cam.split(':')[0]}`)
        : row.kind === 'read' ? ['ventl', 'mask', ...(row.hallAt === undefined ? [] : ['light'])]
          : row.kind === 'hall' || row.kind === 'hallraise' ? ['hall']
            : row.kind === 'maskraise' ? ['mask', row.mode === 'hall' ? 'hall' : 'monitor'] : [];
  for (const control of controls) {
    const key = profileControlKey(control);
    if (!Object.hasOwn(profile.controlMap, key)) fail(`${cycle} control ${control} is absent from profile.controlMap`);
  }
}

/** Parse and validate exactly the finite instruction vocabulary of the phone interpreter. */
export function parsePlan(text, { strategy, night, profile } = {}) {
  if (typeof text !== 'string' || text.length === 0) fail('plan text is required');
  const headers = {};
  const cycles = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const match = line.match(/^#(\S+)(?:\s+(.*))?$/);
      if (!match) fail('invalid plan header');
      const [, name, value = ''] = match;
      if (name === 'cycle') {
        const parts = value.split(/\s+/);
        if (!['opening', 'toys', 'clear', 'attack', 'finish'].includes(parts[0]))
          fail(`unknown cycle ${parts[0]}`);
        if (cycles[parts[0]]) fail(`duplicate cycle ${parts[0]}`);
        cycles[parts[0]] = { lengthMs: parts[1] === undefined ? null : numberToken(parts[1], `${parts[0]} length`), rows: [] };
        current = parts[0];
      } else {
        if (Object.hasOwn(headers, name)) fail(`duplicate #${name} header`);
        headers[name] = value;
      }
      continue;
    }
    if (!current) fail('plan row appears before a cycle header');
    cycles[current].rows.push(parseRow(line, current));
  }
  for (const required of ['policy', 'night', 'period', 'loop-start', 'stop-at', 'observe-until'])
    if (!Object.hasOwn(headers, required)) fail(`missing #${required} header`);
  const actualNight = numberToken(headers.night, '#night', { integer: true, positive: true });
  const period = numberToken(headers.period, '#period', { integer: true, positive: true });
  const loopStart = numberToken(headers['loop-start'], '#loop-start', { integer: true });
  const stopAt = numberToken(headers['stop-at'], '#stop-at', { integer: true });
  const observeUntil = numberToken(headers['observe-until'], '#observe-until', { integer: true });
  if (stopAt <= loopStart || observeUntil < stopAt) fail('plan observation bounds are invalid');
  if (strategy && headers.policy !== strategy) fail(`plan policy ${headers.policy} does not match ${strategy}`);
  if (night !== undefined && actualNight !== night) fail(`plan night ${actualNight} does not match ${night}`);
  if (!cycles.opening) fail('plan has no opening cycle');
  if (!cycles.toys && !cycles.clear) fail('plan has neither toys nor clear cycle');
  const maxActions = profile?.limits?.maxActions ?? Infinity;
  const maxDuration = profile?.limits?.maxDurationMs ?? Infinity;
  for (const [name, cycle] of Object.entries(cycles)) {
    if (cycle.rows.length > maxActions) fail(`${name} has ${cycle.rows.length} rows; profile allows ${maxActions}`);
    let previous = -1;
    for (const row of cycle.rows) {
      if (row.at < previous) fail(`${name} rows are not in non-decreasing time order`);
      previous = row.at;
      const durations = row.kind === 'tap' || row.kind === 'hold' || row.kind === 'hall' || row.kind === 'hallraise'
        ? [row.duration] : row.kind === 'camdrop' ? [row.lead, row.contact, row.tail]
          : row.kind === 'maskraise' ? [row.gap, row.duration] : row.kind === 'sweep'
            ? [row.spacing, row.contact, ...row.cams.map(cam => cam.includes(':') ? Number(cam.split(':')[1]) : row.contact)]
            : [row.duration, row.gap, ...(row.hallAt === undefined ? [] : [row.hallAt, row.hallDuration])];
      if (durations.some(value => value > maxDuration)) fail(`${name} has a timing above profile maxDurationMs=${maxDuration}`);
      assertProfileControls(row, profile, name);
    }
  }
  return { headers, night: actualNight, period, loopStart, stopAt, observeUntil, cycles };
}

function addCommonHeaders(raw, { strategy, night, period, loopStart, stopAt, observeUntil, idleUntil, lengths }) {
  const lines = raw.trimEnd().split(/\r?\n/).filter(Boolean);
  const insert = [`#policy ${strategy}`, `#night ${night}`, `#period ${period}`,
    `#loop-start ${loopStart}`, `#stop-at ${stopAt}`, `#observe-until ${observeUntil}`];
  if (idleUntil > 0) insert.push(`#idle-until ${idleUntil}`);
  const out = [];
  for (const line of lines) {
    if (line === `#policy ${strategy}`) {
      out.push(...insert);
    } else if (line.startsWith('#cycle ')) {
      const parts = line.split(/\s+/);
      const length = lengths[parts[1]];
      out.push(length === undefined || parts[2] !== undefined ? line : `${line} ${length}`);
    } else if (!line.startsWith('#night ') && !line.startsWith('#period ') &&
               !line.startsWith('#loop-start ') && !line.startsWith('#stop-at ') &&
               !line.startsWith('#observe-until ') && !line.startsWith('#idle-until ')) {
      out.push(line);
    }
  }
  return out.join('\n') + '\n';
}

function toysKnobs(input) {
  if (input === undefined || input === 'KNOBS0') return { ...TOYS_KNOBS };
  if (!isRecord(input)) fail('minus-toys knobs must be an object or KNOBS0');
  for (const key of Object.keys(input)) if (!Object.hasOwn(TOYS_KNOBS, key)) fail(`unknown minus-toys knob ${key}`);
  return { ...TOYS_KNOBS, ...input };
}

function minusToysEmitter(winner, night) {
  const knobs = toysKnobs(winner.knobs);
  const period = knobs.minimal ? knobs.minPeriodMs : knobs.loopPeriodMs;
  const raw = emitToysPlan(night, knobs);
  const text = addCommonHeaders(raw, { strategy: 'minus-toys', night, period,
    loopStart: knobs.minimal ? knobs.minLoopStartMs : 0,
    stopAt: knobs.minimal ? knobs.minStopAtMs : 420000,
    observeUntil: knobs.minimal ? knobs.minObserveUntilMs : 420000,
    idleUntil: 0, lengths: { opening: 7000, toys: period, finish: 420000 } });
  return { text, knobs, replay: seed => replayToys({ night, seed, knobs }) };
}

function minus7Emitter(winner, night) {
  const knobs = isRecord(winner.knobs) ? winner.knobs : {};
  const device = isRecord(winner.planOptions) ? winner.planOptions : {};
  const { search, searchKnobs, ...recipeKnobs } = knobs;
  const recipe = buildMinus7({ night, ...recipeKnobs, knobs: searchKnobs ?? search ?? {} });
  const plan = emitMinus7Plan(recipe, { ...device, knobs: searchKnobs ?? search ?? {} });
  const lengths = Object.fromEntries(Object.entries(recipe.cycles).map(([name, cycle]) => [name, cycle.lengthMs]));
  const lines = [`#policy minus7`, `#night ${night}`, `#period 5000`, `#loop-start 0`,
    `#stop-at 420000`, `#observe-until 420000`, `#idle-until ${minus7IdleUntil(night)}`];
  for (const [name, rows] of Object.entries(plan)) {
    lines.push(`#cycle ${name} ${lengths[name]}`);
    lines.push(...rows);
  }
  const text = lines.join('\n') + '\n';
  return { text, knobs, recipe, plan, replay: seed => replayMinus7(plan, { night, seed }) };
}

// This registry is the extension seam: a new strategy owns only its winner
// normalization/emission and replay adapter. The bundle validator, manifest,
// profile binding, hash checks, and trial handoff remain strategy-independent.
export const STRATEGY_REGISTRY = Object.freeze({
  'minus-toys': Object.freeze({ emit: minusToysEmitter,
    sources: Object.freeze(['tools/device/minus-toys-plan.mjs']) }),
  minus7: Object.freeze({ emit: minus7Emitter,
    sources: Object.freeze(['tools/device/recipe.mjs', 'tools/model/hid-device-pilot.mjs']) }),
});

function emitterFor(winner, night) {
  const strategy = normalizeStrategy(winner.strategy);
  return STRATEGY_REGISTRY[strategy].emit(winner, night);
}

function strategySourceDigest(strategy) {
  const sources = STRATEGY_REGISTRY[strategy].sources;
  const bytes = sources.map(path => `${path}\n${readFileSync(join(ROOT, path), 'utf8')}`).join('\n');
  return { sources, sha256: sha256(bytes) };
}

function replaySummary(strategy, result, seed, night) {
  const sim = result.sim;
  return { strategy, night, seed, won: !!sim.won, alive: !!sim.alive,
    death: sim.death?.reason ?? null, frame: sim.frame,
    traceHash: stableHash(sim.events), eventCount: sim.events.length,
    minBox: result.minBox ?? null, splitAt: result.splitAt ?? null,
    missed: result.missed ?? null, detections: result.detections ?? null };
}

function replayWinner(winner, emittedByNight, replaySeeds) {
  const results = [];
  for (const night of winner.nights) {
    const emitter = emittedByNight.get(night);
    for (const seed of replaySeeds) results.push(replaySummary(winner.strategy,
      emitter.replay(seed), seed, night));
  }
  return { schema: REPLAY_SCHEMA, seeds: replaySeeds, results,
    hash: stableHash({ strategy: winner.strategy, results }) };
}

function normalizedWinner(winner, replay) {
  return { ...winner, schema: WINNER_SCHEMA,
    gate: { ...winner.gate, engineHash: winner.engineHash,
      nights: winner.nights, seeds: winner.seeds, replayHash: replay.hash } };
}

function bundlePlanEntries(manifest, directory) {
  return manifest.plans.map(entry => {
    if (!isRecord(entry) || typeof entry.file !== 'string' || entry.file !== entry.file.split('/').pop() ||
        !/^night-[1-7]\.plan$/.test(entry.file)) fail('manifest contains an unsafe plan filename');
    const path = join(directory, entry.file);
    const text = readFileSync(path, 'utf8');
    if (sha256(text) !== entry.sha256) fail(`${entry.file} hash does not match manifest`);
    return { ...entry, text };
  });
}

function validateManifestShape(manifest) {
  if (!isRecord(manifest) || manifest.schema !== BUNDLE_SCHEMA) fail('manifest schema mismatch');
  if (!Array.isArray(manifest.plans) || manifest.plans.length === 0) fail('manifest has no plans');
  if (!isRecord(manifest.profile) || manifest.profile.file !== 'profile.json' || typeof manifest.profile.id !== 'string')
    fail('manifest profile reference is incomplete');
  if (!isRecord(manifest.replay) || manifest.replay.schema !== REPLAY_SCHEMA) fail('manifest replay is incomplete');
  if (!Array.isArray(manifest.replay.seeds) || manifest.replay.seeds.length === 0 ||
      typeof manifest.replay.hash !== 'string') fail('manifest replay reference is incomplete');
}

/** Compile a winner into a new bundle. Existing non-empty targets are refused. */
export function compileBundle(input, outDirectory) {
  const winner = validateWinner(input);
  const out = resolve(outDirectory);
  mkdirSync(out, { recursive: true });
  if (readdirSync(out, { withFileTypes: true }).length > 0) fail(`refusing to overwrite non-empty output ${out}`);
  const profile = resolveProfile(winner.profile);
  const emitted = new Map(winner.nights.map(night => [night, emitterFor(winner, night)]));
  for (const [night, value] of emitted) parsePlan(value.text, { strategy: winner.strategy, night, profile });
  const replaySeeds = (winner.replaySeeds ?? winner.seeds.slice(0, MAX_REPLAY_SEEDS)).map((seed, index) =>
    nonNegativeInt(seed, `replaySeeds[${index}]`));
  if (replaySeeds.length === 0) fail('replaySeeds must not be empty');
  const replay = replayWinner(winner, emitted, replaySeeds);
  if (winner.gate.replayHash !== undefined && winner.gate.replayHash !== replay.hash)
    fail('winner.gate.replayHash does not match the candidate replay');
  const finalWinner = normalizedWinner(winner, replay);
  const source = strategySourceDigest(winner.strategy);
  const winnerText = canonicalJson(finalWinner);
  const profileText = canonicalJson(profile);
  writeFileSync(join(out, 'winner.json'), winnerText);
  writeFileSync(join(out, 'profile.json'), profileText);
  const plans = [];
  for (const night of winner.nights) {
    const file = `night-${night}.plan`;
    const text = emitted.get(night).text;
    writeFileSync(join(out, file), text);
    plans.push({ night, file, policy: winner.strategy, sha256: sha256(text), bytes: Buffer.byteLength(text) });
  }
  const compiled = compileArtifactPlans(plans.map(plan => ({ ...plan, text: emitted.get(plan.night).text })), parsePlan, profile);
  const artifact = {
    schema: ARTIFACT_SCHEMA, version: 1, winnerHash: stableHash(finalWinner), engineHash: winner.engineHash,
    profileHash: sha256(profileText), plans: persistArtifactPlans(compiled),
  };
  jsonWrite(join(out, 'artifact.json'), artifact);
  const manifest = {
    schema: BUNDLE_SCHEMA, version: 1, strategy: winner.strategy, policy: winner.strategy,
    winnerHash: stableHash(finalWinner), engineHash: winner.engineHash,
    nights: winner.nights, profile: { id: profile.id, file: 'profile.json', sha256: sha256(profileText) },
    plans, gate: finalWinner.gate, replay,
    source: { compiler: 'tools/device/bundle.mjs', registry: Object.keys(STRATEGY_REGISTRY) },
    engine: { declaredHash: winner.engineHash, sourceSha256: source.sha256, sources: source.sources },
    artifact: { file: 'artifact.json', schema: ARTIFACT_SCHEMA, sha256: sha256(canonicalJson(artifact)) },
  };
  jsonWrite(join(out, 'manifest.json'), manifest);
  return validateBundle(out);
}

/** Validate every file and replay the bounded candidate sample from the bundle. */
export function validateBundle(directory, { night } = {}) {
  const out = resolve(directory);
  const manifest = jsonRead(join(out, 'manifest.json'));
  validateManifestShape(manifest);
  const winner = validateWinner(jsonRead(join(out, 'winner.json')));
  if (stableHash(winner) !== manifest.winnerHash) fail('winner hash does not match manifest');
  if (winner.strategy !== manifest.strategy || manifest.policy !== manifest.strategy ||
      manifest.engineHash !== winner.engineHash || !same(winner.nights, manifest.nights))
    fail('manifest strategy/night/engine identity mismatch');
  const source = strategySourceDigest(winner.strategy);
  if (!isRecord(manifest.engine) || manifest.engine.declaredHash !== winner.engineHash ||
      manifest.engine.sourceSha256 !== source.sha256 || !same(manifest.engine.sources, source.sources))
    fail('manifest engine source hash mismatch');
  const profileText = readFileSync(join(out, manifest.profile.file), 'utf8');
  const profile = JSON.parse(profileText);
  validateProfile(profile);
  if (profile.id !== manifest.profile.id || sha256(profileText) !== manifest.profile.sha256)
    fail('profile identity or hash mismatch');
  const expected = new Map(winner.nights.map(planNight => [planNight, emitterFor(winner, planNight)]));
  const selected = night === undefined ? winner.nights : [night];
  for (const planNight of selected) if (!winner.nights.includes(planNight)) fail(`night ${planNight} is not in this bundle`);
  const entries = bundlePlanEntries(manifest, out);
  if (entries.length !== winner.nights.length) fail('manifest plan count does not match winner nights');
  if (!same([...new Set(entries.map(entry => entry.night))].sort((a, b) => a - b),
    [...winner.nights].sort((a, b) => a - b))) fail('manifest plan nights are not a one-to-one set');
  for (const entry of entries) {
    if (!winner.nights.includes(entry.night)) fail(`manifest contains unexpected night ${entry.night}`);
    if (entry.policy !== winner.strategy) fail(`plan ${entry.file} policy mismatch`);
    if (entry.text !== expected.get(entry.night).text) fail(`${entry.file} is not the exact emission for winner.json`);
    parsePlan(entry.text, { strategy: winner.strategy, night: entry.night, profile });
  }
  const replaySeeds = manifest.replay.seeds;
  const actualReplay = replayWinner(winner, expected, replaySeeds);
  if (stableHash(actualReplay.results) !== stableHash(manifest.replay.results) ||
      actualReplay.hash !== manifest.replay.hash || actualReplay.hash !== winner.gate.replayHash)
    fail('candidate replay does not equal the winner replay hash');
  const selectedPlans = entries.filter(entry => selected.includes(entry.night));
  let compiled;
  if (manifest.artifact !== undefined) {
    if (!isRecord(manifest.artifact) || manifest.artifact.file !== 'artifact.json' ||
        manifest.artifact.schema !== ARTIFACT_SCHEMA || typeof manifest.artifact.sha256 !== 'string')
      fail('manifest artifact reference is incomplete');
    const artifactText = readFileSync(join(out, manifest.artifact.file), 'utf8');
    if (sha256(artifactText) !== manifest.artifact.sha256) fail('compiled artifact hash does not match manifest');
    const artifact = JSON.parse(artifactText);
    if (!isRecord(artifact) || artifact.schema !== ARTIFACT_SCHEMA || artifact.version !== 1 ||
        artifact.winnerHash !== manifest.winnerHash || artifact.engineHash !== manifest.engineHash ||
        artifact.profileHash !== manifest.profile.sha256 || !Array.isArray(artifact.plans))
      fail('compiled artifact identity is incomplete');
    if (artifact.plans.length !== entries.length || artifact.plans.some(plan =>
      !isRecord(plan) || !Number.isInteger(plan.night) || !isRecord(plan.cycles)))
      fail('compiled artifact plan set is invalid');
    const byNight = new Map(artifact.plans.map(plan => [plan.night, plan]));
    if (entries.some(entry => !byNight.has(entry.night))) fail('compiled artifact plan nights do not match manifest');
    compiled = selectedPlans.map(entry => byNight.get(entry.night));
  }
  return { manifest, winner, profile, plans: selectedPlans, compiled, replay: actualReplay, status: 'READY' };
}
