package com.fnaf2.cuehelper;

import java.util.Arrays;

/**
 * Pure content-to-buffer/display geometry.  The source rectangle is always
 * normalized game content; callers supply the resolved content viewport for
 * each output space, including letterboxing, insets and cutouts.
 */
public final class OverlayGeometry {
    public static final String VERSION = "game-geometry-v1";

    public enum Rotation {
        ROTATION_0,
        ROTATION_90,
        ROTATION_180,
        ROTATION_270
    }

    /** Floating-point rectangle in an output coordinate space. */
    public static final class PixelRect {
        public final float left;
        public final float top;
        public final float right;
        public final float bottom;

        PixelRect(float left, float top, float right, float bottom) {
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        public float width() {
            return right - left;
        }

        public float height() {
            return bottom - top;
        }

        public float centerX() {
            return (left + right) * 0.5f;
        }

        public float centerY() {
            return (top + bottom) * 0.5f;
        }

        @Override
        public String toString() {
            return "[" + left + "," + top + "," + right + "," + bottom + "]";
        }
    }

    /** The resolved game-content viewport inside one output space. */
    public static final class Viewport {
        public final float left;
        public final float top;
        public final float right;
        public final float bottom;
        public final Rotation rotation;

        public Viewport(float left, float top, float right, float bottom,
                Rotation rotation) {
            if (!finite(left) || !finite(top) || !finite(right) || !finite(bottom)
                    || right <= left || bottom <= top || rotation == null) {
                throw new IllegalArgumentException("viewport is invalid");
            }
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
            this.rotation = rotation;
        }

        public PixelRect resolve(NormalizedRect source) {
            if (source == null) {
                throw new IllegalArgumentException("source rectangle is null");
            }
            NormalizedRect rotated = rotate(source, rotation);
            return new PixelRect(
                    left + rotated.left * (right - left),
                    top + rotated.top * (bottom - top),
                    left + rotated.right * (right - left),
                    top + rotated.bottom * (bottom - top));
        }
    }

    /** A transform pair resolved for one device/content profile. */
    public static final class Transform {
        public final String profileId;
        public final Viewport capture;
        public final Viewport display;

        public Transform(String profileId, Viewport capture, Viewport display) {
            if (profileId == null || profileId.isEmpty() || capture == null
                    || display == null) {
                throw new IllegalArgumentException("incomplete geometry transform");
            }
            this.profileId = profileId;
            this.capture = capture;
            this.display = display;
        }

        public PixelRect capture(RoiSpec roi) {
            requireProfile(roi);
            return capture.resolve(roi.normalizedRect);
        }

        public PixelRect display(RoiSpec roi) {
            requireProfile(roi);
            return display.resolve(roi.overlayRect);
        }

        private void requireProfile(RoiSpec roi) {
            if (roi == null || !profileId.equals(roi.calibrationBinding)) {
                throw new IllegalArgumentException("geometry profile mismatch");
            }
        }
    }

    /** Screen on which a mapped game-HUD exclusion zone is present. */
    public enum HudScope {
        ANY_RECOGNIZED,
        FNAF2_NIGHT,
        FNAF2_MENU
    }

    /**
     * A UI-only exclusion zone. It uses the same normalized content geometry
     * and profile transform as sensor regions, but is not a detector input.
     */
    public static final class HudZone {
        public final String id;
        public final NormalizedRect normalizedRect;
        public final HudScope scope;

        public HudZone(String id, NormalizedRect normalizedRect, HudScope scope) {
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,63}")
                    || normalizedRect == null || scope == null) {
                throw new IllegalArgumentException("invalid HUD collision zone");
            }
            this.id = id;
            this.normalizedRect = normalizedRect;
            this.scope = scope;
        }

        boolean appliesTo(OverlaySnapshot.Screen screen) {
            if (screen == null) return false;
            switch (scope) {
                case ANY_RECOGNIZED:
                    return screen != OverlaySnapshot.Screen.UNKNOWN
                            && screen != OverlaySnapshot.Screen.CUE_HELPER;
                case FNAF2_NIGHT:
                    return screen == OverlaySnapshot.Screen.FNAF2_NIGHT;
                case FNAF2_MENU:
                    return screen == OverlaySnapshot.Screen.FNAF2_MENU;
                default:
                    return false;
            }
        }
    }

    /**
     * Versioned, profile-bound map of game UI areas that the overlay must not
     * cover with labels or decorative frames. It starts empty until each
     * target HUD area has a retained calibration measurement.
     */
    public static final class HudMap {
        public static final String VERSION = "game-hud-map-v1";

        public final String profileId;
        private final HudZone[] zones;

        public HudMap(String profileId, HudZone[] zones) {
            if (profileId == null || profileId.isEmpty() || zones == null) {
                throw new IllegalArgumentException("invalid HUD collision map");
            }
            this.profileId = profileId;
            this.zones = zones.clone();
            for (HudZone zone : this.zones) {
                if (zone == null) throw new IllegalArgumentException("null HUD zone");
            }
        }

        public int size() {
            return zones.length;
        }

        public HudZone zone(int index) {
            return zones[index];
        }

        public HudZone[] zones() {
            return zones.clone();
        }

        /** Resolve only the zones applicable to the current recognized screen. */
        public PixelRect[] displayZones(Transform transform,
                OverlaySnapshot.Screen screen) {
            if (transform == null || !profileId.equals(transform.profileId)) {
                throw new IllegalArgumentException("HUD map/profile mismatch");
            }
            int count = 0;
            for (HudZone zone : zones) {
                if (zone.appliesTo(screen)) count++;
            }
            PixelRect[] resolved = new PixelRect[count];
            int index = 0;
            for (HudZone zone : zones) {
                if (zone.appliesTo(screen)) {
                    resolved[index++] = transform.display.resolve(zone.normalizedRect);
                }
            }
            return resolved;
        }
    }

    /** Immutable registry derived from the existing PixelWatch specification. */
    public static final class Contract {
        public final String version;
        public final String profileId;
        private final RoiSpec[] regions;

        Contract(String version, String profileId, RoiSpec[] regions) {
            if (!VERSION.equals(version) || profileId == null || profileId.isEmpty()
                    || regions == null || regions.length == 0) {
                throw new IllegalArgumentException("invalid geometry contract");
            }
            this.version = version;
            this.profileId = profileId;
            this.regions = regions.clone();
            for (RoiSpec region : this.regions) {
                if (region == null) throw new IllegalArgumentException("null ROI");
            }
        }

        public int size() {
            return regions.length;
        }

        public RoiSpec region(int index) {
            return regions[index];
        }

        public RoiSpec find(String id) {
            if (id == null) return null;
            for (RoiSpec region : regions) {
                if (region.id.equals(id)) return region;
            }
            return null;
        }

        public RoiSpec[] regions() {
            return regions.clone();
        }

        @Override
        public String toString() {
            return version + " profile=" + profileId + " regions="
                    + Arrays.toString(regions);
        }
    }

    private OverlayGeometry() {
    }

    public static Contract fromPixelWatch(PixelWatch.Spec spec,
            String profileId) {
        if (spec == null) throw new IllegalArgumentException("watch spec is null");
        RoiSpec[] regions = new RoiSpec[spec.size()];
        for (int index = 0; index < spec.size(); index++) {
            PixelWatch.Entry entry = spec.entry(index);
            float left = entry.x / (float) PixelWatch.NATIVE_WIDTH;
            float top = entry.y / (float) PixelWatch.NATIVE_HEIGHT;
            float right = (entry.x + entry.width) / (float) PixelWatch.NATIVE_WIDTH;
            float bottom = (entry.y + entry.height) / (float) PixelWatch.NATIVE_HEIGHT;
            NormalizedRect sensorRect = new NormalizedRect(left, top, right, bottom);
            RoiSpec.OverlayAnchor anchor = anchorFor(left, top, right, bottom);
            RoiSpec.OverlayStyle style = entry.kind == PixelWatch.Kind.ROI
                    ? RoiSpec.OverlayStyle.HIGHLIGHT
                    : RoiSpec.OverlayStyle.MONITORED;
            String detector = entry.name.startsWith("screen_")
                    ? "screen-identity" : entry.name.startsWith("cam")
                            ? "camera-rule" : entry.name.startsWith("battery_")
                                    ? "battery-rule" : "monitor-rule";
            RoiSpec.ScreenScope screenScope = entry.name.startsWith("screen_")
                    ? RoiSpec.ScreenScope.IDENTITY
                    : entry.name.startsWith("cam")
                            ? RoiSpec.ScreenScope.MONITOR
                            : entry.name.startsWith("battery_")
                                    ? RoiSpec.ScreenScope.NIGHT_HUD
                                    : RoiSpec.ScreenScope.OFFICE;
            NormalizedRect overlayRect = entry.kind == PixelWatch.Kind.PIXEL
                    && entry.name.startsWith("cam")
                            ? cameraButtonOverlayRect(entry.x, entry.y)
                            : sensorRect;
            regions[index] = new RoiSpec(entry.name,
                    sensorRect, detector, anchor, style, profileId,
                    screenScope, overlayRect);
        }
        return new Contract(VERSION, profileId, regions);
    }

    public static Contract defaultContract() {
        return fromPixelWatch(PixelWatch.defaultSpec(), "moto-g56-fnaf2-v207");
    }

    /**
     * The map is intentionally empty until the game HUD is measured. Callers
     * may provide a populated HudMap to OverlayView without touching the
     * PixelWatch sensor contract.
     */
    public static HudMap defaultHudMap() {
        return new HudMap(defaultContract().profileId, new HudZone[0]);
    }

    private static RoiSpec.OverlayAnchor anchorFor(float left, float top,
            float right, float bottom) {
        float x = (left + right) * 0.5f;
        float y = (top + bottom) * 0.5f;
        if (x < 0.33f && y < 0.33f) return RoiSpec.OverlayAnchor.TOP_LEFT;
        if (x > 0.67f && y < 0.33f) return RoiSpec.OverlayAnchor.TOP_RIGHT;
        if (x < 0.33f && y > 0.67f) return RoiSpec.OverlayAnchor.BOTTOM_LEFT;
        if (x > 0.67f && y > 0.67f) return RoiSpec.OverlayAnchor.BOTTOM_RIGHT;
        return RoiSpec.OverlayAnchor.CENTER;
    }

    private static NormalizedRect cameraButtonOverlayRect(int centerX, int centerY) {
        float halfWidth = PixelWatch.CAMERA_BUTTON_OVERLAY_WIDTH / 2f;
        float halfHeight = PixelWatch.CAMERA_BUTTON_OVERLAY_HEIGHT / 2f;
        float left = Math.max(0f, centerX - halfWidth) / PixelWatch.NATIVE_WIDTH;
        float top = Math.max(0f, centerY - halfHeight) / PixelWatch.NATIVE_HEIGHT;
        float right = Math.min(PixelWatch.NATIVE_WIDTH, centerX + halfWidth)
                / PixelWatch.NATIVE_WIDTH;
        float bottom = Math.min(PixelWatch.NATIVE_HEIGHT, centerY + halfHeight)
                / PixelWatch.NATIVE_HEIGHT;
        return new NormalizedRect(left, top, right, bottom);
    }

    private static NormalizedRect rotate(NormalizedRect rect, Rotation rotation) {
        switch (rotation) {
            case ROTATION_90:
                return new NormalizedRect(1f - rect.bottom, rect.left,
                        1f - rect.top, rect.right);
            case ROTATION_180:
                return new NormalizedRect(1f - rect.right, 1f - rect.bottom,
                        1f - rect.left, 1f - rect.top);
            case ROTATION_270:
                return new NormalizedRect(rect.top, 1f - rect.right,
                        rect.bottom, 1f - rect.left);
            case ROTATION_0:
            default:
                return rect;
        }
    }

    private static boolean finite(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value);
    }
}
