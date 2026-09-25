// Run packs (tools/evidence-pack.mjs) carry a night's text evidence into the repository and
// leave its frames behind. This builds a campaign and its night-run directory in a throwaway
// tree, packs them, and checks what may and may not cross: no media file, no pixel array, no
// machine path; every frame still named by hash; tampering refused; the gate reading the pack.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stableHash } from '@fnaf2-1020/core/contracts';
import { CAMPAIGN_RESULT_SCHEMA } from './evidence-campaign.mjs';
import { ATTESTATION_FILE, ATTESTATION_SCHEMA, buildPack, packDigest, packPromotionChecks, readPack,
  refuseFrames, resolvePackTargets, trackedWinners, writePack } from './evidence-pack.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const root = mkdtempSync(join(tmpdir(), 'evidence-pack-test-'));
const home = '/home/pack-tester'; // only ever a string to scrub; the root is usually beneath it
const put = (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
try {
  const winner = { schema: 'winner-v1', strategy: 'minus-toys', knobs: { hallOffsetMs: 7400 } };
  put('tools/device/campaign-night5-test-winner.json', JSON.stringify(winner));
  put('artifacts/b1/manifest.json', JSON.stringify({ schema: 'device-bundle-v1', winnerHash: stableHash(winner) }));

  const campaign = 'campaign-2026-09-20T00-41-12.166Z';
  const grid = Array.from({ length: 180 }, (_, index) => index * 4099);
  const frame = Buffer.from('not really a png, but bytes all the same');
  put(`artifacts/${campaign}/00001-title-observe.py.png`, frame);
  put(`artifacts/${campaign}/result.json`, JSON.stringify({ mode: 'live', status: 'COMPLETE', result: {
    schema: CAMPAIGN_RESULT_SCHEMA, version: 1, state: 'COMPLETE', specHash: 'fnv1a-spec', completedNights: [5],
    attempts: [{ attempt: 1, mode: 'live', night: 5, status: 'WIN', proofHash: 'fnv1a-7990063c',
      terminal: { night: 5, outcome: 'sixam', sixAm: true } }], events: [] } }));
  put(`artifacts/${campaign}/events.jsonl`, [
    { type: 'evidence.started', evidenceDirectory: `${root}/artifacts/${campaign}` },
    { type: 'observation', label: 'items=continue,newGame', frame: '00001-title-observe.py.png' },
    { type: 'control.effect.sample', sample: { maskOn: false, maskCells: grid } },
  ].map(line => JSON.stringify(line)).join('\n') + '\n');
  put(`artifacts/${campaign}/request.json`, JSON.stringify({ bundle: { specHash: 'fnv1a-spec' } }));
  put(`artifacts/${campaign}/observations.jsonl`,
    `${JSON.stringify({ script: 'title-observe.py', label: 'items=continue,newGame', frame: '00001-title-observe.py.png' })}\n`);

  const label = 'night5-test-20260920T004056Z';
  const video = 'a'.repeat(64);
  put(`artifacts/runs/${label}/verdict.txt`, `run          ${label}\nbundle       artifacts/b1\ncampaign dir ${root}/artifacts/${campaign}\ncampaign exit 0\n`);
  put(`artifacts/runs/${label}/video.sha256`, `${video}  captures/${label}.mp4\n`);
  put(`artifacts/runs/${label}/run-report.json`, JSON.stringify({ schema: 'device-run-report-v1', stop: { reason: 'sixam' } }));
  put(`artifacts/runs/${label}/grade.log`, `bt audio ${home}/fnaf-apks/bt-audio-captures/${label}.bt.raw\n`);
  put(`artifacts/runs/${label}/campaign.log`, JSON.stringify({ maskCells: grid }));
  put(`artifacts/runs/${label}/mmfruntime.logcat`, 'I MMFRuntime: seed\n');
  put(`artifacts/runs/${label}/death-frames/f12.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  // A night-run label and its campaign directory name the same pack.
  const [target] = resolvePackTargets(root, label);
  assert.equal(target.packId, label);
  assert.deepEqual(resolvePackTargets(root, campaign), [target], 'the campaign id resolves to its night-run label');
  assert.throws(() => resolvePackTargets(root, '../etc'), /safe RUN_ID/);

  const built = buildPack({ root, home, ...target });
  const { pack, texts } = built;
  assert.deepEqual(pack.files.map(file => file.name), ['events.jsonl', 'observations.jsonl', 'request.json', 'result.json',
    'run/grade.log', 'run/run-report.json', 'run/verdict.txt', 'run/video.sha256']);
  assert.ok(pack.files.every(file => !/\.(png|mp4|logcat)$/.test(file.name)), 'no media file is copied');
  assert.ok(!texts.has('run/campaign.log'), 'campaign.log echoes the pixel arrays and stays behind');
  const byName = Object.fromEntries(pack.withheld.map(item => [item.name, item]));
  assert.equal(byName['00001-title-observe.py.png'].sha256, sha256(frame), 'an observer frame is named by hash');
  assert.equal(byName['run/death-frames/f12.png'].kind, 'frame');
  assert.equal(byName['run/mmfruntime.logcat'].kind, 'log', 'raw logcat is hashed, never copied');
  assert.deepEqual(byName[`${label}.mp4`], { name: `${label}.mp4`, sha256: video, bytes: null, kind: 'video' });
  assert.equal(byName['run/campaign.log'].sha256, sha256(JSON.stringify({ maskCells: grid })), 'whatever is not copied is still named by hash');
  assert.equal(pack.withheld.length, 5, 'every file of the run is either packed or withheld');

  const events = texts.get('events.jsonl');
  assert.ok(!events.includes(String(grid[179])) && events.includes('"redacted":"pixels"'), 'the 20x9 grid is replaced by its hash');
  assert.ok(events.includes(sha256(JSON.stringify(grid))));
  assert.ok(!events.includes(root) && events.includes(`"evidenceDirectory":"artifacts/${campaign}"`), 'machine paths become repository-relative');
  assert.ok(texts.get('run/grade.log').includes('~/fnaf-apks/'), 'the home directory becomes ~');
  const observation = JSON.parse(texts.get('observations.jsonl'));
  assert.deepEqual(observation.frame, { file: '00001-title-observe.py.png', sha256: sha256(frame), bytes: frame.length });
  const eventsEntry = pack.files.find(file => file.name === 'events.jsonl');
  assert.deepEqual(eventsEntry.redactions, { paths: 1, pixelArrays: 1, frameRefs: 1 });
  assert.equal(eventsEntry.source.sha256, sha256(readFileSync(join(root, 'artifacts', campaign, 'events.jsonl'))),
    'the pack still binds the original bytes');
  assert.equal(pack.bundle.winnerHash, stableHash(winner));
  assert.equal(pack.outcome, 'WIN');
  assert.equal(pack.claimLevel, 'DEVICE_MEASURED');
  assert.equal(packDigest(buildPack({ root, home, ...target }).pack), packDigest(pack), 'packing is deterministic');

  // The guard refuses pixel-shaped payloads it was not told about.
  assert.throws(() => refuseFrames('x', JSON.stringify({ regionPixels: grid.slice(0, 64) })), /numeric array/);
  assert.doesNotThrow(() => refuseFrames('x', JSON.stringify({ cycles: grid.slice(0, 63) })));
  assert.throws(() => refuseFrames('x', 'f'.repeat(128)), /hex run/);
  assert.doesNotThrow(() => refuseFrames('x', video), 'a sha256 is not pixels');
  assert.throws(() => refuseFrames('x', `"${'QUJD'.repeat(50)}"`), /base64/);
  assert.throws(() => refuseFrames('x', 'a\0b'), /binary/);
  put(`artifacts/${campaign}/request.json`, JSON.stringify({ regionPixels: grid }));
  assert.throws(() => buildPack({ root, home, ...target }), /request\.json: a numeric array/, 'an unknown pixel field refuses the pack');
  put(`artifacts/${campaign}/request.json`, JSON.stringify({ bundle: { specHash: 'fnv1a-spec' } }));

  // Written, read back, verified; re-packing is a no-op; tampering is refused.
  const dir = join(root, 'docs/evidence/runs', label);
  assert.equal(writePack(dir, built), 'WRITTEN');
  assert.equal(writePack(dir, buildPack({ root, home, ...target })), 'UNCHANGED');
  const loaded = readPack(dir);
  assert.equal(loaded.digest, packDigest(pack));
  const winners = trackedWinners(root);
  assert.deepEqual(packPromotionChecks(loaded, winners), { offlineEvidence: true, terminalPass: true,
    manifestComplete: true, plan12Attestation: false, winnerCommitted: true },
  'a packed live win passes everything but the attestation, which only a person records');
  const attest = packSha256 => writeFileSync(join(dir, ATTESTATION_FILE),
    JSON.stringify({ schema: ATTESTATION_SCHEMA, status: 'PASS', packSha256, attestedBy: 'test' }));
  attest(loaded.digest);
  assert.equal(packPromotionChecks(readPack(dir), winners).plan12Attestation, true);
  attest('0'.repeat(64));
  assert.equal(packPromotionChecks(readPack(dir), winners).plan12Attestation, false, 'an attestation binds one exact pack');
  assert.equal(packPromotionChecks(loaded, new Map()).winnerCommitted, false, 'an uncommitted winner cannot be re-run elsewhere');

  put(`artifacts/${campaign}/observations.jsonl`, '{"label":"changed"}\n');
  assert.throws(() => writePack(dir, buildPack({ root, home, ...target })), /different pack/, 'evidence is not edited in place');
  writeFileSync(join(dir, 'events.jsonl'), `${readFileSync(join(dir, 'events.jsonl'), 'utf8')} `);
  assert.throws(() => readPack(dir), /integrity mismatch: events\.jsonl/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('evidence pack: text crosses, frames and pixel grids stay behind by hash, paths are portable, tampering and unknown pixel fields are refused, the gate reads the pack');
