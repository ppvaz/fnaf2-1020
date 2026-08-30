package com.fnaf2.cuehelper;

/** Host-only regression for the native watchlist contract and reducers. */
public final class PixelWatchTest {
    private static int failures;

    private static void check(String what, boolean condition) {
        if (!condition) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static final class Frame implements PixelWatch.Frame {
        private final int width;
        private final int height;
        private final int[] cells;

        Frame(int width, int height, int fill) {
            this.width = width;
            this.height = height;
            this.cells = new int[width * height];
            java.util.Arrays.fill(cells, fill);
        }

        void set(int x, int y, int rgb) { cells[y * width + x] = rgb; }
        @Override public int width() { return width; }
        @Override public int height() { return height; }
        @Override public int rgb(int x, int y) {
            return x < 0 || y < 0 || x >= width || y >= height
                    ? PixelWatch.UNKNOWN : cells[y * width + x];
        }
    }

    public static void main(String[] args) {
        PixelWatch.Spec spec = PixelWatch.defaultSpec();
        check("default spec has the fixed four-entry watchlist", spec.size() == 4);
        check("spec hash is stable and lowercase sha256",
                spec.sha256().matches("[0-9a-f]{64}")
                        && spec.sha256().equals(PixelWatch.defaultSpec().sha256()));
        check("canonical spec is versioned", spec.canonical().startsWith("pixel-watch-v1\n"));

        Frame frame = new Frame(PixelWatch.NATIVE_WIDTH, PixelWatch.NATIVE_HEIGHT, 0x808080);
        frame.set(451, 730, 0x90d1ff);
        int[] values = new int[spec.size()];
        check("readInto fills every entry",
                PixelWatch.readInto(spec, frame, values) == spec.size());
        check("BB anchor luma is native RGB luma", values[0] == 194);
        check("BB anchor yellowness preserves the channel reducer", values[1] == -111);
        check("uniform CAM ROI returns its mean luma",
                values[2] == 128);
        check("uniform grey coarse screen is all grey cells", values[3] == 180);

        Frame mixed = new Frame(10, 10, 0x808080);
        mixed.set(0, 0, 0xc2dd00);
        PixelWatch.Entry pixel = new PixelWatch.Entry("p", PixelWatch.Kind.PIXEL,
                0, 0, 1, 1, PixelWatch.Reducer.LUMA, 1, 0);
        check("pixel reducer reads a selected pixel", PixelWatch.read(pixel, mixed) == 187);
        PixelWatch.Entry grey = new PixelWatch.Entry("g", PixelWatch.Kind.ROI,
                0, 0, 10, 10, PixelWatch.Reducer.GREY_CELLS, 5, 25);
        check("grey-cell reducer samples the bounded ROI", PixelWatch.read(grey, mixed) == 3);

        PixelWatch.Entry outside = new PixelWatch.Entry("outside", PixelWatch.Kind.PIXEL,
                99, 99, 1, 1, PixelWatch.Reducer.LUMA, 1, 0);
        check("out-of-frame watch refuses with UNKNOWN",
                PixelWatch.read(outside, mixed) == PixelWatch.UNKNOWN);

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("PixelWatchTest: all checks passed");
    }
}
