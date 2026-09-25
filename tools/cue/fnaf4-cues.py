#!/usr/bin/env python3
"""FNaF 4 sound cues out of the phone's A2DP mix, live or from a recording.

  fnaf4-cues.py --refs DIR --live PCM --raw OUT.raw [--events OUT.jsonl]
  fnaf4-cues.py --refs DIR --wav REC.bt.wav --start-wall-ms MS

The game plays its cues as Fusion samples (`res/raw/sNNNN.*`, extracted outside
the repository by tools/dump/extract-samples.sh). The Bluetooth encoder sits
downstream of the whole mix, so every sample reaches the host
(docs/device/ANDROID-AUDIO-CAPTURE.md); what this tool adds is detection.

Two kinds of cue, both from the level frame's event sheet
(~/fnaf-apks/fnaf4/events/03-04-level.txt):

* **Discrete samples** are matched filters. Each family groups samples whose
  waveforms are the same file under different handles (a 0.4 s chunk of one
  matches another at NCC >= 0.98), because content cannot tell them apart:
  our own carpet run (h4) is the same recording as one of Foxy's moves (h13,
  h17). A line is printed for each local NCC peak above --threshold, with the
  sample's ONSET on the host wall clock.
* **Breathing** (h22) is a 17.67 s loop that plays from 1 s into the night on
  channel 20 at volume 0; the game raises that channel to 100 while the player
  listens at a door with Bonnie or Chica at `hall near` (g2041-g2052). The loop
  is therefore always at some phase, so the window is matched against every
  lag of the circular reference and the best NCC is reported every hop as a
  level (`breath`), with the lag, so a caller can require phase consistency.

Host time of a sample: bluealsa-cli writes raw PCM with no timestamps. The
origin is the lower envelope of (receipt wall time - samples received / rate)
over every read, i.e. the earliest the first sample could have left the
phone's encoder, which is jitter-robust; the Bluetooth path's own latency is
NOT removed (UNKNOWN(a2dp-latency) until measured against a known event).
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time

import numpy as np
from scipy.signal import fftconvolve, resample_poly

SR = 11025
HOP_S = 0.1
WIN_S = 0.6
BREATH_WIN_S = 1.0
# (family, handle, meaning). A family is what a caller acts on; each handle in
# it is its own template unless its waveform IS another handle's (a 0.4 s chunk
# matching at NCC >= 0.98), in which case only one is kept: the carpet run h4
# is the same recording as h13 and h17, and h15 as h18 and h19.
TEMPLATES = [
    ("run", 4, "a carpet run: ours (h4), or Foxy's h13/h17"),
    ("foxy-left", 15, "Foxy to a living-room side, AV11=1 (h15; h18/h19 are the same file)"),
    ("foxy-left", 16, "Foxy, AV11=2"),
    ("foxy-right", 14, "Foxy, AV17=2 (AV17=1 is h13, the run's file)"),
    # Fredbear/Nightmare: every arrival on a living-room side plays one of
    # these -- a walk (g491-g495), a repel from a held door (g502/g503), an
    # eject from the closet or bed (g522/g523, g526/g527). AV11=3 (h26) when
    # he lands on the LEFT, AV17=3 (h25) on the RIGHT.
    ("fb-left", 26, "Fredbear now in the living room's left side (AV11=3)"),
    ("fb-right", 25, "Fredbear now in the living room's right side (AV17=3)"),
    # The five laughs. g530 plays one as a fake on a 10 s clock (1 in 10);
    # g3842-g3848 play one with the real teleport to the bed or closet on a
    # 30 s clock (20 s on the shadow nights). Same five files for both.
    ("laugh", 27, "laugh 1"), ("laugh", 28, "laugh 2"), ("laugh", 36, "laugh 3"),
    ("laugh", 37, "laugh 4"), ("laugh", 38, "laugh 5"),
    ("step", 29, "Bonnie/Chica steps, AV21"), ("step", 30, "steps"), ("step", 31, "steps"),
    ("step", 32, "steps"),
    ("closet-foxy", 23, "Foxy in the closet at the closet (g430/g433)"),
    ("foxy-in", 20, "Foxy running in on a return from a door (g98/g100)"),
    ("h3", 3, "follow AV6=1"), ("h11", 11, "follow AV6=2"), ("h12", 12, "follow AV6=3"),
    ("h40", 40, "follow AV20=1"), ("h41", 41, "follow AV20=2"), ("h46", 46, "follow AV20=3"),
]


def load_ref(refs: str, handle: int) -> np.ndarray:
    base = os.path.join(refs, f"s{handle:04d}")
    path = base + ".wav" if os.path.exists(base + ".wav") else base + ".ogg"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1",
                          "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


class Template:
    def __init__(self, name: str, ref: np.ndarray, circular: bool = False, win: int = int(WIN_S * SR)):
        self.name = name
        self.len = len(ref)
        self.circular = circular
        self.win = win
        r = np.concatenate([ref, ref[:win]]) if circular else ref
        if len(r) < win:                      # short sample: pad so every lag exists
            r = np.concatenate([r, np.zeros(win - len(r) + 1)])
        self.r = r
        c2 = np.concatenate([[0.0], np.cumsum(r * r)])
        self.er = np.sqrt(np.maximum(c2[win:] - c2[:-win], 0)) + 1e-9
        self.silent = self.er < 1e-4 * self.er.max()

    def match(self, w: np.ndarray) -> tuple[float, int]:
        """Best NCC of window w against every lag of the reference, and that lag."""
        w = w - w.mean()
        ew = np.sqrt((w * w).sum()) + 1e-9
        xc = fftconvolve(self.r, w[::-1], mode="valid") / (self.er * ew)
        xc[self.silent] = 0
        k = int(np.argmax(xc))
        return float(xc[k]), k


class Detector:
    def __init__(self, refs: str, threshold: float, emit):
        self.threshold = threshold
        self.emit = emit
        self.templates = []
        for family, handle, _ in TEMPLATES:
            self.templates.append(Template(f"{family}#{handle}", load_ref(refs, handle)))
        self.breath = Template("breath", load_ref(refs, 22), circular=True, win=int(BREATH_WIN_S * SR))
        self.buf = np.zeros(0)
        self.buf_start = 0              # absolute sample index (at SR) of buf[0]
        self.done = 0                   # absolute index of the next hop's window end
        self.recent: dict[str, list] = {}
        self.hop = int(HOP_S * SR)

    def feed(self, mono_sr: np.ndarray, sample_ms) -> None:
        """mono_sr: new samples at SR. sample_ms(i) -> host wall ms of absolute sample i."""
        self.buf = np.concatenate([self.buf, mono_sr])
        need = int(BREATH_WIN_S * SR)
        end_abs = self.buf_start + len(self.buf)
        if self.done == 0:
            self.done = self.buf_start + need
        while self.done <= end_abs:
            e = self.done - self.buf_start
            for t in self.templates:
                w = self.buf[e - t.win:e]
                v, k = t.match(w)
                # window [e-win, e) aligns with reference [k, k+win): onset at e-win-k
                onset = self.done - t.win - k
                self._peak(t.name, v, onset, sample_ms)
            v, k = self.breath.match(self.buf[e - self.breath.win:e])
            self.emit({"cue": "breath", "ncc": round(v, 4), "lag": k,
                       "phase": round(((k - (self.done - self.breath.win)) % self.breath.len) / SR, 3),
                       "atMs": sample_ms(self.done)})
            self.done += self.hop
        keep = int(BREATH_WIN_S * SR) + self.hop
        if len(self.buf) > keep * 4:
            drop = len(self.buf) - keep
            self.buf = self.buf[drop:]
            self.buf_start += drop

    def _peak(self, name, v, onset, sample_ms):
        # One line per detected onset: keep the best NCC among hops whose onset
        # estimates agree within 60 ms, and publish it once it stops improving.
        st = self.recent.get(name)
        if v >= self.threshold:
            if st and abs(onset - st[1]) <= int(0.06 * SR):
                if v > st[0]:
                    st[0], st[1] = v, onset
                st[2] = 0
                return
            if st:
                self._flush(name, sample_ms)
            self.recent[name] = [v, onset, 0]
        elif st:
            st[2] += 1
            if st[2] >= 3:
                self._flush(name, sample_ms)

    def _flush(self, name, sample_ms):
        v, onset, _ = self.recent.pop(name)
        family, _, handle = name.partition("#")
        self.emit({"cue": family, "handle": int(handle) if handle else None, "ncc": round(v, 4),
                   "onsetMs": sample_ms(onset)})


def to_mono_sr(block: np.ndarray, rate: int) -> np.ndarray:
    mono = block.astype(np.float64).mean(axis=1) / 32768.0
    return resample_poly(mono, SR, rate) if rate != SR else mono


def run_wav(args, emit) -> None:
    from scipy.io import wavfile
    rate, x = wavfile.read(args.wav)
    det = Detector(args.refs, args.threshold, emit)
    mono = to_mono_sr(x, rate)
    step = int(0.5 * SR)
    for i in range(0, len(mono), step):
        det.feed(mono[i:i + step], lambda s: round(args.start_wall_ms + s * 1000 / SR, 1))


def run_live(args, emit) -> int:
    info = subprocess.run(["bluealsa-cli", "info", args.live], check=True, capture_output=True, text=True).stdout
    fmt = next(l.split(":", 1)[1].strip() for l in info.splitlines() if l.startswith("Format:"))
    rate = int(next(l.split(":", 1)[1].split()[0] for l in info.splitlines() if l.startswith("Sampling:")))
    channels = int(next(l.split(":", 1)[1].strip() for l in info.splitlines() if l.startswith("Channels:")))
    if fmt != "S16_LE":
        print(f"fnaf4-cues: unsupported PCM format {fmt}", file=sys.stderr)
        return 2
    proc = subprocess.Popen(["bluealsa-cli", "open", args.live], stdout=subprocess.PIPE,
                            start_new_session=True)
    stop = {"flag": False}
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.__setitem__("flag", True))
    det = Detector(args.refs, args.threshold, emit)
    frame_bytes = 2 * channels
    received = 0                                   # frames at the PCM rate
    origin = None                                  # wall ms of frame 0 (lower envelope)
    raw = open(args.raw, "wb") if args.raw else None
    pending = b""
    emit({"cue": "start", "rate": rate, "channels": channels, "pcm": args.live, "atMs": time.time() * 1000})
    try:
        while not stop["flag"]:
            chunk = proc.stdout.read1(rate * frame_bytes // 20) if hasattr(proc.stdout, "read1") else proc.stdout.read(4096)
            now = time.time() * 1000
            if not chunk:
                break
            if raw:
                raw.write(chunk)
            data = pending + chunk
            usable = len(data) - len(data) % frame_bytes
            pending = data[usable:]
            block = np.frombuffer(data[:usable], "<i2").reshape(-1, channels)
            received += len(block)
            cand = now - received * 1000 / rate
            origin = cand if origin is None else min(origin, cand)
            o = origin
            det.feed(to_mono_sr(block, rate), lambda s, o=o: round(o + s * 1000 / SR, 1))
    finally:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=5)
        if raw:
            raw.close()
        emit({"cue": "stop", "frames": received, "originMs": origin, "atMs": time.time() * 1000})
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refs", required=True, help="directory of extracted sNNNN samples (outside the repo)")
    ap.add_argument("--threshold", type=float, default=0.55)
    ap.add_argument("--events", help="append JSON lines here as well as stdout")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--live", help="BlueALSA PCM object path")
    src.add_argument("--wav")
    ap.add_argument("--start-wall-ms", type=float, default=0.0, help="--wav: wall ms of its first sample")
    ap.add_argument("--raw", help="--live: also keep the raw PCM here (outside the repo)")
    ap.add_argument("--quiet-breath", action="store_true", help="print breath levels only above 0.3")
    args = ap.parse_args()
    sink = open(args.events, "a") if args.events else None

    def emit(e):
        if args.quiet_breath and e["cue"] == "breath" and e["ncc"] < 0.3:
            return
        line = json.dumps(e)
        print(line, flush=True)
        if sink:
            sink.write(line + "\n")
            sink.flush()

    return run_live(args, emit) if args.live else (run_wav(args, emit) or 0)


if __name__ == "__main__":
    sys.exit(main())
