package com.ppvaz.fnafcompanion;

import android.content.res.AssetManager;
import android.os.SystemClock;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * Device-local consumer for the reviewed Night 6 semantic plan.
 *
 * <p>The plan is the same compiled plan emitted by {@code device:emit}; this
 * class only expands its repeatable cycle and encodes the fixed HID transport.
 * The visual arm gate is deliberately not guessed here. A run is therefore
 * marked model-only in the UI and stops if the capture leaves the night screen.
 */
public final class NightRunner {
    private static final int HID_ID = 92;
    private static final int READY_DELAY_MS = 7_000;
    private static final int PORTION_UPDATE_MS = 5_000;
    private static final String PLAN_ASSET = "runners/night-6.plan";
    private static final String[] DESCRIPTOR = {
            "5", "13", "9", "4", "161", "1", "133", "1", "9", "34", "161", "0", "9", "85", "21", "0", "37", "2",
            "117", "8", "149", "1", "177", "2", "9", "84", "129", "2", "5", "13", "9", "34", "161", "2", "9",
            "66", "21", "0", "37", "1", "117", "1", "129", "2", "9", "50", "129", "2", "9", "81", "37", "63", "117", "6",
            "129", "2", "5", "1", "9", "48", "38", "95", "9", "117", "16", "129", "2", "9", "49", "38", "55",
            "4", "129", "2", "192", "5", "13", "9", "34", "161", "2", "9", "66", "21", "0", "37", "1", "117",
            "1", "129", "2", "9", "50", "129", "2", "9", "81", "37", "63", "117", "6", "129", "2", "5", "1", "9",
            "48", "38", "95", "9", "117", "16", "129", "2", "9", "49", "38", "55", "4", "129", "2", "192", "192",
            "192",
    };

    private static final Map<String, Point> CONTROL_MAP = new HashMap<>();

    static {
        CONTROL_MAP.put("mask", new Point(600, 995));
        CONTROL_MAP.put("monitor", new Point(1780, 995));
        CONTROL_MAP.put("cameraFeedLight", new Point(900, 540));
        CONTROL_MAP.put("hallLight", new Point(1200, 540));
        CONTROL_MAP.put("wind", new Point(500, 888));
        CONTROL_MAP.put("leftVentLight", new Point(350, 615));
        CONTROL_MAP.put("rightVentLight", new Point(2050, 615));
        CONTROL_MAP.put("cam:4", new Point(1728, 690));
        CONTROL_MAP.put("cam:7", new Point(1776, 606));
        CONTROL_MAP.put("cam:8", new Point(1412, 590));
        CONTROL_MAP.put("cam:9", new Point(2144, 548));
        CONTROL_MAP.put("cam:10", new Point(1984, 716));
        CONTROL_MAP.put("cam:11", new Point(2228, 652));
    }

    public interface ProgressListener {
        void onProgress(String text);
    }

    private static final class Point {
        final int x;
        final int y;

        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }
    }

    private static final class Action {
        final String cycle;
        final int atMs;
        final String kind;
        final String control;
        final int first;
        final int second;
        final int third;

        Action(String cycle, int atMs, String kind, String control,
                int first, int second, int third) {
            this.cycle = cycle;
            this.atMs = atMs;
            this.kind = kind;
            this.control = control;
            this.first = first;
            this.second = second;
            this.third = third;
        }
    }

    private static final class Plan {
        int night = -1;
        int periodMs = -1;
        int loopStartMs = -1;
        int stopAtMs = -1;
        int observeUntilMs = -1;
        int idleUntilMs = 0;
        boolean armVerify;
        final List<Action> actions = new ArrayList<>();
    }

    private static final class ScheduledAction {
        final int atMs;
        final Action action;

        ScheduledAction(int atMs, Action action) {
            this.atMs = atMs;
            this.action = action;
        }
    }

    private final AssetManager assets;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public NightRunner(AssetManager assets) {
        this.assets = assets;
    }

    public void stop() {
        cancelled.set(true);
    }

    public void execute(TermuxBridge bridge, BooleanSupplier nightStillVisible,
            ProgressListener listener) throws IOException {
        if (bridge == null || !bridge.isConnected()) {
            throw new IOException("Termux bridge is not connected");
        }
        if (nightStillVisible != null && !nightStillVisible.getAsBoolean()) {
            throw new IOException("capture is not observing FNAF2_NIGHT");
        }
        cancelled.set(false);
        Plan plan = readPlan();
        List<String> stream = compile(plan);
        if (listener != null) listener.onProgress("Sending Night 6 model route...");
        for (String line : stream) {
            if (cancelled.get()) throw new IOException("runner stopped");
            bridge.send(line);
        }

        final long started = SystemClock.elapsedRealtime();
        final long total = READY_DELAY_MS + plan.observeUntilMs + 1_000L;
        long nextUpdate = started;
        while (!cancelled.get()) {
            long elapsed = SystemClock.elapsedRealtime() - started;
            if (elapsed >= total) break;
            if (nightStillVisible != null && !nightStillVisible.getAsBoolean()) {
                bridge.sendRelease();
                throw new IOException("capture left FNAF2_NIGHT; route stopped");
            }
            if (listener != null && SystemClock.elapsedRealtime() >= nextUpdate) {
                long percent = Math.min(99L, elapsed * 100L / total);
                listener.onProgress("Night 6 route active: " + percent + "%");
                nextUpdate += PORTION_UPDATE_MS;
            }
            try {
                Thread.sleep(Math.min(250L, Math.max(25L, total - elapsed)));
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IOException("runner interrupted", interrupted);
            }
        }
        if (cancelled.get()) throw new IOException("runner stopped");
        if (listener != null) listener.onProgress("Night 6 route stream complete; outcome requires visual grading.");
    }

    private Plan readPlan() throws IOException {
        Plan plan = new Plan();
        try (InputStream input = assets.open(PLAN_ASSET);
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                        input, StandardCharsets.US_ASCII))) {
            String cycle = "";
            String raw;
            while ((raw = reader.readLine()) != null) {
                String line = raw.trim();
                if (line.isEmpty()) continue;
                if (line.startsWith("#")) {
                    String[] fields = line.substring(1).trim().split("\\s+");
                    if (fields.length == 0) continue;
                    switch (fields[0]) {
                        case "night": plan.night = integer(fields, 1, "night"); break;
                        case "period": plan.periodMs = integer(fields, 1, "period"); break;
                        case "loop-start": plan.loopStartMs = integer(fields, 1, "loop-start"); break;
                        case "stop-at": plan.stopAtMs = integer(fields, 1, "stop-at"); break;
                        case "observe-until": plan.observeUntilMs = integer(fields, 1, "observe-until"); break;
                        case "idle-until": plan.idleUntilMs = integer(fields, 1, "idle-until"); break;
                        case "arm-verify": plan.armVerify = fields.length > 1 && "1".equals(fields[1]); break;
                        case "cycle":
                            if (fields.length < 2) throw new IOException("plan cycle is incomplete");
                            cycle = fields[1];
                            break;
                        default:
                            // Other headers are identity metadata, not executable input.
                            break;
                    }
                    continue;
                }
                if (cycle.isEmpty()) throw new IOException("plan action has no cycle");
                String[] fields = line.split("\\s+");
                if (fields.length < 3) throw new IOException("plan action is incomplete");
                int at = parseInt(fields[0], "action time");
                String kind = fields[1];
                if ("tap".equals(kind) || "hold".equals(kind)) {
                    if (fields.length != 4) throw new IOException("plan contact shape is invalid");
                    plan.actions.add(new Action(cycle, at, kind, normalizeControl(fields[2]),
                            parseInt(fields[3], "contact"), 0, 0));
                } else if ("hall".equals(kind)) {
                    if (fields.length != 3) throw new IOException("plan hall shape is invalid");
                    plan.actions.add(new Action(cycle, at, kind, "hallLight",
                            parseInt(fields[2], "hall contact"), 0, 0));
                } else if ("camdrop".equals(kind)) {
                    if (fields.length != 5) throw new IOException("plan camdrop shape is invalid");
                    plan.actions.add(new Action(cycle, at, kind, "cameraFeedLight",
                            parseInt(fields[2], "camdrop lead"),
                            parseInt(fields[3], "camdrop contact"),
                            parseInt(fields[4], "camdrop tail")));
                } else {
                    throw new IOException("unsupported Night 6 plan action: " + kind);
                }
            }
        }
        if (plan.night != 6 || plan.periodMs <= 0 || plan.loopStartMs < 0
                || plan.stopAtMs <= plan.loopStartMs || plan.observeUntilMs < plan.stopAtMs
                || plan.actions.isEmpty() || !plan.armVerify) {
            throw new IOException("Night 6 plan identity or timing is invalid");
        }
        return plan;
    }

    private List<String> compile(Plan plan) throws IOException {
        List<ScheduledAction> scheduled = new ArrayList<>();
        for (Action action : plan.actions) {
            if ("opening".equals(action.cycle)) {
                scheduled.add(new ScheduledAction(action.atMs, action));
            } else if ("toys".equals(action.cycle)) {
                for (int base = Math.max(plan.loopStartMs, plan.idleUntilMs);
                        base < plan.stopAtMs; base += plan.periodMs) {
                    int at = base + action.atMs;
                    if (at < plan.stopAtMs) scheduled.add(new ScheduledAction(at, action));
                }
            }
        }
        scheduled.sort(Comparator.comparingInt(item -> item.atMs));
        List<String> lines = new ArrayList<>();
        lines.add(registerLine());
        addDelay(lines, READY_DELAY_MS);
        int cursor = 0;
        for (ScheduledAction scheduledAction : scheduled) {
            if (scheduledAction.atMs < cursor) {
                throw new IOException("Night 6 HID actions overlap at " + scheduledAction.atMs + " ms");
            }
            addDelay(lines, scheduledAction.atMs - cursor);
            int duration = addAction(lines, scheduledAction.action);
            cursor = scheduledAction.atMs + duration;
        }
        if (cursor > plan.observeUntilMs) throw new IOException("Night 6 route exceeds its observation envelope");
        addDelay(lines, plan.observeUntilMs - cursor);
        return lines;
    }

    private int addAction(List<String> lines, Action action) throws IOException {
        if ("camdrop".equals(action.kind)) {
            Point light = point("cameraFeedLight");
            Point monitor = point("monitor");
            lines.add(reportSingle(active(light)));
            addDelay(lines, action.first);
            lines.add(reportTwo(active(light), active(monitor)));
            addDelay(lines, action.second);
            lines.add(reportTwo(active(light), released(monitor)));
            addDelay(lines, action.third);
            lines.add(reportTwo(released(light), released(monitor)));
            return action.first + action.second + action.third;
        }
        Point target = point(action.control);
        lines.add(reportSingle(active(target)));
        addDelay(lines, action.first);
        lines.add(reportSingle(released(target)));
        return action.first;
    }

    private static String normalizeControl(String control) throws IOException {
        if (control.startsWith("cam") && !control.startsWith("cam:")) {
            control = "cam:" + control.substring(3);
        }
        if (!CONTROL_MAP.containsKey(control)) throw new IOException("unknown Night 6 control: " + control);
        return control;
    }

    private static Point point(String control) throws IOException {
        Point point = CONTROL_MAP.get(control);
        if (point == null) throw new IOException("missing Night 6 control map: " + control);
        return point;
    }

    private static String registerLine() {
        StringBuilder descriptor = new StringBuilder();
        descriptor.append('[');
        for (int index = 0; index < DESCRIPTOR.length; index++) {
            if (index > 0) descriptor.append(',');
            descriptor.append(DESCRIPTOR[index]);
        }
        descriptor.append(']');
        return "{\"id\":92,\"command\":\"register\",\"name\":\"FNAF Timed Touch\","
                + "\"vid\":6353,\"pid\":61959,\"bus\":\"usb\",\"descriptor\":"
                + descriptor + ",\"feature_reports\":[{\"id\":1,\"data\":[0]}]}";
    }

    private static String active(Point point) {
        return contact(3, point);
    }

    private static String released(Point point) {
        return contact(0, point);
    }

    private static String contact(int flags, Point point) {
        int rawX = (1080 - point.y) * 20 / 9;
        int rawY = point.x * 9 / 20;
        return "[" + flags + "," + (rawX & 255) + "," + ((rawX >> 8) & 255)
                + "," + (rawY & 255) + "," + ((rawY >> 8) & 255) + "]";
    }

    private static String reportSingle(String contact) {
        String filler = contact.startsWith("[0,") ? "[4,0,0,0,0]" : "[0,0,0,0,0]";
        return "{\"id\":92,\"command\":\"report\",\"report\":[1,1,"
                + contact.substring(1, contact.length() - 1) + "," + filler.substring(1, filler.length() - 1) + "]}";
    }

    private static String reportTwo(String first, String second) {
        return "{\"id\":92,\"command\":\"report\",\"report\":[1,2,"
                + first.substring(1, first.length() - 1) + ","
                + second.substring(1, second.length() - 1) + "]}";
    }

    private static void addDelay(List<String> lines, int duration) {
        if (duration > 0) lines.add("{\"id\":92,\"command\":\"delay\",\"duration\":" + duration + "}");
    }

    private static int integer(String[] fields, int index, String label) throws IOException {
        if (fields.length <= index) throw new IOException("plan " + label + " is missing");
        return parseInt(fields[index], label);
    }

    private static int parseInt(String value, String label) throws IOException {
        try {
            int result = Integer.parseInt(value);
            if (result < 0) throw new NumberFormatException("negative");
            return result;
        } catch (NumberFormatException error) {
            throw new IOException("plan " + label + " is invalid", error);
        }
    }
}
