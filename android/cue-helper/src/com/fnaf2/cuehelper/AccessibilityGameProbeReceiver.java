package com.fnaf2.cuehelper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;

/** Debug-only shell command bridge that does not create or focus a window. */
public final class AccessibilityGameProbeReceiver extends BroadcastReceiver {
    private static final String TAG = AccessibilityProbeService.TAG;
    private static final String EXTRA_X = "x";
    private static final String EXTRA_Y = "y";
    private static final String EXTRA_DURATION_MS = "durationMs";
    private static final String EXTRA_DELAY_MS = "delayMs";
    private static final String EXTRA_LABEL = "label";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int x = intent.getIntExtra(EXTRA_X, 400);
        int y = intent.getIntExtra(EXTRA_Y, 985);
        long durationMs = Math.max(1L, Math.min(30000L,
                intent.getLongExtra(EXTRA_DURATION_MS, 33L)));
        long delayMs = Math.max(0L, Math.min(30000L,
                intent.getLongExtra(EXTRA_DELAY_MS, 350L)));
        String label = intent.getStringExtra(EXTRA_LABEL);
        if (label == null || label.isEmpty()) label = "game-probe";
        Log.i(TAG, "game-probe-receiver label=" + label
                + " point=" + x + "," + y
                + " durationMs=" + durationMs
                + " delayMs=" + delayMs
                + " uptimeMs=" + SystemClock.uptimeMillis());
        boolean scheduled = AccessibilityProbeService.dispatchSingleAfter(
                label, x, y, durationMs, delayMs);
        Log.i(TAG, "game-probe-receiver-result label=" + label
                + " scheduled=" + scheduled
                + " uptimeMs=" + SystemClock.uptimeMillis());
    }
}
