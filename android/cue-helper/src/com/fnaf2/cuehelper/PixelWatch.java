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

    public enum Kind { PIXEL, ROI }
    public enum Reducer { LUMA, YELLOWNESS, MEAN_LUMA, GREY_CELLS }

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
                    || reducer == Reducer.GREY_CELLS)) {
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
     * The first calibrated watchlist. The BB anchor is the sourced
     * (451,730) observation; the CAM 05 ROI and coarse whole-screen grey count
     * are existing helper observations expressed in native coordinates.
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
                        NATIVE_WIDTH, NATIVE_HEIGHT, Reducer.GREY_CELLS, 120, 25)
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
        int grey = 0;
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
                    if (max - min < entry.greySpread) grey++;
                } else {
                    // Aggregate reducers operate on the luma of each RGB
                    // sample; YELLOWNESS is intentionally only a pixel
                    // reducer so it cannot be mistaken for a ROI mean.
                    total += reducePixel(Reducer.LUMA, rgb);
                }
                count++;
            }
        }
        if (count == 0) return UNKNOWN;
        return entry.reducer == Reducer.GREY_CELLS
                ? grey : (int) (total / count);
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
