package com.ppvaz.fnafcompanion;

import android.content.res.AssetManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The APK's allow-list for local routes.
 *
 * <p>A plan being present in the APK is not permission to actuate it.  A
 * catalog entry is runnable only when the exact plan is marked ready, its
 * claim is device-measured, a 6 AM result is bound to that plan, and the
 * required visual/adaptive adapters are available.  Missing or malformed
 * readiness fields fail closed and remain visible as disabled entries.</p>
 */
public final class RunnerCatalog {
    public static final String ASSET = "runners/catalog.json";
    private static final String SCHEMA = "runner-catalog-v1";

    public interface Item {
        boolean isRunnable();
        String displayLabel();
        String disabledReason();
    }

    public static final class Route implements Item {
        public final String id;
        public final String strategy;
        public final String strategyLabel;
        public final int night;
        public final String planAsset;
        public final String presetId;
        public final String readiness;
        public final String gateClaimLevel;
        public final boolean enabled;
        public final boolean sixAmProof;
        public final boolean planBoundToProof;
        public final boolean adaptersReady;
        public final String reason;
        public final boolean assetPresent;

        private Route(String id, String strategy, String strategyLabel, int night,
                String planAsset, String presetId, String readiness,
                String gateClaimLevel, boolean enabled, boolean sixAmProof,
                boolean planBoundToProof, boolean adaptersReady, String reason,
                boolean assetPresent) {
            this.id = id;
            this.strategy = strategy;
            this.strategyLabel = strategyLabel;
            this.night = night;
            this.planAsset = planAsset;
            this.presetId = presetId;
            this.readiness = readiness;
            this.gateClaimLevel = gateClaimLevel;
            this.enabled = enabled;
            this.sixAmProof = sixAmProof;
            this.planBoundToProof = planBoundToProof;
            this.adaptersReady = adaptersReady;
            this.reason = reason;
            this.assetPresent = assetPresent;
        }

        @Override
        public boolean isRunnable() {
            return enabled && assetPresent && "READY".equals(readiness)
                    && "DEVICE_MEASURED".equals(gateClaimLevel)
                    && sixAmProof && planBoundToProof && adaptersReady;
        }

        @Override
        public String displayLabel() {
            return (isRunnable() ? "" : "[DISABLED] ")
                    + "Night " + night + "  |  " + strategyLabel
                    + (presetId == null ? "" : "  |  Night 7 preset");
        }

        @Override
        public String disabledReason() {
            if (isRunnable()) return "Ready";
            if (!assetPresent) return "Plan asset is missing from this APK.";
            if (reason == null || reason.isEmpty()) {
                return "This plan has no bound device-proven 6 AM result yet.";
            }
            return reason;
        }

        public String statusLine() {
            return (isRunnable() ? "READY: " : "DISABLED: ") + disabledReason();
        }
    }

    public static final class Preset implements Item {
        public final String id;
        public final String label;
        public final int night;
        public final boolean enabled;
        public final boolean sixAmProof;
        public final String reason;

        private Preset(String id, String label, int night, boolean enabled,
                boolean sixAmProof, String reason) {
            this.id = id;
            this.label = label;
            this.night = night;
            this.enabled = enabled;
            this.sixAmProof = sixAmProof;
            this.reason = reason;
        }

        @Override
        public boolean isRunnable() {
            return enabled && sixAmProof;
        }

        @Override
        public String displayLabel() {
            return (isRunnable() ? "" : "[DISABLED] ") + label + "  |  Night " + night;
        }

        @Override
        public String disabledReason() {
            return isRunnable() ? "Ready" : (reason == null || reason.isEmpty()
                    ? "No device-proven 6 AM result is bound to this preset."
                    : reason);
        }
    }

    public final List<Route> routes;
    public final List<Preset> presets;
    public final String loadWarning;

    private RunnerCatalog(List<Route> routes, List<Preset> presets, String loadWarning) {
        this.routes = Collections.unmodifiableList(routes);
        this.presets = Collections.unmodifiableList(presets);
        this.loadWarning = loadWarning;
    }

    public static RunnerCatalog load(AssetManager assets) throws IOException {
        final String text;
        try (InputStream input = assets.open(ASSET);
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                        input, StandardCharsets.UTF_8))) {
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) content.append(line).append('\n');
            text = content.toString();
        }

        try {
            JSONObject root = new JSONObject(text);
            if (!SCHEMA.equals(root.optString("schema"))) {
                throw new IOException("runner catalog schema is invalid");
            }
            JSONObject policy = root.optJSONObject("readiness");
            if (policy == null) throw new IOException("runner catalog readiness policy is missing");
            boolean enabled = policy.optBoolean("enabled", false);
            String readiness = policy.optString("state", "BLOCKED");
            String claimLevel = policy.optString("claimLevel", "MODEL_ONLY");
            boolean sixAmProof = policy.optBoolean("sixAmProof", false);
            boolean planBound = policy.optBoolean("planBoundToProof", false);
            boolean adaptersReady = policy.optBoolean("adaptersReady", false);
            String reason = policy.optString("reason",
                    "This plan has no bound device-proven 6 AM result yet.");

            List<Route> routes = new ArrayList<>();
            JSONArray strategies = root.optJSONArray("strategies");
            if (strategies == null || strategies.length() == 0) {
                throw new IOException("runner catalog has no strategies");
            }
            List<JSONObject> strategyEntries = new ArrayList<>();
            for (int index = 0; index < strategies.length(); index++) {
                JSONObject strategy = strategies.getJSONObject(index);
                String id = required(strategy, "id");
                JSONArray nights = strategy.optJSONArray("nights");
                if (nights == null || nights.length() == 0) {
                    throw new IOException("strategy " + id + " has no nights");
                }
                for (int nightIndex = 0; nightIndex < nights.length(); nightIndex++) {
                    int supportedNight = nights.getInt(nightIndex);
                    if (supportedNight < 1 || supportedNight > 7) {
                        throw new IOException("strategy " + id + " has an invalid night");
                    }
                }
                strategyEntries.add(strategy);
            }
            // Keep the primary use case together: select a night, then see
            // every strategy available for that night. This is deliberately
            // not strategy-major ordering, which scattered the same night
            // across the route picker.
            for (int night = 1; night <= 7; night++) {
                for (JSONObject strategy : strategyEntries) {
                    JSONArray nights = strategy.getJSONArray("nights");
                    boolean supportsNight = false;
                    for (int nightIndex = 0; nightIndex < nights.length(); nightIndex++) {
                        if (nights.getInt(nightIndex) == night) {
                            supportsNight = true;
                            break;
                        }
                    }
                    if (!supportsNight) continue;
                    String id = required(strategy, "id");
                    String label = required(strategy, "label");
                    String planRoot = required(strategy, "planRoot");
                    String planAsset = planRoot + "/night-" + night + ".plan";
                    boolean assetPresent = assetExists(assets, planAsset);
                    String routeReason = reason;
                    String strategyReason = strategy.optString("reason", "");
                    if (!strategyReason.isEmpty()) routeReason += " " + strategyReason;
                    if (!assetPresent) routeReason = "This canonical plan is not bundled for this night.";
                    routes.add(new Route(id + "-night-" + night, id, label, night,
                            planAsset, null, readiness, claimLevel,
                            enabled, sixAmProof, planBound, adaptersReady,
                            routeReason, assetPresent));
                }
            }

            List<Preset> presets = new ArrayList<>();
            JSONArray presetArray = root.optJSONArray("night7Presets");
            if (presetArray != null) {
                for (int index = 0; index < presetArray.length(); index++) {
                    JSONObject preset = presetArray.getJSONObject(index);
                    presets.add(new Preset(required(preset, "id"),
                            required(preset, "label"), preset.optInt("night", 7),
                            preset.optBoolean("enabled", false),
                            preset.optBoolean("sixAmProof", false),
                            preset.optString("reason", reason)));
                }
            }
            return new RunnerCatalog(routes, presets, null);
        } catch (JSONException | IllegalArgumentException error) {
            throw new IOException("runner catalog is malformed", error);
        }
    }

    public static RunnerCatalog unavailable(String warning) {
        return new RunnerCatalog(new ArrayList<>(), new ArrayList<>(), warning);
    }

    public Route routeAt(int position) {
        return position >= 0 && position < routes.size() ? routes.get(position) : null;
    }

    public Preset presetAt(int position) {
        return position >= 0 && position < presets.size() ? presets.get(position) : null;
    }

    private static String required(JSONObject object, String key) throws IOException {
        String value = object.optString(key, "").trim();
        if (value.isEmpty()) throw new IOException("runner catalog field " + key + " is missing");
        return value;
    }

    private static boolean assetExists(AssetManager assets, String path) {
        try (InputStream ignored = assets.open(path)) {
            return true;
        } catch (IOException error) {
            return false;
        }
    }
}
