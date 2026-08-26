// Gate for the rule "do not add an instrument without adding it to
// grade-run.sh". No phone required.
//
// The failure mode this closes is the one CLAUDE.md documents: the drawer is
// full of instruments and what is not remembered is not run -- screenstate.py
// could have refuted the 163 s claim from any frame, and nobody invoked it.
// So every script in tools/device must be one of three things: invoked by
// grade-run.sh, a test- gate the suite runs, or consciously excluded below
// with a reason. A new instrument fails here until that decision is made in
// the diff.
//
// The other half: every script grade-run.sh does invoke must exist, because
// the pipeline once graded a file that did not exist, printed nothing, and
// read as coverage.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Not instruments, and why. An entry here is a decision, not a formality:
// deleting one is how a script gets promoted into grade-run.sh.
const EXCLUDED = new Map([
  ['grade-run.sh', 'the pipeline itself'],
  ['screenstate.py', 'the live alive/dead authority; grade-night.py and desync-scan.py apply its predicate to recordings'],
  ['death-census.py', 'cross-run census -- answers "what keeps happening", not "what happened in this run"'],
  ['find-events.py', 'mask-camp trial scrubber, not a night-run grader'],
  ['grid-signature.py', 'builds live-check signatures from labelled frames; a builder, not a grader'],
  ['index-observations.py', 'read-only corpus inventory; indexes artifacts rather than grading one run'],
  ['build-screen-model.py', 'model builder'],
  ['build-screencheck.sh', 'native classifier builder'],
  ['replay-screen-model.py', 'validates the classifier against labelled holdouts (test-screencheck.py drives it), not a run'],
  ['bench-screencheck.sh', 'benchmark'],
  ['actuator.mjs', 'simulator layer, gated by test-actuator.mjs'],
  ['recipe.mjs', 'library, gated by test-recipe.mjs'],
  ['human-gate.mjs', 'pre-flight gate on plan files, gated by test-human-gate.mjs'],
  ['hid-raise-probe.mjs', 'device probe -- acts on a phone rather than grading a run'],
  ['pan-probe.sh', 'device probe -- measures the office pan on a phone, does not grade a run'],
  ['pan-shift.py', 'measuring stick for pan-probe.sh; the scroll is better read from the dump'],
  ['region-probe.sh', 'device probe -- maps what a touch does by screen region'],
  ['region-classify.py', 'the interaction classifier region-probe.sh decides with, gated by test-region-classify.py'],
  ['hid-sweep-probe.mjs', 'device probe'],
  ['hid-sweep-probe.sh', 'device probe'],
  ['capture-screen-sample.sh', 'capture helper'],
  ['collect-cue-audio.sh', 'capture helper'],
  ['coords.sh', 'coordinate helper'],
  ['menu.sh', 'the title/menu selector runners source, mock-gated by test-menu.sh'],
  ['title-observe.py', 'live title observer, mock-gated by test-menu.sh -- it classifies a menu, not a run'],
  ['query-cue-helper.sh', 'live helper, mock-gated by test-query-cue-helper.sh'],
  ['soak-cue-helper.sh', 'live helper, mock-gated by test-soak-cue-helper.sh'],
  ['select-adb.sh', 'transport helper, gated by test-select-adb.sh'],
  ['watch-vent-cue.sh', 'live watcher'],
  ['run-batch.sh', 'run launcher'],
  ['trial-minus7.sh', 'run launcher'],
  ['trial-maskcamp.sh', 'run launcher'],
]);

const sh = readFileSync(join(HERE, 'grade-run.sh'), 'utf8');

// Invocation lines only. The header's prose names instruments the script never
// runs -- counting those as covered is exactly the lie this check exists for.
const invocations = sh.split('\n').filter((line) => !/^\s*#/.test(line));
const referenced = new Set();
for (const line of invocations)
  for (const m of line.matchAll(/\$HERE\/((?:\.\.\/)?[\w./-]+\.(?:py|mjs|sh))/g))
    referenced.add(m[1]);

let failed = 0;
const complain = (message) => { console.error(message); failed = 1; };

for (const ref of referenced)
  if (!existsSync(resolve(HERE, ref)))
    complain(`grade-run.sh invokes ${ref}, which does not exist -- ` +
      'that step will silently grade nothing');

for (const name of readdirSync(HERE).sort()) {
  if (!/\.(py|mjs|sh)$/.test(name)) continue;
  if (name.startsWith('test-')) continue; // suite gates, run by tools/test.mjs
  if (referenced.has(name)) continue;
  if (EXCLUDED.has(name)) continue;
  complain(`${name} is neither invoked by grade-run.sh nor excluded here. ` +
    'Wire it into grade-run.sh, or record above why it is not an instrument.');
}

// A stale exclusion reads as "not an instrument" about something the pipeline
// runs, so it dies the moment it stops being true.
for (const name of EXCLUDED.keys())
  if (referenced.has(name))
    complain(`${name} is excluded but grade-run.sh invokes it -- delete the stale exclusion`);

if (!failed) console.log(`grade-run.sh coverage: ${referenced.size} scripts invoked, ` +
  `${EXCLUDED.size} exclusions, nothing unaccounted for`);
process.exit(failed);
