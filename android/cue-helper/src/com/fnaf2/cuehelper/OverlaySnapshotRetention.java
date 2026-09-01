package com.fnaf2.cuehelper;

/**
 * Holds the last usable night snapshot through short detector gaps.
 *
 * A transient UNKNOWN frame is common while a projection buffer is being
 * replaced. Clearing the whole view for that one frame makes every ROI blink.
 * Retention is deliberately bounded and only applies to sensor/debug output:
 * confirmed menu/helper identity clears it immediately, and decision cues are
 * never retained by this class.
 */
public final class OverlaySnapshotRetention {
    public static final long DEFAULT_HOLD_NS = 350_000_000L;

    private final long holdNs;
    private OverlaySnapshot lastKnownNight;
    private long lastKnownAtNs;

    public OverlaySnapshotRetention() {
        this(DEFAULT_HOLD_NS);
    }

    public OverlaySnapshotRetention(long holdNs) {
        if (holdNs <= 0L) throw new IllegalArgumentException("hold must be positive");
        this.holdNs = holdNs;
    }

    /** Return the snapshot to draw for this update, retaining only safe debug state. */
    public synchronized OverlaySnapshot accept(OverlaySnapshot next, long nowNs) {
        if (next == null || nowNs <= 0L) return next;
        if (next.mode != OverlaySnapshot.Mode.SENSOR_DEBUG) {
            clear();
            return next;
        }
        if (next.screen == OverlaySnapshot.Screen.FNAF2_MENU
                || next.screen == OverlaySnapshot.Screen.CUE_HELPER) {
            clear();
            return next;
        }
        boolean batteryReadGap = next.batteryPercent < 0
                && lastKnownNight != null && lastKnownNight.batteryPercent >= 0;
        if (next.screen == OverlaySnapshot.Screen.FNAF2_NIGHT
                && next.monitorState != OverlaySnapshot.MonitorState.UNKNOWN) {
            if (batteryReadGap && withinHold(nowNs)) {
                // Keep the current monitor/ROI/camera facts, but carry the
                // last battery value only until the original hold expires.
                // A repeated read failure must not extend that deadline.
                OverlaySnapshot merged = next.withBattery(
                        lastKnownNight.batteryPercent,
                        lastKnownNight.batteryReason);
                lastKnownNight = merged;
                return merged;
            }
            lastKnownNight = next;
            lastKnownAtNs = nowNs;
            return next;
        }
        if (lastKnownNight != null && withinHold(nowNs)) {
            return lastKnownNight;
        }
        clear();
        return next;
    }

    /** Clear the retained state when the owner tears down or changes mode. */
    public synchronized void clear() {
        lastKnownNight = null;
        lastKnownAtNs = 0L;
    }

    /** Return the retained snapshot while it is still valid, otherwise null. */
    public synchronized OverlaySnapshot expire(long nowNs) {
        if (lastKnownNight != null && withinHold(nowNs)) return lastKnownNight;
        clear();
        return null;
    }

    /** Absolute time at which the current retained snapshot must be cleared. */
    public synchronized long expiresAtNs() {
        return lastKnownNight == null ? 0L : lastKnownAtNs + holdNs;
    }

    private boolean withinHold(long nowNs) {
        return nowNs >= lastKnownAtNs && nowNs - lastKnownAtNs <= holdNs;
    }
}
