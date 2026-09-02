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

    public enum Kind { PIXEL, ROI }
    public enum Reducer {
        LUMA, YELLOWNESS, MEAN_LUMA, MEAN_REDNESS, GREY_CELLS, RED_CELLS
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
                        Reducer.RED_CELLS, FOXY_HALL_STEP, FOXY_HALL_REDNESS_FLOOR)
        });
    }

    /** Fill {@code output} with one value per entry without allocating. */
    public static int readInto(Spec spec, Frame frame, int[] output) {
        if (spec == null || frame == null || output == null
                || output.length < spec.size()) return -1;
        for (int i = 0; i < spec.size(); i++) {
            output[i] = read(spec.entry(i), frame);
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
