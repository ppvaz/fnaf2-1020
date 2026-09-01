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

        private Result(State state, String selectedCamera, String reason) {
            this.state = state;
            this.selectedCamera = selectedCamera;
            this.reason = reason;
        }

        public boolean observed() {
            return state == State.OBSERVED && selectedCamera != null;
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
        if (monitor == null || monitor.state != MonitorStateDetector.State.UP) {
            return unknown("monitor-not-up");
        }
        if (spec == null || values == null) return unknown("read-unavailable");

        String selected = null;
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
                if (selected != null) return unknown("multiple-camera-highlight");
                selected = cameraControl(button + 1);
            } else if (raw > downBoundary) {
                return unknown("ambiguous-threshold");
            }
        }
        return selected == null
                ? unknown("no-camera-highlight")
                : new Result(State.OBSERVED, selected, "single-camera-highlight");
    }

    private static Result unknown(String reason) {
        return new Result(State.UNKNOWN, null, reason);
    }

    public static String cameraControl(int cameraNumber) {
        if (cameraNumber < 1 || cameraNumber > 12) return null;
        return "cam:" + cameraNumber;
    }
}
