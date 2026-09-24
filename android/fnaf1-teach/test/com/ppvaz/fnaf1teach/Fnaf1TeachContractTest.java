package com.ppvaz.fnaf1teach;

/** Host-only regression for the passive presenter's bounded vocabulary/geometry. */
public final class Fnaf1TeachContractTest {
    private static int failures;

    private static void check(String name, boolean value) {
        if (!value) {
            failures++;
            System.err.println("FAIL " + name);
        }
    }

    public static void main(String[] args) {
        check("schema", "fnaf1-teach-overlay-v1".equals(Fnaf1TeachContract.SCHEMA));
        check("target", "com.scottgames.fivenightsatfreddys".equals(Fnaf1TeachContract.TARGET_PACKAGE));
        check("native geometry", Fnaf1TeachContract.LEFT >= 0
                && Fnaf1TeachContract.TOP >= 0
                && Fnaf1TeachContract.RIGHT <= Fnaf1TeachContract.NATIVE_WIDTH
                && Fnaf1TeachContract.BOTTOM <= Fnaf1TeachContract.NATIVE_HEIGHT);
        check("door reader clearance", Fnaf1TeachContract.BOTTOM + Fnaf1TeachContract.GUARD_PX <= 60);
        check("night one", Fnaf1TeachContract.validNight(1));
        check("night two", Fnaf1TeachContract.validNight(2));
        check("other night refused", !Fnaf1TeachContract.validNight(3));
        check("full loop", Fnaf1TeachContract.validStage("full-loop"));
        check("free text refused", !Fnaf1TeachContract.validStage("press whatever"));
        check("lesson is bounded", Fnaf1TeachContract.lesson("full-loop").contains("Full loop"));
        if (failures != 0) throw new AssertionError("Fnaf1TeachContractTest failures=" + failures);
        System.out.println("Fnaf1 teach contract: bounded FNaF 1-only passive presentation passes");
    }
}
