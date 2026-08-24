package com.fnafminus7.cuehelper;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.HardwareBuffer;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.AudioTimestamp;
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

public final class CaptureService extends Service {
    public static final String ACTION_START =
            "com.fnafminus7.cuehelper.action.START";
    public static final String ACTION_STOP =
            "com.fnafminus7.cuehelper.action.STOP";
    public static final String ACTION_STATUS =
            "com.fnafminus7.cuehelper.action.STATUS";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_STATUS = "status";

    private static final String TAG = "FnafCueHelper";
    private static final String GAME_PACKAGE = "com.scottgames.fnaf2";
    private static final String NOTIFICATION_CHANNEL = "capture";
    private static final int NOTIFICATION_ID = 7007;

    private static final int VISUAL_WIDTH = 20;
    private static final int VISUAL_HEIGHT = 9;
    private static final int VISUAL_X = 3;
    private static final int VISUAL_Y = 6;
    private static final long MAX_VISUAL_FRAME_AGE_US = 250_000L;
    private static final long MAX_AUDIO_READ_AGE_US = 250_000L;
    private static final long VISUAL_REPORT_INTERVAL_NS = 1_000_000_000L;
    private static final long AUDIO_REPORT_INTERVAL_MS = 1_000L;
    private static final int CONTROL_PORT = 49_707;
    private static final String CONTROL_SOCKET_NAME =
            "com.fnafminus7.cuehelper.control";
    private static final int CONTROL_LINE_LIMIT = 256;
    private static final int CONTROL_READ_TIMEOUT_MS = 1_000;

    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final AtomicBoolean audioRunning = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object snapshotLock = new Object();

    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread visualThread;
    private AudioRecord audioRecord;
    private Thread audioThread;
    private ServerSocket controlServer;
    private LocalServerSocket localControlServer;
    private Thread controlThread;
    private Thread localControlThread;
    private volatile boolean controlRunning;
    private volatile boolean tcpControlUp;
    private volatile boolean localControlUp;
    private String controlToken;

    private long visualSequence;
    private long lastVisualReportNs;
    private volatile int capturedContentWidth;
    private volatile int capturedContentHeight;
    // -1 is unknown, 0 is hidden, 1 is visible. The API-36 target must not
    // turn a letterboxed or hidden capture into a confident pixel reading.
    private volatile int capturedContentVisibility = -1;
    private volatile String lastVisual = "visual=UNAVAILABLE";
    private volatile String lastAudio = "audio=UNAVAILABLE";
    private volatile String lastControl = "control=UNAVAILABLE";

    private long snapshotVisualSequence;
    private long snapshotVisualTimestampNs;
    private int snapshotRed;
    private int snapshotGreen;
    private int snapshotBlue;
    private int snapshotLuma;
    private long snapshotAudioFrames;
    private long snapshotAudioReadNs;
    private int snapshotAudioRms;
    private int snapshotAudioPeak;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL,
                "Cue capture",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Active on-device visual and playback-audio capture");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopCapture("operator-stop", true);
            stopSelf();
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
                    capturedContentWidth = width;
                    capturedContentHeight = height;
                    Log.i(TAG, "captured content resized: " + width + "x" + height);
                }

                @Override
                public void onCapturedContentVisibilityChanged(boolean isVisible) {
                    capturedContentVisibility = isVisible ? 1 : 0;
                    Log.i(TAG, "captured content visible=" + isVisible);
                }

                @Override
                public void onStop() {
                    Log.w(TAG, "projection callback: stopped");
                    stopCapture("projection-stopped", false);
                    stopSelf();
                }
            };
            projection.registerCallback(projectionCallback, mainHandler);
            startVisualCapture();
            startAudioCapture();
            startControlServer();
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
                .setContentTitle("Minus 7 sensors active")
                .setContentText("20x9 visual and playback-audio probe")
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

    private void startVisualCapture() {
        visualThread = new HandlerThread(
                "cue-visual",
                Process.THREAD_PRIORITY_DISPLAY);
        visualThread.start();
        Handler visualHandler = new Handler(visualThread.getLooper());

        imageReader = ImageReader.newInstance(
                VISUAL_WIDTH,
                VISUAL_HEIGHT,
                PixelFormat.RGBA_8888,
                2,
                HardwareBuffer.USAGE_CPU_READ_OFTEN);
        imageReader.setOnImageAvailableListener(this::onImageAvailable, visualHandler);

        int densityDpi = getResources().getConfiguration().densityDpi;
        virtualDisplay = projection.createVirtualDisplay(
                "Minus7Visual",
                VISUAL_WIDTH,
                VISUAL_HEIGHT,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                new VirtualDisplay.Callback() {
                    @Override
                    public void onStopped() {
                        lastVisual = "visual=UNAVAILABLE(display-stopped)";
                        publishCombinedStatus("UNAVAILABLE");
                    }
                },
                visualHandler);

        if (virtualDisplay == null) {
            throw new IllegalStateException("createVirtualDisplay returned null");
        }
        lastVisual = "visual=STARTING(20x9,pixel=3,6)";
        Log.i(TAG, lastVisual);
    }

    private void onImageAvailable(ImageReader reader) {
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
            int offset = VISUAL_Y * plane.getRowStride()
                    + VISUAL_X * plane.getPixelStride();
            ByteBuffer buffer = plane.getBuffer();
            if (offset < 0 || offset + 2 >= buffer.limit()) {
                lastVisual = "visual=UNAVAILABLE(bounds)";
                return;
            }

            int red = buffer.get(offset) & 0xff;
            int green = buffer.get(offset + 1) & 0xff;
            int blue = buffer.get(offset + 2) & 0xff;
            int luma = (77 * red + 150 * green + 29 * blue) >> 8;
            long callbackNs = System.nanoTime();
            long timestampNs = image.getTimestamp();
            long ageUs = timestampNs > 0 ? (callbackNs - timestampNs) / 1_000L : -1;
            if (ageUs < 0 || ageUs > 10_000_000L) {
                ageUs = -1;
            }
            visualSequence++;
            synchronized (snapshotLock) {
                snapshotVisualSequence = visualSequence;
                snapshotVisualTimestampNs = timestampNs;
                snapshotRed = red;
                snapshotGreen = green;
                snapshotBlue = blue;
                snapshotLuma = luma;
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
                                    + "ageUs=%d content=%s",
                            visualSequence, red, green, blue, luma, ageUs, content);
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

    private void startAudioCapture() throws PackageManager.NameNotFoundException {
        ApplicationInfo game = getPackageManager().getApplicationInfo(GAME_PACKAGE, 0);
        AudioPlaybackCaptureConfiguration configuration =
                new AudioPlaybackCaptureConfiguration.Builder(projection)
                        .addMatchingUid(game.uid)
                        .addMatchingUsage(AudioAttributes.USAGE_GAME)
                        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                        .build();

        audioRecord = buildAudioRecord(configuration, 16_000);
        int sampleRate = 16_000;
        if (audioRecord == null) {
            audioRecord = buildAudioRecord(configuration, 48_000);
            sampleRate = 48_000;
        }
        if (audioRecord == null) {
            throw new IllegalStateException("no supported playback-capture format");
        }

        final int activeSampleRate = sampleRate;
        audioRecord.startRecording();
        if (audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            throw new IllegalStateException("AudioRecord did not start");
        }

        audioRunning.set(true);
        lastAudio = "audio=STARTING(rate=" + activeSampleRate + ",mono,pcm16)";
        Log.i(TAG, lastAudio + " uid=" + game.uid);
        audioThread = new Thread(
                () -> audioLoop(activeSampleRate),
                "cue-audio");
        audioThread.start();
    }

    private AudioRecord buildAudioRecord(
            AudioPlaybackCaptureConfiguration configuration,
            int sampleRate) {
        int minBytes = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        if (minBytes <= 0) {
            Log.w(TAG, "unsupported audio rate=" + sampleRate + " minBytes=" + minBytes);
            return null;
        }
        int bufferBytes = Math.max(minBytes * 2, sampleRate / 2);
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();
        try {
            AudioRecord record = new AudioRecord.Builder()
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(bufferBytes)
                    .setAudioPlaybackCaptureConfig(configuration)
                    .build();
            if (record.getState() == AudioRecord.STATE_INITIALIZED) {
                return record;
            }
            record.release();
        } catch (Throwable error) {
            Log.w(TAG, "AudioRecord build failed at " + sampleRate, error);
        }
        return null;
    }

    private void audioLoop(int sampleRate) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
        short[] samples = new short[1024];
        long nextReportMs = 0;
        long totalFrames = 0;
        AudioTimestamp timestamp = new AudioTimestamp();
        while (audioRunning.get()) {
            int count;
            try {
                count = audioRecord.read(
                        samples,
                        0,
                        samples.length,
                        AudioRecord.READ_BLOCKING);
            } catch (Throwable error) {
                if (audioRunning.get()) {
                    Log.e(TAG, "audio read failed", error);
                    lastAudio = "audio=UNAVAILABLE(read-"
                            + error.getClass().getSimpleName() + ")";
                    publishCombinedStatus("UNAVAILABLE");
                }
                break;
            }
            if (count <= 0) {
                if (count < 0) {
                    lastAudio = "audio=UNAVAILABLE(read=" + count + ")";
                    publishCombinedStatus("UNAVAILABLE");
                    break;
                }
                continue;
            }

            int peak = 0;
            long energy = 0;
            for (int i = 0; i < count; i++) {
                int value = samples[i];
                int magnitude = value == Short.MIN_VALUE ? 32768 : Math.abs(value);
                peak = Math.max(peak, magnitude);
                energy += (long) value * value;
            }
            int rms = (int) Math.sqrt((double) energy / count);
            totalFrames += count;
            synchronized (snapshotLock) {
                snapshotAudioFrames = totalFrames;
                snapshotAudioReadNs = System.nanoTime();
                snapshotAudioRms = rms;
                snapshotAudioPeak = peak;
            }
            long nowMs = SystemClock.elapsedRealtime();
            if (nowMs >= nextReportMs) {
                nextReportMs = nowMs + AUDIO_REPORT_INTERVAL_MS;
                int timestampStatus = audioRecord.getTimestamp(
                        timestamp,
                        AudioTimestamp.TIMEBASE_MONOTONIC);
                long audioAgeUs = -1;
                if (timestampStatus == AudioRecord.SUCCESS && timestamp.nanoTime > 0) {
                    audioAgeUs = (System.nanoTime() - timestamp.nanoTime) / 1_000L;
                    if (audioAgeUs < 0 || audioAgeUs > 10_000_000L) {
                        audioAgeUs = -1;
                    }
                }
                lastAudio = String.format(Locale.US,
                        "audio=OBSERVED rate=%d frames=%d rms=%d peak=%d ageUs=%d",
                        sampleRate, totalFrames, rms, peak, audioAgeUs);
                publishCombinedStatus("RUNNING");
            }
        }
        audioRunning.set(false);
    }

    private void startControlServer() throws IOException {
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
        localControlServer = new LocalServerSocket(CONTROL_SOCKET_NAME);
        localControlUp = true;

        controlRunning = true;
        publishControlStatus();
        Log.i(TAG, lastControl);

        controlThread = new Thread(this::controlLoop, "cue-control");
        controlThread.start();
        localControlThread = new Thread(this::localControlLoop, "cue-control-local");
        localControlThread.start();
    }

    private void publishControlStatus() {
        String state = tcpControlUp && localControlUp
                ? "READY"
                : tcpControlUp || localControlUp ? "DEGRADED" : "UNAVAILABLE";
        lastControl = "control=" + state
                + " port=" + (tcpControlUp ? String.valueOf(CONTROL_PORT) : "none")
                + " socket=" + (localControlUp ? CONTROL_SOCKET_NAME : "none")
                + " token=" + (controlToken == null ? "none" : controlToken);
    }

    private void controlLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        while (controlRunning) {
            try {
                Socket accepted = controlServer.accept();
                try (Socket client = accepted) {
                    client.setSoTimeout(CONTROL_READ_TIMEOUT_MS);
                    serveControlRequest(client.getInputStream(), client.getOutputStream());
                } catch (IOException error) {
                    if (controlRunning) {
                        // A slow, disconnected, or malformed client loses only
                        // its own request. It cannot tear down the listener.
                        Log.w(TAG, "control client failed", error);
                    }
                }
            } catch (SocketException error) {
                // One dead listener must not silence the other channel, so the
                // shared shutdown flag is left alone here.
                if (controlRunning) {
                    Log.e(TAG, "control socket failed", error);
                    tcpControlUp = false;
                    publishControlStatus();
                    publishCombinedStatus("RUNNING");
                }
                break;
            } catch (Throwable error) {
                if (controlRunning) {
                    Log.w(TAG, "control request failed", error);
                }
            }
        }
    }

    private void localControlLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        while (controlRunning) {
            try {
                LocalSocket accepted = localControlServer.accept();
                try (LocalSocket client = accepted) {
                    client.setSoTimeout(CONTROL_READ_TIMEOUT_MS);
                    serveControlRequest(client.getInputStream(), client.getOutputStream());
                } catch (IOException error) {
                    if (controlRunning) {
                        Log.w(TAG, "local control client failed", error);
                    }
                }
            } catch (IOException error) {
                if (controlRunning) {
                    Log.e(TAG, "local control socket failed", error);
                    localControlUp = false;
                    publishControlStatus();
                    publishCombinedStatus("RUNNING");
                }
                break;
            } catch (Throwable error) {
                if (controlRunning) {
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
        } else if (!request.equals("GET " + controlToken)) {
            response = "ERROR unauthorized";
        } else {
            response = "OK " + currentSnapshot();
        }
        output.write((response + "\n").getBytes(StandardCharsets.US_ASCII));
        output.flush();
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
        long audioFrames;
        long audioReadNs;
        int audioRms;
        int audioPeak;
        synchronized (snapshotLock) {
            visualSequenceSnapshot = snapshotVisualSequence;
            visualTimestampNs = snapshotVisualTimestampNs;
            red = snapshotRed;
            green = snapshotGreen;
            blue = snapshotBlue;
            luma = snapshotLuma;
            audioFrames = snapshotAudioFrames;
            audioReadNs = snapshotAudioReadNs;
            audioRms = snapshotAudioRms;
            audioPeak = snapshotAudioPeak;
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
                    "visual=OBSERVED seq=%d rgba=%d,%d,%d luma=%d ageUs=%d "
                            + "content=%dx%d visible=%d",
                    visualSequenceSnapshot, red, green, blue, luma, visualAgeUs,
                    capturedContentWidth, capturedContentHeight,
                    capturedContentVisibility);
        } else {
            visual = String.format(Locale.US,
                    "visual=UNKNOWN seq=%d reason=%s ageUs=%d content=%dx%d visible=%d",
                    visualSequenceSnapshot, invalidReason, visualAgeUs,
                    capturedContentWidth, capturedContentHeight,
                    capturedContentVisibility);
        }

        long audioReadAgeUs = audioReadNs > 0 ? (nowNs - audioReadNs) / 1_000L : -1;
        String audio;
        if (audioReadAgeUs < 0 || audioReadAgeUs > MAX_AUDIO_READ_AGE_US) {
            audio = String.format(Locale.US,
                    "audio=UNKNOWN reason=%s frames=%d readAgeUs=%d",
                    audioReadAgeUs < 0 ? "read-pending" : "read-stale",
                    audioFrames, audioReadAgeUs);
        } else {
            audio = String.format(Locale.US,
                    "audio=OBSERVED frames=%d rms=%d peak=%d readAgeUs=%d",
                    audioFrames, audioRms, audioPeak, audioReadAgeUs);
        }
        return "snapshotNs=" + nowNs + " " + visual + " " + audio;
    }

    private void publishCombinedStatus(String lifecycle) {
        publishStatus(lifecycle + "\n" + lastVisual + "\n" + lastAudio
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
        Log.w(TAG, "stopping capture: " + reason);

        controlRunning = false;
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
        for (Thread worker : new Thread[] {controlThread, localControlThread}) {
            if (worker != null && worker != Thread.currentThread()) {
                worker.interrupt();
            }
        }
        controlThread = null;
        localControlThread = null;
        tcpControlUp = false;
        localControlUp = false;
        controlToken = null;

        audioRunning.set(false);
        AudioRecord record = audioRecord;
        audioRecord = null;
        if (record != null) {
            try {
                record.stop();
            } catch (IllegalStateException ignored) {
                // A failed or already-stopped recorder is still unavailable.
            }
            record.release();
        }
        Thread worker = audioThread;
        audioThread = null;
        if (worker != null && worker != Thread.currentThread()) {
            worker.interrupt();
        }

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

        lastVisual = "visual=UNAVAILABLE(" + reason + ")";
        lastAudio = "audio=UNAVAILABLE(" + reason + ")";
        lastControl = "control=UNAVAILABLE(" + reason + ")";
        publishCombinedStatus("UNAVAILABLE");
        stopForeground(STOP_FOREGROUND_REMOVE);
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
