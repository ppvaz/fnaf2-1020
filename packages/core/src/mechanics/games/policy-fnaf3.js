// ---------------------------------------------------------------------------
// FNaF 3 policies, from the published community line.
//
// `plans/26-second-target-fnaf-1-3-4.md` records it: "let Springtrap roam"
// rather than lure, because every audio lure costs reboots; seal the vent
// adjacent to the room he just entered; keep flipping the monitor to stagger
// error onset; reboot ventilation preemptively when safe.
// `docs/research/FNAF-SENSOR-ABLATION-RUNS.md` adds that both the cameras and
// the whole maintenance panel are individually droppable.
//
// Observation-limited: the policy may read the camera it is currently looking
// at, and the HUD's ventilation state and hour. It never reads Springtrap's
// position from a camera it is not on.
//
// Two source facts shape the loop and neither is in the public account:
//
//   1. **Standing in the office is not free.** g908 drains ventilation once a
//      second while the office-inactivity counter is above 10 on every night
//      but the first, and g909 raises `aggresive?` off the same counter. The
//      published "keep flipping the monitor" advice is right, and this is why.
//   2. **Watching the room he is in freezes his branch.** `pic random` is
//      redrawn every 10 s only while `you in <> mon in` (g459), and it decides
//      cam 05 -> vent 13 and cam 02 -> vent 15. Parking on his camera holds
//      that coin still.
// ---------------------------------------------------------------------------

// Which vent he can enter from each camera [SOURCED: the branch-4 entrances].
// Sealing is one vent at a time, so this is a priority function, not a set.
export const VENT_FROM = { 10: 14, 2: 15, 9: 11, 7: 12, 5: 13 };

// The danger order the vent topology implies: 14 and 15 bypass the attack
// chain and kill outright, 11 and 12 enter it two steps from the end, 13 with
// the full chain left. No public account states this ordering.
export const SEAL_PRIORITY = [14, 15, 11, 12, 13];

/**
 * The published line, with the knobs it leaves implicit.
 *
 * @param {object} [knobs]
 * @param {number} [knobs.rebootAt]    ventilation level that triggers a reboot
 * @param {number} [knobs.dwellFrames] frames spent on each camera while sweeping
 * @param {number[]} [knobs.sweep]     the camera order a player sweeps in
 */
export function communityLine({ rebootAt = -4, dwellFrames = 12,
                                sweep = [10, 9, 8, 7, 6, 5, 2, 4, 3, 1] } = {}) {
  // **Belief, not truth.** The policy learns where Springtrap is only by
  // looking at the camera he is on; every other frame it is working from a
  // stale reading. That is the difference this repository insists on between
  // a belief policy and a truth policy, and a truth policy here would clear
  // nights it has not earned.
  let believed = null;          // last camera he was actually seen on
  let seenAgo = Infinity;
  let index = 0;
  let dwell = 0;

  return (sim) => {
    if (sim.over) return;
    seenAgo += 1;

    // A reboot is the only thing that clears the ventilation counter [g429],
    // and the meter is on the HUD, so reading it is player-legal.
    if (sim.rebooting === 0 && sim.vent <= rebootAt) {
      sim.rebooting = 3;
      sim.rebootCursor = 0;
    }

    // Stay on the monitor: the office drains ventilation and raises
    // aggression off the same counter [g908/g909].
    sim.viewing = 2;

    // Hold the vent map open while a seal charges -- g584/g585 cancel it if
    // the map closes or the monitor drops.
    if (sim.sealCharge > 0) { sim.ventMap = true; return; }

    // Sweep the cameras. Seeing him is the only way to update the belief.
    sim.ventMap = false;
    dwell += 1;
    if (dwell >= dwellFrames) { dwell = 0; index = (index + 1) % sweep.length; }
    sim.cameraId = sweep[index];
    if (sim.watchingHim()) {
      believed = Number(String(sim.where).replace(/\D/g, ''));
      seenAgo = 0;
    }

    // Seal the vent reachable from where he was last seen. `what vent is
    // closed` is one counter, so this is a choice, not an accumulation --
    // and the ordering 14/15 before 11/12 before 13 comes from the topology,
    // because 14 and 15 bypass the attack chain entirely.
    const target = believed !== null ? VENT_FROM[believed] : null;
    if (target && sim.sealedVent !== target) {
      sim.ventMap = true;
      sim.cameraId = target;
      sim.armSeal(target);
    }
  };
}

/** The null control: never touch anything. Night 1 must still clear. */
export const doNothing = () => {};

/** Stand in the office all night: must lose to ventilation on nights 2+. */
export function officeCamp() {
  return (sim) => { sim.viewing = 0; sim.ventMap = false; };
}

export const POLICIES = {
  'community-line': communityLine,
  'do-nothing': () => doNothing,
  'office-camp': officeCamp,
};
