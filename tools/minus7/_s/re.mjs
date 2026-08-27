import { build, devicePlan, idleUntilMs } from '../../device/recipe.mjs';
import { modelGate } from '../../device/human-gate.mjs';
function pt(night, slot, dev, con) {
  const r = build({ night, sweepSlotMs: slot });
  const p = devicePlan(r, { deviceSpacingMs: dev, sweepContactMs: con });
  let t = `#night ${r.night}\n#idle-until ${idleUntilMs(r.night)}\n`;
  for (const [n,l] of Object.entries(p)) t += `#cycle ${n} ${r.cycles[n].lengthMs}\n${l.join('\n')}\n`;
  return t;
}
const RUNS = 400;
// model re-laid-out for a tighter sweep (slot) + LIGHT_AFTER device emission
for (const slot of [50, 60, 67, 80, 100, 120]) {
  const dev = 67, con = 33;
  if (slot < con) continue;
  const row = [];
  for (const [slack,shape] of [[0,'iid'],[10,'correlated'],[60,'correlated']]) {
    const cells = [];
    for (const night of [2,5,6,7]) {
      try {
        const g = modelGate(pt(night, slot, dev, con), { night, runs: RUNS, slackMs: slack, shape });
        cells.push(String((100*g.survived/RUNS).toFixed(0)).padStart(3));
      } catch(e) { cells.push('ERR'); }
    }
    row.push(`[j${slack}] ${cells.join(' ')}`);
  }
  console.log(`slot ${String(slot).padStart(3)} + dev 67/33:  n2/5/6/7  ${row.join('   ')}`);
}
console.log('\n(shipped for reference: [j10] 100 100 100 90 ; [j60] 70 63 62 33)');
