package com.ppvaz.fnaf1teach;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The adb-shell-only control boundary for the passive presenter. */
public final class Fnaf1TeachCommandReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent command = new Intent(context, Fnaf1TeachOverlayService.class)
                .setAction(intent.getAction());
        if (intent.hasExtra(Fnaf1TeachOverlayService.EXTRA_NIGHT)) {
            command.putExtra(Fnaf1TeachOverlayService.EXTRA_NIGHT,
                    intent.getIntExtra(Fnaf1TeachOverlayService.EXTRA_NIGHT, -1));
        }
        if (intent.hasExtra(Fnaf1TeachOverlayService.EXTRA_STAGE)) {
            command.putExtra(Fnaf1TeachOverlayService.EXTRA_STAGE,
                    intent.getStringExtra(Fnaf1TeachOverlayService.EXTRA_STAGE));
        }
        if (intent.hasExtra(Fnaf1TeachOverlayService.EXTRA_RUN)) {
            command.putExtra(Fnaf1TeachOverlayService.EXTRA_RUN,
                    intent.getStringExtra(Fnaf1TeachOverlayService.EXTRA_RUN));
        }
        // The presenter must have been started by its visible activity. This
        // receiver only updates that foreground service; it cannot quietly
        // create a background overlay from an arbitrary broadcast.
        context.startService(command);
    }
}
