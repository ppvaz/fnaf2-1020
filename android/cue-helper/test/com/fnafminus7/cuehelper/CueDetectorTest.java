package com.fnafminus7.cuehelper;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class CueDetectorTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        short[] bang = signal(400, 0x12345678, 9_000);
        short[] step = signal(400, 0x7357abcd, 7_000);
        CueDetector.Model parsed = parseModel("shadow", bang, step);
        check(parsed.templates.length == 2, "model parser keeps both templates");
        check(parsed.maxTemplateSamples == 400, "model parser records longest core");

        CueDetector detector = new CueDetector();
        detector.setModel(parsed);
        long start = 1_000_000_000L;
        check(detector.arm("w-control", "bang", start, start + 2_000_000_000L,
                "control", start).equals("ERROR detector-model-not-promoted"),
                "shadow evidence cannot arm a control decision");

        String armed = detector.arm("w-hit", "all", start, start + 2_000_000_000L,
                "shadow", start);
        check(armed.startsWith("OK armed=w-hit"), "shadow window arms");
        short[] capture = noise(16_000 * 2, 0x5eed, 120);
        injectUpsampled(capture, 8_000, bang, 4, 12_000);
        detector.accept(capture, capture.length, 16_000, start + 2_000_000_000L);
        String hit = detector.result("w-hit", start + 2_000_000_000L);
        check(hit.startsWith("HIT window=w-hit cue=bang template=17"),
                "the matching cue produces a timestamped hit");
        check(hit.contains("mode=shadow"), "the result retains its promotion mode");

        detector.setModel(parsed);
        long missStart = 4_000_000_000L;
        check(detector.arm("w-miss", "bang", missStart, missStart + 1_000_000_000L,
                "shadow", missStart).startsWith("OK armed=w-miss"),
                "a completed window can be replaced");
        short[] ordinary = noise(16_000, 0x600d, 500);
        detector.accept(ordinary, ordinary.length, 16_000,
                missStart + 1_000_000_000L);
        check(detector.result("w-miss", missStart + 1_000_000_000L)
                        .startsWith("MISS window=w-miss"),
                "usable audio without a match is MISS");

        detector.setModel(parsed);
        long silentStart = 6_000_000_000L;
        detector.arm("w-silent", "bang", silentStart, silentStart + 1_000_000_000L,
                "shadow", silentStart);
        detector.accept(new short[16_000], 16_000, 16_000,
                silentStart + 1_000_000_000L);
        check(detector.result("w-silent", silentStart + 1_000_000_000L)
                        .contains("UNKNOWN window=w-silent reason=silent"),
                "silence is unknown rather than a clean miss");

        detector.setModel(parsed);
        long faultStart = 8_000_000_000L;
        detector.arm("w-rate", "bang", faultStart, faultStart + 1_000_000_000L,
                "shadow", faultStart);
        detector.accept(ordinary, ordinary.length, 22_050,
                faultStart + 1_000_000_000L);
        check(detector.result("w-rate", faultStart + 1_000_000_000L)
                        .contains("reason=unsupported-rate"),
                "an unsupported capture rate fails closed");

        detector.setModel(parseModel("heldout", bang, step));
        long promotedStart = 10_000_000_000L;
        check(detector.arm("w-promoted", "bang", promotedStart,
                        promotedStart + 1_000_000_000L, "control", promotedStart)
                        .startsWith("OK armed=w-promoted"),
                "held-out evidence is required for control mode");
        check(detector.status().contains("evidence=heldout"),
                "status makes the model evidence visible");

        expectModelError("bad header\n", "model-header");
        expectModelError("cue-model-v1 calibration=x evidence=shadow rate=8000 margin=.1\n",
                "model-metadata");
        System.out.println("cue detector: " + checks + " checks passed");
    }

    private static CueDetector.Model parseModel(String evidence, short[] bang,
            short[] step) throws Exception {
        String text = "cue-model-v1 calibration=synthetic evidence=" + evidence
                + " rate=4000 margin=0.05\n"
                + templateLine("bang", "17", 0.72, bang)
                + templateLine("footstep", "25", 0.72, step);
        return CueDetector.Model.read(new ByteArrayInputStream(
                text.getBytes(StandardCharsets.US_ASCII)));
    }

    private static String templateLine(String cue, String id, double threshold,
            short[] samples) {
        ByteBuffer bytes = ByteBuffer.allocate(samples.length * 2)
                .order(ByteOrder.LITTLE_ENDIAN);
        for (short sample : samples) {
            bytes.putShort(sample);
        }
        return "template cue=" + cue + " id=" + id + " threshold=" + threshold
                + " pcm=" + Base64.getEncoder().encodeToString(bytes.array()) + "\n";
    }

    private static short[] signal(int count, int seed, int amplitude) {
        short[] out = new short[count];
        int state = seed;
        for (int i = 0; i < count; i++) {
            state = state * 1_103_515_245 + 12_345;
            out[i] = (short) (((state >>> 16) % (amplitude * 2)) - amplitude);
        }
        return out;
    }

    private static short[] noise(int count, int seed, int amplitude) {
        return signal(count, seed, amplitude);
    }

    private static void injectUpsampled(short[] target, int at, short[] source,
            int factor, int amplitude) {
        for (int i = 0; i < source.length; i++) {
            int scaled = source[i] * amplitude / 9_000;
            for (int j = 0; j < factor; j++) {
                int index = at + i * factor + j;
                target[index] = (short) Math.max(Short.MIN_VALUE,
                        Math.min(Short.MAX_VALUE, target[index] + scaled));
            }
        }
    }

    private static void expectModelError(String model, String reason) throws Exception {
        try {
            CueDetector.Model.read(new ByteArrayInputStream(
                    model.getBytes(StandardCharsets.US_ASCII)));
            throw new AssertionError("expected " + reason);
        } catch (java.io.IOException error) {
            check(error.getMessage().equals(reason), "malformed model reports " + reason);
        }
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
