package com.fnaf2.cuehelper;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

public final class AudioAnalyzerTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        short[] template = signal(200, 0x17c0ffee, 12_000);
        String modelText = "cue-model-v1 calibration=synthetic evidence=shadow "
                + "rate=4000 margin=0.05\n"
                + templateLine("bang", "17", 0.70, template);
        CueDetector.Model model = CueDetector.Model.read(new ByteArrayInputStream(
                modelText.getBytes(StandardCharsets.US_ASCII)));
        List<AudioAnalyzer.CueEvent> events = new ArrayList<>();
        AudioAnalyzer analyzer = new AudioAnalyzer(events::add);
        analyzer.setModel(model);
        analyzer.setAudioContextAllowed(true);

        short[] source = new short[480 + template.length * 4 + 480];
        for (int index = 0; index < template.length; index++) {
            for (int repeat = 0; repeat < 4; repeat++) {
                source[480 + index * 4 + repeat] = template[index];
            }
        }
        feed(analyzer, source, 16_000, 1_000_000L);
        check(events.size() == 1, "phone analyzer finds one numeric cue");
        check(events.get(0).cueId == 17, "phone analyzer preserves numeric cue ID");
        check(events.get(0).score >= 0.99, "phone analyzer reports strong match");
        check(analyzer.status().contains("events=1")
                        && analyzer.status().contains("lost=0"),
                "phone analyzer status exposes event and transport counters");

        List<AudioAnalyzer.CueEvent> blockedEvents = new ArrayList<>();
        AudioAnalyzer blocked = new AudioAnalyzer(blockedEvents::add);
        blocked.setModel(model);
        feed(blocked, source, 16_000, 1_000_000L);
        check(blockedEvents.isEmpty()
                        && blocked.status().contains("context=unknown"),
                "menu/unknown visual context cannot emit an audio cue");

        byte[] silence = stereoPayload(new short[200]);
        analyzer.accept(silence, 0, silence.length, 16_000, 9L, 1_100_000L);
        check(analyzer.status().contains("lost=1"),
                "phone analyzer fails closed and counts sequence gaps");
        analyzer.accept(silence, 0, silence.length, 16_000, 9L, 1_200_000L);
        check(analyzer.status().contains("outOfOrder=1"),
                "phone analyzer rejects duplicate packets");
        System.out.println("audio analyzer: " + checks + " checks passed");
    }

    private static void feed(AudioAnalyzer analyzer, short[] source, int rate,
            long firstCaptureUs) {
        int framesPerPacket = 240;
        long captureUs = firstCaptureUs;
        long sequence = 0L;
        for (int offset = 0; offset < source.length; offset += framesPerPacket) {
            int count = Math.min(framesPerPacket, source.length - offset);
            byte[] payload = new byte[count * 4];
            for (int frame = 0; frame < count; frame++) {
                int sample = source[offset + frame];
                int at = frame * 4;
                payload[at] = (byte) sample;
                payload[at + 1] = (byte) (sample >>> 8);
                payload[at + 2] = (byte) sample;
                payload[at + 3] = (byte) (sample >>> 8);
            }
            analyzer.accept(payload, 0, payload.length, rate, sequence++, captureUs);
            captureUs += (long) count * 1_000_000L / rate;
        }
    }

    private static byte[] stereoPayload(short[] samples) {
        ByteBuffer buffer = ByteBuffer.allocate(samples.length * 4)
                .order(ByteOrder.LITTLE_ENDIAN);
        for (short sample : samples) {
            buffer.putShort(sample).putShort(sample);
        }
        return buffer.array();
    }

    private static short[] signal(int count, int seed, int amplitude) {
        short[] out = new short[count];
        int state = seed;
        for (int index = 0; index < count; index++) {
            state = state * 1_103_515_245 + 12_345;
            out[index] = (short) (((state >>> 16) % (amplitude * 2)) - amplitude);
        }
        return out;
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

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
