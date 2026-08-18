#!/usr/bin/env python3
"""Inline the ES modules and CSS into one self-contained dist/index.html.

The trainer has no dependencies and no build step for development (just serve
the folder). This exists so the page can be opened from a phone or published as
a single file.
"""
import re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
ENTRY = 'main'

DEP = re.compile(r"^import .*? from '\./(\w+)\.js';", re.M)
IMPORT_NS = re.compile(r"^import \* as (\w+) from '\./(\w+)\.js';\s*$", re.M)
IMPORT_NAMED = re.compile(r"^import \{([^}]*)\} from '\./(\w+)\.js';\s*$", re.M)
EXPORT_DECL = re.compile(r"^export\s+(async\s+function|function|class|const|let)\s+(\w+)", re.M)
EXPORT_LIST = re.compile(r"^export \{([^}]*)\};\s*$", re.M)


def transform(name, code):
    code = IMPORT_NS.sub(lambda m: f"const {m.group(1)} = __req('{m.group(2)}');", code)
    code = IMPORT_NAMED.sub(lambda m: f"const {{{m.group(1)}}} = __req('{m.group(2)}');", code)
    names = [m.group(2) for m in EXPORT_DECL.finditer(code)]
    for m in EXPORT_LIST.finditer(code):
        names += [n.strip() for n in m.group(1).split(',') if n.strip()]
    code = EXPORT_LIST.sub('', code)
    code = re.sub(r"^export\s+", '', code, flags=re.M)
    names = sorted(set(names))
    tail = f"\nObject.assign(__x, {{ {', '.join(names)} }});\n" if names else ''
    return f"__def('{name}', function(__x, __req) {{\n{code}\n{tail}}});\n"


def resolve(entry=ENTRY):
    """Depth-first module order derived from the imports themselves, so adding a
    new module never needs a hand-maintained list."""
    order, seen, stack = [], set(), set()

    def visit(name):
        if name in order:
            return
        if name in stack:
            raise RuntimeError(f'import cycle involving {name}')
        path = SRC / f'{name}.js'
        if not path.exists():
            raise RuntimeError(f"{name}.js not found (imported but missing)")
        stack.add(name)
        for dep in DEP.findall(path.read_text()):
            visit(dep)
        stack.discard(name)
        seen.add(name)
        order.append(name)

    visit(entry)
    stray = {p.stem for p in SRC.glob('*.js')} - seen
    if stray:
        print(f'note: not bundled (nothing imports them): {sorted(stray)}', file=sys.stderr)
    return order


def main():
    html = (ROOT / 'index.html').read_text()
    css = (SRC / 'style.css').read_text()

    shim = ("const __m={};const __def=(n,f)=>__m[n]={f,x:null};"
            "const __req=(n)=>{const m=__m[n];"
            "if(!m)throw new Error('module not bundled: '+n);"
            "if(!m.x){m.x={};m.f(m.x,__req);}return m.x;};\n")
    order = resolve()
    bundle = shim + ''.join(transform(n, (SRC / f'{n}.js').read_text()) for n in order) + f"__req('{ENTRY}');\n"

    html = html.replace('<link rel="stylesheet" href="src/style.css">', f'<style>\n{css}\n</style>')
    html = html.replace('<script type="module" src="src/main.js"></script>', f'<script>\n{bundle}\n</script>')

    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(html)
    kb = len(html.encode()) / 1024
    print(f'dist/index.html  {kb:.0f} KB  ({len(order)} modules)')
    leftover = re.findall(r'(?:src|href)="(?!https?:|#)[^"]*"', html)
    if leftover:
        print(f'WARNING: unresolved local reference(s): {leftover}', file=sys.stderr)


main()
