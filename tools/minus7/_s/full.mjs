import { build, devicePlan, idleUntilMs } from '../../device/recipe.mjs';
import { modelGate } from '../../device/human-gate.mjs';
function pt(night, slot, dev, con) {
  const r = build({ night, sweepSlotMs: slot });
  const p = devicePlan(r, con ? { deviceSpacingMs: dev, sweepContactMs: con } : {});
  let t = `#night ${r.night}\n#idle-until ${idleUntilMs(r.night)}\n`;
  for (const [n,l] of Object.entries(p)) t += `#cycle ${n} ${r.cycles[n].lengthMs}\n${l.join('\n')}\n`;
  return t;
}
const RUNS = 500;
const CFG = {
  'A shipped 133/100 slot120': [120, 133, 0],
  'B LA sweep 67/33 slot120  ': [120, 67, 33],
  'C LA sweep 67/33 slot50   ': [50, 67, 33],
  'D LA sweep 50/25 slot40   ': [40, 50, 25],
};
for (const [lbl,[slot,dev,con]] of Object.entries(CFG)) {
  const out = [];
  for (const [slack,shape] of [[0,'iid'],[10,'correlated'],[60,'correlated'],[60,'iid']]) {
    const cells = [];
    for (const n of [1,2,3,4,5,6,7]) {
      try { const g = modelGate(pt(n,slot,dev,con||0),{night:n,runs:RUNS,slackMs:slack,shape});
        cells.push(String(Math.round(100*g.survived/RUNS)).padStart(3)); }
      catch(e){ cells.push('ERR'); }
    }
    out.push(`  ${shape[0]}${String(slack).padStart(2)}: ${cells.join(' ')}`);
  }
  console.log(`${lbl}\n${out.join('\n')}`);
}
