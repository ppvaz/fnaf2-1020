/** Browser composition boundary for the static trainer application. */
export const TRAINER_SCHEMA = 'trainer-trace-v1';
export const trainerInfo = Object.freeze({
  package: '@fnaf2-1020/trainer',
  responsibility: 'touch presentation, curriculum, audio, and trainer traces',
  canonicalModel: '@fnaf2-1020/core',
});

export { Coach } from './coach.js';
