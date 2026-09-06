package com.fnaf2.cuehelper;

/** Keeps debug annotations tied to the screen and monitor state that produced them. */
public final class OverlayRegionFilter {
    private OverlayRegionFilter() {
    }

    public static boolean visible(OverlaySnapshot.Screen screen, RoiSpec roi) {
        if (screen != OverlaySnapshot.Screen.FNAF2_NIGHT || roi == null) {
            return false;
        }
        return roi.screenScope == RoiSpec.ScreenScope.OFFICE
                || roi.screenScope == RoiSpec.ScreenScope.NIGHT_HUD;
    }

    /**
     * The live filter. Office annotations are valid only with the monitor down;
     * camera/map annotations are valid only with the monitor up. Identity-only
     * samples are never decorative HUD regions.
     */
    public static boolean visible(OverlaySnapshot.Screen screen,
            OverlaySnapshot.MonitorState monitorState, RoiSpec roi) {
        if (screen != OverlaySnapshot.Screen.FNAF2_NIGHT || monitorState == null
                || roi == null) return false;
        if (roi.screenScope == RoiSpec.ScreenScope.OFFICE) {
            return monitorState == OverlaySnapshot.MonitorState.DOWN;
        }
        if (roi.screenScope == RoiSpec.ScreenScope.MONITOR) {
            return monitorState == OverlaySnapshot.MonitorState.UP;
        }
        if (roi.screenScope == RoiSpec.ScreenScope.NIGHT_HUD) {
            // The bottom controls are part of the office HUD. They remain
            // visible through blackout/unknown office frames, but both leave
            // the screen when the monitor is raised. Keeping them tied to the
            // monitor fact prevents stale button boxes from floating over the
            // camera feed.
            if (isBottomControl(roi.id)) {
                return monitorState != OverlaySnapshot.MonitorState.UP;
            }
            return true;
        }
        return false;
    }

    private static boolean isBottomControl(String roiId) {
        return "mask_button_mean_luma".equals(roiId)
                || "monitor_button_mean_luma".equals(roiId);
    }

    /** Map a fixed camera-button ROI to its semantic camera control. */
    public static String cameraControlFor(String roiId) {
        if (roiId == null || !roiId.matches("cam[0-9]{2}_button")) return null;
        try {
            int number = Integer.parseInt(roiId.substring(3, 5));
            return CameraSelectionDetector.cameraControl(number);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    /** Human-readable labels for the paired bottom-control calibration ROIs. */
    public static String controlDisplayLabel(String roiId) {
        if ("mask_button_mean_luma".equals(roiId)) return "MASK BUTTON";
        if ("monitor_button_mean_luma".equals(roiId)) return "OPEN MONITOR";
        return null;
    }

    /** Normal telemetry stays quiet; labels are reserved for actionable states. */
    public static boolean showLabel(OverlaySnapshot.FactState state) {
        return state == OverlaySnapshot.FactState.DETECTED
                || state == OverlaySnapshot.FactState.UNKNOWN
                || state == OverlaySnapshot.FactState.STALE
                || state == OverlaySnapshot.FactState.CONFLICTING;
    }

    public static String screenLabel(OverlaySnapshot.Screen screen) {
        switch (screen) {
            case FNAF2_NIGHT:
                return "NIGHT";
            case FNAF2_MENU:
                return "MENU";
            case FNAF2_INTRO:
                return "INTRO";
            case FNAF2_GAME_OVER:
                return "GAME OVER";
            case CUE_HELPER:
                return "HELPER";
            case UNKNOWN:
            default:
                return "WAITING";
        }
    }
}
