package com.fnaf2.cuehelper;

/** Host regression for bounded overlay timing/drop accounting. */
public final class OverlayMetricsTest {
    public static void main(String[] args) {
        OverlayMetrics metrics = new OverlayMetrics();
        metrics.onSnapshot(1, 1_000_000L);
        metrics.onRendered(1, 3_000_000L);
        metrics.onSnapshot(3, 5_000_000L);
        metrics.onRendered(3, 9_000_000L);
        OverlayMetrics.Snapshot snapshot = metrics.snapshot();
        if (snapshot.updates != 2 || snapshot.draws != 2
                || snapshot.droppedUpdates != 1
                || snapshot.p50UpdateToDrawNs != 2_000_000L
                || snapshot.p99UpdateToDrawNs != 4_000_000L
                || snapshot.p50DrawIntervalNs != 6_000_000L
                || snapshot.p99DrawIntervalNs != 6_000_000L) {
            throw new AssertionError("overlay metrics accounting failed: "
                    + snapshot.format());
        }

        OverlayMetrics coalesced = new OverlayMetrics();
        coalesced.onSnapshot(10, 1_000_000L);
        coalesced.onSnapshot(11, 2_000_000L);
        coalesced.onSnapshot(12, 3_000_000L);
        coalesced.onRendered(12, 4_000_000L);
        OverlayMetrics.Snapshot coalescedSnapshot = coalesced.snapshot();
        if (coalescedSnapshot.updates != 3 || coalescedSnapshot.draws != 1
                || coalescedSnapshot.droppedUpdates != 2) {
            throw new AssertionError("overlay coalescing accounting failed: "
                    + coalescedSnapshot.format());
        }

        metrics.onSnapshot(90, 10_000_000L);
        metrics.onRendered(90, 11_000_000L);
        metrics.reset();
        metrics.onSnapshot(0, 20_000_000L);
        metrics.onRendered(0, 21_000_000L);
        OverlayMetrics.Snapshot resetSnapshot = metrics.snapshot();
        if (resetSnapshot.updates != 1 || resetSnapshot.draws != 1
                || resetSnapshot.droppedUpdates != 0
                || resetSnapshot.p50UpdateToDrawNs != 1_000_000L) {
            throw new AssertionError("overlay session reset failed: "
                    + resetSnapshot.format());
        }
        System.out.println("OverlayMetricsTest: all checks passed");
    }
}
