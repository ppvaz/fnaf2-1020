package com.fnaf2.cuehelper;

/** Pure geometry helpers for collision-safe HUD annotation placement. */
public final class OverlayCollisionDetector {
    private static final OverlayGeometry.PixelRect[] EMPTY =
            new OverlayGeometry.PixelRect[0];
    public static final class Placement {
        public final OverlayGeometry.PixelRect rect;
        public final boolean clear;
        public final int collisionCount;
        public final float blockedArea;

        private Placement(OverlayGeometry.PixelRect rect, boolean clear,
                int collisionCount, float blockedArea) {
            this.rect = rect;
            this.clear = clear;
            this.collisionCount = collisionCount;
            this.blockedArea = blockedArea;
        }
    }

    private OverlayCollisionDetector() {
    }

    public static boolean intersects(OverlayGeometry.PixelRect first,
            OverlayGeometry.PixelRect second, float guardPx) {
        if (first == null || second == null) return false;
        float guard = Math.max(0f, guardPx);
        return first.left < second.right + guard
                && first.right + guard > second.left
                && first.top < second.bottom + guard
                && first.bottom + guard > second.top;
    }

    public static boolean intersectsAny(OverlayGeometry.PixelRect candidate,
            OverlayGeometry.PixelRect[] obstacles, float guardPx) {
        if (obstacles == null) return false;
        for (OverlayGeometry.PixelRect obstacle : obstacles) {
            if (intersects(candidate, obstacle, guardPx)) return true;
        }
        return false;
    }

    /**
     * Pick the first collision-free candidate. If every candidate is blocked,
     * return the least-blocked one with {@code clear == false}; callers should
     * suppress that annotation rather than knowingly draw through the game UI.
     */
    public static Placement choose(OverlayGeometry.PixelRect[] candidates,
            OverlayGeometry.PixelRect[] primaryObstacles,
            OverlayGeometry.PixelRect[] occupiedObstacles, int occupiedCount,
            float guardPx) {
        if (candidates == null || candidates.length == 0) return null;
        Placement best = null;
        for (OverlayGeometry.PixelRect candidate : candidates) {
            if (candidate == null) continue;
            int collisions = 0;
            float blockedArea = 0f;
            for (OverlayGeometry.PixelRect obstacle : primaryObstacles == null
                    ? EMPTY : primaryObstacles) {
                if (intersects(candidate, obstacle, guardPx)) {
                    collisions++;
                    blockedArea += intersectionArea(candidate, obstacle, guardPx);
                }
            }
            if (occupiedObstacles != null) {
                int limit = Math.min(Math.max(0, occupiedCount), occupiedObstacles.length);
                for (int index = 0; index < limit; index++) {
                    OverlayGeometry.PixelRect obstacle = occupiedObstacles[index];
                    if (intersects(candidate, obstacle, guardPx)) {
                        collisions++;
                        blockedArea += intersectionArea(candidate, obstacle, guardPx);
                    }
                }
            }
            Placement placement = new Placement(candidate, collisions == 0,
                    collisions, blockedArea);
            if (placement.clear) return placement;
            if (best == null || placement.blockedArea < best.blockedArea
                    || (placement.blockedArea == best.blockedArea
                    && placement.collisionCount < best.collisionCount)) {
                best = placement;
            }
        }
        return best;
    }

    private static float intersectionArea(OverlayGeometry.PixelRect first,
            OverlayGeometry.PixelRect second, float guardPx) {
        if (!intersects(first, second, guardPx)) return 0f;
        float guard = Math.max(0f, guardPx);
        float left = Math.max(first.left - guard, second.left - guard);
        float top = Math.max(first.top - guard, second.top - guard);
        float right = Math.min(first.right + guard, second.right + guard);
        float bottom = Math.min(first.bottom + guard, second.bottom + guard);
        return Math.max(0f, right - left) * Math.max(0f, bottom - top);
    }
}
