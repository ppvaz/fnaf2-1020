package com.fnaf2.cuehelper;

/**
 * Deterministic priority/conflict rule for already-produced decision cues.
 * Fact validation still happens when the winning cue enters OverlaySnapshot.
 */
public final class OverlayCueArbiter {
    private OverlayCueArbiter() {
    }

    public static OverlaySnapshot.Cue choose(OverlaySnapshot.Cue[] candidates,
            long nowNs) {
        if (candidates == null || candidates.length == 0 || nowNs <= 0L) {
            return OverlaySnapshot.Cue.none();
        }
        OverlaySnapshot.Cue winner = null;
        int highestPriority = -1;
        boolean conflictingAtHighestPriority = false;
        for (OverlaySnapshot.Cue candidate : candidates) {
            if (candidate == null || candidate.action == OverlaySnapshot.CueAction.NONE
                    || !candidate.qualified || candidate.expired(nowNs)
                    || candidate.coolingDown(nowNs)) {
                continue;
            }
            if (candidate.priority > highestPriority) {
                // A higher-priority cue supersedes any lower-priority conflict
                // encountered earlier in the input sequence.
                highestPriority = candidate.priority;
                winner = candidate;
                conflictingAtHighestPriority = false;
                continue;
            }
            if (candidate.priority == highestPriority) {
                if (candidate.action != winner.action) {
                    // Equal-priority imperatives with different actions are
                    // not resolvable at the renderer boundary. Keep scanning
                    // in case a later candidate has an even higher priority.
                    conflictingAtHighestPriority = true;
                } else if (!conflictingAtHighestPriority
                        && candidate.severity.ordinal() > winner.severity.ordinal()) {
                    winner = candidate;
                }
            }
        }
        return winner == null || conflictingAtHighestPriority
                ? OverlaySnapshot.Cue.none() : winner;
    }
}
