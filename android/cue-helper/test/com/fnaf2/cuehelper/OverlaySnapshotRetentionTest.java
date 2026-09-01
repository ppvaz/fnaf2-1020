package com.fnaf2.cuehelper;

/** Host regression for flicker-free, bounded last-known debug state. */
public final class OverlaySnapshotRetentionTest {
    private static OverlaySnapshot snapshot(long sequence,
            OverlaySnapshot.Screen screen,
            OverlaySnapshot.MonitorState monitorState) {
        return snapshot(sequence, screen, monitorState, -1);
    }

    private static OverlaySnapshot snapshot(long sequence,
            OverlaySnapshot.Screen screen,
            OverlaySnapshot.MonitorState monitorState,
            int batteryPercent) {
        return new OverlaySnapshot(sequence, 1_000_000L + sequence,
                screen, OverlaySnapshot.Mode.SENSOR_DEBUG,
                new OverlaySnapshot.Region[] {
                        new OverlaySnapshot.Region("bb_left_luma",
                                OverlaySnapshot.FactState.MONITORED, 12,
                                Double.NaN, OverlaySnapshot.ScoreType.NONE,
                                0L, 1L, false)
                }, OverlaySnapshot.Cue.none(), monitorState,
                monitorState == OverlaySnapshot.MonitorState.DOWN
                        ? "anchors-down" : "monitor-state-unavailable",
                null, "monitor-not-up", batteryPercent,
                batteryPercent >= 0 ? "bars-observed" : "battery-unavailable");
    }

    private static void check(String what, boolean value) {
        if (!value) throw new AssertionError(what);
    }

    public static void main(String[] args) {
        OverlaySnapshotRetention retention = new OverlaySnapshotRetention(100L);
        OverlaySnapshot nightDown = snapshot(1,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.MonitorState.DOWN);
        OverlaySnapshot unknown = snapshot(2,
                OverlaySnapshot.Screen.UNKNOWN,
                OverlaySnapshot.MonitorState.UNKNOWN);
        OverlaySnapshot nightUnknown = snapshot(3,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.MonitorState.UNKNOWN);
        OverlaySnapshot menu = snapshot(4,
                OverlaySnapshot.Screen.FNAF2_MENU,
                OverlaySnapshot.MonitorState.UNKNOWN);

        check("known night state is accepted", retention.accept(nightDown, 1_000L)
                == nightDown);
        check("unknown identity retains the last night state",
                retention.accept(unknown, 1_050L) == nightDown);
        check("unknown monitor state retains the last night state",
                retention.accept(nightUnknown, 1_080L) == nightDown);
        check("confirmed menu clears retained elements",
                retention.accept(menu, 1_081L) == menu);
        check("menu does not resurrect old elements",
                retention.accept(unknown, 1_090L) == unknown);

        check("a later known night state starts a new hold",
                retention.accept(nightDown, 2_000L) == nightDown);
        check("expired unknown state is no longer retained",
                retention.accept(unknown, 2_101L) == unknown);

        OverlaySnapshot batteryNight = snapshot(6,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.MonitorState.DOWN, 100);
        OverlaySnapshot batteryGap = snapshot(7,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.MonitorState.DOWN, -1);
        check("a transient battery read gap retains the last battery state",
                retention.accept(batteryNight, 4_000L) == batteryNight
                        && retention.accept(batteryGap, 4_050L).sequence == batteryGap.sequence
                        && retention.accept(batteryGap, 4_050L).monitorState
                        == batteryGap.monitorState
                        && retention.accept(batteryGap, 4_050L).batteryPercent == 100);
        check("battery read-gap retention remains bounded from the original read",
                retention.accept(batteryGap, 4_101L).batteryPercent < 0);
        check("decision snapshots are never retained",
                retention.accept(new OverlaySnapshot(5, 1_005_000L,
                        OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.Mode.DECISION_RUN,
                        new OverlaySnapshot.Region[0], OverlaySnapshot.Cue.none()),
                        3_000L).mode == OverlaySnapshot.Mode.DECISION_RUN);
        System.out.println("OverlaySnapshotRetentionTest: all checks passed");
    }
}
