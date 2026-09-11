package com.fnaf2.cuehelper;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/**
 * A small, immutable native-resolution visual watchlist.
 *
 * <p>The helper owns a full-resolution projection so a watch can read native
 * coordinates without shipping a frame to the host.  This class deliberately
 * has no Android dependency: its reducers and canonical spec are tested on the
 * host, while {@link ByteBufferFrame} is the only bridge needed by the
 * capture service.</p>
 */
public final class PixelWatch {
    public static final int UNKNOWN = Integer.MIN_VALUE;
    public static final int NATIVE_WIDTH = 2400;
    public static final int NATIVE_HEIGHT = 1080;
    public static final int GRID_WIDTH = 20;
    public static final int GRID_HEIGHT = 9;
    public static final int MAX_ENTRIES = 32;
    /** Four visible interior bars in the stock top-left flashlight meter. */
    public static final int BATTERY_BAR_COUNT = 4;
    /** Calibrated display footprint of one fixed monitor-map camera button. */
    public static final int CAMERA_BUTTON_OVERLAY_WIDTH = 120;
    public static final int CAMERA_BUTTON_OVERLAY_HEIGHT = 40;
    /** Provisional Foxy core envelope, measured from native labelled frames. */
    public static final int FOXY_HALL_X = 1650;
    public static final int FOXY_HALL_Y = 300;
    public static final int FOXY_HALL_WIDTH = 450;
    public static final int FOXY_HALL_HEIGHT = 400;
    public static final int FOXY_HALL_STEP = 8;
    /** Redness floor used by the provisional Foxy red-cell channel. */
    public static final int FOXY_HALL_REDNESS_FLOOR = 15;
    private static final int[] CAMERA_BUTTON_X = new int[] {
            1412, 1720, 1411, 1728, 1424, 1696,
            1776, 1412, 2144, 1984, 2228, 2188
    };
    private static final int[] CAMERA_BUTTON_Y = new int[] {
            784, 784, 690, 690, 916, 916,
            606, 590, 548, 716, 652, 784
    };
    // Native coordinates measured from the exact 2400x1080 FNaF 2 HUD. Each
    // ROI stays inside one bright meter compartment and avoids its border or
    // separator so static/noise cannot turn a frame edge into a bar.
    private static final int[] BATTERY_BAR_X = new int[] {132, 172, 212, 252};
    private static final int BATTERY_BAR_Y = 70;
    private static final int BATTERY_BAR_WIDTH = 28;
    private static final int BATTERY_BAR_HEIGHT = 32;
    /** Native bounds of the persistent lower-left mask control. */
    public static final int MASK_BUTTON_X = 260;
    public static final int MASK_BUTTON_Y = 1004;
    public static final int MASK_BUTTON_WIDTH = 720;
    public static final int MASK_BUTTON_HEIGHT = 36;
    /** Native bounds of the lower-right open-monitor control. */
    public static final int MONITOR_BUTTON_X = 1420;
    public static final int MONITOR_BUTTON_Y = 1004;
    public static final int MONITOR_BUTTON_WIDTH = 720;
    public static final int MONITOR_BUTTON_HEIGHT = 36;
    /** Both lower controls share the same native top edge. */
    public static final int CONTROL_BUTTON_Y = MASK_BUTTON_Y;
    /** Sparse native sampling keeps the control watches cheaper than a frame. */
    public static final int CONTROL_BUTTON_STEP = 16;
    /** Fixed native chevron geometry inside the lower-left mask control. */
    public static final int MASK_STROKE_X_START = 90;
    public static final int MASK_STROKE_X_CENTER = 370;
    public static final int MASK_STROKE_X_END = 650;
    /** Fixed native chevron geometry inside the lower-right monitor control. */
    public static final int MONITOR_STROKE_X_START = 80;
    public static final int MONITOR_STROKE_X_CENTER = 360;
    public static final int MONITOR_STROKE_X_END = 650;
    /** Both controls carry two parallel downward strokes. */
    public static final int CONTROL_STROKE_Y_BASE = 2;
    public static final int CONTROL_STROKE_Y_PEAK = 16;
    public static final int CONTROL_STROKE_LINE_OFFSET = 16;
    public static final int CONTROL_STROKE_SAMPLE_STEP = 8;
    /** Trace-only sparse stroke sampling; the returned score is normalized. */
    public static final int CONTROL_STROKE_TRACE_SAMPLE_STEP = 32;
    public static final int CONTROL_STROKE_RADIUS = 3;
    /** Minimum local max-channel contrast for one stroke column. */
    public static final int CONTROL_STROKE_CONTRAST = 35;
    /** Settled-state bands measured by the native-stroke gate. */
    public static final int CONTROL_STROKE_VISIBLE_MIN = 100;
    public static final int CONTROL_STROKE_ABSENT_MAX = 40;

    public enum Kind { PIXEL, ROI }
    public enum Reducer {
        LUMA, YELLOWNESS, MEAN_LUMA, MEAN_REDNESS, GREY_CELLS, RED_CELLS
    }

    /** Settled UI surface states inferred from the paired bottom controls. */
    public enum ControlState {
        UNKNOWN,
        MONITOR_UP,
        MASK_ON,
        OFFICE_UNMASKED
    }

    /** One bounded pixel or ROI query. Coordinates are native display pixels. */
    public static final class Entry {
        public final String name;
        public final Kind kind;
        public final int x;
        public final int y;
        public final int width;
        public final int height;
        public final Reducer reducer;
        public final int step;
        public final int greySpread;

        public Entry(String name, Kind kind, int x, int y, int width, int height,
                Reducer reducer, int step, int greySpread) {
            if (name == null || name.length() == 0 || name.length() > 31
                    || !name.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalArgumentException("invalid watch entry name");
            }
            if (kind == null || reducer == null || width < 1 || height < 1
                    || x < 0 || y < 0 || step < 1 || greySpread < 0
                    || greySpread > 255) {
                throw new IllegalArgumentException("invalid watch entry bounds");
            }
            if (kind == Kind.PIXEL && (width != 1 || height != 1)) {
                throw new IllegalArgumentException("pixel watch must be 1x1");
            }
            if (kind == Kind.ROI && (reducer == Reducer.LUMA
                    || reducer == Reducer.YELLOWNESS)) {
                throw new IllegalArgumentException("ROI needs an aggregate reducer");
            }
            if (kind == Kind.PIXEL && (reducer == Reducer.MEAN_LUMA
                    || reducer == Reducer.MEAN_REDNESS
                    || reducer == Reducer.GREY_CELLS
                    || reducer == Reducer.RED_CELLS)) {
                throw new IllegalArgumentException("pixel needs a pixel reducer");
            }
            this.name = name;
            this.kind = kind;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.reducer = reducer;
            this.step = step;
            this.greySpread = greySpread;
        }

        String canonical() {
            return String.format(Locale.US, "%s|%s|%d|%d|%d|%d|%s|%d|%d",
                    name, kind.name(), x, y, width, height, reducer.name(),
                    step, greySpread);
        }
    }

    /** A versioned collection of entries, addressed by its SHA-256 hash. */
    public static final class Spec {
        private final Entry[] entries;
        private final String canonical;
        private final String sha256;

        public Spec(Entry[] entries) {
            if (entries == null || entries.length == 0 || entries.length > MAX_ENTRIES) {
                throw new IllegalArgumentException("watchlist entry count out of range");
            }
            this.entries = entries.clone();
            StringBuilder text = new StringBuilder("pixel-watch-v1\n");
            for (Entry entry : this.entries) {
                if (entry == null) throw new IllegalArgumentException("null watch entry");
                text.append(entry.canonical()).append('\n');
            }
            this.canonical = text.toString();
            this.sha256 = PixelWatch.sha256(canonical);
        }

        public int size() {
            return entries.length;
        }

        public Entry entry(int index) {
            return entries[index];
        }

        public String canonical() {
            return canonical;
        }

        public String sha256() {
            return sha256;
        }

        public boolean hasName(String name) {
            for (Entry entry : entries) if (entry.name.equals(name)) return true;
            return false;
        }

        public int indexOfName(String name) {
            if (name == null) return -1;
            for (int index = 0; index < entries.length; index++) {
                if (entries[index].name.equals(name)) return index;
            }
            return -1;
        }
    }

    /** Return the canonical profile name for one of the twelve camera buttons. */
    public static String cameraButtonName(int cameraNumber) {
        if (cameraNumber < 1 || cameraNumber > CAMERA_BUTTON_X.length) return null;
        return String.format(Locale.US, "cam%02d_button", cameraNumber);
    }

    /**
     * Verify that an entry is the shared profile-bound camera point. This is
     * deliberately owned by PixelWatch so the detector cannot drift from the
     * capture/UI geometry by maintaining a second coordinate table.
     */
    public static boolean isCanonicalCameraButton(Entry entry, int cameraNumber) {
        if (entry == null || cameraNumber < 1
                || cameraNumber > CAMERA_BUTTON_X.length) return false;
        int index = cameraNumber - 1;
        return cameraButtonName(cameraNumber).equals(entry.name)
                && entry.kind == Kind.PIXEL
                && entry.reducer == Reducer.YELLOWNESS
                && entry.x == CAMERA_BUTTON_X[index]
                && entry.y == CAMERA_BUTTON_Y[index];
    }

    public static String batteryBarName(int barNumber) {
        if (barNumber < 1 || barNumber > BATTERY_BAR_COUNT) return null;
        return "battery_bar_" + barNumber;
    }

    public static boolean isCanonicalBatteryBar(Entry entry, int barNumber) {
        if (entry == null || barNumber < 1 || barNumber > BATTERY_BAR_COUNT) return false;
        int index = barNumber - 1;
        return batteryBarName(barNumber).equals(entry.name)
                && entry.kind == Kind.ROI
                && entry.reducer == Reducer.MEAN_LUMA
                && entry.x == BATTERY_BAR_X[index]
                && entry.y == BATTERY_BAR_Y
                && entry.width == BATTERY_BAR_WIDTH
                && entry.height == BATTERY_BAR_HEIGHT
                && entry.step == 4;
    }

    /** Return whether an entry is one of the four flashlight-meter ROIs. */
    public static boolean isBatteryBar(Entry entry) {
        for (int number = 1; number <= BATTERY_BAR_COUNT; number++) {
            if (isCanonicalBatteryBar(entry, number)) return true;
        }
        return false;
    }

    public static boolean isCanonicalFoxyHall(Entry entry, String channel) {
        if (entry == null || channel == null) return false;
        Reducer reducer;
        if ("luma".equals(channel)) reducer = Reducer.MEAN_LUMA;
        else if ("redness".equals(channel)) reducer = Reducer.MEAN_REDNESS;
        else if ("red_cells".equals(channel)) reducer = Reducer.RED_CELLS;
        else return false;
        String name = "red_cells".equals(channel)
                ? "foxy_hall_red_cells" : "foxy_hall_mean_" + channel;
        return entry.name.equals(name)
                && entry.kind == Kind.ROI && entry.reducer == reducer
                && entry.x == FOXY_HALL_X && entry.y == FOXY_HALL_Y
                && entry.width == FOXY_HALL_WIDTH && entry.height == FOXY_HALL_HEIGHT
                && entry.step == FOXY_HALL_STEP
                && (!"red_cells".equals(channel)
                    || entry.greySpread == FOXY_HALL_REDNESS_FLOOR);
    }

    public static boolean isCanonicalMaskButton(Entry entry) {
        return entry != null && "mask_button_mean_luma".equals(entry.name)
                && entry.kind == Kind.ROI && entry.reducer == Reducer.MEAN_LUMA
                && entry.x == MASK_BUTTON_X && entry.y == MASK_BUTTON_Y
                && entry.width == MASK_BUTTON_WIDTH && entry.height == MASK_BUTTON_HEIGHT
                && entry.step == CONTROL_BUTTON_STEP;
    }

    public static boolean isCanonicalMonitorButton(Entry entry) {
        return entry != null && "monitor_button_mean_luma".equals(entry.name)
                && entry.kind == Kind.ROI && entry.reducer == Reducer.MEAN_LUMA
                && entry.x == MONITOR_BUTTON_X && entry.y == MONITOR_BUTTON_Y
                && entry.width == MONITOR_BUTTON_WIDTH && entry.height == MONITOR_BUTTON_HEIGHT
                && entry.step == CONTROL_BUTTON_STEP;
    }

    /** A reusable source view over an RGBA/RGB byte buffer. */
    public static final class ByteBufferFrame implements Frame {
        private ByteBuffer buffer;
        private int width;
        private int height;
        private int rowStride;
        private int pixelStride;

        public void set(ByteBuffer buffer, int width, int height,
                int rowStride, int pixelStride) {
            this.buffer = buffer;
            this.width = width;
            this.height = height;
            this.rowStride = rowStride;
            this.pixelStride = pixelStride;
        }

        @Override public int width() { return width; }
        @Override public int height() { return height; }

        @Override public int rgb(int x, int y) {
            if (buffer == null || x < 0 || y < 0 || x >= width || y >= height) {
                return UNKNOWN;
            }
            int offset = y * rowStride + x * pixelStride;
            if (offset < 0 || offset + 2 >= buffer.limit()) return UNKNOWN;
            return ((buffer.get(offset) & 0xff) << 16)
                    | ((buffer.get(offset + 1) & 0xff) << 8)
                    | (buffer.get(offset + 2) & 0xff);
        }
    }

    /** Small source interface so reducer behavior is host-testable. */
    public interface Frame {
        int width();
        int height();
        int rgb(int x, int y);
    }

    private PixelWatch() {}

    /**
     * The shared watchlist. The BB anchor is the sourced
     * (451,730) observation; the CAM 05 ROI, coarse whole-screen grey count,
     * and flashlight-meter bars are existing helper observations expressed in
     * native coordinates.
     *
     * <p>The twelve {@code camNN_button} pixels are the monitor map's camera
     * buttons, measured on 2026-09-01 labelled captures of the moto g56
     * (2400x1080): the selected button renders yellow
     * ({@code yellowness = min(r,g) - b} near 194) at a fixed position on the
     * map layout drawing, which stays fixed while camera feeds pan. One pixel
     * per button centre is deterministic because the button is ~120x40 px of
     * fixed UI at native resolution. Coordinates are the measured button
     * centres; a camera-rule consumer reads them through {@code READ}.</p>
     *
     * <p>The three {@code foxy_hall_*} entries are deliberately provisional:
     * they provide the native-resolution hall envelope needed to collect and
     * calibrate Foxy/empty frames, but no live controller may treat any raw
     * value as a qualified Foxy fact until a separated holdout artifact exists.</p>
     *
     * <p>The paired bottom-control ROIs are observation-only collection
     * channels. The left mask control is present both in the office and while
     * the mask is held; the right open-monitor control is present in the
     * office and absent while the mask is held. The display annotations cover
     * the inner chevrons rather than the full lower bars, leaving a clear
     * center gap. A downstream calibration may therefore use the pair, but a
     * raw value is not itself a qualified mask fact.</p>
     */
    public static Spec defaultSpec() {
        return new Spec(new Entry[] {
                new Entry("bb_left_luma", Kind.PIXEL, 451, 730, 1, 1,
                        Reducer.LUMA, 1, 0),
                new Entry("bb_left_yellowness", Kind.PIXEL, 451, 730, 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry("cam05_mean_luma", Kind.ROI, 600, 180, 520, 320,
                        Reducer.MEAN_LUMA, 4, 0),
                new Entry("screen_grey_cells", Kind.ROI, 0, 0,
                        NATIVE_WIDTH, NATIVE_HEIGHT, Reducer.GREY_CELLS, 120, 25),
                new Entry(batteryBarName(1), Kind.ROI, BATTERY_BAR_X[0],
                        BATTERY_BAR_Y, BATTERY_BAR_WIDTH, BATTERY_BAR_HEIGHT,
                        Reducer.MEAN_LUMA, 4, 0),
                new Entry(batteryBarName(2), Kind.ROI, BATTERY_BAR_X[1],
                        BATTERY_BAR_Y, BATTERY_BAR_WIDTH, BATTERY_BAR_HEIGHT,
                        Reducer.MEAN_LUMA, 4, 0),
                new Entry(batteryBarName(3), Kind.ROI, BATTERY_BAR_X[2],
                        BATTERY_BAR_Y, BATTERY_BAR_WIDTH, BATTERY_BAR_HEIGHT,
                        Reducer.MEAN_LUMA, 4, 0),
                new Entry(batteryBarName(4), Kind.ROI, BATTERY_BAR_X[3],
                        BATTERY_BAR_Y, BATTERY_BAR_WIDTH, BATTERY_BAR_HEIGHT,
                        Reducer.MEAN_LUMA, 4, 0),
                new Entry(cameraButtonName(1), Kind.PIXEL, CAMERA_BUTTON_X[0], CAMERA_BUTTON_Y[0], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(2), Kind.PIXEL, CAMERA_BUTTON_X[1], CAMERA_BUTTON_Y[1], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(3), Kind.PIXEL, CAMERA_BUTTON_X[2], CAMERA_BUTTON_Y[2], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(4), Kind.PIXEL, CAMERA_BUTTON_X[3], CAMERA_BUTTON_Y[3], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(5), Kind.PIXEL, CAMERA_BUTTON_X[4], CAMERA_BUTTON_Y[4], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(6), Kind.PIXEL, CAMERA_BUTTON_X[5], CAMERA_BUTTON_Y[5], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(7), Kind.PIXEL, CAMERA_BUTTON_X[6], CAMERA_BUTTON_Y[6], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(8), Kind.PIXEL, CAMERA_BUTTON_X[7], CAMERA_BUTTON_Y[7], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(9), Kind.PIXEL, CAMERA_BUTTON_X[8], CAMERA_BUTTON_Y[8], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(10), Kind.PIXEL, CAMERA_BUTTON_X[9], CAMERA_BUTTON_Y[9], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(11), Kind.PIXEL, CAMERA_BUTTON_X[10], CAMERA_BUTTON_Y[10], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry(cameraButtonName(12), Kind.PIXEL, CAMERA_BUTTON_X[11], CAMERA_BUTTON_Y[11], 1, 1,
                        Reducer.YELLOWNESS, 1, 0),
                new Entry("foxy_hall_mean_luma", Kind.ROI,
                        FOXY_HALL_X, FOXY_HALL_Y, FOXY_HALL_WIDTH, FOXY_HALL_HEIGHT,
                        Reducer.MEAN_LUMA, FOXY_HALL_STEP, 0),
                new Entry("foxy_hall_mean_redness", Kind.ROI,
                        FOXY_HALL_X, FOXY_HALL_Y, FOXY_HALL_WIDTH, FOXY_HALL_HEIGHT,
                        Reducer.MEAN_REDNESS, FOXY_HALL_STEP, 0),
                new Entry("foxy_hall_red_cells", Kind.ROI,
                        FOXY_HALL_X, FOXY_HALL_Y, FOXY_HALL_WIDTH, FOXY_HALL_HEIGHT,
                        Reducer.RED_CELLS, FOXY_HALL_STEP, FOXY_HALL_REDNESS_FLOOR),
                new Entry("mask_button_mean_luma", Kind.ROI,
                        MASK_BUTTON_X, MASK_BUTTON_Y, MASK_BUTTON_WIDTH, MASK_BUTTON_HEIGHT,
                        Reducer.MEAN_LUMA, CONTROL_BUTTON_STEP, 0),
                new Entry("monitor_button_mean_luma", Kind.ROI,
                        MONITOR_BUTTON_X, MONITOR_BUTTON_Y, MONITOR_BUTTON_WIDTH, MONITOR_BUTTON_HEIGHT,
                        Reducer.MEAN_LUMA, CONTROL_BUTTON_STEP, 0)
        });
    }

    /** Fill {@code output} with one value per entry without allocating. */
    public static int readInto(Spec spec, Frame frame, int[] output) {
        return readInto(spec, frame, output, false);
    }

    /**
     * Fill {@code output} with one value per entry, optionally excluding the
     * flashlight-meter ROIs. The safe default excludes those pixels because
     * the mask covers them; callers must pass {@code true} only after the same
     * frame has independently established the unmasked office state. Excluded
     * entries are written as UNKNOWN and their pixels are never sampled.
     */
    public static int readInto(Spec spec, Frame frame, int[] output,
            boolean readBattery) {
        if (spec == null || frame == null || output == null
                || output.length < spec.size()) return -1;
        for (int i = 0; i < spec.size(); i++) {
            Entry entry = spec.entry(i);
            output[i] = !readBattery && isBatteryBar(entry)
                    ? UNKNOWN : read(entry, frame);
        }
        return spec.size();
    }

    public static int read(Entry entry, Frame frame) {
        if (entry == null || frame == null || entry.x >= frame.width()
                || entry.y >= frame.height()
                || entry.x + entry.width > frame.width()
                || entry.y + entry.height > frame.height()) {
            return UNKNOWN;
        }
        if (entry.kind == Kind.PIXEL) {
            return reducePixel(entry.reducer, frame.rgb(entry.x, entry.y));
        }
        long total = 0;
        int count = 0;
        int counted = 0;
        for (int y = entry.y; y < entry.y + entry.height; y += entry.step) {
            for (int x = entry.x; x < entry.x + entry.width; x += entry.step) {
                int rgb = frame.rgb(x, y);
                if (rgb == UNKNOWN) return UNKNOWN;
                if (entry.reducer == Reducer.GREY_CELLS) {
                    int r = (rgb >> 16) & 0xff;
                    int g = (rgb >> 8) & 0xff;
                    int b = rgb & 0xff;
                    int max = Math.max(r, Math.max(g, b));
                    int min = Math.min(r, Math.min(g, b));
                    if (max - min < entry.greySpread) counted++;
                } else if (entry.reducer == Reducer.RED_CELLS) {
                    int r = (rgb >> 16) & 0xff;
                    int g = (rgb >> 8) & 0xff;
                    int b = rgb & 0xff;
                    if (r - Math.max(g, b) >= entry.greySpread) counted++;
                } else {
                    total += reduceAggregate(entry.reducer, rgb);
                }
                count++;
            }
        }
        if (count == 0) return UNKNOWN;
        return entry.reducer == Reducer.GREY_CELLS || entry.reducer == Reducer.RED_CELLS
                ? counted : (int) (total / count);
    }

    /**
     * Count the fixed downward-chevron columns in one native lower control.
     *
     * <p>The controls are translucent, so their filled rectangle and whole-ROI
     * mean luma move with the office background. This watch samples only the
     * two known chevron strokes and requires local max-channel contrast against
     * the pixels immediately above and below each stroke. It therefore accepts
     * the neutral-white monitor chevron and the pink-tinted mask chevron by
     * their fixed geometry, without treating either color or ROI brightness as
     * a state fact. The result is a coverage score, not a boolean: zero means
     * no stroke columns were observed, and UNKNOWN means the native frame was
     * unavailable or incomplete.</p>
     */
    public static int controlDownStrokeScore(Frame frame, boolean maskControl) {
        return controlDownStrokeScore(frame, maskControl,
                CONTROL_STROKE_SAMPLE_STEP, false);
    }

    /**
     * Measure a control stroke with the trace-only sparse sampler.
     *
     * <p>The live gate keeps the dense calibrated score above. Trace mode only
     * needs the same settled-state separation, so it samples every 32 native
     * pixels and normalizes the result to the dense score's range. This keeps
     * the native ImageReader callback below the display-frame budget without
     * changing the live authority or its thresholds.</p>
     */
    public static int controlDownStrokeScoreFast(Frame frame, boolean maskControl) {
        return controlDownStrokeScore(frame, maskControl,
                CONTROL_STROKE_TRACE_SAMPLE_STEP, true);
    }

    private static int controlDownStrokeScore(Frame frame, boolean maskControl,
            int sampleStep, boolean normalize) {
        if (frame == null || frame.width() != NATIVE_WIDTH
                || frame.height() != NATIVE_HEIGHT) return UNKNOWN;
        if (sampleStep < 1) return UNKNOWN;
        int xStart = (maskControl ? MASK_BUTTON_X : MONITOR_BUTTON_X)
                + (maskControl ? MASK_STROKE_X_START : MONITOR_STROKE_X_START);
        int xCenter = (maskControl ? MASK_BUTTON_X : MONITOR_BUTTON_X)
                + (maskControl ? MASK_STROKE_X_CENTER : MONITOR_STROKE_X_CENTER);
        int xEnd = (maskControl ? MASK_BUTTON_X : MONITOR_BUTTON_X)
                + (maskControl ? MASK_STROKE_X_END : MONITOR_STROKE_X_END);
        int columns = 0;
        int hits = 0;
        for (int x = xStart; x <= xEnd; x += sampleStep) {
            int yOffset = x <= xCenter
                    ? CONTROL_STROKE_Y_BASE
                            + (CONTROL_STROKE_Y_PEAK - CONTROL_STROKE_Y_BASE)
                                    * (x - xStart) / (xCenter - xStart)
                    : CONTROL_STROKE_Y_BASE
                            + (CONTROL_STROKE_Y_PEAK - CONTROL_STROKE_Y_BASE)
                                    * (xEnd - x) / (xEnd - xCenter);
            int first = normalize
                    ? fastStrokeColumnHit(frame, x, CONTROL_BUTTON_Y + yOffset)
                    : strokeColumnHit(frame, x, CONTROL_BUTTON_Y + yOffset);
            if (first == UNKNOWN) return UNKNOWN;
            int second = normalize
                    ? fastStrokeColumnHit(frame, x,
                            CONTROL_BUTTON_Y + yOffset + CONTROL_STROKE_LINE_OFFSET)
                    : strokeColumnHit(frame, x,
                            CONTROL_BUTTON_Y + yOffset + CONTROL_STROKE_LINE_OFFSET);
            if (second == UNKNOWN) return UNKNOWN;
            if (first != 0) hits++;
            if (second != 0) hits++;
            columns += 2;
        }
        if (columns == 0) return UNKNOWN;
        if (!normalize) return hits;
        int denseColumns = ((xEnd - xStart) / CONTROL_STROKE_SAMPLE_STEP + 1) * 2;
        return (hits * denseColumns + columns / 2) / columns;
    }

    /**
     * Infer the settled game surface from the paired native control strokes.
     * A partial stroke, both absent, or an otherwise contradictory pair is
     * deliberately refused rather than treated as a surface state.
     */
    public static ControlState controlState(int maskDownstroke,
            int monitorDownstroke) {
        if (maskDownstroke < 0 || monitorDownstroke < 0) {
            return ControlState.UNKNOWN;
        }
        boolean maskVisible = maskDownstroke >= CONTROL_STROKE_VISIBLE_MIN;
        boolean maskAbsent = maskDownstroke <= CONTROL_STROKE_ABSENT_MAX;
        boolean monitorVisible = monitorDownstroke >= CONTROL_STROKE_VISIBLE_MIN;
        boolean monitorAbsent = monitorDownstroke <= CONTROL_STROKE_ABSENT_MAX;
        if (maskAbsent && monitorVisible) return ControlState.MONITOR_UP;
        if (maskVisible && monitorAbsent) return ControlState.MASK_ON;
        if (maskVisible && monitorVisible) return ControlState.OFFICE_UNMASKED;
        return ControlState.UNKNOWN;
    }

    private static int strokeColumnHit(Frame frame, int x, int centerY) {
        int lineMax = 0;
        for (int y = centerY - CONTROL_STROKE_RADIUS;
                y <= centerY + CONTROL_STROKE_RADIUS; y++) {
            int rgb = frame.rgb(x, y);
            if (rgb == UNKNOWN) return UNKNOWN;
            lineMax = Math.max(lineMax, maxChannel(rgb));
        }
        long baselineTotal = 0;
        int baselineCount = 0;
        for (int y = centerY - 10; y <= centerY - 5; y++) {
            int rgb = frame.rgb(x, y);
            if (rgb == UNKNOWN) return UNKNOWN;
            baselineTotal += maxChannel(rgb);
            baselineCount++;
        }
        for (int y = centerY + 6; y <= centerY + 11; y++) {
            int rgb = frame.rgb(x, y);
            if (rgb == UNKNOWN) return UNKNOWN;
            baselineTotal += maxChannel(rgb);
            baselineCount++;
        }
        int baseline = baselineCount == 0 ? 0 : (int) (baselineTotal / baselineCount);
        return lineMax - baseline >= CONTROL_STROKE_CONTRAST ? 1 : 0;
    }

    private static int fastStrokeColumnHit(Frame frame, int x, int centerY) {
        int lineMax = 0;
        for (int y = centerY - 1; y <= centerY + 1; y++) {
            int rgb = frame.rgb(x, y);
            if (rgb == UNKNOWN) return UNKNOWN;
            lineMax = Math.max(lineMax, maxChannel(rgb));
        }
        int above = frame.rgb(x, centerY - 8);
        int below = frame.rgb(x, centerY + 8);
        if (above == UNKNOWN || below == UNKNOWN) return UNKNOWN;
        int baseline = (maxChannel(above) + maxChannel(below)) / 2;
        return lineMax - baseline >= CONTROL_STROKE_CONTRAST ? 1 : 0;
    }

    private static int maxChannel(int rgb) {
        int red = (rgb >> 16) & 0xff;
        int green = (rgb >> 8) & 0xff;
        int blue = rgb & 0xff;
        return Math.max(red, Math.max(green, blue));
    }

    private static int reducePixel(Reducer reducer, int rgb) {
        if (rgb == UNKNOWN) return UNKNOWN;
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        switch (reducer) {
            case LUMA:
                return (77 * r + 150 * g + 29 * b) >> 8;
            case YELLOWNESS:
                return Math.min(r, g) - b;
            default:
                return UNKNOWN;
        }
    }

    private static int reduceAggregate(Reducer reducer, int rgb) {
        if (rgb == UNKNOWN) return UNKNOWN;
        if (reducer == Reducer.MEAN_REDNESS) {
            int red = (rgb >> 16) & 0xff;
            int green = (rgb >> 8) & 0xff;
            int blue = rgb & 0xff;
            return red - Math.max(green, blue);
        }
        return reducePixel(Reducer.LUMA, rgb);
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.US_ASCII));
            StringBuilder out = new StringBuilder(digest.length * 2);
            for (byte value : digest) out.append(String.format("%02x", value & 0xff));
            return out.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new AssertionError(error);
        }
    }
}
