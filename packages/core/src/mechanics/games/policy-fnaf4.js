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
// The no-audio line is the one implemented, because the audio rule needs an
// observation this project has never graded a night on, while the door trick
// needs only a schedule -- which is what already wins here.
//
// Every control is gated on `follow`, so a rotation is a **tour**: each leg
// costs the walk in `WALK_MS`, and the two doors are never both reachable.
// ---------------------------------------------------------------------------

import { FOLLOW } from './fnaf4.js';

/**
 * The no-audio rotation: force each door, then pay the bed and the closet.
 *
 * @param {object} [knobs]
 * @param {number} [knobs.holdMs]   how long a door is held once shut -- the
 *                                  source says 3000 ms is enough (g342)
 * @param {number} [knobs.bedMs]    dwell at the bed, which drains Freddy at
 *                                  20/s against a fill of `AI / 4` per second
 * @param {number} [knobs.closetMs] dwell at the closet, which resets Foxy
 */
export function noAudioRotation({ holdMs = 3200, bedMs = 700, closetMs = 400 } = {}) {
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
    if (want === S.leftDoor) {
      sim.leftDoorShut = 1; sim.rightDoorShut = 0; sim.viewingBed = 0;
      if (ms >= holdMs) { sim.leftDoorShut = 0; leg = (leg + 1) % TOUR.length; dwell = 0; }
    } else if (want === S.rightDoor) {
      sim.rightDoorShut = 1; sim.leftDoorShut = 0; sim.viewingBed = 0;
      if (ms >= holdMs) { sim.rightDoorShut = 0; leg = (leg + 1) % TOUR.length; dwell = 0; }
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
