#!/usr/bin/env node
// Seed census: run one policy over N seeds of one night and report the win
// rate with its dominant death cause.
//
// The project's standing rule is that no win rate below 3000 seeds may be
// quoted, because the 16-bit RNG makes small samples misleading and makes
// 65,536-seed exhaustive censuses practical. This defaults to 3000 and will
// take `--seeds 65536` for the exhaustive answer.
//
//   node tools/census.mjs --game fnaf1 --policy community-loop
//   node tools/census.mjs --game fnaf1 --night 4 --seeds 65536
//   node tools/census.mjs --game fnaf1 --all
//
// A census is a **model** result. It says what the simulator does under the
// rules read out of the dump; it is not a device measurement and cannot be
// promoted as one.

import { Fnaf1Sim } from '../packages/core/src/mechanics/games/sim-fnaf1.js';
import { POLICIES as FNAF1_POLICIES } from '../packages/core/src/mechanics/games/policy-fnaf1.js';

const SIMS = {
  fnaf1: { Sim: Fnaf1Sim, policies: FNAF1_POLICIES, nights: [1, 2, 3, 4, 5, 6] },
};

function parseArgs(argv) {
  const args = { game: 'fnaf1', policy: 'community-loop', seeds: 3000, night: null,
                 all: false, json: false, options: {}, custom: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--game') args.game = argv[++i];
    else if (flag === '--policy') args.policy = argv[++i];
    else if (flag === '--seeds') args.seeds = Number(argv[++i]);
    else if (flag === '--night') args.night = Number(argv[++i]);
    else if (flag === '--all') args.all = true;
    else if (flag === '--json') args.json = true;
    // `--custom 20` is 4/20: every dial at 20 on Night 7. `--custom
    // 20,20,20,20` sets freddy, bonnie, chica, foxy individually.
    else if (flag === '--custom') {
      const parts = argv[++i].split(',').map(Number);
      const ids = ['freddy', 'bonnie', 'chica', 'foxy'];
      args.custom = Object.fromEntries(ids.map((id, n) => [id, parts.length === 1 ? parts[0] : parts[n]]));
      if (args.night === null) args.night = 7;
    }
    else if (flag.startsWith('--opt.')) args.options[flag.slice(6)] = Number(argv[++i]);
    else throw new Error(`unknown flag ${flag}`);
  }
  return args;
}

export function census({ game, night, policy, seeds, options = {}, custom = null }) {
  const entry = SIMS[game];
  if (!entry) throw new Error(`no simulator for ${game}`);
  const makePolicy = entry.policies[policy];
  if (!makePolicy) {
    throw new Error(`no policy ${policy} for ${game}; have ${Object.keys(entry.policies).join(', ')}`);
  }
  const causes = new Map();
  let wins = 0;
  let survivedMs = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const sim = new entry.Sim({ night, seed, custom });
    const result = sim.run(makePolicy(options));
    if (result.outcome === '6AM') wins += 1;
    causes.set(result.outcome, (causes.get(result.outcome) ?? 0) + 1);
    survivedMs += result.frames * (1000 / 60);
  }
  return {
    game, night, policy, seeds, wins, custom,
    rate: wins / seeds,
    meanSurvivedS: survivedMs / seeds / 1000,
    causes: Object.fromEntries([...causes.entries()].sort((a, b) => b[1] - a[1])),
  };
}

function report(row) {
  const pct = (row.rate * 100).toFixed(2).padStart(6);
  const dials = row.custom ? ` [${Object.values(row.custom).join('/')}]` : '';
  const line = `${row.game} night ${row.night}${dials} ${row.policy.padEnd(16)} ` +
    `${String(row.wins).padStart(6)}/${row.seeds}  ${pct}%  ` +
    `mean ${row.meanSurvivedS.toFixed(0).padStart(3)}s`;
  const worst = Object.entries(row.causes).filter(([cause]) => cause !== '6AM');
  return worst.length ? `${line}  | ${worst.map(([c, n]) => `${c} ${n}`).join(', ')}` : line;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const entry = SIMS[args.game];
  const nights = args.night ? [args.night] : entry.nights;
  const policies = args.all ? Object.keys(entry.policies) : [args.policy];
  const rows = [];
  for (const policy of policies) {
    for (const night of nights) {
      rows.push(census({ game: args.game, night, policy, seeds: args.seeds,
                         options: args.options, custom: args.custom }));
    }
  }
  if (args.json) { console.log(JSON.stringify(rows, null, 2)); return; }
  for (const row of rows) console.log(report(row));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
