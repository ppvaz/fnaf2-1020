// Drives the lesson ladder with an in-page "perfect player" that taps whatever
// the coach is currently cueing. Checks control gating, cueing, streaks and the
// pass screen.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8731/dist/index.html';
const PORT = 9337;
const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'm7l-'))}`, '--no-first-run', '--disable-gpu',
  '--window-size=880,420', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let id = 0;
const rpc = (ws, m, p = {}) => new Promise((res, rej) => { const mid = ++id;
  const on = e => { const x = JSON.parse(e.data); if (x.id !== mid) return;
    ws.removeEventListener('message', on); x.error ? rej(new Error(x.error.message)) : res(x.result); };
  ws.addEventListener('message', on); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });

const errs = [], fails = [];

// tapped as soon as each step falls due — a metronomically perfect player
// `hold` decides whether the bot lets go: a held input stays down until the
// next control is pressed, which is what the wind step now demands.
const player = (hold) => `window.__auto && clearInterval(window.__auto);
window.__held = null;
window.__release = () => { if (window.__held) {
  window.__held.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:31}));
  window.__held = null; } };
window.__auto = setInterval(() => {
  const app = window.app;
  if (!app || !app.running || !app.coach || !app.coach.enabled) return;
  const c = app.coach, e = c.expected;
  if (!e || c.cycleStart == null) return;
  if (app.sim.t < c.cycleStart + e.at) return;
  const cue = c.cue; if (!cue) return;
  const el = document.querySelector(cue.sel); if (!el) return;
  window.__release();
  el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerId:31}));
  if (${hold ? 'true' : 'false'} && e.hold) { window.__held = el; }
  else el.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:31}));
}, 8); true`;
const AUTOPLAYER = player(true);

async function main() {
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json`); break; } catch { await sleep(200); } }
  const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.navigate', { url: BASE }); await sleep(1500);

  const ev = async (expr) => { const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) errs.push(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const expect = async (label, expr, want) => { const v = await ev(expr);
    const ok = JSON.stringify(v) === JSON.stringify(want);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(v)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
    if (!ok) fails.push(label); return v; };
  const show = async (l, e) => { console.log(`  ${l}: ${JSON.stringify(await ev(e))}`); };

  await ev('localStorage.removeItem("m7.progress")');
  await ev('location.reload()'); await sleep(1200);

  console.log('\n— menu is a ladder —');
  await expect('lesson count', 'document.querySelectorAll("#mode-list .mode").length', 10);
  await expect('first is next', 'document.querySelector("#mode-list .mode").className.includes("next")', true);
  await expect('later ones dimmed', 'document.querySelectorAll("#mode-list .mode.later").length > 0', true);

  console.log('\n— lesson 1: the beat —');
  await ev('document.querySelector(\'[data-mode="beat"]\').click()'); await sleep(250);
  await expect('brief shown', 'document.getElementById("brief").classList.contains("shown")', true);
  await show('pass criterion', 'document.getElementById("brief-pass").textContent');
  await ev('document.getElementById("btn-brief-go").click()'); await sleep(500);
  await expect('only LIGHT visible', `[...document.querySelectorAll('[data-widget]')]
     .filter(e=>!e.classList.contains('hidden-ctrl')).map(e=>e.dataset.widget).sort().join()`, 'light');
  await expect('cams dimmed', 'document.getElementById("map").classList.contains("dim-cams")', true);
  await ev(AUTOPLAYER);
  await sleep(47000);
  await show('streak', 'document.getElementById("coach-streak").textContent');
  await expect('passed screen', 'document.getElementById("passed").classList.contains("shown")', true);
  await show('passed text', 'document.getElementById("passed-title").textContent');
  await expect('progress saved', 'JSON.parse(localStorage["m7.progress"]).beat.passed', true);

  console.log('\n— lesson 2 unlocked and reachable —');
  await ev('document.getElementById("btn-next-lesson").click()'); await sleep(250);
  await expect('brief is sweep', 'document.getElementById("brief-title").textContent', 'The sweep');
  await ev('document.getElementById("btn-brief-go").click()'); await sleep(400);
  await expect('cams live', 'document.getElementById("map").classList.contains("dim-cams")', false);
  await expect('monitor hidden', 'document.querySelector(\'[data-widget="monitor"]\').classList.contains("hidden-ctrl")', true);
  await expect('starts on cams', 'window.app.sim.monitor', 'up');
  await ev(AUTOPLAYER); await sleep(47000);
  await show('sweep streak', 'document.getElementById("coach-streak").textContent');
  await expect('sweep passed', 'document.getElementById("passed").classList.contains("shown")', true);
  await show('stun held', 'Math.max(0,...window.app.sim.units.filter(u=>[10,4,7].includes(u.path[u.idx])).map(u=>u.stunUntil-window.app.sim.frame))');

  console.log('\n— winding must be HELD, not tapped —');
  await ev('document.getElementById("btn-passed-menu").click()'); await sleep(200);
  await ev('document.querySelector(\'[data-mode="wind"]\').click()'); await sleep(200);
  await ev('document.getElementById("btn-brief-go").click()'); await sleep(400);
  await ev(player(false));            // taps the wind button instead of holding
  await sleep(16000);
  await expect('tapping wind never passes', 'window.app.coach.streak', 0);
  await show('flagged', 'window.app.coach.results.slice(-4).map(r=>r.grade).join()');
  await ev(AUTOPLAYER);               // now actually hold it
  await sleep(24000);
  await show('holding: streak', 'document.getElementById("coach-streak").textContent');
  await show('held seconds', 'window.app.coach.lastHeld?.toFixed(2)');
  await expect('holding builds a streak', 'window.app.coach.streak > 0', true);

  console.log('\n— jump to the full cycle —');
  await ev('document.getElementById("btn-quit").click()'); await sleep(200);
  await ev('document.querySelector(\'[data-mode="cycle"]\').click()'); await sleep(200);
  await ev('document.getElementById("btn-brief-go").click()'); await sleep(400);
  await expect('controls (cams up)', `[...document.querySelectorAll('[data-widget]')]
     .filter(e=>!e.classList.contains('hidden-ctrl')).map(e=>e.dataset.widget).sort().join()`,
     'camlight,mask,monitor,wind');
  await ev(AUTOPLAYER); await sleep(58000);
  await show('cycle streak', 'document.getElementById("coach-streak").textContent');
  await show('cycles run', 'window.app.coach.cycles');
  await show('best streak', 'window.app.coach.bestStreak');
  await expect('cycle passed', 'document.getElementById("passed").classList.contains("shown")', true);

  await ev('clearInterval(window.__auto)');
  const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync('/tmp/m7-lesson.png', Buffer.from(shot.data, 'base64'));
  console.log(`\nconsole errors: ${errs.length}`);
  errs.slice(0, 6).forEach(e => console.log('  ! ' + String(e).split('\n')[0]));
  console.log(fails.length ? `FAILURES: ${fails.join(', ')}` : 'all assertions passed');
  ws.close(); chrome.kill(); process.exit(fails.length || errs.length ? 1 : 0);
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
