package com.fnaf2.cuehelper;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.HardwareBuffer;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONException;
import org.json.JSONObject;

public final class CaptureService extends Service {
    public static final String ACTION_START =
            "com.fnaf2.cuehelper.action.START";
    public static final String ACTION_QUERY_STATUS =
            "com.fnaf2.cuehelper.action.QUERY_STATUS";
    public static final String ACTION_STOP =
            "com.fnaf2.cuehelper.action.STOP";
    public static final String ACTION_STATUS =
            "com.fnaf2.cuehelper.action.STATUS";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_CAPTURE_WIDTH = "captureWidth";
    public static final String EXTRA_CAPTURE_HEIGHT = "captureHeight";
    public static final String EXTRA_STATUS = "status";

    private static final String TAG = "FnafCueHelper";
    private static final String NOTIFICATION_CHANNEL = "capture";
    private static final int NOTIFICATION_ID = 7007;

    private static final int VISUAL_WIDTH = 20;
    private static final int VISUAL_HEIGHT = 9;
    private static final int VISUAL_X = 3;
    private static final int VISUAL_Y = 6;
    // The CAM 05 feed region, as a block of the same 20x9 frame. The screen
    // model's ROI is (600,180)-(1120,500) of 2400x1080, and at 120 px per cell
    // that is x 5..9, y 1..4. Reading it costs twenty pixels of an image the
    // service already has -- the reason CAM 05 needed a 206 ms screencap was
    // that this service sampled exactly one hardcoded point, not any limit of
    // the capture.
    private static final int CAM05_X0 = 5;
    private static final int CAM05_X1 = 9;
    private static final int CAM05_Y0 = 1;
    private static final int CAM05_Y1 = 4;
    private static final long MAX_VISUAL_FRAME_AGE_US = 250_000L;
    private static final long VISUAL_REPORT_INTERVAL_NS = 1_000_000_000L;
    private static final int CONTROL_PORT = 49_707;
    private static final int AUDIO_FACT_PORT = 49_708;
    private static final String CONTROL_SOCKET_PREFIX =
            "com.fnaf2.cuehelper.control";
    private static final int CONTROL_LINE_LIMIT = 256;
    private static final int AUDIO_FACT_LINE_LIMIT = 1_024;
    private static final long AUDIO_FACT_STALE_MS = 3_000L;
    private static final int CONTROL_READ_TIMEOUT_MS = 1_000;
    private static final String AUDIO_AUTHORITY = "audio-authority";

    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object snapshotLock = new Object();
    // Incremented for every start and stop. Worker callbacks from an older
    // projection must not observe or mutate a later session.
    private volatile long sessionGeneration;

    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread visualThread;
    private ServerSocket controlServer;
    private ServerSocket audioFactServer;
    private LocalServerSocket localControlServer;
    private Thread controlThread;
    private Thread audioFactThread;
    private Thread localControlThread;
    private volatile boolean controlRunning;
    private volatile boolean audioFactRunning;
    private volatile boolean tcpControlUp;
    private volatile boolean localControlUp;
    private volatile Socket audioFactClient;
    private String controlToken;
    private String controlSocketName;

    private long visualSequence;
    private long lastVisualReportNs;
    private volatile int capturedContentWidth;
    private volatile int capturedContentHeight;
    // The watchlist is native-resolution by contract. A small projection can
    // still be requested for the legacy GRID path or a latency probe, but a
    // native watch refuses to run against it rather than silently scaling a
    // calibrated coordinate into a different sensor.
    private int captureWidth = PixelWatch.NATIVE_WIDTH;
    private int captureHeight = PixelWatch.NATIVE_HEIGHT;
    // -1 is unknown, 0 is hidden, 1 is visible. The API-36 target must not
    // turn a letterboxed or hidden capture into a confident pixel reading.
    private volatile int capturedContentVisibility = -1;
    private volatile String lastVisual = "visual=UNAVAILABLE";
    private volatile String lastAudio = externalAudioStatus();
    private volatile long lastAudioFactElapsedNs;
    private volatile String audioAuthorityName = AUDIO_AUTHORITY;
    private volatile String audioProfileName = "unknown";
    private volatile String lastControl = "control=UNAVAILABLE";

    private long snapshotVisualSequence;
    private long snapshotVisualTimestampNs;
    private int snapshotRed;
    private int snapshotGreen;
    private int snapshotBlue;
    private int snapshotLuma;
    private int snapshotCam05MeanLuma;
    // Near-grey cells over the whole grid, or -1 when the grid is incomplete.
    //
    // A whole-frame count, because this sensor point-samples: the position
    // anchors it defeats (the lit camera button, 7 of 12 cameras) cannot be
    // repaired by a threshold. See ScreenStats and ONE-PIXEL-VISION.md section 3.
    private int snapshotGreyCells = -1;
    // The whole 20x9 sensor, packed 0xRRGGBB per cell.
    //
    // The service already renders this grid every frame and was reporting one
    // pixel of it (3,6) plus one block mean. Everything else was discarded, so
    // nothing downstream could tell a Withered Freddy jumpscare from a dark
    // office: during one, the snapshot read luma 0-37 and a neutral grey
    // triple, because the single reported pixel happens to sit somewhere dark.
    // 180 cells is small enough to send on one line and is the whole picture
    // the helper has.
    //
    // Preallocated and filled in place: the 60 fps callback must not allocate,
    // which is why the first long-running probe accumulated heap pressure.
    private final int[] snapshotGrid = new int[VISUAL_WIDTH * VISUAL_HEIGHT];
    private boolean snapshotGridValid;
    private final PixelWatch.Spec watchSpec = PixelWatch.defaultSpec();
    private final PixelWatch.ByteBufferFrame watchFrame = new PixelWatch.ByteBufferFrame();
    private final int[] snapshotWatchValues = new int[PixelWatch.MAX_ENTRIES];
    private volatile boolean watchActive;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL,
                "Cue capture",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Active on-device visual capture with external audio authority");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopCapture("operator-stop", true);
            // Keep the service instance alive and idle. The next start gets a
            // fresh consent token and can reuse this process immediately.
            return START_NOT_STICKY;
        }

        if (ACTION_QUERY_STATUS.equals(action)) {
            publishCombinedStatus(projection == null ? "UNAVAILABLE" : "RUNNING");
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(action)) {
            publishStatus("UNAVAILABLE: no active projection session");
            return START_NOT_STICKY;
        }

        startForegroundNow();
        if (projection != null) {
            publishCombinedStatus("RUNNING");
            return START_NOT_STICKY;
        }

        stopping.set(false);
        final long generation = ++sessionGeneration;

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED);
        Intent resultData;
        if (Build.VERSION.SDK_INT >= 33) {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        } else {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        }
        if (resultCode != Activity.RESULT_OK || resultData == null) {
            failAndStop("invalid-projection-consent");
            return START_NOT_STICKY;
        }

        try {
            MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
            projection = manager.getMediaProjection(resultCode, resultData);
            projectionCallback = new MediaProjection.Callback() {
                @Override
                public void onCapturedContentResize(int width, int height) {
                    if (!sessionActive(generation)) return;
                    capturedContentWidth = width;
                    capturedContentHeight = height;
                    Log.i(TAG, "captured content resized: " + width + "x" + height);
                }

                @Override
                public void onCapturedContentVisibilityChanged(boolean isVisible) {
                    if (!sessionActive(generation)) return;
                    capturedContentVisibility = isVisible ? 1 : 0;
                    Log.i(TAG, "captured content visible=" + isVisible);
                }

                @Override
                public void onStop() {
                    if (!sessionActive(generation)) return;
                    Log.w(TAG, "projection callback: stopped");
                    stopCapture("projection-stopped", false);
                    stopSelf();
                }
            };
            projection.registerCallback(projectionCallback, mainHandler);
            captureWidth = intent.getIntExtra(EXTRA_CAPTURE_WIDTH,
                    PixelWatch.NATIVE_WIDTH);
            captureHeight = intent.getIntExtra(EXTRA_CAPTURE_HEIGHT,
                    PixelWatch.NATIVE_HEIGHT);
            if (!validCaptureSize(captureWidth, captureHeight)) {
                throw new IllegalArgumentException("capture size must be a 20:9 "
                        + "landscape size between 20x9 and 2400x1080");
            }
            startVisualCapture(generation);
            lastAudio = externalAudioStatus();
            lastAudioFactElapsedNs = 0L;
            audioAuthorityName = AUDIO_AUTHORITY;
            audioProfileName = "unknown";
            startControlServer(generation);
            startAudioFactServer(generation);
            publishControlStatus();
            publishCombinedStatus("RUNNING");
        } catch (Throwable error) {
            Log.e(TAG, "capture startup failed", error);
            failAndStop("startup-" + error.getClass().getSimpleName());
        }
        return START_NOT_STICKY;
    }

    private void startForegroundNow() {
        Intent activityIntent = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, NOTIFICATION_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("FNaF 2 sensors active")
                .setContentText("20x9 visual probe; audio supplied externally")
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startVisualCapture(long generation) {
        visualThread = new HandlerThread(
                "cue-visual",
                Process.THREAD_PRIORITY_DISPLAY);
        visualThread.start();
        Handler visualHandler = new Handler(visualThread.getLooper());

        imageReader = ImageReader.newInstance(
                captureWidth,
                captureHeight,
                PixelFormat.RGBA_8888,
                2,
                HardwareBuffer.USAGE_CPU_READ_OFTEN);
        imageReader.setOnImageAvailableListener(
                reader -> onImageAvailable(reader, generation), visualHandler);

        int densityDpi = getResources().getConfiguration().densityDpi;
        virtualDisplay = projection.createVirtualDisplay(
                "Minus7Visual",
                captureWidth,
                captureHeight,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                new VirtualDisplay.Callback() {
                    @Override
                    public void onStopped() {
                        if (!sessionActive(generation)) return;
                        lastVisual = "visual=UNAVAILABLE(display-stopped)";
                        publishCombinedStatus("UNAVAILABLE");
                    }
                },
                visualHandler);

        if (virtualDisplay == null) {
            throw new IllegalStateException("createVirtualDisplay returned null");
        }
        lastVisual = "visual=STARTING(" + captureWidth + "x" + captureHeight
                + ",legacy-grid=20x9,watch-spec=" + watchSpec.sha256() + ")";
        Log.i(TAG, lastVisual);
    }

    private void onImageAvailable(ImageReader reader, long generation) {
        if (!sessionActive(generation)) return;
        Image image = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) {
                return;
            }
            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) {
                lastVisual = "visual=UNAVAILABLE(no-plane)";
                return;
            }

            Image.Plane plane = planes[0];
            ByteBuffer buffer = plane.getBuffer();
            watchFrame.set(buffer, captureWidth, captureHeight,
                    plane.getRowStride(), plane.getPixelStride());
            int logicalX = Math.min(captureWidth - 1,
                    (int) (((long) VISUAL_X * 2 + 1) * captureWidth
                            / (VISUAL_WIDTH * 2L)));
            int logicalY = Math.min(captureHeight - 1,
                    (int) (((long) VISUAL_Y * 2 + 1) * captureHeight
                            / (VISUAL_HEIGHT * 2L)));
            int rgb = watchFrame.rgb(logicalX, logicalY);
            if (rgb == PixelWatch.UNKNOWN) {
                lastVisual = "visual=UNAVAILABLE(bounds)";
                return;
            }
            int red = (rgb >> 16) & 0xff;
            int green = (rgb >> 8) & 0xff;
            int blue = rgb & 0xff;
            int luma = (77 * red + 150 * green + 29 * blue) >> 8;
            int cam05MeanLuma = blockLuma(watchFrame,
                    scaleX(CAM05_X0, VISUAL_WIDTH), scaleY(CAM05_Y0, VISUAL_HEIGHT),
                    scaleX(CAM05_X1 + 1, VISUAL_WIDTH), scaleY(CAM05_Y1 + 1, VISUAL_HEIGHT));
            long callbackNs = System.nanoTime();
            long timestampNs = image.getTimestamp();
            long ageUs = timestampNs > 0 ? (callbackNs - timestampNs) / 1_000L : -1;
            if (ageUs < 0 || ageUs > 10_000_000L) {
                ageUs = -1;
            }
            visualSequence++;
            // Read once under the lock: the report below runs outside it, and
            // recomputing there would both duplicate the pass and race the
            // next frame's writer.
            int greyCells;
            if (!sessionActive(generation)) return;
            synchronized (snapshotLock) {
                snapshotVisualSequence = visualSequence;
                snapshotVisualTimestampNs = timestampNs;
                snapshotRed = red;
                snapshotGreen = green;
                snapshotBlue = blue;
                snapshotLuma = luma;
                snapshotCam05MeanLuma = cam05MeanLuma;
                boolean complete = true;
                for (int gy = 0; gy < VISUAL_HEIGHT; gy++) {
                    for (int gx = 0; gx < VISUAL_WIDTH; gx++) {
                        int x = Math.min(captureWidth - 1,
                                (int) (((long) gx * 2 + 1) * captureWidth
                                        / (VISUAL_WIDTH * 2L)));
                        int y = Math.min(captureHeight - 1,
                                (int) (((long) gy * 2 + 1) * captureHeight
                                        / (VISUAL_HEIGHT * 2L)));
                        int cell = watchFrame.rgb(x, y);
                        if (cell == PixelWatch.UNKNOWN) {
                            complete = false;
                            break;
                        }
                        snapshotGrid[gy * VISUAL_WIDTH + gx] = cell;
                    }
                    if (!complete) {
                        break;
                    }
                }
                snapshotGridValid = complete;
                snapshotGreyCells = complete
                        ? ScreenStats.greyCells(snapshotGrid, snapshotGrid.length)
                        : -1;
                greyCells = snapshotGreyCells;
                if (watchActive && captureWidth == PixelWatch.NATIVE_WIDTH
                        && captureHeight == PixelWatch.NATIVE_HEIGHT) {
                    PixelWatch.readInto(watchSpec, watchFrame,
                            snapshotWatchValues);
                } else {
                    for (int i = 0; i < watchSpec.size(); i++) {
                        snapshotWatchValues[i] = PixelWatch.UNKNOWN;
                    }
                }
            }

            if (callbackNs - lastVisualReportNs >= VISUAL_REPORT_INTERVAL_NS) {
                lastVisualReportNs = callbackNs;
                // Keep the 60 fps hot path allocation-free. Formatting every
                // frame made the first long-running probe accumulate avoidable
                // heap/RSS pressure even though Image buffers were closed.
                String content = String.format(Locale.US, "%dx%d visible=%d",
                        capturedContentWidth,
                        capturedContentHeight,
                        capturedContentVisibility);
                String invalidReason = ageUs < 0
                        ? "timestamp-invalid"
                        : ageUs > MAX_VISUAL_FRAME_AGE_US
                                ? "frame-stale"
                                : capturedContentInvalidReason();
                if (invalidReason == null) {
                    lastVisual = String.format(Locale.US,
                            "visual=OBSERVED seq=%d rgba=%d,%d,%d luma=%d "
                                    + "cam05_mean_luma=%d grey=%d ageUs=%d content=%s",
                            visualSequence, red, green, blue, luma, cam05MeanLuma,
                            greyCells, ageUs, content);
                } else {
                    lastVisual = String.format(Locale.US,
                            "visual=UNKNOWN seq=%d reason=%s ageUs=%d content=%s",
                            visualSequence, invalidReason, ageUs, content);
                }
                publishCombinedStatus("RUNNING");
            }
        } catch (Throwable error) {
            lastVisual = "visual=UNAVAILABLE(" + error.getClass().getSimpleName() + ")";
            Log.e(TAG, "visual frame failed", error);
            publishCombinedStatus("UNAVAILABLE");
        } finally {
            if (image != null) {
                image.close();
            }
        }
    }

    /** The whole 20x9 sensor as hex, for classifying what a single pixel cannot. */
    private String currentGrid() {
        StringBuilder out = new StringBuilder(16 + snapshotGrid.length * 6);
        synchronized (snapshotLock) {
            if (!snapshotGridValid) {
                return "ERROR grid-unavailable";
            }
            out.append("OK grid=").append(VISUAL_WIDTH).append('x').append(VISUAL_HEIGHT)
                    .append(" seq=").append(snapshotVisualSequence).append(' ');
            for (int cell : snapshotGrid) {
                out.append(HEX[(cell >> 20) & 0xf]).append(HEX[(cell >> 16) & 0xf])
                        .append(HEX[(cell >> 12) & 0xf]).append(HEX[(cell >> 8) & 0xf])
                        .append(HEX[(cell >> 4) & 0xf]).append(HEX[cell & 0xf]);
            }
        }
        return out.toString();
    }

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    /** Mean luma over a half-open native rectangle, or -1 if it does not fit. */
    private static int blockLuma(PixelWatch.Frame frame,
            int x0, int y0, int x1, int y1) {
        long total = 0;
        int count = 0;
        for (int y = y0; y < y1; y++) {
            for (int x = x0; x < x1; x++) {
                int rgb = frame.rgb(x, y);
                if (rgb == PixelWatch.UNKNOWN) {
                    return -1;
                }
                int r = (rgb >> 16) & 0xff;
                int g = (rgb >> 8) & 0xff;
                int b = rgb & 0xff;
                total += (77 * r + 150 * g + 29 * b) >> 8;
                count++;
            }
        }
        return count == 0 ? -1 : (int) (total / count);
    }

    private int scaleX(int logical, int logicalWidth) {
        return Math.min(captureWidth - 1,
                (int) ((long) logical * captureWidth / logicalWidth));
    }

    private int scaleY(int logical, int logicalHeight) {
        return Math.min(captureHeight - 1,
                (int) ((long) logical * captureHeight / logicalHeight));
    }

    private static boolean validCaptureSize(int width, int height) {
        if (width < PixelWatch.GRID_WIDTH || height < PixelWatch.GRID_HEIGHT
                || width > PixelWatch.NATIVE_WIDTH || height > PixelWatch.NATIVE_HEIGHT) {
            return false;
        }
        return (long) width * PixelWatch.GRID_HEIGHT
                == (long) height * PixelWatch.GRID_WIDTH;
    }

    private String capturedContentInvalidReason() {
        if (Build.VERSION.SDK_INT < 34) {
            return "content-invariants-unavailable";
        }
        if (capturedContentVisibility != 1) {
            return capturedContentVisibility == 0 ? "content-hidden" : "visibility-pending";
        }
        int width = capturedContentWidth;
        int height = capturedContentHeight;
        if (width <= 0 || height <= 0) {
            return "size-pending";
        }
        // The fixed 20x9 sensor maps to the calibrated 2400x1080 landscape
        // display. Permit 2% aspect drift for compositor rounding, but reject
        // portrait, split-screen, or another capture region before sampling is
        // ever allowed to influence a controller.
        long scaledWidth = (long) width * VISUAL_HEIGHT;
        long scaledHeight = (long) height * VISUAL_WIDTH;
        long error = Math.abs(scaledWidth - scaledHeight);
        if (error * 50L > Math.max(scaledWidth, scaledHeight)) {
            return "aspect-mismatch";
        }
        return null;
    }

    private String watchStatus() {
        return "watch=" + (watchActive ? "ACTIVE" : "OFF")
                + " spec=" + watchSpec.sha256()
                + " entries=" + watchSpec.size();
    }

    private static String externalAudioStatus() {
        return "audio=EXTERNAL authority=" + AUDIO_AUTHORITY
                + " state=UNKNOWN reason=external-authority-not-connected";
    }

    private String currentAudioStatus() {
        long receivedNs = lastAudioFactElapsedNs;
        if (receivedNs == 0L) {
            return lastAudio;
        }
        long ageMs = Math.max(0L,
                (SystemClock.elapsedRealtimeNanos() - receivedNs) / 1_000_000L);
        if (ageMs > AUDIO_FACT_STALE_MS) {
            return "audio=EXTERNAL authority=" + audioAuthorityName
                    + " state=UNKNOWN reason=external-authority-stale ageMs=" + ageMs
                    + " profile=" + audioProfileName;
        }
        return lastAudio + " ageMs=" + ageMs;
    }

    /** Return one bounded, authenticated-read response for the active watch. */
    private String currentWatch() {
        if (!watchActive) {
            return "ERROR watch-not-loaded expected=" + watchSpec.sha256();
        }

        long sequence;
        long timestampNs;
        int[] values = new int[watchSpec.size()];
        synchronized (snapshotLock) {
            sequence = snapshotVisualSequence;
            timestampNs = snapshotVisualTimestampNs;
            System.arraycopy(snapshotWatchValues, 0, values, 0, values.length);
        }
        long nowNs = System.nanoTime();
        long ageUs = timestampNs > 0 ? (nowNs - timestampNs) / 1_000L : -1;
        String invalidReason = ageUs < 0
                ? "frame-pending"
                : ageUs > MAX_VISUAL_FRAME_AGE_US
                        ? "frame-stale" : capturedContentInvalidReason();
        StringBuilder result = new StringBuilder(256);
        result.append("OK read=")
                .append(invalidReason == null ? "OBSERVED" : "UNKNOWN")
                .append(" spec=").append(watchSpec.sha256())
                .append(" seq=").append(sequence)
                .append(" snapshotNs=").append(timestampNs)
                .append(" ageUs=").append(ageUs);
        if (invalidReason != null) result.append(" reason=").append(invalidReason);
        for (int i = 0; i < watchSpec.size(); i++) {
            result.append(' ').append(watchSpec.entry(i).name).append('=');
            result.append(invalidReason != null || values[i] == PixelWatch.UNKNOWN
                    ? "UNKNOWN" : values[i]);
        }
        return result.toString();
    }

    private void startControlServer(long generation) throws IOException {
        byte[] tokenBytes = new byte[16];
        new SecureRandom().nextBytes(tokenBytes);
        char[] tokenChars = new char[tokenBytes.length * 2];
        final char[] hex = "0123456789abcdef".toCharArray();
        for (int i = 0; i < tokenBytes.length; i++) {
            int value = tokenBytes[i] & 0xff;
            tokenChars[i * 2] = hex[value >>> 4];
            tokenChars[i * 2 + 1] = hex[value & 0xf];
        }
        controlToken = new String(tokenChars);

        ServerSocket server = new ServerSocket();
        server.setReuseAddress(true);
        // Bind the IPv4 loopback explicitly. getLoopbackAddress() resolved to
        // ::1 on the API-36 target, and the device shell's nc reaches the
        // documented 127.0.0.1:49707 contract over IPv4 only.
        server.bind(new InetSocketAddress(
                InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), CONTROL_PORT), 1);
        controlServer = server;
        tcpControlUp = true;

        // The abstract socket is the cable-bound channel: `adb forward` reaches
        // it without the app opening a port any other process can probe. The
        // loopback port stays for the on-device controller, whose whole point
        // is deciding without an adb round trip.
        controlSocketName = CONTROL_SOCKET_PREFIX + "."
                + Long.toUnsignedString(generation, 36);
        LocalServerSocket localServer = openLocalControlServer(controlSocketName);
        localControlServer = localServer;
        localControlUp = true;

        controlRunning = true;
        publishControlStatus();
        Log.i(TAG, lastControl);

        controlThread = new Thread(
                () -> controlLoop(generation, server), "cue-control");
        controlThread.start();
        localControlThread = new Thread(
                () -> localControlLoop(generation, localServer), "cue-control-local");
        localControlThread.start();
    }

    private void startAudioFactServer(long generation) throws IOException {
        ServerSocket server = new ServerSocket();
        server.setReuseAddress(true);
        // The host bridge reaches this endpoint through an explicitly-created
        // adb forward. It is loopback-only and exists only for this capture
        // session; the session token authenticates the forwarded client.
        server.bind(new InetSocketAddress(
                InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), AUDIO_FACT_PORT), 1);
        audioFactServer = server;
        audioFactRunning = true;
        audioFactThread = new Thread(
                () -> audioFactLoop(generation, server), "cue-audio-facts");
        audioFactThread.start();
    }

    private void audioFactLoop(long generation, ServerSocket server) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        while (audioFactRunning && sessionActive(generation)) {
            try {
                Socket accepted = server.accept();
                audioFactClient = accepted;
                try (Socket client = accepted) {
                    serveAudioFactClient(client.getInputStream(), client.getOutputStream());
                } catch (IOException error) {
                    if (audioFactRunning && sessionActive(generation)) {
                        Log.w(TAG, "audio fact client failed", error);
                    }
                } finally {
                    audioFactClient = null;
                }
            } catch (SocketException error) {
                if (audioFactRunning && sessionActive(generation)) {
                    Log.e(TAG, "audio fact socket failed", error);
                    audioFactRunning = false;
                }
                break;
            } catch (Throwable error) {
                if (audioFactRunning && sessionActive(generation)) {
                    Log.w(TAG, "audio fact request failed", error);
                }
            }
        }
    }

    private void serveAudioFactClient(InputStream input, OutputStream output)
            throws IOException {
        String authentication = readBoundedAudioFactLine(input);
        if (!("AUTH " + controlToken).equals(authentication)) {
            writeAudioFactResponse(output, "ERROR unauthorized");
            return;
        }
        writeAudioFactResponse(output, "OK audio-link=READY");
        while (audioFactRunning && sessionActive(sessionGeneration)) {
            String line = readBoundedAudioFactLine(input);
            if (line == null) {
                return;
            }
            if (line.isEmpty()) {
                continue;
            }
            if (!acceptAudioFact(line)) {
                writeAudioFactResponse(output, "ERROR invalid-fact");
                return;
            }
        }
    }

    private void writeAudioFactResponse(OutputStream output, String response)
            throws IOException {
        output.write((response + "\n").getBytes(StandardCharsets.US_ASCII));
        output.flush();
    }

    private String readBoundedAudioFactLine(InputStream input) throws IOException {
        byte[] bytes = new byte[AUDIO_FACT_LINE_LIMIT];
        int length = 0;
        while (length < bytes.length) {
            int value = input.read();
            if (value == -1) {
                return length == 0 ? null : new String(bytes, 0, length,
                        StandardCharsets.US_ASCII);
            }
            if (value == '\n') {
                return new String(bytes, 0, length, StandardCharsets.US_ASCII);
            }
            if (value == '\r') {
                continue;
            }
            if (value < 0x20 || value > 0x7e) {
                return null;
            }
            bytes[length++] = (byte) value;
        }
        return null;
    }

    private boolean acceptAudioFact(String line) {
        try {
            JSONObject fact = new JSONObject(line);
            if (!"fact-message-v1".equals(fact.optString("schema"))) {
                return false;
            }
            String state = fact.optString("state");
            if (!"OBSERVED".equals(state) && !"UNKNOWN".equals(state)) {
                return false;
            }
            String type = statusToken(fact.optString("type"), "unknown");
            String source = statusToken(fact.optString("source"), AUDIO_AUTHORITY);
            String profile = statusToken(fact.optString("calibrationProfile"), "unknown");
            double confidence = fact.optDouble("confidence", -1.0);
            if ("unknown".equals(type) || confidence < 0.0
                    || confidence > 1.0 || !Double.isFinite(confidence)) {
                return false;
            }
            if ("OBSERVED".equals(state) && !fact.has("value")) {
                return false;
            }
            StringBuilder status = new StringBuilder(192);
            status.append("audio=EXTERNAL authority=").append(source)
                    .append(" state=").append(state)
                    .append(" type=").append(type)
                    .append(" confidence=").append(String.format(Locale.US, "%.3f", confidence))
                    .append(" profile=").append(profile);
            if ("UNKNOWN".equals(state)) {
                String reason = statusToken(fact.optString("reason"), "invalid-fact");
                status.append(" reason=").append(reason);
            }
            audioAuthorityName = source;
            audioProfileName = profile;
            lastAudio = status.toString();
            lastAudioFactElapsedNs = SystemClock.elapsedRealtimeNanos();
            publishCombinedStatus("RUNNING");
            return true;
        } catch (JSONException | RuntimeException error) {
            Log.w(TAG, "rejected external audio fact", error);
            return false;
        }
    }

    private static String statusToken(String value, String fallback) {
        if (value == null || value.isEmpty() || value.length() > 96) {
            return fallback;
        }
        StringBuilder token = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (character < 0x21 || character > 0x7e || character == '=') {
                return fallback;
            }
            token.append(character);
        }
        return token.toString();
    }

    private LocalServerSocket openLocalControlServer(String socketName) throws IOException {
        IOException lastError = null;
        for (int attempt = 0; attempt < 10; attempt++) {
            try {
                return new LocalServerSocket(socketName);
            } catch (IOException error) {
                lastError = error;
                if (attempt < 9) {
                    SystemClock.sleep(50L);
                }
            }
        }
        throw lastError;
    }

    private void publishControlStatus() {
        String state = tcpControlUp && localControlUp
                ? "READY"
                : tcpControlUp || localControlUp ? "DEGRADED" : "UNAVAILABLE";
        lastControl = "control=" + state
                + " port=" + (tcpControlUp ? String.valueOf(CONTROL_PORT) : "none")
                + " audioPort=" + (audioFactRunning ? String.valueOf(AUDIO_FACT_PORT) : "none")
                + " socket=" + (localControlUp ? controlSocketName : "none")
                + " token=" + (controlToken == null ? "none" : controlToken)
                + " " + watchStatus();
    }

    private void controlLoop(long generation, ServerSocket server) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        while (controlRunning && sessionActive(generation)) {
            try {
                Socket accepted = server.accept();
                try (Socket client = accepted) {
                    client.setSoTimeout(CONTROL_READ_TIMEOUT_MS);
                    serveControlRequest(client.getInputStream(), client.getOutputStream());
                } catch (IOException error) {
                    if (controlRunning && sessionActive(generation)) {
                        // A slow, disconnected, or malformed client loses only
                        // its own request. It cannot tear down the listener.
                        Log.w(TAG, "control client failed", error);
                    }
                }
            } catch (SocketException error) {
                // One dead listener must not silence the other channel, so the
                // shared shutdown flag is left alone here.
                if (controlRunning && sessionActive(generation)) {
                    Log.e(TAG, "control socket failed", error);
                    tcpControlUp = false;
                    publishControlStatus();
                    publishCombinedStatus("RUNNING");
                }
                break;
            } catch (Throwable error) {
                if (controlRunning && sessionActive(generation)) {
                    Log.w(TAG, "control request failed", error);
                }
            }
        }
    }

    private void localControlLoop(long generation, LocalServerSocket server) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        while (controlRunning && sessionActive(generation)) {
            try {
                LocalSocket accepted = server.accept();
                try (LocalSocket client = accepted) {
                    client.setSoTimeout(CONTROL_READ_TIMEOUT_MS);
                    serveControlRequest(client.getInputStream(), client.getOutputStream());
                } catch (IOException error) {
                    if (controlRunning && sessionActive(generation)) {
                        Log.w(TAG, "local control client failed", error);
                    }
                }
            } catch (IOException error) {
                if (controlRunning && sessionActive(generation)) {
                    Log.e(TAG, "local control socket failed", error);
                    localControlUp = false;
                    publishControlStatus();
                    publishCombinedStatus("RUNNING");
                }
                break;
            } catch (Throwable error) {
                if (controlRunning && sessionActive(generation)) {
                    Log.w(TAG, "local control request failed", error);
                }
            }
        }
    }

    private void serveControlRequest(InputStream input, OutputStream output)
            throws IOException {
        String request = readBoundedControlLine(input);
        String response;
        if (request == null) {
            response = "ERROR request-too-long";
        } else {
            String[] field = request.split(" ");
            String token = controlToken;
            if (field.length < 2 || token == null || !token.equals(field[1])) {
                response = "ERROR unauthorized";
            } else {
                response = dispatchControl(field);
            }
        }
        output.write((response + "\n").getBytes(StandardCharsets.US_ASCII));
        output.flush();
    }

    private String dispatchControl(String[] field) {
        switch (field[0]) {
            case "GET":
                return "OK " + currentSnapshot();
            case "GRID":
                // The full sensor, 0xRRGGBB per cell, row-major, as hex. One
                // line, no allocation on the capture thread -- the string is
                // built here, on the control thread, only when asked for.
                return currentGrid();
            case "WATCH":
                if (field.length != 3) {
                    return "ERROR watch-usage";
                }
                if ("status".equals(field[2])) {
                    return "OK " + watchStatus();
                }
                if (!watchSpec.sha256().equals(field[2])) {
                    return "ERROR watch-spec-mismatch expected=" + watchSpec.sha256();
                }
                if (captureWidth != PixelWatch.NATIVE_WIDTH
                        || captureHeight != PixelWatch.NATIVE_HEIGHT) {
                    return "ERROR watch-native-resolution-required capture="
                            + captureWidth + "x" + captureHeight;
                }
                synchronized (snapshotLock) {
                    watchActive = true;
                }
                publishControlStatus();
                return "OK " + watchStatus();
            case "READ":
                if (field.length != 2) {
                    return "ERROR read-usage";
                }
                return currentWatch();
            case "CAL":
            case "LOG":
            case "REC":
            case "MODEL":
            case "ARM":
            case "RESULT":
                return "ERROR audio-authority-external";
            default:
                return "ERROR unknown-verb";
        }
    }

    private String readBoundedControlLine(InputStream input) throws IOException {
        byte[] bytes = new byte[CONTROL_LINE_LIMIT];
        int length = 0;
        while (length < bytes.length) {
            int value = input.read();
            if (value == -1 || value == '\n') {
                return new String(bytes, 0, length, StandardCharsets.US_ASCII);
            }
            if (value == '\r') {
                continue;
            }
            if (value < 0x20 || value > 0x7e) {
                return "";
            }
            bytes[length++] = (byte) value;
        }
        return null;
    }

    private String currentSnapshot() {
        long visualSequenceSnapshot;
        long visualTimestampNs;
        int red;
        int green;
        int blue;
        int luma;
        int cam05MeanLuma;
        int greyCells;
        synchronized (snapshotLock) {
            visualSequenceSnapshot = snapshotVisualSequence;
            visualTimestampNs = snapshotVisualTimestampNs;
            red = snapshotRed;
            green = snapshotGreen;
            blue = snapshotBlue;
            luma = snapshotLuma;
            cam05MeanLuma = snapshotCam05MeanLuma;
            greyCells = snapshotGreyCells;
        }

        long nowNs = System.nanoTime();
        long visualAgeUs = visualTimestampNs > 0
                ? (nowNs - visualTimestampNs) / 1_000L : -1;
        String invalidReason = visualAgeUs < 0
                ? "timestamp-invalid"
                : visualAgeUs > MAX_VISUAL_FRAME_AGE_US
                        ? "frame-stale"
                        : capturedContentInvalidReason();
        String visual;
        if (invalidReason == null) {
            visual = String.format(Locale.US,
                    "visual=OBSERVED seq=%d rgba=%d,%d,%d luma=%d cam05_mean_luma=%d "
                            + "grey=%d ageUs=%d content=%dx%d visible=%d",
                    visualSequenceSnapshot, red, green, blue, luma, cam05MeanLuma,
                    greyCells, visualAgeUs,
                    capturedContentWidth, capturedContentHeight,
                    capturedContentVisibility);
        } else {
            visual = String.format(Locale.US,
                    "visual=UNKNOWN seq=%d reason=%s ageUs=%d content=%dx%d visible=%d",
                    visualSequenceSnapshot, invalidReason, visualAgeUs,
                    capturedContentWidth, capturedContentHeight,
                    capturedContentVisibility);
        }

        return "snapshotNs=" + nowNs + " " + visual + " "
                + currentAudioStatus() + " " + watchStatus();
    }

    private void publishCombinedStatus(String lifecycle) {
        publishStatus(lifecycle + "\n" + lastVisual + "\n" + currentAudioStatus()
                + "\n" + lastControl);
    }

    private void publishStatus(String status) {
        Log.i(TAG, status.replace('\n', ' '));
        Intent broadcast = new Intent(ACTION_STATUS)
                .setPackage(getPackageName())
                .putExtra(EXTRA_STATUS, status);
        sendBroadcast(broadcast);
    }

    private void failAndStop(String reason) {
        stopCapture(reason, true);
        stopSelf();
    }

    private void stopCapture(String reason, boolean stopProjection) {
        if (!stopping.compareAndSet(false, true)) {
            return;
        }
        ++sessionGeneration;
        Log.w(TAG, "stopping capture: " + reason);

        controlRunning = false;
        audioFactRunning = false;
        ServerSocket server = controlServer;
        controlServer = null;
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
                // Closing an already-failed local server is still stopped.
            }
        }
        LocalServerSocket localServer = localControlServer;
        localControlServer = null;
        if (localServer != null) {
            try {
                localServer.close();
            } catch (IOException ignored) {
                // Closing an already-failed local server is still stopped.
            }
        }
        ServerSocket audioServer = audioFactServer;
        audioFactServer = null;
        if (audioServer != null) {
            try {
                audioServer.close();
            } catch (IOException ignored) {
                // Closing an already-failed audio fact server is still stopped.
            }
        }
        Socket audioClient = audioFactClient;
        audioFactClient = null;
        if (audioClient != null) {
            try {
                audioClient.close();
            } catch (IOException ignored) {
                // Closing an already-failed audio fact client is still stopped.
            }
        }
        for (Thread worker : new Thread[] {controlThread, audioFactThread,
                localControlThread}) {
            if (worker != null && worker != Thread.currentThread()) {
                worker.interrupt();
            }
        }
        joinWorker(controlThread);
        joinWorker(audioFactThread);
        joinWorker(localControlThread);
        controlThread = null;
        audioFactThread = null;
        localControlThread = null;
        tcpControlUp = false;
        localControlUp = false;
        controlToken = null;
        controlSocketName = null;

        ImageReader reader = imageReader;
        imageReader = null;
        if (reader != null) {
            reader.setOnImageAvailableListener(null, null);
            reader.close();
        }
        VirtualDisplay display = virtualDisplay;
        virtualDisplay = null;
        if (display != null) {
            display.release();
        }
        HandlerThread handlerThread = visualThread;
        visualThread = null;
        if (handlerThread != null) {
            handlerThread.quitSafely();
            joinWorker(handlerThread);
        }

        MediaProjection activeProjection = projection;
        projection = null;
        if (activeProjection != null) {
            if (projectionCallback != null) {
                activeProjection.unregisterCallback(projectionCallback);
            }
            if (stopProjection) {
                activeProjection.stop();
            }
        }
        projectionCallback = null;
        capturedContentWidth = 0;
        capturedContentHeight = 0;
        capturedContentVisibility = -1;
        synchronized (snapshotLock) {
            snapshotGridValid = false;
            watchActive = false;
        }

        lastVisual = "visual=UNAVAILABLE(" + reason + ")";
        lastAudio = externalAudioStatus();
        lastAudioFactElapsedNs = 0L;
        audioAuthorityName = AUDIO_AUTHORITY;
        audioProfileName = "unknown";
        lastControl = "control=UNAVAILABLE(" + reason + ")";
        publishCombinedStatus("UNAVAILABLE");
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private boolean sessionActive(long generation) {
        return sessionGeneration == generation && !stopping.get();
    }

    private void joinWorker(Thread worker) {
        if (worker == null || worker == Thread.currentThread()) return;
        try {
            worker.join(1_000L);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public void onDestroy() {
        stopCapture("service-destroyed", true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
