package com.fnaf2.cuehelper;

/**
 * One shared sensor/UI region.  PixelWatch owns the instances; the overlay
 * never maintains a second coordinate registry.
 */
public final class RoiSpec {
    public enum OverlayAnchor {
        TOP_LEFT,
        TOP_RIGHT,
        CENTER,
        BOTTOM_LEFT,
        BOTTOM_RIGHT
    }

    public enum OverlayStyle {
        MONITORED,
        HIGHLIGHT
    }

    /** Which established game surface can contain this region. */
    public enum ScreenScope {
        OFFICE,
        MONITOR,
        /** Persistent night HUD controls such as the flashlight meter. */
        NIGHT_HUD,
        IDENTITY
    }

    public final String id;
    public final NormalizedRect normalizedRect;
    /** Display-only bounds for an annotation; sensor sampling stays normalizedRect. */
    public final NormalizedRect overlayRect;
    public final String detectorId;
    public final OverlayAnchor overlayAnchor;
    public final OverlayStyle debugStyle;
    public final String calibrationBinding;
    public final ScreenScope screenScope;

    public RoiSpec(String id, NormalizedRect normalizedRect, String detectorId,
            OverlayAnchor overlayAnchor, OverlayStyle debugStyle,
            String calibrationBinding) {
        this(id, normalizedRect, detectorId, overlayAnchor, debugStyle,
                calibrationBinding, ScreenScope.OFFICE, normalizedRect);
    }

    public RoiSpec(String id, NormalizedRect normalizedRect, String detectorId,
            OverlayAnchor overlayAnchor, OverlayStyle debugStyle,
            String calibrationBinding, ScreenScope screenScope) {
        this(id, normalizedRect, detectorId, overlayAnchor, debugStyle,
                calibrationBinding, screenScope, normalizedRect);
    }

    public RoiSpec(String id, NormalizedRect normalizedRect, String detectorId,
            OverlayAnchor overlayAnchor, OverlayStyle debugStyle,
            String calibrationBinding, ScreenScope screenScope,
            NormalizedRect overlayRect) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,63}")) {
            throw new IllegalArgumentException("invalid ROI id");
        }
        if (normalizedRect == null || detectorId == null || detectorId.isEmpty()
                || overlayAnchor == null || debugStyle == null
                || calibrationBinding == null || calibrationBinding.isEmpty()
                || screenScope == null || overlayRect == null) {
            throw new IllegalArgumentException("incomplete ROI specification");
        }
        this.id = id;
        this.normalizedRect = normalizedRect;
        this.overlayRect = overlayRect;
        this.detectorId = detectorId;
        this.overlayAnchor = overlayAnchor;
        this.debugStyle = debugStyle;
        this.calibrationBinding = calibrationBinding;
        this.screenScope = screenScope;
    }
}
