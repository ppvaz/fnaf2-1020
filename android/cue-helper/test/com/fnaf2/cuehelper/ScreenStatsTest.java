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

        // meanLuma vectors. The luma weights match the watch: (77r+150g+29b)>>8.
        // A zero mean is a valid reading (dark frame), distinct from -1, which
        // means "no reading". The statistic guards darkness; it must never be
        // turned into a classifier -- measured mean-luma bands overlap
        // (camera 3.8-63.1 against office 28.6-35.6).
        checkEquals("all-black grid has mean luma zero",
                0, ScreenStats.meanLuma(grid(180, 0x000000, 0x000000, 0), 180));
        checkEquals("all-white grid has mean luma 255",
                255, ScreenStats.meanLuma(grid(180, 0xffffff, 0xffffff, 0), 180));
        checkEquals("uniform mid-grey grid has mean luma 128",
                128, ScreenStats.meanLuma(grid(180, grey, grey, 0), 180));
        // (0x000000 -> 0) and (0xffffff -> 255): floor(255/2) = 127.
        checkEquals("half-black half-white grid floors to 127",
                127, ScreenStats.meanLuma(grid(180, 0x000000, 0xffffff, 90), 180));
        // 0xc2dd00: r=194, g=221, b=0 -> (77*194 + 150*221 + 29*0) >> 8 = 187.
        checkEquals("measured button lime carries luma 187",
                187, ScreenStats.meanLuma(new int[] {lime}, 1));
        checkEquals("mean luma refuses the null grid", -1, ScreenStats.meanLuma(null, 0));
        checkEquals("mean luma refuses an empty grid", -1, ScreenStats.meanLuma(new int[] {grey}, 0));
        checkEquals("mean luma refuses a count past the array",
                -1, ScreenStats.meanLuma(new int[] {grey}, 2));
        checkEquals("mean luma refuses a negative count",
                -1, ScreenStats.meanLuma(new int[] {grey}, -1));

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("ScreenStatsTest: all checks passed");
    }
}
