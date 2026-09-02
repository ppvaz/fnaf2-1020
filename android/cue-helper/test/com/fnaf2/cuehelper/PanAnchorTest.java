package com.fnaf2.cuehelper;

/** Host regression for the warm bulb anchor measurement and refusals. */
public final class PanAnchorTest {
    private static int failures;

    private static final class Frame implements PixelWatch.Frame {
        private final int[] pixels = new int[PixelWatch.NATIVE_WIDTH * PixelWatch.NATIVE_HEIGHT];

        Frame(int fill) {
            java.util.Arrays.fill(pixels, fill);
        }

        void rect(int x0, int y0, int x1, int y1, int rgb) {
            for (int y = y0; y < y1; y++) {
                for (int x = x0; x < x1; x++) pixels[y * PixelWatch.NATIVE_WIDTH + x] = rgb;
            }
        }

        @Override public int width() { return PixelWatch.NATIVE_WIDTH; }
        @Override public int height() { return PixelWatch.NATIVE_HEIGHT; }
        @Override public int rgb(int x, int y) {
            return x < 0 || y < 0 || x >= width() || y >= height()
                    ? PixelWatch.UNKNOWN : pixels[y * width() + x];
        }
    }

    private static void check(String what, boolean condition) {
        if (!condition) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static PanAnchor.Result measure(int x) {
        Frame frame = new Frame(0x101010);
        frame.rect(x - 120, 40, x + 120, 180, 0xc86040);
        // A smaller warm decoy must not displace the dominant bulb.
        frame.rect(300, 40, 380, 100, 0xc86040);
        PanAnchor.Result result = new PanAnchor.Result();
        PanAnchor.measure(frame, new PanAnchor.Workspace(), result);
        return result;
    }

    public static void main(String[] args) {
        PanAnchor.Result centre = measure(1160);
        check("centre bulb is observed", centre.observed);
        check("centre bulb centroid is stable", Math.abs(centre.x - 1160) <= 4);
        check("dominant component beats decoy", centre.area > centre.margin
                && centre.margin >= PanAnchor.MIN_COMPONENT_MARGIN);
        check("confidence is bounded", centre.confidence > 0 && centre.confidence <= 1000);

        PanAnchor.Result right = measure(550);
        check("right-pan bulb is observed", right.observed && Math.abs(right.x - 550) <= 4);

        Frame empty = new Frame(0x101010);
        PanAnchor.Result absent = new PanAnchor.Result();
        PanAnchor.measure(empty, new PanAnchor.Workspace(), absent);
        check("missing bulb refuses", !absent.observed && "bulb-not-found".equals(absent.reason));

        Frame ambiguous = new Frame(0x101010);
        ambiguous.rect(600, 40, 840, 180, 0xc86040);
        ambiguous.rect(1200, 40, 1440, 180, 0xc86040);
        PanAnchor.Result unclear = new PanAnchor.Result();
        PanAnchor.measure(ambiguous, new PanAnchor.Workspace(), unclear);
        check("competing bulbs refuse", !unclear.observed && "bulb-ambiguous".equals(unclear.reason));

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("PanAnchorTest: all checks passed");
    }
}
