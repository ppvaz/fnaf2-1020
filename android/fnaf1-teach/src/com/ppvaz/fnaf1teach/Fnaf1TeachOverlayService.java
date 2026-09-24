package com.ppvaz.fnaf1teach;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;

import java.io.FileDescriptor;
import java.io.PrintWriter;

/** A foreground, passive FNaF 1 teaching strip with a dumpable state contract. */
public final class Fnaf1TeachOverlayService extends Service {
    public static final String ACTION_START = "com.ppvaz.fnaf1teach.START";
    public static final String ACTION_SHOW = "com.ppvaz.fnaf1teach.SHOW";
    public static final String ACTION_UPDATE = "com.ppvaz.fnaf1teach.UPDATE";
    public static final String ACTION_CLEAR = "com.ppvaz.fnaf1teach.CLEAR";
    public static final String EXTRA_NIGHT = "night";
    public static final String EXTRA_STAGE = "stage";
    public static final String EXTRA_RUN = "run";
    private static final String CHANNEL = "fnaf1-teach-presenter";
    private static final int NOTIFICATION_ID = 1201;

    private WindowManager windowManager;
    private Fnaf1TeachView view;
    private boolean attached;
    private String status = "STARTING";
    private int night = 1;
    private String stage = "hands-off";
    private String run = "none";

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = getSystemService(WindowManager.class);
        createChannel();
        startForeground(NOTIFICATION_ID, notification());
        status = Settings.canDrawOverlays(this) ? "READY" : "WAITING_PERMISSION";
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_CLEAR.equals(action)) {
            clear();
        } else if (ACTION_SHOW.equals(action) || ACTION_UPDATE.equals(action)) {
            update(intent);
        } else {
            status = Settings.canDrawOverlays(this) ? "READY" : "WAITING_PERMISSION";
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        clear();
        super.onDestroy();
    }

    private void update(Intent intent) {
        int nextNight = intent.getIntExtra(EXTRA_NIGHT, -1);
        String nextStage = intent.getStringExtra(EXTRA_STAGE);
        String nextRun = intent.getStringExtra(EXTRA_RUN);
        if (!Fnaf1TeachContract.validNight(nextNight)
                || !Fnaf1TeachContract.validStage(nextStage)
                || nextRun == null || !nextRun.matches("[a-z0-9][a-z0-9-]{0,95}")) {
            status = "REFUSED_INVALID_COMMAND";
            return;
        }
        if (!Settings.canDrawOverlays(this)) {
            clear();
            status = "WAITING_PERMISSION";
            return;
        }
        night = nextNight;
        stage = nextStage;
        run = nextRun;
        if (view == null) view = new Fnaf1TeachView(this);
        view.setStage(night, stage);
        if (!attached) {
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    Fnaf1TeachContract.RIGHT - Fnaf1TeachContract.LEFT,
                    Fnaf1TeachContract.BOTTOM - Fnaf1TeachContract.TOP,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.OPAQUE);
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = Fnaf1TeachContract.LEFT;
            params.y = Fnaf1TeachContract.TOP;
            params.alpha = 1.0f;
            params.packageName = getPackageName();
            if (Build.VERSION.SDK_INT >= 28) {
                params.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            }
            if (Build.VERSION.SDK_INT >= 30) params.setFitInsetsTypes(0);
            try {
                windowManager.addView(view, params);
                attached = true;
            } catch (RuntimeException error) {
                status = "ERROR_" + error.getClass().getSimpleName();
                return;
            }
        }
        status = "VISIBLE";
    }

    private void clear() {
        if (attached && view != null) {
            try {
                windowManager.removeViewImmediate(view);
            } catch (RuntimeException ignored) {
                // The platform may have detached the window as the service dies.
            }
        }
        attached = false;
        status = Settings.canDrawOverlays(this) ? "CLEAR" : "WAITING_PERMISSION";
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "FNaF 1 teaching presenter", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification notification() {
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("FNaF 1 teaching presenter")
                .setContentText("Passive non-touchable overlay ready")
                .setOngoing(true)
                .build();
    }

    @Override
    protected void dump(FileDescriptor fd, PrintWriter writer, String[] args) {
        super.dump(fd, writer, args);
        writer.println("fnaf1-teach schema=" + Fnaf1TeachContract.SCHEMA
                + " status=" + status
                + " permission=" + (Settings.canDrawOverlays(this) ? "GRANTED" : "DENIED")
                + " attached=" + attached
                + " interactive=false"
                + " rect=" + Fnaf1TeachContract.LEFT + "," + Fnaf1TeachContract.TOP + ","
                + Fnaf1TeachContract.RIGHT + "," + Fnaf1TeachContract.BOTTOM
                + " night=" + night + " stage=" + stage + " run=" + run);
    }
}
