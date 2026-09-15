#!/usr/bin/env python3
"""office-seed-bracket.py against the lines that fooled a timestamp-ordered read.

The fixture is full-06's office load (2026-09-15): a "startTheFrame() called"
line shares the millisecond with "Starting new frame" and precedes it. Read
by time, the bracket collapses to one candidate; read by line order it is the
14 ms pair that the helper onset sits 69-82 ms after. No phone, no game log.
"""
import importlib.util, json, os, pathlib, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('osb', HERE / 'office-seed-bracket.py')
osb = importlib.util.module_from_spec(spec); spec.loader.exec_module(osb)

FULL06 = """         1789512692.806 26897 26897 I MMFRuntime: startTheFrame() called
         1789512692.920 26897 26897 I MMFRuntime: loading frame #:4
         1789512693.100 26897 26897 I MMFRuntime: (loading)
         1789512694.248 26897 26897 I MMFRuntime: startTheFrame() called
         1789512694.248 26897 26897 I MMFRuntime: Starting new frame
         1789512694.250 26897 26897 I MMFRuntime: (init)
         1789512694.261 26897 26897 I MMFRuntime: startTheFrame() called
         1789512694.261 26897 26897 I MMFRuntime: All loaded in frame: 4 and took: 1307 (msecs) ...
"""
failures = []
def check(ok, msg):
    if not ok: failures.append(msg)

lines = FULL06.splitlines()
check(osb.bracket(lines) == (1789512694248, 1789512694261), f'full-06 pair by line order: {osb.bracket(lines)}')

# An earlier frame's load must not be taken for the office: the LAST office load wins.
earlier = ["         1789512680.000 1 1 I MMFRuntime: loading frame #:4",
           "         1789512680.100 1 1 I MMFRuntime: Starting new frame",
           "         1789512680.105 1 1 I MMFRuntime: startTheFrame() called"] + lines
check(osb.bracket(earlier) == (1789512694248, 1789512694261), 'the last office load is the bracket')

check(isinstance(osb.bracket(lines[:2]), str), 'a load without its pair is refused')
check(isinstance(osb.bracket(["         1.0 1 1 I MMFRuntime: Starting new frame"]), str), 'no office load is refused')

with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'x.logcat'); open(p, 'w').write(FULL06)
    out = subprocess.run([sys.executable, str(HERE / 'office-seed-bracket.py'), p, '--onset-ms', '1789512694330.005'],
                         capture_output=True, text=True)
    check(out.returncode == 0, f'cli exit {out.returncode}: {out.stderr}')
    j = json.loads(out.stdout or '{}')
    check(j.get('candidates') == 14 and j.get('low16') == [47592, 47605], f'cli bracket: {j}')
    check(j.get('beforeOnsetMs') == [69.0, 82.0], f'before onset: {j.get("beforeOnsetMs")}')
    out = subprocess.run([sys.executable, str(HERE / 'office-seed-bracket.py'), os.path.join(d, 'missing.logcat')], capture_output=True, text=True)
    check(out.returncode == 1, 'a missing log exits 1')

for f in failures: print('FAIL', f)
print('office-seed-bracket: pair by line order, last load, refusals, cli json' if not failures else f'{len(failures)} failures')
sys.exit(1 if failures else 0)
