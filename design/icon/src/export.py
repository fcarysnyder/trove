"""Export every Trove icon asset into design/icon/. Run: python3 design/icon/src/export.py

Needs: pip install resvg-py pillow icnsutil"""
import os, io, shutil, re, urllib.parse
from PIL import Image
import resvg_py
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trove_icon import build, DARK, LIGHT

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
D = {k: os.path.join(ROOT, k) for k in ("masters", "macos", "icon-composer", "mark")}
for p in D.values():
    shutil.rmtree(p, ignore_errors=True); os.makedirs(p)

THEMES = {"dark": DARK, "light": LIGHT}
FULL = dict(cy=536)                                                     # optical nudge
SMALL = dict(vox_set=[], u=150, gap=0.16, center=(1.5, 1.5, 1.9))     # T-only for tiny sizes

# ---- masters ----
for t, st in THEMES.items():
    build(f"trove-icon-{t}", st, out_dir=D["masters"], **FULL)
    build(f"trove-icon-{t}-small", st, out_dir=D["masters"], **SMALL)

# ---- macOS iconset + icns (per theme) ----
# pixel size -> which art. 16/32/64px are only ever shown at 16pt or 32pt, so they get the T-only art.
SIZES = [(16, "16x16"), (32, "16x16@2x"), (32, "32x32"), (64, "32x32@2x"), (128, "128x128"),
         (256, "128x128@2x"), (256, "256x256"), (512, "256x256@2x"), (512, "512x512"), (1024, "512x512@2x")]
for t in THEMES:
    full = Image.open(os.path.join(D["masters"], f"trove-icon-{t}.png")).convert("RGBA")
    small = Image.open(os.path.join(D["masters"], f"trove-icon-{t}-small.png")).convert("RGBA")
    iconset = os.path.join(D["macos"], f"Trove-{t}.iconset"); os.makedirs(iconset)
    by_px = {}
    for px, label in SIZES:
        src = small if px <= 64 else full
        im = src if px == 1024 else src.resize((px, px), Image.LANCZOS)
        im.save(os.path.join(iconset, f"icon_{label}.png"))
        by_px[px] = im
    import icnsutil
    img = icnsutil.IcnsFile()
    for _, label in SIZES:
        img.add_media(file=os.path.join(iconset, f"icon_{label}.png"))
    img.write(os.path.join(D["macos"], f"icon-{t}.icns"), toc=True)
    by_px[1024].save(os.path.join(D["macos"], f"icon-{t}.png"))
    shutil.rmtree(iconset)

# ---- Icon Composer layers (full 1024 canvas, no mask; system applies squircle + Liquid Glass) ----
for t, st in THEMES.items():
    for layer in ("background", "glow", "glass", "t"):
        build(f"{layer}-{t}", st, mode="layer", layers=(layer,), out_dir=D["icon-composer"], **FULL)

# ---- standalone mark (T only, transparent, tight crop) ----
def tight(name, st, pad=0.06):
    svg = build(name, st, mode="layer", layers=("t",), out_dir=D["mark"], **SMALL)
    png = Image.open(os.path.join(D["mark"], f"{name}.png"))
    l, tp, r, b = png.getbbox()
    w, h = r - l, b - tp
    s = max(w, h) * (1 + 2*pad)
    cx, cy = (l + r) / 2, (tp + b) / 2
    # the layer svg scales by 1024/824 around 512; the bbox is already in final canvas coords
    vb = f"{cx - s/2:.1f} {cy - s/2:.1f} {s:.1f} {s:.1f}"
    svg2 = re.sub(r'width="1024" height="1024" viewBox="0 0 1024 1024"', f'width="512" height="512" viewBox="{vb}"', svg, count=1)
    open(os.path.join(D["mark"], f"{name}.svg"), "w").write(svg2)
    os.remove(os.path.join(D["mark"], f"{name}.png"))
    for px in (1024, 512, 256, 128, 64, 32):
        out = bytes(resvg_py.svg_to_bytes(svg_string=svg2, width=px, height=px))
        open(os.path.join(D["mark"], f"{name}-{px}.png"), "wb").write(out)
    return svg2

mark = tight("trove-mark", DARK)

# favicon: just the T's flat faces (no gradients or filters), so it stays tiny and inlines cleanly
vb = re.search(r'viewBox="([^"]+)"', mark).group(1)
polys = [m for m in re.findall(r'<polygon [^>]*/>', mark) if 'url(' not in m]
fav = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='{vb}'>" + "".join(p.replace('"', "'") for p in polys) + "</svg>"
open(os.path.join(D["mark"], "favicon.svg"), "w").write(fav)
ico_src = Image.open(os.path.join(D["mark"], "trove-mark-256.png")).convert("RGBA")
ico_src.save(os.path.join(D["mark"], "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
open(os.path.join(D["mark"], "favicon.datauri.txt"), "w").write("data:image/svg+xml," + urllib.parse.quote(fav, safe=" ,:=/'.-"))
print("exported to", ROOT)
