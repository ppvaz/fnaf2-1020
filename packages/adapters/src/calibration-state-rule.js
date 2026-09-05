/**
 * Profile-bound positive office/mask state for seam calibration.
 *
 * The seam runner admits a trial only on positive NIGHT/monitor/mask
 * observations, and a handset profile can only supply them through a
 * measured rule: a `calibration-state-v1` artifact binds the fitted
 * `monitor-rule-v1` (already digest-bound in the profile) together with a
 * fitted `mask-rule-v1`, both over the same helper 20x9 grid. A state is
 * OBSERVED only when BOTH sub-rules resolve the same frame positively;
 * any UNKNOWN refuses, exactly as one positive frame is insufficient
 * downstream. Nothing here fits thresholds -- offline labelled-frame
 * tooling produces the sub-artifacts, and until a measured artifact is
 * bound the runner keeps refusing live calibration.
 * CONTRACT:calibration-state-v1.
 */
import { createHash } from 'node:crypto';
import { measureMonitorUp, monitorRuleDigest, parseMonitorRule, cellFeatures, anchorReadsUp } from './monitor-rule.js';

const MASK_UNKNOWN_REASONS = new Set([
  'frame-pending', 'frame-stale', 'screen-identity', 'frame-dark',
  'feature-missing', 'ambiguous-threshold', 'sensor-mismatch',
  'calibration-refused', 'mask-rule-absent', 'grid-seq-mismatch',
  'grid-unavailable', 'monitor-state-unavailable',
]);
const finite = value => typeof value === 'number' && Number.isFinite(value);

function fail(message) { throw new TypeError(`calibration-state-v1: ${message}`); }

/** Stable sha256 over the artifact's canonical JSON for profile binding. */
export function calibrationStateRuleDigest(artifact) {
  const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
  };
  return createHash('sha256').update(JSON.stringify(stable(artifact))).digest('hex');
}

/** Same canonical sha256 for the mask sub-rule, mirroring monitorRuleDigest. */
export function maskRuleDigest(artifact) { return calibrationStateRuleDigest(artifact); }

function parseMaskAnchors(adapter) {
  if (!Array.isArray(adapter?.anchors) || adapter.anchors.length < 2)
    fail('mask rule must carry at least two anchors');
  const seen = new Set();
  adapter.anchors.forEach((anchor, index) => {
    if (!anchor || typeof anchor !== 'object') fail(`mask anchor ${index} must be an object`);
    if (!Number.isInteger(anchor.cell) || anchor.cell < 0 || anchor.cell > 179)
      fail(`mask anchor ${index} cell must index the 180-cell grid`);
    if (!(anchor.feature in cellFeatures)) fail(`mask anchor ${index} feature must be a per-cell feature`);
    if (anchor.kind !== 'present' && anchor.kind !== 'absent') fail(`mask anchor ${index} kind must be present or absent`);
    if (anchor.rule?.kind !== 'threshold') fail(`mask anchor ${index} rule kind must be threshold`);
    if (!finite(anchor.rule.threshold)) fail(`mask anchor ${index} threshold must be finite`);
    const band = anchor.rule.refuse_band;
    if (!finite(band) || band < 0) fail(`mask anchor ${index} refuse_band must be finite non-negative`);
    if (anchor.separation_margin < band) fail(`mask anchor ${index} refuse_band exceeds its separation margin`);
    if (seen.has(anchor.cell)) fail(`mask anchor cell ${anchor.cell} is repeated`);
    seen.add(anchor.cell);
  });
  if (!adapter.anchors.some(anchor => anchor.kind === 'present'))
    fail('at least one present (mask-visible) anchor is required');
  if (!adapter.anchors.some(anchor => anchor.kind === 'absent'))
    fail('at least one absent (office-visible) anchor is required');
}

/** @param {any} artifact */
export function parseMaskRule(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) fail('mask rule must be an object');
  if (artifact.schema !== 'mask-rule-v1') fail('mask rule schema mismatch');
  if (artifact.schema_version !== 1) fail('unsupported mask rule schema_version');
  if (artifact.status !== 'calibrated')
    fail(`mask rule status is ${artifact.status ?? 'missing'} (${artifact.reason ?? 'no reason'}); it cannot drive decisions`);
  if (artifact.fact?.id !== 'maskOn') fail('mask rule fact id must be maskOn');
  const labels = artifact.fact?.labels;
  if (!Array.isArray(labels) || !['off', 'on'].every(label => labels.includes(label)))
    fail('mask rule fact labels must include off and on');
  if (artifact.sensor?.geometry?.[0] !== 2400 || artifact.sensor?.geometry?.[1] !== 1080)
    fail('mask rule sensor geometry must be the native 2400x1080');
  if (artifact.sensor?.sampling !== 'helper-grid-20x9-cell-center')
    fail('mask rule sensor sampling must be the helper grid');
  const guard = artifact.adapter?.guard;
  if (guard?.kind !== 'floor') fail('mask rule guard kind must be floor');
  if (guard.feature !== 'helper_grid_mean_luma') fail('mask rule guard feature must be helper_grid_mean_luma');
  if (!finite(guard.min)) fail('mask rule guard min must be a finite number');
  if (guard.reason !== 'frame-dark') fail('mask rule guard reason must be frame-dark');
  const reasons = artifact.fact?.unknown_reasons;
  if (!Array.isArray(reasons) || reasons.some(reason => !MASK_UNKNOWN_REASONS.has(reason)))
    fail('mask rule unknown_reasons vocabulary is invalid');
  parseMaskAnchors(artifact.adapter);
  return Object.freeze(structuredClone(artifact));
}

/** @param {any} artifact */
export function parseCalibrationStateRule(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) fail('artifact must be an object');
  if (artifact.schema !== 'calibration-state-v1') fail('schema mismatch');
  if (artifact.schema_version !== 1) fail('unsupported schema_version');
  if (artifact.status !== 'calibrated')
    fail(`artifact status is ${artifact.status ?? 'missing'} (${artifact.reason ?? 'no reason'}); it cannot drive decisions`);
  if (artifact.fact?.id !== 'calibrationState') fail('fact id must be calibrationState');
  const labels = artifact.fact?.labels;
  if (!Array.isArray(labels) || !['NIGHT', 'UP', 'DOWN', 'ON', 'OFF'].every(label => labels.includes(label)))
    fail('fact labels must include NIGHT, UP, DOWN, ON, and OFF');
  if (artifact.screen?.identity !== 'FNAF2_NIGHT') fail('screen identity must be FNAF2_NIGHT');
  const monitor = parseMonitorRule(artifact.monitor?.rule);
  if (artifact.monitor.digest !== monitorRuleDigest(monitor))
    fail('bound monitor rule digest does not match its artifact');
  const mask = parseMaskRule(artifact.mask?.rule);
  if (artifact.mask.digest !== maskRuleDigest(mask)) fail('bound mask rule digest does not match its artifact');
  return Object.freeze(structuredClone(artifact));
}

function measureMaskOn(snapshot, rule, cells) {
  const unknown = reason => ({ state: 'UNKNOWN', reason });
  const source = cells ?? snapshot.cells;
  if (!rule.adapter.anchors.some(anchor => Number.isInteger(source?.[anchor.cell])))
    return unknown('grid-unavailable');
  if (Number(snapshot.seq) !== Number(snapshot.gridSeq)) return unknown('grid-seq-mismatch');
  const total = source.reduce((sum, cell) => {
    if (!Number.isInteger(cell)) return NaN;
    return sum + cellFeatures.luma(cell);
  }, 0);
  const guardValue = Math.floor(total / source.length);
  if (!Number.isFinite(guardValue)) return unknown('feature-missing');
  if (guardValue < rule.adapter.guard.min) return unknown('frame-dark');
  let sawOn = false;
  let sawOff = false;
  for (const anchor of rule.adapter.anchors) {
    const reading = anchorReadsUp(anchor, source);
    if (reading === 'missing') return unknown('feature-missing');
    if (reading === 'up') { sawOn = true; continue; }
    if (reading === 'not-up') { sawOff = true; continue; }
    return unknown('ambiguous-threshold');
  }
  if (sawOn && sawOff) return unknown('ambiguous-threshold');
  return { state: 'OBSERVED', value: sawOn };
}

/**
 * Derive the calibrationState measurement from one cue-helper observation.
 * OBSERVED requires BOTH the bound monitor rule and mask rule to resolve
 * the same frame positively; any UNKNOWN refuses the state.
 * @param {any} snapshot parsed `OK k=v` fields from GET
 * @param {any} rule parsed calibration-state-v1 artifact
 * @param {{maxAgeUs?: number, cells?: any}} options */
export function measureCalibrationState(snapshot, rule, { maxAgeUs = 500000, cells = null } = {}) {
  const unknown = reason => ({ signal: 'calibrationState', state: 'UNKNOWN', reason });
  const fields = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const ageUs = Number(fields.ageUs);
  if (!Number.isFinite(ageUs) || ageUs < 0) return unknown('frame-pending');
  if (ageUs > maxAgeUs) return unknown('frame-stale');
  if (!rule) return unknown('calibration-refused');
  if (fields.screen !== 'FNAF2_NIGHT') return unknown('screen-identity');
  const source = cells ?? fields.cells;
  const monitor = measureMonitorUp(fields, parseMonitorRule(rule.monitor.rule), { maxAgeUs, cells: source });
  if (monitor.state !== 'OBSERVED') return unknown(monitor.reason ?? 'monitor-state-unavailable');
  const mask = measureMaskOn({ ...fields, cells: source }, parseMaskRule(rule.mask.rule), source);
  if (mask.state !== 'OBSERVED') return unknown(mask.reason);
  return { signal: 'calibrationState', state: 'OBSERVED',
    value: { screen: 'NIGHT', monitor: monitor.value ? 'UP' : 'DOWN', mask: mask.value ? 'ON' : 'OFF' },
    confidence: 1 };
}
