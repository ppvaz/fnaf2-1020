// Compile validated phone-plan rows into short semantic blocks.  This is not a
// coordinate encoder: physical geometry stays in the resolved device profile.
// Every block declares the monitor state it needs, and every monitor action is
// a target state rather than a parity toggle.

const camera = control => /^cam(?:[0-9]|1[0-2])$/.test(control);
const semantic = control => camera(control) ? `cam:${Number(control.slice(3))}`
  : control === 'ventl' ? 'ventL' : control;

function action(cycle, row, index, fields) {
  return Object.freeze({ schema: 'artifact-action-v1', id: `${cycle}-${index}`,
    cycle, atMs: row.at, ...fields });
}

function initialState(cycle) {
  return { monitorUp: cycle === 'opening' ? false : true, maskOn: false };
}

export function compileCycle(cycle, rows, initial = initialState(cycle)) {
  if (!Array.isArray(rows)) throw new TypeError('artifact cycle rows must be an array');
  const state = { ...initial };
  const blocks = [];
  for (const [rowIndex, row] of rows.entries()) {
    const id = rowIndex + 1;
    const actions = [];
    if (row.kind === 'tap' || row.kind === 'hold') {
      const control = semantic(row.control);
      if (control === 'monitor') {
        state.monitorUp = !state.monitorUp;
        if (!state.monitorUp) state.camera = null;
        actions.push(action(cycle, row, id, { kind: 'ensure', control,
          targetMonitorUp: state.monitorUp, durationMs: row.duration }));
      } else if (control === 'mask') {
        if (state.monitorUp) throw new TypeError(`${cycle}: mask toggle requires monitor down`);
        state.maskOn = !state.maskOn;
        actions.push(action(cycle, row, id, { kind: 'press', control,
          requiresMonitorUp: false, targetMaskOn: state.maskOn, durationMs: row.duration }));
      } else {
        const needsUp = camera(row.control) || control === 'wind';
        actions.push(action(cycle, row, id, { kind: row.kind, control,
          requiresMonitorUp: needsUp ? true : undefined, durationMs: row.duration }));
      }
    } else if (row.kind === 'hall') {
      actions.push(action(cycle, row, id, { kind: 'hold', control: 'hall',
        requiresMonitorUp: false, durationMs: row.duration }));
    } else if (row.kind === 'hallraise') {
      if (state.monitorUp) throw new TypeError(`${cycle}: hallraise starts with monitor up`);
      state.monitorUp = true;
      actions.push(action(cycle, row, id, { kind: 'compound', compound: 'hallraise',
        control: 'hall', requiresMonitorUp: false, targetMonitorUp: true,
        durationMs: row.duration }));
    } else if (row.kind === 'maskraise') {
      if (state.monitorUp) throw new TypeError(`${cycle}: maskraise starts with monitor up`);
      state.maskOn = false; state.monitorUp = true;
      actions.push(action(cycle, row, id, { kind: 'compound', compound: 'maskraise',
        control: row.mode === 'hall' ? 'hall' : 'monitor', requiresMonitorUp: false,
        targetMaskOn: false, targetMonitorUp: true, gapMs: row.gap,
        durationMs: row.duration }));
    } else if (row.kind === 'sweep') {
      if (!state.monitorUp) throw new TypeError(`${cycle}: sweep requires monitor up`);
      const cams = row.cams.map(token => Number(token.split(':')[0]));
      for (const [camIndex, cam] of cams.entries()) {
        const lightMs = row.cams[camIndex].includes(':')
          ? Number(row.cams[camIndex].split(':')[1]) : row.contact;
        actions.push(action(cycle, { at: row.at + camIndex * row.spacing }, `${id}-cam${cam}`,
          { kind: 'sweep-slot', control: `cam:${cam}`, requiresMonitorUp: true,
            selectMs: row.contact, settleMs: row.contact < 50 ? 17 : 0, lightMs }));
      }
    } else if (row.kind === 'read') {
      if (state.monitorUp) throw new TypeError(`${cycle}: vent read requires monitor down`);
      state.maskOn = true;
      actions.push(action(cycle, row, id, { kind: 'observe-left', control: 'ventL',
        requiresMonitorUp: false, durationMs: row.duration, maskGapMs: row.gap,
        targetMaskOn: true }));
    } else if (row.kind === 'camdrop') {
      if (!state.monitorUp) throw new TypeError(`${cycle}: camdrop requires monitor up`);
      state.monitorUp = false;
      actions.push(action(cycle, row, id, { kind: 'compound', compound: 'camdrop',
        control: 'light', requiresMonitorUp: true, targetMonitorUp: false,
        leadMs: row.lead, durationMs: row.contact, tailMs: row.tail }));
    } else {
      throw new TypeError(`${cycle}: unsupported artifact row ${row.kind}`);
    }
    blocks.push(Object.freeze({ schema: 'artifact-action-block-v1', id: `${cycle}-block-${id}`,
      cycle, atMs: row.at, actions: Object.freeze(actions) }));
  }
  return Object.freeze({ cycle, initial: Object.freeze({ ...initial }), final: Object.freeze({ ...state }),
    blocks: Object.freeze(blocks) });
}

export function compileArtifactPlans(plans, parsePlan, profile) {
  if (!Array.isArray(plans) || typeof parsePlan !== 'function')
    throw new TypeError('validated plans and parser are required');
  return plans.map(plan => {
    const parsed = parsePlan(plan.text, { strategy: plan.policy, night: plan.night, profile });
    const compiled = {};
    compiled.opening = compileCycle('opening', parsed.cycles.opening.rows);
    for (const [name, value] of Object.entries(parsed.cycles)) {
      if (name === 'opening') continue;
      const prior = name === 'finish' && compiled.toys ? compiled.toys.final : compiled.opening.final;
      compiled[name] = compileCycle(name, value.rows, prior);
    }
    return Object.freeze({ night: plan.night, policy: plan.policy,
      cycles: Object.freeze(compiled) });
  });
}
