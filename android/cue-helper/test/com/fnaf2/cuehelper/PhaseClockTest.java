package com.fnaf2.cuehelper;

/** Phone-free regression for the numeric s0033 phase clock. */
public final class PhaseClockTest {
    private static int checks;

    public static void main(String[] args) {
        PhaseClock clock = new PhaseClock();
        long base = 1_000_000_000L;
        for (int index = 0; index < 6; index++) {
            clock.observe(base + index * 500_000_000L + (index % 2) * 2_000_000L,
                    0.91);
        }
        PhaseClock.Snapshot snapshot = clock.snapshot();
        check(snapshot.state.equals("LOCKED"), "s0033 locks at six half-second ticks");
        check(snapshot.periodMs >= 499 && snapshot.periodMs <= 501,
                "phase period is approximately 500 ms");
        check(snapshot.ticks == 6 && snapshot.tickIndex == 5,
                "phase retains numeric tick index");
        check(snapshot.uncertaintyMs <= 2, "phase residual is reported");

        clock.observe(base + 2_600_000_000L, 0.95);
        check(clock.snapshot().ticks == 6, "refractory duplicate is ignored");
        clock.reset();
        check(clock.snapshot().state.equals("UNLOCKED"), "phase reset unlocks");
        System.out.println("phase clock: " + checks + " checks passed");
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
