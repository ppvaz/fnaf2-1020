package com.fnaf2.cuehelper;

/**
 * Fail-closed identity check for the screen being sampled by the helper.
 *
 * <p>The capture grid is intentionally tiny and point-sampled. This classifier
 * therefore uses stable UI colour anchors rather than pretending that the grid
 * is an OCR image. The anchors come from the locally retained Cue Helper
 * frames in both orientations: dark display background, panel fill, and the
 * Bonnie/Freddy/Chica control colours. Dynamic status text is not used.</p>
 *
 * <p>This class identifies the helper only. A frame that is not confidently the
 * helper is {@link #UNKNOWN}; it is not silently promoted to a game identity.
 * That distinction is the safety gate for downstream visual interpretation.</p>
 */
public final class ScreenIdentity {
    public static final int UNKNOWN = 0;
    public static final int CUE_HELPER = 1;

    private static final int GRID_WIDTH = PixelWatch.GRID_WIDTH;
    private static final int GRID_HEIGHT = PixelWatch.GRID_HEIGHT;

    private static final int BACKGROUND = 0x120a0b;
    private static final int PANEL = 0x1f1012;
    private static final int BONNIE = 0x5f3989;
    private static final int FREDDY = 0x6f422b;
    private static final int CHICA = 0xd3a623;
    private static final int MANGLE = 0xb23a59;
    private static final int AMBER = 0xffb020;

    // Keep the background and panel colours distinct: their channel distance
    // is 26, so a broad tolerance would turn an all-dark foreign screen into
    // a false helper match.
    private static final int COLOR_TOLERANCE = 12;
    private static final int LANDSCAPE_THRESHOLD = 14;
    private static final int PORTRAIT_THRESHOLD = 8;

    private ScreenIdentity() {
    }

    /** Return {@link #CUE_HELPER} only when one of the calibrated layouts fits. */
    public static int classify(int[] grid) {
        if (grid == null || grid.length != GRID_WIDTH * GRID_HEIGHT) {
            return UNKNOWN;
        }
        return landscapeScore(grid) >= LANDSCAPE_THRESHOLD
                || portraitScore(grid) >= PORTRAIT_THRESHOLD
                ? CUE_HELPER : UNKNOWN;
    }

    /** A bounded diagnostic score, useful for logs and offline calibration. */
    public static int score(int[] grid) {
        if (grid == null || grid.length != GRID_WIDTH * GRID_HEIGHT) {
            return 0;
        }
        return Math.max(landscapeScore(grid), portraitScore(grid));
    }

    public static String label(int state) {
        return state == CUE_HELPER ? "CUE_HELPER" : "UNKNOWN";
    }

    private static int landscapeScore(int[] grid) {
        int score = 0;
        score += near(grid, 0, 0, BACKGROUND) ? 2 : 0;
        score += near(grid, 0, 8, BACKGROUND) ? 2 : 0;
        score += near(grid, 19, 8, BACKGROUND) ? 1 : 0;
        score += near(grid, 1, 2, PANEL) ? 1 : 0;
        score += near(grid, 1, 7, PANEL) ? 1 : 0;
        score += near(grid, 19, 7, PANEL) ? 1 : 0;

        // The three stacked control buttons are stable across capture state.
        score += near(grid, 16, 3, BONNIE) ? 4 : 0;
        score += near(grid, 16, 4, FREDDY) ? 4 : 0;
        score += near(grid, 16, 5, CHICA) ? 4 : 0;

        // The amber title is a weak supporting signal, never the identity by
        // itself because game text can also be bright.
        score += near(grid, 8, 1, AMBER) ? 1 : 0;
        score += near(grid, 9, 1, AMBER) ? 1 : 0;
        return score;
    }

    private static int portraitScore(int[] grid) {
        int score = 0;
        score += near(grid, 0, 0, BACKGROUND) ? 2 : 0;
        score += near(grid, 19, 8, BACKGROUND) ? 2 : 0;
        score += near(grid, 1, 3, PANEL) ? 1 : 0;

        // Earlier portrait frames place the cards at slightly different
        // vertical positions as the explanatory text changes. Count the broad
        // button fills instead of depending on one row for those frames.
        score += countNear(grid, FREDDY) >= 12 ? 4 : 0;
        score += countNear(grid, MANGLE) >= 12 ? 4 : 0;

        // In portrait the vertical control stack exposes the Freddy and
        // Mangle fills in broad, stable rows.
        score += near(grid, 2, 5, FREDDY) ? 2 : 0;
        score += near(grid, 10, 5, FREDDY) ? 2 : 0;
        score += near(grid, 2, 6, MANGLE) ? 2 : 0;
        score += near(grid, 10, 6, MANGLE) ? 2 : 0;
        return score;
    }

    private static int countNear(int[] grid, int expected) {
        int count = 0;
        for (int actual : grid) {
            int distance = Math.abs(((actual >> 16) & 0xff) - ((expected >> 16) & 0xff))
                    + Math.abs(((actual >> 8) & 0xff) - ((expected >> 8) & 0xff))
                    + Math.abs((actual & 0xff) - (expected & 0xff));
            if (distance <= COLOR_TOLERANCE) count++;
        }
        return count;
    }

    private static boolean near(int[] grid, int x, int y, int expected) {
        int actual = grid[y * GRID_WIDTH + x];
        int distance = Math.abs(((actual >> 16) & 0xff) - ((expected >> 16) & 0xff))
                + Math.abs(((actual >> 8) & 0xff) - ((expected >> 8) & 0xff))
                + Math.abs((actual & 0xff) - (expected & 0xff));
        return distance <= COLOR_TOLERANCE;
    }
}
