package com.fnaf2.cuehelper;

import java.util.Arrays;

/** Host regression for geometry, expiry, qualification, and self-capture gates. */
public final class OverlayContractTest {
    private static int failures;

    private static void check(String what, boolean condition) {
        if (!condition) {
            System.out.println("FAIL " + what);
            failures++;
        }
    }

    private static void throwsIllegal(String what, Runnable action) {
        try {
            action.run();
            check(what, false);
        } catch (IllegalArgumentException expected) {
            check(what, true);
        }
    }

    public static void main(String[] args) {
        OverlayGeometry.Contract contract = OverlayGeometry.defaultContract();
        check("contract is versioned and derived from all PixelWatch entries",
                OverlayGeometry.VERSION.equals(contract.version)
                        && contract.size() == PixelWatch.defaultSpec().size());

        RoiSpec bb = contract.find("bb_left_luma");
        RoiSpec camera = contract.find("cam01_button");
        RoiSpec battery = contract.find("battery_bar_1");
        RoiSpec identity = contract.find("screen_grey_cells");
        check("screen scopes come from the shared PixelWatch contract",
                bb != null && bb.screenScope == RoiSpec.ScreenScope.OFFICE
                        && camera != null && camera.screenScope == RoiSpec.ScreenScope.MONITOR
                        && battery != null
                        && battery.screenScope == RoiSpec.ScreenScope.NIGHT_HUD
                        && identity != null && identity.screenScope == RoiSpec.ScreenScope.IDENTITY);
        check("menu hides regions that are not present on the menu",
                !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_MENU, bb)
                        && !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_MENU, camera));
        check("night debug keeps only currently established office regions",
                OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT, bb)
                        && !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT, camera)
                        && !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT, identity));
        check("live monitor state gates office and camera regions",
                OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.DOWN, bb)
                        && !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.UP, bb)
                        && OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.UP, camera)
                        && !OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.DOWN, camera)
                        && OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.DOWN, battery)
                        && OverlayRegionFilter.visible(OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.MonitorState.UP, battery)
                        && "cam:1".equals(OverlayRegionFilter.cameraControlFor(
                        "cam01_button")));
        check("normal debug facts do not receive verbose labels",
                !OverlayRegionFilter.showLabel(OverlaySnapshot.FactState.MONITORED)
                        && OverlayRegionFilter.showLabel(OverlaySnapshot.FactState.STALE));
        check("native g56 landscape ROI preserves PixelWatch geometry",
                bb != null && Math.abs(bb.normalizedRect.left
                        - 451f / PixelWatch.NATIVE_WIDTH) < .00001f
                        && Math.abs(bb.normalizedRect.top
                        - 730f / PixelWatch.NATIVE_HEIGHT) < .00001f);

        OverlayGeometry.Transform nativeLandscape = new OverlayGeometry.Transform(
                contract.profileId,
                new OverlayGeometry.Viewport(0, 0, 2400, 1080,
                        OverlayGeometry.Rotation.ROTATION_0),
                new OverlayGeometry.Viewport(0, 0, 2400, 1080,
                        OverlayGeometry.Rotation.ROTATION_0));
        OverlayGeometry.PixelRect capture = nativeLandscape.capture(bb);
        OverlayGeometry.PixelRect display = nativeLandscape.display(bb);
        check("capture and display rectangles agree on native profile",
                Math.abs(capture.left - 451f) < .01f
                        && Math.abs(capture.top - 730f) < .01f
                        && Math.abs(display.left - 451f) < .01f
                        && Math.abs(display.bottom - 731f) < .01f);
        OverlayGeometry.PixelRect cameraCapture = nativeLandscape.capture(camera);
        OverlayGeometry.PixelRect cameraDisplay = nativeLandscape.display(camera);
        check("camera map keeps one-pixel sensing but exposes calibrated button area",
                Math.abs(cameraCapture.width() - 1f) < .01f
                        && Math.abs(cameraCapture.height() - 1f) < .01f
                        && Math.abs(cameraDisplay.width()
                        - PixelWatch.CAMERA_BUTTON_OVERLAY_WIDTH) < .01f
                        && Math.abs(cameraDisplay.height()
                        - PixelWatch.CAMERA_BUTTON_OVERLAY_HEIGHT) < .01f);

        OverlayGeometry.HudMap hudMap = new OverlayGeometry.HudMap(contract.profileId,
                new OverlayGeometry.HudZone[] {
                        new OverlayGeometry.HudZone("night-hud",
                                new NormalizedRect(.1f, .1f, .2f, .2f),
                                OverlayGeometry.HudScope.FNAF2_NIGHT),
                        new OverlayGeometry.HudZone("menu-hud",
                                new NormalizedRect(.3f, .3f, .4f, .4f),
                                OverlayGeometry.HudScope.FNAF2_MENU)
                });
        check("profile-bound HUD map resolves only the current screen zones",
                hudMap.displayZones(nativeLandscape, OverlaySnapshot.Screen.FNAF2_NIGHT).length == 1
                        && hudMap.displayZones(nativeLandscape,
                        OverlaySnapshot.Screen.FNAF2_MENU).length == 1
                        && hudMap.displayZones(nativeLandscape,
                        OverlaySnapshot.Screen.UNKNOWN).length == 0);
        throwsIllegal("HUD collision map/profile mismatch is refused",
                () -> hudMap.displayZones(new OverlayGeometry.Transform("other-profile",
                        nativeLandscape.capture, nativeLandscape.display),
                        OverlaySnapshot.Screen.FNAF2_NIGHT));

        OverlayGeometry.PixelRect obstacle = new OverlayGeometry.PixelRect(10, 10, 30, 30);
        OverlayGeometry.PixelRect clear = new OverlayGeometry.PixelRect(40, 40, 50, 50);
        check("collision detector honors exclusion and guard bands",
                OverlayCollisionDetector.intersects(obstacle,
                        new OverlayGeometry.PixelRect(29, 10, 40, 20), 0f)
                        && OverlayCollisionDetector.intersects(obstacle,
                        new OverlayGeometry.PixelRect(30.5f, 10, 40, 20), 1f)
                        && !OverlayCollisionDetector.intersects(clear, obstacle, 0f)
                        && OverlayCollisionDetector.choose(
                        new OverlayGeometry.PixelRect[]{obstacle, clear},
                        new OverlayGeometry.PixelRect[]{obstacle}, null, 0, 0f).clear
                        && OverlayCollisionDetector.choose(
                        new OverlayGeometry.PixelRect[]{obstacle},
                        new OverlayGeometry.PixelRect[]{obstacle}, null, 0, 0f) != null
                        && !OverlayCollisionDetector.choose(
                        new OverlayGeometry.PixelRect[]{obstacle},
                        new OverlayGeometry.PixelRect[]{obstacle}, null, 0, 0f).clear);

        int[] monitorUpGrid = new int[PixelWatch.GRID_WIDTH * PixelWatch.GRID_HEIGHT];
        Arrays.fill(monitorUpGrid, 0x1e1e1e);
        monitorUpGrid[112] = 0x999999;
        monitorUpGrid[131] = 0x353535;
        monitorUpGrid[132] = 0xa9a9a9;
        monitorUpGrid[151] = 0x353535;
        monitorUpGrid[165] = 0x101010;
        monitorUpGrid[167] = 0x101010;
        MonitorStateDetector.Result monitorUp = MonitorStateDetector.measure(
                monitorUpGrid, ScreenIdentity.FNAF2_NIGHT);
        check("calibrated monitor anchors report UP", monitorUp.state
                == MonitorStateDetector.State.UP);
        int[] monitorDownGrid = monitorUpGrid.clone();
        monitorDownGrid[112] = 0x0a0a0a;
        monitorDownGrid[131] = 0x050505;
        monitorDownGrid[132] = 0x0a0a0a;
        monitorDownGrid[151] = 0x050505;
        monitorDownGrid[165] = 0xbbbbbb;
        monitorDownGrid[167] = 0xbbbbbb;
        MonitorStateDetector.Result monitorDown = MonitorStateDetector.measure(
                monitorDownGrid, ScreenIdentity.FNAF2_NIGHT);
        check("calibrated monitor anchors report DOWN", monitorDown.state
                == MonitorStateDetector.State.DOWN);
        int[] mixedGrid = monitorUpGrid.clone();
        mixedGrid[167] = 0xbbbbbb;
        check("mixed monitor anchors refuse", MonitorStateDetector.measure(
                mixedGrid, ScreenIdentity.FNAF2_NIGHT).state
                == MonitorStateDetector.State.UNKNOWN);
        check("dark and foreign monitor frames refuse",
                "frame-dark".equals(MonitorStateDetector.measure(
                        new int[PixelWatch.GRID_WIDTH * PixelWatch.GRID_HEIGHT],
                        ScreenIdentity.FNAF2_NIGHT).reason)
                        && "screen-identity".equals(MonitorStateDetector.measure(
                        monitorUpGrid, ScreenIdentity.FNAF2_MENU).reason));

        int[] cameraReads = new int[PixelWatch.MAX_ENTRIES];
        Arrays.fill(cameraReads, PixelWatch.UNKNOWN);
        PixelWatch.Spec spec = PixelWatch.defaultSpec();
        for (int index = 0; index < spec.size(); index++) {
            if (spec.entry(index).name.startsWith("cam")
                    && spec.entry(index).name.endsWith("_button")) {
                cameraReads[index] = -19;
            }
        }
        cameraReads[spec.indexOfName("cam05_button")] = 194;
        CameraSelectionDetector.Result selectedCamera = CameraSelectionDetector.measure(
                spec, cameraReads, monitorUp);
        check("one highlighted camera is identified", selectedCamera.observed()
                && "cam:5".equals(selectedCamera.selectedCamera));
        cameraReads[spec.indexOfName("cam06_button")] = 195;
        CameraSelectionDetector.Result splitCamera = CameraSelectionDetector.measure(
                spec, cameraReads, monitorUp);
        check("multiple highlighted cameras refuse singular selection",
                "multiple-camera-highlight".equals(splitCamera.reason)
                        && !splitCamera.observed());
        check("multiple highlighted cameras remain available as a split pair",
                Arrays.equals(new String[]{"cam:5", "cam:6"}, splitCamera.highlightedCameras()));
        check("camera selection is unavailable with monitor down",
                "monitor-not-up".equals(CameraSelectionDetector.measure(
                        spec, cameraReads, monitorDown).reason));
        PixelWatch.Entry[] movedEntries = new PixelWatch.Entry[spec.size()];
        for (int index = 0; index < spec.size(); index++) {
            PixelWatch.Entry entry = spec.entry(index);
            movedEntries[index] = entry.name.equals("cam01_button")
                    ? new PixelWatch.Entry(entry.name, entry.kind, entry.x + 1, entry.y,
                    entry.width, entry.height, entry.reducer, entry.step, entry.greySpread)
                    : entry;
        }
        check("same-named camera point at a foreign coordinate refuses",
                "sensor-mismatch".equals(CameraSelectionDetector.measure(
                        new PixelWatch.Spec(movedEntries), cameraReads, monitorUp).reason));

        RoiSpec full = contract.find("screen_grey_cells");
        OverlayGeometry.Transform insetLetterbox = new OverlayGeometry.Transform(
                contract.profileId,
                new OverlayGeometry.Viewport(80, 20, 1160, 560,
                        OverlayGeometry.Rotation.ROTATION_0),
                new OverlayGeometry.Viewport(12, 40, 1092, 2360,
                        OverlayGeometry.Rotation.ROTATION_90));
        OverlayGeometry.PixelRect inset = insetLetterbox.capture(full);
        check("letterbox/inset capture viewport is retained",
                Math.abs(inset.left - 80f) < .01f && Math.abs(inset.top - 20f) < .01f
                        && Math.abs(inset.right - 1160f) < .01f
                        && Math.abs(inset.bottom - 560f) < .01f);
        OverlayGeometry.PixelRect rotated = insetLetterbox.display(bb);
        check("rotation maps normalized content into display space",
                rotated.left > 12f && rotated.top > 40f
                        && rotated.right < 1092f && rotated.bottom < 2360f
                        && rotated.width() > 0f && rotated.height() > 0f);

        throwsIllegal("invalid normalized rectangle is refused",
                () -> new NormalizedRect(-.01f, 0, .2f, .2f));
        throwsIllegal("invalid viewport is refused",
                () -> new OverlayGeometry.Viewport(0, 0, 0, 10,
                        OverlayGeometry.Rotation.ROTATION_0));
        throwsIllegal("calibration/profile mismatch is refused",
                () -> new OverlayGeometry.Transform("other-profile",
                        new OverlayGeometry.Viewport(0, 0, 100, 100,
                                OverlayGeometry.Rotation.ROTATION_0),
                        new OverlayGeometry.Viewport(0, 0, 100, 100,
                                OverlayGeometry.Rotation.ROTATION_0)).capture(bb));

        long now = 1_000_000_000L;
        OverlaySnapshot visualFacts = new OverlaySnapshot(7, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.SENSOR_DEBUG, new OverlaySnapshot.Region[0],
                OverlaySnapshot.Cue.none(), OverlaySnapshot.MonitorState.UP,
                "anchors-up", "cam:5", "single-camera-highlight");
        check("snapshot carries live monitor and camera facts",
                visualFacts.monitorState == OverlaySnapshot.MonitorState.UP
                        && "cam:5".equals(visualFacts.selectedCamera));
        OverlaySnapshot batteryFacts = new OverlaySnapshot(10, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.SENSOR_DEBUG, new OverlaySnapshot.Region[0],
                OverlaySnapshot.Cue.none(), OverlaySnapshot.MonitorState.DOWN,
                "anchors-down", null, "monitor-not-up", 75, "bars-observed");
        check("snapshot carries the UI-derived battery fact",
                batteryFacts.batteryPercent == 75
                        && "bars-observed".equals(batteryFacts.batteryReason));
        throwsIllegal("camera facts cannot be attached to a menu snapshot",
                () -> new OverlaySnapshot(8, now,
                        OverlaySnapshot.Screen.FNAF2_MENU,
                        OverlaySnapshot.Mode.SENSOR_DEBUG,
                        new OverlaySnapshot.Region[0], OverlaySnapshot.Cue.none(),
                        OverlaySnapshot.MonitorState.UP, "anchors-up", "cam:5",
                        "single-camera-highlight"));
        throwsIllegal("selected camera cannot survive monitor down",
                () -> new OverlaySnapshot(9, now,
                        OverlaySnapshot.Screen.FNAF2_NIGHT,
                        OverlaySnapshot.Mode.SENSOR_DEBUG,
                        new OverlaySnapshot.Region[0], OverlaySnapshot.Cue.none(),
                        OverlaySnapshot.MonitorState.DOWN, "anchors-down", "cam:5",
                        "single-camera-highlight"));
        OverlaySnapshot.Region monitored = new OverlaySnapshot.Region(
                "bb_left_luma", OverlaySnapshot.FactState.MONITORED, 120,
                Double.NaN, OverlaySnapshot.ScoreType.NONE, 10, 3, false);
        OverlaySnapshot.Cue rawCue = new OverlaySnapshot.Cue(
                OverlaySnapshot.CueAction.MASK, OverlaySnapshot.Severity.CRITICAL,
                now + 1_000_000L, "bb_left_luma", new String[]{"bb_left_luma"},
                true, false);
        OverlaySnapshot debug = new OverlaySnapshot(1, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.SENSOR_DEBUG,
                new OverlaySnapshot.Region[]{monitored}, rawCue);
        check("debug mode never promotes a raw fact to an action cue",
                debug.cue.action == OverlaySnapshot.CueAction.NONE);

        OverlaySnapshot.Region detected = new OverlaySnapshot.Region(
                "bb_left_luma", OverlaySnapshot.FactState.DETECTED, 120,
                .92, OverlaySnapshot.ScoreType.PROBABILITY, 10, 3, true);
        OverlaySnapshot.Cue approved = new OverlaySnapshot.Cue(
                OverlaySnapshot.CueAction.FLASH, OverlaySnapshot.Severity.ATTENTION,
                now + 10_000L, "bb_left_luma", new String[]{"bb_left_luma"},
                true, false);
        OverlaySnapshot run = new OverlaySnapshot(2, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{detected}, approved);
        check("qualified decision cue is retained", run.cue.action
                == OverlaySnapshot.CueAction.FLASH);
        check("expired decision cue clears at render time",
                run.forRender(now + 10_000L).cue.action
                        == OverlaySnapshot.CueAction.NONE);
        OverlaySnapshot alreadyExpired = new OverlaySnapshot(5, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{detected},
                new OverlaySnapshot.Cue(OverlaySnapshot.CueAction.FLASH,
                        OverlaySnapshot.Severity.ATTENTION, now, "bb_left_luma",
                        new String[]{"bb_left_luma"}, true, false));
        check("already-expired decision cue is cleared at ingress",
                alreadyExpired.cue.action == OverlaySnapshot.CueAction.NONE);

        OverlaySnapshot.Region stale = new OverlaySnapshot.Region(
                "bb_left_luma", OverlaySnapshot.FactState.STALE, 120,
                .92, OverlaySnapshot.ScoreType.PROBABILITY, 10_000, 3, true);
        OverlaySnapshot staleRun = new OverlaySnapshot(3, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{stale}, approved);
        check("stale fact clears an imperative cue", staleRun.cue.action
                == OverlaySnapshot.CueAction.NONE);

        OverlaySnapshot.Region unknown = OverlaySnapshot.Region.unknown(
                "bb_left_luma", 10, 3);
        OverlaySnapshot unknownRun = new OverlaySnapshot(31, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{unknown}, approved);
        check("unknown fact clears an imperative cue", unknownRun.cue.action
                == OverlaySnapshot.CueAction.NONE);

        OverlaySnapshot.Region conflicting = new OverlaySnapshot.Region(
                "bb_left_luma", OverlaySnapshot.FactState.CONFLICTING, 120,
                .92, OverlaySnapshot.ScoreType.PROBABILITY, 10, 3, true);
        OverlaySnapshot staleConflictRun = new OverlaySnapshot(4, now,
                OverlaySnapshot.Screen.FNAF2_NIGHT,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{conflicting}, approved);
        check("conflicting fact clears an imperative cue", staleConflictRun.cue.action
                == OverlaySnapshot.CueAction.NONE);

        OverlaySnapshot menuRun = new OverlaySnapshot(32, now,
                OverlaySnapshot.Screen.FNAF2_MENU,
                OverlaySnapshot.Mode.DECISION_RUN,
                new OverlaySnapshot.Region[]{detected}, approved);
        check("screen identity loss clears an imperative cue", menuRun.cue.action
                == OverlaySnapshot.CueAction.NONE);

        check("paired unchanged protected samples qualify the gate",
                OverlayCaptureGate.comparePairedSamples("g56", new int[]{1, 2},
                        new int[]{1, 2}).qualified);
        check("changed protected samples reject the gate",
                !OverlayCaptureGate.comparePairedSamples("g56", new int[]{1, 2},
                        new int[]{1, 3}).qualified);
        check("unknown protected samples cannot qualify the gate",
                !OverlayCaptureGate.comparePairedSamples("g56",
                        new int[]{PixelWatch.UNKNOWN},
                        new int[]{PixelWatch.UNKNOWN}).qualified);

        String qualification = "schema=" + OverlayCaptureGate.RECORD_SCHEMA + "\n"
                + "profileId=g56\nproof=PLATFORM_EXCLUDES_OVERLAY\n"
                + "targetPackage=com.scottgames.fnaf2\n"
                + "targetBuild=fnaf2-test-build\n"
                + "touchPassthrough=PASS\ntargetSuppression=PASS\n"
                + "screenIdentity=PASS\n";
        check("complete retained qualification record enables the gate",
                OverlayCaptureGate.fromRecord(qualification).qualified);
        check("incomplete qualification record remains fail-closed",
                !OverlayCaptureGate.fromRecord(qualification.replace(
                        "touchPassthrough=PASS\n", "")).qualified);
        check("unknown qualification record fields remain fail-closed",
                !OverlayCaptureGate.fromRecord(qualification + "unreviewed=true\n").qualified);

        OverlaySnapshot.Cue mask = new OverlaySnapshot.Cue(
                OverlaySnapshot.CueAction.MASK, OverlaySnapshot.Severity.ATTENTION,
                now + 100_000L, "bb_left_luma", new String[]{"bb_left_luma"},
                true, false);
        OverlaySnapshot.Cue wind = new OverlaySnapshot.Cue(
                OverlaySnapshot.CueAction.WIND, OverlaySnapshot.Severity.ATTENTION,
                now + 100_000L, "bb_left_luma", new String[]{"bb_left_luma"},
                true, false);
        check("equal-priority conflicting cues clear rather than guess",
                OverlayCueArbiter.choose(new OverlaySnapshot.Cue[]{mask, wind}, now)
                        .action == OverlaySnapshot.CueAction.NONE);
        check("higher priority supersedes an earlier lower-priority conflict",
                OverlayCueArbiter.choose(new OverlaySnapshot.Cue[]{mask, wind,
                        new OverlaySnapshot.Cue(OverlaySnapshot.CueAction.FLASH,
                                OverlaySnapshot.Severity.CRITICAL, now + 100_000L,
                                "bb_left_luma", new String[]{"bb_left_luma"},
                                true, false)}, now).action
                        == OverlaySnapshot.CueAction.FLASH);
        check("higher-priority cue wins deterministically",
                OverlayCueArbiter.choose(new OverlaySnapshot.Cue[]{mask,
                        new OverlaySnapshot.Cue(OverlaySnapshot.CueAction.FLASH,
                                OverlaySnapshot.Severity.CRITICAL, now + 100_000L,
                                "bb_left_luma", new String[]{"bb_left_luma"},
                                true, false)}, now).action
                        == OverlaySnapshot.CueAction.FLASH);

        if (failures > 0) {
            System.out.println(failures + " check(s) failed");
            System.exit(1);
        }
        System.out.println("OverlayContractTest: all checks passed");
    }
}
