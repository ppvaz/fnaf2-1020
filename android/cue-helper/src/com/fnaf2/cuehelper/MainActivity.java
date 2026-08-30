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
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int REQUEST_MEDIA_PROJECTION = 1002;
    private static final int REQUEST_BLUETOOTH_CONNECT = 1003;
    private static final String GAME_PACKAGE = "com.scottgames.fnaf2";
    // Current external A2DP receiver used by the experiment.
    private static final String AUDIO_RECEIVER_ADDRESS = "C4:23:60:B6:03:40";
    private static final String AUDIO_RECEIVER_NAME = "pedro-82cg";
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
                    + "audio authority, using a transport-specific receiver. Stop and "
                    + "restart for a fresh session, then open FNaF 2.";

    private MediaProjectionManager projectionManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothA2dp a2dpProxy;
    private TextView statusView;
    private TextView audioStatusView;
    private ScrollView landscapeStatusScroll;
    private Button bluetoothButton;
    private Button captureButton;
    private Typeface hudTypeface;
    private boolean captureRunning;
    private boolean receiverRegistered;
    private boolean bluetoothReceiverRegistered;
    private boolean profileProxyRequested;
    private boolean bluetoothPermissionRequested;
    private boolean openBluetoothSettingsAfterPermission;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!CaptureService.ACTION_STATUS.equals(intent.getAction())) {
                return;
            }
            String status = intent.getStringExtra(CaptureService.EXTRA_STATUS);
            if (status != null) {
                statusView.setText(status);
                if (status.startsWith("RUNNING") || status.startsWith("STARTING")) {
                    setCaptureRunning(true);
                } else if (status.startsWith("UNAVAILABLE")) {
                    setCaptureRunning(false);
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

        if (getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE) {
            addLandscapeContent(root);
            return root;
        }

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

        audioStatusView = audioStatusView();
        root.addView(audioStatusView, matchWrap());

        root.addView(bluetoothButton(), matchWrap());
        root.addView(captureButton(), matchWrap());

        Button openGame = themedButton(
                "Open FNaF 2", COLOR_CHICA, COLOR_CHICA_PRESSED,
                COLOR_CHICA_STROKE, Color.rgb(35, 24, 5));
        openGame.setOnClickListener(view -> openGame());
        root.addView(openGame, matchWrap());

        root.addView(settingsRow(), matchWrap());

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

        Button openGame = themedButton(
                "Open FNaF 2", COLOR_CHICA, COLOR_CHICA_PRESSED,
                COLOR_CHICA_STROKE, Color.rgb(35, 24, 5));
        openGame.setOnClickListener(view -> openGame());
        controlCard.addView(openGame, matchWrap());

        controlCard.addView(settingsRow(), matchWrap());
    }

    private TextView audioStatusView() {
        TextView view = new TextView(this);
        view.setText("AUDIO A2DP: checking receiver...\nreceiver = "
                + AUDIO_RECEIVER_NAME + " (" + AUDIO_RECEIVER_ADDRESS + ")");
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
        bluetoothButton.setOnClickListener(view -> openBluetoothSettings());
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

    private void setCaptureRunning(boolean running) {
        captureRunning = running;
        if (captureButton != null) {
            captureButton.setText(running ? "Stop video capture" : "Start video capture");
        }
        if (landscapeStatusScroll != null) {
            landscapeStatusScroll.setLayoutParams(statusScrollLayoutParams(running));
        }
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
            requestProjection();
            return;
        }
        Intent intent = new Intent(this, CaptureService.class)
                .setAction(CaptureService.ACTION_STOP);
        startService(intent);
        setCaptureRunning(false);
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
        audioStatusView.setText(
                    "AUDIO A2DP: permission required\n"
                            + "tap Connect audio receiver to authorize BLUETOOTH_CONNECT");
            return;
        }
        if (bluetoothAdapter == null) {
            audioStatusView.setText("AUDIO A2DP: unavailable\nBluetooth adapter not found");
            return;
        }
        if (!bluetoothAdapter.isEnabled()) {
            audioStatusView.setText("AUDIO A2DP: Bluetooth off\n"
                    + "enable Bluetooth, then connect " + AUDIO_RECEIVER_NAME);
            return;
        }
        if (a2dpProxy == null) {
            setBluetoothConnected(false);
            audioStatusView.setText("AUDIO A2DP: checking receiver...\nreceiver = "
                    + AUDIO_RECEIVER_NAME + " (" + AUDIO_RECEIVER_ADDRESS + ")");
            return;
        }
        try {
            BluetoothDevice receiver = bluetoothAdapter.getRemoteDevice(AUDIO_RECEIVER_ADDRESS);
            int state = a2dpProxy.getConnectionState(receiver);
            if (state == BluetoothProfile.STATE_CONNECTED) {
                boolean playing = a2dpProxy.isA2dpPlaying(receiver);
                setBluetoothConnected(true);
                setAudioStatus(
                        "AUDIO A2DP: " + (playing ? "STREAMING" : "CONNECTED"),
                        "receiver = " + AUDIO_RECEIVER_NAME,
                        "PCM source = external receiver");
            } else {
                setBluetoothConnected(false);
                setAudioStatus(
                        "AUDIO A2DP: " + bluetoothStateName(state),
                        "receiver = " + AUDIO_RECEIVER_NAME,
                        "tap Connect audio receiver to open Bluetooth settings");
            }
        } catch (IllegalArgumentException exception) {
            setBluetoothConnected(false);
            audioStatusView.setText("AUDIO A2DP: invalid receiver address\n"
                    + AUDIO_RECEIVER_ADDRESS);
        } catch (SecurityException exception) {
            setBluetoothConnected(false);
            audioStatusView.setText("AUDIO A2DP: BLUETOOTH_CONNECT permission required");
        }
    }

    private void setAudioStatus(String headline, String receiverLine, String extraLine) {
        String text = headline + "\n" + receiverLine;
        if (extraLine != null) {
            text += getResources().getConfiguration().orientation
                    == Configuration.ORIENTATION_LANDSCAPE
                    ? " | " + extraLine : "\n" + extraLine;
        }
        audioStatusView.setText(text);
    }

    private void setBluetoothConnected(boolean connected) {
        if (bluetoothButton != null) {
            bluetoothButton.setText(connected
                    ? "Disconnect audio receiver" : "Connect audio receiver");
        }
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

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
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
