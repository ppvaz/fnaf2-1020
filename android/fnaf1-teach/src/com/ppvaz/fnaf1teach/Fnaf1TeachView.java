package com.ppvaz.fnaf1teach;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.view.View;

/** One noninteractive strip; input never reaches this view. */
public final class Fnaf1TeachView extends View {
    private final Paint fill = new Paint();
    private final Paint headline = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private volatile int night = 1;
    private volatile String stage = "hands-off";

    public Fnaf1TeachView(Context context) {
        super(context);
        setFocusable(false);
        setFocusableInTouchMode(false);
        setClickable(false);
        setLongClickable(false);
        setWillNotDraw(false);
        fill.setColor(0xff090c10);
        headline.setColor(0xff9ee8ff);
        headline.setTextSize(21f);
        headline.setTypeface(Typeface.DEFAULT_BOLD);
        body.setColor(0xfff0f3f5);
        body.setTextSize(15f);
        body.setTypeface(Typeface.DEFAULT);
        setContentDescription("FNaF 1 teaching presenter; noninteractive");
    }

    public void setStage(int nextNight, String nextStage) {
        night = nextNight;
        stage = nextStage;
        postInvalidateOnAnimation();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float sx = getWidth() / (float) (Fnaf1TeachContract.RIGHT - Fnaf1TeachContract.LEFT);
        float sy = getHeight() / (float) (Fnaf1TeachContract.BOTTOM - Fnaf1TeachContract.TOP);
        canvas.save();
        canvas.scale(sx, sy);
        canvas.drawRect(0, 0, Fnaf1TeachContract.RIGHT - Fnaf1TeachContract.LEFT,
                Fnaf1TeachContract.BOTTOM - Fnaf1TeachContract.TOP, fill);
        canvas.drawText(Fnaf1TeachContract.headline(night, stage), 12f, 20f, headline);
        canvas.drawText(Fnaf1TeachContract.lesson(stage), 12f, 42f, body);
        canvas.restore();
    }
}
