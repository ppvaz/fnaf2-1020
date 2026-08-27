// The indexes must describe what is actually here, and every link must resolve.
//
// This repository is mostly an evidence argument, so the route to a page is
// part of the evidence: a finding nobody can reach is close enough to a
// finding that does not exist. Both indexes had drifted, silently, in the way
// an index always does -- nothing recomputes it, and a missing row looks
// exactly like a subject that has no page.
//
// What that cost, measured 2026-08-26:
//
//   - `tools/TOOLS.md` was missing 47 of 137 tool scripts, including
//     `grade-run.sh` -- the one command CLAUDE.md says to run before quoting
//     any number off a device run -- plus `grade-night.py` ("the only number
//     that is a run length") and `desync-scan.py` ("only desync-scan.py says
//     what the game did"). docs/README.md routes "Find the right command"
//     here. This is CLAUDE.md's "an instrument nobody runs is a comment" one
//     layer up: an instrument nobody can find.
//   - `docs/README.md` was missing 5 of 32 pages, one of them
//     `HID-MULTITOUCH.md` -- 26 inbound references, and the page CLAUDE.md's
//     own read-before-concluding table points at for any device-run claim.
//   - `ONE-PIXEL-VISION.md` linked three files under gitignored `captures/`
//     that existed for no reader and that no script regenerates.
//
// A mention is not an entry. TOOLS.md is checked for a table ROW whose first
// cell names the script, because prose naming a tool is what made the old
// substring check pass while the tool had no entry -- the same trap
// test-grade-run-coverage.mjs documents for grade-run.sh's header.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const complain = (message) => { console.error(message); failed = 1; };

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);

// --- 1. every relative link in a tracked markdown file resolves.
//
// Anchors are stripped: this checks that the file exists, not that a heading
// does. A link into gitignored output is a failure and not an exemption --
// that is precisely the case that was found, and "it is generated" is only an
// answer if something in the repository generates it.
const markdown = tracked.filter((f) => f.endsWith('.md'));
let links = 0;
for (const file of markdown) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const here = dirname(join(ROOT, file));
  for (const m of text.matchAll(/\]\(([^)\s]+?)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links += 1;
    if (!existsSync(resolve(here, decodeURI(target))))
      complain(`${file} links to ${target}, which does not exist`);
  }
}

// --- 2. docs/README.md lists every page under docs/.
const docsIndex = readFileSync(join(ROOT, 'docs', 'README.md'), 'utf8');
const docPages = markdown.filter((f) => f.startsWith('docs/') && f !== 'docs/README.md'
  && basename(f) !== 'README.md');
for (const page of docPages)
  if (!docsIndex.includes(basename(page)))
    complain(`${page} is not listed in docs/README.md -- the index is how a ` +
      'cold session finds it, and an unlisted page reads as a subject with no page');

// --- 3. tools/TOOLS.md carries an ENTRY for every tool script.
const toolsIndex = readFileSync(join(ROOT, 'tools', 'TOOLS.md'), 'utf8');
const entries = new Set();
for (const line of toolsIndex.split('\n')) {
  if (!line.startsWith('|')) continue;
  const cells = line.split('|');
  if (cells.length < 3) continue;
  for (const m of cells[1].matchAll(/`([\w./-]+\.(?:mjs|json|cs|py|sh|c|S))\b/g))
    entries.add(basename(m[1]));
}
const scripts = tracked.filter((f) => f.startsWith('tools/') && /\.(mjs|py|sh|c|S)$/.test(f));
for (const script of scripts)
  if (!entries.has(basename(script)))
    complain(`${script} has no entry in tools/TOOLS.md. A row naming it, its ` +
      'kind (check/report/module/device action) and its interface -- not a ' +
      'mention in prose, which is what let this drift to 47 missing scripts');

// --- 4. TOOLS.md must not list a script that has been deleted.
for (const name of entries) {
  if (/\.(cs|json|S)$/.test(name)) continue; // fixtures and plugin sources
  if (!scripts.some((s) => basename(s) === name))
    complain(`tools/TOOLS.md has an entry for ${name}, which is not a tracked ` +
      'tool script -- a stale entry sends a reader after a command that is gone');
}

if (failed) process.exit(1);
console.log(`docs: ${links} links resolve, ${docPages.length} pages indexed, ` +
  `${scripts.length} tool scripts carry an entry`);
