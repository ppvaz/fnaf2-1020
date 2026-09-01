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
            return true;
        }
        return false;
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
            case CUE_HELPER:
                return "HELPER";
            case UNKNOWN:
            default:
                return "WAITING";
        }
    }
}
