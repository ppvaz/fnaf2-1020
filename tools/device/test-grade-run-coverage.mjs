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
  ['gate-worker.mjs', 'pure worker for test-night-matrix.mjs; it simulates gate chunks and has no run artifacts to grade'],
  ['recipe.mjs', 'library, gated by test-recipe.mjs'],
  ['human-gate.mjs', 'pre-flight gate on plan files, gated by test-human-gate.mjs'],
  ['hid-raise-probe.mjs', 'device probe -- acts on a phone rather than grading a run'],
  ['pan-probe.sh', 'device probe -- measures the office pan on a phone, does not grade a run'],
  ['pan-shift.py', 'measuring stick for pan-probe.sh; the scroll is better read from the dump'],
  ['region-probe.sh', 'device probe -- maps what a touch does by screen region'],
  ['region-classify.py', 'the interaction classifier region-probe.sh decides with, gated by test-region-classify.py'],
  ['nightpredicate.py', 'the one definition of the alive/dead rule that screenstate.py and grade-night.py both evaluate; a library, gated by test-screenstate.py'],
  ['sensor.py', 'the capture-method declaration every classifier reads through; a library, gated by test-sensor.py'],
  ['lifecycle-observe.py', 'refines screenstate.py\'s `other` into named screens; a live observer, gated by test-screenstate.py'],
  ['intro_card.py', 'fractional generic intro-card predicate used by lifecycle-observe.py/run-timeline.py; gated by test-intro-card.py'],
  ['hid-sweep-probe.mjs', 'device probe'],
  ['hid-sweep-probe.sh', 'device probe'],
  ['session-manifest.py', 'the manifest producer -- grade-run.sh consumes its output through validate-session.py; gated by test-session-manifest.sh'],
  ['session.sh', 'sourced helper that threads one session id through the producers, gated by test-session-manifest.sh'],
  ['capture-screen-sample.sh', 'capture helper'],
  ['collect-cue-audio.sh', 'capture helper'],
  ['coords.sh', 'coordinate helper'],
  ['menu.sh', 'the title/menu selector runners source, mock-gated by test-menu.sh'],
  ['title-observe.py', 'live title observer, mock-gated by test-menu.sh -- it classifies a menu, not a run'],
  ['query-cue-helper.sh', 'live helper, mock-gated by test-query-cue-helper.sh'],
  ['provision-cue-model.sh', 'installs a generated model into the helper\'s private storage on a phone; a provisioner, not a grader -- it has no run to read'],
  ['soak-cue-helper.sh', 'live helper, mock-gated by test-soak-cue-helper.sh'],
  ['select-adb.sh', 'transport helper, gated by test-select-adb.sh'],
  ['watch-vent-cue.sh', 'live watcher'],
  ['preflight.sh', 'pre-run refusal check -- says whether a night CAN be run and prints the invocation; it launches nothing and has no run to grade, mock-gated by test-preflight.sh'],
  ['run-batch.sh', 'run launcher'],
  ['trial-minus7.sh', 'run launcher'],
  ['trial-maskcamp.sh', 'run launcher'],
  ['preflight.sh', 'pre-run gate on the phone and the helper -- it decides whether a run can observe anything, and has no run to grade; mock-gated by test-preflight.sh'],
]);

// tools/cue and tools/dump, under the same rule. The audit that widened this
// scan noted the hole: CLAUDE.md's purest "instrument nobody runs" example is
// tools/cue/detect.py, and this check did not look at it.
const SIBLING_EXCLUDED = new Map([
  ['detect.py', 'the bang detector scan-night.sh drives; grade-run.sh reaches it through that'],
  ['features.py', 'feature extraction library for detect.py/evaluate.py, gated by test-cue.py'],
  ['correlate.py', 'offline waveform cross-correlation -- the control that refuted the 22 thuds, run by hand against a chosen pair'],
  ['evaluate.py', 'offline sweep harness over labelled audio; reports a matrix, grades no run'],
  ['export-model.py', 'model builder for the on-phone detector'],
  ['label-misses.py', 'labelling aid for building the reference set'],
  ['reference-report.py', 'inventory of the reference samples, which live outside the repository'],
  ['aimap.py', 'AI-table extractor from the event-sheet dump, gated by test-aimap.py'],
  ['readdump.py', 'event-sheet dump reader library, gated by test-instances.py'],
  ['coverage.py', 'group-coverage report over the dump; answers what is unread, not what a run did'],
  ['extract-samples.sh', 'asset extraction helper for the audio path'],
  ['regen-dump.sh', 'regenerates the event-sheet dump from the APK'],
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

// What actually runs a gate: this suite's registry, and CI's workflow. Read
// rather than assumed -- that distinction is the whole point of this block.
//
// Registry entries only, never prose -- for the same reason grade-run.sh is
// read invocation-line-only above. Caught by its own positive control: the
// first version of this check used a substring match, and a COMMENT here
// naming `test-select-adb.sh` was enough to report the file as run while its
// registry entry was deleted. A check that a mention satisfies is a check
// that measures documentation.
const scriptNames = (text) => {
  const found = new Set();
  for (const line of text.split('\n')) {
    if (/^\s*(#|\/\/)/.test(line)) continue;
    for (const m of line.matchAll(/['"`]([\w./-]+\.(?:py|mjs|sh))['"`]/g)) {
      found.add(m[1]);
      found.add(m[1].split('/').pop());
    }
  }
  return found;
};
const suitePath = join(HERE, '..', 'test.mjs');
const ciPath = join(HERE, '..', '..', '.github', 'workflows', 'ci.yml');
const registered = scriptNames(readFileSync(suitePath, 'utf8'));
// CI invokes gates as shell command lines rather than quoted strings.
const ci = existsSync(ciPath) ? readFileSync(ciPath, 'utf8') : '';
const ciNames = new Set();
for (const line of ci.split('\n')) {
  if (/^\s*#/.test(line)) continue;
  for (const m of line.matchAll(/([\w./-]+\.(?:py|mjs|sh))/g))
    ciNames.add(m[1].split('/').pop());
}
const runs = (gate) => registered.has(gate) || ciNames.has(gate.split('/').pop());

for (const name of readdirSync(HERE).sort()) {
  if (!/\.(py|mjs|sh)$/.test(name)) continue;
  if (name.startsWith('test-')) {
    // This used to be `continue`, under the comment "suite gates, run by
    // tools/test.mjs". That comment was an assumption, and it was false for
    // five files -- including two that four exclusions below named as their
    // justification. A gate nobody runs excusing a script from coverage is
    // the drawer problem wearing the uniform of the fix for it.
    if (!runs(name))
      complain(`${name} is a gate that nothing runs -- it is in neither ` +
        'tools/test.mjs nor .github/workflows/ci.yml. Register it, or delete it.');
    continue;
  }
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

// The reasons are free text and nothing parsed them, so a script could drop
// out of coverage by citing a gate that did not exist or did not run -- and
// four did. Any `test-*` file a reason names is now resolved and checked.
for (const [name, reason] of EXCLUDED) {
  for (const m of reason.matchAll(/\btest-[\w.-]+\.(?:py|mjs|sh)\b/g)) {
    const gate = m[0];
    if (!existsSync(join(HERE, gate)))
      complain(`${name} is excused because of ${gate}, which does not exist`);
    else if (!runs(gate))
      complain(`${name} is excused because of ${gate}, which nothing runs -- ` +
        'register that gate in tools/test.mjs or ci.yml, or excuse this differently');
  }
  if (!reason.trim())
    complain(`${name} is excluded with no reason at all -- an exclusion is a ` +
      'decision, and a blank one records nothing for the next reader');
}

// The rule is "do not add an instrument without adding it to grade-run.sh",
// and it was scoped to this directory only -- while CLAUDE.md's purest
// example of an instrument nobody runs lives in tools/cue. A sibling
// directory is not a loophole.
for (const dir of ['cue', 'dump']) {
  const path = join(HERE, '..', dir);
  if (!existsSync(path)) continue;
  for (const name of readdirSync(path).sort()) {
    if (!/\.(py|mjs|sh)$/.test(name)) continue;
    const rel = `../${dir}/${name}`;
    if (name.startsWith('test-')) {
      if (!runs(name))
        complain(`${rel} is a gate that nothing runs -- register it in ` +
          'tools/test.mjs or .github/workflows/ci.yml, or delete it.');
      continue;
    }
    if (referenced.has(rel)) continue;
    if (SIBLING_EXCLUDED.has(name)) continue;
    complain(`${rel} is neither invoked by grade-run.sh nor excluded. ` +
      'Wire it in, or record why it is not an instrument.');
  }
}

if (!failed) console.log(`grade-run.sh coverage: ${referenced.size} scripts invoked, ` +
  `${EXCLUDED.size + SIBLING_EXCLUDED.size} exclusions across device/cue/dump, ` +
  'every gate reachable, nothing unaccounted for');
process.exit(failed);
