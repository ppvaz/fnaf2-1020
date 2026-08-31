package com.fnaf2.cuehelper;

import java.util.Locale;

/**
 * Numeric phase estimator for cue ID 33 (the sourced winding tick).
 *
 * <p>The clock is deliberately independent of cue names. It fits the observed
 * tick onsets against the expected 500 ms index, reports its residual, and is
 * only fed by AudioAnalyzer while the visual context gate says that the game is
 * in a night. It is an observation aid, not a controller.</p>
 */
public final class PhaseClock {
    public static final int CUE_ID = 33;
    private static final long TARGET_PERIOD_NS = 500_000_000L;
    private static final long REFRACTORY_NS = 250_000_000L;
    private static final long PERIOD_TOLERANCE_NS = 100_000_000L;
    private static final long LOCK_RMS_NS = 100_000_000L;
    private static final int HISTORY_LENGTH = 12;

    public static final class Snapshot {
        public final String state;
        public final int ticks;
        public final long tickIndex;
        public final long periodMs;
        public final long phaseModuloMs;
        public final long uncertaintyMs;
        public final double score;

        Snapshot(String state, int ticks, long tickIndex, long periodMs,
                long phaseModuloMs, long uncertaintyMs, double score) {
            this.state = state;
            this.ticks = ticks;
            this.tickIndex = tickIndex;
            this.periodMs = periodMs;
            this.phaseModuloMs = phaseModuloMs;
            this.uncertaintyMs = uncertaintyMs;
            this.score = score;
        }
    }

    private final long[] times = new long[HISTORY_LENGTH];
    private final long[] indices = new long[HISTORY_LENGTH];
    private int count;
    private long nextIndex;
    private long lastTickNs = -1L;
    private Snapshot latest = new Snapshot("UNLOCKED", 0, 0L, 0L, 0L, 0L, 0.0);

    public synchronized void reset() {
        count = 0;
        nextIndex = 0L;
        lastTickNs = -1L;
        latest = new Snapshot("UNLOCKED", 0, 0L, 0L, 0L, 0L, 0.0);
    }

    public synchronized Snapshot observe(long onsetNs, double score) {
        if (onsetNs <= 0L || !Double.isFinite(score)) {
            return latest;
        }
        if (lastTickNs >= 0L) {
            long gap = onsetNs - lastTickNs;
            if (gap < REFRACTORY_NS) {
                return latest;
            }
            long skipped = Math.max(1L,
                    (gap + TARGET_PERIOD_NS / 2L) / TARGET_PERIOD_NS);
            nextIndex += skipped;
        }
        lastTickNs = onsetNs;
        if (count == HISTORY_LENGTH) {
            System.arraycopy(times, 1, times, 0, HISTORY_LENGTH - 1);
            System.arraycopy(indices, 1, indices, 0, HISTORY_LENGTH - 1);
            count--;
        }
        times[count] = onsetNs;
        indices[count] = nextIndex;
        count++;

        double periodNs = 0.0;
        double interceptNs = onsetNs;
        double rmsNs = 0.0;
        if (count >= 2) {
            double meanX = 0.0;
            double meanY = 0.0;
            for (int index = 0; index < count; index++) {
                meanX += indices[index];
                meanY += times[index];
            }
            meanX /= count;
            meanY /= count;
            double xx = 0.0;
            double xy = 0.0;
            for (int index = 0; index < count; index++) {
                double x = indices[index] - meanX;
                double y = times[index] - meanY;
                xx += x * x;
                xy += x * y;
            }
            if (xx > 0.0) {
                periodNs = xy / xx;
                interceptNs = meanY - periodNs * meanX;
                double squaredError = 0.0;
                for (int index = 0; index < count; index++) {
                    double expected = interceptNs + periodNs * indices[index];
                    double residual = times[index] - expected;
                    squaredError += residual * residual;
                }
                rmsNs = Math.sqrt(squaredError / count);
            }
        }

        long periodMs = periodNs > 0.0 ? Math.round(periodNs / 1_000_000.0) : 0L;
        long phaseModuloMs = 0L;
        if (periodNs > 0.0) {
            double modulo = interceptNs % periodNs;
            if (modulo < 0.0) modulo += periodNs;
            phaseModuloMs = Math.round(modulo / 1_000_000.0);
        }
        long uncertaintyMs = Math.round(rmsNs / 1_000_000.0);
        String state = count >= HISTORY_LENGTH / 2
                && Math.abs(periodNs - TARGET_PERIOD_NS) <= PERIOD_TOLERANCE_NS
                && rmsNs <= LOCK_RMS_NS ? "LOCKED" : "ACQUIRING";
        latest = new Snapshot(state, count, nextIndex, periodMs, phaseModuloMs,
                uncertaintyMs, score);
        return latest;
    }

    public synchronized Snapshot snapshot() {
        return latest;
    }

    public synchronized String status(boolean contextAllowed) {
        Snapshot value = latest;
        return String.format(Locale.US,
                "phaseClock=%s context=%s cueId=%d ticks=%d tickIndex=%d "
                        + "periodMs=%d phaseModuloMs=%d uncertaintyMs=%d score=%.4f",
                value.state, contextAllowed ? "night" : "unknown", CUE_ID,
                value.ticks, value.tickIndex, value.periodMs,
                value.phaseModuloMs, value.uncertaintyMs, value.score);
    }
}
