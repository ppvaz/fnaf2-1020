package com.fnafminus7.cuehelper;

/**
 * Whole-frame statistics over the helper's {@code 20x9} visual grid.
 *
 * <p>The grid is not a small image of the screen. Minifying 2400x1080 to 20x9
 * is a 120x reduction with no mipmap chain, so the compositor point-samples: a
 * cell carries one source pixel's unblended colour. Measured on the phone
 * 2026-08-26 -- a selected camera button reads yellowness 194 in the grid where
 * a box-average of the same screen gives 46. See
 * {@code docs/device/ONE-PIXEL-VISION.md} §3.</p>
 *
 * <p>That is why the office/not-office signal here counts cells across the
 * whole grid rather than testing an anchor at a position. A feature smaller
 * than the ~120x120 sample pitch is found only when a sample happens to land on
 * it -- the lit camera button is present on 12 of 12 cameras at full resolution
 * and visible to this grid on 7 of 12, at yellowness 194 or 0-10 with nothing
 * in between. A whole-frame count cannot be defeated by where any one sample
 * falls.</p>
 *
 * <p>This class reports a count, never a verdict. The measured separation is
 * office 142-145 against monitor-up 173-180 (twelve cameras, four office
 * variants), but two clusters of five samples do not fix a boundary, and the
 * mask reads 175 -- inside the monitor-up band. Naming a threshold here would
 * be a plausible value standing in for a calibrated one. See
 * {@code docs/device/ON-DEVICE-VALIDATION.md} §"Which anchor survives a
 * point-sampling sensor".</p>
 */
public final class ScreenStats {
    /** A cell counts as near-grey below this max-minus-min channel spread. */
    public static final int GREY_SATURATION_MAX = 25;

    private ScreenStats() {
    }

    /**
     * Number of near-grey cells among the first {@code count} entries of
     * {@code grid}, each packed {@code 0xRRGGBB}.
     *
     * @return the count, or -1 if the arguments do not describe a grid
     */
    public static int greyCells(int[] grid, int count) {
        if (grid == null || count < 0 || count > grid.length) {
            return -1;
        }
        int grey = 0;
        for (int i = 0; i < count; i++) {
            int cell = grid[i];
            int r = (cell >> 16) & 0xff;
            int g = (cell >> 8) & 0xff;
            int b = cell & 0xff;
            int max = r > g ? (r > b ? r : b) : (g > b ? g : b);
            int min = r < g ? (r < b ? r : b) : (g < b ? g : b);
            if (max - min < GREY_SATURATION_MAX) {
                grey++;
            }
        }
        return grey;
    }
}
