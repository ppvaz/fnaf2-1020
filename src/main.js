import * as C from './config.js';
import { Sim } from './engine.js';
import { Coach, DuelTimer } from './coach.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { bindInputs, keepAwake, goFullscreen, buzz } from './input.js';
import { drawTimeline, buildSummary, fmtTime } from './report.js';
import { drawPattern } from './lane.js';
import * as Assets from './assets.js';
import { LESSONS, byId, loadProgress, saveProgress, markPassed, recordCombo, unlockedIndex } from './curriculum.js';

const HUGE = C.NIGHT_FRAMES * 10;

class App {
  constructor() {
    this.audio = new Audio();
    this.stage = document.getElementById('stage');
    this.ui = new UI(this.stage);
    this.duel = new DuelTimer();
    this.running = false;
    this.acc = 0;
    this.last = 0;
    this.settings = loadSettings();
    this.bindUI();
    bindInputs(this.stage, (a) => this.onPress(a), (a) => this.onRelease(a));
    requestAnimationFrame((t) => this.frame(t));
  }

  bindUI() {
    document.getElementById('menu').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) { this.brief(b.dataset.mode); return; }
      const s = e.target.closest('[data-ui]');
      if (!s) return;
      if (s.dataset.ui === 'settings') showPanel('settings');
      if (s.dataset.ui === 'about') showPanel('about');
    });
    document.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => showPanel('menu')));
    document.getElementById('btn-quit').addEventListener('click', () => this.stop());
    document.getElementById('btn-again').addEventListener('click', () => this.start(this.modeKey));
    document.getElementById('btn-menu').addEventListener('click', () => { buildMenu(); showPanel('menu'); });
    document.getElementById('btn-brief-go').addEventListener('click', () => this.start(this.pendingLesson));
    document.getElementById('btn-brief-back').addEventListener('click', () => { buildMenu(); showPanel('menu'); });
    document.getElementById('btn-next-lesson').addEventListener('click', (e) =>
      this.brief(e.currentTarget.dataset.next));
    document.getElementById('btn-retry-lesson').addEventListener('click', () => this.start(this.modeKey));
    document.getElementById('btn-passed-menu').addEventListener('click', () => { buildMenu(); showPanel('menu'); });
    document.getElementById('btn-resetprogress').addEventListener('click', () => {
      saveProgress({}); buildMenu();
    });

    document.getElementById('btn-calibrate').addEventListener('click', () => this.startCalibration());
    document.getElementById('btn-resetmap').addEventListener('click', () => {
      this.ui.resetMap();
      note('Layout reset to the shipped defaults.');
    });
    document.getElementById('btn-savemap').addEventListener('click', () => this.saveLayout());
    const snd = document.getElementById('opt-sound');
    snd.checked = this.settings.sound;
    snd.addEventListener('change', () => { this.settings.sound = snd.checked; this.audio.enabled = snd.checked; saveSettings(this.settings); });
    const hp = document.getElementById('opt-haptics');
    hp.checked = this.settings.haptics;
    hp.addEventListener('change', () => { this.settings.haptics = hp.checked; saveSettings(this.settings); if (hp.checked) buzz(20); });
    const mt = document.getElementById('opt-metronome');
    mt.checked = this.settings.metronome;
    mt.addEventListener('change', () => { this.settings.metronome = mt.checked; saveSettings(this.settings); });
    const co = document.getElementById('opt-coach');
    co.checked = this.settings.coach;
    co.addEventListener('change', () => { this.settings.coach = co.checked; saveSettings(this.settings); });

    this.buildSoundSlots();
    document.getElementById('btn-clear-sounds').addEventListener('click', async () => {
      await Assets.clearAll(); this.audio.samples = {}; this.buildSoundSlots();
    });
  }

  // Push the calibrated map back into src/config.js as the new DEFAULT_MAP.
  // Only the dev server can do that; anywhere else we fall back to showing the
  // JSON so it can be copied across by hand.
  async saveLayout() {
    const ta = document.getElementById('map-json');
    try {
      const res = await fetch('/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: this.ui.map, widgets: this.ui.widgets }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      ta.hidden = true;
      note(`Saved to src/config.js. ${body.build || ''} Reload to run against the new default.`);
    } catch (e) {
      ta.hidden = false;
      ta.value = JSON.stringify({ map: this.ui.map, widgets: this.ui.widgets }, null, 2);
      ta.select?.();
      try { await navigator.clipboard.writeText(ta.value); } catch { /* clipboard may be blocked */ }
      note(`Could not reach the dev server (${e.message}). The layout JSON is below — copied to your clipboard if permitted.`);
    }
  }

  async buildSoundSlots() {
    const wrap = document.getElementById('sound-slots');
    const have = await Assets.listSlots().catch(() => ({}));
    wrap.innerHTML = Assets.SLOTS.map(s => `
      <label class="slot">
        <span class="slot-name">${s.label}</span>
        <span class="slot-why">${s.why}</span>
        <span class="slot-state">${have[s.id] ? `✓ ${have[s.id]}` : 'synthesised'}</span>
        <input type="file" accept="audio/*" data-slot="${s.id}">
      </label>`).join('');
    wrap.querySelectorAll('input[type=file]').forEach(inp => {
      inp.addEventListener('change', async () => {
        if (!inp.files?.[0]) return;
        await Assets.putSlot(inp.dataset.slot, inp.files[0]);
        this.audio.unlock();
        await Assets.loadInto(this.audio);
        this.buildSoundSlots();
      });
    });
  }

  // Calibration runs in its own session with the simulation inert and game
  // input disabled, so dragging a control never doubles as pressing it.
  startCalibration() {
    this.modeKey = null;
    this.mode = { name: 'Calibrate', sim: {}, coach: false };
    this.sim = new Sim({
      bbEnabled: false, foxyEnabled: false, gfEnabled: false, boxEnabled: false,
      stalledEnabled: false, powerEnabled: false, lethal: false, record: false,
      durationFrames: HUGE,
    });
    this.coach = null;
    this.sim.monitor = 'up';
    this.sim.cam = C.BOX_CAM;
    this.ui.clearCoach();
    this.ui.setCoachVisible(false);
    this.ui.duelMode = false;
    this.ui.setControls(null);
    this.ui.showCues = false;
    this.ui.enableCalibration(true);
    this.running = true;
    this.acc = 0; this.last = performance.now();
    showPanel('run');
    note('');
  }

  // ------------------------------------------------------------- lessons
  brief(id) {
    const l = byId(id);
    if (!l) return;
    this.pendingLesson = id;
    const i = LESSONS.indexOf(l);
    document.getElementById('brief-title').textContent = l.title;
    document.getElementById('brief-step').textContent = `${i + 1} of ${LESSONS.length}`;
    document.getElementById('brief-goal').textContent = l.goal;
    document.getElementById('brief-teach').textContent = l.teach;
    document.getElementById('brief-when').textContent = l.when ? `When: ${l.when}` : '';
    const need = l.fullNight ? 'Clear the night.'
      : l.drill === 'phaseB' ? `Beat ${l.duelTarget * 1000 | 0}ms on ${l.target} attacks.`
      : `${l.target} clean passes in a row.`;
    document.getElementById('brief-controls').textContent = `To pass: ${need}`;
    document.getElementById('btn-brief-go').textContent = LESSONS.indexOf(l) === 0 ? 'Start' : 'Start lesson';
    const cv = document.getElementById('brief-lane');
    cv.style.display = l.script ? '' : 'none';
    showPanel('brief');
    if (l.script) requestAnimationFrame(() => drawPattern(cv, l.script));
  }

  // ------------------------------------------------------------------ run
  async start(key) {
    this.modeKey = key;
    const mode = byId(key);
    if (!mode) return;
    this.mode = mode;
    this.ui.enableCalibration(false);
    this.audio.unlock();
    this.audio.enabled = this.settings.sound;
    await Assets.loadInto(this.audio).catch(() => {});
    this.sim = new Sim(Object.assign({ android: true }, mode.sim,
      mode.fullNight ? {} : { durationFrames: HUGE }));
    if (mode.start) Object.assign(this.sim, mode.start);
    const coached = !!mode.script;
    this.coach = new Coach(this.sim, {
      enabled: coached,
      script: mode.script || undefined,
      tolGood: mode.tol?.tolGood,
      tolOk: mode.tol?.tolOk,
      onCycle: (ok, streak) => this.onCycle(ok, streak),
    });
    this.ui.clearCoach();
    this.ui.setCoachVisible(true);
    this.ui.duelMode = mode.drill === 'phaseB';
    this.ui.duel = this.duel;
    this.ui.setControls(mode.controls);
    this.ui.showCues = this.settings.coach;
    this.ui.setStreak('');
    this.duel.reset();
    this.duelWins = 0;
    this.passed = false;
    this.lastBoxTick = -1;
    this.ambOn = false;
    this.running = true;
    this.acc = 0; this.last = performance.now();
    showPanel('run');
    this.wake = await keepAwake();
    goFullscreen(document.documentElement);
  }

  onCycle(ok, streak) {
    const l = this.mode;
    if (!l || l.fullNight || this.passed) return;
    this.ui.setStreak(`${streak} / ${l.target}`);
    if (ok) { this.audio.good(); this.ui.lane.cleanPass(this.sim.t); this.buzz([10, 30, 14]); }
    else { this.audio.bad(); this.buzz(24); }
    if (streak >= l.target) this.pass(`${l.target} clean passes in a row.`);
  }

  pass(detail) {
    if (this.passed) return;
    this.passed = true;
    this.running = false;
    this.wake?.release?.().catch(() => {});
    this.audio.ambience(false);
    this.audio.win();
    this.buzz([20, 60, 20, 60, 45]);
    markPassed(this.mode.id, this.coach?.bestCombo || 0);
    buildMenu();
    const i = LESSONS.indexOf(this.mode);
    const nxt = LESSONS[i + 1];
    document.getElementById('passed-title').textContent = `${this.mode.title} — passed`;
    document.getElementById('passed-body').textContent =
      `${detail}${nxt ? ` Next up: ${nxt.title} — ${nxt.goal}` : ' That is the whole ladder.'}`;
    const b = document.getElementById('btn-next-lesson');
    b.style.display = nxt ? '' : 'none';
    b.dataset.next = nxt?.id || '';
    showPanel('passed');
  }

  stop() {
    if (this.mode?.id && this.coach) recordCombo(this.mode.id, this.coach.bestCombo);
    this.running = false;
    this.ui.enableCalibration(false);
    this.wake?.release?.().catch(() => {});
    this.audio.ambience(false);
    showPanel('menu');
  }

  onPress(act) {
    if (!this.running || !this.sim || this.ui.calibrating) return;
    // Confirm the tap landed before anything else: on glass you cannot feel a
    // button, and a missed press you did not notice is the worst failure mode.
    this.feedbackFor(act);
    const beforeCombo = this.coach?.combo ?? 0;
    const beforeLast = this.coach?.last;
    this.coach?.onInput(act);
    if (this.coach && this.coach.last !== beforeLast) {
      const g = this.coach.last.grade;
      this.audio.judge(g);
      if (g !== 'good' && g !== 'ok') this.buzz(28);
      else if (this.coach.combo > beforeCombo && this.coach.combo % 10 === 0) {
        this.audio.milestone(this.coach.combo);
        this.buzz([10, 40, 10]);
      }
    }
    if (this.mode.drill === 'phaseB') this.duelInput(act);
    this.sim.press(act);
  }
  onRelease(act) { if (this.running && this.sim && !this.ui.calibrating) this.sim.release(act); }

  feedbackFor(act) {
    if (act.startsWith('cam:')) this.audio.tap('cam', +act.slice(4));
    else this.audio.tap(act);
    this.buzz(8);
  }

  buzz(pattern) { if (this.settings.haptics) buzz(pattern); }


  duelInput(act) {
    if (act === 'mask' && this.sim.maskOn) this.duel.begin(this.sim.t);
    else if (act === 'cam:10' || act === 'cam:4') {
      const before = this.duel.lastResult;
      this.duel.mark(this.sim.t, act);
      const r = this.duel.lastResult;
      if (r != null && r !== before) {
        const ok = r <= (this.mode.duelTarget ?? 0.7);
        this.duelWins = ok ? this.duelWins + 1 : 0;
        this.ui.setStreak(`${this.duelWins} / ${this.mode.target}  (${Math.round(r * 1000)}ms)`);
        if (ok) this.audio.good(); else { this.audio.bad(); buzz(18); }
        if (this.duelWins >= this.mode.target) this.pass(`${this.mode.target} attacks inside the window.`);
      }
    }
  }

  // Drill scaffolding: keeps the scenario re-arming so you can practise the
  // same 3 seconds over and over instead of waiting a whole night for it.
  drive() {
    const s = this.sim;
    if (this.mode.drill === 'phaseA') {
      // The measurable skill: were the cams DOWN when the 5s interval landed?
      // Reaching the vent opening is not a failure -- he gets there the moment
      // you raise the cams, by design. Phase A decides *when* he arrives.
      if (s.frame % C.MO_FRAMES === 0) {
        const up = s.monitor === 'up' || s.monitor === 'raising';
        if (up) {
          if (this.coach) { this.coach.cycleOk = false; this.coach.streak = 0; this.coach.combo = 0; }
          this.ui.setStreak(`0 / ${this.mode.target}`);
          this.ui.lane.pop('CAMS WERE UP', 'late', s.t);
          this.audio.bad(); this.buzz(30);
        } else {
          this.ui.lane.pop('SAFE', 'good', s.t);
        }
      }
      if (!s.bb.inOpening && s.bb.stage !== 3) s.bb.stage = 3;
      if (s.bb.inOpening) { s.bbLeave(); s.bb.stage = 3; }   // re-arm, no penalty
    }
    if (this.mode.drill === 'phaseB') {
      if (!s.bb.inOpening) {
        this._rearm = (this._rearm ?? 0) + 1;
        if (this._rearm > 90 && s.monitor === 'up') { s.bbEnterOpening(); this._rearm = 0; }
      } else this._rearm = 0;
    }
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.running || !this.sim) { this.last = now; return; }
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt * (this.settings.speed || 1);
    const step = 1 / C.FPS;
    let guard = 0;
    while (this.acc >= step && guard++ < 8) {
      this.acc -= step;
      this.sim.tick();
      this.coach?.update();
      this.drive();
      this.drainEvents();
      const last = this.coach?.last;
      if (last && last !== this._popped) {
        this._popped = last;
        const txt = last.delta == null ? last.grade.toUpperCase()
          : Math.abs(last.delta) <= this.coach.tolGood ? 'PERFECT'
          : `${last.delta > 0 ? 'LATE ' : 'EARLY '}${Math.abs(Math.round(last.delta * 1000))}ms`;
        this.ui.lane.pop(txt, last.grade, this.sim.t);
      }
      // The 5-second pulse, always available to lock on to: a strong click on
      // the :X2/:X7 anchors and a quiet one on the 5s intervals between them.
      if (this.settings.metronome && this.sim.frame % C.FPS === 0) {
        const d = Math.floor(this.sim.t) % 10;
        if (d === 2 || d === 7) this.audio.anchorTick(true);
        else if (d === 0 || d === 5) this.audio.anchorTick(false);
      }
      if (!this.sim.alive || this.sim.won) { this.finish(); break; }
    }
    this.ui.render(this.sim, this.coach);
  }

  drainEvents() {
    const s = this.sim;
    for (const ev of s.events) {
      switch (ev.type) {
        case 'laugh': this.audio.laugh(); break;
        case 'vent-bang': this.audio.ventBang(ev.data?.leaving); this.buzz(ev.data?.leaving ? [14, 30, 14] : 30); break;
        case 'gf-appear': case 'gf-hall': this.audio.gfAppear(); break;
        case 'death': this.audio.death(); this.buzz([60, 40, 120]); break;
        case 'win': this.audio.win(); break;
        default: break;
      }
    }
    s.events.length = 0;
    // music box metronome tick, every half second while winding
    if (s.winding) {
      const half = Math.floor(s.frame / 30);
      if (half !== this.lastBoxTick) { this.lastBoxTick = half; this.audio.boxTick(); }
    }
    const amb = s.foxy.loc === 'hall';
    if (amb !== this.ambOn) { this.ambOn = amb; this.audio.ambience(amb); }
  }

  finish() {
    this.running = false;
    this.wake?.release?.().catch(() => {});
    this.audio.ambience(false);
    if (this.sim.won && this.mode?.fullNight) { this.pass('Cleared 6 AM.'); return; }
    const sum = buildSummary(this.sim, this.coach);
    showPanel('report');
    renderReport(sum, this.sim, this.duel, this.modeKey);
  }
}

// ---------------------------------------------------------------- reporting
function renderReport(sum, sim, duel, modeKey) {
  const head = document.getElementById('rep-head');
  head.textContent = sum.won ? '6 AM — cleared' :
    sim.death ? `Died at ${fmtTime(sum.survived)}` : `Stopped at ${fmtTime(sum.survived)}`;
  head.className = sum.won ? 'win' : 'loss';
  document.getElementById('rep-why').textContent = sim.death ? sim.death.detail : '';

  const stats = [];
  if (sum.coach) {
    stats.push(['Inputs on time', `${sum.coach.good}/${sum.coach.total}`]);
    stats.push(['Mean error', `${Math.round(sum.coach.meanAbs * 1000)}ms`]);
  }
  stats.push(['Light used', `${sum.lightUsedSec.toFixed(1)}s of 50s`]);
  stats.push(['Light rate', `${Math.round(sum.lightPerSec * 1000)}ms/s ${sum.lightBudgetOk ? '✓' : '✗ over budget'}`]);
  for (const g of sum.gaps) stats.push([`CAM ${String(g.cam).padStart(2, '0')} lapses`, `${g.gaps}${g.gaps ? ` (worst ${g.worstSec.toFixed(2)}s)` : ''}`]);
  if (modeKey === 'phaseB' && duel.best) stats.push(['Best duel', `${Math.round(duel.best * 1000)}ms`]);
  document.getElementById('rep-stats').innerHTML =
    stats.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');

  const seen = new Set();
  document.getElementById('rep-mistakes').innerHTML = sum.mistakes
    .filter(m => { const k = m.code + m.detail; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(m => `<li><code>${fmtTime(m.t)}</code> ${m.detail || m.code}</li>`).join('') || '<li class="none">No flagged mistakes.</li>';

  requestAnimationFrame(() => drawTimeline(document.getElementById('rep-canvas'), sim));
}

// ------------------------------------------------------------------- shell
function showPanel(id) {
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('shown', p.id === id);
  document.body.classList.toggle('in-run', id === 'run');
}

function note(msg) {
  const el = document.getElementById('savemap-note');
  if (el) el.textContent = msg;
}

function loadSettings() {
  let s = { sound: true, coach: true, speed: 1, haptics: true, metronome: true };
  try { Object.assign(s, JSON.parse(localStorage.getItem('m7.settings') || '{}')); } catch { /* defaults */ }
  return s;
}
function saveSettings(s) { try { localStorage.setItem('m7.settings', JSON.stringify(s)); } catch { /* ignore */ } }

function buildMenu() {
  const prog = loadProgress();
  const open = unlockedIndex(prog);
  document.getElementById('mode-list').innerHTML = LESSONS.map((l, i) => {
    const done = !!prog[l.id]?.passed;
    const next = i === open && !done;
    const state = done ? 'done' : next ? 'next' : i < open ? 'done' : 'later';
    const best = prog[l.id]?.best;
    return `<button class="mode ${state}" data-mode="${l.id}">
      <span class="mode-n">${done ? '✓' : i + 1}</span>
      <b>${l.title}</b>${best ? `<span class="mode-best">best ${best}x</span>` : ''}
      <span class="mode-goal">${l.goal}</span>
    </button>`;
  }).join('');
}

buildMenu();
window.app = new App();
showPanel('menu');
