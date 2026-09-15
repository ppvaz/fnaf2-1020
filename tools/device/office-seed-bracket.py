#!/usr/bin/env python3
"""The office frame's RNG seed bracket, from the game's own log.

  tools/device/office-seed-bracket.py LOGCAT [--onset-ms MS] [--json OUT]

LOGCAT is `adb logcat -v epoch -s MMFRuntime:V` captured live around a run
(the phone's 256 KiB log ring rolls over in about a minute, so it must be
streamed, not read back). The Fusion runtime seeds its one 16-bit LCG with
the low 16 bits of currentTimeMillis in CRun.allocRunHeader, the first call of
initRunLoop, which runs between the office frame's "Starting new frame" line
and the "startTheFrame() called" line that follows it (docs/evidence/
night7-k3-seedlog-nights-20260915.json). The bracket is that pair, and every
whole millisecond in it is a candidate seed.

The pair is found by LINE ORDER, never by timestamp: a "startTheFrame()
called" line precedes "Starting new frame" in the same millisecond on every
load, and picking it by time collapses the bracket to one wrong candidate
(2026-09-15, full-06). The office is Fusion frame 4 here ("loading frame #:4").

Prints one JSON object: fromMs, toMs, candidates, low16 [first, last], and
with --onset-ms the bracket's distance before the helper's night onset
(beforeOnsetMs [min, max]); exits 1 with a reason when the office load or its
pair is not in the log.
"""
import argparse, json, sys

OFFICE_LOAD = 'loading frame #:4'
START = 'Starting new frame'
CALLED = 'startTheFrame() called'


def epoch_ms(line):
    return int(round(float(line.split()[0]) * 1000))


def bracket(lines):
    """(from_ms, to_ms) of the office frame's seed, or a refusal string."""
    loads = [i for i, l in enumerate(lines) if OFFICE_LOAD in l]
    if not loads:
        return 'no office load ("loading frame #:4") in the log'
    i = loads[-1]
    start = next((k for k in range(i, len(lines)) if START in lines[k]), None)
    if start is None:
        return 'office load without a following "Starting new frame"'
    called = next((k for k in range(start + 1, len(lines)) if CALLED in lines[k]), None)
    if called is None:
        return '"Starting new frame" without a following "startTheFrame() called"'
    return epoch_ms(lines[start]), epoch_ms(lines[called])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('logcat'); ap.add_argument('--onset-ms', type=float); ap.add_argument('--json')
    a = ap.parse_args()
    try:
        lines = [l for l in open(a.logcat, errors='ignore').read().splitlines() if 'MMFRuntime' in l]
    except OSError as e:
        print(f'cannot read {a.logcat}: {e}', file=sys.stderr); return 1
    got = bracket(lines)
    if isinstance(got, str):
        print(got, file=sys.stderr); return 1
    lo, hi = got
    out = {'schema': 'office-seed-bracket-v1', 'fromMs': lo, 'toMs': hi, 'candidates': hi - lo + 1,
           'low16': [lo & 0xffff, hi & 0xffff]}
    if a.onset_ms is not None:
        out['onsetPhoneWallMs'] = a.onset_ms
        out['beforeOnsetMs'] = [round(a.onset_ms - hi, 1), round(a.onset_ms - lo, 1)]
    text = json.dumps(out)
    print(text)
    if a.json:
        open(a.json, 'w').write(text + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
