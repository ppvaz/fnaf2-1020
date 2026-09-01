package com.fnaf2.cuehelper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Immutable leaf input to the overlay.  It deliberately contains facts and
 * an already-approved cue; it contains no detector, policy, or actuator
 * mutators.
 */
public final class OverlaySnapshot {
    public static final long NO_EXPIRY_NS = 0L;
    public static final int UNKNOWN_VALUE = PixelWatch.UNKNOWN;

    public enum Mode {
        SENSOR_DEBUG,
        DECISION_RUN
    }

    public enum Screen {
        UNKNOWN,
        CUE_HELPER,
        FNAF2_NIGHT,
        FNAF2_MENU;

        public static Screen fromIdentity(int identity) {
            switch (identity) {
                case ScreenIdentity.CUE_HELPER:
                    return CUE_HELPER;
                case ScreenIdentity.FNAF2_NIGHT:
                    return FNAF2_NIGHT;
                case ScreenIdentity.FNAF2_MENU:
                    return FNAF2_MENU;
                default:
                    return UNKNOWN;
            }
        }
    }

    /** Monitor visibility is a live visual fact, not a control command. */
    public enum MonitorState {
        UNKNOWN,
        UP,
        DOWN
    }

    public enum FactState {
        MONITORED,
        DETECTED,
        UNKNOWN,
        STALE,
        UNQUALIFIED,
        CONFLICTING
    }

    public enum ScoreType {
        NONE,
        MARGIN,
        PROBABILITY,
        HEURISTIC
    }

    public enum CueAction {
        NONE,
        MASK,
        WIND,
        CHECK_VENT,
        FLASH,
        SAFE
    }

    public enum Severity {
        INFO,
        ATTENTION,
        CRITICAL
    }

    public static final class Region {
        public final String roiId;
        public final FactState factState;
        public final int value;
        public final double score;
        public final ScoreType scoreType;
        public final long ageMs;
        public final long latencyMs;
        public final boolean qualified;

        public Region(String roiId, FactState factState, int value, double score,
                ScoreType scoreType, long ageMs, long latencyMs,
                boolean qualified) {
            if (roiId == null || !roiId.matches("[A-Za-z0-9_-]{1,63}")
                    || factState == null || scoreType == null || ageMs < 0L
                    || latencyMs < 0L || Double.isInfinite(score)
                    || (scoreType != ScoreType.NONE && Double.isNaN(score))) {
                throw new IllegalArgumentException("invalid overlay region");
            }
            if (scoreType == ScoreType.PROBABILITY
                    && (score < 0d || score > 1d)) {
                throw new IllegalArgumentException("probability is outside [0,1]");
            }
            if (scoreType == ScoreType.NONE && !Double.isNaN(score)) {
                throw new IllegalArgumentException("untyped score must be NaN");
            }
            if (value != UNKNOWN_VALUE && value < -1_000_000) {
                throw new IllegalArgumentException("region value is invalid");
            }
            if (!qualified && factState == FactState.DETECTED) {
                throw new IllegalArgumentException("unqualified region cannot be detected");
            }
            this.roiId = roiId;
            this.factState = factState;
            this.value = value;
            this.score = score;
            this.scoreType = scoreType;
            this.ageMs = ageMs;
            this.latencyMs = latencyMs;
            this.qualified = qualified;
        }

        public boolean canSupportCue() {
            return qualified && factState == FactState.DETECTED
                    && value != UNKNOWN_VALUE;
        }

        public static Region unknown(String roiId, long ageMs, long latencyMs) {
            return new Region(roiId, FactState.UNKNOWN, UNKNOWN_VALUE,
                    Double.NaN, ScoreType.NONE, Math.max(0L, ageMs),
                    Math.max(0L, latencyMs), false);
        }
    }

    public static final class Cue {
        public final CueAction action;
        public final Severity severity;
        public final long expiresAtNs;
        public final String anchorRoiId;
        private final String[] rationaleFactIds;
        public final boolean qualified;
        public final boolean positiveSafe;
        public final int priority;
        public final long cooldownUntilNs;

        public Cue(CueAction action, Severity severity, long expiresAtNs,
                String anchorRoiId, String[] rationaleFactIds, boolean qualified,
                boolean positiveSafe) {
            this(action, severity, expiresAtNs, anchorRoiId, rationaleFactIds,
                    qualified, positiveSafe, defaultPriority(severity), 0L);
        }

        public Cue(CueAction action, Severity severity, long expiresAtNs,
                String anchorRoiId, String[] rationaleFactIds, boolean qualified,
                boolean positiveSafe, int priority, long cooldownUntilNs) {
            if (action == null || severity == null || expiresAtNs < 0L
                    || (anchorRoiId != null
                    && !anchorRoiId.matches("[A-Za-z0-9_-]{1,63}"))
                    || rationaleFactIds == null || priority < 0 || priority > 100
                    || cooldownUntilNs < 0L) {
                throw new IllegalArgumentException("invalid overlay cue");
            }
            if (action == CueAction.NONE) {
                if (expiresAtNs != NO_EXPIRY_NS || qualified || positiveSafe
                        || rationaleFactIds.length != 0 || anchorRoiId != null
                        || priority != 0 || cooldownUntilNs != 0L) {
                    throw new IllegalArgumentException("NONE cue carries state");
                }
            } else if (expiresAtNs == NO_EXPIRY_NS || rationaleFactIds.length == 0) {
                throw new IllegalArgumentException("action cue needs expiry and rationale");
            }
            for (String factId : rationaleFactIds) {
                if (factId == null || !factId.matches("[A-Za-z0-9_-]{1,63}")) {
                    throw new IllegalArgumentException("invalid cue rationale id");
                }
            }
            if (action == CueAction.SAFE && !positiveSafe) {
                throw new IllegalArgumentException("SAFE needs positive qualification");
            }
            this.action = action;
            this.severity = severity;
            this.expiresAtNs = expiresAtNs;
            this.anchorRoiId = anchorRoiId;
            this.rationaleFactIds = rationaleFactIds.clone();
            this.qualified = qualified;
            this.positiveSafe = positiveSafe;
            this.priority = priority;
            this.cooldownUntilNs = cooldownUntilNs;
        }

        public static Cue none() {
            return new Cue(CueAction.NONE, Severity.INFO, NO_EXPIRY_NS,
                    null, new String[0], false, false, 0, 0L);
        }

        public boolean expired(long nowNs) {
            return action != CueAction.NONE && nowNs >= expiresAtNs;
        }

        public boolean coolingDown(long nowNs) {
            return action != CueAction.NONE && cooldownUntilNs > nowNs;
        }

        public String[] rationaleFactIds() {
            return rationaleFactIds.clone();
        }

        private static int defaultPriority(Severity severity) {
            if (severity == Severity.CRITICAL) return 100;
            if (severity == Severity.ATTENTION) return 60;
            return 20;
        }
    }

    public final long sequence;
    public final long tRenderedNs;
    public final Screen screen;
    public final Mode mode;
    private final Region[] regionValues;
    public final Cue cue;
    public final MonitorState monitorState;
    public final String monitorReason;
    /** Semantic camera control, for example {@code cam:5}; null when unknown. */
    public final String selectedCamera;
    public final String cameraReason;
    /** Coarse visible flashlight-meter percentage, or -1 when unavailable. */
    public final int batteryPercent;
    public final String batteryReason;

    /** Construct and apply the fail-closed cue validation rules. */
    public OverlaySnapshot(long sequence, long tRenderedNs, Screen screen,
            Mode mode, Region[] regions, Cue cue) {
        this(sequence, tRenderedNs, screen, mode, regions, cue,
                MonitorState.UNKNOWN, "monitor-state-unavailable", null,
                "monitor-not-up");
    }

    /** Construct a snapshot with the visual monitor/camera facts. */
    public OverlaySnapshot(long sequence, long tRenderedNs, Screen screen,
            Mode mode, Region[] regions, Cue cue, MonitorState monitorState,
            String monitorReason, String selectedCamera, String cameraReason) {
        this(sequence, tRenderedNs, screen, mode, regions, cue, monitorState,
                monitorReason, selectedCamera, cameraReason, -1,
                "battery-unavailable");
    }

    /** Construct a snapshot with monitor, camera, and flashlight-meter facts. */
    public OverlaySnapshot(long sequence, long tRenderedNs, Screen screen,
            Mode mode, Region[] regions, Cue cue, MonitorState monitorState,
            String monitorReason, String selectedCamera, String cameraReason,
            int batteryPercent, String batteryReason) {
        if (sequence < 0L || tRenderedNs <= 0L || screen == null || mode == null
                || regions == null || cue == null || monitorState == null
                || !validReason(monitorReason) || !validReason(cameraReason)
                || (selectedCamera != null
                && !selectedCamera.matches("cam:[0-9]{1,2}"))
                || batteryPercent < -1 || batteryPercent > 100
                || (batteryPercent >= 0 && batteryPercent % 25 != 0)
                || !validReason(batteryReason)) {
            throw new IllegalArgumentException("invalid overlay snapshot");
        }
        if (monitorState != MonitorState.UP && selectedCamera != null) {
            throw new IllegalArgumentException("camera selection needs monitor up");
        }
        if (screen != Screen.FNAF2_NIGHT && monitorState != MonitorState.UNKNOWN) {
            throw new IllegalArgumentException("monitor state needs night identity");
        }
        this.sequence = sequence;
        this.tRenderedNs = tRenderedNs;
        this.screen = screen;
        this.mode = mode;
        this.regionValues = regions.clone();
        this.monitorState = monitorState;
        this.monitorReason = monitorReason;
        this.selectedCamera = selectedCamera;
        this.cameraReason = cameraReason;
        this.batteryPercent = batteryPercent;
        this.batteryReason = batteryReason;
        Set<String> ids = new HashSet<>();
        for (Region region : this.regionValues) {
            if (region == null || !ids.add(region.roiId)) {
                throw new IllegalArgumentException("duplicate or null overlay region");
            }
        }
        this.cue = validateCue(mode, screen, this.regionValues, cue, tRenderedNs);
    }

    public static OverlaySnapshot empty(long sequence, long nowNs, Mode mode) {
        return new OverlaySnapshot(sequence, nowNs, Screen.UNKNOWN, mode,
                new Region[0], Cue.none());
    }

    /** Return a snapshot suitable for drawing at {@code nowNs}. */
    public OverlaySnapshot forRender(long nowNs) {
        if (nowNs <= 0L || cue.action == CueAction.NONE || !cue.qualified
                || cue.expired(nowNs)) {
            return cue.action == CueAction.NONE ? this
                    : new OverlaySnapshot(sequence, tRenderedNs, screen, mode,
                            regionValues, Cue.none(), monitorState, monitorReason,
                            selectedCamera, cameraReason, batteryPercent,
                            batteryReason);
        }
        return this;
    }

    /** Return an immutable copy with only the shared battery fact replaced. */
    public OverlaySnapshot withBattery(int nextBatteryPercent,
            String nextBatteryReason) {
        return new OverlaySnapshot(sequence, tRenderedNs, screen, mode,
                regionValues, cue, monitorState, monitorReason, selectedCamera,
                cameraReason, nextBatteryPercent, nextBatteryReason);
    }

    private static boolean validReason(String reason) {
        return reason != null && reason.matches("[A-Za-z0-9_-]{1,63}");
    }

    public Region region(String roiId) {
        for (Region region : regionValues) {
            if (region.roiId.equals(roiId)) return region;
        }
        return null;
    }

    public int regionCount() {
        return regionValues.length;
    }

    public Region[] regions() {
        return regionValues.clone();
    }

    private static Cue validateCue(Mode mode, Screen screen, Region[] regions,
            Cue candidate, long nowNs) {
        if (mode != Mode.DECISION_RUN || screen != Screen.FNAF2_NIGHT
                || candidate.action == CueAction.NONE || !candidate.qualified
                || candidate.expiresAtNs == NO_EXPIRY_NS
                || candidate.expired(nowNs)
                || candidate.rationaleFactIds.length == 0
                || candidate.coolingDown(nowNs)) {
            return Cue.none();
        }
        Set<String> rationale = new HashSet<>(
                Arrays.asList(candidate.rationaleFactIds));
        if (rationale.size() != candidate.rationaleFactIds.length) {
            return Cue.none();
        }
        for (String id : candidate.rationaleFactIds) {
            Region region = null;
            for (Region item : regions) {
                if (item.roiId.equals(id)) {
                    region = item;
                    break;
                }
            }
            if (region == null || !region.canSupportCue()) return Cue.none();
        }
        if (candidate.action == CueAction.SAFE && !candidate.positiveSafe) {
            return Cue.none();
        }
        return candidate;
    }
}
