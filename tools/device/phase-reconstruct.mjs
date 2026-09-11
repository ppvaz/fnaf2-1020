#!/usr/bin/env node
// Reconstruct the phase a device run actually delivered, from its own bundle.
//
// The schedule's phone-local origin is `hid.night-go`: the instant the host's
// lifecycle classifier first called a frame `night`. Everything after the arm
// gate then runs from `arm.verified.armGoAt`, and every cycle boundary after
// that from a host-owned release. None of those three are the game's clock, so
// the delivered stream carries a phase error the run bundle never states.
//
// This tool states it. It reads only timestamps the executor already records,
// derives `armReadyAtMs` from the first gate (whose accumulated lag is zero by
// construction), and reports the offset each cycle actually ran at. It invents
// nothing: what the bundle cannot pin -- the interval between the game's true
// first night frame and the classifier calling it -- is reported as a bracket,
// not as a number.
//
// With `--night`, it also prints the minus-toys model's response to phase, so
// a measured offset can be read against the band it landed in.
//
//   node tools/device/phase-reconstruct.mjs --run artifacts/campaign-... \
//     [--night 5] [--seeds 100] [--runs 3000] [--out docs/evidence/name.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'device-phase-reconstruction-v1';

const readJsonl = path => readFileSync(path, 'utf8').trim().split('\n')
  .filter(Boolean).map(line => JSON.parse(line));

const fail = message => { throw new Error(`phase reconstruction: ${message}`); };

/**
 * Derive the delivered timeline from one run's events.
 *
 * `armReadyAtMs` is not recorded anywhere, so it is recovered from the first
 * gate: that gate is reached at `armGoAt + (gateAtMs - armReadyAtMs)` with no
 * accumulated lag, which pins the prefix length exactly.
 */
export function reconstruct(events, observations) {
  const first = type => events.find(event => event.type === type);
  const start = first('hid.schedule-start');
  const nightGo = first('hid.night-go');
  const armVerified = first('arm.verified');
  const gates = events.filter(event => event.type === 'control.gate');
  if (!start) fail('bundle has no hid.schedule-start');
  if (!nightGo) fail('bundle has no hid.night-go: the run never reached a night');
  const releasedEvent = first('hid.night-go-released');
  const released = releasedEvent?.at ?? nightGo.at;
  const phaseOffsetMs = start.phaseOffsetMs ?? 0;

  let arm = null;
  if (armVerified?.armGoAt && gates.length) {
    const armGoAt = armVerified.armGoAt;
    const armReadyAtMs = gates[0].gateAtMs - (gates[0].reachedAt - armGoAt);
    arm = {
      armGoAt,
      armReadyAtMs,
      // The stream parked at armReadyAtMs and resumed only when the host
      // touched the marker. The authored instant it resumed on carries no
      // lead-in, so this difference lands on every later action.
      lagMs: (armGoAt - released) - armReadyAtMs,
      attempt: armVerified.attempt ?? null,
    };
  }

  const cycles = gates.map(gate => {
    const nominalReachedAt = arm ? arm.armGoAt + (gate.gateAtMs - arm.armReadyAtMs) : null;
    const gateLagMs = nominalReachedAt === null ? null : gate.reachedAt - nominalReachedAt;
    return {
      gateAtMs: gate.gateAtMs,
      nextActionId: gate.nextActionId,
      status: gate.status,
      believedMaskOn: gate.believedMaskOn ?? null,
      observedMaskOn: gate.observedMaskOn ?? null,
      maskEvidence: gate.maskEvidence ?? null,
      readCount: Array.isArray(gate.reads) ? gate.reads.length : null,
      gateLagMs,
      // What the plan asked for, plus everything the delivery added to it.
      deliveredOffsetMs: gateLagMs === null ? null : phaseOffsetMs + arm.lagMs + gateLagMs,
    };
  });

  // The origin is a classification, so its error is bounded by the samples on
  // either side of it and by nothing else.
  const lifecycle = observations.filter(row => row.script === 'lifecycle-observe.py');
  const beforeNight = lifecycle.filter(row => row.at < nightGo.at && row.label !== 'state=night').at(-1);
  const firstNight = lifecycle.find(row => row.label === 'state=night');
  const gaps = lifecycle.slice(1).map((row, index) => row.at - lifecycle[index].at).sort((a, b) => a - b);

  const lastNight = lifecycle.filter(row => row.label === 'state=night').at(-1);
  const terminal = lifecycle.find(row => lastNight && row.at > lastNight.at && row.label !== 'state=night');

  return {
    schema: SCHEMA,
    origin: {
      kind: 'lifecycle-classification',
      nightGoAt: nightGo.at,
      releasedAt: released,
      // UNKNOWN, deliberately: no recorded quantity measures it.
      errorVersusFirstNightFrameMs: 'UNKNOWN',
      bracketedByMs: beforeNight && firstNight ? firstNight.at - beforeNight.at : null,
      priorSampleLabel: beforeNight?.label ?? null,
      observationCadenceMs: gaps.length
        ? { min: gaps[0], p50: gaps[Math.floor(gaps.length / 2)], max: gaps.at(-1) }
        : null,
    },
    plannedPhaseOffsetMs: phaseOffsetMs,
    actionCount: start.actionCount ?? null,
    arm,
    cycles,
    deliveredOffsetMs: cycles.length && cycles[0].deliveredOffsetMs !== null
      ? { first: cycles[0].deliveredOffsetMs, last: cycles.at(-1).deliveredOffsetMs }
      : null,
    terminal: lastNight && terminal
      ? { lastNightAt: lastNight.at, terminalAt: terminal.at, terminalLabel: terminal.label,
        // The classifier samples about once a second and its frames trail
        // their content, so this is the whole resolution available on when
        // the night ended. A tighter figure would be invented.
        bracketMs: terminal.at - lastNight.at,
        // Attribution is a separate question this dump cannot answer.
        attribution: 'UNKNOWN' }
      : null,
  };
}

/** The minus-toys model's response to phase, at frame resolution over one second. */
async function phaseResponse(night, seeds) {
  const here = new URL('.', import.meta.url);
  const plan = await import(new URL('minus-toys-plan.mjs', here).href);
  const C = await import('@fnaf2-1020/core/mechanics');
  const stepMs = 1000 / C.FPS;
  const ticksIn = window => {
    let ticks = 0;
    for (let frame = window.startFrame; frame <= window.endFrame; frame += 1)
      if (frame % C.FPS === 0) ticks += 1;
    return ticks;
  };
  const rows = [];
  for (let step = 0; step < C.FPS; step += 1) {
    const epochMs = +(step * stepMs).toFixed(2);
    let wins = 0, armed = 0;
    const deaths = {};
    for (let index = 0; index < seeds; index += 1) {
      const result = plan.replay({ night, seed: (index * 2654435761) >>> 0, epochMs });
      if (result.splitAt >= 0) armed += 1;
      if (result.sim.won) wins += 1;
      else {
        const reason = result.sim.death?.reason ?? 'none';
        deaths[reason] = (deaths[reason] ?? 0) + 1;
      }
    }
    const windows = plan.maskWindows(plan.schedule({ epochMs })).slice(1).map(ticksIn);
    rows.push({ epochMs, maskTicks: Math.min(...windows), wins, armed, seeds, deaths });
  }
  return { night, seeds, ventMaskTicks: C.VENT_MASK_TICKS, rows };
}

/**
 * What the route is worth when the delivered phase is not controlled: one
 * epoch drawn per seed, uniformly over one game second at frame resolution.
 *
 * The per-phase rows above resolve the BAND (a phase either loses every seed
 * or wins nearly all of them, so a small block settles it). This is the RATE,
 * and the rate is the number that has to carry the golden 3000 seeds.
 */
async function uncontrolledPhase(night, runs) {
  const here = new URL('.', import.meta.url);
  const plan = await import(new URL('minus-toys-plan.mjs', here).href);
  const C = await import('@fnaf2-1020/core/mechanics');
  const frames = Math.round(C.FPS);
  let wins = 0, armed = 0;
  const deaths = {};
  for (let index = 0; index < runs; index += 1) {
    const seed = (index * 2654435761) >>> 0;
    const epochMs = ((seed >>> 7) % frames) * (1000 / C.FPS);
    const result = plan.replay({ night, seed, epochMs });
    if (result.splitAt >= 0) armed += 1;
    if (result.sim.won) wins += 1;
    else {
      const reason = result.sim.death?.reason ?? 'none';
      deaths[reason] = (deaths[reason] ?? 0) + 1;
    }
  }
  return { night, runs, wins, armed, deaths,
    note: 'epoch drawn uniformly over one game second; the gate scores epoch 0 only' };
}

/** The contiguous phase band, modulo one game second, where the route loses. */
export function lossBands(rows) {
  const bands = [];
  let open = null;
  for (const row of rows) {
    const lost = row.wins === 0;
    if (lost && !open) open = { fromMs: row.epochMs, maskTicks: row.maskTicks };
    if (!lost && open) { bands.push({ ...open, toMs: row.epochMs }); open = null; }
  }
  if (open) bands.push({ ...open, toMs: 1000 });
  return bands;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const found = process.argv.find(value => value.startsWith(`--${name}=`));
    if (found) return found.slice(name.length + 3);
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
      ? process.argv[index + 1] : fallback;
  };
  const run = arg('run');
  if (!run) {
    process.stderr.write('usage: phase-reconstruct.mjs --run artifacts/campaign-... ' +
      '[--night N] [--seeds N] [--out FILE]\n');
    process.exit(2);
  }
  const events = readJsonl(join(run, 'events.jsonl'));
  const observations = readJsonl(join(run, 'observations.jsonl'));
  const report = reconstruct(events, observations);
  report.run = run;
  const night = arg('night');
  if (night !== undefined) {
    const model = await phaseResponse(+night, +(arg('seeds', '100')));
    report.model = { ...model, lossBands: lossBands(model.rows),
      uncontrolledPhase: await uncontrolledPhase(+night, +(arg('runs', '3000'))) };
  }
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const out = arg('out');
  if (out) { writeFileSync(out, text); process.stdout.write(`${out}\n`); }
  else process.stdout.write(text);
}
