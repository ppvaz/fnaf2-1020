package com.fnaf2.cuehelper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Bounded, allocation-free-on-the-hot-path cue matcher.
 *
 * <p>The committed APK contains no game audio and no promoted threshold. A
 * model is provisioned into app-private storage and contains short, resampled
 * correlation cores plus its evidence level. "shadow" models may produce
 * observations but are refused for control windows; only a model whose
 * session-separated holdout has promoted it to "heldout" can be armed in
 * control mode.</p>
 */
public final class CueDetector {
    public static final int MODEL_RATE = 4_000;
    private static final int MAX_TEMPLATES = 16;
    private static final int MAX_TEMPLATE_SAMPLES = MODEL_RATE;
    private static final int MIN_TEMPLATE_SAMPLES = 128;
    private static final int SCORE_STRIDE = 4; // one candidate per millisecond
    private static final long MAX_WINDOW_NS = 30_000_000_000L;
    private static final long MAX_PAST_OPEN_NS = 250_000_000L;
    private static final double MAX_CLIPPED_FRACTION = 0.001;
    private static final double SILENCE_RMS = 3.0;
    private static final int MAX_EVENTS = 32;
    private static final int MAX_MODEL_BYTES = 1_000_000;
    // Adjacent NCC positions and alternate templates for one spoken clip must
    // not become multiple route movements. Different cue classes are retained
    // independently, so BB's voice + bang composite survives this filter.
    private static final long SAME_CUE_REFRACTORY_NS = 300_000_000L;

    private static final class Event {
        String cue;
        String template;
        long cueNs;
        double score;
        double margin;

        Event(String cue, String template, long cueNs, double score, double margin) {
            this.cue = cue;
            this.template = template;
            this.cueNs = cueNs;
            this.score = score;
            this.margin = margin;
        }
    }

    public static final class Template {
        final String cue;
        final String id;
        final double threshold;
        final short[] pcm;
        final double energy;

        Template(String cue, String id, double threshold, short[] pcm) {
            this.cue = cue;
            this.id = id;
            this.threshold = threshold;
            this.pcm = pcm;
            double sum = 0.0;
            for (short value : pcm) {
                sum += (double) value * value;
            }
            this.energy = sum;
        }
    }

    public static final class Model {
        final String calibration;
        final String evidence;
        final String reportSha256;
        final String sourceSha256;
        final double margin;
        final Template[] templates;
        final int maxTemplateSamples;

        Model(String calibration, String evidence, String reportSha256, String sourceSha256,
                double margin, Template[] templates) {
            this.calibration = calibration;
            this.evidence = evidence;
            this.reportSha256 = reportSha256;
            this.sourceSha256 = sourceSha256;
            this.margin = margin;
            this.templates = templates;
            int longest = 0;
            for (Template template : templates) {
                longest = Math.max(longest, template.pcm.length);
            }
            this.maxTemplateSamples = longest;
        }

        /** Read the deliberately small, auditable cue-model-v1 text format. */
        public static Model read(InputStream input) throws IOException {
            ByteArrayOutputStream copy = new ByteArrayOutputStream();
            byte[] block = new byte[8192];
            int read;
            while ((read = input.read(block)) != -1) {
                if (copy.size() + read > MAX_MODEL_BYTES) {
                    throw new IOException("model-too-large");
                }
                copy.write(block, 0, read);
            }
            byte[] source = copy.toByteArray();
            String sourceSha256 = digest(source);
            BufferedReader reader = new BufferedReader(new InputStreamReader(
                    new ByteArrayInputStream(source), StandardCharsets.US_ASCII));
            String header = reader.readLine();
            if (header == null || !header.startsWith("cue-model-v1 ")) {
                throw new IOException("model-header");
            }
            String calibration = field(header, "calibration");
            String evidence = field(header, "evidence");
            String reportSha256 = field(header, "reportSha256");
            String rate = field(header, "rate");
            String marginText = field(header, "margin");
            if (!safeName(calibration) || !("shadow".equals(evidence)
                    || "heldout".equals(evidence))
                    || !String.valueOf(MODEL_RATE).equals(rate)) {
                throw new IOException("model-metadata");
            }
            if ("heldout".equals(evidence) && !sha256(reportSha256)) {
                throw new IOException("model-holdout-report");
            }
            if ("shadow".equals(evidence) && reportSha256 != null) {
                throw new IOException("model-holdout-report");
            }
            double margin = parseUnit(marginText, "model-margin");
            List<Template> templates = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty() || line.charAt(0) == '#') {
                    continue;
                }
                if (!line.startsWith("template ")) {
                    throw new IOException("model-line");
                }
                String cue = field(line, "cue");
                String id = field(line, "id");
                double threshold = parseUnit(field(line, "threshold"),
                        "model-threshold");
                String encoded = field(line, "pcm");
                if (!safeName(cue) || !safeName(id) || encoded == null) {
                    throw new IOException("model-template-metadata");
                }
                byte[] bytes;
                try {
                    bytes = Base64.getDecoder().decode(encoded);
                } catch (IllegalArgumentException error) {
                    throw new IOException("model-base64", error);
                }
                if ((bytes.length & 1) != 0) {
                    throw new IOException("model-pcm-alignment");
                }
                int count = bytes.length / 2;
                if (count < MIN_TEMPLATE_SAMPLES || count > MAX_TEMPLATE_SAMPLES) {
                    throw new IOException("model-template-length");
                }
                short[] pcm = new short[count];
                ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
                for (int i = 0; i < count; i++) {
                    pcm[i] = buffer.getShort();
                }
                Template template = new Template(cue, id, threshold, pcm);
                if (template.energy <= 0.0) {
                    throw new IOException("model-silent-template");
                }
                templates.add(template);
                if (templates.size() > MAX_TEMPLATES) {
                    throw new IOException("model-too-many-templates");
                }
            }
            if (templates.isEmpty()) {
                throw new IOException("model-empty");
            }
            return new Model(calibration, evidence, reportSha256, sourceSha256, margin,
                    templates.toArray(new Template[0]));
        }

        private static String digest(byte[] source) throws IOException {
            try {
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(source);
                StringBuilder out = new StringBuilder(64);
                for (byte value : digest) {
                    out.append(String.format(Locale.US, "%02x", value & 0xff));
                }
                return out.toString();
            } catch (NoSuchAlgorithmException error) {
                throw new IOException("model-sha256-unavailable", error);
            }
        }

        private static String field(String line, String name) {
            String prefix = name + "=";
            for (String item : line.split(" ")) {
                if (item.startsWith(prefix)) {
                    return item.substring(prefix.length());
                }
            }
            return null;
        }

        private static double parseUnit(String text, String reason) throws IOException {
            try {
                double value = Double.parseDouble(text);
                if (!Double.isFinite(value) || value < 0.0 || value > 1.0) {
                    throw new IOException(reason);
                }
                return value;
            } catch (NullPointerException | NumberFormatException error) {
                throw new IOException(reason, error);
            }
        }

        private static boolean sha256(String value) {
            if (value == null || value.length() != 64) {
                return false;
            }
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
                    return false;
                }
            }
            return true;
        }
    }

    private Model model;
    private short[] history = new short[1];
    private long[] historyNs = new long[1];
    private int historyWrite;
    private long modelSamples;
    private int inputRate;
    private int downsampleFactor;
    private long downsampleSum;
    private int downsampleCount;
    private long lastInputEndNs;

    private String windowId;
    private String windowMode;
    private long windowOpenNs;
    private long windowCloseNs;
    private Set<String> windowCues = Collections.emptySet();
    private String terminal;
    private final Event[] events = new Event[MAX_EVENTS];
    private int eventCount;
    private long windowInputSamples;
    private long windowEnergy;
    private long windowClipped;
    private double bestScore;
    private String bestCue = "none";
    private String bestTemplate = "none";
    private String faultReason;

    public synchronized void setModel(Model next) {
        model = next;
        history = new short[next.maxTemplateSamples + 32];
        historyNs = new long[history.length];
        historyWrite = 0;
        modelSamples = 0;
        resetResampler();
        clearWindow();
    }

    public synchronized String arm(String id, String cueSet, long openNs,
            long closeNs, String mode, long nowNs) {
        if (model == null) {
            return "ERROR detector-no-model";
        }
        if (!safeName(id) || !("shadow".equals(mode) || "control".equals(mode))) {
            return "ERROR arm-usage";
        }
        if ("control".equals(mode) && !"heldout".equals(model.evidence)) {
            return "ERROR detector-model-not-promoted";
        }
        if (windowId != null && terminal == null && nowNs < windowCloseNs) {
            return "ERROR detector-window-active";
        }
        if (openNs < nowNs - MAX_PAST_OPEN_NS || closeNs <= nowNs
                || closeNs <= openNs || closeNs - openNs > MAX_WINDOW_NS) {
            return "ERROR arm-range";
        }
        Set<String> cues = new HashSet<>();
        if ("all".equals(cueSet)) {
            for (Template template : model.templates) {
                cues.add(template.cue);
            }
        } else {
            for (String cue : cueSet.split(",")) {
                if (!safeName(cue)) {
                    return "ERROR arm-cue-set";
                }
                cues.add(cue);
            }
        }
        boolean known = false;
        for (Template template : model.templates) {
            known |= cues.contains(template.cue);
        }
        if (!known) {
            return "ERROR detector-unknown-cue";
        }

        windowId = id;
        windowMode = mode;
        windowOpenNs = openNs;
        windowCloseNs = closeNs;
        windowCues = cues;
        terminal = null;
        eventCount = 0;
        windowInputSamples = 0;
        windowEnergy = 0;
        windowClipped = 0;
        bestScore = 0.0;
        bestCue = "none";
        bestTemplate = "none";
        faultReason = null;
        return String.format(Locale.US,
                "OK armed=%s cues=%s mode=%s openNs=%d closeNs=%d calibration=%s",
                id, cueSet, mode, openNs, closeNs, model.calibration);
    }

    public synchronized String result(String id, long nowNs) {
        if (!safeName(id) || windowId == null || !windowId.equals(id)) {
            return "ERROR detector-unknown-window";
        }
        completeIfExpired(nowNs);
        if (terminal != null) {
            return terminal;
        }
        return "PENDING window=" + windowId + " closeNs=" + windowCloseNs
                + " count=" + eventCount + formatEvents();
    }

    /** Feed one AudioRecord read. No objects are allocated in this method. */
    public synchronized void accept(short[] samples, int count, int rate,
            long chunkEndNs) {
        if (model == null || count <= 0) {
            return;
        }
        if (rate <= 0 || rate % MODEL_RATE != 0) {
            markFault("unsupported-rate");
            return;
        }
        if (inputRate != rate) {
            inputRate = rate;
            downsampleFactor = rate / MODEL_RATE;
            downsampleSum = 0;
            downsampleCount = 0;
            lastInputEndNs = 0;
        }
        long chunkDurationNs = (long) count * 1_000_000_000L / rate;
        long chunkStartNs = chunkEndNs - chunkDurationNs;
        if (lastInputEndNs > 0 && Math.abs(chunkStartNs - lastInputEndNs) > 250_000_000L) {
            markFault("audio-discontinuity");
        }
        lastInputEndNs = chunkEndNs;

        boolean overlaps = windowId != null && terminal == null
                && chunkEndNs >= windowOpenNs && chunkStartNs <= windowCloseNs;
        for (int i = 0; i < count; i++) {
            short value = samples[i];
            long sampleNs = chunkStartNs
                    + (long) (i + 1) * 1_000_000_000L / rate;
            if (overlaps && sampleNs >= windowOpenNs && sampleNs <= windowCloseNs) {
                windowInputSamples++;
                windowEnergy += (long) value * value;
                if (value == Short.MIN_VALUE || Math.abs((int) value) >= 32_604) {
                    windowClipped++;
                }
            }
            downsampleSum += value;
            downsampleCount++;
            if (downsampleCount == downsampleFactor) {
                short reduced = (short) (downsampleSum / downsampleFactor);
                downsampleSum = 0;
                downsampleCount = 0;
                appendModelSample(reduced, sampleNs);
            }
        }
        completeIfExpired(chunkEndNs);
    }

    public synchronized void unavailable(String reason) {
        markFault(safeName(reason) ? reason : "detector-unavailable");
    }

    public synchronized String status() {
        if (model == null) {
            return "detector=UNAVAILABLE reason=model-missing";
        }
        String state = windowId == null ? "READY" : terminal == null ? "ARMED" : "RESULT";
        return "detector=" + state + " calibration=" + model.calibration
                + " evidence=" + model.evidence
                + " modelSha256=" + model.sourceSha256
                + (model.reportSha256 == null ? "" : " reportSha256=" + model.reportSha256)
                + " templates=" + model.templates.length;
    }

    private void appendModelSample(short value, long sampleNs) {
        history[historyWrite] = value;
        historyNs[historyWrite] = sampleNs;
        historyWrite = (historyWrite + 1) % history.length;
        modelSamples++;
        if (windowId == null || terminal != null || sampleNs < windowOpenNs
                || sampleNs > windowCloseNs || modelSamples % SCORE_STRIDE != 0) {
            return;
        }

        double firstScore = -1.0;
        double secondScore = -1.0;
        Template first = null;
        for (Template template : model.templates) {
            if (!windowCues.contains(template.cue) || modelSamples < template.pcm.length) {
                continue;
            }
            int start = historyWrite - template.pcm.length;
            while (start < 0) {
                start += history.length;
            }
            long onsetNs = historyNs[start];
            if (onsetNs < windowOpenNs) {
                continue;
            }
            long dot = 0;
            long localEnergy = 0;
            int at = start;
            for (short reference : template.pcm) {
                int observed = history[at];
                dot += (long) observed * reference;
                localEnergy += (long) observed * observed;
                at++;
                if (at == history.length) {
                    at = 0;
                }
            }
            if (localEnergy <= 0) {
                continue;
            }
            double score = dot / Math.sqrt(template.energy * localEnergy);
            if (score > bestScore) {
                bestScore = score;
                bestCue = template.cue;
                bestTemplate = template.id;
            }
            if (score > firstScore) {
                if (first != null && !first.cue.equals(template.cue)) {
                    secondScore = firstScore;
                }
                firstScore = score;
                first = template;
            } else if (first != null && !first.cue.equals(template.cue)
                    && score > secondScore) {
                secondScore = score;
            }
        }
        if (first == null || firstScore < first.threshold) {
            return;
        }
        double other = Math.max(0.0, secondScore);
        if (firstScore - other < model.margin) {
            return;
        }
        int start = historyWrite - first.pcm.length;
        while (start < 0) {
            start += history.length;
        }
        recordEvent(first.cue, first.id, historyNs[start], firstScore,
                firstScore - other);
    }

    private void recordEvent(String cue, String template, long cueNs,
            double score, double margin) {
        for (int i = eventCount - 1; i >= 0; i--) {
            Event previous = events[i];
            if (!previous.cue.equals(cue)) {
                continue;
            }
            if (cueNs - previous.cueNs >= SAME_CUE_REFRACTORY_NS) {
                break;
            }
            // Keep the strongest alignment for one physical cue. Its onset is
            // still the template onset associated with that strongest score.
            if (score > previous.score) {
                previous.template = template;
                previous.cueNs = cueNs;
                previous.score = score;
                previous.margin = margin;
            }
            return;
        }
        if (eventCount == events.length) {
            markFault("event-overflow");
            return;
        }
        events[eventCount++] = new Event(cue, template, cueNs, score, margin);
    }

    private String formatEvents() {
        if (eventCount == 0) {
            return " events=none";
        }
        StringBuilder out = new StringBuilder(" events=");
        for (int i = 0; i < eventCount; i++) {
            if (i > 0) {
                out.append(',');
            }
            Event event = events[i];
            out.append(event.cue).append(':').append(event.template).append(':')
                    .append(event.cueNs).append(':')
                    .append(String.format(Locale.US, "%.4f", event.score)).append(':')
                    .append(String.format(Locale.US, "%.4f", event.margin));
        }
        return out.toString();
    }

    private void completeIfExpired(long nowNs) {
        if (windowId == null || terminal != null || nowNs < windowCloseNs) {
            return;
        }
        if (faultReason != null) {
            terminal = "UNKNOWN window=" + windowId + " reason=" + faultReason
                    + " mode=" + windowMode;
            return;
        }
        if (windowInputSamples == 0) {
            terminal = "UNKNOWN window=" + windowId + " reason=no-audio mode=" + windowMode;
            return;
        }
        if ((double) windowClipped / windowInputSamples > MAX_CLIPPED_FRACTION) {
            terminal = "UNKNOWN window=" + windowId + " reason=clipped mode=" + windowMode;
            return;
        }
        double rms = Math.sqrt((double) windowEnergy / windowInputSamples);
        if (rms < SILENCE_RMS) {
            terminal = "UNKNOWN window=" + windowId + " reason=silent mode=" + windowMode;
            return;
        }
        if (eventCount > 0) {
            terminal = "HIT window=" + windowId + " count=" + eventCount
                    + formatEvents() + " closeNs=" + windowCloseNs
                    + " mode=" + windowMode;
            return;
        }
        terminal = String.format(Locale.US,
                "MISS window=%s closeNs=%d bestCue=%s template=%s score=%.4f mode=%s",
                windowId, windowCloseNs, bestCue, bestTemplate, bestScore, windowMode);
    }

    private void markFault(String reason) {
        if (windowId != null && terminal == null) {
            faultReason = reason;
        }
    }

    private void resetResampler() {
        inputRate = 0;
        downsampleFactor = 0;
        downsampleSum = 0;
        downsampleCount = 0;
        lastInputEndNs = 0;
    }

    private void clearWindow() {
        windowId = null;
        windowMode = null;
        windowCues = Collections.emptySet();
        terminal = null;
        faultReason = null;
    }

    private static boolean safeName(String value) {
        if (value == null || value.isEmpty() || value.length() > 64) {
            return false;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z')
                    && !(c >= '0' && c <= '9') && c != '.' && c != '_' && c != '-') {
                return false;
            }
        }
        return true;
    }
}
