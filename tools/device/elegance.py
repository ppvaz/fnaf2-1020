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

An action may answer MORE THAN ONE threat, or serve a purpose that is not a
threat at all, and pretending otherwise is how this tool was wrong TWICE. The
held-light sweep stuns whoever the camera marker overlaps rather than one named
character; the vent read is simultaneously the Balloon Boy check, the health
guards and the desync checkpoint. Both were attributed to a single animatronic
and both then graded as pure waste on a night that animatronic sits out.

That is the standing hazard in this file, not a fixed pair of bugs: this route's
actions are routinely multi-purpose, so before adding a SERVES row, go and read
every consumer of the thing it names. See SERVES.

Every row was audited against the event-sheet dump on 2026-08-26 and three more
instances turned up, each with its groups cited on the row: CAM 11 is Mangle's
cam-stall as well as the Puppet's box, the mask repels eight characters rather
than three (and makes Withered Foxy WORSE), and the hall flash stuns Withered
Freddy as well as resetting Foxy. None of the three moved a night's figure,
because `canAct` happens to keep the old class live wherever the row fires --
they were wrong models, not wrong numbers, and the reason to fix them is that
the next AI-table or route change turns a wrong model into a wrong number with
nothing to notice. `wind`, `monitor`, `monitor-verify/resync` and `mute` were
checked the same way and left alone; the audit is recorded on their rows too,
so the next reader does not have to redo it to find out it was done.

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
    # Winding IS single-purpose, checked rather than assumed (2026-08-26). The
    # box level is `music button`.AlterableValue0; g638/639 are the only writers
    # a press can reach and both gate on `viewing == 11`. Of the 35 frame-3
    # groups that touch the object, exactly two read v0 as a game rule --
    # g494/495, the Puppet's escape-stage advance, which need `v0 <= 0`. Every
    # other reader is presentation: g633/634 show/hide the button, g597-600 and
    # g662 pick the music sample, g664-671 the `danger 1`/`danger 2` warnings.
    # Nobody else's movement, stun or spawn consults the box.
    (r"wind",                         "puppet"),
    # CAM 11 is not the Puppet's alone (corrected 2026-08-26 -- a wrong model,
    # not yet a wrong number). Selecting it writes BOTH fields at once
    # (g16-27 / g39+40 set `viewing = 11` and move the `your view` marker), and
    # the two fields are read by different characters:
    #   viewing == 11  -- the wind button exists at all (g633/634) and responds
    #                     to a press (g638/639); and with the light held it is
    #                     what blocks the Puppet's escape roll (g494 vs g495).
    #   your view on cam 11 -- Mangle's look-hold cam-stall (g357: his A=1 -> 2
    #                     promotion is gated on `NOT your view overlapping new
    #                     foxy`, plus `viewing > 0`). Mangle's route is
    #                     cam 12 -> cam 11 (g391) -> cam 10 -> cam 7 -> hall, so
    #                     the marker parked on 11 for the wind pins him there.
    # It stays "needed" on every night either way, because the Puppet is on
    # every night's AI row -- which is exactly why this had to be read off the
    # dump rather than off the elegance figure.
    (r"cam-?11",                      "cam11"),
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
    # The hall flash is a different mechanism from the sweep -- it is the office
    # hallway, not a camera, and its state is `viewing hall light` (written by
    # g489: monitor down + battery > 0 + lit?). It is mostly Foxy's, but not
    # only his (corrected 2026-08-26). What `viewing hall light == 1` does:
    #   g745  W. Foxy at hall stage 1 -> v3 = 0. His reset; the point of it.
    #   g864  every 500 ms, W. Foxy on cam 8 with v3 > 0 -> v3 -= 1. Same.
    #   g848  W. Freddy at hall stage 1 -> B = 40. A real stun, and not Foxy's.
    #   g849  W. Freddy at hall stage 2 -> B = 40. Same.
    # So the row is Foxy AND Withered Freddy. Two effects are deliberately NOT
    # counted:
    #   - `viewing hall light == 0` is a precondition on the hall-transit hop of
    #     six characters (g376-378 W.Freddy, g381/382 W.Bonnie, g389/390 W.Foxy,
    #     g358 + g394/395/399 Mangle, g421/422 Toy Freddy, g431/432 Toy Chica).
    #     True, but it only holds while the light is lit, and the route's pulse
    #     is ~130 ms of a ~5000 ms cycle. A block that expires with the pulse is
    #     not a service the way a latched counter reset is.
    #   - the flash is also a HAZARD: g778 spawns Golden Freddy straight into
    #     `got you box` if he is visible when it fires, and g573 kills through
    #     W. Foxy already inside. That is why the route masks before it flashes;
    #     it is not a threat this answers.
    (r"hall|flash-hall",              "hall"),
    # The vent read is NOT Balloon Boy's alone, and calling it his was the
    # second instance of the same modelling error as the sweep above -- caught
    # before it was acted on, but only just. One capture feeds three consumers
    # in 12-night-loop.sh: the `bb */empty *` branch decision, the
    # blind_streak/nolight_streak health guards, and `monitor_seen`, which is
    # the desync checkpoint (08-bb-threat-response.sh:68). On a night where
    # canAct(n,'bb') is false the read still carries the other two, so grading
    # it as waste would have recommended deleting the desync detector from
    # Night 1 while reporting an elegance gain.
    #
    # It is overhead, like @transport: a closed-loop route pays it on every
    # night regardless of who can act. Counting it as "needed" would be just as
    # dishonest in the other direction -- it answers no threat by itself.
    # `read` is the plan instruction for the same capture (vent light down,
    # screencap, up); it reaches this table whenever a macro expansion starts
    # before it, and used to fall through to @unattributed.
    (r"^read$|left-vent|left-view|classify-bb|bb-left", "@observation"),
    # The mask is not the Toys' answer (corrected 2026-08-26 -- again a wrong
    # model rather than a wrong number, since Toy Bonnie is on every night's AI
    # row). `mask`.AlterableValue0 == 2 is "fully on", and it repels EIGHT
    # characters, from three different pens:
    #   g436/437  Toy Bonnie   in office     -> cam 3
    #   g439/440  Toy Chica    in office     -> cam 7
    #   g213      Toy Freddy   hall stage 2  -> cam 9
    #   g400/401  Mangle       in office     -> cam 7
    #   g378      W. Freddy    hall stage 2  -> cam 3, plus a long B
    #   g748      W. Bonnie    got you box   -> cam 7, B = 500
    #   g749      W. Chica     got you box   -> cam 4
    #   g292/294  Balloon Boy  in office     -> cam 10
    #   g776      Golden Freddy visible      -> v0 = 1 and fade out
    # Withered Foxy is NOT in that list and must not be: g824 ticks his approach
    # counter every 1000 ms, and g825 ticks it a SECOND time per second while
    # the mask is fully on and nobody is at the vent opening. The mask makes
    # Foxy strictly worse. His answer is the hall flash (g745), which is why the
    # two are separate rows.
    (r"mask",                         "maskable"),
    (r"monitor-(verify|resync)",      "@correction"),
    # Raising and dropping the monitor answers nobody by itself: it is the
    # carrier every other action needs (the wind button only exists at
    # `viewing == 11`, the stun needs `viewing > 0`, the hall flash needs
    # `viewing == 0`). It is not free of consequence -- a raise is what lets
    # Balloon Boy cash his latch (g417) and step from the opening into the
    # office (g290/291) -- but a cost is not a threat answered, so it stays
    # overhead rather than becoming a class.
    (r"monitor",                      "@transport"),
    # The MUTE CALL button (coords.sh TAP_MUTE, pressed once at T0 by
    # 12-night-loop.sh). Nothing in frame 3 reads it as a game rule; it exists
    # so the phone-call audio does not sit on top of the cue recordings.
    (r"mute",                         "@setup"),
]

# Each class is "any of these can act". A class exists when one press answers
# several characters at once; it never means "all of them must be live".
CLASS_IDS = {"puppet": ["puppet"], "foxy": ["foxy"], "bb": ["bb"],
             # CAM 11: the Puppet through `viewing`, Mangle through the marker.
             "cam11": ["puppet", "mangle"],
             # The hall flash: Foxy's counter reset, W. Freddy's hall stun.
             "hall": ["foxy", "withfreddy"],
             # Everyone the fully-raised mask sends back out of the office or
             # the hall, per the groups listed on the `mask` row above.
             "maskable": ["toybonnie", "toychica", "toyfreddy", "mangle",
                          "withfreddy", "withbonnie", "withchica", "bb",
                          "golden"],
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
    src = ("import { canAct } from './packages/core/src/mechanics/config.js';"
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
    "hall": 1,
    "read": 2,            # vent light down, and up again
}


def instruction_contacts(kind, rest):
    """One plan instruction, as the labelled contacts it actually delivers.

    A COMPOUND ROW IS NOT ONE PURPOSE, and this is the same hazard as SERVES.
    `maskraise 180 hall 134` is a mask press, a hallway flash and a monitor
    raise fused into one HID macro because the mask -> monitor seam drops
    presses about half the time (CLAUDE.md; ON-DEVICE-VALIDATION.md "Which
    press desyncs, and why"). Fusing them is a device workaround, not a claim
    that all three answer the same threat -- so each contact is labelled by what
    it does, and `serves()` classifies them separately. Attributing the whole
    macro to `mask` charged the mask row for the run's Foxy resets and its
    monitor raises.
    """
    if kind in ("tap", "hold"):
        return [(rest[0], 1)]
    if kind == "sweep":                       # spacing contact cam,cam,cam
        cams = rest[2].split(",") if len(rest) > 2 else []
        return [("sweep", len(cams) + 2)]     # each camera, plus light down/up
    if kind == "maskraise":                   # gap [hall N] -> mask, hall, raise
        out = [("mask", 1)]
        if len(rest) > 1 and rest[1] == "hall":
            out.append(("hall", 1))
        return out + [("monitor", 1)]
    if kind == "hallraise":                   # hall pulse under a raise
        return [("hall", 1), ("monitor", 1)]
    return [(kind, CONTACTS.get(kind, 1))]


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
                actions.extend(instruction_contacts(kind, args))
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
    # @observation belongs here: it is overhead a closed-loop route pays on
    # every night. Leaving it out meant the four buckets did not sum to `sent`
    # -- 950 + 70 + 1 + 220 against 1332 on the Night 1 log -- and a total that
    # does not add up is how a missing category hides.
    overhead = sum(n for c, n in by_class.items()
                   if c in ("@transport", "@setup", "@observation",
                            "@unattributed"))
    total = sum(n for _, n in actions)
    if needed + wasted + correction + overhead != total:
        print(f"{a.runlog}: the buckets do not sum to the contacts sent "
              f"({needed}+{wasted}+{correction}+{overhead} != {total}); a class "
              "in SERVES has no bucket", file=sys.stderr)
        raise SystemExit(2)

    rows = []
    for c in sorted(by_class, key=lambda k: -by_class[k]):
        if c.startswith("@"):
            verdict = {"@correction": "desync overhead",
                       "@transport": "transport",
                       "@observation": "observation overhead",
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
