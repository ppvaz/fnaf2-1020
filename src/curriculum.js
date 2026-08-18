import * as C from './config.js';

// A ladder of lessons. Each one adds exactly one new thing, hides every control
// it doesn't need, and will not let you move on until the motion is reliable.
//
// Deliberately NOT slowed down: the whole skill is absolute timing, so running
// at 0.8x would teach the wrong intervals. Difficulty is reduced by removing
// controls and threats instead, never by distorting the clock.

const S = (id, at, label, action, extra = {}) => ({ id, at, label, action, ...extra });

// the three-camera sweep, offset from wherever it starts
const sweep = (t0) => [
  S('cam-10', t0 + 0.00, 'CAM 10, then LIGHT', 'camflash', { cam: 10 }),
  S('cam-4', t0 + 0.20, 'CAM 04, then LIGHT', 'camflash', { cam: 4 }),
  S('cam-7', t0 + 0.40, 'CAM 07, then LIGHT', 'camflash', { cam: 7 }),
];

const INERT = {
  bbEnabled: false, foxyEnabled: false, gfEnabled: false, boxEnabled: false,
  stalledEnabled: false, powerEnabled: false, lethal: false,
};

export const LESSONS = [
  {
    id: 'beat',
    title: 'The beat',
    goal: 'Tap LIGHT on every :X2 and :X7.',
    teach: 'Everything hangs off two moments in each 5 seconds: the times ending in 2 and in 7. ' +
           'The timer turns green on them. Nothing else is on screen yet — just find the pulse.',
    controls: ['light'],
    script: [S('beat', 0, 'Tap LIGHT', 'light')],
    sim: { ...INERT },
    target: 8,
  },
  {
    id: 'sweep',
    title: 'The sweep',
    goal: 'CAM 10, CAM 04, CAM 07 — each followed by LIGHT.',
    teach: 'This is the heart of the strategy and the motion that has to become automatic. ' +
           'A flash freezes everyone in that room for 6.66 seconds. Watch the three STUN bars refill. ' +
           'The cameras stay up for this lesson, so the light you are using here is the CAMERA light ' +
           '— a different button, in a different place, from the office flashlight.',
    controls: ['camlight', 'cams'],
    script: sweep(0),
    sim: { ...INERT, stalledEnabled: true },
    start: { monitor: 'up', cam: 10 },
    target: 8,
  },
  {
    id: 'wind',
    title: 'Sweep, then wind',
    goal: 'Sweep the three cameras, then go to CAM 11 and hold WIND.',
    teach: 'After every sweep you go home to CAM 11 and wind the box until the next anchor. ' +
           'Hold your finger down as you move from the CAM 11 button to WIND — that drag is the habit ' +
           'that stops you fat-fingering CAM 12 at 4 AM.',
    controls: ['camlight', 'cams', 'wind'],
    script: [...sweep(0), S('cam-11', 0.60, 'CAM 11', 'cam', { cam: 11 }), S('wind', 0.70, 'Hold WIND', 'wind')],
    sim: { ...INERT, stalledEnabled: true, boxEnabled: true },
    start: { monitor: 'up', cam: 10 },
    target: 8,
  },
  {
    id: 'office',
    title: 'Down and back',
    goal: 'Cams down, mask flick, flash the hall, cams up.',
    teach: 'The other half of the cycle, and the OTHER light — the office flashlight. Golden Freddy ' +
           'gets a coin flip every 5 seconds while your cams are up, so the mask flick is not optional, ' +
           'and it must come BEFORE the flash: flashing the hall with him in the office kills you. ' +
           'The flash then resets Foxy.',
    controls: ['light', 'mask', 'monitor'],
    script: [
      S('monitor-down', 0.00, 'Cams down', 'monitor', { want: 'down' }),
      S('mask-on', 0.20, 'Mask on', 'mask'),
      S('mask-off', 0.35, 'Mask off', 'mask'),
      S('flash-hall', 0.42, 'Flash the hall', 'light'),
      S('monitor-up', 0.60, 'Cams up', 'monitor', { want: 'up' }),
    ],
    sim: { ...INERT, foxyEnabled: true, gfEnabled: true },
    start: { monitor: 'up' },
    target: 8,
  },
  {
    id: 'cycle',
    title: 'The whole cycle',
    goal: 'Both halves together, every 5 seconds.',
    teach: 'Now assemble it: down, mask, flash, up, sweep, home, wind. Ten inputs in about 1.5 seconds, ' +
           'then three and a half seconds of winding to breathe. Nothing here can kill you yet.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind'],
    script: C.CYCLE_SCRIPT,
    sim: { bbEnabled: false, lethal: false },
    start: { monitor: 'up', cam: 11 },
    target: 10,
  },
  {
    id: 'survive',
    title: 'The cycle, for real',
    goal: 'Same cycle — but now Foxy, Golden Freddy and the box can end it.',
    teach: 'Identical inputs, real consequences. If the STUN bars lapse the animatronics walk. ' +
           'If Foxy’s D climbs past 3 at a 5-second check he locks on. Still no Balloon Boy.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind'],
    script: C.CYCLE_SCRIPT,
    sim: { bbEnabled: false },
    start: { monitor: 'up', cam: 11 },
    target: 12,
  },
  {
    id: 'phaseA',
    title: 'Hearing Balloon Boy',
    goal: 'On his third laugh, get the cams DOWN across every 5-second interval.',
    teach: 'BB laughs on each move. The third laugh — with a vent bang — means he is in the vent camera. ' +
           'His fourth move can only happen while your cams are UP, so from then on you drop them before ' +
           'every 5-second interval and raise them after. That is the whole defence.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind'],
    script: C.CYCLE_SCRIPT,
    sim: { lethal: false },
    drill: 'phaseA',
    start: { monitor: 'up', cam: 11 },
    target: 6,
  },
  {
    id: 'phaseB',
    title: 'The duel',
    goal: 'Un-mask, cams up, CAM 10, CAM 04 — as one motion, under 0.7s.',
    teach: 'His fourth laugh puts him in the opening. Flash all three cams, drop, mask up, and wait. ' +
           'When you hear him leave you have about seven tenths of a second before the stun lapses. ' +
           'Leave the monitor parked on CAM 07 with the light held and you get that third flash free.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind'],
    script: null,           // measured by the duel timer, not the cycle coach
    sim: { lethal: false },
    drill: 'phaseB',
    start: { monitor: 'up', cam: 11 },
    target: 6,
    duelTarget: 0.7,
  },
  {
    id: 'night',
    title: 'Full night',
    goal: 'Seven minutes. Real RNG, real deaths.',
    teach: 'Everything you have drilled, for 420 seconds. The report afterwards shows exactly which ' +
           'camera lapsed and when.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind', 'vents'],
    script: C.CYCLE_SCRIPT,
    sim: {},
    start: { monitor: 'up', cam: 11 },
    target: 1,
    fullNight: true,
  },
  {
    id: 'worst',
    title: 'Worst luck',
    goal: 'Every roll pinned to the worst case.',
    teach: 'BB moves every time and never leaves early. If you can clear this you can clear anything — ' +
           'this is the run that proves Minus 7 has no unwinnable RNG.',
    controls: ['light', 'camlight', 'mask', 'monitor', 'cams', 'wind', 'vents'],
    script: C.CYCLE_SCRIPT,
    sim: { worst: true },
    start: { monitor: 'up', cam: 11 },
    target: 1,
    fullNight: true,
  },
];

export const byId = (id) => LESSONS.find(l => l.id === id);

const KEY = 'm7.progress';

export function loadProgress() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export function markPassed(id, best) {
  const p = loadProgress();
  p[id] = { passed: true, best: Math.max(best || 0, p[id]?.best || 0) };
  saveProgress(p);
  return p;
}
// A lesson opens once the one before it is done. Nothing is locked forever:
// the menu still lets you jump ahead if you want to.
export function unlockedIndex(p = loadProgress()) {
  let i = 0;
  while (i < LESSONS.length - 1 && p[LESSONS[i].id]?.passed) i++;
  return i;
}
