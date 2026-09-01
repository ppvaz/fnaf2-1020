/** Native screencheck process boundary; C owns detector implementation, not mechanics. */
export const SCREENCHECK_CONTRACT = 'screencheck-process-v1';
export const SCREENCHECK_STATUSES = Object.freeze({ OK: 0, USAGE_OR_GEOMETRY: 2, DATA_OR_MODEL: 3 });
