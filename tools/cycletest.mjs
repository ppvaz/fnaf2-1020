// Plan 20 package 4: finite cycle primitives and fail-closed constraint gate.
import { DEVICE_CONSTRAINTS, gateCycle, getCycle } from '@fnaf2-1020/core/control';
import { initialReducedState, advanceReduced, applyReduced } from '@fnaf2-1020/core/mechanics';
import * as C from '@fnaf2-1020/core/mechanics';

const check = (condition, message) => { if (!condition) throw new Error(message); };

// Establish the only state the wind primitive is allowed to assume: monitor
// up, controls known, and the sourced box camera selected.
let state = initialReducedState({ night: 1 });
state = applyReduced(state, 'monitor').state;
state = advanceReduced(state, C.MONITOR_ANIM_UP);
state = applyReduced(state, 'cam:11').state;
state.controlUnknown.monitor = false;
state.controlUnknown.mask = false;

const exactPass = cycle => ({ accepted: true, cycleId: cycle.id });
let result = gateCycle(getCycle('wind-and-anchor'), state, { exactGate: exactPass });
check(result.accepted, `reviewed wind primitive was rejected: ${result.reasons.join(', ')}`);
check(result.record.cycleId === 'wind-and-anchor' && result.record.reasons.length === 0,
  'accepted cycle did not produce a readable clean decision record');

// A defensive mask is not legal while the monitor is up, and no exact proof
// callback can override a local engine prerequisite.
result = gateCycle(getCycle('defensive-mask'), state, { exactGate: exactPass });
check(!result.accepted && result.reasons.some(reason => reason.startsWith('prerequisite:monitor')),
  'unsafe monitor/mask ordering was accepted');

// An action that lands during an existing monitor animation is rejected before
// it can be treated as a verified transition.
const animation = getCycle('verify-and-resume');
animation.actions.push({ atFrame: 1, kind: 'press', action: 'monitor', contactMs: 33 });
result = gateCycle(animation, applyReduced(initialReducedState({ night: 1 }), 'monitor').state,
  { exactGate: exactPass });
check(!result.accepted && result.reasons.some(reason => reason.startsWith('animation-window')),
  'monitor animation collision was accepted');

// Device-contact constraints and the exact-engine proof are independent gates.
const contact = getCycle('wind-and-anchor');
contact.actions[0].contactMs = 1;
result = gateCycle(contact, state, { exactGate: exactPass });
check(!result.accepted && result.reasons.some(reason => reason.startsWith('contact-floor')),
  'sub-floor contact was accepted');
result = gateCycle(getCycle('wind-and-anchor'), state);
check(!result.accepted && result.reasons.includes('exact-model-gate-missing'),
  'cycle without exact proof callback was admitted');

check(DEVICE_CONSTRAINTS.minContactMs === 33 && DEVICE_CONSTRAINTS.minReleasedMs === 33,
  'device constraint profile lost its measured floors');
console.log('cycle library: reviewed primitive, prerequisite, animation, contact, and exact-proof gates pass');
