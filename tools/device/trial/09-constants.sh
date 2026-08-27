# Device constants. The plan carries the schedule; these are properties of the
# phone that no simulator can emit, so they stay here and are named.
#
# The select leads its light pulse by this much inside a sweep burst.
#
# Zero, and not by preference: the select and its light both need the full
# phone-proven 100 ms contact. A positive lead spends that budget twice and
# puts the light pulse under the same floor, which is how it once became 90 ms.
# The emitted 133 ms slot leaves its separate 33 ms released gap after this
# shared contact.
SWEEP_LIGHT_LEAD_MS=0
# LIGHT_AFTER sweep geometry (plans/17). When the plan's sweep CONTACT is
# under 50 ms it is a light-after plan: the map button is a Fusion Click
# (`viewing` on RELEASE, g22) and the flashlight registers on PRESS (g82), so
# sending them together renders each light on the PREVIOUS feed. The runner
# then does, per camera: select down, hold SELECT_MS, select up (Click ->
# viewing = N), one frame to settle, light down on the settled feed, hold the
# plan's `contact` ms, light up. Device-validated 2026-08-27: every camera
# lights, CAM 07 included. Each camera costs SELECT_MS + SETTLE_MS + contact.
SWEEP_SELECT_MS=17
SWEEP_SETTLE_MS=17
# A tap's contact. Named because the driver has to reason about when a tap
# *finishes*, not just when it starts.
TAP_CONTACT_MS=100
# Fusion polls touch once per frame, so two different controls with no released
# time between them can read as one finger moving from one to the other and the
# second never fires. Mirrors MIN_RELEASED_MS in test-hid-trace.mjs.
#
# This is the floor below which the auditor calls a trace defective. It is not
# the number to *design* to: the plan is built to a full 30 Hz Fusion poll and
# test-recipe.mjs asserts 33 ms between every pair of controls inside a cycle.
# Where the runner chooses a gap rather than checks one, it uses FUSION_POLL_MS,
# so the seam between two cycles gets the same guarantee as everything within
# one. Designing to the floor is how a 20 and a 33 end up meaning the same
# thing in two files and then quietly stop agreeing.
MIN_RELEASED_MS=20
FUSION_POLL_MS=33
# src/config.js MONITOR_ANIM_DOWN = 22 frames. The office is not interactive
# until the flip finishes, so a corrective lower has to be waited out.
MONITOR_ANIM_DOWN_MS=367
# The vent read starts its capture this long after the light goes down.
# screencap latches 163-348 ms after it starts and the vent needs ~270 ms to
# draw, so this puts the frame 363-548 ms past the light: past the point an
# unlit opening could be read as a confident `inside`, and early enough that
# the classifier still answers before the cycle's cut-off.
READ_CAPTURE_DELAY_MS=200
# Balloon Boy needs five five-second rolls to reach the office, so nothing
# before this is him. It is the only thing that separates a dropped vent-light
# press from marker 123 on a dark frame, because the two look identical: g96
# forces `lit?` to zero and g301/g303 stop the vent lights answering once he is
# inside, so "the lamp is dark" is a *consequence* of him being there as well as
# of the press being lost.
BB_EARLIEST_INSIDE_MS=25000
# How many consecutive unlit reads mean the light is never coming back.
#
# Three ways the lamp goes dark, and only one of them ends the night: a dropped
# light press (recovers on the next read); `in danger` latched by an office
# encounter (g443-447 -- g75/g76/g77 block every light until the mask resolves
# it, seconds); and Balloon Boy at 123 (permanent, g96/g301/g303). Night 6-43
# hit the second: Mangle's overlay slid through the office, the fail-closed
# mask cleared her exactly as the strategy says, and three dark reads --
# spanning one encounter -- were read as "BB inside" and aborted a night whose
# final frames show a live camera feed. An encounter's darkness spans two to
# three 10 s attack cycles at most, so the streak that means marker 123 has to
# be longer than any encounter can account for.
NOLIGHT_STREAK_MAX=5
