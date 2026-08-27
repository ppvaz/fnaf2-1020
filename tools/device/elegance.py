#!/usr/bin/env python3
"""How many inputs did the run send, and how many did that night need?

An elegance metric, and an approximation that says so. It exists because a route
qualified once for the hardest night is then played on every night, and nothing
reports the cost of that. The cleared Night 1 is the worked example: it sent 74
lit vent reads and nine mask responses hunting an animatronic whose AI is 0 on
that night and who therefore cannot act at all.

    elegance.py RUNLOG --night N          # captures/NAME-run.log

WHAT "NEEDED" MEANS HERE, because it is a model and not a measurement:

An action is NEEDED when the sourced per-night AI table (`src/config.js`,
`AI_BY_NIGHT`, via `canAct`) says a threat it answers can act on that night.
It is NOT needed when every threat it answers has peak AI zero -- the engine's
own `canAct()` is the authority.

An action may answer MORE THAN ONE threat, and pretending otherwise is how this
tool was first wrong: the held-light sweep stuns whoever the camera marker
overlaps, not one named character. See SERVES.

~~the same one `recipe.mjs` uses to decide whether to emit a branch at all.~~
**Corrected 2026-08-26: recipe.mjs does not do this.** `--device-plan
--night=1` and `--night=6` are byte-identical apart from the `#night` header.
`resolveAttack` computes `reachable: false` for a branch the night cannot arm
and records it in the plan metadata, and nothing consumes the flag.

This is a LOWER BOUND on waste, never an upper bound on skill:

  - it does not know whether a needed action was needed AT THAT MOMENT. Winding
    the box is needed on every night; winding it more than the drain requires is
    waste this cannot see.
  - a threat that can act does not act every cycle. Masking for toy animatronics
    is `needed` here whenever they can act, though most of those masks answered
    nothing.
  - corrections (`monitor-verify`, `monitor-resync`) are counted separately as
    overhead. They are neither gameplay nor waste: they are the cost of having
    desynced, and a route that never desynced would send none.

So a run can be graded elegant here and still be sloppy. It cannot be graded
elegant while hunting an animatronic that does not exist.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# Which animatronic each action of the route answers. The engine decides
# whether that animatronic matters; this table only says what the press is FOR.
SERVES = [
    (r"wind",                         "puppet"),
    (r"cam-?11",                      "puppet"),      # the box is on CAM 11
    # The held-light sweep is NOT one animatronic's answer, and calling it
    # Foxy's made this tool confidently wrong on the night it was first used.
    # Groups 450-457 stun whatever `your view` overlaps -- g450-452 the
    # Withereds, g453/454/455 Toy Freddy/Bonnie/Chica, g456 Mangle -- for
    # STUN_FRAMES = 400, which is 6.67 s against a ~5 s cycle, so a swept
    # camera holding a character pins him indefinitely. On Night 1 Foxy cannot
    # act and the Toys are the whole threat, so the old row graded the sweep as
    # 481 wasted inputs while it was doing the night's primary defensive work.
    # A live Night 1 showed Toy Bonnie locked in one camera and never escaping.
    (r"^sweep$|cam-?(10|04|4|07|7)",  "stun"),
    # The hall flash is different and does stay Foxy's: it is the office
    # hallway, not a camera, and it is his reset rather than a marker stun.
    (r"hall|flash-hall",              "foxy"),        # the Foxy reset flash
    (r"left-vent|left-view|classify-bb|bb-left", "bb"),
    (r"mask",                         "toys"),
    (r"monitor-(verify|resync)",      "@correction"),
    (r"monitor",                      "@transport"),
    (r"mute",                         "@setup"),
]

# The toy trio act as one threat class for this purpose: any of them entering
# the office is answered by the same mask.
CLASS_IDS = {"puppet": ["puppet"], "foxy": ["foxy"], "bb": ["bb"],
             "toys": ["toybonnie", "toychica", "toyfreddy"],
             # Everyone a held camera light can pin. The sweep is needed if ANY
             # of them can act, which is the honest reading of a stun that
             # targets by marker rather than by name.
             "stun": ["foxy", "toybonnie", "toychica", "toyfreddy",
                      "withbonnie", "withchica", "withfreddy", "mangle"]}


def serves(label):
    for pattern, who in SERVES:
        if re.search(pattern, label):
            return who
    return "@unattributed"


def can_act(night, ids):
    src = ("import { canAct } from './src/config.js';"
           f"console.log(JSON.stringify({json.dumps(ids)}"
           f".map(i => canAct({int(night)}, i))));")
    out = subprocess.run(["node", "--input-type=module", "-e", src],
                         cwd=REPO, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, check=False)
    if out.returncode != 0:
        print("could not ask the engine which threats can act:\n"
              + out.stderr.decode()[:400], file=sys.stderr)
        raise SystemExit(2)
    return json.loads(out.stdout.decode())


# Contacts per plan instruction. The driver logs a compound row as ONE line
# ("macro clear[2..999]"), so counting log lines undercounts inputs badly -- the
# first version of this tool called 74 macros "unattributed" and reported 2%
# elegance off a count that was mostly missing. These come from the shapes
# recipe.mjs emits and trial.sh executes.
CONTACTS = {
    "tap": 1, "hold": 1, "hall": 1, "hallraise": 2,
    "read": 2,            # vent light down, and up again
}


def instruction_contacts(kind, rest):
    if kind == "sweep":                       # spacing contact cam,cam,cam
        cams = rest[2].split(",") if len(rest) > 2 else []
        return len(cams) + 2                  # each camera, plus light down/up
    if kind == "maskraise":                   # gap [hall N] -> mask, hall, raise
        return 3 if len(rest) > 1 and rest[1] == "hall" else 2
    return CONTACTS.get(kind, 1)


def load_plan(night):
    out = subprocess.run(["node", os.path.join(HERE, "recipe.mjs"),
                          "--device-plan", f"--night={int(night)}"],
                         cwd=REPO, stdout=subprocess.PIPE, check=False)
    cycles, cur = {}, None
    for line in out.stdout.decode().split("\n"):
        line = line.strip()
        if line.startswith("#cycle"):
            cur = line.split()[1]; cycles[cur] = []
        elif line and not line.startswith("#") and cur:
            parts = line.split()
            cycles[cur].append((parts[1], parts[2:]))
    return cycles


def parse(path, cycles):
    """Every CONTACT the run delivered, as (label, count).

    Individually logged actions count as themselves; a `macro <cycle>[i..j]`
    line is expanded through the plan it executed.
    """
    actions = []
    for line in open(path, errors="replace"):
        m = re.match(r"\s*(\d+) ms\s+(\S+)(.*)", line)
        if not m:
            continue
        label, rest = m.group(2), m.group(3)
        if label in ("classify-bb-left",) or "snapshot" in line:
            continue
        if label == "macro":
            mm = re.search(r"(\w+)\[(\d+)\.\.(\d+)\]", rest)
            if not mm or mm.group(1) not in cycles:
                actions.append(("@unattributed", 1)); continue
            seq = cycles[mm.group(1)][int(mm.group(2)):]
            for kind, args in seq:
                nm = kind if kind not in ("tap", "hold") else args[0]
                actions.append((nm, instruction_contacts(kind, args)))
            continue
        actions.append((label, 1))
    return actions


def main():
    p = argparse.ArgumentParser()
    p.add_argument("runlog")
    p.add_argument("--night", type=int, required=True)
    p.add_argument("--json", action="store_true")
    a = p.parse_args()

    cycles = load_plan(a.night)
    actions = parse(a.runlog, cycles)
    if not actions:
        print(f"{a.runlog}: no scheduled actions found", file=sys.stderr)
        raise SystemExit(2)

    by_class = Counter()
    for lbl, n in actions:
        by_class[serves(lbl)] += n
    threats = [c for c in by_class if not c.startswith("@")]
    live = {}
    for c in threats:
        live[c] = any(can_act(a.night, CLASS_IDS[c]))

    needed = sum(n for c, n in by_class.items() if not c.startswith("@") and live[c])
    wasted = sum(n for c, n in by_class.items() if not c.startswith("@") and not live[c])
    correction = by_class.get("@correction", 0)
    overhead = sum(n for c, n in by_class.items()
                   if c in ("@transport", "@setup", "@unattributed"))
    total = sum(n for _, n in actions)

    rows = []
    for c in sorted(by_class, key=lambda k: -by_class[k]):
        if c.startswith("@"):
            verdict = {"@correction": "desync overhead",
                       "@transport": "transport",
                       "@setup": "setup"}.get(c, "unattributed")
        else:
            verdict = "needed -- can act" if live[c] else "WASTED -- AI 0 this night"
        rows.append((c, by_class[c], verdict))

    if a.json:
        print(json.dumps({"runlog": a.runlog, "night": a.night, "sent": total,
                          "needed": needed, "wasted": wasted,
                          "desync_overhead": correction, "overhead": overhead,
                          "by_class": {c: {"count": n, "verdict": v}
                                       for c, n, v in rows}}, indent=2))
        return 0

    print(f"{a.runlog}: night {a.night}, {total} contacts "
          f"({len(actions)} scheduled actions, macros expanded through the plan)")
    for c, n, v in rows:
        print(f"  {c:16} {n:5}   {v}")
    print(f"\n  sent            {total:5}")
    print(f"  needed          {needed:5}   threats the AI table says can act")
    print(f"  wasted          {wasted:5}   answering threats with peak AI 0")
    print(f"  desync overhead {correction:5}   corrections; a synced run sends none")
    if total:
        print(f"\n  ELEGANCE: {100 * needed / total:.0f}% of inputs answered a live "
              f"threat; {100 * wasted / total:.0f}% answered nothing that could act.")
    print("  This is a lower bound on waste. It cannot see a needed action sent "
          "at the wrong moment -- see the module docstring.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
