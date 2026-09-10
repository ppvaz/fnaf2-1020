// The one authority for what a chronicle entry is.
//
// The generator, the harvester and the check all import this, so a vocabulary
// that drifts breaks in one place instead of three. It is a module, not a
// JSON Schema document, for the reason `generate-catalog.js` throws inline
// rather than validating against a spec: the constraints that matter here are
// cross-entry (unique ids, a `supersededBy` that resolves, a date inside its
// own checkpoint window) and no declarative schema expresses them.
//
// Every facet below is vocabulary this repository already uses. Nothing here
// was invented for the page:
//
//   KINDS   -- the shapes a recorded finding takes in this project's own
//              commit grammar: it refutes, it retracts, it measures, it marks
//              a rung, or it is a fact worth keeping.
//   LABELS  -- docs/README.md's evidence labels, verbatim. "a rule enters the
//              simulator only when it earns one".
//   RUNGS   -- plans/12-end-to-end-evidence-campaign.md's promotion ladder.
//   ROUTES  -- the strategy families.
//   STATUS  -- docs/README.md: "Retractions stay put". An entry is never
//              deleted when it is refuted; it gains a status and a pointer.

export const ENTRIES_SCHEMA = 'chronicle-entries-v1';

export const KINDS = ['milestone', 'lesson', 'refutation', 'retraction', 'negative', 'fact', 'trivia'];

/** docs/README.md:6 -- where a number came from. UNKNOWN is the honest default. */
export const LABELS = ['SOURCED', 'CALIBRATED', 'DEVICE_MEASURED', 'INFERRED', 'MODEL', 'UNKNOWN'];

/** plans/12-end-to-end-evidence-campaign.md:28-37. The index is the rung. */
export const RUNGS = [
  'Offline',
  'Replay',
  'Shadow',
  'Bounded live branch',
  'Full Night 6 attempt',
  'Night 6 clear',
  'Night 6 reliability',
  '10/20 attempt/clear',
];

export const ROUTES = ['Minus 7', 'Minus 3', 'Minus Toys', 'Minus Two', 'Minus 6', 'Vent Camp', 'Cam 6/7', '10/20'];

export const STATUSES = ['standing', 'superseded', 'retracted'];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE = /^(?:commit:[0-9a-f]{7,40}|[\w./+-]+(?::\d+)?)$/;

const isString = (value) => typeof value === 'string' && value.length > 0;

/**
 * Field-level validation of one entry. Returns a list of complaints, so a bad
 * corpus reports every fault at once instead of one per run -- the same reason
 * `push-gate.mjs` runs every lane rather than stopping at the first failure.
 */
export function checkEntry(entry, where) {
  const at = (message) => `${where}: ${message}`;
  const problems = [];
  if (!isString(entry.id) || !ID.test(entry.id))
    problems.push(at(`id must be kebab-case, got ${JSON.stringify(entry.id)}`));
  if (!isString(entry.date) || !DATE.test(entry.date) || Number.isNaN(Date.parse(entry.date)))
    problems.push(at(`date must be YYYY-MM-DD, got ${JSON.stringify(entry.date)}`));
  if (!KINDS.includes(entry.kind))
    problems.push(at(`kind must be one of ${KINDS.join('|')}, got ${JSON.stringify(entry.kind)}`));
  if (!LABELS.includes(entry.label))
    problems.push(at(`label must be one of ${LABELS.join('|')}, got ${JSON.stringify(entry.label)}`));
  if (!STATUSES.includes(entry.status))
    problems.push(at(`status must be one of ${STATUSES.join('|')}, got ${JSON.stringify(entry.status)}`));
  if (!isString(entry.title)) problems.push(at('title is required'));
  if (!isString(entry.body)) problems.push(at('body is required'));

  if (entry.rung !== null && !(Number.isInteger(entry.rung) && entry.rung >= 0 && entry.rung < RUNGS.length))
    problems.push(at(`rung must be null or 0..${RUNGS.length - 1}, got ${JSON.stringify(entry.rung)}`));
  if (entry.plan !== null && !(Number.isInteger(entry.plan) && entry.plan >= 1 && entry.plan <= 24))
    problems.push(at(`plan must be null or 1..24, got ${JSON.stringify(entry.plan)}`));
  if (entry.night !== null && !(Number.isInteger(entry.night) && entry.night >= 1 && entry.night <= 7))
    problems.push(at(`night must be null or 1..7, got ${JSON.stringify(entry.night)}`));
  if (entry.route !== null && !ROUTES.includes(entry.route))
    problems.push(at(`route must be null or one of ${ROUTES.join('|')}, got ${JSON.stringify(entry.route)}`));
  if (entry.measured !== null && !isString(entry.measured))
    problems.push(at('measured must be null or a non-empty string'));

  if (!Array.isArray(entry.tags) || entry.tags.some((tag) => !isString(tag)))
    problems.push(at('tags must be an array of strings'));

  // A citation nobody can follow is the failure this repository already names:
  // "a finding nobody can reach is close enough to a finding that does not
  // exist" (tools/test-docs.mjs). Shape is checked here; resolution is checked
  // by test-chronicle.mjs, which is where the filesystem and git live.
  if (!Array.isArray(entry.sources) || entry.sources.length === 0)
    problems.push(at('sources must name at least one path, path:line, or commit:<sha>'));
  else
    for (const source of entry.sources)
      if (!isString(source) || !SOURCE.test(source))
        problems.push(at(`source ${JSON.stringify(source)} is not a path, path:line, or commit:<sha>`));

  if (entry.status === 'standing') {
    if (entry.supersededBy !== null)
      problems.push(at('a standing entry must not name supersededBy'));
  } else if (!isString(entry.supersededBy)) {
    problems.push(at(`a ${entry.status} entry must name the id that replaced it`));
  }
  return problems;
}

/**
 * Whole-corpus validation. Cross-entry rules only make sense once every
 * checkpoint is loaded, so this runs after the last file is read.
 */
export function checkCorpus(checkpoints) {
  const problems = [];
  const seen = new Map();
  for (const checkpoint of checkpoints) {
    if (checkpoint.schema !== ENTRIES_SCHEMA)
      problems.push(`${checkpoint.file}: schema must be ${ENTRIES_SCHEMA}, got ${JSON.stringify(checkpoint.schema)}`);
    if (!isString(checkpoint.label)) problems.push(`${checkpoint.file}: label is required`);
    if (checkpoint.outlook) {
      if (typeof checkpoint.outlook !== 'object' || Array.isArray(checkpoint.outlook))
        problems.push(`${checkpoint.file}: outlook must be an object`);
      for (const section of ['next', 'missing']) {
        if (!Array.isArray(checkpoint.outlook[section]))
          problems.push(`${checkpoint.file}: outlook.${section} must be an array`);
        for (const item of checkpoint.outlook[section] ?? []) {
          if (!isString(item.title) || !isString(item.body))
            problems.push(`${checkpoint.file}: outlook.${section} items need title and body`);
          if (!Array.isArray(item.sources) || item.sources.length === 0)
            problems.push(`${checkpoint.file}: outlook.${section} items need sources`);
          else for (const source of item.sources)
            if (!isString(source) || !SOURCE.test(source))
              problems.push(`${checkpoint.file}: outlook source ${JSON.stringify(source)} is invalid`);
        }
      }
    }

    if (!/^\d{4}-\d{2}$/.test(checkpoint.checkpoint ?? ''))
      problems.push(`${checkpoint.file}: checkpoint must be YYYY-MM`);
    if (!Array.isArray(checkpoint.entries))
      problems.push(`${checkpoint.file}: entries must be an array`);

    for (const [day, count] of Object.entries(checkpoint.pulseByDay ?? {})) {
      if (!DATE.test(day)) problems.push(`${checkpoint.file}: pulseByDay key ${day} is not a date`);
      if (!Number.isInteger(count) || count < 0)
        problems.push(`${checkpoint.file}: pulseByDay[${day}] must be a non-negative integer`);
      if (!day.startsWith(checkpoint.checkpoint))
        problems.push(`${checkpoint.file}: pulseByDay[${day}] is outside checkpoint ${checkpoint.checkpoint}`);
    }

    for (const entry of checkpoint.entries ?? []) {
      problems.push(...checkEntry(entry, `${checkpoint.file} ${entry.id ?? '(no id)'}`));
      if (seen.has(entry.id))
        problems.push(`${checkpoint.file}: duplicate id ${entry.id}, already in ${seen.get(entry.id)}`);
      else seen.set(entry.id, checkpoint.file);
      // The checkpoint window is what makes "add next month's file" a safe
      // operation: an entry filed in the wrong month would silently reorder the
      // spine and leave its day missing from the ribbon's counts.
      if (typeof entry.date === 'string' && !entry.date.startsWith(checkpoint.checkpoint))
        problems.push(`${checkpoint.file}: ${entry.id} is dated ${entry.date}, outside checkpoint ${checkpoint.checkpoint}`);
    }
  }
  for (const checkpoint of checkpoints)
    for (const entry of checkpoint.entries ?? [])
      if (entry.supersededBy && !seen.has(entry.supersededBy))
        problems.push(`${checkpoint.file}: ${entry.id} is ${entry.status} by ${entry.supersededBy}, which is not an entry`);
  return problems;
}
