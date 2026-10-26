"""Trove app icon: a 3x3x3 cube of floating glass blocks with a solid orange T in the middle slice.

build() renders one icon or one layer to SVG + PNG. See export.py for the full asset set."""
import math, os
import resvg_py

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
C30, S30 = math.cos(math.radians(30)), 0.5

def f2(p): return f"{p[0]:.1f},{p[1]:.1f}"
def squircle(x, y, s, n=5.0, steps=240):
    r = s/2; cx, cy = x+r, y+r; out = []
    for i in range(steps):
        th = 2*math.pi*i/steps; c, sn = math.cos(th), math.sin(th)
        out.append((cx + r*math.copysign(abs(c)**(2/n), c), cy + r*math.copysign(abs(sn)**(2/n), sn)))
    return "M" + " L".join(f2(p) for p in out) + " Z"
TILE = squircle(100, 100, 824)

N = 3
T = {(1, y, 2) for y in range(3)} | {(1, 1, 0), (1, 1, 1)}

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def mix(a, b, t):
    a, b = hexrgb(a), hexrgb(b)
    return '#%02x%02x%02x' % tuple(int(round(x + (y-x)*t)) for x, y in zip(a, b))

DARK = dict(dark=True, tile=("#000000", "#000000"),   # flat black, no gradient
            g_top=("#E6F3FF", 0.26, 0.08), g_right=("#CFE6FF", 0.15, 0.04), g_left=("#B9D6F5", 0.10, 0.02),
            t_top="#FFB766", t_right="#F68E36", t_left="#DC6A1C",
            glow="#FF9A3D", glow_op=0.18, warm=0.55, shadow=0.55, glint=0.55,
            gcol="#FFA24A", gface=(0.15, 0.10, 0.07), floor=0.12)
LIGHT = dict(dark=False, tile=("#F7F8FA", "#E4E7EE"),
             g_top=("#FFFFFF", 0.75, 0.35), g_right=("#C3D8EE", 0.42, 0.16), g_left=("#A3BFDD", 0.40, 0.14),
             t_top="#FF9F3F", t_right="#F2761A", t_left="#CF570B",
             glow="#FF8A2A", glow_op=0.07, warm=0.35, shadow=0.14, glint=0.9,
             gcol="#F28A3A", gface=(0.14, 0.10, 0.08), floor=0.10)

def build(name, st, u=114, gap=0.13, cy=512, vox_set=None, falloff=1.5, floor=None, center=(1.5, 1.5, 1.5), gscale=1.0, layers=('glow', 'glass', 't'), mode='icon', out_dir=None):
    cx = 512
    c0 = center
    def P(x, y, z):
        return (cx + ((x-c0[0]) - (y-c0[1]))*C30*u, cy + ((x-c0[0]) + (y-c0[1]))*S30*u - (z-c0[2])*u)
    def poly(pts, fill, extra=""):
        return f'<polygon points="{" ".join(f2(p) for p in pts)}" fill="{fill}" {extra}/>'

    D = [f'''
<linearGradient id="tileg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{st['tile'][0]}"/><stop offset="1" stop-color="{st['tile'][1]}"/></linearGradient>
<linearGradient id="tilehl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="tshadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="b12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="b40" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="40"/></filter>
<clipPath id="tileclip"><path d="{TILE}"/></clipPath>
''']
    gid = [0]; gcache = {}
    def grad(color, o0, o1, x1=0, y1=0, x2=1, y2=1):
        key = (color, round(o0, 3), round(o1, 3), x1, y1, x2, y2)
        if key in gcache: return gcache[key]
        gid[0] += 1; i = f"g{gid[0]}"
        gcache[key] = f"url(#{i})"
        D.append(f'<linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{color}" stop-opacity="{o0}"/><stop offset="1" stop-color="{color}" stop-opacity="{o1}"/></linearGradient>')
        return f"url(#{i})"

    O = []
    # floor shadow + ambient glow from the T
    base = P(1.5, 1.5, 0)
    tc = P(1.5, 1.5, 1.6)
    if 'glow' in layers:
        O.append(f'<ellipse cx="{tc[0]:.0f}" cy="{tc[1]:.0f}" rx="{u*1.9:.0f}" ry="{u*1.9:.0f}" fill="{st["glow"]}" opacity="{st["glow_op"]:.2f}" filter="url(#b40)"/>')

    def near_T(v):
        return min(math.dist(v, t) for t in T)

    a, b = gap/2, 1-gap/2
    vox = vox_set if vox_set is not None else [(x, y, z) for x in range(N) for y in range(N) for z in range(N)]
    vox = list(set(vox) | T)
    flo = st["floor"] if floor is None else floor
    for (x, y, z) in sorted(vox, key=lambda v: (v[0]+v[1]+v[2], v[2])):
        sc = P(x+0.5, y+0.5, z+0.5)
        if not (-u < sc[0] < 1024+u and -u < sc[1] < 1024+u): continue
        X0, X1, Y0, Y1, Z0, Z1 = x+a, x+b, y+a, y+b, z+a, z+b
        top = [P(X0,Y0,Z1), P(X1,Y0,Z1), P(X1,Y1,Z1), P(X0,Y1,Z1)]
        right = [P(X1,Y0,Z0), P(X1,Y1,Z0), P(X1,Y1,Z1), P(X1,Y0,Z1)]
        left = [P(X0,Y1,Z0), P(X1,Y1,Z0), P(X1,Y1,Z1), P(X0,Y1,Z1)]
        if (x, y, z) in T:
            if 't' not in layers: continue
            O.append(poly(top, st["t_top"]))
            O.append(poly(right, st["t_right"]))
            O.append(poly(left, st["t_left"]))
            # soft top sheen, no line
            O.append(poly(top, grad("#ffffff", 0.35, 0.0, 0, 0, 1, 1)))
            O.append(poly(right, grad("#ffffff", 0.12, 0.0, 0, 0, 0, 1)))
        else:
            if 'glass' not in layers: continue
            # glass lit only by the T: visibility falls off with distance from it
            dist = near_T((x, y, z))
            lit = max(flo, 1 - (dist - 1) / falloff)
            k = gscale * lit * (0.55 if (x == 2 and 0 <= y <= 2 and 0 <= z <= 2) else 1.0)
            gc = st["gcol"]
            ft, fr, fl = st["gface"]
            O.append(poly(left, grad(gc, fl*k, fl*k*0.35, 0, 0, 0, 1)))
            O.append(poly(right, grad(gc, fr*k, fr*k*0.35, 0, 0, 0, 1)))
            O.append(poly(top, grad(gc, ft*k, ft*k*0.4, 0, 0, 1, 1)))
            # tiny soft glint on the top-front corner


    if mode == 'layer':
        # Icon Composer layer: full 1024 canvas, no tile, art scaled from the 824 tile to the full canvas
        bg = ''
        if 'background' in layers:
            bg = '<rect width="1024" height="1024" fill="url(#tileg)"/>'
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>{"".join(D)}</defs>
{bg}
<g transform="translate(512,512) scale({1024/824:.4f}) translate(-512,-512)">
{chr(10).join(O)}
</g>
</svg>'''
        od = out_dir or OUT
        open(os.path.join(od, f"{name}.svg"), "w").write(svg)
        open(os.path.join(od, f"{name}.png"), "wb").write(bytes(resvg_py.svg_to_bytes(svg_string=svg)))
        return svg
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>{"".join(D)}</defs>
<path d="{TILE}" fill="#000" opacity="0.35" transform="translate(0,12)" filter="url(#tshadow)"/>
<path d="{TILE}" fill="url(#tileg)"/>
<g clip-path="url(#tileclip)">
{chr(10).join(O)}
</g>
{"" if st["dark"] else '<path d="' + TILE + '" fill="url(#tilehl)"/>'}
<path d="{TILE}" fill="none" stroke="{'#fff' if st['dark'] else '#000'}" stroke-opacity="{0.1 if st['dark'] else 0.06}" stroke-width="3"/>
</svg>'''
    od = out_dir or OUT
    open(os.path.join(od, f"{name}.svg"), "w").write(svg)
    open(os.path.join(od, f"{name}.png"), "wb").write(bytes(resvg_py.svg_to_bytes(svg_string=svg)))
    return svg

def sheet(names, out, big=440):
    from PIL import Image
    ims = [Image.open(os.path.join(OUT, f"{n}.png")) for n in names]
    sh = Image.new('RGBA', (len(ims)*(big+20), big+100), (236, 236, 234, 255))
    for i, im in enumerate(ims):
        x = i*(big+20)+10
        sh.alpha_composite(im.resize((big, big), Image.LANCZOS), (x, 6))
        sx = x + big//2 - 110
        for sz in (64, 32, 16):
            sh.alpha_composite(im.resize((sz, sz), Image.LANCZOS), (sx, big+18+(64-sz)//2)); sx += sz + 40
    sh.save(os.path.join(OUT, out))
