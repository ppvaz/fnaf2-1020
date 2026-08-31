package com.fnaf2.cuehelper;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Locale;

/**
 * Phone-side PCM analyzer for the ESP32 bridge.
 *
 * <p>The bridge supplies timestamped stereo PCM. This class reduces it to
 * mono, resamples it to the model rate and runs the bounded numeric matcher
 * away from the Android UI. It deliberately emits numeric template IDs; the
 * visual/context layer decides what an observed ID means for a run.</p>
 */
public final class AudioAnalyzer {
    public static final int MODEL_RATE = CueDetector.MODEL_RATE;
    private static final int PCM_BYTES_PER_FRAME = 4;
    private static final int RESAMPLE_RATE = MODEL_RATE;
    private static final int MATCH_HOP_SAMPLES = 16;
    private static final long REFRACTORY_NS = 300_000_000L;
    private static final int MAX_TEMPLATES = 16;
    private static final int RESAMPLE_BUFFER_SAMPLES = 8_192;

    public interface Listener {
        void onCue(CueEvent event);
    }

    public static final class CueEvent {
        public final int cueId;
        public final String cue;
        public final long onsetNs;
        public final double score;
        public final double margin;
        public final long sourceSequence;

        CueEvent(int cueId, String cue, long onsetNs, double score,
                double margin, long sourceSequence) {
            this.cueId = cueId;
            this.cue = cue;
            this.onsetNs = onsetNs;
            this.score = score;
            this.margin = margin;
            this.sourceSequence = sourceSequence;
        }
    }

    private final Listener listener;
    private final short[] monoPacket = new short[300];
    private final short[] resampleBuffer = new short[RESAMPLE_BUFFER_SAMPLES];
    private final short[] modelRing = new short[4_032];
    private final long[] modelTimes = new long[4_032];
    private final long[] lastCueNs = new long[MAX_TEMPLATES];
    private int resampleRead;
    private int resampleCount;
    private double resamplePosition;
    private double resampleStep;
    private long resampleFirstNs;
    private int sourceRate;
    private int modelRingWrite;
    private int modelRingCount;
    private long modelSampleCount;
    private long lastSequence = -1L;
    private long packets;
    private long lostPackets;
    private long outOfOrderPackets;
    private long invalidPackets;
    private long analyzedFrames;
    private long emittedEvents;
    private double maxObservedScore;
    private int currentRate;
    private CueDetector.Model model;
    private int maxTemplateSamples;
    private final PhaseClock phaseClock = new PhaseClock();
    private boolean audioContextAllowed;

    public AudioAnalyzer(Listener listener) {
        this.listener = listener;
    }

    public synchronized void setModel(CueDetector.Model next) {
        if (next == null || next.templates.length > MAX_TEMPLATES
                || next.maxTemplateSamples > modelRing.length) {
            throw new IllegalArgumentException("audio-model-too-large");
        }
        for (int index = 0; index < next.templates.length; index++) {
            try {
                int id = Integer.parseInt(next.templates[index].id);
                if (id < 0 || id > 65_535) {
                    throw new NumberFormatException("range");
                }
            } catch (NumberFormatException error) {
                throw new IllegalArgumentException("audio-model-id-not-numeric", error);
            }
        }
        model = next;
        maxTemplateSamples = next.maxTemplateSamples;
        resetStream();
        phaseClock.reset();
    }

    public synchronized void clearModel() {
        model = null;
        maxTemplateSamples = 0;
        resetStream();
        phaseClock.reset();
    }

    /** Reset transport and matcher state for a new capture session, retaining the model. */
    public synchronized void resetSession() {
        lastSequence = -1L;
        packets = 0L;
        lostPackets = 0L;
        outOfOrderPackets = 0L;
        invalidPackets = 0L;
        analyzedFrames = 0L;
        emittedEvents = 0L;
        maxObservedScore = 0.0;
        currentRate = 0;
        audioContextAllowed = false;
        phaseClock.reset();
        resetStream();
    }

    /** Permit numeric cue events only while the visual layer identifies a night. */
    public synchronized void setAudioContextAllowed(boolean allowed) {
        if (audioContextAllowed == allowed) {
            return;
        }
        audioContextAllowed = allowed;
        if (!allowed) {
            phaseClock.reset();
            for (int index = 0; index < lastCueNs.length; index++) {
                lastCueNs[index] = 0L;
            }
        }
    }

    public static CueDetector.Model readModel(File file) throws IOException {
        if (file == null || !file.isFile()) {
            throw new IOException("audio-model-not-found");
        }
        try (FileInputStream input = new FileInputStream(file)) {
            return CueDetector.Model.read(input);
        }
    }

    /** Accept one validated ESP32 PCM payload, including its first-frame time. */
    public synchronized void accept(byte[] payload, int offset, int length,
            int sampleRateHz, long sequence, long firstCaptureUs) {
        if (payload == null || offset < 0 || length < 0
                || offset + length > payload.length
                || length == 0 || length % PCM_BYTES_PER_FRAME != 0
                || sampleRateHz <= 0) {
            invalidPackets++;
            return;
        }
        if (lastSequence >= 0L) {
            long delta = (sequence - lastSequence) & 0xffff_ffffL;
            if (delta == 0L || delta > 0x8000_0000L) {
                outOfOrderPackets++;
                return;
            }
            if (delta > 1L) {
                lostPackets += delta - 1L;
                resetStream();
            }
        }
        lastSequence = sequence;
        if (sourceRate != sampleRateHz) {
            sourceRate = sampleRateHz;
            currentRate = sampleRateHz;
            resampleStep = sourceRate / (double) RESAMPLE_RATE;
            resetResampler();
            phaseClock.reset();
        }
        int frameCount = length / PCM_BYTES_PER_FRAME;
        if (frameCount > monoPacket.length) {
            invalidPackets++;
            return;
        }
        for (int frame = 0; frame < frameCount; frame++) {
            int at = offset + frame * PCM_BYTES_PER_FRAME;
            int left = (short) ((payload[at] & 0xff)
                    | ((payload[at + 1] & 0xff) << 8));
            int right = (short) ((payload[at + 2] & 0xff)
                    | ((payload[at + 3] & 0xff) << 8));
            monoPacket[frame] = (short) ((left + right) / 2);
        }
        packets++;
        analyzedFrames += frameCount;
        long firstNs = firstCaptureUs * 1_000L;
        for (int frame = 0; frame < frameCount; frame++) {
            long sampleNs = firstNs
                    + (long) frame * 1_000_000_000L / sampleRateHz;
            addSourceSample(monoPacket[frame], sampleNs, sequence);
        }
    }

    public synchronized String status() {
        if (model == null) {
            return "audioAnalyzer=UNAVAILABLE reason=model-missing packets=" + packets
                    + " lost=" + lostPackets;
        }
        return String.format(Locale.US,
                "audioAnalyzer=READY context=%s calibration=%s evidence=%s templates=%d "
                        + "rate=%d packets=%d frames=%d modelSamples=%d lost=%d "
                        + "outOfOrder=%d events=%d maxScore=%.4f",
                audioContextAllowed ? "night" : "unknown", model.calibration,
                model.evidence, model.templates.length, currentRate, packets,
                analyzedFrames, modelSampleCount, lostPackets, outOfOrderPackets,
                emittedEvents, maxObservedScore) + " "
                + phaseClock.status(audioContextAllowed);
    }

    private void addSourceSample(short sample, long sampleNs, long sequence) {
        if (resampleCount == 0) {
            resampleFirstNs = sampleNs;
        }
        if (resampleCount == resampleBuffer.length) {
            invalidPackets++;
            resetStream();
            resampleFirstNs = sampleNs;
        }
        int write = (resampleRead + resampleCount) % resampleBuffer.length;
        resampleBuffer[write] = sample;
        resampleCount++;
        while (resamplePosition + 1.0 < resampleCount) {
            int leftOffset = (int) resamplePosition;
            int leftIndex = (resampleRead + leftOffset) % resampleBuffer.length;
            int rightIndex = (leftIndex + 1) % resampleBuffer.length;
            int left = resampleBuffer[leftIndex];
            int right = resampleBuffer[rightIndex];
            double fraction = resamplePosition - leftOffset;
            short reduced = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE,
                    Math.round(left + (right - left) * fraction)));
            long reducedNs = resampleFirstNs
                    + (long) (resamplePosition * 1_000_000_000L / sourceRate);
            acceptModelSample(reduced, reducedNs, sequence);
            resamplePosition += resampleStep;
        }
        // The next interpolation point may be ahead of the samples currently
        // buffered (for example, a 4x decimation after the first output). Do
        // not consume past the last sample: the future right-hand sample is
        // still needed to make that point valid.
        int consumed = Math.min((int) resamplePosition, resampleCount - 1);
        if (consumed > 0) {
            resampleRead = (resampleRead + consumed) % resampleBuffer.length;
            resampleCount -= consumed;
            resampleFirstNs += (long) consumed * 1_000_000_000L / sourceRate;
            resamplePosition -= consumed;
        }
    }

    private void acceptModelSample(short sample, long sampleNs, long sequence) {
        if (model == null || maxTemplateSamples == 0) {
            return;
        }
        modelRing[modelRingWrite] = sample;
        modelTimes[modelRingWrite] = sampleNs;
        modelRingWrite = (modelRingWrite + 1) % modelRing.length;
        if (modelRingCount < modelRing.length) {
            modelRingCount++;
        }
        modelSampleCount++;
        if (modelSampleCount % MATCH_HOP_SAMPLES != 0) {
            return;
        }

        int bestIndex = -1;
        double bestScore = -1.0;
        for (int index = 0; index < model.templates.length; index++) {
            CueDetector.Template template = model.templates[index];
            if (modelRingCount < template.pcm.length) {
                continue;
            }
            double score = score(template);
            if (score > maxObservedScore) {
                maxObservedScore = score;
            }
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }
        if (bestIndex < 0) {
            return;
        }
        CueDetector.Template best = model.templates[bestIndex];
        double otherScore = 0.0;
        for (int index = 0; index < model.templates.length; index++) {
            CueDetector.Template candidate = model.templates[index];
            if (index == bestIndex || candidate.cue.equals(best.cue)
                    || modelRingCount < candidate.pcm.length) {
                continue;
            }
            otherScore = Math.max(otherScore, score(candidate));
        }
        double margin = bestScore - otherScore;
        if (bestScore < best.threshold || margin < model.margin) {
            return;
        }
        // Menu music and other screens may contain generic material that looks
        // like a template. Keep score/transport telemetry, but never emit a
        // cue or advance the phase clock without the visual night gate.
        if (!audioContextAllowed) {
            return;
        }
        long onsetNs = modelTimes[(modelRingWrite - best.pcm.length
                + modelRing.length) % modelRing.length];
        if (onsetNs - lastCueNs[bestIndex] < REFRACTORY_NS) {
            return;
        }
        lastCueNs[bestIndex] = onsetNs;
        int cueId;
        try {
            cueId = Integer.parseInt(best.id);
        } catch (NumberFormatException error) {
            return;
        }
        emittedEvents++;
        if (cueId == PhaseClock.CUE_ID) {
            phaseClock.observe(onsetNs, bestScore);
        }
        if (listener != null) {
            listener.onCue(new CueEvent(cueId, best.cue, onsetNs, bestScore,
                    margin, sequence));
        }
    }

    private double score(CueDetector.Template template) {
        int start = (modelRingWrite - template.pcm.length + modelRing.length)
                % modelRing.length;
        long dot = 0L;
        long observedEnergy = 0L;
        int at = start;
        for (short reference : template.pcm) {
            int observed = modelRing[at];
            dot += (long) observed * reference;
            observedEnergy += (long) observed * observed;
            at = (at + 1) % modelRing.length;
        }
        if (observedEnergy <= 0L || template.energy <= 0.0) {
            return 0.0;
        }
        return dot / Math.sqrt(template.energy * observedEnergy);
    }

    private void resetStream() {
        resetResampler();
        modelRingWrite = 0;
        modelRingCount = 0;
        modelSampleCount = 0L;
        for (int index = 0; index < lastCueNs.length; index++) {
            lastCueNs[index] = 0L;
        }
    }

    private void resetResampler() {
        resampleRead = 0;
        resampleCount = 0;
        resamplePosition = 0.0;
        resampleFirstNs = 0L;
    }
}
