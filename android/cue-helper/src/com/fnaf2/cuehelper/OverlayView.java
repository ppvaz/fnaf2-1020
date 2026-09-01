package com.fnaf2.cuehelper;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PathEffect;
import android.graphics.DashPathEffect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

import com.fnaf2.cuehelper.OverlayGeometry.PixelRect;

/** One non-interactive, full-display HUD drawing pass. */
public final class OverlayView extends View {
    private static final long REDRAW_INTERVAL_NS = 33_000_000L;
    private static final long STATE_TRANSITION_NS = 220_000_000L;
    private static final long CAMERA_PULSE_NS = 1_600_000_000L;
    private static final int COLOR_MONITORED = Color.rgb(79, 210, 238);
    private static final int COLOR_DETECTED = Color.rgb(87, 220, 110);
    private static final int COLOR_UNKNOWN = Color.rgb(255, 176, 32);
    private static final int COLOR_STALE = Color.rgb(255, 84, 73);
    private static final int COLOR_UNQUALIFIED = Color.rgb(201, 131, 245);
    private static final int COLOR_NIGHT = Color.rgb(83, 226, 190);
    private static final int COLOR_MONITOR_UP = Color.rgb(82, 238, 190);
    private static final int COLOR_MONITOR_DOWN = Color.rgb(174, 131, 255);
    private static final int COLOR_MONITOR_UNKNOWN = Color.rgb(255, 176, 32);
    private static final int COLOR_CAMERA_IDLE = Color.rgb(106, 165, 226);
    private static final int COLOR_CAMERA_SELECTED = Color.rgb(255, 214, 74);
    private static final int COLOR_MENU = Color.rgb(255, 187, 64);
    private static final int COLOR_WAITING = Color.rgb(176, 154, 210);

    private final OverlayGeometry.Contract contract;
    private final RenderListener renderListener;
    private final VisibilityListener visibilityListener;
    private final Paint outline = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final PathEffect dashed = new DashPathEffect(new float[]{8f, 6f}, 0f);
    private final OverlaySnapshotRetention snapshotRetention =
            new OverlaySnapshotRetention();
    private volatile OverlaySnapshot snapshot = OverlaySnapshot.empty(
            0L, System.nanoTime(), OverlaySnapshot.Mode.SENSOR_DEBUG);
    private volatile OverlayGeometry.Transform transform;
    private volatile OverlayGeometry.HudMap hudMap;
    private volatile long lastInvalidateNs;
    private OverlaySnapshot.MonitorState transitionFromMonitor =
            OverlaySnapshot.MonitorState.UNKNOWN;
    private OverlaySnapshot.MonitorState transitionToMonitor =
            OverlaySnapshot.MonitorState.UNKNOWN;
    private long monitorTransitionStartNs;
    private long selectedCameraTransitionStartNs;
    private final Runnable expiryRunnable = this::onExpiry;
    private final Runnable retentionExpiryRunnable = this::onRetentionExpiry;

    public interface RenderListener {
        void onRendered(long sequence, long nowNs);
    }

    public interface VisibilityListener {
        void onWindowVisibilityChanged(boolean visible);
    }

    public OverlayView(Context context, OverlayGeometry.Contract contract,
            OverlayGeometry.Transform transform) {
        this(context, contract, transform, null, null, null);
    }

    public OverlayView(Context context, OverlayGeometry.Contract contract,
            OverlayGeometry.Transform transform, RenderListener renderListener) {
        this(context, contract, transform, renderListener, null, null);
    }

    public OverlayView(Context context, OverlayGeometry.Contract contract,
            OverlayGeometry.Transform transform, RenderListener renderListener,
            VisibilityListener visibilityListener) {
        this(context, contract, transform, renderListener, visibilityListener, null);
    }

    public OverlayView(Context context, OverlayGeometry.Contract contract,
            OverlayGeometry.Transform transform, RenderListener renderListener,
            VisibilityListener visibilityListener, OverlayGeometry.HudMap hudMap) {
        super(context);
        if (contract == null || transform == null) {
            throw new IllegalArgumentException("overlay geometry is required");
        }
        this.contract = contract;
        this.renderListener = renderListener;
        this.visibilityListener = visibilityListener;
        this.transform = transform;
        this.hudMap = hudMap == null ? OverlayGeometry.defaultHudMap() : hudMap;
        setFocusable(false);
        setFocusableInTouchMode(false);
        setClickable(false);
        setLongClickable(false);
        setWillNotDraw(false);
        outline.setStyle(Paint.Style.STROKE);
        outline.setStrokeWidth(2f);
        fill.setStyle(Paint.Style.FILL);
        text.setStyle(Paint.Style.FILL);
        text.setTypeface(loadHudTypeface(context));
        text.setTextSize(24f);
        text.setFakeBoldText(false);
        setContentDescription("FNaF 2 read-only cue helper overlay");
    }

    public void setTransform(OverlayGeometry.Transform transform) {
        if (transform == null) throw new IllegalArgumentException("transform is null");
        this.transform = transform;
        invalidateNow();
    }

    /** Replace the profile-bound game-HUD collision map after calibration. */
    public void setHudMap(OverlayGeometry.HudMap hudMap) {
        if (hudMap == null) throw new IllegalArgumentException("HUD map is null");
        OverlayGeometry.Transform current = transform;
        if (current == null || !hudMap.profileId.equals(current.profileId)) {
            throw new IllegalArgumentException("HUD map/profile mismatch");
        }
        this.hudMap = hudMap;
        invalidateNow();
    }

    /** Coalesce producer updates to at most roughly 30 HUD draws per second. */
    public void setSnapshot(OverlaySnapshot next) {
        if (next == null) return;
        OverlaySnapshot previous = snapshot;
        long nowNs = System.nanoTime();
        OverlaySnapshot drawSnapshot = snapshotRetention.accept(next, nowNs);
        removeCallbacks(retentionExpiryRunnable);
        long retainedUntilNs = snapshotRetention.expiresAtNs();
        if (retainedUntilNs > nowNs) {
            postDelayed(retentionExpiryRunnable,
                    Math.max(1L, (retainedUntilNs - nowNs) / 1_000_000L));
        }
        if (previous.monitorState != drawSnapshot.monitorState) {
            transitionFromMonitor = previous.monitorState;
            transitionToMonitor = drawSnapshot.monitorState;
            monitorTransitionStartNs = nowNs;
        }
        if (previous.selectedCamera == null
                ? drawSnapshot.selectedCamera != null
                : !previous.selectedCamera.equals(drawSnapshot.selectedCamera)) {
            selectedCameraTransitionStartNs = nowNs;
        }
        snapshot = drawSnapshot;
        removeCallbacks(expiryRunnable);
        if (drawSnapshot.cue.action != OverlaySnapshot.CueAction.NONE) {
            long delayMs = Math.max(1L,
                    (drawSnapshot.cue.expiresAtNs - System.nanoTime()) / 1_000_000L);
            postDelayed(expiryRunnable, Math.min(delayMs, 60_000L));
        }
        invalidateNow();
    }

    public OverlaySnapshot snapshot() {
        return snapshot;
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(expiryRunnable);
        removeCallbacks(retentionExpiryRunnable);
        removeCallbacks(invalidateRunnable);
        snapshotRetention.clear();
        super.onDetachedFromWindow();
    }

    private void onExpiry() {
        invalidateNow();
        OverlaySnapshot current = snapshot;
        if (current.cue.action != OverlaySnapshot.CueAction.NONE
                && !current.cue.expired(System.nanoTime())) {
            long delayMs = Math.max(1L,
                    (current.cue.expiresAtNs - System.nanoTime()) / 1_000_000L);
            postDelayed(expiryRunnable, Math.min(delayMs, 60_000L));
        }
    }

    private void onRetentionExpiry() {
        long nowNs = System.nanoTime();
        if (snapshotRetention.expire(nowNs) != null) {
            long retainedUntilNs = snapshotRetention.expiresAtNs();
            if (retainedUntilNs > nowNs) {
                postDelayed(retentionExpiryRunnable,
                        Math.max(1L, (retainedUntilNs - nowNs) / 1_000_000L));
            }
            return;
        }
        OverlaySnapshot current = snapshot;
        if (current.mode == OverlaySnapshot.Mode.SENSOR_DEBUG
                && current.screen == OverlaySnapshot.Screen.FNAF2_NIGHT) {
            snapshot = OverlaySnapshot.empty(current.sequence, nowNs, current.mode);
            invalidateNow();
        }
    }

    private void invalidateNow() {
        long now = System.nanoTime();
        if (now - lastInvalidateNs >= REDRAW_INTERVAL_NS) {
            lastInvalidateNs = now;
            postInvalidateOnAnimation();
        } else {
            removeCallbacks(invalidateRunnable);
            postDelayed(invalidateRunnable,
                    Math.max(1L, (REDRAW_INTERVAL_NS - (now - lastInvalidateNs)) / 1_000_000L));
        }
    }

    private final Runnable invalidateRunnable = () -> {
        lastInvalidateNs = System.nanoTime();
        invalidate();
    };

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        long nowNs = System.nanoTime();
        OverlaySnapshot render = snapshot.forRender(nowNs);
        OverlayGeometry.Transform currentTransform = transform;
        if (currentTransform == null) return;
        if (render.mode == OverlaySnapshot.Mode.SENSOR_DEBUG) {
            drawDebug(canvas, render, currentTransform);
        } else {
            drawCue(canvas, render, currentTransform);
        }
        if (renderListener != null) {
            renderListener.onRendered(render.sequence, nowNs);
        }
        if (render.mode == OverlaySnapshot.Mode.SENSOR_DEBUG
                && render.screen == OverlaySnapshot.Screen.FNAF2_NIGHT
                && (transitionProgress(nowNs) < 1f || render.selectedCamera != null)) {
            postInvalidateOnAnimation();
        }
    }

    private void drawDebug(Canvas canvas, OverlaySnapshot snapshot,
            OverlayGeometry.Transform currentTransform) {
        // A short UNKNOWN identity grace keeps the window stable while the
        // classifier settles, but it must not paint helper/status content over
        // a foreign screen. Positive night identity is the only drawable state.
        if (snapshot.screen != OverlaySnapshot.Screen.FNAF2_NIGHT) {
            outline.setPathEffect(null);
            outline.setAlpha(255);
            fill.setAlpha(255);
            text.setAlpha(255);
            return;
        }
        float scale = Math.max(1f, getResources().getDisplayMetrics().density);
        long nowNs = System.nanoTime();
        float transition = transitionProgress(nowNs);
        PixelRect[] hudZones = hudMap.displayZones(currentTransform, snapshot.screen);
        PixelRect[] occupied = new PixelRect[contract.size() + 1];
        int occupiedCount = 0;
        int visibleCount = 0;
        for (int index = 0; index < contract.size(); index++) {
            RoiSpec roi = contract.region(index);
            if (!OverlayRegionFilter.visible(snapshot.screen, snapshot.monitorState, roi)) {
                continue;
            }
            visibleCount++;
        }
        // The status badge is a non-game overlay affordance. It deliberately
        // does not reserve collision space: game-region labels may choose the
        // same corner when the calibrated game HUD leaves no other placement.
        drawDebugStatus(canvas, snapshot, visibleCount, scale, hudZones);

        for (int index = 0; index < contract.size(); index++) {
            RoiSpec roi = contract.region(index);
            if (!OverlayRegionFilter.visible(snapshot.screen, snapshot.monitorState, roi)) {
                continue;
            }
            OverlaySnapshot.Region region = snapshot.region(roi.id);
            OverlaySnapshot.FactState state = region == null
                    ? OverlaySnapshot.FactState.UNKNOWN : region.factState;
            // A raw monitored value is useful to calibration, but it has not
            // earned detector qualification and must not look like a positive
            // fact merely because the frame itself is fresh.
            if (region != null && !region.qualified
                    && state == OverlaySnapshot.FactState.MONITORED) {
                state = OverlaySnapshot.FactState.UNQUALIFIED;
            }
            String cameraControl = OverlayRegionFilter.cameraControlFor(roi.id);
            boolean selectedCamera = cameraControl != null
                    && cameraControl.equals(snapshot.selectedCamera);
            int colour = roi.screenScope == RoiSpec.ScreenScope.MONITOR
                    ? selectedCamera ? COLOR_CAMERA_SELECTED : COLOR_CAMERA_IDLE
                    : colourFor(state);
            float visibility = regionVisibility(roi, snapshot, transition);
            outline.setColor(colour);
            outline.setAlpha((int) ((selectedCamera ? 255
                    : state == OverlaySnapshot.FactState.MONITORED ? 175 : 240) * visibility));
            outline.setPathEffect(state == OverlaySnapshot.FactState.UNKNOWN
                    || state == OverlaySnapshot.FactState.STALE
                    ? dashed : null);
            OverlayGeometry.PixelRect pixel = currentTransform.display(roi);
            RectF rect = new RectF(pixel.left, pixel.top, pixel.right, pixel.bottom);
            // A mapped game-HUD zone is a hard exclusion for decorative
            // frames. The sensor still samples its shared ROI; only the
            // engineering annotation is suppressed.
            if (OverlayCollisionDetector.intersectsAny(pixel, hudZones,
                    4f * scale)) continue;
            if (state == OverlaySnapshot.FactState.DETECTED) {
                fill.setColor(colour);
                fill.setAlpha(42);
                canvas.drawRect(rect, fill);
            }
            drawStyledFrame(canvas, rect, scale, selectedCamera, visibility, nowNs);
            if (selectedCamera) {
                PixelRect labelRect = drawRegionLabel(canvas,
                        cameraDisplayLabel(cameraControl), pixel, scale, colour,
                        hudZones, occupied, occupiedCount, visibility);
                if (labelRect != null) occupied[occupiedCount++] = labelRect;
            } else if (OverlayRegionFilter.showLabel(state)) {
                PixelRect labelRect = drawRegionLabel(canvas, roi, state, pixel,
                        scale, colour, hudZones, occupied, occupiedCount, visibility);
                if (labelRect != null) occupied[occupiedCount++] = labelRect;
            }
        }
        outline.setPathEffect(null);
        outline.setAlpha(255);
    }

    private void drawStyledFrame(Canvas canvas, RectF rect, float scale,
            boolean selected, float opacity, long nowNs) {
        outline.setStyle(Paint.Style.STROKE);
        float width = selected ? Math.max(3f, 2.2f * scale)
                : Math.max(2f, 1.35f * scale);
        outline.setStrokeWidth(width);
        if (selected) {
            float pulse = .72f + .28f * (float) Math.sin(
                    (nowNs % CAMERA_PULSE_NS) * (Math.PI * 2d / CAMERA_PULSE_NS));
            float entrance = selectedCameraTransitionStartNs == 0L ? 1f
                    : Math.min(1f, Math.max(0f,
                            (nowNs - selectedCameraTransitionStartNs)
                                    / (float) STATE_TRANSITION_NS));
            outline.setAlpha((int) (90f * pulse * entrance * opacity));
            outline.setStrokeWidth(Math.max(width + 2f * scale, 4f * scale));
            RectF glow = new RectF(rect.left - 2f * scale, rect.top - 2f * scale,
                    rect.right + 2f * scale, rect.bottom + 2f * scale);
            canvas.drawRoundRect(glow, Math.max(3f, 3.5f * scale),
                    Math.max(3f, 3.5f * scale), outline);
            outline.setStrokeWidth(width);
            outline.setAlpha((int) (255f * opacity));
        }
        canvas.drawRoundRect(rect, Math.max(2f, 2.5f * scale),
                Math.max(2f, 2.5f * scale), outline);

        // A fine inner keyline gives the detector boxes a readable, game-like
        // frame without adding another text label to every normal ROI.
        if (rect.width() > 5f * scale && rect.height() > 5f * scale) {
            outline.setStrokeWidth(selected ? Math.max(1f, .8f * scale)
                    : Math.max(1f, .5f * scale));
            outline.setAlpha((int) ((selected ? 225 : 105) * opacity));
            RectF inner = new RectF(rect.left + width, rect.top + width,
                    rect.right - width, rect.bottom - width);
            canvas.drawRoundRect(inner, Math.max(1f, 1.5f * scale),
                    Math.max(1f, 1.5f * scale), outline);
        }

        // Short corner caps keep the boxes legible over moving game art while
        // remaining visually lighter than a second full border.
        float cap = Math.min(12f * scale,
                Math.min(rect.width(), rect.height()) * .22f);
        if (cap > 1f) {
            outline.setStrokeWidth(Math.max(1f, .9f * scale));
            outline.setAlpha((int) ((selected ? 255 : 155) * opacity));
            canvas.drawLine(rect.left, rect.top, rect.left + cap, rect.top, outline);
            canvas.drawLine(rect.left, rect.top, rect.left, rect.top + cap, outline);
            canvas.drawLine(rect.right - cap, rect.top, rect.right, rect.top, outline);
            canvas.drawLine(rect.right, rect.top, rect.right, rect.top + cap, outline);
            canvas.drawLine(rect.left, rect.bottom - cap, rect.left, rect.bottom, outline);
            canvas.drawLine(rect.left, rect.bottom, rect.left + cap, rect.bottom, outline);
            canvas.drawLine(rect.right - cap, rect.bottom, rect.right, rect.bottom, outline);
            canvas.drawLine(rect.right, rect.bottom - cap, rect.right, rect.bottom, outline);
        }
    }

    private PixelRect drawRegionLabel(Canvas canvas, RoiSpec roi,
            OverlaySnapshot.FactState state,
            OverlayGeometry.PixelRect pixel, float scale, int colour,
            PixelRect[] hudZones, PixelRect[] occupied, int occupiedCount,
            float opacity) {
        return drawRegionLabel(canvas, roi.id + "  " + state.name(), pixel,
                scale, colour, hudZones, occupied, occupiedCount, opacity);
    }

    private PixelRect drawRegionLabel(Canvas canvas, String label,
            OverlayGeometry.PixelRect pixel, float scale, int colour,
            PixelRect[] hudZones, PixelRect[] occupied, int occupiedCount,
            float opacity) {
        setDebugTextSize(scale);
        float paddingX = 7f * scale;
        float paddingY = 4f * scale;
        float width = text.measureText(label) + paddingX * 2f;
        float height = text.getTextSize() + paddingY * 2f;
        float gap = 6f * scale;
        PixelRect[] candidates = new PixelRect[] {
                annotationRect(pixel.left, pixel.top - gap - height, width, height),
                annotationRect(pixel.left, pixel.bottom + gap, width, height),
                annotationRect(pixel.right + gap, pixel.centerY() - height / 2f,
                        width, height),
                annotationRect(pixel.left - gap - width, pixel.centerY() - height / 2f,
                        width, height)
        };
        OverlayCollisionDetector.Placement placement = OverlayCollisionDetector.choose(
                candidates, hudZones, occupied, occupiedCount, 6f * scale);
        if (placement == null || !placement.clear) return null;
        RectF labelRect = rectF(placement.rect);
        fill.setColor(Color.rgb(8, 7, 14));
        fill.setAlpha((int) (190f * opacity));
        canvas.drawRoundRect(labelRect, 5f * scale, 5f * scale, fill);
        outline.setStyle(Paint.Style.STROKE);
        outline.setColor(colour);
        outline.setStrokeWidth(Math.max(1f, .7f * scale));
        outline.setAlpha((int) (200f * opacity));
        canvas.drawRoundRect(labelRect, 5f * scale, 5f * scale, outline);
        text.setColor(colour);
        text.setAlpha((int) (220f * opacity));
        canvas.drawText(label, placement.rect.left + paddingX,
                placement.rect.top + paddingY + text.getTextSize(), text);
        fill.setAlpha(255);
        outline.setAlpha(255);
        text.setAlpha(255);
        return placement.rect;
    }

    private void drawDebugStatus(Canvas canvas, OverlaySnapshot snapshot,
            int visibleCount, float scale, PixelRect[] hudZones) {
        setDebugTextSize(scale);
        int accent = statusColour(snapshot);
        String label;
        if (snapshot.monitorState == OverlaySnapshot.MonitorState.UP) {
            label = "NIGHT  •  MONITOR UP  •  "
                    + (snapshot.selectedCamera == null
                    ? "CAM ?" : cameraDisplayLabel(snapshot.selectedCamera))
                    + "  •  " + batteryDisplayLabel(snapshot);
        } else if (snapshot.monitorState == OverlaySnapshot.MonitorState.DOWN) {
            label = "NIGHT  •  MONITOR DOWN  •  " + visibleCount
                    + " ROIs  •  " + batteryDisplayLabel(snapshot);
        } else {
            label = "NIGHT  •  MONITOR ?  •  " + batteryDisplayLabel(snapshot);
        }

        float padX = 12f * scale;
        float padY = 8f * scale;
        float width = text.measureText(label) + padX * 2f;
        float height = text.getTextSize() + padY * 2f;
        if (width > getWidth() - 16f * scale) return;
        float margin = 16f * scale;
        PixelRect[] candidates = new PixelRect[] {
                annotationRect(margin, margin, width, height),
                annotationRect(getWidth() - margin - width, margin, width, height),
                annotationRect(margin, getHeight() - margin - height, width, height),
                annotationRect(getWidth() - margin - width,
                        getHeight() - margin - height, width, height)
        };
        OverlayCollisionDetector.Placement placement = OverlayCollisionDetector.choose(
                candidates, hudZones, null, 0, 8f * scale);
        if (placement == null || !placement.clear) return;
        RectF badge = rectF(placement.rect);

        fill.setColor(Color.rgb(8, 7, 14));
        fill.setAlpha(224);
        canvas.drawRoundRect(badge, 8f * scale, 8f * scale, fill);
        fill.setColor(accent);
        fill.setAlpha(235);
        canvas.drawRoundRect(new RectF(badge.left, badge.top,
                        badge.left + 5f * scale, badge.bottom),
                4f * scale, 4f * scale, fill);
        outline.setStyle(Paint.Style.STROKE);
        outline.setColor(accent);
        outline.setAlpha(235);
        outline.setStrokeWidth(Math.max(2f, 1.25f * scale));
        outline.setPathEffect(null);
        canvas.drawRoundRect(badge, 8f * scale, 8f * scale, outline);
        text.setColor(accent);
        text.setAlpha(245);
        canvas.drawText(label, badge.left + padX,
                badge.top + padY + text.getTextSize(), text);
        fill.setAlpha(255);
        outline.setAlpha(255);
        text.setAlpha(255);
    }

    private float regionVisibility(RoiSpec roi, OverlaySnapshot snapshot,
            float transition) {
        if (roi == null || transitionFromMonitor == transitionToMonitor) return 1f;
        if (snapshot.monitorState == OverlaySnapshot.MonitorState.UP
                && transitionToMonitor == OverlaySnapshot.MonitorState.UP
                && roi.screenScope == RoiSpec.ScreenScope.MONITOR) {
            return transition;
        }
        if (snapshot.monitorState == OverlaySnapshot.MonitorState.DOWN
                && transitionToMonitor == OverlaySnapshot.MonitorState.DOWN
                && roi.screenScope == RoiSpec.ScreenScope.OFFICE) {
            return transition;
        }
        return 1f;
    }

    private float transitionProgress(long nowNs) {
        if (monitorTransitionStartNs == 0L
                || transitionFromMonitor == transitionToMonitor) return 1f;
        long elapsed = nowNs - monitorTransitionStartNs;
        if (elapsed <= 0L) return 0f;
        if (elapsed >= STATE_TRANSITION_NS) {
            monitorTransitionStartNs = 0L;
            transitionFromMonitor = transitionToMonitor;
            return 1f;
        }
        float linear = elapsed / (float) STATE_TRANSITION_NS;
        // Smoothstep avoids a hard pop at either end of a monitor transition.
        return linear * linear * (3f - 2f * linear);
    }

    private PixelRect annotationRect(float left, float top, float width, float height) {
        float maxLeft = Math.max(0f, getWidth() - width);
        float maxTop = Math.max(0f, getHeight() - height);
        float safeLeft = Math.max(0f, Math.min(left, maxLeft));
        float safeTop = Math.max(0f, Math.min(top, maxTop));
        return new PixelRect(safeLeft, safeTop, safeLeft + width, safeTop + height);
    }

    private static RectF rectF(PixelRect rect) {
        return new RectF(rect.left, rect.top, rect.right, rect.bottom);
    }

    private void setDebugTextSize(float scale) {
        text.setTextSize(Math.max(10f * scale,
                Math.min(16f * scale, getWidth() / 140f)));
    }

    private int statusColour(OverlaySnapshot snapshot) {
        if (snapshot.screen == OverlaySnapshot.Screen.FNAF2_NIGHT) {
            switch (snapshot.monitorState) {
                case UP:
                    return COLOR_MONITOR_UP;
                case DOWN:
                    return COLOR_MONITOR_DOWN;
                case UNKNOWN:
                default:
                    return COLOR_MONITOR_UNKNOWN;
            }
        }
        OverlaySnapshot.Screen screen = snapshot.screen;
        switch (screen) {
            case FNAF2_NIGHT:
                return COLOR_NIGHT;
            case FNAF2_MENU:
                return COLOR_MENU;
            case CUE_HELPER:
                return COLOR_UNQUALIFIED;
            case UNKNOWN:
            default:
                return COLOR_WAITING;
        }
    }

    private static String cameraDisplayLabel(String control) {
        if (control == null || !control.startsWith("cam:")) return "CAM ?";
        try {
            int number = Integer.parseInt(control.substring(4));
            return number >= 1 && number <= 12
                    ? String.format(java.util.Locale.US, "CAM %02d", number)
                    : "CAM ?";
        } catch (NumberFormatException ignored) {
            return "CAM ?";
        }
    }

    private static String batteryDisplayLabel(OverlaySnapshot snapshot) {
        return snapshot.batteryPercent < 0
                ? "BAT ?" : "BAT " + snapshot.batteryPercent + "%";
    }

    private void drawCue(Canvas canvas, OverlaySnapshot snapshot,
            OverlayGeometry.Transform currentTransform) {
        OverlaySnapshot.Cue cue = snapshot.cue;
        if (cue.action == OverlaySnapshot.CueAction.NONE || cue.expired(System.nanoTime())) {
            return;
        }
        RoiSpec roi = cue.anchorRoiId == null ? null : contract.find(cue.anchorRoiId);
        float x;
        float y;
        if (roi == null) {
            x = getWidth() * .5f;
            y = getHeight() * .5f;
        } else {
            OverlayGeometry.PixelRect rect = currentTransform.display(roi);
            x = rect.centerX();
            y = rect.centerY();
        }
        String label = cue.action == OverlaySnapshot.CueAction.CHECK_VENT
                ? "CHECK VENT" : cue.action.name();
        float size = Math.max(20f, Math.min(54f,
                Math.min(getWidth(), getHeight()) / 12f));
        text.setTextSize(size);
        text.setColor(cue.severity == OverlaySnapshot.Severity.CRITICAL
                ? Color.rgb(255, 84, 73) : Color.rgb(255, 176, 32));
        text.setAlpha(245);
        float width = text.measureText(label);
        float left = Math.min(Math.max(8f, x - width / 2f), Math.max(8f, getWidth() - width - 8f));
        float baseline = Math.min(Math.max(size + 8f, y + size / 2f), getHeight() - 8f);
        fill.setColor(Color.rgb(9, 5, 6));
        fill.setAlpha(180);
        canvas.drawRoundRect(new RectF(left - 12f, baseline - size - 10f,
                left + width + 12f, baseline + 7f), 8f, 8f, fill);
        outline.setColor(text.getColor());
        outline.setAlpha(230);
        outline.setStrokeWidth(Math.max(2f, size / 16f));
        outline.setStyle(Paint.Style.STROKE);
        canvas.drawRoundRect(new RectF(left - 12f, baseline - size - 10f,
                left + width + 12f, baseline + 7f), 8f, 8f, outline);
        canvas.drawText(label, left, baseline, text);
        text.setAlpha(255);
        outline.setAlpha(255);
    }

    private int colourFor(OverlaySnapshot.FactState state) {
        switch (state) {
            case DETECTED:
                return COLOR_DETECTED;
            case UNKNOWN:
                return COLOR_UNKNOWN;
            case STALE:
                return COLOR_STALE;
            case UNQUALIFIED:
            case CONFLICTING:
                return COLOR_UNQUALIFIED;
            case MONITORED:
            default:
                return COLOR_MONITORED;
        }
    }

    private static Typeface loadHudTypeface(Context context) {
        try {
            return Typeface.createFromAsset(context.getAssets(), "fonts/hud-font.otf");
        } catch (RuntimeException unavailable) {
            return Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL);
        }
    }

    @Override
    public boolean onTouchEvent(android.view.MotionEvent event) {
        // Defensive refusal in addition to FLAG_NOT_TOUCHABLE on the window.
        return false;
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        if (visibilityListener != null) {
            visibilityListener.onWindowVisibilityChanged(visibility == VISIBLE);
        }
    }
}
