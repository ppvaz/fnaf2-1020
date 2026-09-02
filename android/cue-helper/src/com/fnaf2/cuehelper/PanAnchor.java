package com.fnaf2.cuehelper;

import java.util.Arrays;

/**
 * Finds the warm ceiling bulb used as a camera-position anchor.
 *
 * <p>This is deliberately an anchor measurement, not a pan classifier. The
 * bulb's screen position is curved across the office travel, so consumers must
 * feed its centroid through a calibrated camera-position mapping before
 * transforming a scene ROI. A weak or competing warm component is refused.</p>
 */
public final class PanAnchor {
    public static final int UNKNOWN = -1;
    public static final int SEARCH_X = 0;
    public static final int SEARCH_Y = 0;
    public static final int SEARCH_WIDTH = PixelWatch.NATIVE_WIDTH;
    public static final int SEARCH_HEIGHT = 220;
    public static final int SAMPLE_STEP = 4;
    public static final int MIN_COMPONENT_AREA = 64;
    public static final int MIN_COMPONENT_MARGIN = 32;

    private static final int GRID_WIDTH = SEARCH_WIDTH / SAMPLE_STEP;
    private static final int GRID_HEIGHT = SEARCH_HEIGHT / SAMPLE_STEP;
    private static final int GRID_SIZE = GRID_WIDTH * GRID_HEIGHT;
    private static final int WARM_RED_BLUE_MIN = 25;
    private static final int WARM_GREEN_BLUE_MIN = 8;
    private static final int WARM_RED_MIN = 55;

    /** Reusable storage for the allocation-free capture-thread measurement. */
    public static final class Workspace {
        private final byte[] mask = new byte[GRID_SIZE];
        private final int[] queue = new int[GRID_SIZE];
    }

    /** Mutable result reused by the capture service. */
    public static final class Result {
        public boolean observed;
        public int x;
        public int y;
        public int area;
        public int margin;
        /** 0..1000 component-margin confidence, not a probability. */
        public int confidence;
        public String reason;

        public Result() {
            reset("not-measured");
        }

        private void reset(String refusal) {
            observed = false;
            x = UNKNOWN;
            y = UNKNOWN;
            area = UNKNOWN;
            margin = UNKNOWN;
            confidence = 0;
            reason = refusal;
        }
    }

    private PanAnchor() {
    }

    /** Measure one native frame without allocating on the hot path. */
    public static void measure(PixelWatch.Frame frame, Workspace workspace, Result output) {
        if (frame == null || workspace == null || output == null) return;
        if (frame.width() != PixelWatch.NATIVE_WIDTH
                || frame.height() != PixelWatch.NATIVE_HEIGHT) {
            output.reset("sensor-mismatch");
            return;
        }

        Arrays.fill(workspace.mask, (byte) 0);
        for (int gy = 0; gy < GRID_HEIGHT; gy++) {
            int y = SEARCH_Y + gy * SAMPLE_STEP;
            for (int gx = 0; gx < GRID_WIDTH; gx++) {
                int x = SEARCH_X + gx * SAMPLE_STEP;
                int rgb = frame.rgb(x, y);
                if (rgb == PixelWatch.UNKNOWN) {
                    output.reset("frame-incomplete");
                    return;
                }
                int red = (rgb >> 16) & 0xff;
                int green = (rgb >> 8) & 0xff;
                int blue = rgb & 0xff;
                if (red - blue >= WARM_RED_BLUE_MIN
                        && green - blue >= WARM_GREEN_BLUE_MIN
                        && red >= WARM_RED_MIN) {
                    workspace.mask[gy * GRID_WIDTH + gx] = 1;
                }
            }
        }

        int bestArea = 0;
        int bestX = 0;
        int bestY = 0;
        int secondArea = 0;
        for (int start = 0; start < GRID_SIZE; start++) {
            if (workspace.mask[start] == 0) continue;
            int head = 0;
            int tail = 0;
            workspace.queue[tail++] = start;
            workspace.mask[start] = 0;
            int area = 0;
            long xTotal = 0;
            long yTotal = 0;
            while (head < tail) {
                int index = workspace.queue[head++];
                int gx = index % GRID_WIDTH;
                int gy = index / GRID_WIDTH;
                area++;
                xTotal += SEARCH_X + gx * SAMPLE_STEP;
                yTotal += SEARCH_Y + gy * SAMPLE_STEP;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (dx == 0 && dy == 0) continue;
                        int nx = gx + dx;
                        int ny = gy + dy;
                        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;
                        int neighbour = ny * GRID_WIDTH + nx;
                        if (workspace.mask[neighbour] != 0) {
                            workspace.mask[neighbour] = 0;
                            workspace.queue[tail++] = neighbour;
                        }
                    }
                }
            }
            if (area > bestArea) {
                secondArea = bestArea;
                bestArea = area;
                bestX = (int) (xTotal / area);
                bestY = (int) (yTotal / area);
            } else if (area > secondArea) {
                secondArea = area;
            }
        }

        int margin = bestArea - secondArea;
        if (bestArea < MIN_COMPONENT_AREA) {
            output.reset("bulb-not-found");
            return;
        }
        if (margin < MIN_COMPONENT_MARGIN) {
            output.reset("bulb-ambiguous");
            return;
        }
        output.observed = true;
        output.x = bestX;
        output.y = bestY;
        output.area = bestArea;
        output.margin = margin;
        output.confidence = Math.min(1000, margin * 1000 / bestArea);
        output.reason = "component-margin";
    }
}
