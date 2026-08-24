package com.fnafminus7.cuehelper;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.media.projection.MediaProjectionConfig;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int REQUEST_RECORD_AUDIO = 1001;
    private static final int REQUEST_MEDIA_PROJECTION = 1002;
    private static final String GAME_PACKAGE = "com.scottgames.fnaf2";

    private MediaProjectionManager projectionManager;
    private TextView statusView;
    private boolean receiverRegistered;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!CaptureService.ACTION_STATUS.equals(intent.getAction())) {
                return;
            }
            String status = intent.getStringExtra(CaptureService.EXTRA_STATUS);
            if (status != null) {
                statusView.setText(status);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        projectionManager = getSystemService(MediaProjectionManager.class);
        setContentView(buildUi());
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(CaptureService.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(statusReceiver, filter);
        }
        receiverRegistered = true;
    }

    @Override
    protected void onStop() {
        if (receiverRegistered) {
            unregisterReceiver(statusReceiver);
            receiverRegistered = false;
        }
        super.onStop();
    }

    private View buildUi() {
        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("Minus 7 cue helper");
        title.setTextSize(24);
        root.addView(title, matchWrap());

        TextView explanation = new TextView(this);
        explanation.setText(
                "One consent session owns a persistent 20x9 visual stream and "
                        + "UID-filtered playback audio. Open FNaF after capture starts.");
        explanation.setTextSize(16);
        explanation.setPadding(0, dp(12), 0, dp(16));
        root.addView(explanation, matchWrap());

        statusView = new TextView(this);
        statusView.setText("UNAVAILABLE: capture has not started");
        statusView.setTextIsSelectable(true);
        statusView.setTextSize(15);
        statusView.setPadding(dp(12), dp(12), dp(12), dp(12));
        root.addView(statusView, matchWrap());

        Button start = new Button(this);
        start.setText("Start unified capture");
        start.setOnClickListener(view -> ensurePermissionsAndRequestProjection());
        root.addView(start, matchWrap());

        Button openGame = new Button(this);
        openGame.setText("Open FNaF 2");
        openGame.setOnClickListener(view -> openGame());
        root.addView(openGame, matchWrap());

        Button stop = new Button(this);
        stop.setText("Stop capture");
        stop.setOnClickListener(view -> {
            Intent intent = new Intent(this, CaptureService.class)
                    .setAction(CaptureService.ACTION_STOP);
            startService(intent);
        });
        root.addView(stop, matchWrap());

        Button settings = new Button(this);
        settings.setText("App settings");
        settings.setOnClickListener(view -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        });
        root.addView(settings, matchWrap());

        return root;
    }

    private void ensurePermissionsAndRequestProjection() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},
                    REQUEST_RECORD_AUDIO);
            return;
        }
        requestProjection();
    }

    private void requestProjection() {
        Intent request;
        if (Build.VERSION.SDK_INT >= 34) {
            request = projectionManager.createScreenCaptureIntent(
                    MediaProjectionConfig.createConfigForDefaultDisplay());
        } else {
            request = projectionManager.createScreenCaptureIntent();
        }
        startActivityForResult(request, REQUEST_MEDIA_PROJECTION);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_RECORD_AUDIO) {
            return;
        }
        if (grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            requestProjection();
        } else {
            statusView.setText("UNAVAILABLE: RECORD_AUDIO denied");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_MEDIA_PROJECTION) {
            return;
        }
        if (resultCode != RESULT_OK || data == null) {
            statusView.setText("UNAVAILABLE: projection consent denied");
            return;
        }

        Intent service = new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_START)
                .putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
                .putExtra(CaptureService.EXTRA_RESULT_DATA, data);
        startForegroundService(service);
        statusView.setText("STARTING: waiting for visual and audio streams");
    }

    private void openGame() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(GAME_PACKAGE);
        if (launch == null) {
            Toast.makeText(this, "FNaF 2 is not installed", Toast.LENGTH_LONG).show();
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launch);
    }

    private LinearLayout.LayoutParams matchWrap() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(4), 0, dp(4));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
