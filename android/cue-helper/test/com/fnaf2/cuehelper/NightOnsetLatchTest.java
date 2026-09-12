package com.fnaf2.cuehelper;

/** Phone-free regression for the night-onset latch the release anchoring reads. */
public final class NightOnsetLatchTest {
    private static int failures;
    private static final long FRAME_NS = 16_666_667L;

    private static void check(String what, boolean ok) {
        if (!ok) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static long feed(NightOnsetLatch latch, long startNs, int frames, int identity) {
        long t = startNs;
        for (int i = 0; i < frames; i++) {
            latch.onFrame(t, identity);
            t += FRAME_NS;
        }
        return t;
    }

    public static void main(String[] args) {
        int night = ScreenIdentity.FNAF2_NIGHT;
        int unknown = ScreenIdentity.UNKNOWN;

        NightOnsetLatch latch = new NightOnsetLatch();
        long t = feed(latch, 1_000_000_000L, 20, unknown);
        long start = t;
        feed(latch, start, 29, night);
        check("a run shorter than the hold must not latch", latch.onsetNs() == NightOnsetLatch.NOT_LATCHED);
        feed(latch, start + 29 * FRAME_NS, 3, night);
        check("a held run latches its FIRST frame", latch.onsetNs() == start);

        latch = new NightOnsetLatch();
        t = feed(latch, 5_000_000_000L, 10, unknown);
        long flicker = t;
        t = feed(latch, flicker, 1, night);
        t = feed(latch, t, 2, unknown);
        long sustained = t;
        feed(latch, sustained, 40, night);
        check("a one-frame flicker is not the onset", latch.onsetNs() == sustained);

        long latched = latch.onsetNs();
        feed(latch, sustained + 40 * FRAME_NS, 60, unknown);
        feed(latch, sustained + 100 * FRAME_NS, 60, night);
        check("a latched onset survives in-night non-night identities", latch.onsetNs() == latched);

        t = feed(latch, sustained + 160 * FRAME_NS, 10, ScreenIdentity.FNAF2_MENU);
        check("the menu between nights clears the latch", latch.onsetNs() == NightOnsetLatch.NOT_LATCHED);
        t = feed(latch, t, 20, unknown);
        long nextNight = t;
        feed(latch, nextNight, 40, night);
        check("the next night latches its own onset", latch.onsetNs() == nextNight);

        latch.reset();
        check("reset clears the onset for a new capture generation",
                latch.onsetNs() == NightOnsetLatch.NOT_LATCHED);

        latch = new NightOnsetLatch();
        latch.onFrame(9_000_000_000L, night);
        latch.onFrame(8_000_000_000L, night);
        latch.onFrame(9_600_000_000L, night);
        check("a backwards timestamp neither starts nor extends a run",
                latch.onsetNs() == 9_000_000_000L);

        latch = new NightOnsetLatch();
        latch.onFrame(0L, night);
        latch.onFrame(-5L, night);
        check("non-positive image times are ignored", latch.onsetNs() == NightOnsetLatch.NOT_LATCHED);

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("night onset latch: held-run onset, flicker rejection, menu re-arm, reset and ordering pass");
    }
}
