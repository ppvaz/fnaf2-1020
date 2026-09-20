// ---------------------------------------------------------------------------
// FNaF 1 policies, written from the published community strategies.
//
// References, both already in this repository:
//
//   - `plans/26-second-target-fnaf-1-3-4.md`: the 4/20 loop is
//     `Left Door Light -> Camera -> Right Door Light -> Camera -> repeat`,
//     dominated by the right door, with Foxy held by camera attention and
//     power discipline as the binding constraint.
//   - `docs/research/FNAF-SENSOR-ABLATION-RUNS.md`: the door lights are not
//     load-bearing -- a public clear exists that replaces the light with
//     continuous camera tracking and pays for it in power -- and the power
//     arithmetic (`usage = 1 + Sigma`, 999 units, ~89 s hours) is confirmed
//     against the dump.
//
// **Every policy here is observation-limited.** It may read a door light
// (which shows whether someone is at that door), a camera (which shows who is
// on it), and the HUD's hour and power. It never reads a position the player
// is not looking at. A policy that consulted simulator state directly would
// win more and mean nothing.
//
// Two things the source says that change how the published loop should be
// played, and that the published accounts do not state:
//
//   1. **Foxy's hold is re-rolled, not accumulated** [SOURCED: g460 sets the
//      timer to `50 + Random(1000)` **every 100 ms** while any camera is up;
//      g445 drains it 1 per frame; g321 needs it at 0]. Each tick *replaces*
//      the value, so dwelling on a camera just re-rolls a hold worth
//      0.83-17.5 s, mean ~9.2 s. A flick buys nearly the same expected hold as
//      a dwell, at a fraction of the power. The loop below therefore flicks.
//
//   2. **Holding a light to watch a shut door is the single most expensive
//      thing a player can do**, because `usage` counts the light and the door
//      separately [SOURCED: g313]. The loop shuts the door for a fixed dwell
//      and re-checks with a flash, rather than watching continuously.
// ---------------------------------------------------------------------------

import { DOOR_OPEN, DOOR_SHUT } from './sim-fnaf1.js';

// View ids [SOURCED: g556/g557 gate Freddy on `viewing <> 42` and `<> 4`;
// g60 fires Foxy's run at `viewing = 3`; g90-g94 render Pirate Cove at 99].
export const CAM = { showStage: 1, dining: 2, westHall: 3, eastHall: 4,
                     backstage: 5, kitchen: 6, restrooms: 7,
                     westCorner: 22, supply: 33, eastCorner: 42, pirate: 99 };

/**
 * The published loop, with the four knobs it leaves implicit.
 *
 * A cycle is: flash the left light, flick the camera, flash the right light,
 * flick the camera, idle. A door that a flash finds occupied shuts for
 * `doorFrames` and is then re-checked by the next flash on that side.
 *
 * @param {object} knobs
 * @param {number} knobs.lightFrames  frames a door-light flash lasts
 * @param {number} knobs.camFrames    frames a camera flick lasts
 * @param {number} knobs.doorFrames   frames a door stays shut before re-check
 * @param {number} knobs.idleFrames   frames of nothing at the end of a cycle
 * @param {number} knobs.park         which camera the flick selects
 */
/**
 * Is the reserve ahead of a straight-line burn to 6 AM?
 *
 * Both readings are on the HUD: `power left 2` is the displayed power and the
 * hour is rendered beside it, so this is an observation a player can make.
 * `slack` is how far ahead of the line the loop insists on being before it
 * spends on a camera.
 */
function onBudget(sim, slack) {
  const elapsed = sim.frame / 60;
  const remaining = Math.max(0, 535 - elapsed) / 535;
  return sim.power > 999 * remaining * slack;
}

export function communityLoop({
  lightFrames = 1, camFrames = 7, idleFrames = 60, maxShutFrames = Infinity,
  budgetSlack = 1, recheckFrames = 20, park = CAM.eastCorner,
} = {}) {
  let phase = 0;
  let phaseFrame = 0;
  // Belief, not a timer: a flash that finds someone there shuts the door and
  // the door stays shut until a later flash finds it clear. That is what the
  // published loop actually describes, and it is why the loop must keep
  // coming back to the same light rather than setting a dwell.
  let leftOccupied = false;
  let rightOccupied = false;
  let leftShutFor = 0;
  let rightShutFor = 0;
  let sinceRecheck = 0;
  const PHASES = ['leftLight', 'cam', 'rightLight', 'cam', 'idle'];

  return (sim) => {
    if (sim.blackout) return;

    // A safety release: believing a door is occupied forever would spend the
    // whole reserve, and the power meter is a thing the player can read.
    if (leftOccupied && leftShutFor > maxShutFrames) leftOccupied = false;
    if (rightOccupied && rightShutFor > maxShutFrames) rightOccupied = false;
    sim.leftDoor = leftOccupied ? DOOR_SHUT : DOOR_OPEN;
    sim.rightDoor = rightOccupied ? DOOR_SHUT : DOOR_OPEN;
    leftShutFor = leftOccupied ? leftShutFor + 1 : 0;
    rightShutFor = rightOccupied ? rightShutFor + 1 : 0;

    sim.leftLight = 0; sim.rightLight = 0; sim.viewing = 0;
    phaseFrame += 1;
    sinceRecheck += 1;

    // A shut door costs a unit per second for as long as the belief stands,
    // and the belief is only cleared by a light. A flash costs one frame --
    // 1/60 of a unit -- so re-checking a shut door often is close to free and
    // is what stops the reserve paying for a character who has already left.
    // This is where FNaF 1's power actually goes: not in the doors, but in
    // the lag between a character leaving and the player finding out.
    if ((leftOccupied || rightOccupied) && sinceRecheck >= recheckFrames) {
      sinceRecheck = 0;
      if (leftOccupied) {
        sim.leftLight = 1;
        leftOccupied = sim.atLeftDoor();
        sim.leftDoor = leftOccupied ? DOOR_SHUT : DOOR_OPEN;
      }
      if (rightOccupied) {
        sim.rightLight = 1;
        rightOccupied = sim.atRightDoor();
        sim.rightDoor = rightOccupied ? DOOR_SHUT : DOOR_OPEN;
      }
      return;
    }

    const kind = PHASES[phase];

    if (kind === 'leftLight') {
      sim.leftLight = 1;
      leftOccupied = sim.atLeftDoor();
      sim.leftDoor = leftOccupied ? DOOR_SHUT : DOOR_OPEN;
      if (phaseFrame >= lightFrames) { phase = 1; phaseFrame = 0; }
    } else if (kind === 'rightLight') {
      sim.rightLight = 1;
      rightOccupied = sim.atRightDoor();
      sim.rightDoor = rightOccupied ? DOOR_SHUT : DOOR_OPEN;
      if (phaseFrame >= lightFrames) { phase = 3; phaseFrame = 0; }
    } else if (kind === 'cam') {
      // Power discipline, which is what every published 4/20 account names as
      // the binding constraint. The player can read the meter (`power left 2`
      // is the displayed tenth of `power left`, g313) and the hour, so a
      // policy may compare the two. The camera is the only discretionary
      // spend here -- the doors are safety and the lights are one frame -- so
      // it is what gets cut when the reserve is behind schedule.
      //
      // Foxy is the cost of cutting it, and he is the cheapest threat to
      // accept: he needs three separate advances before he can run, where a
      // door left open needs one roll.
      if (onBudget(sim, budgetSlack)) sim.viewing = park;
      if (phaseFrame >= camFrames) { phase = (phase + 1) % PHASES.length; phaseFrame = 0; }
    } else if (phaseFrame >= idleFrames) { phase = 0; phaseFrame = 0; }
  };
}

/**
 * The no-lights line: never use a door light. Without it the two door
 * positions are unobservable, so this shuts a door whenever the last camera
 * look showed that character one step away, and pays for the camera time.
 */
export function noLights({ camFrames = 20, doorFrames = 360, idleFrames = 40 } = {}) {
  const sweep = [CAM.westCorner, CAM.supply, CAM.eastCorner, CAM.eastHall, CAM.pirate];
  let index = 0;
  let phaseFrame = 0;
  let idling = false;
  let leftShut = 0;
  let rightShut = 0;

  return (sim) => {
    if (sim.blackout) return;
    if (leftShut > 0) { leftShut -= 1; sim.leftDoor = DOOR_SHUT; } else sim.leftDoor = DOOR_OPEN;
    if (rightShut > 0) { rightShut -= 1; sim.rightDoor = DOOR_SHUT; } else sim.rightDoor = DOOR_OPEN;
    sim.leftLight = 0; sim.rightLight = 0; sim.viewing = 0;
    phaseFrame += 1;

    if (idling) {
      if (phaseFrame >= idleFrames) { idling = false; phaseFrame = 0; index = (index + 1) % sweep.length; }
      return;
    }
    const view = sweep[index];
    sim.viewing = view;
    // What this camera reveals. Each is one step from a door, so seeing
    // someone here is the cue to shut that door.
    if (view === CAM.westCorner && sim.bonnie === 'cam2B') leftShut = doorFrames;
    if (view === CAM.supply && sim.bonnie === 'cam3') leftShut = doorFrames;
    if (view === CAM.eastCorner && sim.chica === 'cam4B') rightShut = doorFrames;
    if (phaseFrame >= camFrames) { idling = true; phaseFrame = 0; }
  };
}

/** The null control: never touch anything. */
export const doNothing = () => {};

/** Doors shut forever -- must die of power loss, never of a character. */
export function sealed() {
  return (sim) => {
    sim.leftDoor = DOOR_SHUT; sim.rightDoor = DOOR_SHUT;
    sim.viewing = 0; sim.leftLight = 0; sim.rightLight = 0;
  };
}

export const POLICIES = {
  'community-loop': communityLoop,
  'roll-grid': rollGrid,
  'no-lights': noLights,
  'do-nothing': () => doNothing,
  sealed,
};

/**
 * The scheduled line: shut each door only across its own roll instants.
 *
 * This is not a community strategy and is not offered as one. It is what the
 * source makes available and the published accounts do not use, and it exists
 * because the community loop cannot afford Night 5: base drain plus the
 * per-night drain [g477-g480] already spends 713 of the 999-unit reserve, and
 * holding a door through a camp costs more than the 286 that remain.
 *
 * The lever is that **a movement roll is on a fixed global timer**, not on
 * anything the player does. `Every 4970 ms` (Bonnie) and `Every 4980 ms`
 * (Chica) load on their first reach and fire at multiples of their period
 * from frame 0 [SOURCED: g318, g319, and `passEvery`], so the instants a door
 * actually has to be shut are known in advance for the whole night. Shutting
 * a door for `windowFrames` frames around each of them costs `windowFrames / 298` of what
 * holding it costs, and nothing else in the night needs it shut.
 *
 * The published loop is the control this is measured against: same simulator,
 * same seeds, same Foxy and Freddy handling, different door discipline.
 */
export function rollGrid({ windowFrames = 20, camFrames = 7, idleFrames = 45,
                           park = CAM.eastCorner } = {}) {
  const BONNIE_MS = 4970;
  const CHICA_MS = 4980;
  let phase = 0;
  let phaseFrame = 0;
  const PHASES = ['cam', 'idle'];

  // Frames since night start, in ms, and how far into the current period.
  const nearRoll = (frame, periodMs) => {
    const ms = frame * (1000 / 60);
    const into = ms % periodMs;
    return into >= periodMs - (windowFrames / 2) * (1000 / 60)
      || into <= (windowFrames / 2) * (1000 / 60);
  };

  return (sim) => {
    if (sim.blackout) return;
    sim.leftLight = 0; sim.rightLight = 0; sim.viewing = 0;
    sim.leftDoor = nearRoll(sim.frame, BONNIE_MS) ? DOOR_SHUT : DOOR_OPEN;
    sim.rightDoor = nearRoll(sim.frame, CHICA_MS) ? DOOR_SHUT : DOOR_OPEN;

    phaseFrame += 1;
    if (PHASES[phase] === 'cam') {
      sim.viewing = park;
      if (phaseFrame >= camFrames) { phase = 1; phaseFrame = 0; }
    } else if (phaseFrame >= idleFrames) { phase = 0; phaseFrame = 0; }
  };
}
