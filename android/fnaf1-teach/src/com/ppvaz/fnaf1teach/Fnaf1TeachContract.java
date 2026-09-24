package com.ppvaz.fnaf1teach;

/** Pure-Java contract shared by the FNaF 1 teaching presenter and its checks.
 *
 * The strip deliberately ends at native y=50. FNaF 1's per-run door-light
 * reader starts at y=60, so a ten-pixel clearance remains even if native
 * screenshots include application overlays. This is presentation state only:
 * it does not classify a screen, read pixels, or issue input.
 */
public final class Fnaf1TeachContract {
    public static final String SCHEMA = "fnaf1-teach-overlay-v1";
    public static final String TARGET_PACKAGE = "com.scottgames.fivenightsatfreddys";
    public static final int NATIVE_WIDTH = 2400;
    public static final int NATIVE_HEIGHT = 1080;
    public static final int LEFT = 20;
    public static final int TOP = 0;
    public static final int RIGHT = 1020;
    public static final int BOTTOM = 50;
    public static final int GUARD_PX = 10;

    private Fnaf1TeachContract() {
    }

    public static boolean validNight(int night) {
        return night == 1 || night == 2;
    }

    /** Bounded semantic labels, deliberately not arbitrary host text. */
    public static boolean validStage(String stage) {
        return "hands-off".equals(stage)
                || "left-calibration".equals(stage)
                || "left-watch".equals(stage)
                || "right-monitor-calibration".equals(stage)
                || "full-loop".equals(stage)
                || "night2-calibration".equals(stage);
    }

    public static String headline(int night, String stage) {
        return "FNaF 1  •  Night " + night + "  •  " + stage;
    }

    public static String lesson(String stage) {
        switch (stage) {
            case "hands-off":
                return "12–2 AM: no character can move; preserve power while the clock advances.";
            case "left-calibration":
                return "2 AM setup: learn the left doorway's lit reference before Bonnie can advance.";
            case "left-watch":
                return "2–3 AM: check only the left doorway; Bonnie is the only active threat.";
            case "right-monitor-calibration":
                return "Before 3 AM: prepare right-door and monitor checks, then begin the full loop.";
            case "full-loop":
                return "Full loop: light each doorway, close on uncertainty, refresh cameras briefly.";
            case "night2-calibration":
                return "Night 2 begins active: establish both doorway references before the loop.";
            default:
                return "Presenter state is invalid; the game runner must refuse this update.";
        }
    }
}
