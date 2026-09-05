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
 * <p>Besides the helper, this class has a conservative FNaF 2 night/menu
 * diagnostic. Only {@link #FNAF2_NIGHT} can authorize audio observations; the
 * menu and every unrecognized frame remain non-authorizing.</p>
 */
public final class ScreenIdentity {
    public static final int UNKNOWN = 0;
    public static final int CUE_HELPER = 1;
    public static final int FNAF2_NIGHT = 2;
    public static final int FNAF2_MENU = 3;

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
        if (landscapeScore(grid) >= LANDSCAPE_THRESHOLD
                || portraitScore(grid) >= PORTRAIT_THRESHOLD) {
            return CUE_HELPER;
        }
        // A menu-like frame wins an ambiguous dark/red match. This keeps a
        // title/menu accent from being mistaken for the night mask bar and
        // prevents the overlay from annotating absent office elements.
        if (menuScore(grid) >= 5) {
            return FNAF2_MENU;
        }
        return nightScore(grid) > 0 ? FNAF2_NIGHT : UNKNOWN;
    }

    /** A bounded diagnostic score, useful for logs and offline calibration. */
    public static int score(int[] grid) {
        if (grid == null || grid.length != GRID_WIDTH * GRID_HEIGHT) {
            return 0;
        }
        return Math.max(Math.max(landscapeScore(grid), portraitScore(grid)),
                Math.max(nightScore(grid), menuScore(grid)));
    }

    /**
     * Verdict-free per-branch scores, so a host can see WHY a frame classified
     * and calibrate against the same numbers the device used. On 2026-09-05
     * this service reported FNAF2_NIGHT on 24 consecutive live grids while the
     * operator was looking at the menu, and {@link #score} could not say which
     * branch won because it only reports the maximum.
     */
    public static String describe(int[] grid) {
        if (grid == null || grid.length != GRID_WIDTH * GRID_HEIGHT) {
            return "screenNight=0 screenMenu=0 screenLandscape=0 screenPortrait=0";
        }
        return "screenNight=" + nightScore(grid)
                + " screenMenu=" + menuScore(grid)
                + " screenLandscape=" + landscapeScore(grid)
                + " screenPortrait=" + portraitScore(grid);
    }

    public static String label(int state) {
        switch (state) {
            case CUE_HELPER:
                return "CUE_HELPER";
            case FNAF2_NIGHT:
                return "FNAF2_NIGHT";
            case FNAF2_MENU:
                return "FNAF2_MENU";
            default:
                return "UNKNOWN";
        }
    }

    /**
     * Conservative approximation of the established phone-side night rule:
     * the frame must be globally dark and show either the lit flashlight meter
     * or the pink mask bar. A title/menu frame is therefore never a night.
     */
    private static int nightScore(int[] grid) {
        if (globalMeanLuma(grid) >= 80) {
            return 0;
        }
        int score = 0;
        if (meanCells(grid, 0, 0, 2, 1) > 90) {
            score += 6;
        }
        int maskRed = meanChannel(grid, 1, 8, 10, 9, 16);
        int maskBlue = meanChannel(grid, 1, 8, 10, 9, 0);
        if (maskRed > 50 && maskRed > maskBlue * 1.3) {
            score += 6;
        }
        return score;
    }

    /** Menu is diagnostic only; it can never authorize audio cues. */
    private static int menuScore(int[] grid) {
        if (globalMeanLuma(grid) >= 80) {
            return 0;
        }
        int brightTop = brightCells(grid, 0, 0, 10, 3);
        int brightOptions = brightCells(grid, 0, 3, 12, 7);
        return (brightTop >= 3 ? 3 : 0)
                + (brightOptions >= 2 ? 2 : 0);
    }

    private static int globalMeanLuma(int[] grid) {
        long total = 0L;
        int count = 0;
        for (int y = 4; y <= 6; y += 2) {
            for (int x = 0; x < GRID_WIDTH; x++) {
                int rgb = grid[y * GRID_WIDTH + x];
                int red = (rgb >> 16) & 0xff;
                int green = (rgb >> 8) & 0xff;
                int blue = rgb & 0xff;
                total += (77 * red + 150 * green + 29 * blue) >> 8;
                count++;
            }
        }
        return (int) (total / count);
    }

    private static int meanCells(int[] grid, int x0, int y0, int x1, int y1) {
        long total = 0L;
        int count = 0;
        for (int y = y0; y < y1; y++) {
            for (int x = x0; x < x1; x++) {
                int rgb = grid[y * GRID_WIDTH + x];
                int red = (rgb >> 16) & 0xff;
                int green = (rgb >> 8) & 0xff;
                int blue = rgb & 0xff;
                total += (77 * red + 150 * green + 29 * blue) >> 8;
                count++;
            }
        }
        return count == 0 ? 0 : (int) (total / count);
    }

    private static int meanChannel(int[] grid, int x0, int y0, int x1, int y1,
            int shift) {
        long total = 0L;
        int count = 0;
        for (int y = y0; y < y1; y++) {
            for (int x = x0; x < x1; x++) {
                int rgb = grid[y * GRID_WIDTH + x];
                total += (rgb >> shift) & 0xff;
                count++;
            }
        }
        return count == 0 ? 0 : (int) (total / count);
    }

    private static int brightCells(int[] grid, int x0, int y0, int x1, int y1) {
        int count = 0;
        for (int y = y0; y < y1; y++) {
            for (int x = x0; x < x1; x++) {
                int rgb = grid[y * GRID_WIDTH + x];
                int red = (rgb >> 16) & 0xff;
                int green = (rgb >> 8) & 0xff;
                int blue = rgb & 0xff;
                if (red > 150 && green > 150 && blue > 150) {
                    count++;
                }
            }
        }
        return count;
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
