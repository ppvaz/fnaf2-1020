package com.fnaf2.cuehelper;

/** Host regression for the shared game-UI flashlight meter sensor. */
public final class BatteryLifeDetectorTest {
    private static void check(String what, boolean value) {
        if (!value) throw new AssertionError(what);
    }

    public static void main(String[] args) {
        PixelWatch.Spec spec = PixelWatch.defaultSpec();
        int[] values = new int[PixelWatch.MAX_ENTRIES];
        java.util.Arrays.fill(values, PixelWatch.UNKNOWN);
        for (int bar = 1; bar <= PixelWatch.BATTERY_BAR_COUNT; bar++) {
            values[spec.indexOfName(PixelWatch.batteryBarName(bar))] = 255;
        }
        BatteryLifeDetector.Result full = BatteryLifeDetector.measure(spec, values);
        check("four bright bars report full battery", full.observed()
                && full.filledBars == 4 && full.percent == 100
                && "bars-observed".equals(full.reason));

        values[spec.indexOfName("battery_bar_4")] = 0;
        BatteryLifeDetector.Result three = BatteryLifeDetector.measure(spec, values);
        check("one dark bar reports three quarters", three.observed()
                && three.filledBars == 3 && three.percent == 75);

        values[spec.indexOfName("battery_bar_2")] = PixelWatch.UNKNOWN;
        check("an unavailable bar fails closed",
                "read-unavailable".equals(
                        BatteryLifeDetector.measure(spec, values).reason));

        PixelWatch.Entry[] moved = new PixelWatch.Entry[spec.size()];
        for (int index = 0; index < spec.size(); index++) {
            PixelWatch.Entry entry = spec.entry(index);
            moved[index] = entry.name.equals("battery_bar_1")
                    ? new PixelWatch.Entry(entry.name, entry.kind, entry.x + 1, entry.y,
                    entry.width, entry.height, entry.reducer, entry.step, entry.greySpread)
                    : entry;
        }
        check("foreign battery geometry fails closed",
                "sensor-mismatch".equals(BatteryLifeDetector.measure(
                        new PixelWatch.Spec(moved), values).reason));
        check("bright menu pixels are not battery evidence",
                "screen-identity".equals(BatteryLifeDetector.measureForScreen(
                        spec, values, ScreenIdentity.FNAF2_MENU).reason));
        values[spec.indexOfName("battery_bar_2")] = 255;
        check("night identity permits the shared battery read",
                BatteryLifeDetector.measureForScreen(spec, values,
                        ScreenIdentity.FNAF2_NIGHT).observed());
        System.out.println("BatteryLifeDetectorTest: all checks passed");
    }
}
