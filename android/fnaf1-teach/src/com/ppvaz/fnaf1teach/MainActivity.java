package com.ppvaz.fnaf1teach;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Explicit user-consent surface for the FNaF 1-only teaching presenter. */
public final class MainActivity extends Activity {
    private TextView status;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int pad = 32;
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("FNaF 1 teaching presenter");
        title.setTextSize(24f);
        root.addView(title);

        TextView copy = new TextView(this);
        copy.setText("This app can only display a non-touchable teaching strip. "
                + "It has no screen capture, pixel reader, title detector, or game input.");
        copy.setTextSize(16f);
        root.addView(copy);

        Button grant = new Button(this);
        grant.setText("Grant overlay permission");
        grant.setOnClickListener(ignored -> openOverlaySettings());
        root.addView(grant);

        Button start = new Button(this);
        start.setText("Start presenter");
        start.setOnClickListener(ignored -> startPresenter());
        root.addView(start);

        status = new TextView(this);
        status.setTextSize(16f);
        root.addView(status);
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void openOverlaySettings() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void startPresenter() {
        if (!Settings.canDrawOverlays(this)) {
            refresh();
            return;
        }
        Intent service = new Intent(this, Fnaf1TeachOverlayService.class)
                .setAction(Fnaf1TeachOverlayService.ACTION_START);
        startForegroundService(service);
        refresh();
    }

    private void refresh() {
        status.setText(Settings.canDrawOverlays(this)
                ? "Overlay permission granted. Start presenter, then return to the game."
                : "Overlay permission is required before the presenter can start.");
    }
}
