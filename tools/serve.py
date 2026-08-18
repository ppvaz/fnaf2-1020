#!/usr/bin/env python3
"""Dev server for the trainer.

Serves the project on the LAN and accepts POST /save-layout, so a layout
calibrated by dragging on the phone can be written back into src/config.js as
the new DEFAULT_MAP. Rebuilds dist/ afterwards so a reload picks it up.

    python3 tools/serve.py [port]
"""
import json, re, subprocess, sys, pathlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'src' / 'config.js'
MAP_BLOCK = re.compile(r"export const DEFAULT_MAP = \{.*?\n\};\n", re.S)
WID_BLOCK = re.compile(r"export const DEFAULT_WIDGETS = \{.*?\n\};\n", re.S)
VALID = set(range(1, 13))
WIDGETS = {'light', 'camlight', 'mask', 'monitor', 'ventL', 'ventR', 'wind'}
SPACES = {'light': 'stage', 'camlight': 'stage', 'mask': 'stage', 'monitor': 'stage',
          'ventL': 'stage', 'ventR': 'stage', 'wind': 'feed'}


def validate(m):
    if not isinstance(m, dict) or set(map(int, m)) != VALID:
        raise ValueError(f'expected exactly cams 1-12, got {sorted(map(int, m))}')
    out = {}
    for k, v in m.items():
        r = {f: float(v[f]) for f in ('x', 'y', 'w', 'h')}
        if not all(0 <= r[f] <= 1 for f in r):
            raise ValueError(f'cam {k}: values must be 0..1, got {r}')
        if r['w'] <= 0 or r['h'] <= 0:
            raise ValueError(f'cam {k}: width and height must be positive')
        out[int(k)] = r
    return out


def validate_widgets(w):
    if not isinstance(w, dict) or set(w) != WIDGETS:
        raise ValueError(f'expected widgets {sorted(WIDGETS)}, got {sorted(w or {})}')
    out = {}
    for k, v in w.items():
        r = {f: float(v[f]) for f in ('x', 'y', 'w', 'h')}
        if not all(0 <= r[f] <= 1 for f in r):
            raise ValueError(f'widget {k}: values must be 0..1, got {r}')
        if r['w'] <= 0 or r['h'] <= 0:
            raise ValueError(f'widget {k}: width and height must be positive')
        # `space` is structural; it is never taken from the client.
        r['space'] = SPACES[k]
        out[k] = r
    return out


def write_config(m, w):
    src = CONFIG.read_text()
    for name, block in (('DEFAULT_MAP', MAP_BLOCK), ('DEFAULT_WIDGETS', WID_BLOCK)):
        if not block.search(src):
            raise RuntimeError(f'{name} block not found in src/config.js')
    rows = '\n'.join(
        f"  {k}:{' ' * (2 - len(str(k)))} {{ x: {m[k]['x']:.3f}, y: {m[k]['y']:.3f}, "
        f"w: {m[k]['w']:.3f}, h: {m[k]['h']:.3f} }},"
        for k in sorted(m))
    src = MAP_BLOCK.sub(f"export const DEFAULT_MAP = {{\n{rows}\n}};\n", src)

    pad = max(len(k) for k in w)
    wrows = '\n'.join(
        f"  {k + ':':<{pad + 1}} {{ space: '{w[k]['space']}',{' ' if w[k]['space'] == 'feed' else ''} "
        f"x: {w[k]['x']:.3f}, y: {w[k]['y']:.3f}, w: {w[k]['w']:.3f}, h: {w[k]['h']:.3f} }},"
        for k in sorted(w))
    src = WID_BLOCK.sub(f"export const DEFAULT_WIDGETS = {{\n{wrows}\n}};\n", src)
    CONFIG.write_text(src)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/save-layout':
            return self._json(404, {'error': 'not found'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(n) or b'{}')
            m = validate(data.get('map'))
            w = validate_widgets(data.get('widgets'))
            if data.get('dry'):
                # Validate and report without touching the file, so automated
                # tests can exercise this path without editing the repo.
                print('save-layout: dry run ok')
                return self._json(200, {'ok': True, 'dry': True, 'build': '(dry run, not written)'})
            write_config(m, w)
            build = subprocess.run([sys.executable, str(ROOT / 'tools' / 'build.py')],
                                   capture_output=True, text=True)
            print(f'saved layout -> src/config.js  ({build.stdout.strip()})')
            self._json(200, {'ok': True, 'build': build.stdout.strip()})
        except Exception as e:
            print(f'save-layout failed: {e}')
            self._json(400, {'error': str(e)})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if 'save-layout' in (args[0] if args else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
