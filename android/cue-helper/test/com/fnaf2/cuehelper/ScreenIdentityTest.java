package com.fnaf2.cuehelper;

/** Phone-free regression for the Cue Helper screen identity gate. */
public final class ScreenIdentityTest {
    private static int failures;

    private static void check(String what, boolean ok) {
        if (!ok) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static int[] filled(int colour) {
        int[] grid = new int[PixelWatch.GRID_WIDTH * PixelWatch.GRID_HEIGHT];
        for (int i = 0; i < grid.length; i++) grid[i] = colour;
        return grid;
    }

    private static void put(int[] grid, int x, int y, int colour) {
        grid[y * PixelWatch.GRID_WIDTH + x] = colour;
    }

    private static int[] landscapeHelper() {
        int[] grid = filled(0x120a0b);
        for (int x = 1; x < PixelWatch.GRID_WIDTH; x++) {
            put(grid, x, 2, 0x1f1012);
            put(grid, x, 7, 0x1f1012);
        }
        put(grid, 16, 3, 0x5f3989); // Bonnie
        put(grid, 16, 4, 0x6f422b); // Freddy
        put(grid, 16, 5, 0xd3a623); // Chica
        put(grid, 8, 1, 0xffb020);
        put(grid, 9, 1, 0xffb020);
        return grid;
    }

    private static int[] portraitHelper() {
        int[] grid = filled(0x120a0b);
        for (int x = 1; x < 19; x++) put(grid, x, 3, 0x1f1012);
        for (int x = 1; x < 19; x++) put(grid, x, 5, 0x6f422b); // Freddy
        for (int x = 1; x < 19; x++) put(grid, x, 6, 0xb23a59); // Mangle
        return grid;
    }

    public static void main(String[] args) {
        check("landscape helper frame is identified",
                ScreenIdentity.classify(landscapeHelper()) == ScreenIdentity.CUE_HELPER);
        check("portrait helper frame is identified",
                ScreenIdentity.classify(portraitHelper()) == ScreenIdentity.CUE_HELPER);

        // The FNaF title is deliberately grey/white and must not be inferred
        // as the helper merely because it is a dark 20x9 frame.
        check("foreign grey frame is unknown",
                ScreenIdentity.classify(filled(0x1b1b1b)) == ScreenIdentity.UNKNOWN);
        check("invalid grid size is unknown",
                ScreenIdentity.classify(new int[PixelWatch.GRID_WIDTH])
                        == ScreenIdentity.UNKNOWN);
        check("unknown label is fail-closed",
                "UNKNOWN".equals(ScreenIdentity.label(ScreenIdentity.UNKNOWN)));

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("ScreenIdentityTest: all checks passed");
    }
}
