package com.fnaf2.cuehelper;

import android.app.Activity;
import android.accessibilityservice.GestureDescription;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

/** Foreground target surface for the AccessibilityService versus UHID probe. */
public final class AccessibilityProbeActivity extends Activity {
    static final String TAG = AccessibilityProbeService.TAG;
    static final String EXTRA_SCENARIO = "scenario";
    static final String EXTRA_COUNT = "count";
    static final String EXTRA_DURATION_MS = "durationMs";
    private static final long START_DELAY_MS = 800L;
    private static final long HOLD_AFTER_PROBE_MS = 1800L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private ProbeView probeView;
    private Runnable launchProbe;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        probeView = new ProbeView();
        setContentView(probeView);
        logDisplay();

        String scenario = getIntent().getStringExtra(EXTRA_SCENARIO);
        if (scenario == null || scenario.isEmpty()) scenario = "single";
        final String selectedScenario = scenario;
        final int selectedCount = Math.max(1, Math.min(1000,
                getIntent().getIntExtra(EXTRA_COUNT, 1)));
        final long selectedDurationMs = Math.max(1L, Math.min(30000L,
                getIntent().getLongExtra(EXTRA_DURATION_MS, 100L)));
        Log.i(TAG, "activity-ready scenario=" + selectedScenario
                + " count=" + selectedCount
                + " durationMs=" + selectedDurationMs
                + " uptimeMs=" + SystemClock.uptimeMillis());
        launchProbe = () -> runScenario(selectedScenario, selectedCount, selectedDurationMs);
        handler.postDelayed(launchProbe, START_DELAY_MS);
    }

    @Override
    protected void onDestroy() {
        if (launchProbe != null) handler.removeCallbacks(launchProbe);
        super.onDestroy();
    }

    private void logDisplay() {
        Display display = getDisplay();
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float refresh = display == null ? Float.NaN : display.getRefreshRate();
        Log.i(TAG, "display widthPx=" + metrics.widthPixels
                + " heightPx=" + metrics.heightPixels
                + " density=" + metrics.density
                + " refreshHz=" + refresh);
    }

    private void runScenario(String scenario, int count, long durationMs) {
        int width = probeView.getWidth();
        int height = probeView.getHeight();
        if (width <= 0 || height <= 0) {
            Log.e(TAG, "scenario=" + scenario + " refused=empty-surface");
            return;
        }
        int y = height / 2;
        int left = Math.max(80, width / 3);
        int right = Math.min(width - 80, (width * 2) / 3);
        Log.i(TAG, "scenario-start name=" + scenario + " surface=" + width + "x" + height
                + " count=" + count + " durationMs=" + durationMs
                + " startUptimeMs=" + SystemClock.uptimeMillis());

        long scenarioDurationMs = 0L;
        switch (scenario) {
            case "single":
                long intervalMs = durationMs + 100L;
                for (int i = 0; i < count; i++) {
                    final int attempt = i;
                    handler.postDelayed(() -> AccessibilityProbeService.dispatch(
                            "single-" + attempt, stroke(left, y, durationMs, 0L)),
                            i * intervalMs);
                }
                scenarioDurationMs = (count - 1L) * intervalMs + durationMs;
                break;
            case "hold":
                AccessibilityProbeService.dispatch("hold", stroke(left, y, durationMs, 0L));
                scenarioDurationMs = durationMs;
                break;
            case "multi":
                AccessibilityProbeService.dispatch("multi", new GestureDescription.Builder()
                        .addStroke(new GestureDescription.StrokeDescription(pathAt(left, y), 0L, 300L))
                        .addStroke(new GestureDescription.StrokeDescription(pathAt(right, y), 0L, 300L))
                        .build());
                break;
            case "stagger":
                AccessibilityProbeService.dispatch("stagger", new GestureDescription.Builder()
                        .addStroke(new GestureDescription.StrokeDescription(pathAt(left, y), 0L, 500L))
                        .addStroke(new GestureDescription.StrokeDescription(pathAt(right, y), 150L, 250L))
                        .build());
                scenarioDurationMs = 500L;
                break;
            case "cancel":
                AccessibilityProbeService.dispatch("cancel-first", stroke(left, y, 1000L, 0L));
                handler.postDelayed(() -> AccessibilityProbeService.dispatch(
                        "cancel-second", stroke(right, y, 100L, 0L)), 120L);
                scenarioDurationMs = 220L;
                break;
            default:
                Log.e(TAG, "scenario=" + scenario + " refused=unknown-scenario");
                return;
        }
        long endDelayMs = HOLD_AFTER_PROBE_MS + scenarioDurationMs;
        handler.postDelayed(() -> Log.i(TAG, "scenario-end name=" + scenario
                + " uptimeMs=" + SystemClock.uptimeMillis()), endDelayMs);
    }

    private static GestureDescription stroke(int x, int y, long duration, long start) {
        return new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(pathAt(x, y), start, duration))
                .build();
    }

    private static Path pathAt(int x, int y) {
        Path path = new Path();
        path.moveTo(x, y);
        return path;
    }

    private final class ProbeView extends View {
        private final Paint background = new Paint();
        private final Paint marker = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int eventSequence;
        private int drawnSequence;
        private int lastAction = MotionEvent.ACTION_CANCEL;
        private int lastFlags;
        private int pointerCount;
        private final float[] pointerX = new float[10];
        private final float[] pointerY = new float[10];

        ProbeView() {
            super(AccessibilityProbeActivity.this);
            setFocusable(true);
            background.setColor(Color.rgb(20, 24, 30));
            marker.setColor(Color.rgb(80, 220, 150));
            text.setColor(Color.WHITE);
            text.setTextSize(32f);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            canvas.drawColor(background.getColor());
            canvas.drawText("Cue Helper input probe", 48f, 72f, text);
            if (drawnSequence != eventSequence) {
                drawnSequence = eventSequence;
                Log.i(TAG, "surface-draw sequence=" + drawnSequence
                        + " action=" + MotionEvent.actionToString(lastAction)
                        + " pointers=" + pointerCount
                        + " atUptimeMs=" + SystemClock.uptimeMillis());
            }
            for (int i = 0; i < pointerCount && i < pointerX.length; i++) {
                canvas.drawCircle(pointerX[i], pointerY[i], 34f, marker);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (event == null) return false;
            lastAction = event.getActionMasked();
            lastFlags = event.getFlags();
            pointerCount = Math.min(pointerX.length, event.getPointerCount());
            for (int i = 0; i < pointerCount; i++) {
                pointerX[i] = event.getX(i);
                pointerY[i] = event.getY(i);
            }
            eventSequence++;
            StringBuilder pointers = new StringBuilder();
            for (int i = 0; i < pointerCount; i++) {
                if (i != 0) pointers.append(';');
                pointers.append(event.getPointerId(i)).append('@')
                        .append(Math.round(event.getX(i))).append(',')
                        .append(Math.round(event.getY(i)));
            }
            Log.i(TAG, "motion sequence=" + eventSequence
                    + " action=" + MotionEvent.actionToString(lastAction)
                    + " actionIndex=" + event.getActionIndex()
                    + " pointers=" + pointerCount
                    + " ids=" + pointers
                    + " eventTimeMs=" + event.getEventTime()
                    + " downTimeMs=" + event.getDownTime()
                    + " receiveUptimeMs=" + SystemClock.uptimeMillis()
                    + " deviceId=" + event.getDeviceId()
                    + " source=0x" + Integer.toHexString(event.getSource())
                    + " flags=0x" + Integer.toHexString(lastFlags)
                    + " accessibilityFlag=" + ((lastFlags & 0x800) != 0));
            invalidate();
            return true;
        }
    }
}
