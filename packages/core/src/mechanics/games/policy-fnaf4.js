// ---------------------------------------------------------------------------
// FNaF 4 policies, from the published community lines.
//
// Two are documented here already:
//
//   - `plans/26-second-target-fnaf-1-3-4.md`, the 20/20/20/20 rotation:
//     `Left Door -> check Freddles -> Right Door`, driven by an audio rule --
//     breathing means hold the door until footsteps, silence means flash.
//   - `docs/research/FNAF4-AUDIO-INDEPENDENCE.md`, the no-audio clear, whose
//     central trick is that **closing a door forces a known state**: g341
//     teleports the character to the hall when the door shuts, and g342
//     pushes them back on a 3000 ms hold. The published strategy recommends
//     ~5 s, which over-holds by about 2 s per visit against the source.
//
// The no-audio line is the one implemented, and as of 2026-09-20 it is the
// one that is ready: **the operator confirmed on device that this handset's
// on-device capture path does not catch the cues the audio rule needs.**
//
// That rules out a path, not the channel. BT A2DP carries the game's own
// output mix -- the same one a player hears -- so a cue that is audible in
// normal play is in that stream by construction. Transport is not the
// problem; **detection** is, and FNaF 4 can afford it where FNaF 2 cannot:
// its tightest gate is 3000 ms against FNaF 2's 41 ms budget, so the 30-900 ms
// documented capture lateness fits. What is missing is a detector, which this
// project has never built for audio -- not a way to hear the game.
//
// The budget works on measured numbers, even under the two-close cycle the
// interlock forces: one side fully resolved (walk out, summon, re-arm,
// dismiss, walk back) is ~7.2 s and both sides ~14.5 s, which is 2.9 roll
// periods. The unattended side gets one free roll per absence -- half an
// expected advance at AI 10/20, against the three steps its chain needs.
//
// Every control is gated on `follow`, so a rotation is a **tour**: each leg
// costs the walk in `WALK_MS`, and the two doors are never both reachable.
// ---------------------------------------------------------------------------

import { FOLLOW } from './fnaf4.js';

/**
 * The no-audio rotation: force each door, then pay the bed and the closet.
 *
 * @param {object} [knobs]
 * @param {number} [knobs.holdMs]   each of the two closes; g342's dismiss
 *                                  tick is every 3000 ms
 * @param {number} [knobs.rearmMs]  both doors open between them, which is the
 *                                  only thing that clears the interlock (g352)
 * @param {number} [knobs.bedMs]    dwell at the bed, which drains Freddy at
 *                                  20/s against a fill of `AI / 4` per second
 * @param {number} [knobs.closetMs] dwell at the closet, which resets Foxy
 */
export function noAudioRotation({ holdMs = 3200, rearmMs = 200, bedMs = 700,
                                  closetMs = 400 } = {}) {
  const S = FOLLOW.stations;
  const TOUR = [S.leftDoor, S.rightDoor, S.bed, S.closet];
  let leg = 0;
  let dwell = 0;

  return (sim) => {
    if (sim.over) return;
    sim.flashing = 0;              // never flash: g345/g346 make it lethal
    sim.listening = 0;             // the no-audio line uses no cue at all

    if (sim.walking) { sim.leftDoorShut = 0; sim.rightDoorShut = 0; sim.viewingBed = 0; return; }

    const want = TOUR[leg];
    if (sim.follow !== want) {
      sim.leftDoorShut = 0; sim.rightDoorShut = 0; sim.viewingBed = 0;
      sim.goTo(want);
      dwell = 0;
      return;
    }

    dwell += 1;
    const ms = dwell * (1000 / 60);
    if (want === S.leftDoor || want === S.rightDoor) {
      // The two-close cycle [g341 / g352 / g342]. The first close summons
      // them to the hall and latches the shared interlock; the interlock only
      // re-arms while **both** doors are open; the second close is the one
      // that dismisses. Holding a single close forever does nothing after the
      // summon, which is what an earlier version of this policy did.
      const side = want === S.leftDoor ? 'leftDoorShut' : 'rightDoorShut';
      const other = want === S.leftDoor ? 'rightDoorShut' : 'leftDoorShut';
      sim.viewingBed = 0;
      sim[other] = 0;
      if (ms < holdMs) sim[side] = 1;                       // close 1: summon
      else if (ms < holdMs + rearmMs) sim[side] = 0;        // open both: re-arm
      else if (ms < holdMs * 2 + rearmMs) sim[side] = 1;    // close 2: dismiss
      else { sim[side] = 0; leg = (leg + 1) % TOUR.length; dwell = 0; }
    } else if (want === S.bed) {
      sim.viewingBed = 1; sim.leftDoorShut = 0; sim.rightDoorShut = 0;
      if (ms >= bedMs) { sim.viewingBed = 0; leg = (leg + 1) % TOUR.length; dwell = 0; }
    } else {
      sim.viewingBed = 0; sim.leftDoorShut = 0; sim.rightDoorShut = 0;
      if (ms >= closetMs) { leg = (leg + 1) % TOUR.length; dwell = 0; }
    }
  };
}

/** The null control: never move, never act. */
export const doNothing = () => {};

/**
 * The control that must die of the rule the audio cue exists to prevent:
 * flash the hall on every visit, with no idea whether they are near.
 */
/** @param {{ holdMs?: number }} [knobs] */
export function flashBlind({ holdMs = 600 } = {}) {
  const S = FOLLOW.stations;
  const TOUR = [S.leftDoor, S.rightDoor];
  let leg = 0; let dwell = 0;
  return (sim) => {
    if (sim.over || sim.walking) return;
    const want = TOUR[leg];
    if (sim.follow !== want) { sim.goTo(want); dwell = 0; return; }
    dwell += 1;
    sim.flashing = want === S.leftDoor ? 1 : 2;
    if (dwell * (1000 / 60) >= holdMs) { sim.flashing = 0; leg = (leg + 1) % TOUR.length; dwell = 0; }
  };
}

export const POLICIES = {
  'no-audio': noAudioRotation,
  'do-nothing': () => doNothing,
  'flash-blind': flashBlind,
};
