package com.fnaf2.cuehelper;

/**
 * Host-side gate for the whole-frame grey-cell count. No phone, no Android SDK.
 *
 * <p>The regression this closes is the one the sensor measurement exposed: a
 * point-feature anchor on a point-sampling grid is a coin flip, so the count
 * must aggregate every cell and must not quietly become position-sensitive.</p>
 */
public final class ScreenStatsTest {
    private static int failures;

    private static void check(String what, boolean ok) {
        if (!ok) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static void checkEquals(String what, int expected, int actual) {
        check(what + " (expected " + expected + ", got " + actual + ")",
                expected == actual);
    }

    /** Fills a grid with one colour, then overwrites the first n cells. */
    private static int[] grid(int size, int background, int accent, int accentCells) {
        int[] cells = new int[size];
        for (int i = 0; i < size; i++) {
            cells[i] = i < accentCells ? accent : background;
        }
        return cells;
    }

    public static void main(String[] args) {
        final int grey = 0x808080;
        final int lime = 0xc2dd00;   // the selected camera button, measured on device

        checkEquals("all-grey grid counts every cell",
                180, ScreenStats.greyCells(grid(180, grey, grey, 0), 180));
        checkEquals("all-saturated grid counts none",
                0, ScreenStats.greyCells(grid(180, lime, lime, 0), 180));

        // Pure black and pure white have zero channel spread: darkness is grey.
        // The office is not distinguished from a camera by being dark -- mean
        // luma overlaps (camera 3.8-63.1, office 28.6-35.6) -- so a rule that
        // leaned on brightness here would encode a refuted anchor.
        checkEquals("black counts as grey", 1, ScreenStats.greyCells(new int[] {0x000000}, 1));
        checkEquals("white counts as grey", 1, ScreenStats.greyCells(new int[] {0xffffff}, 1));

        // The boundary is exclusive at GREY_SATURATION_MAX.
        int max = ScreenStats.GREY_SATURATION_MAX;
        checkEquals("spread just under the bound is grey",
                1, ScreenStats.greyCells(new int[] {(max - 1) << 16}, 1));
        checkEquals("spread exactly at the bound is not grey",
                0, ScreenStats.greyCells(new int[] {max << 16}, 1));

        // Position independence is the whole point of the anchor: the same
        // number of saturated cells must give the same count wherever they sit.
        int[] front = grid(180, grey, lime, 7);
        int[] spread = new int[180];
        for (int i = 0; i < 180; i++) {
            spread[i] = i % 26 == 0 && i / 26 < 7 ? lime : grey;
        }
        checkEquals("count is independent of where the saturated cells fall",
                ScreenStats.greyCells(front, 180), ScreenStats.greyCells(spread, 180));
        checkEquals("seven saturated cells leave 173 grey",
                173, ScreenStats.greyCells(front, 180));

        // Measured separation, as a guard on the constant rather than a
        // threshold: an office reading must not land inside the monitor-up
        // band. Office 142-145, monitor-up 173-180 (2026-08-26).
        checkEquals("an office-like grid stays below the monitor-up band",
                145, ScreenStats.greyCells(grid(180, grey, lime, 35), 180));

        checkEquals("null grid is refused", -1, ScreenStats.greyCells(null, 0));
        checkEquals("count past the array is refused",
                -1, ScreenStats.greyCells(new int[] {grey}, 2));
        checkEquals("negative count is refused",
                -1, ScreenStats.greyCells(new int[] {grey}, -1));

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("ScreenStatsTest: all checks passed");
    }
}
