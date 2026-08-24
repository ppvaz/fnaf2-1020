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
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

import java.nio.ByteBuffer;
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
    private static final long VISUAL_REPORT_INTERVAL_NS = 1_000_000_000L;
    private static final long AUDIO_REPORT_INTERVAL_MS = 1_000L;

    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final AtomicBoolean audioRunning = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread visualThread;
    private AudioRecord audioRecord;
    private Thread audioThread;

    private long visualSequence;
    private long lastVisualReportNs;
    private volatile String lastVisual = "visual=UNAVAILABLE";
    private volatile String lastAudio = "audio=UNAVAILABLE";

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
                public void onStop() {
                    Log.w(TAG, "projection callback: stopped");
                    stopCapture("projection-stopped", false);
                    stopSelf();
                }
            };
            projection.registerCallback(projectionCallback, mainHandler);
            startVisualCapture();
            startAudioCapture();
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

            if (callbackNs - lastVisualReportNs >= VISUAL_REPORT_INTERVAL_NS) {
                lastVisualReportNs = callbackNs;
                // Keep the 60 fps hot path allocation-free. Formatting every
                // frame made the first long-running probe accumulate avoidable
                // heap/RSS pressure even though Image buffers were closed.
                lastVisual = String.format(Locale.US,
                        "visual=OBSERVED seq=%d rgba=%d,%d,%d luma=%d ageUs=%d",
                        visualSequence, red, green, blue, luma, ageUs);
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

    private void publishCombinedStatus(String lifecycle) {
        publishStatus(lifecycle + "\n" + lastVisual + "\n" + lastAudio);
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

        lastVisual = "visual=UNAVAILABLE(" + reason + ")";
        lastAudio = "audio=UNAVAILABLE(" + reason + ")";
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
