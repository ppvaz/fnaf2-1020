package com.ppvaz.fnafcompanion;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.view.View;

/**
 * Draws the FNaF 1 teach panel over a 4/20 night: the three roll clocks as
 * bars that fill toward the next tick (Bonnie, Chica, Foxy), the step the
 * route is on and why, and each door's state and last lit reading.
 *
 * <p>Every pixel of the window is painted opaque in the panel palette, and
 * the window is exactly {@link Fnaf1Lesson}'s rectangle, which the FNaF 1
 * native regions clear; the platform composites it at its 0.8 overlay cap.</p>
 */
public final class Fnaf1PanelView extends View {
    private static final int FILL = 0xFF080A08;
    private static final int INK_TEXT = 0xFFF2F2EE;
    private static final int INK_DIM = 0xFF969EAA;
    private static final int INK_TRACK = 0xFF1C201C;
    private static final int INK_BONNIE = 0xFF8A7BFF;
    private static final int INK_CHICA = 0xFFE6D25A;
    private static final int INK_FOXY = 0xFFFF6A4D;
    private static final int INK_ALERT = 0xFFFF5449;

    private final Paint fill = new Paint();
    private final Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Fnaf1Lesson lesson;

    public Fnaf1PanelView(Context context, Fnaf1Lesson lesson) {
        super(context);
        this.lesson = lesson;
        setFocusable(false);
        setClickable(false);
        setWillNotDraw(false);
        fill.setStyle(Paint.Style.FILL);
        // The game's own HUD face, as the FNaF 2 panel uses it.
        title.setTypeface(loadHudTypeface(context));
        title.setTextSize(22f);
        title.setColor(INK_TEXT);
        body.setTypeface(Typeface.DEFAULT);
        body.setTextSize(22f);
        body.setColor(INK_TEXT);
        small.setTypeface(Typeface.DEFAULT);
        small.setTextSize(19f);
        small.setColor(INK_DIM);
        setContentDescription("FNaF 1 teach panel");
    }

    private static Typeface loadHudTypeface(Context context) {
        try {
            return Typeface.createFromAsset(context.getAssets(), "fonts/hud-font.otf");
        } catch (RuntimeException unavailable) {
            return Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL);
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        int w = getWidth();
        int h = getHeight();
        fill.setColor(FILL);
        canvas.drawRect(0, 0, w, h, fill);
        long night = lesson.nightMs(System.nanoTime());
        Fnaf1Lesson.Step step = lesson.step();

        // Header: hour and the step.
        title.setColor(INK_TEXT);
        canvas.drawText(Fnaf1Lesson.hour(Math.max(0, night)) + "  " + step.title, 16, 34, title);
        canvas.drawText(step.why, 16, 64, small);

        // The three roll clocks.
        bar(canvas, 16, 74, w - 32, "Bonnie", INK_BONNIE, night, Fnaf1Lesson.BONNIE_MS);
        bar(canvas, 16, 102, w - 32, "Chica", INK_CHICA, night, Fnaf1Lesson.CHICA_MS);
        bar(canvas, 16, 130, w - 32, "Foxy", INK_FOXY, night, Fnaf1Lesson.FOXY_MS);

        // The doors and what their lights last showed.
        side(canvas, 16, 182, "Left", true);
        side(canvas, w / 2f + 8, 182, "Right", false);
        postInvalidateOnAnimation();
    }

    private void bar(Canvas canvas, float x, float y, float width, String name, int ink,
            long night, long periodMs) {
        float label = 96f;
        float track = width - label - 90f;
        small.setColor(INK_DIM);
        canvas.drawText(name, x, y + 20, small);
        fill.setColor(INK_TRACK);
        canvas.drawRect(x + label, y + 6, x + label + track, y + 22, fill);
        fill.setColor(ink);
        float done = (float) Fnaf1Lesson.phase(night, periodMs);
        canvas.drawRect(x + label, y + 6, x + label + track * done, y + 22, fill);
        long until = Fnaf1Lesson.untilNext(night, periodMs);
        canvas.drawText(String.format(java.util.Locale.ROOT, "%.1f s", until / 1000f),
                x + label + track + 12, y + 20, small);
        small.setColor(INK_DIM);
    }

    private void side(Canvas canvas, float x, float y, String name, boolean left) {
        Fnaf1Lesson.Seen seen = lesson.seen(left);
        Fnaf1Lesson.Door door = lesson.door(left);
        body.setColor(INK_TEXT);
        canvas.drawText(name + " door: " + Fnaf1Lesson.word(door), x, y, body);
        body.setColor(seen == Fnaf1Lesson.Seen.OCCUPIED ? INK_ALERT : INK_DIM);
        canvas.drawText("light: " + Fnaf1Lesson.word(seen), x, y + 26, body);
        body.setColor(INK_TEXT);
    }
}
