package com.fnaf2.cuehelper;

/**
 * The Android-side implementation of calibrated camera-rule-v1. A camera
 * selection is reported only when the monitor is already observed UP and
 * exactly one of the twelve fixed map buttons is firmly yellow.
 */
public final class CameraSelectionDetector {
    public static final String SCHEMA = "camera-rule-v1";
    public static final String PROFILE_ID = "moto-g56-v207-landscape";

    public enum State {
        UNKNOWN,
        OBSERVED
    }

    public static final class Result {
        public final State state;
        public final String selectedCamera;
        public final String reason;
        private final String[] highlightedCameras;

        private Result(State state, String selectedCamera, String reason,
                String[] highlightedCameras) {
            this.state = state;
            this.selectedCamera = selectedCamera;
            this.reason = reason;
            this.highlightedCameras = highlightedCameras.clone();
        }

        public boolean observed() {
            return state == State.OBSERVED && selectedCamera != null;
        }

        /** All firmly highlighted map buttons, including a double-camera glitch. */
        public String[] highlightedCameras() {
            return highlightedCameras.clone();
        }
    }

    // threshold and refuse_band from camera-rule-moto-g56-v207.json.
    private static final float[] THRESHOLDS = new float[] {
            88.0f, 87.0f, 87.5f, 87.5f, 87.5f, 88.0f,
            87.5f, 87.5f, 87.5f, 87.5f, 43.5f, 87.0f
    };
    private static final float[] REFUSE_BANDS = new float[] {
            107.0f, 106.0f, 106.5f, 106.5f, 106.5f, 107.0f,
            106.5f, 106.5f, 106.5f, 106.5f, 52.5f, 106.0f
    };

    private CameraSelectionDetector() {
    }

    public static Result measure(PixelWatch.Spec spec, int[] values,
            MonitorStateDetector.Result monitor) {
        Result highlights = measureHighlights(spec, values, monitor);
        if (highlights.state != State.OBSERVED) return highlights;
        if (highlights.highlightedCameras.length != 1) {
            return unknown("multiple-camera-highlight", highlights.highlightedCameras);
        }
        return highlights;
    }

    /**
     * Measure every firmly yellow camera button without requiring exactly one.
     * This is the arming signal for the source-level double-camera glitch:
     * {@code [cam:9, cam:11]} means the marker and viewed feed are both lit.
     */
    public static Result measureHighlights(PixelWatch.Spec spec, int[] values,
            MonitorStateDetector.Result monitor) {
        if (monitor == null || monitor.state != MonitorStateDetector.State.UP) {
            return unknown("monitor-not-up");
        }
        if (spec == null || values == null) return unknown("read-unavailable");

        String[] highlighted = new String[12];
        int highlightedCount = 0;
        for (int button = 0; button < 12; button++) {
            int cameraNumber = button + 1;
            String cameraName = PixelWatch.cameraButtonName(cameraNumber);
            int index = spec.indexOfName(cameraName);
            if (index < 0 || index >= values.length) return unknown("sensor-mismatch");
            PixelWatch.Entry entry = spec.entry(index);
            if (!PixelWatch.isCanonicalCameraButton(entry, cameraNumber)) {
                return unknown("sensor-mismatch");
            }
            int raw = values[index];
            if (raw == PixelWatch.UNKNOWN) return unknown("read-unavailable");

            float upBoundary = THRESHOLDS[button] + REFUSE_BANDS[button];
            float downBoundary = THRESHOLDS[button] - REFUSE_BANDS[button];
            if (raw >= upBoundary) {
                highlighted[highlightedCount++] = cameraControl(button + 1);
            } else if (raw > downBoundary) {
                return unknown("ambiguous-threshold");
            }
        }
        if (highlightedCount == 0) return unknown("no-camera-highlight");
        String[] cameras = new String[highlightedCount];
        System.arraycopy(highlighted, 0, cameras, 0, highlightedCount);
        return new Result(State.OBSERVED,
                highlightedCount == 1 ? cameras[0] : null,
                highlightedCount == 1 ? "single-camera-highlight"
                        : "multiple-camera-highlight", cameras);
    }

    private static Result unknown(String reason) {
        return unknown(reason, new String[0]);
    }

    private static Result unknown(String reason, String[] highlightedCameras) {
        return new Result(State.UNKNOWN, null, reason, highlightedCameras);
    }

    public static String cameraControl(int cameraNumber) {
        if (cameraNumber < 1 || cameraNumber > 12) return null;
        return "cam:" + cameraNumber;
    }
}
