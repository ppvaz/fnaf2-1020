// Touch plumbing. Everything is pointer-driven, nothing relies on click, and
// every handler cancels the browser's default so a fast double tap never zooms
// the page mid-run.
export function bindInputs(root, onPress, onRelease) {
  const held = new Map(); // pointerId -> action

  const actionOf = (el) => {
    const t = el.closest('[data-act]');
    return t ? { act: t.dataset.act, mode: t.dataset.mode || 'tap', el: t } : null;
  };

  root.addEventListener('pointerdown', (e) => {
    const hit = actionOf(e.target);
    if (!hit) return;
    e.preventDefault();
    // Register the input FIRST. Pointer capture is a nicety; if it throws we
    // must not lose the press -- a swallowed input mid-run is a lost night.
    hit.el.classList.add('is-down');
    held.set(e.pointerId, hit);
    onPress(hit.act);
    try { hit.el.setPointerCapture?.(e.pointerId); } catch { /* not fatal */ }
  }, { passive: false });

  const up = (e) => {
    const hit = held.get(e.pointerId);
    if (!hit) return;
    held.delete(e.pointerId);
    hit.el.classList.remove('is-down');
    if (hit.mode === 'hold') onRelease(hit.act);
  };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);

  // Belt and braces on iOS/older Android webviews.
  root.addEventListener('touchstart', (e) => { if (actionOf(e.target)) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('dblclick', (e) => e.preventDefault());

  return {
    releaseAll() {
      for (const [, hit] of held) { hit.el.classList.remove('is-down'); if (hit.mode === 'hold') onRelease(hit.act); }
      held.clear();
    }
  };
}

// Keep the screen awake and the page full-screen for the length of a run.
export async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

export async function goFullscreen(el) {
  try {
    if (!document.fullscreenElement) await el.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape').catch(() => {});
  } catch { /* not fatal */ }
}

export function buzz(ms) { try { navigator.vibrate?.(ms); } catch { /* ignore */ } }
