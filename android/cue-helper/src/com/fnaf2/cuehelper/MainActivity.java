package com.fnaf2.cuehelper;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.media.projection.MediaProjectionManager;
import android.media.projection.MediaProjectionConfig;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.content.res.Configuration;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int REQUEST_MEDIA_PROJECTION = 1002;
    private static final String GAME_PACKAGE = "com.scottgames.fnaf2";
    private static final int COLOR_BACKGROUND = Color.rgb(18, 10, 11);
    private static final int COLOR_PANEL = Color.rgb(31, 16, 18);
    private static final int COLOR_PANEL_BORDER = Color.rgb(119, 45, 39);
    private static final int COLOR_AMBER = Color.rgb(255, 176, 32);
    private static final int COLOR_TEXT = Color.rgb(255, 235, 216);
    private static final int COLOR_MUTED = Color.rgb(218, 188, 165);
    private static final int COLOR_RED = Color.rgb(184, 39, 43);
    private static final int COLOR_RED_PRESSED = Color.rgb(132, 25, 31);
    private static final int COLOR_OPEN = Color.rgb(173, 92, 18);
    private static final int COLOR_OPEN_PRESSED = Color.rgb(125, 61, 13);
    private static final int COLOR_STOP = Color.rgb(76, 22, 26);
    private static final int COLOR_STOP_PRESSED = Color.rgb(48, 13, 17);
    private static final int COLOR_SETTINGS = Color.rgb(43, 24, 27);
    private static final int COLOR_SETTINGS_PRESSED = Color.rgb(65, 32, 34);

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
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
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
        root.setPadding(pad, dp(18), pad, pad);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(COLOR_BACKGROUND);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safeArea = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(
                        pad + safeArea.left,
                        dp(18) + safeArea.top,
                        pad + safeArea.right,
                        pad + safeArea.bottom);
                return insets;
            });
            root.post(root::requestApplyInsets);
        }

        TextView title = new TextView(this);
        title.setText("FNaF 2 Cue Helper");
        title.setTextSize(24);
        title.setTextColor(COLOR_AMBER);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.04f);
        root.addView(title, matchWrap());

        if (getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE) {
            addLandscapeContent(root);
            return root;
        }

        TextView explanation = new TextView(this);
        explanation.setText(
                "Each session uses user-approved MediaProjection screen capture "
                        + "with a persistent 20x9 stream. Audio comes from the external "
                        + "audio authority, using a transport-specific receiver. Stop and "
                        + "restart for a fresh session, then open FNaF 2.");
        explanation.setTextSize(16);
        explanation.setTextColor(COLOR_MUTED);
        explanation.setGravity(Gravity.CENTER);
        explanation.setPadding(0, dp(12), 0, dp(16));
        root.addView(explanation, matchWrap());

        statusView = new TextView(this);
        statusView.setText("UNAVAILABLE: capture has not started");
        statusView.setTextIsSelectable(true);
        statusView.setTextSize(15);
        statusView.setTextColor(COLOR_TEXT);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        statusView.setPadding(dp(12), dp(12), dp(12), dp(12));
        statusView.setBackground(panelBackground());
        root.addView(statusView, matchWrap());

        Button start = themedButton(
                "Start unified capture", COLOR_RED, COLOR_RED_PRESSED,
                COLOR_AMBER, COLOR_TEXT);
        start.setOnClickListener(view -> requestProjection());
        root.addView(start, matchWrap());

        Button openGame = themedButton(
                "Open FNaF 2", COLOR_OPEN, COLOR_OPEN_PRESSED,
                COLOR_AMBER, Color.rgb(20, 12, 8));
        openGame.setOnClickListener(view -> openGame());
        root.addView(openGame, matchWrap());

        Button stop = themedButton(
                "Stop capture", COLOR_STOP, COLOR_STOP_PRESSED,
                COLOR_PANEL_BORDER, COLOR_TEXT);
        stop.setOnClickListener(view -> {
            Intent intent = new Intent(this, CaptureService.class)
                    .setAction(CaptureService.ACTION_STOP);
            startService(intent);
        });
        root.addView(stop, matchWrap());

        Button settings = themedButton(
                "App settings", COLOR_SETTINGS, COLOR_SETTINGS_PRESSED,
                COLOR_PANEL_BORDER, COLOR_MUTED);
        settings.setOnClickListener(view -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        });
        root.addView(settings, matchWrap());

        return root;
    }

    private void addLandscapeContent(LinearLayout root) {
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.HORIZONTAL);
        body.setGravity(Gravity.CENTER_VERTICAL);
        body.setBaselineAligned(false);
        body.setPadding(0, dp(4), 0, dp(4));
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        bodyParams.setMargins(0, dp(4), 0, dp(4));
        root.addView(body, bodyParams);

        LinearLayout signalCard = new LinearLayout(this);
        signalCard.setOrientation(LinearLayout.VERTICAL);
        signalCard.setPadding(dp(18), dp(14), dp(18), dp(14));
        signalCard.setBackground(panelBackground());
        LinearLayout.LayoutParams signalParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.25f);
        signalParams.setMargins(0, 0, dp(8), 0);
        body.addView(signalCard, signalParams);

        TextView signalLabel = sectionLabel("SIGNAL FEED");
        signalCard.addView(signalLabel, columnChild());

        TextView explanation = new TextView(this);
        explanation.setText(
                "Each session uses user-approved MediaProjection screen capture "
                        + "with a persistent 20x9 stream. Audio comes from the external "
                        + "audio authority, using a transport-specific receiver. Stop and "
                        + "restart for a fresh session, then open FNaF 2.");
        explanation.setTextSize(15);
        explanation.setTextColor(COLOR_MUTED);
        explanation.setGravity(Gravity.CENTER);
        explanation.setPadding(0, dp(6), 0, dp(12));
        signalCard.addView(explanation, columnChild());

        statusView = new TextView(this);
        statusView.setText("UNAVAILABLE: capture has not started");
        statusView.setTextIsSelectable(true);
        statusView.setTextSize(14);
        statusView.setTextColor(COLOR_TEXT);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        statusView.setPadding(dp(12), dp(10), dp(12), dp(10));
        statusView.setBackground(panelBackground());
        signalCard.addView(statusView, columnChild());

        LinearLayout controlCard = new LinearLayout(this);
        controlCard.setOrientation(LinearLayout.VERTICAL);
        controlCard.setPadding(dp(18), dp(14), dp(18), dp(14));
        controlCard.setBackground(panelBackground());
        LinearLayout.LayoutParams controlParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.85f);
        controlParams.setMargins(dp(8), 0, 0, 0);
        body.addView(controlCard, controlParams);

        TextView controlLabel = sectionLabel("CONTROLS");
        controlCard.addView(controlLabel, columnChild());
        addControlButtons(controlCard);
    }

    private TextView sectionLabel(String label) {
        TextView view = new TextView(this);
        view.setText(label);
        view.setTextSize(12);
        view.setTextColor(COLOR_AMBER);
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setGravity(Gravity.CENTER);
        view.setLetterSpacing(0.14f);
        return view;
    }

    private LinearLayout.LayoutParams columnChild() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void addControlButtons(LinearLayout controlCard) {
        Button start = themedButton(
                "Start unified capture", COLOR_RED, COLOR_RED_PRESSED,
                COLOR_AMBER, COLOR_TEXT);
        start.setOnClickListener(view -> requestProjection());
        controlCard.addView(start, matchWrap());

        Button openGame = themedButton(
                "Open FNaF 2", COLOR_OPEN, COLOR_OPEN_PRESSED,
                COLOR_AMBER, Color.rgb(20, 12, 8));
        openGame.setOnClickListener(view -> openGame());
        controlCard.addView(openGame, matchWrap());

        Button stop = themedButton(
                "Stop capture", COLOR_STOP, COLOR_STOP_PRESSED,
                COLOR_PANEL_BORDER, COLOR_TEXT);
        stop.setOnClickListener(view -> {
            Intent intent = new Intent(this, CaptureService.class)
                    .setAction(CaptureService.ACTION_STOP);
            startService(intent);
        });
        controlCard.addView(stop, matchWrap());

        Button settings = themedButton(
                "App settings", COLOR_SETTINGS, COLOR_SETTINGS_PRESSED,
                COLOR_PANEL_BORDER, COLOR_MUTED);
        settings.setOnClickListener(view -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        });
        controlCard.addView(settings, matchWrap());
    }

    private Button themedButton(String label, int fill, int pressedFill,
            int stroke, int textColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(14);
        button.setTextColor(textColor);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setMinHeight(dp(48));
        button.setPadding(dp(12), dp(8), dp(12), dp(8));
        button.setBackground(buttonBackground(fill, pressedFill, stroke));
        return button;
    }

    private Drawable buttonBackground(int fill, int pressedFill, int stroke) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed},
                roundedBackground(pressedFill, stroke));
        states.addState(new int[]{}, roundedBackground(fill, stroke));
        return states;
    }

    private GradientDrawable roundedBackground(int fill, int stroke) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fill);
        background.setCornerRadius(dp(8));
        background.setStroke(dp(1), stroke);
        return background;
    }

    private GradientDrawable panelBackground() {
        GradientDrawable background = new GradientDrawable();
        background.setColor(COLOR_PANEL);
        background.setCornerRadius(dp(8));
        background.setStroke(dp(1), COLOR_PANEL_BORDER);
        return background;
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
        statusView.setText("STARTING: waiting for visual stream; audio authority is external");
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
