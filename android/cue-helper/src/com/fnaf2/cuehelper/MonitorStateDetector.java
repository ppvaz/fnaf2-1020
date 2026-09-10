package com.fnaf2.cuehelper;

/**
 * The Android-side implementation of the calibrated monitor-rule-v1 artifact.
 * It consumes the same 20x9 cell-center grid used by the capture service and
 * refuses mixed, dark, foreign, or incomplete frames instead of voting.
 */
public final class MonitorStateDetector {
    public static final String SCHEMA = "monitor-rule-v1";
    public static final String PROFILE_ID = "moto-g56-v207-landscape";

    public enum State {
        UNKNOWN,
        UP,
        DOWN
    }

    public static final class Result {
        public final State state;
        public final String reason;

        private Result(State state, String reason) {
            this.state = state;
            this.reason = reason;
        }

        public boolean observed() {
            return state == State.UP || state == State.DOWN;
        }
    }

    private static final int GRID_SIZE = PixelWatch.GRID_WIDTH * PixelWatch.GRID_HEIGHT;

    // monitor-rule-moto-g56-v207.json, in anchor order.
    private static final Anchor[] ANCHORS = new Anchor[] {
            new Anchor(112, 108.5f, 44.5f, true),
            new Anchor(131, 37.0f, 16.0f, true),
            new Anchor(132, 96.5f, 72.5f, true),
            new Anchor(151, 35.5f, 17.5f, true),
            new Anchor(165, 141.5f, 40.5f, false),
            new Anchor(167, 108.5f, 78.5f, false)
    };

    private MonitorStateDetector() {
    }

    public static Result measure(int[] grid, int screenIdentity) {
        if (screenIdentity != ScreenIdentity.FNAF2_NIGHT) {
            return unknown("screen-identity");
        }
        if (grid == null || grid.length != GRID_SIZE) {
            return unknown("grid-unavailable");
        }
        int meanLuma = ScreenStats.meanLuma(grid, grid.length);
        if (meanLuma < 0) return unknown("feature-missing");
        if (meanLuma < 5) return unknown("frame-dark");

        boolean sawUp = false;
        boolean sawDown = false;
        for (Anchor anchor : ANCHORS) {
            int value = luma(grid[anchor.cell]);
            if (value < 0) return unknown("feature-missing");
            float upBoundary = anchor.threshold + anchor.refuseBand;
            float downBoundary = anchor.threshold - anchor.refuseBand;
            boolean up = anchor.present ? value >= upBoundary : value <= downBoundary;
            boolean down = anchor.present ? value <= downBoundary : value >= upBoundary;
            if (!up && !down) return unknown("ambiguous-threshold");
            sawUp |= up;
            sawDown |= down;
            if (sawUp && sawDown) return unknown("ambiguous-threshold");
        }
        if (sawUp) return observed(State.UP, "anchors-up");
        if (sawDown) return observed(State.DOWN, "anchors-down");
        return unknown("ambiguous-threshold");
    }

    /**
     * Adapt the already-measured native bottom-control strokes to the monitor
     * fact used by the overlay and camera selector. This performs no pixel
     * reads and intentionally has no fitted-grid fallback: the live path has
     * one state source.
     */
    public static Result fromNativeControlStrokes(int screenIdentity,
            int maskDownstroke, int monitorDownstroke) {
        if (screenIdentity != ScreenIdentity.FNAF2_NIGHT) {
            return unknown("screen-identity");
        }
        switch (PixelWatch.controlState(maskDownstroke, monitorDownstroke)) {
            case MONITOR_UP:
                return observed(State.UP, "native-stroke-monitor-up");
            case MASK_ON:
                return observed(State.DOWN, "native-stroke-mask-on");
            case OFFICE_UNMASKED:
                return observed(State.DOWN, "native-stroke-office");
            case UNKNOWN:
            default:
                return unknown("native-stroke-ambiguous");
        }
    }

    private static Result observed(State state, String reason) {
        return new Result(state, reason);
    }

    private static Result unknown(String reason) {
        return new Result(State.UNKNOWN, reason);
    }

    private static int luma(int rgb) {
        int red = (rgb >> 16) & 0xff;
        int green = (rgb >> 8) & 0xff;
        int blue = rgb & 0xff;
        return (77 * red + 150 * green + 29 * blue) >> 8;
    }

    private static final class Anchor {
        final int cell;
        final float threshold;
        final float refuseBand;
        final boolean present;

        Anchor(int cell, float threshold, float refuseBand, boolean present) {
            this.cell = cell;
            this.threshold = threshold;
            this.refuseBand = refuseBand;
            this.present = present;
        }
    }
}
