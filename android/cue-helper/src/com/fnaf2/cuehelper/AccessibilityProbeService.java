package com.fnaf2.cuehelper;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

/**
 * Deliberately narrow actuator probe. It is not part of the game controller:
 * it records framework dispatch/finish timing for a foreground probe surface.
 */
public final class AccessibilityProbeService extends AccessibilityService {
    static final String TAG = "CueA11yProbe";
    private static volatile AccessibilityProbeService active;
    private final Handler callbackHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        active = this;
        Log.i(TAG, "service-connected package=" + getPackageName()
                + " canPerformGestures="
                + ((getServiceInfo() != null) && getServiceInfo().getCapabilities() != 0));
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        Log.i(TAG, "accessibility-event type=" + event.getEventType()
                + " package=" + event.getPackageName());
    }

    @Override
    public void onInterrupt() {
        Log.i(TAG, "service-interrupt");
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        if (active == this) active = null;
        Log.i(TAG, "service-unbound");
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        if (active == this) active = null;
        Log.i(TAG, "service-destroyed");
        super.onDestroy();
    }

    static boolean dispatch(String label, GestureDescription gesture) {
        AccessibilityProbeService service = active;
        long callStart = SystemClock.uptimeMillis();
        if (service == null) {
            Log.e(TAG, "dispatch label=" + label + " accepted=false reason=service-not-connected");
            return false;
        }
        boolean accepted = service.dispatchGesture(gesture, new GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription completedGesture) {
                Log.i(TAG, "gesture-result label=" + label + " result=completed"
                        + " atUptimeMs=" + SystemClock.uptimeMillis());
            }

            @Override
            public void onCancelled(GestureDescription cancelledGesture) {
                Log.i(TAG, "gesture-result label=" + label + " result=cancelled"
                        + " atUptimeMs=" + SystemClock.uptimeMillis());
            }
        }, service.callbackHandler);
        long returned = SystemClock.uptimeMillis();
        Log.i(TAG, "dispatch label=" + label + " accepted=" + accepted
                + " callStartUptimeMs=" + callStart
                + " returnedUptimeMs=" + returned
                + " callElapsedMs=" + (returned - callStart));
        return accepted;
    }
}
