package com.fnaf2.cuehelper;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.Gravity;
import android.view.Surface;
import android.view.WindowManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Owns the single permission-gated, non-interactive overlay window. */
public final class OverlayController {
    public static final String PREFS = "overlay";
    public static final String PREF_ENABLED = "enabled";
    public static final String PREF_MODE = "mode";
    private static final long IDENTITY_LOSS_GRACE_NS = 250_000_000L;

    public interface Listener {
        void onOverlayStateChanged(String state);
    }

    private final Context context;
    private final WindowManager windowManager;
    private final DisplayManager displayManager;
    private final SharedPreferences preferences;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final OverlayGeometry.Contract contract = OverlayGeometry.defaultContract();
    private final Listener listener;
    private final OverlayMetrics metrics = new OverlayMetrics();
    private static final int NO_PENDING_IDENTITY = Integer.MIN_VALUE;
    private final Object mainQueueLock = new Object();
    private int pendingCapturedIdentity = NO_PENDING_IDENTITY;
    private boolean capturedIdentityDispatchQueued;
    private OverlayView pendingSnapshotView;
    private OverlaySnapshot pendingSnapshot;
    private boolean snapshotDispatchQueued;
    private final Runnable capturedIdentityDispatch = this::drainCapturedIdentity;
    private final Runnable snapshotDispatch = this::drainSnapshot;
    private final DisplayManager.DisplayListener displayListener =
            new DisplayManager.DisplayListener() {
                @Override
                public void onDisplayAdded(int displayId) {
                }

                @Override
                public void onDisplayRemoved(int displayId) {
                    if (displayId == defaultDisplayId()) {
                        detach(null);
                        emit("UNAVAILABLE(display-removed)");
                    }
                }

                @Override
                public void onDisplayChanged(int displayId) {
                    if (displayId == defaultDisplayId()) {
                        boolean restore = captureActive && (enabled() || qualificationProbe)
                                && (captureGate.qualified || qualificationProbe)
                                && permissionGranted()
                                && targetVisibility != 0 && capturedRecognizedIdentity;
                        detach(null);
                        emit("UNAVAILABLE(display-changed)");
                        if (restore) {
                            // Rotation/insets are not stable during the display
                            // callback. Rebuild the transform after the platform
                            // has published the new display metrics.
                            mainHandler.post(() -> {
                                if (captureActive && (enabled() || qualificationProbe)
                                        && (captureGate.qualified || qualificationProbe)
                                        && permissionGranted()
                                        && targetVisibility != 0 && capturedRecognizedIdentity) {
                                    attachIfAllowed();
                                }
                            });
                        }
                    }
                }
            };

    private volatile OverlayView view;
    private volatile boolean windowAttached;
    private WindowManager.LayoutParams layoutParams;
    private volatile OverlaySnapshot.Mode mode;
    private volatile boolean qualificationProbe;
    private volatile OverlaySnapshot latestDecisionSnapshot;
    private volatile OverlayCaptureGate captureGate = OverlayCaptureGate.unqualified(
            contract.profileId);
    private volatile boolean captureActive;
    private volatile int targetVisibility = -1;
    /** Last positively identified game/lifecycle frame; UNKNOWN gets a short grace. */
    private volatile boolean capturedRecognizedIdentity;
    private volatile long lastRecognizedIdentityNs;
    private final Runnable identityLossRunnable = this::finishIdentityLoss;
    private int captureWidth = PixelWatch.NATIVE_WIDTH;
    private int captureHeight = PixelWatch.NATIVE_HEIGHT;
    private int insetLeft;
    private int insetTop;
    private int insetRight;
    private int insetBottom;
    private boolean displayListenerRegistered;
    private volatile String state;

    public OverlayController(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        windowManager = this.context.getSystemService(WindowManager.class);
        displayManager = this.context.getSystemService(DisplayManager.class);
        preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        mode = "run".equals(preferences.getString(PREF_MODE, "debug"))
                ? OverlaySnapshot.Mode.DECISION_RUN
                : OverlaySnapshot.Mode.SENSOR_DEBUG;
        captureGate = loadQualificationRecord();
        state = permissionGranted() ? "READY" : "DISABLED(permission)";
    }

    public OverlayGeometry.Contract contract() {
        return contract;
    }

    public OverlaySnapshot.Mode mode() {
        return mode;
    }

    public String status() {
        return "overlay=" + state + " gate=" + captureGate.status()
                + " " + metrics.status();
    }

    public boolean enabled() {
        return preferences.getBoolean(PREF_ENABLED, false);
    }

    /** Whether the capture thread needs to feed identity into this controller. */
    public boolean needsCapturedIdentity() {
        return enabled() || qualificationProbe;
    }

    /**
     * Start an explicit debug-only sensor renderer probe for P5 evidence.
     * This is not a qualification bypass: it cannot render decision cues and
     * never writes the reviewed qualification sidecar.
     */
    public void startQualificationProbe() {
        if ((context.getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            qualificationProbe = false;
            emit("ERROR(probe-release-build)");
            return;
        }
        if (!permissionGranted()) {
            qualificationProbe = false;
            detach(null);
            emit("DISABLED(permission)");
            return;
        }
        qualificationProbe = true;
        mode = OverlaySnapshot.Mode.SENSOR_DEBUG;
        preferences.edit().putString(PREF_MODE, "debug").apply();
        latestDecisionSnapshot = null;
        if (captureActive) {
            attachIfAllowed();
        } else {
            emit("READY");
        }
    }

    public void stopQualificationProbe() {
        qualificationProbe = false;
        latestDecisionSnapshot = null;
        if (captureActive) {
            if (captureGate.qualified && enabled()) {
                attachIfAllowed();
            } else {
                detach("self-capture-unqualified");
            }
        } else {
            emit(permissionGranted() ? "READY" : "DISABLED(permission)");
        }
    }

    public boolean wantsDebugSamples() {
        // Keep native identity-rescue samples alive during the debug probe's
        // short hidden interval; otherwise a detached window cannot observe
        // the persistent bottom controls needed to reattach itself.
        return mode == OverlaySnapshot.Mode.SENSOR_DEBUG
                && ((windowAttached && view != null) || qualificationProbe);
    }

    public boolean visible() {
        if (windowAttached && !permissionGranted()) {
            detach(null);
            emit("DISABLED(permission)");
            return false;
        }
        return windowAttached && view != null;
    }

    public void setMode(OverlaySnapshot.Mode mode) {
        if (mode == null) throw new IllegalArgumentException("overlay mode is null");
        if (qualificationProbe && mode == OverlaySnapshot.Mode.DECISION_RUN) {
            mode = OverlaySnapshot.Mode.SENSOR_DEBUG;
        }
        if (this.mode != mode) latestDecisionSnapshot = null;
        this.mode = mode;
        preferences.edit().putString(PREF_MODE,
                mode == OverlaySnapshot.Mode.DECISION_RUN ? "run" : "debug").apply();
        OverlayView current = view;
        if (current != null && windowAttached) {
            OverlaySnapshot next = mode == OverlaySnapshot.Mode.DECISION_RUN
                    ? latestDecisionSnapshot : null;
            updateViewSnapshot(current, next == null
                    ? OverlaySnapshot.empty(0L, System.nanoTime(), mode) : next);
        }
        emit(state);
    }

    /** Called only by a retained qualification harness, never by raw capture. */
    public void setCaptureGate(OverlayCaptureGate gate) {
        if (gate == null || !contract.profileId.equals(gate.profileId)
                || !gate.qualified
                || !targetBuildMatches(gate.targetPackage, gate.targetBuild)) {
            captureGate = OverlayCaptureGate.unqualified(contract.profileId);
        } else {
            captureGate = gate;
        }
        if (captureActive) {
            if (captureGate.qualified || qualificationProbe) attachIfAllowed();
            else detach("self-capture-unqualified");
        }
    }

    public void enable() {
        preferences.edit().putBoolean(PREF_ENABLED, true).apply();
        if (!permissionGranted()) {
            detach(null);
            emit("DISABLED(permission)");
            return;
        }
        if (captureActive && !captureGate.qualified && !qualificationProbe) {
            emit("DISABLED(self-capture-unqualified)");
        } else if (captureActive) {
            attachIfAllowed();
        } else {
            emit("READY");
        }
    }

    public void disable() {
        preferences.edit().putBoolean(PREF_ENABLED, false).apply();
        qualificationProbe = false;
        latestDecisionSnapshot = null;
        detach(null);
        emit(permissionGranted() ? "READY" : "DISABLED(permission)");
    }

    public void onCaptureStarted(int width, int height) {
        captureActive = true;
        capturedRecognizedIdentity = false;
        lastRecognizedIdentityNs = 0L;
        mainHandler.removeCallbacks(identityLossRunnable);
        metrics.reset();
        latestDecisionSnapshot = null;
        captureWidth = width;
        captureHeight = height;
        targetVisibility = -1;
        if (!enabled() && !qualificationProbe) {
            emit(permissionGranted() ? "READY" : "DISABLED(permission)");
        } else if (!permissionGranted()) {
            detach(null);
            emit("DISABLED(permission)");
        } else if (!captureGate.qualified && !qualificationProbe) {
            detach("self-capture-unqualified");
        } else {
            // Wait for a positive captured game identity before creating the
            // window. This avoids a helper/foreign frame briefly showing a HUD.
            emit("READY");
        }
    }

    public void onCaptureResized(int width, int height) {
        if (width < 1 || height < 1) return;
        captureWidth = width;
        captureHeight = height;
        if (view != null && windowAttached) {
            OverlayView current = view;
            if (!isMainThread()) {
                mainHandler.post(() -> {
                    if (windowAttached && view == current) {
                        current.setTransform(currentTransform());
                    }
                });
            } else {
                current.setTransform(currentTransform());
            }
        }
    }

    public void onTargetVisibilityChanged(int visibility) {
        if (!isMainThread()) {
            mainHandler.post(() -> onTargetVisibilityChanged(visibility));
            return;
        }
        targetVisibility = visibility;
        if (!captureActive || (!enabled() && !qualificationProbe)) return;
        if (visibility == 0) {
            capturedRecognizedIdentity = false;
            lastRecognizedIdentityNs = 0L;
            mainHandler.removeCallbacks(identityLossRunnable);
            detach(null);
            emit("UNAVAILABLE(target-hidden) state=HIDDEN");
        } else if (visibility == 1) {
            if (capturedRecognizedIdentity) attachIfAllowed();
        }
    }

    /**
     * Full-display MediaProjection reports content visibility, not the
     * foreground package. Keep the HUD fail-closed until the captured frame
     * itself positively identifies a supported FNaF 2 screen.
     */
    public void onCapturedScreenIdentity(int identity) {
        if (!isMainThread()) {
            synchronized (mainQueueLock) {
                pendingCapturedIdentity = identity;
                if (capturedIdentityDispatchQueued) return;
                capturedIdentityDispatchQueued = true;
            }
            mainHandler.post(capturedIdentityDispatch);
            return;
        }
        if (!captureActive || (!enabled() && !qualificationProbe)) return;
        if (ScreenIdentity.isRecognizedGameScreen(identity)) {
            capturedRecognizedIdentity = true;
            lastRecognizedIdentityNs = System.nanoTime();
            mainHandler.removeCallbacks(identityLossRunnable);
            if (identity != ScreenIdentity.FNAF2_NIGHT) {
                // A previous run-mode cue must not survive a transition to a
                // lifecycle screen while the window remains attached.
                latestDecisionSnapshot = null;
                OverlayView current = view;
                if (current != null && windowAttached) {
                    updateViewSnapshot(current, OverlaySnapshot.empty(
                            0L, System.nanoTime(), mode));
                }
            }
            attachIfAllowed();
        } else if (identity == ScreenIdentity.UNKNOWN) {
            // Point-sampled identity can miss a stable game frame for a few
            // callbacks. Keep the already-qualified window alive briefly, but
            // never restore it after the grace without another positive frame.
            if (capturedRecognizedIdentity && windowAttached) {
                mainHandler.removeCallbacks(identityLossRunnable);
                mainHandler.postDelayed(identityLossRunnable,
                        IDENTITY_LOSS_GRACE_NS / 1_000_000L);
            }
        } else {
            capturedRecognizedIdentity = false;
            lastRecognizedIdentityNs = 0L;
            mainHandler.removeCallbacks(identityLossRunnable);
            if (windowAttached) detach(null);
            emit("UNAVAILABLE(target-not-game) state=HIDDEN");
        }
    }

    private void drainCapturedIdentity() {
        if (!isMainThread()) {
            mainHandler.post(capturedIdentityDispatch);
            return;
        }
        int identity;
        synchronized (mainQueueLock) {
            identity = pendingCapturedIdentity;
            pendingCapturedIdentity = NO_PENDING_IDENTITY;
            capturedIdentityDispatchQueued = false;
        }
        if (identity != NO_PENDING_IDENTITY) {
            onCapturedScreenIdentity(identity);
        }
        boolean repost;
        synchronized (mainQueueLock) {
            repost = pendingCapturedIdentity != NO_PENDING_IDENTITY
                    && !capturedIdentityDispatchQueued;
            if (repost) capturedIdentityDispatchQueued = true;
        }
        if (repost) mainHandler.post(capturedIdentityDispatch);
    }

    public void onCaptureStopped() {
        captureActive = false;
        capturedRecognizedIdentity = false;
        lastRecognizedIdentityNs = 0L;
        mainHandler.removeCallbacks(identityLossRunnable);
        clearPendingMainWork();
        qualificationProbe = false;
        latestDecisionSnapshot = null;
        targetVisibility = -1;
        detach(null);
        emit(enabled() && permissionGranted() ? "READY"
                : permissionGranted() ? "READY" : "DISABLED(permission)");
    }

    public void destroy() {
        captureActive = false;
        capturedRecognizedIdentity = false;
        lastRecognizedIdentityNs = 0L;
        mainHandler.removeCallbacks(identityLossRunnable);
        clearPendingMainWork();
        qualificationProbe = false;
        detach(null);
        emit(permissionGranted() ? "READY" : "DISABLED(permission)");
    }

    public void publishSensorSnapshot(OverlaySnapshot snapshot) {
        if (snapshot == null) return;
        if (snapshot.mode != OverlaySnapshot.Mode.SENSOR_DEBUG
                || mode != OverlaySnapshot.Mode.SENSOR_DEBUG
                || !captureActive || !windowAttached) return;
        metrics.onSnapshot(snapshot.sequence, System.nanoTime());
        OverlayView current = view;
        updateViewSnapshot(current, snapshot);
    }

    /** Accept only a validated snapshot from the fused belief/decision producer. */
    public void publishDecisionSnapshot(OverlaySnapshot snapshot) {
        if (snapshot == null || snapshot.mode != OverlaySnapshot.Mode.DECISION_RUN
                || !captureActive || !captureGate.qualified) return;
        OverlaySnapshot previous = latestDecisionSnapshot;
        if (previous != null && snapshot.sequence <= previous.sequence) return;
        latestDecisionSnapshot = snapshot;
        if (mode != OverlaySnapshot.Mode.DECISION_RUN) return;
        metrics.onSnapshot(snapshot.sequence, System.nanoTime());
        OverlayView current = view;
        updateViewSnapshot(current, snapshot);
    }

    /** Compatibility entry point that cannot promote a sensor fact to a cue. */
    public void publish(OverlaySnapshot snapshot) {
        if (snapshot == null) return;
        if (snapshot.mode == OverlaySnapshot.Mode.DECISION_RUN) {
            publishDecisionSnapshot(snapshot);
        } else {
            publishSensorSnapshot(snapshot);
        }
    }

    private void attachIfAllowed() {
        if (!isMainThread()) {
            mainHandler.post(this::attachIfAllowed);
            return;
        }
        if (!captureActive) {
            detach(null);
            emit(permissionGranted() ? "READY" : "DISABLED(permission)");
            return;
        }
        if ((!enabled() && !qualificationProbe) || !permissionGranted()) {
            emit(permissionGranted() ? "READY" : "DISABLED(permission)");
            return;
        }
        if (!capturedRecognizedIdentity) {
            if (windowAttached) detach(null);
            return;
        }
        if (!captureGate.qualified && !qualificationProbe) {
            detach("self-capture-unqualified");
            return;
        }
        if (targetVisibility == 0) {
            detach(null);
            emit("UNAVAILABLE(target-hidden) state=HIDDEN");
            return;
        }
        if (view != null) {
            String nextState = targetVisibility == 0
                    ? "UNAVAILABLE(target-hidden) state=HIDDEN"
                    : qualificationProbe ? "PROBE" : "VISIBLE";
            if (!nextState.equals(state)) emit(nextState);
            return;
        }
        if (windowManager == null) {
            emit("ERROR(window-manager-unavailable)");
            return;
        }
        boolean windowAdded = false;
        try {
            OverlayGeometry.Transform transform = currentTransform();
            view = new OverlayView(context, contract, transform, metrics::onRendered,
                    this::onWindowVisibilityChanged, OverlayGeometry.defaultHudMap());
            view.setSnapshot(latestDecisionSnapshot != null
                    && mode == OverlaySnapshot.Mode.DECISION_RUN
                    ? latestDecisionSnapshot
                    : OverlaySnapshot.empty(0L, System.nanoTime(), mode));
            view.setOnApplyWindowInsetsListener((ignored, insets) -> {
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets safe = insets.getInsets(
                            android.view.WindowInsets.Type.systemBars()
                                    | android.view.WindowInsets.Type.displayCutout());
                    updateDisplayInsets(safe.left, safe.top, safe.right, safe.bottom);
                }
                return insets;
            });
            layoutParams = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            layoutParams.gravity = Gravity.TOP | Gravity.START;
            if (Build.VERSION.SDK_INT >= 30) {
                // This overlay is drawn in the same edge-to-edge landscape
                // buffer as MediaProjection. The default application-overlay
                // policy fits system insets first. On this Moto g56 the
                // landscape camera cutout then shrinks the view to 2285 px
                // and places it at x=115. That is a WindowManager coordinate
                // translation, not game content geometry; opt out so the
                // canvas is 2400x1080 at 0,0.
                layoutParams.setFitInsetsTypes(0);
            }
            if (Build.VERSION.SDK_INT >= 28) {
                // The game itself is already rendered through the cutout and
                // MediaProjection captures those pixels, so the overlay must
                // share that edge-to-edge coordinate space.
                layoutParams.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            }
            layoutParams.alpha = touchThroughAlpha();
            layoutParams.packageName = context.getPackageName();
            layoutParams.setTitle("FNaF 2 Cue Helper HUD");
            windowManager.addView(view, layoutParams);
            windowAdded = true;
            windowAttached = true;
            view.post(view::requestApplyInsets);
            registerDisplayListener();
            emit(targetVisibility == 0
                    ? "UNAVAILABLE(target-hidden) state=HIDDEN"
                    : qualificationProbe ? "PROBE" : "VISIBLE");
        } catch (SecurityException error) {
            Log.e("FnafCueHelper", "overlay attach denied", error);
            if (windowAdded) removeAttachedView();
            unregisterDisplayListener();
            windowAttached = false;
            view = null;
            layoutParams = null;
            emit("ERROR(permission-revoked)");
        } catch (RuntimeException error) {
            Log.e("FnafCueHelper", "overlay attach failed", error);
            if (windowAdded) removeAttachedView();
            unregisterDisplayListener();
            windowAttached = false;
            view = null;
            layoutParams = null;
            emit("ERROR(" + error.getClass().getSimpleName() + ")");
        }
    }

    private void detach(String reason) {
        if (!isMainThread()) {
            mainHandler.post(() -> detach(reason));
            return;
        }
        OverlayView current = view;
        windowAttached = false;
        view = null;
        layoutParams = null;
        synchronized (mainQueueLock) {
            pendingSnapshotView = null;
            pendingSnapshot = null;
        }
        // A detached window must never resurrect an old imperative cue after
        // target hiding, permission/display loss, or any other lifecycle gap.
        latestDecisionSnapshot = null;
        if (current != null && windowManager != null) {
            try {
                windowManager.removeViewImmediate(current);
            } catch (RuntimeException ignored) {
                // Teardown is idempotent if WindowManager already detached it.
            }
        }
        unregisterDisplayListener();
        if (reason != null) {
            emit("DISABLED(" + reason + ")");
        }
    }

    private void removeAttachedView() {
        if (view == null || windowManager == null) return;
        try {
            windowManager.removeViewImmediate(view);
        } catch (RuntimeException ignored) {
            // The add may have been rejected after partial registration.
        }
    }

    private OverlayCaptureGate loadQualificationRecord() {
        File record = new File(context.getFilesDir(),
                "overlay-qualification.properties");
        if (!record.isFile() || record.length() <= 0L || record.length() > 8_192L) {
            return OverlayCaptureGate.unqualified(contract.profileId);
        }
        byte[] bytes = new byte[(int) record.length()];
        try (FileInputStream input = new FileInputStream(record)) {
            int offset = 0;
            while (offset < bytes.length) {
                int read = input.read(bytes, offset, bytes.length - offset);
                if (read < 0) break;
                offset += read;
            }
            if (offset != bytes.length) {
                return OverlayCaptureGate.unqualified(contract.profileId);
            }
            OverlayCaptureGate loaded = OverlayCaptureGate.fromRecord(
                    new String(bytes, StandardCharsets.US_ASCII));
            return contract.profileId.equals(loaded.profileId) && loaded.qualified
                    && targetBuildMatches(loaded.targetPackage, loaded.targetBuild)
                    ? loaded : OverlayCaptureGate.unqualified(contract.profileId);
        } catch (IOException | RuntimeException error) {
            return OverlayCaptureGate.unqualified(contract.profileId);
        }
    }

    private boolean targetBuildMatches(String targetPackage, String targetBuild) {
        if (!"com.scottgames.fnaf2".equals(targetPackage)
                || targetBuild == null || targetBuild.isEmpty()) return false;
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(
                    targetPackage, 0);
            String versionName = info.versionName == null ? "" : info.versionName;
            return (info.getLongVersionCode() + ":" + versionName).equals(targetBuild);
        } catch (PackageManager.NameNotFoundException | RuntimeException error) {
            return false;
        }
    }

    private OverlayGeometry.Transform currentTransform() {
        // The service deliberately keeps an application context. On Android
        // 12+ Context#getDisplay() throws for that context rather than
        // returning null, so use the WindowManager's physical default display
        // first and only query a visual context when one is actually present.
        Display display = windowManager == null ? null : windowManager.getDefaultDisplay();
        if (display == null && Build.VERSION.SDK_INT >= 30) {
            try {
                display = context.getDisplay();
            } catch (UnsupportedOperationException ignored) {
                // Application contexts are not associated with a display.
            }
        }
        DisplayMetrics metrics = new DisplayMetrics();
        if (display != null) display.getRealMetrics(metrics);
        int width = metrics.widthPixels > 0 ? metrics.widthPixels : captureWidth;
        int height = metrics.heightPixels > 0 ? metrics.heightPixels : captureHeight;
        OverlayGeometry.Rotation rotation = OverlayGeometry.Rotation.ROTATION_0;
        if (display != null) {
            switch (display.getRotation()) {
                case Surface.ROTATION_90:
                    rotation = OverlayGeometry.Rotation.ROTATION_90;
                    break;
                case Surface.ROTATION_180:
                    rotation = OverlayGeometry.Rotation.ROTATION_180;
                    break;
                case Surface.ROTATION_270:
                    rotation = OverlayGeometry.Rotation.ROTATION_270;
                    break;
                default:
                    break;
            }
        }
        rotation = OverlayGeometry.resolveContentRotation(width, height,
                captureWidth, captureHeight, rotation);
        // FNaF2 renders edge-to-edge into the same full-display 2400x1080
        // surface that MediaProjection captures. System-bar insets describe
        // safe touch/content areas, not a translation of the game pixels; do
        // not apply them or every ROI shifts into its neighbour.
        return new OverlayGeometry.Transform(contract.profileId,
                new OverlayGeometry.Viewport(0, 0, captureWidth, captureHeight,
                        OverlayGeometry.Rotation.ROTATION_0),
                new OverlayGeometry.Viewport(0, 0, width, height, rotation));
    }

    private void updateDisplayInsets(int left, int top, int right, int bottom) {
        insetLeft = Math.max(0, left);
        insetTop = Math.max(0, top);
        insetRight = Math.max(0, right);
        insetBottom = Math.max(0, bottom);
        if (view != null) view.setTransform(currentTransform());
    }

    private void updateViewSnapshot(OverlayView target, OverlaySnapshot snapshot) {
        if (target == null || snapshot == null) return;
        if (!isMainThread()) {
            synchronized (mainQueueLock) {
                pendingSnapshotView = target;
                pendingSnapshot = snapshot;
                if (snapshotDispatchQueued) return;
                snapshotDispatchQueued = true;
            }
            mainHandler.post(snapshotDispatch);
            return;
        }
        if (windowAttached && view == target) {
            target.setSnapshot(snapshot);
        }
    }

    private void drainSnapshot() {
        if (!isMainThread()) {
            mainHandler.post(snapshotDispatch);
            return;
        }
        OverlayView target;
        OverlaySnapshot snapshot;
        synchronized (mainQueueLock) {
            target = pendingSnapshotView;
            snapshot = pendingSnapshot;
            pendingSnapshotView = null;
            pendingSnapshot = null;
            snapshotDispatchQueued = false;
        }
        if (target != null && snapshot != null
                && windowAttached && view == target) {
            target.setSnapshot(snapshot);
        }
        boolean repost;
        synchronized (mainQueueLock) {
            repost = pendingSnapshot != null && !snapshotDispatchQueued;
            if (repost) snapshotDispatchQueued = true;
        }
        if (repost) mainHandler.post(snapshotDispatch);
    }

    private void clearPendingMainWork() {
        mainHandler.removeCallbacks(capturedIdentityDispatch);
        mainHandler.removeCallbacks(snapshotDispatch);
        synchronized (mainQueueLock) {
            pendingCapturedIdentity = NO_PENDING_IDENTITY;
            capturedIdentityDispatchQueued = false;
            pendingSnapshotView = null;
            pendingSnapshot = null;
            snapshotDispatchQueued = false;
        }
    }

    private boolean isMainThread() {
        return Looper.myLooper() == Looper.getMainLooper();
    }

    private void onWindowVisibilityChanged(boolean visible) {
        if (visible || !windowAttached || !captureActive || view == null) return;
        if (!permissionGranted()) {
            detach(null);
            emit("DISABLED(permission)");
            return;
        }
        // This is also the detection path for an Android 12+ target that
        // suppresses application overlays while remaining the capture target.
        capturedRecognizedIdentity = false;
        lastRecognizedIdentityNs = 0L;
        mainHandler.removeCallbacks(identityLossRunnable);
        detach(null);
        emit("UNAVAILABLE(target-hidden) state=HIDDEN");
    }

    private void finishIdentityLoss() {
        if (!isMainThread()) {
            mainHandler.post(this::finishIdentityLoss);
            return;
        }
        if (!captureActive || !capturedRecognizedIdentity
                || lastRecognizedIdentityNs == 0L) return;
        if (System.nanoTime() - lastRecognizedIdentityNs < IDENTITY_LOSS_GRACE_NS) {
            mainHandler.postDelayed(identityLossRunnable,
                    IDENTITY_LOSS_GRACE_NS / 1_000_000L);
            return;
        }
        capturedRecognizedIdentity = false;
        lastRecognizedIdentityNs = 0L;
        detach(null);
        emit("UNAVAILABLE(target-not-game) state=HIDDEN");
    }

    private float touchThroughAlpha() {
        float maximum = .8f;
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                InputManager input = context.getSystemService(InputManager.class);
                if (input != null) maximum = input.getMaximumObscuringOpacityForTouch();
            } catch (RuntimeException ignored) {
                // Keep the conservative known platform maximum.
            }
        }
        return Math.max(.05f, Math.min(.75f, maximum - .05f));
    }

    private boolean permissionGranted() {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(context);
    }

    private int defaultDisplayId() {
        // The service deliberately owns an application context, which is not
        // associated with a display on Android 12+. The WindowManager display
        // is the stable source for display-listener comparisons.
        Display display = windowManager == null ? null : windowManager.getDefaultDisplay();
        if (display == null && Build.VERSION.SDK_INT >= 30) {
            try {
                display = context.getDisplay();
            } catch (UnsupportedOperationException ignored) {
                // Application contexts are not associated with a display.
            }
        }
        return display == null ? Display.DEFAULT_DISPLAY : display.getDisplayId();
    }

    private void registerDisplayListener() {
        if (displayListenerRegistered || displayManager == null) return;
        displayManager.registerDisplayListener(displayListener, null);
        displayListenerRegistered = true;
    }

    private void unregisterDisplayListener() {
        if (!displayListenerRegistered || displayManager == null) return;
        displayManager.unregisterDisplayListener(displayListener);
        displayListenerRegistered = false;
    }

    private void emit(String next) {
        state = next;
        if (listener != null) listener.onOverlayStateChanged(status());
    }
}
