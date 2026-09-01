package com.fnaf2.cuehelper;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Small, serializable decision for Plan 23's self-observation gate.  A
 * transparent paint operation is never evidence by itself: the caller must
 * supply either platform proof, phase-separation proof, or matching protected
 * samples from paired HUD-off/HUD-on frames.
 */
public final class OverlayCaptureGate {
    public static final String RECORD_SCHEMA = "cue-helper-overlay-qualification-v1";
    private static final Set<String> RECORD_FIELDS = new HashSet<>(Arrays.asList(
            "schema", "profileId", "proof", "targetPackage", "targetBuild",
            "touchPassthrough", "targetSuppression", "screenIdentity"));
    public enum Proof {
        NONE,
        PLATFORM_EXCLUDES_OVERLAY,
        OUTSIDE_PROTECTED_REGIONS,
        PHASE_SEPARATED
    }

    public final String profileId;
    public final Proof proof;
    public final boolean qualified;
    public final String reason;
    public final String targetPackage;
    public final String targetBuild;

    private OverlayCaptureGate(String profileId, Proof proof, boolean qualified,
            String reason, String targetPackage, String targetBuild) {
        this.profileId = profileId;
        this.proof = proof;
        this.qualified = qualified;
        this.reason = reason;
        this.targetPackage = targetPackage;
        this.targetBuild = targetBuild;
    }

    public static OverlayCaptureGate unqualified(String profileId) {
        return new OverlayCaptureGate(profileId, Proof.NONE, false,
                "self-capture-unqualified", null, null);
    }

    public static OverlayCaptureGate qualify(String profileId, Proof proof) {
        if (profileId == null || profileId.isEmpty() || proof == null
                || proof == Proof.NONE) {
            throw new IllegalArgumentException("qualification proof is missing");
        }
        return new OverlayCaptureGate(profileId, proof, true, "qualified",
                null, null);
    }

    private static OverlayCaptureGate qualifyRecord(String profileId, Proof proof,
            String targetPackage, String targetBuild) {
        if (profileId == null || profileId.isEmpty() || proof == null
                || proof == Proof.NONE || targetPackage == null
                || targetBuild == null || targetBuild.isEmpty()) {
            throw new IllegalArgumentException("qualification record is incomplete");
        }
        return new OverlayCaptureGate(profileId, proof, true, "qualified",
                targetPackage, targetBuild);
    }

    /**
     * Parse the small, human-auditable qualification sidecar installed by the
     * device harness.  It is intentionally stricter than a boolean preference:
     * permission, target suppression, input delivery, and identity proof must
     * all be present before the window can attach.
     */
    public static OverlayCaptureGate fromRecord(String record) {
        if (record == null || record.length() > 8_192) {
            return unqualified(null);
        }
        Map<String, String> field = new HashMap<>();
        for (String line : record.split("\\r?\\n")) {
            if (line.isEmpty() || line.startsWith("#")) continue;
            int equals = line.indexOf('=');
            if (equals <= 0 || equals == line.length() - 1) {
                return unqualified(null);
            }
            String key = line.substring(0, equals);
            String value = line.substring(equals + 1);
            if (!key.matches("[A-Za-z][A-Za-z0-9_.-]{0,63}")
                    || !RECORD_FIELDS.contains(key)
                    || field.put(key, value) != null) {
                return unqualified(null);
            }
        }
        String profile = field.get("profileId");
        String proofName = field.get("proof");
        if (!RECORD_SCHEMA.equals(field.get("schema")) || profile == null
                || profile.isEmpty() || proofName == null
                || !"com.scottgames.fnaf2".equals(field.get("targetPackage"))
                || empty(field.get("targetBuild"))
                || !"PASS".equals(field.get("touchPassthrough"))
                || !"PASS".equals(field.get("targetSuppression"))
                || !"PASS".equals(field.get("screenIdentity"))) {
            return unqualified(profile);
        }
        try {
            return qualifyRecord(profile, Proof.valueOf(proofName),
                    field.get("targetPackage"), field.get("targetBuild"));
        } catch (IllegalArgumentException error) {
            return unqualified(profile);
        }
    }

    /** Compare protected detector evidence from paired off/on captures. */
    public static OverlayCaptureGate comparePairedSamples(String profileId,
            int[] hudOff, int[] hudOn) {
        if (profileId == null || profileId.isEmpty() || hudOff == null
                || hudOn == null || hudOff.length == 0
                || hudOff.length != hudOn.length) {
            return unqualified(profileId);
        }
        for (int index = 0; index < hudOff.length; index++) {
            // Equal UNKNOWN values carry no evidence about contamination.
            if (hudOff[index] == PixelWatch.UNKNOWN
                    || hudOn[index] == PixelWatch.UNKNOWN) {
                return unqualified(profileId);
            }
        }
        return Arrays.equals(hudOff, hudOn)
                ? qualify(profileId, Proof.OUTSIDE_PROTECTED_REGIONS)
                : new OverlayCaptureGate(profileId, Proof.NONE, false,
                        "protected-samples-changed", null, null);
    }

    public String status() {
        return qualified ? "QUALIFIED(" + proof.name().toLowerCase() + ")"
                : "UNQUALIFIED(" + reason + ")";
    }

    private static boolean empty(String value) {
        return value == null || value.isEmpty();
    }
}
