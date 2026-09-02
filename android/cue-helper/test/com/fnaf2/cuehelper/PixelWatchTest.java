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
        check("default spec has the four sourced entries, battery bars, map buttons, and Foxy channels",
                spec.size() == 23);
        check("the battery bars follow the sourced entries",
                spec.entry(4).name.equals("battery_bar_1")
                        && spec.entry(7).name.equals("battery_bar_4")
                        && spec.entry(4).x == 132 && spec.entry(4).y == 70);
        check("the map buttons follow the battery bars",
                spec.entry(8).name.equals("cam01_button")
                        && spec.entry(19).name.equals("cam12_button")
                        && spec.entry(14).x == 1776 && spec.entry(14).y == 606);
        check("the Foxy channels use the shared provisional hall envelope",
                PixelWatch.isCanonicalFoxyHall(spec.entry(20), "luma")
                        && PixelWatch.isCanonicalFoxyHall(spec.entry(21), "redness")
                        && PixelWatch.isCanonicalFoxyHall(spec.entry(22), "red_cells"));
        check("spec hash is stable and lowercase sha256",
                spec.sha256().matches("[0-9a-f]{64}")
                        && spec.sha256().equals(PixelWatch.defaultSpec().sha256()));
        check("canonical spec is versioned", spec.canonical().startsWith("pixel-watch-v1\n"));

        Frame frame = new Frame(PixelWatch.NATIVE_WIDTH, PixelWatch.NATIVE_HEIGHT, 0x808080);
        frame.set(451, 730, 0x90d1ff);
        frame.set(1776, 606, 0xc2dd00);
        for (int bar = 1; bar <= PixelWatch.BATTERY_BAR_COUNT; bar++) {
            int x = 132 + (bar - 1) * 40;
            for (int y = 70; y < 102; y++) {
                for (int xx = x; xx < x + 28; xx++) frame.set(xx, y, 0xffffff);
            }
        }
        int[] values = new int[spec.size()];
        check("readInto fills every entry",
                PixelWatch.readInto(spec, frame, values) == spec.size());
        check("BB anchor luma is native RGB luma", values[0] == 194);
        check("BB anchor yellowness preserves the channel reducer", values[1] == -111);
        check("uniform CAM ROI returns its mean luma",
                values[2] == 128);
        check("uniform grey coarse screen is all grey cells", values[3] == 180);
        check("a full battery bar reads bright meter luma",
                values[spec.indexOfName("battery_bar_1")] == 255);
        check("an unselected map button reads grey, not yellow",
                values[spec.indexOfName("cam01_button")] == 0);
        check("the lit CAM 07 button reads the measured selected yellowness",
                values[spec.indexOfName("cam07_button")] == 194);
        check("the provisional Foxy luma channel reads its envelope mean",
                values[spec.indexOfName("foxy_hall_mean_luma")] == 128);
        check("the provisional Foxy redness channel reads neutral grey as zero",
                values[spec.indexOfName("foxy_hall_mean_redness")] == 0);
        check("the provisional Foxy red-cell channel ignores neutral samples",
                values[spec.indexOfName("foxy_hall_red_cells")] == 0);

        Frame redHall = new Frame(PixelWatch.NATIVE_WIDTH, PixelWatch.NATIVE_HEIGHT, 0x808080);
        redHall.set(PixelWatch.FOXY_HALL_X, PixelWatch.FOXY_HALL_Y, 0xc21e14);
        check("the provisional Foxy red-cell channel counts sampled red pixels",
                PixelWatch.read(spec.entry(spec.indexOfName("foxy_hall_red_cells")), redHall) == 1);

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
