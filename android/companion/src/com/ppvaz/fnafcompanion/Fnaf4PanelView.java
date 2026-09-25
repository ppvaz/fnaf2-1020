package com.ppvaz.fnafcompanion;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

import java.util.Locale;

/**
 * Draws the FNaF 4 teach panel across the top of a night.
 *
 * <p>Its visual language is not the FNaF 1 or FNaF 2 one, because the route
 * is neither: FNaF 2's schedule is a timed cycle (a ring), FNaF 1's is keyed
 * to each character's own tick (a bar per character), and FNaF 4's is a walk
 * between four stations that reacts to what it hears. So the panel has three
 * parts:</p>
 * <ul>
 * <li>a <b>map</b> of the bedroom -- left door, right door, the closet ahead,
 *     the bed behind -- with the player's station outlined and each station
 *     filled with what it last showed;</li>
 * <li>the <b>step</b>, why, and the game's clocks: the 5 s move roll, Freddy's
 *     4 s tick and, while a door or the closet is held, the fill toward the
 *     3 s tick that sends the visitor back;</li>
 * <li>the <b>listening meter</b>: the breathing score the host hears, against
 *     the doubt and breathing lines that decide hold-or-light.</li>
 * </ul>
 * <p>Colour means a character (Bonnie purple, Chica yellow, Foxy orange,
 * Freddy amber), and one red means danger -- nothing else uses it.</p>
 *
 * <p>Every pixel of the window is painted opaque in the panel palette, and
 * the window is exactly {@link Fnaf4Lesson}'s rectangle, which the FNaF 4
 * native regions clear; the platform composites it at its 0.8 overlay cap.</p>
 */
public final class Fnaf4PanelView extends View {
    private static final int FILL = 0xFF070808;
    private static final int INK_TEXT = 0xFFF2F2EE;
    private static final int INK_DIM = 0xFF969EAA;
    private static final int INK_FAINT = 0xFF3A3F46;
    private static final int INK_TRACK = 0xFF1C1E22;
    private static final int INK_BONNIE = 0xFF8A7BFF;
    private static final int INK_CHICA = 0xFFE6D25A;
    private static final int INK_FOXY = 0xFFFF9A3C;
    private static final int INK_FREDDY = 0xFFB9804E;
    private static final int INK_SAFE = 0xFF4FC7A0;
    private static final int INK_ALERT = 0xFFFF3B3B;
    private static final int INK_FREDBEAR = 0xFFE8B730;
    /** Nightmare is Fredbear's shadow: a pale, cold ink, never the danger red. */
    private static final int INK_NIGHTMARE = 0xFFD8D4F2;

    private final Paint fill = new Paint();
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final Fnaf4Lesson lesson;

    public Fnaf4PanelView(Context context, Fnaf4Lesson lesson) {
        super(context);
        this.lesson = lesson;
        setFocusable(false);
        setClickable(false);
        setWillNotDraw(false);
        fill.setStyle(Paint.Style.FILL);
        stroke.setStyle(Paint.Style.STROKE);
        // The game's own HUD face, as the FNaF 1 and FNaF 2 panels use it.
        Typeface hud = loadHudTypeface(context);
        title.setTypeface(hud);
        title.setTextSize(26f);
        body.setTypeface(hud);
        body.setTextSize(20f);
        small.setTypeface(Typeface.DEFAULT);
        small.setTextSize(18f);
        setContentDescription("FNaF 4 teach panel");
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
        fill.setColor(FILL);
        canvas.drawRect(0, 0, w, getHeight(), fill);
        long now = System.nanoTime();
        long night = lesson.nightMs(now);
        Fnaf4Lesson.Step step = lesson.step();

        map(canvas, 12, 10, Fnaf4Lesson.station(step));

        // The step, why, and the clocks.
        float x = 236;
        title.setColor(INK_TEXT);
        canvas.drawText(Fnaf4Lesson.hour(Math.max(0, night)) + "  " + step.title, x, 36, title);
        small.setColor(INK_DIM);
        canvas.drawText(step.why, x, 62, small);
        float barW = 700;
        Fnaf4Lesson.Fred fred = lesson.fred();
        if (fred != Fnaf4Lesson.Fred.OFF) {
            // His two clocks: every move, and the window a laugh can put him in the room.
            int ink = fredInk(fred);
            clock(canvas, x, 76, barW, Fnaf4Lesson.name(fred), ink, night, Fnaf4Lesson.rollMs(fred));
            clock(canvas, x, 104, barW, "Room", ink, night, Fnaf4Lesson.roomMs(fred));
            long still = lesson.stillMs(now);
            if (!Fnaf4Lesson.isHold(step) && still >= 0) {
                float done = Math.min(1f, still / (float) Fnaf4Lesson.STILL_MS);
                track(canvas, x, 132, barW, "Still", still > 15000 ? INK_ALERT : INK_DIM, done,
                        String.format(Locale.ROOT, "%.0f / 25 s", still / 1000f));
            }
        } else {
            clock(canvas, x, 76, barW, "Moves", INK_BONNIE, night, Fnaf4Lesson.ROLL_MS);
            clock(canvas, x, 104, barW, "Freddy", INK_FREDDY, night, Fnaf4Lesson.FREDDY_MS);
        }
        if (Fnaf4Lesson.isHold(step)) {
            long held = Math.max(0, lesson.stepMs(now));
            float done = Math.min(1f, held / (float) Fnaf4Lesson.DISMISS_MS);
            track(canvas, x, 132, barW, "Shut+tick", done >= 1f ? INK_SAFE : INK_ALERT, done,
                    done >= 1f ? "tick passed" : String.format(Locale.ROOT, "%.1f s", (Fnaf4Lesson.DISMISS_MS - held) / 1000f));
        } else if (fred == Fnaf4Lesson.Fred.OFF) {
            long due = lesson.bedDueInMs(now);
            if (due != Long.MIN_VALUE) {
                float left = Math.max(0f, Math.min(1f, due / (float) Fnaf4Lesson.BED_DUE_MS));
                track(canvas, x, 132, barW, "Bed due", due < 5000 ? INK_ALERT : INK_FREDDY, 1f - left,
                        due > 0 ? String.format(Locale.ROOT, "in %.0f s", due / 1000f) : "now");
            }
        }

        if (fred != Fnaf4Lesson.Fred.OFF) heard(canvas, 1000, 14, fred, now);
        else meter(canvas, 1000, 14, w - 1000 - 14);
        postInvalidateOnAnimation();
    }

    /** The bedroom from above: closet ahead, doors either side, bed behind. */
    private void map(Canvas canvas, float ox, float oy, Fnaf4Lesson.Station at) {
        Fnaf4Lesson.Door left = lesson.door(true);
        Fnaf4Lesson.Door right = lesson.door(false);
        station(canvas, ox + 62, oy + 2, 76, 36, "C", closetInk(lesson.closet()), at == Fnaf4Lesson.Station.CLOSET, false);
        station(canvas, ox, oy + 52, 46, 58, "L", doorInk(left, INK_BONNIE), at == Fnaf4Lesson.Station.LEFT,
                left == Fnaf4Lesson.Door.SHUT);
        station(canvas, ox + 154, oy + 52, 46, 58, "R", doorInk(right, INK_CHICA), at == Fnaf4Lesson.Station.RIGHT,
                right == Fnaf4Lesson.Door.SHUT);
        station(canvas, ox + 50, oy + 124, 100, 36, "B", bedInk(lesson.bed()), at == Fnaf4Lesson.Station.BED, false);
        fill.setColor(at == Fnaf4Lesson.Station.WALK ? INK_TEXT : INK_FAINT);
        canvas.drawCircle(ox + 100, oy + 81, 7, fill);
        // Where Fredbear was last heard landing: outside the door on his side,
        // or on both room stations after a laugh (one of them is true).
        if (lesson.fred() != Fnaf4Lesson.Fred.OFF) {
            fill.setColor(fredInk(lesson.fred()));
            switch (lesson.fredAt()) {
                case LEFT: canvas.drawCircle(ox + 23, oy + 40, 9, fill); break;
                case RIGHT: canvas.drawCircle(ox + 177, oy + 40, 9, fill); break;
                case ROOM:
                    canvas.drawCircle(ox + 148, oy + 20, 7, fill);
                    canvas.drawCircle(ox + 160, oy + 142, 7, fill);
                    break;
                default: break;
            }
        }
    }

    private void station(Canvas canvas, float x, float y, float w, float h, String label, int ink,
            boolean here, boolean shut) {
        box.set(x, y, x + w, y + h);
        fill.setColor(ink);
        canvas.drawRect(box, fill);
        if (shut) {
            fill.setColor(INK_TEXT);
            canvas.drawRect(x + 4, y + h / 2 - 3, x + w - 4, y + h / 2 + 3, fill);
        }
        stroke.setColor(here ? INK_TEXT : INK_FAINT);
        stroke.setStrokeWidth(here ? 4f : 2f);
        canvas.drawRect(box, stroke);
        small.setColor(ink == INK_TRACK ? INK_DIM : FILL);
        canvas.drawText(label, x + 6, y + 19, small);
    }

    private static int doorInk(Fnaf4Lesson.Door door, int who) {
        switch (door) {
            case BREATH: case STEPS: return INK_ALERT;
            case HALL: return who;
            case CLEAR: case SHUT: return INK_SAFE;
            default: return INK_TRACK;
        }
    }

    private static int closetInk(Fnaf4Lesson.Closet closet) {
        switch (closet) {
            case FOXY: return INK_FOXY;
            case EMPTY: return INK_SAFE;
            default: return INK_TRACK;
        }
    }

    private static int bedInk(Fnaf4Lesson.Bed bed) {
        switch (bed) {
            case FREDDLES: return INK_FREDDY;
            case CLEAR: return INK_SAFE;
            default: return INK_TRACK;
        }
    }

    private void clock(Canvas canvas, float x, float y, float width, String name, int ink, long night, long periodMs) {
        long until = Fnaf4Lesson.untilNext(night, periodMs);
        track(canvas, x, y, width, name, ink, (float) Fnaf4Lesson.phase(night, periodMs),
                String.format(Locale.ROOT, "%.1f s", until / 1000f));
    }

    private void track(Canvas canvas, float x, float y, float width, String name, int ink, float done, String tail) {
        float label = 90f;
        float track = width - label - 110f;
        small.setColor(INK_DIM);
        canvas.drawText(name, x, y + 18, small);
        fill.setColor(INK_TRACK);
        canvas.drawRect(x + label, y + 5, x + label + track, y + 19, fill);
        fill.setColor(ink);
        canvas.drawRect(x + label, y + 5, x + label + track * done, y + 19, fill);
        canvas.drawText(tail, x + label + track + 12, y + 18, small);
    }

    /** On his nights: the last sound of his the host heard, and how long ago. */
    private void heard(Canvas canvas, float x, float y, Fnaf4Lesson.Fred fred, long now) {
        body.setColor(INK_TEXT);
        canvas.drawText("Heard", x, y + 20, body);
        Fnaf4Lesson.Heard what = lesson.heard();
        long ago = lesson.heardAgoMs(now);
        title.setColor(what == Fnaf4Lesson.Heard.LAUGH ? INK_ALERT : what == Fnaf4Lesson.Heard.NONE ? INK_DIM : fredInk(fred));
        canvas.drawText(Fnaf4Lesson.word(what, fred), x, y + 56, title);
        small.setColor(INK_DIM);
        if (ago >= 0) canvas.drawText(String.format(Locale.ROOT, "%.1f s ago", ago / 1000f), x, y + 82, small);
        canvas.drawText(what == Fnaf4Lesson.Heard.LAUGH ? "a laugh can mean the bed or the closet"
                : "he can only enter the hall on his side", x, y + 108, small);
        canvas.drawText(String.format(Locale.ROOT, "In a hall he strikes in %d s; in the room in %d s.",
                fred.hallS, fred.roomS), x, y + 134, small);
    }

    private static int fredInk(Fnaf4Lesson.Fred fred) {
        return fred.nightmare() ? INK_NIGHTMARE : INK_FREDBEAR;
    }

    /** What the host hears at a door, against the lines that decide it. */
    private void meter(Canvas canvas, float x, float y, float width) {
        int level = lesson.level();
        body.setColor(INK_TEXT);
        canvas.drawText("Listening", x, y + 20, body);
        float mx = x;
        float my = y + 34;
        float mw = width;
        float mh = 26;
        // The scale is the breathing NCC x 100 over 0..60; past 60 is unmistakable.
        float scale = mw / 60f;
        fill.setColor(INK_TRACK);
        canvas.drawRect(mx, my, mx + mw, my + mh, fill);
        fill.setColor(0xFF2A2418);
        canvas.drawRect(mx + Fnaf4Lesson.LEVEL_DOUBT * scale, my, mx + Fnaf4Lesson.LEVEL_BREATH * scale, my + mh, fill);
        if (level >= 0) {
            int ink = level >= Fnaf4Lesson.LEVEL_BREATH ? INK_ALERT
                    : level >= Fnaf4Lesson.LEVEL_DOUBT ? INK_FREDDY : INK_DIM;
            fill.setColor(ink);
            canvas.drawRect(mx, my + 5, mx + Math.min(60, level) * scale, my + mh - 5, fill);
        }
        fill.setColor(INK_TEXT);
        canvas.drawRect(mx + Fnaf4Lesson.LEVEL_BREATH * scale - 1, my - 4, mx + Fnaf4Lesson.LEVEL_BREATH * scale + 2, my + mh + 4, fill);
        small.setColor(INK_DIM);
        int cover = lesson.cover();
        String caption = level < 0 ? "not at a door" : level >= Fnaf4Lesson.LEVEL_BREATH ? "breathing: hold"
                : level >= Fnaf4Lesson.LEVEL_DOUBT ? "unsure: hold"
                : cover >= 0 && cover < 100 ? String.format(Locale.ROOT, "quiet so far: waiting for a breath (%d%%)", cover)
                : "quiet through a breath: light the hall";
        canvas.drawText(caption, mx, my + mh + 22, small);
        Fnaf4Lesson.Door left = lesson.door(true);
        Fnaf4Lesson.Door right = lesson.door(false);
        body.setColor(INK_TEXT);
        canvas.drawText("L " + Fnaf4Lesson.word(left) + "   R " + Fnaf4Lesson.word(right), mx, my + mh + 52, small);
        canvas.drawText("Closet " + Fnaf4Lesson.word(lesson.closet()) + "   Bed " + Fnaf4Lesson.word(lesson.bed()),
                mx, my + mh + 76, small);
    }
}
