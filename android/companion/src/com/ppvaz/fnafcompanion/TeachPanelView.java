package com.ppvaz.fnafcompanion;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

import java.util.Locale;

/**
 * Draws the teach panel: where the schedule is in its cycle, what it is doing,
 * why, and what comes next, for someone watching the bot play.
 *
 * <p>The ring is the cycle. Its outer band is the surface the schedule intends
 * (office, cams, mask) and its inner band the actions (hall and camera
 * flashes, the wind); the hand is now. The window is exactly the panel
 * rectangle and every pixel of its buffer is painted opaque, so an antialiased
 * edge only blends panel colours with the panel's own fill (TeachPanelTest
 * proves none of those blends looks like a selected camera to the grader). The
 * platform then composites the window at its 0.8 cap for untrusted overlays,
 * so a fifth of the game shows through; a teach video is graded with the
 * rectangle blanked.
 * "seen" is the helper's own reading of the bottom controls, the one thing on
 * the panel that is an observation rather than the schedule.</p>
 */
public final class TeachPanelView extends View {
    private static final long FRAME_MS = 33L;
    private static final float RING_X = 50f;
    private static final float RING_Y = 50f;
    private static final float TEXT_X = 106f;

    private final Paint fill = new Paint();
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bold = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();
    private final RectF border = new RectF();
    private volatile CycleLesson lesson;
    private volatile long originNs;
    private volatile long onsetNs;
    private volatile PixelWatch.ControlState seen = PixelWatch.ControlState.UNKNOWN;
    private volatile CycleLesson.Phase lastPhase = CycleLesson.Phase.PENDING;

    public TeachPanelView(Context context) {
        super(context);
        setFocusable(false);
        setFocusableInTouchMode(false);
        setClickable(false);
        setLongClickable(false);
        setWillNotDraw(false);
        fill.setStyle(Paint.Style.FILL);
        fill.setAntiAlias(false);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.BUTT);
        title.setTypeface(loadHudTypeface(context));
        title.setTextSize(34f);
        body.setTypeface(Typeface.DEFAULT);
        body.setTextSize(23f);
        body.setColor(TeachPanel.INK_TEXT);
        small.setTypeface(Typeface.DEFAULT);
        small.setTextSize(19f);
        bold.setTypeface(Typeface.DEFAULT_BOLD);
        setContentDescription("FNaF 2 Companion teach panel");
    }

    /** Start narrating {@code lesson} from its origin, both on System.nanoTime(). */
    public void start(CycleLesson lesson, long onsetNs, long originNs) {
        this.lesson = lesson;
        this.onsetNs = onsetNs;
        this.originNs = originNs;
        postInvalidateOnAnimation();
    }

    public void setSeen(PixelWatch.ControlState state) {
        seen = state == null ? PixelWatch.ControlState.UNKNOWN : state;
    }

    /** The lesson's phase at the last drawn frame. */
    public CycleLesson.Phase phase() {
        return lastPhase;
    }

    @Override
    protected void onDetachedFromWindow() {
        lesson = null;
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float sx = getWidth() / (float) TeachPanel.WIDTH;
        float sy = getHeight() / (float) TeachPanel.HEIGHT;
        canvas.save();
        canvas.scale(sx, sy);
        fill.setColor(TeachPanel.FILL);
        canvas.drawRect(0f, 0f, TeachPanel.WIDTH, TeachPanel.HEIGHT, fill);
        CycleLesson current = lesson;
        if (current != null) {
            long now = System.nanoTime();
            CycleLesson.Frame frame = current.frameAt((now - originNs) / 1_000_000L,
                    (now - onsetNs) / 1_000_000L);
            lastPhase = frame.phase;
            drawFrame(canvas, current, frame);
            if (frame.phase != CycleLesson.Phase.EXPIRED) postInvalidateDelayed(FRAME_MS);
        }
        canvas.restore();
    }

    private void drawFrame(Canvas canvas, CycleLesson lesson, CycleLesson.Frame frame) {
        CycleLesson.Row step = frame.step();
        int accent = step == null ? TeachPanel.INK_DIM : TeachPanel.ink(step.verb.ink);
        stroke.setStrokeWidth(3f);
        stroke.setColor(blend(accent, TeachPanel.FILL, 0.55f));
        border.set(3f, 3f, TeachPanel.WIDTH - 3f, TeachPanel.HEIGHT - 3f);
        canvas.drawRoundRect(border, 13f, 13f, stroke);

        drawRing(canvas, frame);

        String name;
        String why;
        if (frame.phase == CycleLesson.Phase.CYCLE || frame.phase == CycleLesson.Phase.OPENING) {
            name = step == null ? "READY" : lesson.title(step);
            why = step == null ? "the schedule starts now" : lesson.why(step);
        } else if (frame.phase == CycleLesson.Phase.FINISHED) {
            name = "ALL CYCLES RUN";
            why = "6 AM is the game's call";
        } else {
            name = "WAITING";
            why = "for the schedule's origin";
        }
        title.setColor(accent);
        canvas.drawText(name, TEXT_X, 36f, title);
        if (step != null) {
            bold.setTextSize(26f);
            bold.setColor(TeachPanel.INK_TEXT);
            String left = String.format(Locale.US, "%.1fs", frame.msLeft() / 1000f);
            canvas.drawText(left, TeachPanel.WIDTH - 16f - bold.measureText(left), 34f, bold);
        }
        canvas.drawText(why, TEXT_X, 67f, body);

        CycleLesson.Row next = frame.next();
        small.setColor(TeachPanel.INK_DIM);
        String nextText = next == null ? "" : "next " + lesson.title(next);
        canvas.drawText(nextText, TEXT_X, 92f, small);
        String seenWord;
        int seenInk;
        switch (seen) {
            case MASK_ON:
                seenWord = "MASK";
                seenInk = TeachPanel.INK_MASK;
                break;
            case MONITOR_UP:
                seenWord = "CAMS";
                seenInk = TeachPanel.INK_MONITOR;
                break;
            case OFFICE_UNMASKED:
                seenWord = "OFFICE";
                seenInk = TeachPanel.INK_TEXT;
                break;
            default:
                seenWord = "?";
                seenInk = TeachPanel.INK_DIM;
                break;
        }
        String clock = CycleLesson.hourLabel(frame.hour) + "  seen ";
        float seenWidth = small.measureText(seenWord);
        float x = TeachPanel.WIDTH - 16f - seenWidth;
        small.setColor(seenInk);
        canvas.drawText(seenWord, x, 92f, small);
        small.setColor(TeachPanel.INK_DIM);
        canvas.drawText(clock, x - small.measureText(clock), 92f, small);
    }

    private void drawRing(Canvas canvas, CycleLesson.Frame frame) {
        CycleLesson.Timeline timeline = frame.timeline;
        stroke.setStrokeCap(Paint.Cap.BUTT);
        if (timeline == null) {
            stroke.setStrokeWidth(10f);
            stroke.setColor(TeachPanel.INK_IDLE);
            ring(42f);
            canvas.drawArc(oval, 0f, 360f, false, stroke);
        } else {
            float length = timeline.lengthMs;
            stroke.setStrokeWidth(10f);
            ring(42f);
            for (CycleLesson.Arc arc : timeline.surfaces) {
                stroke.setColor(TeachPanel.surface(arc.surface));
                canvas.drawArc(oval, angle(arc.startMs, length),
                        sweep(arc.startMs, arc.endMs, length, 0f), false, stroke);
            }
            stroke.setStrokeWidth(3f);
            stroke.setColor(TeachPanel.INK_TRACK);
            ring(29f);
            canvas.drawArc(oval, 0f, 360f, false, stroke);
            stroke.setStrokeWidth(8f);
            for (CycleLesson.Arc arc : timeline.actions) {
                stroke.setColor(TeachPanel.ink(arc.ink));
                canvas.drawArc(oval, angle(arc.startMs, length),
                        sweep(arc.startMs, arc.endMs, length, 7f), false, stroke);
            }
            double theta = Math.toRadians(angle(frame.tMs, length));
            stroke.setStrokeWidth(4f);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            stroke.setColor(TeachPanel.INK_TEXT);
            canvas.drawLine(RING_X + 12f * (float) Math.cos(theta), RING_Y + 12f * (float) Math.sin(theta),
                    RING_X + 47f * (float) Math.cos(theta), RING_Y + 47f * (float) Math.sin(theta), stroke);
            stroke.setStrokeCap(Paint.Cap.BUTT);
        }
        String center = frame.phase == CycleLesson.Phase.CYCLE ? Integer.toString(frame.cycle)
                : frame.phase == CycleLesson.Phase.OPENING ? "SET" : "END";
        bold.setTextSize(17f);
        bold.setColor(TeachPanel.INK_DIM);
        canvas.drawText(center, RING_X - bold.measureText(center) / 2f, RING_Y + 6f, bold);
    }

    private void ring(float radius) {
        oval.set(RING_X - radius, RING_Y - radius, RING_X + radius, RING_Y + radius);
    }

    /** Degrees for Canvas.drawArc, 0 ms at twelve o'clock, clockwise. */
    private static float angle(float ms, float length) {
        return -90f + 360f * ms / length;
    }

    private static float sweep(float startMs, float endMs, float length, float minimum) {
        return Math.max(minimum, 360f * (endMs - startMs) / length);
    }

    private static int blend(int ink, int under, float alpha) {
        int r = Math.round(((ink >> 16) & 0xff) * alpha + ((under >> 16) & 0xff) * (1f - alpha));
        int g = Math.round(((ink >> 8) & 0xff) * alpha + ((under >> 8) & 0xff) * (1f - alpha));
        int b = Math.round((ink & 0xff) * alpha + (under & 0xff) * (1f - alpha));
        return 0xff000000 | (r << 16) | (g << 8) | b;
    }

    private static Typeface loadHudTypeface(Context context) {
        try {
            return Typeface.createFromAsset(context.getAssets(), "fonts/hud-font.otf");
        } catch (RuntimeException unavailable) {
            return Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL);
        }
    }
}
