package com.fnaf2.cuehelper;

/**
 * Read-only flashlight-battery meter detector over the game's top-left HUD.
 *
 * The stock meter exposes four bright interior bars. This detector reports the
 * visible bar count as a coarse percentage; it never predicts hidden engine
 * state and returns UNKNOWN when the shared UI reads are unavailable or the
 * profile geometry is not the canonical one.
 */
public final class BatteryLifeDetector {
    public static final int BAR_COUNT = PixelWatch.BATTERY_BAR_COUNT;
    public static final int FILLED_LUMA_THRESHOLD = 150;

    public enum State {
        OBSERVED,
        UNKNOWN
    }

    public static final class Result {
        public final State state;
        public final int filledBars;
        public final int percent;
        public final String reason;

        private Result(State state, int filledBars, int percent, String reason) {
            this.state = state;
            this.filledBars = filledBars;
            this.percent = percent;
            this.reason = reason;
        }

        public boolean observed() {
            return state == State.OBSERVED;
        }
    }

    private BatteryLifeDetector() {
    }

    public static Result measure(PixelWatch.Spec spec, int[] values) {
        if (spec == null || values == null || values.length < spec.size()) {
            return unknown("feature-missing");
        }
        int filled = 0;
        for (int number = 1; number <= BAR_COUNT; number++) {
            String name = PixelWatch.batteryBarName(number);
            int index = spec.indexOfName(name);
            if (index < 0 || !PixelWatch.isCanonicalBatteryBar(
                    spec.entry(index), number)) {
                return unknown("sensor-mismatch");
            }
            int value = values[index];
            if (value == PixelWatch.UNKNOWN) return unknown("read-unavailable");
            if (value >= FILLED_LUMA_THRESHOLD) filled++;
        }
        return new Result(State.OBSERVED, filled,
                (filled * 100) / BAR_COUNT, "bars-observed");
    }

    /**
     * Bind the raw meter read to the only screen on which it has game meaning.
     * A bright rectangle at the same coordinates on the menu or helper is not
     * evidence of flashlight battery.
     */
    public static Result measureForScreen(PixelWatch.Spec spec, int[] values,
            int screenIdentity) {
        if (screenIdentity != ScreenIdentity.FNAF2_NIGHT) {
            return unknown("screen-identity");
        }
        return measure(spec, values);
    }

    private static Result unknown(String reason) {
        return new Result(State.UNKNOWN, -1, -1, reason);
    }
}
