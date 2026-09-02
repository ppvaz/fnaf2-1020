/** Browser composition boundary for the static trainer application. */
export const TRAINER_SCHEMA = 'trainer-trace-v1';
export const trainerInfo = Object.freeze({
  package: '@fnaf2-1020/trainer',
  responsibility: 'touch presentation, curriculum, audio, and trainer traces',
  canonicalModel: '@fnaf2-1020/core',
});

export { Coach } from './coach.js';
export {
  MICROTRAINER_SESSION_SCHEMA,
  MICROTRAINER_EVENT_SCHEMA,
  REPLAY_SNAPSHOT_SCHEMA,
  RETAINED_CROP_SCHEMA,
  EXACT_SIMULATOR_CASE_SCHEMA,
  TIMING_BUCKET_SCHEMA,
  UNKNOWN_CHOICE,
  MICROTRAINER_SPLITS,
  MICROTRAINER_SURFACES,
  MicrotrainerIneligibleError,
  makeReplaySnapshot,
  validateReplaySnapshot,
  makePredictionExercise,
  makeRecognitionExercise,
  makeTimingExercise,
  makeStrategyExercise,
  makeMicrotrainerAttempt,
  gradeMicrotrainerAttempt,
  makeMicrotrainerRecord,
  validateMicrotrainerSession,
  makeMicrotrainerSession,
  replayMicrotrainerSession,
} from './microtrainer.js';
export {
  ADAPTIVE_SKILL_SCHEMA,
  ADAPTIVE_SELECTION_SCHEMA,
  ADAPTIVE_MODEL_VERSION,
  DEFAULT_ADAPTIVE_POLICY,
  makeSkillModel,
  validateSkillModel,
  updateSkillModel,
  reportSkill,
  selectAdaptiveExercise,
  validateAdaptiveSelection,
  exportSkillModel,
  resetSkillModel,
  skillModelHash,
} from './adaptive-coach.js';
export {
  RENDERER_SCHEMA,
  RENDERER_VIEW_SCHEMA,
  RENDERER_IDS,
  RENDERER_CAPABILITIES,
  RENDERERS,
  validateRenderer,
  makeRendererView,
  makeRendererAttempt,
  compareRendererAttempts,
} from './renderers.js';
export {
  ARCADE_PROGRESS_SCHEMA,
  ARCADE_SET_SCHEMA,
  makeArcadeSet,
  makeArcadeProgress,
  validateArcadeProgress,
  applyArcadeGrade,
  exportArcadeProgress,
  resetArcadeProgress,
} from './arcade-lab.js';
export {
  RHYTHM_CHART_SCHEMA,
  RHYTHM_RENDERER_ID,
  RHYTHM_MIN_GAP_MS,
  makeRhythmChart,
  validateRhythmChart,
} from './rhythm-highway.js';
export {
  THREAT_CONSTELLATION_SCHEMA,
  THREAT_CONSTELLATION_RENDERER_ID,
  THREAT_CONSTELLATION_GESTURES,
  MIN_TOUCH_RADIUS_PX,
  makeThreatConstellation,
  validateThreatConstellation,
} from './threat-constellation.js';
