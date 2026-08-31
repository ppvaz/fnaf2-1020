package com.fnaf2.cuehelper;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothA2dp;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.ConnectivityManager;
import android.net.DhcpInfo;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.media.projection.MediaProjectionManager;
import android.media.projection.MediaProjectionConfig;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.content.res.Configuration;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int REQUEST_MEDIA_PROJECTION = 1002;
    private static final int REQUEST_BLUETOOTH_CONNECT = 1003;
    private static final int REQUEST_NEARBY_WIFI = 1004;
    private static final int REQUEST_AUDIO_MODEL = 1005;
    private static final String GAME_PACKAGE = "com.scottgames.fnaf2";
    // Bench ESP32 A2DP receiver flashed from firmware/esp32-audio-consumer.
    private static final String AUDIO_RECEIVER_NAME = "FNAF2 Audio Consumer";
    private static final String WIFI_AP_SSID = "FNAF2-AUDIO";
    private static final String WIFI_AP_PASSWORD = "fnaf2-audio";
    private static final int COLOR_BACKGROUND = Color.rgb(18, 10, 11);
    private static final int COLOR_PANEL = Color.rgb(31, 16, 18);
    private static final int COLOR_PANEL_BORDER = Color.rgb(119, 45, 39);
    private static final int COLOR_AMBER = Color.rgb(255, 176, 32);
    private static final int COLOR_TEXT = Color.rgb(255, 235, 216);
    private static final int COLOR_MUTED = Color.rgb(218, 188, 165);
    private static final int COLOR_BONNIE = Color.rgb(95, 57, 137);
    private static final int COLOR_BONNIE_PRESSED = Color.rgb(67, 38, 99);
    private static final int COLOR_BONNIE_STROKE = Color.rgb(176, 132, 214);
    private static final int COLOR_FREDDY = Color.rgb(111, 66, 43);
    private static final int COLOR_FREDDY_PRESSED = Color.rgb(77, 42, 28);
    private static final int COLOR_FREDDY_STROKE = Color.rgb(196, 139, 100);
    private static final int COLOR_CHICA = Color.rgb(211, 166, 35);
    private static final int COLOR_CHICA_PRESSED = Color.rgb(163, 121, 20);
    private static final int COLOR_CHICA_STROKE = Color.rgb(255, 222, 105);
    private static final int COLOR_FOXY_MANGLE = Color.rgb(178, 58, 89);
    private static final int COLOR_FOXY_MANGLE_PRESSED = Color.rgb(124, 37, 64);
    private static final int COLOR_FOXY_MANGLE_STROKE = Color.rgb(238, 154, 174);
    private static final String SESSION_DETAILS =
            "Each session uses user-approved MediaProjection screen capture "
                    + "with a persistent 20x9 stream. Audio comes from the external "
                    + "audio authority, using a transport-specific receiver. The phone "
                    + "the optional phone monitor reproduces PCM returned by the ESP32. "
                    + "Stop and restart for a fresh session, then open FNaF 2.";

    private MediaProjectionManager projectionManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothA2dp a2dpProxy;
    private TextView statusView;
    private TextView diagnosticView;
    private TextView audioAnalysisView;
    private TextView audioStatusView;
    private ScrollView landscapeStatusScroll;
    private Button bluetoothButton;
    private Button captureButton;
    private Button audioMonitorButton;
    private Button audioRecordButton;
    private Button shareAudioButton;
    private Typeface hudTypeface;
    private boolean captureRunning;
    private boolean audioMonitoring;
    private boolean audioRecording;
    private boolean receiverRegistered;
    private boolean bluetoothReceiverRegistered;
    private boolean profileProxyRequested;
    private boolean bluetoothPermissionRequested;
    private boolean openBluetoothSettingsAfterPermission;
    private boolean nearbyWifiPermissionRequested;
    private boolean connectEspWifiAfterPermission;
    private boolean bluetoothConnected;
    private boolean firmwareAudioReceiverConnected;
    private boolean wifiEspConnected;
    private String audioStatusText = "AUDIO A2DP: checking receiver...\nreceiver = "
            + AUDIO_RECEIVER_NAME + " (discover by name)";

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!CaptureService.ACTION_STATUS.equals(intent.getAction())) {
                return;
            }
            String status = intent.getStringExtra(CaptureService.EXTRA_STATUS);
            if (status != null) {
                if (statusView != null) {
                    statusView.setText(status);
                }
                if (diagnosticView != null) {
                    diagnosticView.setText(status);
                }
                if (audioAnalysisView != null) {
                    audioAnalysisView.setText(extractAudioStatus(status));
                }
                if (status.startsWith("RUNNING") || status.startsWith("STARTING")) {
                    setCaptureRunning(true);
                } else if (status.startsWith("UNAVAILABLE")) {
                    setCaptureRunning(false);
                }
                if (status.contains("audioRecord=ON")) {
                    setAudioRecording(true);
                } else if (status.contains("audioRecord=READY")
                        || status.contains("audioRecord=OFF")) {
                    setAudioRecording(false);
                }
                if (status.contains("audioMonitor=ON")
                        || status.contains("audioMonitor=STARTING")) {
                    setAudioMonitoring(true);
                } else if (status.contains("audioMonitor=OFF")
                        || status.contains("audioMonitor=ERROR")) {
                    setAudioMonitoring(false);
                }
            }
        }
    };

    private final BroadcastReceiver bluetoothReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED.equals(action)
                    || BluetoothA2dp.ACTION_PLAYING_STATE_CHANGED.equals(action)) {
                refreshAudioStatus();
            }
        }
    };

    private final BluetoothProfile.ServiceListener profileListener =
            new BluetoothProfile.ServiceListener() {
                @Override
                public void onServiceConnected(int profile, BluetoothProfile proxy) {
                    if (profile != BluetoothProfile.A2DP) {
                        return;
                    }
                    a2dpProxy = (BluetoothA2dp) proxy;
                    refreshAudioStatus();
                }

                @Override
                public void onServiceDisconnected(int profile) {
                    if (profile != BluetoothProfile.A2DP) {
                        return;
                    }
                    a2dpProxy = null;
                    profileProxyRequested = false;
                    refreshAudioStatus();
                }
            };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        projectionManager = getSystemService(MediaProjectionManager.class);
        BluetoothManager bluetoothManager = getSystemService(BluetoothManager.class);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
        try {
            hudTypeface = Typeface.createFromAsset(getAssets(), "fonts/hud-font.otf");
        } catch (RuntimeException error) {
            // Keep the helper usable if a stripped/custom build omits the optional asset.
            hudTypeface = Typeface.DEFAULT;
        }
        setContentView(buildUi());
        refreshSetupGuide();
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

        IntentFilter bluetoothFilter = new IntentFilter();
        bluetoothFilter.addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED);
        bluetoothFilter.addAction(BluetoothA2dp.ACTION_PLAYING_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(bluetoothReceiver, bluetoothFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(bluetoothReceiver, bluetoothFilter);
        }
        bluetoothReceiverRegistered = true;
        ensureBluetoothReady();
        // Configuration changes recreate this Activity. Ask the service for
        // its current combined state so portrait and landscape do not wait for
        // the next sensor heartbeat to redraw the signal feed.
        startService(new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_QUERY_STATUS));
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshAudioStatus();
        refreshSetupGuide();
    }

    @Override
    protected void onStop() {
        if (receiverRegistered) {
            unregisterReceiver(statusReceiver);
            receiverRegistered = false;
        }
        if (bluetoothReceiverRegistered) {
            unregisterReceiver(bluetoothReceiver);
            bluetoothReceiverRegistered = false;
        }
        if (a2dpProxy != null && hasBluetoothConnectPermission()
                && bluetoothAdapter != null) {
            bluetoothAdapter.closeProfileProxy(BluetoothProfile.A2DP, a2dpProxy);
        }
        a2dpProxy = null;
        profileProxyRequested = false;
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

        root.addView(titleHeader(), matchWrap());

        FrameLayout pages = new FrameLayout(this);
        LinearLayout.LayoutParams pagesParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        pagesParams.setMargins(0, dp(8), 0, 0);

        Button[] tabs = new Button[4];
        String[] labels = {"SESSION", "AUDIO", "DIAGNOSTIC", "CONFIG"};
        LinearLayout tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        tabBar.setGravity(Gravity.CENTER);
        for (int index = 0; index < labels.length; index++) {
            final int tabIndex = index;
            tabs[index] = themedButton(labels[index], COLOR_PANEL,
                    COLOR_FREDDY_PRESSED, COLOR_PANEL_BORDER, COLOR_TEXT);
            tabs[index].setTextSize(11);
            tabs[index].setPadding(dp(4), 0, dp(4), 0);
            tabs[index].setOnClickListener(view -> selectTab(pages, tabs, tabIndex));
            LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            tabParams.setMargins(dp(2), 0, dp(2), 0);
            tabBar.addView(tabs[index], tabParams);
        }
        root.addView(tabBar, matchWrap());

        pages.addView(sessionPage(), pageParams());
        pages.addView(audioPage(), pageParams());
        pages.addView(diagnosticPage(), pageParams());
        pages.addView(configPage(), pageParams());
        root.addView(pages, pagesParams);
        selectTab(pages, tabs, 0);

        return root;
    }

    private FrameLayout.LayoutParams pageParams() {
        return new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
    }

    private void selectTab(FrameLayout pages, Button[] tabs, int selected) {
        for (int index = 0; index < pages.getChildCount(); index++) {
            pages.getChildAt(index).setVisibility(index == selected
                    ? View.VISIBLE : View.GONE);
            if (tabs[index] != null) {
                tabs[index].setTextColor(index == selected ? COLOR_AMBER : COLOR_TEXT);
            }
        }
    }

    private ScrollView scrollPage(LinearLayout content) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private LinearLayout pageContent(String label) {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(4), 0, dp(12));
        content.addView(sectionLabel(label), matchWrap());
        return content;
    }

    private ScrollView sessionPage() {
        LinearLayout content = pageContent("SESSION / PILOT");
        statusView = statusTextView();
        content.addView(statusView, matchWrap());
        content.addView(captureButton(), matchWrap());
        content.addView(openGameButton(), matchWrap());
        TextView note = bodyText(
                "Run controls stay here. Audio authority and detailed diagnostics "
                        + "are in their own tabs.");
        content.addView(note, matchWrap());
        return scrollPage(content);
    }

    private ScrollView audioPage() {
        LinearLayout content = pageContent("AUDIO");
        audioStatusView = audioStatusView();
        content.addView(audioStatusView, matchWrap());
        audioAnalysisView = statusTextView();
        content.addView(audioAnalysisView, matchWrap());
        content.addView(bluetoothButton(), matchWrap());
        content.addView(audioMonitorButton(), matchWrap());
        content.addView(audioRecordButton(), matchWrap());
        content.addView(shareAudioButton(), matchWrap());
        TextView note = bodyText(
                "ESP32 remains the audio authority. Phone monitoring reproduces the "
                        + "PCM returned on UDP 49710 and routes it to the built-in speaker.");
        content.addView(note, matchWrap());
        return scrollPage(content);
    }

    private ScrollView diagnosticPage() {
        LinearLayout content = pageContent("DIAGNOSTIC / RAW STATUS");
        diagnosticView = statusTextView();
        content.addView(diagnosticView, matchWrap());
        content.addView(themedButton("Session details", COLOR_PANEL,
                COLOR_FREDDY_PRESSED, COLOR_PANEL_BORDER, COLOR_TEXT), matchWrap());
        Button details = (Button) content.getChildAt(content.getChildCount() - 1);
        details.setOnClickListener(view -> showSessionDetailsDialog());
        return scrollPage(content);
    }

    private ScrollView configPage() {
        LinearLayout content = pageContent("CONFIGURATION");
        Button importModel = themedButton("Import audio model", COLOR_BONNIE,
                COLOR_BONNIE_PRESSED, COLOR_BONNIE_STROKE, COLOR_TEXT);
        importModel.setOnClickListener(view -> importAudioModel());
        content.addView(importModel, matchWrap());
        content.addView(settingsRow(), matchWrap());
        content.addView(bodyText(
                "Runtime target: phone + ESP32. A computer is an optional offline "
                        + "diagnostic and analysis tool."), matchWrap());
        return scrollPage(content);
    }

    private String extractAudioStatus(String status) {
        if (status == null) {
            return "audio service status unavailable";
        }
        for (String line : status.split("\\n")) {
            if (line.startsWith("audio=")) {
                return line;
            }
        }
        return "audio service status unavailable";
    }

    private TextView statusTextView() {
        TextView view = new TextView(this);
        view.setText("UNAVAILABLE: capture has not started");
        view.setTextIsSelectable(true);
        view.setTextSize(14);
        view.setTextColor(COLOR_TEXT);
        view.setTypeface(Typeface.MONOSPACE);
        view.setGravity(Gravity.TOP);
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        view.setBackground(panelBackground());
        return view;
    }

    private TextView bodyText(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(14);
        view.setTextColor(COLOR_MUTED);
        view.setPadding(dp(8), dp(8), dp(8), dp(8));
        return view;
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
        signalCard.setGravity(Gravity.TOP);
        signalCard.setPadding(dp(18), dp(14), dp(18), dp(14));
        signalCard.setBackground(panelBackground());
        LinearLayout.LayoutParams signalParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.MATCH_PARENT, 1.25f);
        signalParams.setMargins(0, 0, dp(8), 0);
        body.addView(signalCard, signalParams);

        signalCard.addView(signalHeader(), columnChild());

        statusView = new TextView(this);
        statusView.setText("UNAVAILABLE: capture has not started");
        statusView.setTextIsSelectable(true);
        statusView.setTextSize(14);
        statusView.setTextColor(COLOR_TEXT);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setIncludeFontPadding(false);
        statusView.setGravity(Gravity.TOP);
        statusView.setPadding(dp(10), dp(7), dp(10), dp(7));
        statusView.setBackground(panelBackground());

        // The capture status can expand to several lines while running. Keep
        // that verbose stream in a bounded, scrollable area so it cannot push
        // the audio receiver state out of the signal feed.
        landscapeStatusScroll = new ScrollView(this);
        landscapeStatusScroll.setFillViewport(false);
        landscapeStatusScroll.setVerticalScrollBarEnabled(true);
        landscapeStatusScroll.addView(statusView, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams statusScrollParams = statusScrollLayoutParams(captureRunning);
        signalCard.addView(landscapeStatusScroll, statusScrollParams);

        audioStatusView = audioStatusView();
        // The landscape signal column has less vertical room. Keep the
        // complete three-line receiver state inside its card instead of
        // allowing the last line to be clipped at the navigation inset.
        audioStatusView.setTextSize(11);
        audioStatusView.setIncludeFontPadding(false);
        audioStatusView.setPadding(dp(10), dp(6), dp(10), dp(6));
        signalCard.addView(audioStatusView, columnChild());

        LinearLayout controlCard = new LinearLayout(this);
        controlCard.setOrientation(LinearLayout.VERTICAL);
        controlCard.setGravity(Gravity.CENTER_VERTICAL);
        controlCard.setPadding(dp(18), dp(14), dp(18), dp(14));
        controlCard.setBackground(panelBackground());
        LinearLayout.LayoutParams controlParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.MATCH_PARENT, 0.85f);
        controlParams.setMargins(dp(8), 0, 0, 0);
        body.addView(controlCard, controlParams);

        TextView controlLabel = sectionLabel("CONTROLS");
        controlCard.addView(controlLabel, columnChild());
        controlCard.addView(bluetoothButton(), matchWrap());
        addControlButtons(controlCard);
    }

    private TextView sectionLabel(String label) {
        TextView view = new TextView(this);
        view.setText(label);
        view.setTextSize(12);
        view.setTextColor(COLOR_AMBER);
        view.setTypeface(hudTypeface);
        view.setGravity(Gravity.CENTER);
        view.setLetterSpacing(0.14f);
        return view;
    }

    private TextView titleHeader() {
        TextView title = new TextView(this);
        title.setText("FNaF 2 Cue Helper");
        title.setTextSize(24);
        title.setTextColor(COLOR_AMBER);
        title.setTypeface(hudTypeface);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.04f);
        return title;
    }

    private LinearLayout settingsRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        Button settings = themedButton(
                "App settings", COLOR_FOXY_MANGLE, COLOR_FOXY_MANGLE_PRESSED,
                COLOR_FOXY_MANGLE_STROKE, COLOR_TEXT);
        settings.setOnClickListener(view -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        });
        row.addView(settings, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button help = themedButton(
                "?", COLOR_TEXT, Color.rgb(226, 204, 193),
                COLOR_FOXY_MANGLE_STROKE, Color.BLACK);
        help.setTextSize(20);
        help.setPadding(0, 0, 0, 0);
        help.setContentDescription("Session details");
        help.setOnClickListener(view -> showSessionDetailsDialog());
        LinearLayout.LayoutParams helpParams = new LinearLayout.LayoutParams(dp(48), dp(48));
        helpParams.setMargins(dp(4), 0, 0, 0);
        row.addView(help, helpParams);
        return row;
    }

    private void showSessionDetailsDialog() {
        TextView details = new TextView(this);
        details.setText(SESSION_DETAILS);
        details.setTextSize(16);
        details.setTextColor(COLOR_TEXT);
        details.setTypeface(hudTypeface);
        details.setTextIsSelectable(true);
        details.setPadding(dp(24), dp(8), dp(24), dp(8));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(details, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Session details")
                .setView(scroll)
                .setPositiveButton("Close", null)
                .create();
        dialog.setOnShowListener(ignored -> {
            Button close = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            if (close != null) {
                close.setAllCaps(false);
                close.setTypeface(hudTypeface);
                close.setTextColor(COLOR_AMBER);
            }
        });
        dialog.show();
    }

    private LinearLayout signalHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView dot = new TextView(this);
        dot.setText("\u25CF");
        dot.setTextSize(22);
        dot.setTextColor(Color.rgb(224, 34, 38));
        dot.setGravity(Gravity.CENTER);
        dot.setIncludeFontPadding(false);
        dot.setContentDescription("Signal feed indicator");
        dot.setPadding(0, 0, dp(6), 0);
        header.addView(dot, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView label = sectionLabel("SIGNAL FEED");
        label.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        header.addView(label, labelParams);
        return header;
    }

    private LinearLayout.LayoutParams columnChild() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void addControlButtons(LinearLayout controlCard) {
        controlCard.addView(captureButton(), matchWrap());
        controlCard.addView(audioMonitorButton(), matchWrap());
        controlCard.addView(audioRecordButton(), matchWrap());
        controlCard.addView(shareAudioButton(), matchWrap());

        Button openGame = themedButton(
                "Open FNaF 2", COLOR_CHICA, COLOR_CHICA_PRESSED,
                COLOR_CHICA_STROKE, Color.rgb(35, 24, 5));
        openGame.setOnClickListener(view -> openGame());
        controlCard.addView(openGame, matchWrap());

        controlCard.addView(settingsRow(), matchWrap());
    }

    private TextView audioStatusView() {
        TextView view = new TextView(this);
        view.setText(audioStatusText);
        view.setTextIsSelectable(true);
        view.setTextSize(14);
        view.setTextColor(COLOR_TEXT);
        view.setTypeface(Typeface.MONOSPACE);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        view.setBackground(panelBackground());
        return view;
    }

    private Button bluetoothButton() {
        bluetoothButton = themedButton(
                "Connect audio receiver", COLOR_BONNIE, COLOR_BONNIE_PRESSED,
                COLOR_BONNIE_STROKE, COLOR_TEXT);
        bluetoothButton.setOnClickListener(view -> {
            if (firmwareAudioReceiverConnected && !isEspWifiConnected()) {
                connectEspWifi();
            } else {
                openBluetoothSettings();
            }
        });
        return bluetoothButton;
    }

    private Button captureButton() {
        captureButton = themedButton(
                captureRunning ? "Stop video capture" : "Start video capture",
                COLOR_FREDDY, COLOR_FREDDY_PRESSED,
                COLOR_FREDDY_STROKE, COLOR_TEXT);
        captureButton.setOnClickListener(view -> toggleCapture());
        return captureButton;
    }

    private Button openGameButton() {
        Button openGame = themedButton(
                "Open FNaF 2", COLOR_CHICA, COLOR_CHICA_PRESSED,
                COLOR_CHICA_STROKE, Color.rgb(35, 24, 5));
        openGame.setOnClickListener(view -> openGame());
        return openGame;
    }

    private Button audioMonitorButton() {
        audioMonitorButton = themedButton(
                audioMonitoring ? "Stop ESP32 PCM monitor" : "Monitor ESP32 PCM on phone",
                COLOR_BONNIE, COLOR_BONNIE_PRESSED,
                COLOR_BONNIE_STROKE, COLOR_TEXT);
        audioMonitorButton.setOnClickListener(view -> toggleAudioMonitor());
        return audioMonitorButton;
    }

    private Button audioRecordButton() {
        audioRecordButton = themedButton(
                audioRecording ? "Stop ESP audio recording" : "Record ESP audio (dev)",
                COLOR_FOXY_MANGLE, COLOR_FOXY_MANGLE_PRESSED,
                COLOR_FOXY_MANGLE_STROKE, COLOR_TEXT);
        audioRecordButton.setOnClickListener(view -> toggleAudioRecording());
        return audioRecordButton;
    }

    private Button shareAudioButton() {
        shareAudioButton = themedButton(
                "Share last audio", COLOR_TEXT, Color.rgb(226, 204, 193),
                COLOR_FOXY_MANGLE_STROKE, Color.BLACK);
        shareAudioButton.setOnClickListener(view -> shareLastAudio());
        return shareAudioButton;
    }

    private void setCaptureRunning(boolean running) {
        captureRunning = running;
        if (captureButton != null) {
            captureButton.setText(running ? "Stop video capture" : "Start video capture");
        }
        if (landscapeStatusScroll != null) {
            landscapeStatusScroll.setLayoutParams(statusScrollLayoutParams(running));
        }
    }

    private void setAudioMonitoring(boolean monitoring) {
        audioMonitoring = monitoring;
        if (audioMonitorButton != null) {
            audioMonitorButton.setText(monitoring
                    ? "Stop ESP32 PCM monitor" : "Monitor ESP32 PCM on phone");
        }
    }

    private void toggleAudioMonitor() {
        if (!captureRunning) {
            Toast.makeText(this, "Start video capture first", Toast.LENGTH_SHORT).show();
            return;
        }
        if (audioMonitoring) {
            startService(new Intent(this, CaptureService.class)
                    .setAction(CaptureService.ACTION_STOP_AUDIO_MONITOR));
            return;
        }
        startPhoneAudioMonitor();
    }

    private void startPhoneAudioMonitor() {
        startService(new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_START_AUDIO_MONITOR));
    }

    private void importAudioModel() {
        Intent open = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .setType("text/plain")
                .addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(open, REQUEST_AUDIO_MODEL);
    }

    private void installAudioModel(android.net.Uri uri) throws IOException {
        if (uri == null) {
            throw new IOException("model-uri-missing");
        }
        File temporary = File.createTempFile("cue-model-", ".tmp", getFilesDir());
        try {
            try (InputStream input = getContentResolver().openInputStream(uri);
                    FileOutputStream output = new FileOutputStream(temporary)) {
                if (input == null) {
                    throw new IOException("model-open-failed");
                }
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > 1_000_000) {
                        throw new IOException("model-too-large");
                    }
                    output.write(buffer, 0, read);
                }
            }
            AudioAnalyzer.readModel(temporary);
            File target = new File(getFilesDir(), "cue-model-v1.txt");
            File backup = new File(getFilesDir(), "cue-model-v1.txt.bak");
            if (backup.exists() && !backup.delete()) {
                throw new IOException("model-backup-remove-failed");
            }
            boolean movedOld = target.exists() && target.renameTo(backup);
            if (!temporary.renameTo(target)) {
                if (movedOld) {
                    backup.renameTo(target);
                }
                throw new IOException("model-install-failed");
            }
            if (movedOld) {
                backup.delete();
            }
        } finally {
            if (temporary.exists()) {
                temporary.delete();
            }
        }
    }

    private void setAudioRecording(boolean recording) {
        audioRecording = recording;
        if (audioRecordButton != null) {
            audioRecordButton.setText(recording
                    ? "Stop ESP audio recording" : "Record ESP audio (dev)");
        }
    }

    private void toggleAudioRecording() {
        if (!captureRunning) {
            Toast.makeText(this, "Start video capture first", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(this, CaptureService.class).setAction(
                audioRecording ? CaptureService.ACTION_STOP_AUDIO_RECORD
                        : CaptureService.ACTION_START_AUDIO_RECORD);
        startService(intent);
        setAudioRecording(!audioRecording);
    }

    private void shareLastAudio() {
        File directory = new File(getFilesDir(), "audio-captures");
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".wav"));
        if (files == null || files.length == 0) {
            Toast.makeText(this, "No ESP32 audio recording yet", Toast.LENGTH_SHORT).show();
            return;
        }
        Arrays.sort(files, (left, right) -> Long.compare(
                right.lastModified(), left.lastModified()));
        File file = files[0];
        Uri uri = Uri.parse("content://com.fnaf2.cuehelper.files/audio-captures/"
                + Uri.encode(file.getName()));
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("audio/wav")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(send, "Share ESP32 audio"));
    }

    private LinearLayout.LayoutParams statusScrollLayoutParams(boolean expanded) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                expanded ? 0 : LinearLayout.LayoutParams.WRAP_CONTENT,
                expanded ? 1f : 0f);
        params.setMargins(0, dp(4), 0, dp(4));
        return params;
    }

    private void toggleCapture() {
        if (!captureRunning) {
            if (!bluetoothConnected
                    || (firmwareAudioReceiverConnected && !isEspWifiConnected())) {
                refreshSetupGuide();
                showAudioSetupDialog();
                return;
            }
            requestProjection();
            return;
        }
        Intent intent = new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_STOP);
        startService(intent);
        setCaptureRunning(false);
        setAudioMonitoring(false);
        setAudioRecording(false);
    }

    private Button themedButton(String label, int fill, int pressedFill,
            int stroke, int textColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(14);
        button.setTextColor(textColor);
        button.setTypeface(hudTypeface);
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

    private boolean hasBluetoothConnectPermission() {
        return Build.VERSION.SDK_INT < 31
                || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureBluetoothReady() {
        if (!hasBluetoothConnectPermission()) {
            if (!bluetoothPermissionRequested) {
                bluetoothPermissionRequested = true;
                requestPermissions(
                        new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                        REQUEST_BLUETOOTH_CONNECT);
            }
            refreshAudioStatus();
            return;
        }
        if (bluetoothAdapter == null) {
            refreshAudioStatus();
            return;
        }
        if (a2dpProxy == null && !profileProxyRequested) {
            profileProxyRequested = bluetoothAdapter.getProfileProxy(
                    this, profileListener, BluetoothProfile.A2DP);
        }
        refreshAudioStatus();
    }

    private void refreshAudioStatus() {
        if (audioStatusView == null) {
            return;
        }
        if (!hasBluetoothConnectPermission()) {
            setAudioReceiverState(false, false);
            setAudioDisplayText(
                    "AUDIO A2DP: permission required\n"
                            + "tap Connect audio receiver to authorize BLUETOOTH_CONNECT");
            return;
        }
        if (bluetoothAdapter == null) {
            setAudioReceiverState(false, false);
            setAudioDisplayText("AUDIO A2DP: unavailable\nBluetooth adapter not found");
            return;
        }
        if (!bluetoothAdapter.isEnabled()) {
            setAudioReceiverState(false, false);
            setAudioDisplayText("AUDIO A2DP: Bluetooth off\n"
                    + "enable Bluetooth, then connect " + AUDIO_RECEIVER_NAME);
            return;
        }
        if (a2dpProxy == null) {
            setAudioReceiverState(false, false);
            setAudioDisplayText("AUDIO A2DP: checking receiver...\nreceiver = "
                    + AUDIO_RECEIVER_NAME + " (discover by name)");
            return;
        }
        try {
            BluetoothDevice receiver = findConnectedAudioReceiver();
            if (receiver != null) {
                boolean firmwareReceiver = AUDIO_RECEIVER_NAME.equals(receiver.getName());
                boolean playing = a2dpProxy.isA2dpPlaying(receiver);
                setAudioReceiverState(true, firmwareReceiver);
                setAudioStatus(
                        "AUDIO A2DP: " + (playing ? "STREAMING" : "CONNECTED"),
                        "receiver = " + bluetoothDeviceName(receiver),
                        "address = " + receiver.getAddress());
                return;
            }

            BluetoothDevice firmwareReceiver = findFirmwareAudioReceiver();
            if (firmwareReceiver != null) {
                int state = a2dpProxy.getConnectionState(firmwareReceiver);
                setAudioReceiverState(false, false);
                setAudioStatus(
                        "AUDIO A2DP: " + bluetoothStateName(state),
                        "receiver = " + AUDIO_RECEIVER_NAME,
                        "address = " + firmwareReceiver.getAddress());
                return;
            }

            setAudioReceiverState(false, false);
            setAudioStatus(
                    "AUDIO A2DP: DISCONNECTED",
                    "receiver = " + AUDIO_RECEIVER_NAME,
                    "pair/connect the device with this name");
        } catch (SecurityException exception) {
            setAudioReceiverState(false, false);
            setAudioDisplayText("AUDIO A2DP: BLUETOOTH_CONNECT permission required");
        }
    }

    private BluetoothDevice findConnectedAudioReceiver() {
        if (a2dpProxy == null) {
            return null;
        }
        for (BluetoothDevice device : a2dpProxy.getConnectedDevices()) {
            return device;
        }
        return null;
    }

    private BluetoothDevice findFirmwareAudioReceiver() {
        if (a2dpProxy != null) {
            for (BluetoothDevice device : a2dpProxy.getConnectedDevices()) {
                if (AUDIO_RECEIVER_NAME.equals(device.getName())) {
                    return device;
                }
            }
        }
        if (bluetoothAdapter != null) {
            for (BluetoothDevice device : bluetoothAdapter.getBondedDevices()) {
                if (AUDIO_RECEIVER_NAME.equals(device.getName())) {
                    return device;
                }
            }
        }
        return null;
    }

    private String bluetoothDeviceName(BluetoothDevice device) {
        String name = device.getName();
        return name == null ? "unknown A2DP receiver" : name;
    }

    private void setAudioStatus(String headline, String receiverLine, String extraLine) {
        String text = headline + "\n" + receiverLine;
        if (extraLine != null) {
            text += getResources().getConfiguration().orientation
                    == Configuration.ORIENTATION_LANDSCAPE
                    ? " | " + extraLine : "\n" + extraLine;
        }
        setAudioDisplayText(text);
    }

    private void setAudioDisplayText(String text) {
        audioStatusText = text;
        refreshSetupGuide();
    }

    private void setAudioReceiverState(boolean connected, boolean firmwareReceiver) {
        bluetoothConnected = connected;
        firmwareAudioReceiverConnected = connected && firmwareReceiver;
        updateAudioButton();
        refreshSetupGuide();
    }

    private void updateAudioButton() {
        if (bluetoothButton == null) {
            return;
        }
        if (firmwareAudioReceiverConnected && !isEspWifiConnected()) {
            bluetoothButton.setText("Connect ESP32 Wi-Fi");
        } else if (bluetoothConnected) {
            bluetoothButton.setText("Disconnect audio receiver");
        } else {
            bluetoothButton.setText("Connect audio receiver");
        }
    }

    private void refreshSetupGuide() {
        if (audioStatusView == null) {
            return;
        }

        wifiEspConnected = firmwareAudioReceiverConnected && isEspWifiConnected();
        String wifiLine;
        if (wifiEspConnected) {
            wifiLine = "Wi-Fi: CONNECTED to " + WIFI_AP_SSID;
        } else if (firmwareAudioReceiverConnected && hasWifiTransport()) {
            String ssid = connectedWifiSsid();
            wifiLine = "Wi-Fi: " + (ssid == null ? "connected; verify " : ssid
                    + "; select ") + WIFI_AP_SSID
                    + " (password: " + WIFI_AP_PASSWORD + ")";
        } else if (firmwareAudioReceiverConnected) {
            wifiLine = "Wi-Fi: connect " + WIFI_AP_SSID
                    + " (password: " + WIFI_AP_PASSWORD + ")";
        } else {
            wifiLine = "Wi-Fi: not required for this A2DP receiver";
        }
        String nextStep;
        if (!bluetoothConnected) {
            nextStep = "Next: tap Connect audio receiver";
        } else if (firmwareAudioReceiverConnected && !wifiEspConnected) {
            nextStep = "Next: tap the audio button for Wi-Fi settings";
        } else {
            nextStep = "SETUP READY: tap Start video capture";
        }
        audioStatusView.setText(audioStatusText + "\n" + wifiLine + "\n" + nextStep);
        updateAudioButton();
    }

    private boolean isEspWifiConnected() {
        String ssid = connectedWifiSsid();
        if (ssid != null) {
            return WIFI_AP_SSID.equals(ssid);
        }
        // Android may hide the SSID from apps without location permission.
        // The ESP32 soft AP uses the stable default gateway 192.168.4.1, so
        // use that local-only signal as a permission-free fallback.
        try {
            WifiManager wifiManager = getSystemService(WifiManager.class);
            DhcpInfo dhcp = wifiManager == null ? null : wifiManager.getDhcpInfo();
            return dhcp != null && isEspApAddress(dhcp.gateway);
        } catch (SecurityException exception) {
            return false;
        }
    }

    private boolean isEspApAddress(int address) {
        int first = address & 0xff;
        int second = (address >>> 8) & 0xff;
        int third = (address >>> 16) & 0xff;
        int fourth = (address >>> 24) & 0xff;
        return (first == 192 && second == 168 && third == 4 && fourth == 1)
                || (first == 1 && second == 4 && third == 168 && fourth == 192);
    }

    private String connectedWifiSsid() {
        try {
            WifiManager wifiManager = getSystemService(WifiManager.class);
            if (wifiManager == null) {
                return null;
            }
            WifiInfo info = wifiManager.getConnectionInfo();
            if (info == null) {
                return null;
            }
            String ssid = info.getSSID();
            if (ssid == null || "<unknown ssid>".equalsIgnoreCase(ssid)) {
                return null;
            }
            if (ssid.length() >= 2 && ssid.startsWith("\"")
                    && ssid.endsWith("\"")) {
                ssid = ssid.substring(1, ssid.length() - 1);
            }
            return ssid;
        } catch (SecurityException exception) {
            return null;
        }
    }

    private boolean hasWifiTransport() {
        ConnectivityManager manager = getSystemService(ConnectivityManager.class);
        if (manager == null) {
            return false;
        }
        for (Network network : manager.getAllNetworks()) {
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            if (capabilities != null && capabilities.hasTransport(
                    NetworkCapabilities.TRANSPORT_WIFI)) {
                return true;
            }
        }
        return false;
    }

    private String bluetoothStateName(int state) {
        switch (state) {
            case BluetoothProfile.STATE_CONNECTED:
                return "CONNECTED";
            case BluetoothProfile.STATE_CONNECTING:
                return "CONNECTING";
            case BluetoothProfile.STATE_DISCONNECTING:
                return "DISCONNECTING";
            case BluetoothProfile.STATE_DISCONNECTED:
                return "DISCONNECTED";
            default:
                return "UNKNOWN (" + state + ")";
        }
    }

    private void openBluetoothSettings() {
        if (!hasBluetoothConnectPermission()) {
            openBluetoothSettingsAfterPermission = true;
            bluetoothPermissionRequested = true;
            requestPermissions(
                    new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                    REQUEST_BLUETOOTH_CONNECT);
            return;
        }
        startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
    }

    private void openWifiSettings() {
        connectEspWifi();
    }

    private boolean hasNearbyWifiPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)
                    == PackageManager.PERMISSION_GRANTED;
        }
        if (Build.VERSION.SDK_INT >= 29) {
            return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void connectEspWifi() {
        if (!hasNearbyWifiPermission()) {
            if (!nearbyWifiPermissionRequested) {
                nearbyWifiPermissionRequested = true;
                connectEspWifiAfterPermission = true;
                String permission = Build.VERSION.SDK_INT >= 33
                        ? Manifest.permission.NEARBY_WIFI_DEVICES
                        : Manifest.permission.ACCESS_FINE_LOCATION;
                requestPermissions(new String[]{permission}, REQUEST_NEARBY_WIFI);
            }
            return;
        }
        startService(new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_CONNECT_AUDIO_WIFI));
        setAudioDisplayText("Wi-Fi: requesting managed local connection to "
                + WIFI_AP_SSID);
    }

    private void showAudioSetupDialog() {
        String message = audioStatusView == null
                ? "Connect the ESP32 Bluetooth receiver and Wi-Fi network first."
                : audioStatusView.getText().toString();
        new AlertDialog.Builder(this)
                .setTitle("Prepare ESP32 audio")
                .setMessage(message)
                .setPositiveButton("Close", null)
                .show();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_NEARBY_WIFI) {
            nearbyWifiPermissionRequested = false;
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted && connectEspWifiAfterPermission) {
                connectEspWifiAfterPermission = false;
                connectEspWifi();
            } else if (!granted) {
                connectEspWifiAfterPermission = false;
                Toast.makeText(this,
                        "ESP32 Wi-Fi connection needs nearby-device permission",
                        Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != REQUEST_BLUETOOTH_CONNECT) {
            return;
        }
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            ensureBluetoothReady();
            if (openBluetoothSettingsAfterPermission) {
                openBluetoothSettingsAfterPermission = false;
                startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            }
        } else {
            openBluetoothSettingsAfterPermission = false;
            refreshAudioStatus();
            Toast.makeText(this, "Bluetooth receiver monitoring needs BLUETOOTH_CONNECT",
                    Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_AUDIO_MODEL) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                return;
            }
            try {
                installAudioModel(data.getData());
                startService(new Intent(this, CaptureService.class)
                        .setAction(CaptureService.ACTION_RELOAD_AUDIO_MODEL));
                Toast.makeText(this, "Audio model installed and reloaded",
                        Toast.LENGTH_LONG).show();
            } catch (IOException | RuntimeException error) {
                Toast.makeText(this, "Audio model rejected: " + error.getMessage(),
                        Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != REQUEST_MEDIA_PROJECTION) {
            return;
        }
        if (resultCode != RESULT_OK || data == null) {
            setCaptureRunning(false);
            statusView.setText("UNAVAILABLE: projection consent denied");
            return;
        }

        Intent service = new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_START)
                .putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
                .putExtra(CaptureService.EXTRA_RESULT_DATA, data);
        startForegroundService(service);
        setCaptureRunning(true);
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
