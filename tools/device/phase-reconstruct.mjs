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


// --- the game's own first night frame, from the Cue Helper native trace ------
//
// The header above says the interval between the game's true first night frame
// and the classifier calling it is what the bundle cannot pin. The native frame
// trace pins it: it carries `screen_identity` per frame at ~60 Hz on the
// helper's monotonic clock, so the transition is bracketed by one frame
// interval (~17 ms) instead of by the lifecycle sampler's ~1 s cadence, which
// bracketed it by 2358-3261 ms across the 2026-09-12 runs -- wider than the
// 1000 ms phase period the model's loss bands live in.

/** ScreenIdentity.java: UNKNOWN 0, CUE_HELPER 1, FNAF2_NIGHT 2, FNAF2_MENU 3. */
export const SCREEN_FNAF2_NIGHT = 2;

/** Rows of a `fnaf2-frame-trace-v3` TSV, in helper-monotonic milliseconds. */
export function parseFrameTrace(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('seq')) continue;
    const field = line.split('\t');
    if (field.length < 7) continue;
    rows.push({ imageMs: Number(field[1]) / 1e6, screenIdentity: Number(field[6]) });
  }
  return rows;
}

/**
 * The first frame the HELPER called FNAF2_NIGHT and then kept calling it.
 *
 * `holdFrames` guards against a single-frame flicker being read as the night;
 * the returned `resolutionMs` is the gap to the frame before, which is the
 * entire resolution this measurement has and is reported rather than hidden.
 */
export function firstNightFrame(rows, { holdFrames = 30 } = {}) {
  let run = 0;
  let candidate = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].screenIdentity !== SCREEN_FNAF2_NIGHT) { run = 0; continue; }
    run += 1;
    if (run === 1) candidate = index;
    if (run < holdFrames) continue;
    const prior = candidate > 0 ? rows[candidate - 1] : null;
    return { imageMs: rows[candidate].imageMs, index: candidate,
      resolutionMs: prior ? rows[candidate].imageMs - prior.imageMs : null,
      priorIdentity: prior ? prior.screenIdentity : null };
  }
  return null;
}

/**
 * Map the helper's monotonic clock onto the executor's wall clock.
 *
 * A gate sample carries `visualCaptureAt` (helper ms) and `ageUs` -- how old
 * the frame already was when it was read -- and its read carries `finishedAt`
 * on the wall clock. `finishedAt - ageUs` is therefore the capture instant in
 * wall time, and differencing the two clocks at that same instant removes most
 * of the read latency. Differencing the EMITTED event time instead leaves all
 * of it in: on night5-strokes3 that spread the estimate over 1011 ms against
 * 105 ms for this anchor.
 *
 * What is left is still a LATENCY, so it is one-sided: the residual can only
 * push an estimate later, never earlier. The measured residuals say so plainly
 * -- 0 17 18 18 19 20 21 22 35 38 44 60 61 66 70 105 on strokes3, and the same
 * right-skewed shape on strokes2 -- so the MINIMUM is the estimator, the way
 * NTP takes the minimum round trip rather than the average. A median sits
 * about 28 ms above the floor on both runs, and a Kalman filter would be the
 * wrong instrument twice over: it assumes symmetric noise this does not have,
 * and its drift state has nothing to track (the two clocks drift 0.33 ms per
 * 1000 s, which is 0.05 ms across a whole night).
 *
 * `uncertaintyMs` is therefore how fast the distribution rises off its own
 * floor (the first quartile above the minimum), not the full spread: the
 * spread is the dispersion of ONE sample, and quoting it as the uncertainty of
 * an estimate built from 16 of them overstates it by roughly six times.
 */
export function helperClockOffset(events) {
  const offsets = [];
  for (const event of events) {
    const sample = event?.sample;
    const finishedAt = event?.reads?.at?.(-1)?.finishedAt;
    if (!sample?.visualCaptureAt || !sample?.ageUs || !finishedAt) continue;
    offsets.push((finishedAt - Number(sample.ageUs) / 1000) - sample.visualCaptureAt);
  }
  if (!offsets.length) return null;
  offsets.sort((a, b) => a - b);
  const floor = offsets[0];
  const quartile = offsets[Math.floor(offsets.length / 4)];
  return { offsetMs: floor,
    uncertaintyMs: quartile - floor,
    medianMs: offsets[Math.floor(offsets.length / 2)],
    spreadMs: offsets.at(-1) - floor,
    samples: offsets.length };
}

/**
 * The epoch this run actually delivered, in the model's own sign convention.
 *
 * `minus-toys-plan.mjs` computes `when = base + at + epochMs` in game-relative
 * time, so a POSITIVE `epochMs` fires the schedule later against the game's
 * frame grid. On the phone the plan is anchored to T0 while the game's night
 * starts `errorMs` later, which places every action `errorMs` EARLY in
 * game-relative time -- so the delivered epoch is the NEGATIVE of that error,
 * modulo one game second. Getting this sign backwards would name the opposite
 * band, so it is stated here rather than left to the reader.
 */
export function deliveredEpochMs(errorVersusFirstNightFrameMs) {
  return ((-errorVersusFirstNightFrameMs % 1000) + 1000) % 1000;
}

/** Which loss band, if any, an epoch falls in. */
export function bandFor(epochMs, bands) {
  return bands.find(band => epochMs >= band.fromMs && epochMs < band.toMs) ?? null;
}

/**
 * Derive the delivered timeline from one run's events.
 *
 * `armReadyAtMs` is not recorded anywhere, so it is recovered from the first
 * gate: that gate is reached at `armGoAt + (gateAtMs - armReadyAtMs)` with no
 * accumulated lag, which pins the prefix length exactly.
 */
export function reconstruct(events, observations, frameTrace = null) {
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

  // A trace measures the origin error only if its clock can be tied to the
  // executor's. Either half missing leaves the bracket standing, unchanged.
  let measuredOrigin = null;
  if (frameTrace?.length) {
    const clock = helperClockOffset(events);
    const night = firstNightFrame(frameTrace);
    if (clock && night) {
      const firstNightFrameAt = night.imageMs + clock.offsetMs;
      const errorMs = firstNightFrameAt - nightGo.at;
      measuredOrigin = {
        basis: 'cue-helper-native-frame-trace',
        firstNightFrameAt,
        errorMs,
        deliveredEpochMs: deliveredEpochMs(errorMs),
        // Frame resolution and clock spread are independent; the honest bound
        // is their sum, and it is quoted next to the number it qualifies.
        uncertaintyMs: (night.resolutionMs ?? 0) + clock.uncertaintyMs,
        frameResolutionMs: night.resolutionMs,
        clockUncertaintyMs: clock.uncertaintyMs,
        clockSpreadMs: clock.spreadMs,
        clockSamples: clock.samples,
        priorFrameIdentity: night.priorIdentity,
      };
    }
  }

  return {
    schema: SCHEMA,
    origin: {
      kind: 'lifecycle-classification',
      nightGoAt: nightGo.at,
      releasedAt: released,
      // UNKNOWN unless a native frame trace was supplied: without one no
      // recorded quantity measures it.
      ...measuredOrigin
        ? { errorVersusFirstNightFrameMs: measuredOrigin.errorMs,
            measured: measuredOrigin }
        : { errorVersusFirstNightFrameMs: 'UNKNOWN' },
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
      '[--night N] [--seeds N] [--frame-trace FILE] [--out FILE]\n');
    process.exit(2);
  }
  const events = readJsonl(join(run, 'events.jsonl'));
  const observations = readJsonl(join(run, 'observations.jsonl'));
  const tracePath = arg('frame-trace');
  const frameTrace = tracePath ? parseFrameTrace(readFileSync(tracePath, 'utf8')) : null;
  const report = reconstruct(events, observations, frameTrace);
  if (tracePath) report.frameTrace = tracePath;
  report.run = run;
  const night = arg('night');
  if (night !== undefined) {
    const model = await phaseResponse(+night, +(arg('seeds', '100')));
    const bands = lossBands(model.rows);
    report.model = { ...model, lossBands: bands,
      uncontrolledPhase: await uncontrolledPhase(+night, +(arg('runs', '3000'))) };
    const measured = report.origin.measured;
    if (measured) {
      const band = bandFor(measured.deliveredEpochMs, bands);
      report.deliveredBand = { epochMs: measured.deliveredEpochMs,
        uncertaintyMs: measured.uncertaintyMs, band,
        verdict: band ? 'IN A LOSS BAND' : 'outside every loss band',
        // Naming a band the uncertainty straddles would overstate the
        // measurement, so say so instead.
        edgeMs: bands.map(b => Math.min(Math.abs(measured.deliveredEpochMs - b.fromMs),
          Math.abs(measured.deliveredEpochMs - b.toMs))).sort((a, b) => a - b)[0] ?? null };
      report.deliveredBand.conclusive =
        report.deliveredBand.edgeMs === null ? false
          : report.deliveredBand.edgeMs > measured.uncertaintyMs;
    }
  }
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const out = arg('out');
  if (out) { writeFileSync(out, text); process.stdout.write(`${out}\n`); }
  else process.stdout.write(text);
}
