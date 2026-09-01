package com.fnaf2.cuehelper;

/** Immutable rectangle in normalized game-content coordinates. */
public final class NormalizedRect {
    public final float left;
    public final float top;
    public final float right;
    public final float bottom;

    public NormalizedRect(float left, float top, float right, float bottom) {
        if (!finite(left) || !finite(top) || !finite(right) || !finite(bottom)
                || left < 0f || top < 0f || right > 1f || bottom > 1f
                || right <= left || bottom <= top) {
            throw new IllegalArgumentException("normalized rectangle is invalid");
        }
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

    public boolean contains(float x, float y) {
        return x >= left && x <= right && y >= top && y <= bottom;
    }

    private static boolean finite(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value);
    }

    @Override
    public String toString() {
        return "[" + left + "," + top + "," + right + "," + bottom + "]";
    }
}
