package com.fnaf2.cuehelper;

import java.util.Arrays;
import java.util.Locale;

/** Bounded observe-only HUD timing counters for the device qualification run. */
public final class OverlayMetrics {
    private static final int MAX_LATENCY_SAMPLES = 512;
    private final long[] updateToDrawNs = new long[MAX_LATENCY_SAMPLES];
    private final long[] drawIntervalNs = new long[MAX_LATENCY_SAMPLES];
    private long latestSequence = -1L;
    private long firstSequence = -1L;
    private long lastRenderedSequence = -1L;
    private long latestUpdateNs;
    private long updates;
    private long draws;
    private long droppedUpdates;
    private long lastDrawNs;
    private long drawIntervals;
    private int latencyCount;
    private int drawIntervalCount;

    /** Starts a fresh capture-session measurement window. */
    public synchronized void reset() {
        Arrays.fill(updateToDrawNs, 0L);
        Arrays.fill(drawIntervalNs, 0L);
        latestSequence = -1L;
        firstSequence = -1L;
        lastRenderedSequence = -1L;
        latestUpdateNs = 0L;
        updates = 0L;
        draws = 0L;
        droppedUpdates = 0L;
        lastDrawNs = 0L;
        drawIntervals = 0L;
        latencyCount = 0;
        drawIntervalCount = 0;
    }

    public synchronized void onSnapshot(long sequence, long nowNs) {
        if (nowNs <= 0L || sequence < 0L) return;
        if (latestSequence >= 0L && sequence <= latestSequence) return;
        if (firstSequence < 0L) firstSequence = sequence;
        latestSequence = sequence;
        latestUpdateNs = nowNs;
        updates++;
    }

    public synchronized void onRendered(long sequence, long nowNs) {
        if (nowNs <= 0L) return;
        if (sequence >= 0L && sequence > lastRenderedSequence) {
            if (lastRenderedSequence < 0L) {
                if (firstSequence >= 0L && sequence > firstSequence) {
                    droppedUpdates += sequence - firstSequence;
                }
            } else if (sequence > lastRenderedSequence + 1L) {
                droppedUpdates += sequence - lastRenderedSequence - 1L;
            }
            lastRenderedSequence = sequence;
        }
        if (lastDrawNs > 0L && nowNs > lastDrawNs) {
            drawIntervals++;
            long intervalNs = nowNs - lastDrawNs;
            if (drawIntervalCount < drawIntervalNs.length) {
                drawIntervalNs[drawIntervalCount++] = intervalNs;
            } else {
                System.arraycopy(drawIntervalNs, 1, drawIntervalNs, 0,
                        drawIntervalNs.length - 1);
                drawIntervalNs[drawIntervalNs.length - 1] = intervalNs;
            }
        }
        lastDrawNs = nowNs;
        draws++;
        if (sequence == latestSequence && latestUpdateNs > 0L
                && nowNs >= latestUpdateNs) {
            if (latencyCount < updateToDrawNs.length) {
                updateToDrawNs[latencyCount++] = nowNs - latestUpdateNs;
            } else {
                System.arraycopy(updateToDrawNs, 1, updateToDrawNs, 0,
                        updateToDrawNs.length - 1);
                updateToDrawNs[updateToDrawNs.length - 1] = nowNs - latestUpdateNs;
            }
        }
    }

    public synchronized Snapshot snapshot() {
        long[] sorted = Arrays.copyOf(updateToDrawNs, latencyCount);
        long[] sortedIntervals = Arrays.copyOf(drawIntervalNs, drawIntervalCount);
        Arrays.sort(sorted);
        Arrays.sort(sortedIntervals);
        return new Snapshot(updates, draws, droppedUpdates, drawIntervals,
                percentile(sorted, .50), percentile(sorted, .95),
                percentile(sorted, .99), percentile(sortedIntervals, .50),
                percentile(sortedIntervals, .95), percentile(sortedIntervals, .99));
    }

    public synchronized String status() {
        return snapshot().format();
    }

    public static final class Snapshot {
        public final long updates;
        public final long draws;
        public final long droppedUpdates;
        public final long drawIntervals;
        public final long p50UpdateToDrawNs;
        public final long p95UpdateToDrawNs;
        public final long p99UpdateToDrawNs;
        public final long p50DrawIntervalNs;
        public final long p95DrawIntervalNs;
        public final long p99DrawIntervalNs;

        Snapshot(long updates, long draws, long droppedUpdates, long drawIntervals,
                long p50UpdateToDrawNs, long p95UpdateToDrawNs,
                long p99UpdateToDrawNs, long p50DrawIntervalNs,
                long p95DrawIntervalNs, long p99DrawIntervalNs) {
            this.updates = updates;
            this.draws = draws;
            this.droppedUpdates = droppedUpdates;
            this.drawIntervals = drawIntervals;
            this.p50UpdateToDrawNs = p50UpdateToDrawNs;
            this.p95UpdateToDrawNs = p95UpdateToDrawNs;
            this.p99UpdateToDrawNs = p99UpdateToDrawNs;
            this.p50DrawIntervalNs = p50DrawIntervalNs;
            this.p95DrawIntervalNs = p95DrawIntervalNs;
            this.p99DrawIntervalNs = p99DrawIntervalNs;
        }

        public String format() {
            return String.format(Locale.US,
                    "updates=%d draws=%d dropped=%d cadenceSamples=%d "
                            + "updateToDrawMs=p50:%.2f,p95:%.2f,p99:%.2f "
                            + "drawIntervalMs=p50:%.2f,p95:%.2f,p99:%.2f",
                    updates, draws, droppedUpdates, drawIntervals,
                    p50UpdateToDrawNs / 1_000_000d,
                    p95UpdateToDrawNs / 1_000_000d,
                    p99UpdateToDrawNs / 1_000_000d,
                    p50DrawIntervalNs / 1_000_000d,
                    p95DrawIntervalNs / 1_000_000d,
                    p99DrawIntervalNs / 1_000_000d);
        }
    }

    private static long percentile(long[] values, double fraction) {
        if (values.length == 0) return 0L;
        int index = Math.min(values.length - 1,
                Math.max(0, (int) Math.ceil(values.length * fraction) - 1));
        return values[index];
    }
}
