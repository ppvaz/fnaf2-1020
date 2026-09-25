// A cohort result, computed from its run packs instead of assembled by hand.
//
// A cohort is predeclared (cohort-predeclaration-v1: the binding, the size, the
// labels and the rules) and then run slot by slot; until 2026-09-25 its result
// was a JSON record someone wrote from the run directories, the ledger and the
// video grades. That record is only as good as the copying, and it cites media a
// later reader may not have. This reads the committed packs instead
// (tools/evidence-pack.mjs), applies the predeclared win rule -- the executor's
// terminal is sixam AND the video's terminal is clear -- and reports every slot,
// including the ones the packs cannot decide yet.
//
// A slot's runs are the packs named <night>-<prefix>-rNN[b..z]-<stamp>. A run
// that never reached the night is excluded; when several reached it, the last
// is the one that counts (the rules re-run an invalid slot as rNNb, rNNc) and
// the others are reported as superseded. A video terminal comes from the pack's
// grade.log (`TERMINAL: clear -- ...`, the line run-timeline.py prints) or its
// timeline.json; without either, a sixam run is UNGRADED, not a win.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { campaignEntry } from './evidence-campaign.mjs';
import { readPack } from './evidence-pack.mjs';

export const COHORT_RESULT_SCHEMA = 'cohort-result-v2';

/** The label prefix a predeclaration's runs carry: `night7-k3-cohort` from `night7-k3-cohort-r01 .. r10`. */
export function labelPrefix(predeclaration) {
  const match = String(predeclaration?.labels ?? '').match(/(\S+?)-r\d{2}\b/);
  if (!match) throw new Error('the predeclaration names no rNN labels; pass the label prefix explicitly');
  return match[1];
}

/** The video's terminal from a pack's own files, or null when the pack carries no grade. */
export function videoTerminal(dir, files) {
  if (files.includes('run/timeline.json')) {
    const outcome = JSON.parse(readFileSync(join(dir, 'run/timeline.json'), 'utf8')).outcome;
    if (typeof outcome === 'string') return { outcome, source: 'run/timeline.json' };
  }
  if (files.includes('run/grade.log')) {
    const line = readFileSync(join(dir, 'run/grade.log'), 'utf8').match(/^\s*TERMINAL: (\w+)(?: -- (.*))?$/m);
    if (line) return { outcome: line[1], detail: line[2] ?? null, source: 'run/grade.log' };
  }
  return null;
}

function slotStatus(entry, video) {
  const executorWin = entry.outcome === 'WIN';
  if (executorWin && video?.outcome === 'clear') return 'WIN';
  if (video?.outcome === 'death' || entry.outcome === 'DEATH') return 'DEATH';
  if (executorWin && !video) return 'UNGRADED';
  if (executorWin) return 'DISPUTED';
  return 'UNKNOWN';
}

/**
 * Compute a cohort result from the packs under `packsDir`.
 * @param {any} predeclaration parsed cohort-predeclaration-v1
 * @param {string} packsDir directory holding docs/evidence/runs/<run>/
 * @param {{prefix?: string, source?: string}} [options]
 */
export function computeCohort(predeclaration, packsDir, { prefix = labelPrefix(predeclaration), source = null } = {}) {
  if (predeclaration?.schema !== 'cohort-predeclaration-v1') throw new Error('not a cohort-predeclaration-v1');
  const size = predeclaration.size;
  if (!Number.isInteger(size) || size < 1) throw new Error('the predeclaration has no cohort size');
  const night = predeclaration.night;
  const pattern = new RegExp(`^night${night}-${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-r(\\d{2})([b-z]?)-\\d{8}T\\d{6}Z$`);
  const bySlot = new Map();
  for (const id of existsSync(packsDir) ? readdirSync(packsDir).sort() : []) {
    const match = id.match(pattern);
    if (!match) continue;
    const slot = Number(match[1]);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push({ id, retry: match[2] });
  }
  const binding = predeclaration.binding?.winnerHash ?? null;
  const slots = [];
  for (let slot = 1; slot <= size; slot += 1) {
    const label = `r${String(slot).padStart(2, '0')}`;
    const runs = (bySlot.get(slot) ?? []).sort((a, b) => a.retry.localeCompare(b.retry)).map(({ id }) => {
      const dir = join(packsDir, id);
      const loaded = readPack(dir);
      const entry = campaignEntry(id, loaded.wrapper);
      const report = loaded.files.includes('run/run-report.json')
        ? JSON.parse(readFileSync(join(dir, 'run/run-report.json'), 'utf8')) : null;
      const reached = report?.night?.reached === true;
      const video = videoTerminal(dir, loaded.files);
      return { run: id, packSha256: loaded.digest, reached, executor: entry.outcome, video: video?.outcome ?? null,
        videoDetail: video?.detail ?? null, bindingMatches: binding === null || loaded.pack.bundle?.winnerHash === binding,
        status: reached ? slotStatus(entry, video) : 'EXCLUDED' };
    });
    const counted = [...runs].reverse().find(run => run.reached) ?? null;
    for (const run of runs) run.role = run === counted ? 'counted' : run.reached ? 'superseded' : 'excluded';
    slots.push({ slot: label, status: counted ? counted.status : 'MISSING', runs });
  }
  const tally = status => slots.filter(slot => slot.status === status).length;
  const counted = slots.filter(slot => !['MISSING'].includes(slot.status)).length;
  return {
    schema: COHORT_RESULT_SCHEMA, predeclaration: source, night, binding, size, prefix,
    rule: 'WIN = executor terminal sixam AND video terminal clear (the predeclared rule)',
    counted, wins: tally('WIN'), deaths: tally('DEATH'), ungraded: tally('UNGRADED'),
    disputed: tally('DISPUTED'), unknown: tally('UNKNOWN'), missing: tally('MISSING'),
    winRate: `${tally('WIN')}/${counted}`,
    wrongBinding: slots.flatMap(slot => slot.runs.filter(run => !run.bindingMatches).map(run => run.run)),
    status: tally('MISSING') || tally('UNGRADED') || tally('UNKNOWN') || tally('DISPUTED') ? 'INCOMPLETE' : 'COMPLETE',
    slots,
  };
}
