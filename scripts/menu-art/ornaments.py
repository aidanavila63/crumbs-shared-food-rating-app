# Procedural SVG ornaments for the ready-made styles.
# Each ornament = list of path specs {d, f, s, w, o, r}; colours are keys resolved per colourway in JS.
import math, random

def n(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s

def circle(cx, cy, r):
    return f'M{n(cx - r)} {n(cy)}a{n(r)} {n(r)} 0 1 0 {n(2 * r)} 0a{n(r)} {n(r)} 0 1 0 {n(-2 * r)} 0Z'

def ellipse(cx, cy, rx, ry, rot=0):
    a = math.radians(rot)
    x1, y1 = cx - rx * math.cos(a), cy - rx * math.sin(a)
    x2, y2 = cx + rx * math.cos(a), cy + rx * math.sin(a)
    return f'M{n(x1)} {n(y1)}A{n(rx)} {n(ry)} {n(rot)} 0 1 {n(x2)} {n(y2)}A{n(rx)} {n(ry)} {n(rot)} 0 1 {n(x1)} {n(y1)}Z'

def rect(x, y, w, h):
    return f'M{n(x)} {n(y)}h{n(w)}v{n(h)}h{n(-w)}Z'

def rrect(x, y, w, h, r):
    return (f'M{n(x + r)} {n(y)}H{n(x + w - r)}A{n(r)} {n(r)} 0 0 1 {n(x + w)} {n(y + r)}V{n(y + h - r)}'
            f'A{n(r)} {n(r)} 0 0 1 {n(x + w - r)} {n(y + h)}H{n(x + r)}A{n(r)} {n(r)} 0 0 1 {n(x)} {n(y + h - r)}'
            f'V{n(y + r)}A{n(r)} {n(r)} 0 0 1 {n(x + r)} {n(y)}Z')

def poly(pts, close=True):
    s = 'M' + 'L'.join(f'{n(x)} {n(y)}' for x, y in pts)
    return s + ('Z' if close else '')

def star(cx, cy, R, r, k=5, rot=-90):
    pts = []
    for i in range(2 * k):
        a = math.radians(rot + i * 180 / k)
        rr = R if i % 2 == 0 else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return poly(pts)

def leaf(bx, by, length, width, ang):
    """Pointed leaf/petal from base (bx,by) pointing at angle ang (deg, 0 = right, -90 = up)."""
    a = math.radians(ang)
    tx, ty = bx + length * math.cos(a), by + length * math.sin(a)
    px, py = -math.sin(a), math.cos(a)
    mx, my = bx + length * 0.5 * math.cos(a), by + length * 0.5 * math.sin(a)
    c1 = (mx + px * width, my + py * width)
    c2 = (mx - px * width, my - py * width)
    return f'M{n(bx)} {n(by)}Q{n(c1[0])} {n(c1[1])} {n(tx)} {n(ty)}Q{n(c2[0])} {n(c2[1])} {n(bx)} {n(by)}Z'

def flame(cx, by, h, w):
    return (f'M{n(cx)} {n(by)}C{n(cx - w)} {n(by)} {n(cx - w * 0.9)} {n(by - h * 0.55)} {n(cx - w * 0.15)} {n(by - h)}'
            f'C{n(cx - w * 0.05)} {n(by - h * 0.6)} {n(cx + w * 0.55)} {n(by - h * 0.65)} {n(cx + w * 0.35)} {n(by - h * 0.3)}'
            f'C{n(cx + w * 0.9)} {n(by - h * 0.45)} {n(cx + w)} {n(by)} {n(cx)} {n(by)}Z')

def sector(cx, cy, r1, r2, a1, a2):
    A1, A2 = math.radians(a1), math.radians(a2)
    p = lambda r, a: (cx + r * math.cos(a), cy + r * math.sin(a))
    o1, o2, i2, i1 = p(r2, A1), p(r2, A2), p(r1, A2), p(r1, A1)
    large = 1 if abs(a2 - a1) > 180 else 0
    return (f'M{n(o1[0])} {n(o1[1])}A{n(r2)} {n(r2)} 0 {large} 1 {n(o2[0])} {n(o2[1])}L{n(i2[0])} {n(i2[1])}'
            f'A{n(r1)} {n(r1)} 0 {large} 0 {n(i1[0])} {n(i1[1])}Z')

def P(d, f='none', s='none', w=0, o=1, r='nonzero'):
    return {'d': d, 'f': f, 's': s, 'w': w, 'o': o, 'r': r}

def J(*parts):
    return ''.join(parts)

W = 390

# ---------------------------------------------------------------- trattoria
def trattoria():
    yf = lambda x: 30 + 9 * math.sin(x / 60)
    stem = poly([(x, yf(x)) for x in range(-10, 404, 4)], close=False)
    leaves, olives = [], []
    for i, x in enumerate(range(6, 390, 24)):
        up = i % 2 == 0
        leaves.append(leaf(x, yf(x), 22, 6, -40 if up else 40))
        if i % 3 == 1:
            olives.append(ellipse(x + 8, yf(x + 8) + 12, 4.5, 6, 20))
    top = {'h': 64, 'p': [P(stem, s='O2', w=2.2), P(J(*leaves), f='O'), P(J(*olives), f='O2')]}
    dl = [leaf(x, 14, 15, 4.5, -35 if i % 2 == 0 else 35) for i, x in enumerate(range(72, 168, 14))]
    div = {'p': [P('M60 14H180', s='O2', w=1.6), P(J(*dl), f='O'), P(J(ellipse(112, 22, 3.5, 4.5, 15), ellipse(130, 22, 3.5, 4.5, -15)), f='O2'), P(J(circle(52, 14, 2.5), circle(188, 14, 2.5)), f='A')]}
    return top, div, None, None

# ---------------------------------------------------------------- azulejo
def azulejo():
    tiles, lines, dia = [], [], []
    for i in range(-1, 8):
        x0 = 15 + i * 60
        cx, cy = x0 + 30, 30
        for dx, dy in ((9, 0), (-9, 0), (0, 9), (0, -9)):
            tiles.append(circle(cx + dx, cy + dy, 9))
        for qx, qy in ((x0, 0), (x0 + 60, 0), (x0, 60), (x0 + 60, 60)):
            tiles.append(circle(qx, qy, 14))
        for mx, my in ((x0 + 30, 2), (x0 + 30, 58), (x0 + 2, 30), (x0 + 58, 30)):
            dia.append(poly([(mx, my - 5), (mx + 5, my), (mx, my + 5), (mx - 5, my)]))
        lines.append(f'M{n(x0)} 0V60')
    centres = J(*[circle(15 + i * 60 + 30, 30, 4.5) for i in range(-1, 8)])
    top = {'h': 60, 'p': [P(rect(0, 0, W, 60), f='W'), P(J(*tiles), f='P'), P(centres, f='W'), P(J(*dia), f='O'), P(J(*lines, 'M0 0.5H390M0 59.5H390'), s='O', w=1)]}
    corner = {'p': [P(J(sector(0, 0, 0, 34, 0, 90)), f='P'), P(sector(0, 0, 22, 28, 0, 90), f='W'), P(J(circle(0, 0, 12)), f='O'), P(J(leaf(0, 0, 54, 7, 45)), f='P')]}
    div = {'p': [P('M40 14H96M144 14H200', s='O', w=1.5), P(poly([(120, 2), (132, 14), (120, 26), (108, 14)]), f='P'), P(J(circle(102, 14, 2.5), circle(138, 14, 2.5), circle(120, 14, 3)), f='O')]}
    return top, div, corner, None

# ---------------------------------------------------------------- papel picado
def papel():
    yf = lambda x: 8 + 13 * (1 - ((x - 195) / 200) ** 2)
    string = 'M-5 8Q195 34 395 8'
    cols = ['P', 'O', 'A', 'O2']
    flags = {c: [] for c in cols}
    for i in range(7):
        x0 = 9 + i * 56
        yt = yf(x0 + 23) + 1
        w, h = 46, 54
        pts = [(x0, yt), (x0 + w, yt), (x0 + w, yt + h)]
        steps = 6
        for k in range(steps, -1, -1):
            px = x0 + w * k / steps
            py = yt + h - (6 if k % 2 else 0)
            pts.append((px, py))
        outer = poly(pts)
        cx, cy = x0 + w / 2, yt + 24
        holes = [circle(cx, cy, 6)]
        for a in range(0, 360, 60):
            r = math.radians(a)
            holes.append(circle(cx + 12 * math.cos(r), cy + 12 * math.sin(r), 2.6))
        for k in range(4):
            tx = x0 + 6 + k * 10.5
            holes.append(poly([(tx, yt + 5), (tx + 7, yt + 5), (tx + 3.5, yt + 10)]))
        holes.append(poly([(cx - 11, yt + 41), (cx - 7, yt + 37), (cx - 3, yt + 41), (cx - 7, yt + 45)]))
        holes.append(poly([(cx + 3, yt + 41), (cx + 7, yt + 37), (cx + 11, yt + 41), (cx + 7, yt + 45)]))
        flags[cols[i % 4]].append(outer + J(*holes))
    top = {'h': 90, 'p': [P(string, s='ink', w=1.4)] + [P(J(*flags[c]), f=c, r='evenodd') for c in cols]}
    d = []
    for i, x in enumerate([84, 102, 120, 138, 156]):
        d.append((x, i))
    div = {'p': [P('M30 14H74M166 14H210', s='A', w=1.5),
                 P(J(poly([(84, 8), (90, 14), (84, 20), (78, 14)]), poly([(120, 6), (128, 14), (120, 22), (112, 14)]), poly([(156, 8), (162, 14), (156, 20), (150, 14)])), f='P'),
                 P(J(circle(102, 14, 3), circle(138, 14, 3)), f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- washi / Japanese
def washi():
    cx, cy, R = 318, 50, 36
    outer, inner = [], []
    for k in range(0, 61):
        u = k / 60
        a = math.radians(30 + u * 300)
        th = 2 + 10 * math.sin(math.pi * u) ** 0.8
        outer.append((cx + (R + th / 2) * math.cos(a), cy + (R + th / 2) * math.sin(a)))
        inner.append((cx + (R - th / 2) * math.cos(a), cy + (R - th / 2) * math.sin(a)))
    enso = poly(outer + inner[::-1])
    seal = rect(258, 70, 20, 20)
    seal_in = J(rect(262, 74, 12, 5), rect(262, 81, 5, 5), rect(269, 81, 5, 5))
    def row(yb, off):
        fills, strokes = [], []
        for i in range(-1, 18):
            x = i * 24 + off
            fills.append(f'M{n(x - 12)} {n(yb)}A12 12 0 0 1 {n(x + 12)} {n(yb)}Z')
            for r in (12, 8, 4):
                strokes.append(f'M{n(x - r)} {n(yb)}A{r} {r} 0 0 1 {n(x + r)} {n(yb)}')
        return J(*fills), J(*strokes)
    f1, s1 = row(100, 12)
    f2, s2 = row(112, 0)
    top = {'h': 110, 'p': [P(enso, f='O2'), P(seal, f='O'), P(seal_in, f='S'), P(f1, f='S'), P(s1, s='Pl', w=1.4), P(f2, f='S'), P(s2, s='Pl', w=1.4)]}
    up, lo = [], []
    for k in range(0, 41):
        u = k / 40
        x = 50 + 140 * u
        th = 1 + 6 * math.sin(math.pi * (u ** 0.7)) * (1 - 0.4 * u)
        y = 14 + 2 * math.sin(u * 5)
        up.append((x, y - th / 2)); lo.append((x, y + th / 2))
    div = {'p': [P(poly(up + lo[::-1]), f='O2'), P(circle(204, 14, 3.5), f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- red lantern / Chinese
def lantern():
    body, gold, ribs, tassel = [], [], [], []
    for x in (58, 332):
        gold.append(rect(x - 13, 18, 26, 8)); gold.append(rect(x - 13, 94, 26, 8))
        body.append(ellipse(x, 60, 31, 35))
        for rx in (11, 22):
            ribs.append(ellipse(x, 60, rx, 35))
        tassel.append(f'M{x} 0V18')
        for dx in (-5, -2.5, 0, 2.5, 5):
            tassel.append(f'M{n(x + dx * 0.4)} 106L{n(x + dx)} 126')
        gold.append(circle(x, 106, 3.5))
    cloud = []
    for (x, y, s) in ((170, 26, 1), (220, 26, -1), (195, 14, 1)):
        cloud.append(f'M{n(x - 14 * s)} {n(y + 6)}a14 14 0 1 {1 if s > 0 else 0} {n(14 * s)} -14a9 9 0 1 {1 if s > 0 else 0} {n(9 * s)} 9a4.5 4.5 0 1 {1 if s > 0 else 0} {n(-4.5 * s)} 4.5')
    top = {'h': 130, 'p': [P(J(*tassel), s='O2', w=1.4), P(J(*body), f='O'), P(J(*ribs), s='O2', w=1, o=0.8), P(J(*gold), f='O2'), P(J(*cloud), s='O2', w=2)]}
    corner = {'p': [P('M6 56V6H56M14 48V14H48M22 40V22H40V31H31', s='O2', w=2)]}
    div = {'p': [P('M20 14H86M154 14H220', s='O2', w=1.4),
                 P('M100 20a9 9 0 1 1 9 -9a5 5 0 1 1 -5 5M140 20a9 9 0 1 0 -9 -9a5 5 0 1 0 5 5', s='O2', w=1.8),
                 P(poly([(120, 8), (126, 14), (120, 20), (114, 14)]), f='O')]}
    return top, div, corner, None

# ---------------------------------------------------------------- meander / Greek
def meander():
    parts = ['M-10 3H400M-10 33H400']
    for x in range(-8, 400, 26):
        parts.append(f'M{x} 33V9H{x + 20}V27H{x + 8}V15H{x + 14}')
    top = {'h': 36, 'p': [P(J(*parts), s='P', w=2.6)]}
    lv = []
    for side in (-1, 1):
        for k in range(6):
            x = 120 + side * (12 + k * 12)
            y = 17 + (k * k) * 0.12
            base = 0 if side > 0 else 180
            lv.append(leaf(x, y, 11, 3.5, base + (-28 if k % 2 == 0 else 28)))
    div = {'p': [P('M44 18Q120 26 196 18', s='P', w=1.4), P(J(*lv), f='A')]}
    corner = {'p': [P('M4 56V4H56M12 48V12H48V36H24V24H36', s='P', w=2.4)]}
    return top, div, corner, None

# ---------------------------------------------------------------- toran / Indian
def toran():
    leaves, mari, centre = [], [], []
    for x in range(10, 390, 30):
        leaves.append(leaf(x, 8, 34, 7, 90))
    def marigold(x, y, r=8):
        out = [circle(x, y, r)]
        for a in range(0, 360, 45):
            t = math.radians(a)
            out.append(circle(x + r * math.cos(t), y + r * math.sin(t), r * 0.38))
        return J(*out)
    for x in range(25, 390, 30):
        mari.append(marigold(x, 12)); centre.append(circle(x, 12, 2.6))
    for x in (40, 195, 350):
        for k, y in enumerate((32, 50, 68)):
            mari.append(marigold(x, y, 6.5)); centre.append(circle(x, y, 2))
    top = {'h': 80, 'p': [P(J(*leaves), f='O2'), P('M-5 6Q195 14 395 6', s='O2', w=2), P(J(*mari), f='O'), P(J(*centre), f='A')]}
    m = []
    for a in range(0, 360, 30):
        m.append(leaf(150, 150, 46, 11, a))
    m2 = [circle(150 + 78 * math.cos(math.radians(a)), 150 + 78 * math.sin(math.radians(a)), 6) for a in range(0, 360, 20)]
    m3 = [leaf(150, 150, 118, 7, a + 7.5) for a in range(0, 360, 15)]
    behind = {'size': 300, 'top': -24, 'o': 0.12, 'p': [P(J(*m3), f='P'), P(J(*m), f='P'), P(J(*m2), f='P'), P(J(circle(150, 150, 22)), f='P'), P(circle(150, 150, 140), s='P', w=2)]}
    lot = [leaf(120, 22, 18, 5.5, a) for a in (-150, -120, -90, -60, -30)]
    div = {'p': [P('M40 22H96M144 22H200', s='O', w=1.5), P(J(*lot[0:2], *lot[3:5]), f='P'), P(lot[2], f='A'), P(J(circle(88, 22, 2.5), circle(152, 22, 2.5)), f='O')]}
    return top, div, None, behind

# ---------------------------------------------------------------- zellige arch
def zellige():
    stars_o, stars_o2, dia = [], [], []
    for i, x in enumerate(range(5, 400, 40)):
        s = J(rect(x - 10, 16, 20, 20), poly([(x, 12), (x + 14, 26), (x, 40), (x - 14, 26)]))
        (stars_o if i % 2 == 0 else stars_o2).append(s)
        dia.append(poly([(x + 20, 20), (x + 26, 26), (x + 20, 32), (x + 14, 26)]))
    top = {'h': 52, 'p': [P('M0 3H390M0 49H390', s='P', w=2), P(J(*stars_o), f='O'), P(J(*stars_o2), f='O2'), P(J(*[circle(int(x), 26, 3) for x in range(5, 400, 40)]), f='S'), P(J(*dia), f='P')]}
    outer = 'M40 300V130A130 130 0 0 1 150 1.6A130 130 0 0 1 260 130V300'
    inner = 'M50 300V130A120 120 0 0 1 150 11.7A120 120 0 0 1 250 130V300'
    behind = {'size': 330, 'top': -40, 'o': 0.55, 'p': [P(outer, s='P', w=2.5), P(inner, s='O2', w=1.2)]}
    sstar = J(rect(112, 6, 16, 16), poly([(120, 2.7), (131.3, 14), (120, 25.3), (108.7, 14)]))
    div = {'p': [P('M30 14H100M140 14H210', s='O2', w=1.4), P(sstar, f='P'), P(circle(120, 14, 3), f='S')]}
    return top, div, None, behind

# ---------------------------------------------------------------- iznik
def iznik():
    stems, leaves, red, blue, dots = [], [], [], [], []
    for i, x in enumerate(range(20, 400, 58)):
        stems.append(f'M{x} 84Q{x - 6} 62 {x} 44')
        leaves.append(leaf(x, 80, 30, 6, -140)); leaves.append(leaf(x, 74, 26, 5, -35))
        red.append(leaf(x, 44, 26, 7, -90))
        blue.append(leaf(x - 1, 46, 22, 6, -118)); blue.append(leaf(x + 1, 46, 22, 6, -62))
        dots.append(circle(x + 29, 22, 3)); dots.append(circle(x + 29, 60, 2))
    top = {'h': 84, 'p': [P(J(*stems), s='O2', w=2), P(J(*leaves), f='O2'), P(J(*blue), f='O'), P(J(*red), f='A'), P(J(*dots), f='O')]}
    div = {'p': [P('M120 26Q118 18 120 12', s='O2', w=1.6), P(J(leaf(120, 24, 34, 5, 180), leaf(120, 24, 34, 5, 0)), f='O2'),
                 P(J(leaf(119, 13, 14, 4.5, -120), leaf(121, 13, 14, 4.5, -60)), f='O'), P(leaf(120, 13, 15, 4.5, -90), f='A')]}
    return top, div, None, None

# ---------------------------------------------------------------- awning / French
def awning():
    pp, ww = [], []
    for i, x in enumerate(range(-15, 405, 30)):
        d = f'M{x} 0H{x + 30}V44A15 15 0 0 1 {x} 44Z'
        (pp if i % 2 == 0 else ww).append(d)
    top = {'h': 62, 'p': [P(J(*ww), f='W'), P(J(*pp), f='P'), P(rect(0, 0, W, 6), f='Pd'), P('M0 44H390', s='Pd', w=0.8, o=0.35)]}
    curl = ('M106 14C98 4 84 4 82 12C80 20 92 22 94 15'
            'M134 14C142 4 156 4 158 12C160 20 148 22 146 15')
    div = {'p': [P('M30 14H76M164 14H210', s='P', w=1.2), P(curl, s='P', w=1.6), P(poly([(120, 7), (127, 14), (120, 21), (113, 14)]), f='A')]}
    return top, div, None, None

# ---------------------------------------------------------------- doily / tea room
def doily():
    edge, holes = [rect(0, 0, W, 10)], []
    for x in range(0, 400, 20):
        edge.append(circle(x + 10, 10, 10)); holes.append(circle(x + 10, 13, 2.6))
    top = {'h': 24, 'p': [P(J(*edge), f='O2'), P(J(*holes), f='S')]}
    lace = [circle(150, 150, 118)] + [circle(150 + 118 * math.cos(math.radians(a)), 150 + 118 * math.sin(math.radians(a)), 11) for a in range(0, 360, 10)]
    h = [circle(150 + 102 * math.cos(math.radians(a)), 150 + 102 * math.sin(math.radians(a)), 4.5) for a in range(5, 365, 10)]
    h += [ellipse(150 + 82 * math.cos(math.radians(a)), 150 + 82 * math.sin(math.radians(a)), 9, 4, a) for a in range(0, 360, 20)]
    behind = {'size': 310, 'top': -36, 'o': 0.95, 'p': [P(J(*lace), f='O2'), P(J(*h), f='S'), P(circle(150, 150, 66), s='O', w=1.2)]}
    rose = J(circle(120, 14, 7.5))
    div = {'p': [P('M44 14H100M140 14H196', s='G', w=1.2), P(J(leaf(110, 15, 16, 4.5, 160), leaf(130, 15, 16, 4.5, 20), leaf(104, 14, 12, 3.5, -150), leaf(136, 14, 12, 3.5, -30)), f='G'),
                 P(rose, f='O'), P('M120 10a4 4 0 1 1 -3.6 5.8a2.4 2.4 0 1 1 2 -3', s='P', w=1.1)]}
    return top, div, None, behind

# ---------------------------------------------------------------- bierhalle
def bierhalle():
    d = []
    for row in range(-1, 3):
        for col in range(-1, 18):
            cx = col * 24 + (12 if row % 2 else 0)
            cy = row * 17
            d.append(poly([(cx, cy - 8.5), (cx + 12, cy), (cx, cy + 8.5), (cx - 12, cy)]))
    top = {'h': 34, 'p': [P(rect(0, 0, W, 34), f='W'), P(J(*d), f='O'), P('M0 32.5H390', s='P', w=3)]}
    cone = 'M120 4C128 4 132 12 130 18C128 24 122 27 120 28C118 27 112 24 110 18C108 12 112 4 120 4Z'
    scales = 'M112 11Q120 15 128 11M111 17Q120 21 129 17M114 23Q120 26 126 23'
    div = {'p': [P('M30 14H98M142 14H210', s='P', w=1.4), P(cone, f='G'), P(scales, s='S', w=1), P(leaf(130, 8, 14, 5, -20), f='G')]}
    return top, div, None, None

# ---------------------------------------------------------------- wycinanki / Polish folk
def wycinanki():
    cx, cy = 195, 56
    outer = J(*[leaf(cx, cy, 44, 13, a) for a in range(0, 360, 45)])
    mid = J(*[leaf(cx, cy, 30, 10, a + 22.5) for a in range(0, 360, 45)])
    side = []
    green = []
    heads_p, heads_a = [], []
    for x, s in ((100, -1), (290, 1)):
        green.append(f'M{x} 104Q{x + 4 * s} 80 {x} 58')
        green.append(leaf(x, 92, 24, 6, -90 - 50 * s)); green.append(leaf(x, 80, 22, 5, -90 + 50 * s))
        heads_p.append(J(leaf(x - 1, 60, 22, 7, -118), leaf(x + 1, 60, 22, 7, -62)))
        heads_a.append(leaf(x, 60, 24, 7, -90))
    for x in (50, 340):
        heads_a.append(J(*[leaf(x, 70, 14, 5, a) for a in range(0, 360, 60)]))
    for k in range(5):
        green.append(leaf(cx - 46 - k * 10, cy + 30 + k * 3, 16, 4.5, 160 - k * 6))
        green.append(leaf(cx + 46 + k * 10, cy + 30 + k * 3, 16, 4.5, 20 + k * 6))
    dots = J(*[circle(x, 106, 2.4) for x in range(7, 390, 14)])
    stems = [g for g in green if g.startswith('M') and 'Q' in g and 'Z' not in g]
    fills = [g for g in green if g not in stems]
    top = {'h': 110, 'p': [P(J(*stems), s='G', w=2.2), P(J(*fills), f='G'), P(outer, f='P'), P(mid, f='O'), P(J(*heads_p), f='P'), P(J(*heads_a), f='A'),
                           P(J(circle(cx, cy, 13)), f='A'), P(circle(cx, cy, 7), f='O'), P(circle(cx, cy, 2.6), f='W'), P(dots, f='A')]}
    flower = J(*[leaf(120, 14, 11, 4, a) for a in range(0, 360, 60)])
    div = {'p': [P('M40 14H100M140 14H200', s='G', w=1.4), P(J(leaf(100, 14, 14, 4, -150), leaf(140, 14, 14, 4, -30), leaf(100, 14, 14, 4, 150), leaf(140, 14, 14, 4, 30)), f='G'), P(flower, f='P'), P(circle(120, 14, 3), f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- kente
def kente():
    c = {k: [] for k in ('O', 'O2', 'P', 'A')}
    for i in range(11):
        x = i * 39 - 10
        if i % 2 == 0:
            for (y0, y1, k) in ((0, 12, 'O'), (12, 16, 'O2'), (16, 32, 'P'), (32, 36, 'O2'), (36, 48, 'O')):
                c[k].append(rect(x, y0, 39, y1 - y0))
        else:
            for j in range(6):
                c['A' if j % 2 == 0 else 'O'].append(rect(x + j * 6.5, 0, 6.5, 48))
            c['O2'].append(rect(x + 13, 18, 13, 12))
    top = {'h': 48, 'p': [P(J(*c[k]), f=k) for k in ('O', 'P', 'A', 'O2')]}
    behind = {'size': 300, 'top': -20, 'o': 0.09, 'p': [P(J(circle(150, 150, 124), circle(150, 150, 84), circle(150, 150, 44)), s='P', w=16), P(circle(150, 150, 14), f='P')]}
    rings = J(*[J(circle(x, 14, 9), circle(x, 14, 4.5)) for x in (96, 120, 144)])
    div = {'p': [P('M30 14H82M158 14H210', s='O', w=2), P(rings, s='P', w=2)]}
    return top, div, None, behind

# ---------------------------------------------------------------- temple / Thai
def temple():
    t1 = poly([(10, 120), (195, 26), (380, 120)])
    t2 = poly([(70, 120), (195, 58), (320, 120)])
    trim = 'M10 120L195 26L380 120M70 120L195 58L320 120M40 120L195 42L350 120'
    horns = ('M195 26C195 12 206 4 216 10'
             'M10 120C2 110 6 98 18 100M380 120C388 110 384 98 372 100'
             'M70 120C62 112 64 102 74 103M320 120C328 112 326 102 316 103')
    sun = J(circle(195, 96, 13))
    top = {'h': 120, 'p': [P(t1, f='Pd'), P(t2, f='P'), P(trim, s='O', w=2.4), P(horns, s='O', w=3), P(sun, f='O'), P(circle(195, 96, 7), s='Pd', w=2)]}
    bud = 'M120 4C128 12 128 20 120 26C112 20 112 12 120 4Z'
    div = {'p': [P('M40 22H100M140 22H200', s='O', w=1.5), P(J(leaf(118, 26, 16, 5, -150), leaf(122, 26, 16, 5, -30)), f='P'), P(bud, f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- bojagi
def bojagi():
    rs = [(0, 0, 70, 40, 'P'), (70, 0, 52, 40, 'O'), (122, 0, 90, 22, 'O2'), (122, 22, 90, 18, 'A'), (212, 0, 60, 40, 'W'),
          (272, 0, 60, 26, 'O2'), (272, 26, 60, 14, 'P'), (332, 0, 58, 40, 'A'),
          (0, 40, 40, 44, 'O2'), (40, 40, 84, 26, 'W'), (40, 66, 84, 18, 'O'), (124, 40, 46, 44, 'A'), (170, 40, 80, 44, 'P'),
          (250, 40, 50, 22, 'O'), (250, 62, 50, 22, 'O2'), (300, 40, 90, 44, 'W')]
    by = {}
    for x, y, w, h, k in rs:
        by.setdefault(k, []).append(rect(x, y, w, h))
    seams = J(*[rect(x + 1, y + 1, w - 2, h - 2) for x, y, w, h, k in rs])
    top = {'h': 84, 'p': [P(J(*v), f=k) for k, v in by.items()] + [P(seams, s='S', w=2)]}
    knot = 'M120 4L130 14L120 24L110 14ZM114 14H126M120 8V20'
    div = {'p': [P('M40 14H104M136 14H200', s='P', w=1.4), P(knot, s='P', w=1.8), P('M117 24L114 34M120 24V35M123 24L126 34', s='A', w=1.4)]}
    return top, div, None, None

# ---------------------------------------------------------------- lotus / Vietnamese
def lotus():
    def lily(cx, cy, r, notch):
        a1, a2 = math.radians(notch - 12), math.radians(notch + 12)
        p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
        p2 = (cx + r * math.cos(a2), cy + r * math.sin(a2))
        return f'M{n(cx)} {n(cy)}L{n(p2[0])} {n(p2[1])}A{n(r)} {n(r)} 0 1 1 {n(p1[0])} {n(p1[1])}Z'
    leaves = J(lily(58, 86, 36, -60), lily(150, 98, 20, -120))
    veins = J(*[f'M58 86L{n(58 + 30 * math.cos(math.radians(a)))} {n(86 + 30 * math.sin(math.radians(a)))}' for a in range(-30, 300, 40)])
    petals_out = J(*[leaf(304, 92, 50, 13, a) for a in (-160, -130, -50, -20)])
    petals_in = J(*[leaf(304, 92, 56, 14, a) for a in (-115, -90, -65)])
    bud = 'M206 30C214 40 214 52 206 60C198 52 198 40 206 30Z'
    stems = 'M206 60Q210 84 200 104M304 92V104'
    ripples = J(ellipse(110, 104, 40, 4), ellipse(330, 104, 50, 4))
    top = {'h': 104, 'p': [P(ripples, s='A', w=1, o=0.35), P(stems, s='O2', w=2.2), P(leaves, f='O2'), P(veins, s='S', w=1, o=0.5), P(petals_out, f='Ol'), P(petals_in, f='O'), P(bud, f='O')]}
    div = {'p': [P(rrect(46, 11, 148, 6, 3), f='O2'), P('M84 9V19M120 9V19M156 9V19', s='S', w=1.6), P(J(leaf(120, 12, 20, 4, -40), leaf(84, 12, 16, 3.5, -140)), f='O2')]}
    return top, div, None, None

# ---------------------------------------------------------------- copacabana
def copa():
    k = 2 * math.pi / 78
    def band(y0, y1):
        top_ = [(x, y0 + 11 * math.sin(k * x)) for x in range(-6, 400, 4)]
        bot = [(x, y1 + 11 * math.sin(k * x)) for x in range(-6, 400, 4)]
        return poly(top_ + bot[::-1])
    top = {'h': 64, 'p': [P(rect(0, 0, W, 64), f='O2'), P(J(band(2, 18), band(34, 50)), f='O')]}
    wave = poly([(x, 14 + 5 * math.sin(2 * math.pi * (x - 70) / 50)) for x in range(70, 171, 2)], close=False)
    div = {'p': [P(wave, s='P', w=3), P(J(circle(56, 14, 3), circle(184, 14, 3)), f='A')]}
    return top, div, None, None

# ---------------------------------------------------------------- andean weave
def andean():
    def stepped(cx, cy, k, s=4):
        pts = []
        for i in range(k + 1):
            pts += [(cx - i * s, cy - (k - i) * s), (cx - (i + 1) * s if i < k else cx - i * s, cy - (k - i) * s)]
        pts = []
        # build staircase diamond
        for i in range(k):
            pts += [(cx + i * s, cy - (k - i) * s), (cx + (i + 1) * s, cy - (k - i) * s)]
        for i in range(k):
            pts += [(cx + (k - i) * s, cy + i * s), (cx + (k - i) * s, cy + (i + 1) * s)]
        for i in range(k):
            pts += [(cx - i * s, cy + (k - i) * s), (cx - (i + 1) * s, cy + (k - i) * s)]
        for i in range(k):
            pts += [(cx - (k - i) * s, cy - i * s), (cx - (k - i) * s, cy - (i + 1) * s)]
        return poly(pts)
    big_o, big_w, small = [], [], []
    for i, x in enumerate(range(0, 410, 36)):
        (big_o if i % 2 == 0 else big_w).append(stepped(x, 28, 4))
        small.append(stepped(x, 28, 2))
    teeth = J(*[poly([(x, 12), (x + 6, 12), (x + 3, 17)]) for x in range(0, 390, 9)], *[poly([(x, 44), (x + 6, 44), (x + 3, 39)]) for x in range(4, 390, 9)])
    top = {'h': 56, 'p': [P(rect(0, 0, W, 6), f='P'), P(rect(0, 6, W, 3), f='O2'), P(rect(0, 9, W, 3), f='O'), P(rect(0, 12, W, 32), f='A'),
                          P(teeth, f='O'), P(J(*big_o), f='O'), P(J(*big_w), f='W'), P(J(*small), f='P'),
                          P(rect(0, 44, W, 3), f='O'), P(rect(0, 47, W, 3), f='O2'), P(rect(0, 50, W, 6), f='P')]}
    chak = 'M114 2H126V8H132V14H138V26H132V32H126V38H114V32H108V26H102V14H108V8H114Z'
    chak = 'M114 1H126V7H132V13H138V25H132V31H126V37H114V31H108V25H102V13H108V7H114Z'
    div = {'p': [P('M30 19H96M144 19H210', s='O', w=1.5), P(chak, f='P'), P(circle(120, 19, 4), f='S')]}
    return top, div, None, None

# ---------------------------------------------------------------- island / Caribbean
def island():
    sun = f'M176 104A64 64 0 0 1 304 104Z'
    gaps = J(rect(170, 72, 140, 4), rect(170, 84, 140, 5), rect(170, 95, 140, 6))
    k = 2 * math.pi / 60
    w1 = poly([(x, 100 + 4 * math.sin(k * x)) for x in range(-4, 396, 4)] + [(392, 120), (-4, 120)])
    w2 = poly([(x, 110 + 3 * math.sin(k * x + 1.5)) for x in range(-4, 396, 4)] + [(392, 120), (-4, 120)])
    trunk = 'M58 112C62 84 66 60 82 36'
    fronds = J(*[leaf(82, 36, 54, 9, a) for a in (-170, -140, -105, -60, -25, 10)])
    top = {'h': 120, 'p': [P(sun, f='O'), P(gaps, f='S'), P(trunk, s='X', w=6), P(fronds, f='Y'), P(w1, f='O2'), P(w2, f='P', o=0.85)]}
    wave = poly([(x, 18 + 3.5 * math.sin(2 * math.pi * (x - 60) / 30)) for x in range(60, 181, 2)], close=False)
    div = {'p': [P('M108 12A12 12 0 0 1 132 12Z', f='O'), P(wave, s='O2', w=2.4)]}
    return top, div, None, None

# ---------------------------------------------------------------- flamenco
def flamenco():
    r2 = [rect(0, 0, W, 24)] + [circle(x, 24, 14) for x in range(-15, 410, 30)]
    r1 = [rect(0, 0, W, 12)] + [circle(x, 12, 16) for x in range(0, 410, 30)]
    rnd = random.Random(7)
    dots = J(*[circle(x + rnd.uniform(-2, 2), y, 2.4) for y in (6, 16) for x in range(5 + (y % 2) * 8, 390, 16)])
    top = {'h': 50, 'p': [P(J(*r2), f='O'), P(J(*r1), f='P'), P(dots, f='W')]}
    fan = J(*[f'M120 24L{n(120 + 18 * math.cos(math.radians(a)))} {n(24 - 18 * math.sin(math.radians(a)))}' for a in range(15, 170, 15)])
    div = {'p': [P('M30 18H94M146 18H210', s='P', w=1.4), P('M102 24A18 18 0 0 1 138 24Z', f='P'), P(fan, s='S', w=1), P(circle(120, 24, 2.6), f='A')]}
    return top, div, None, None

# ---------------------------------------------------------------- diner
def diner():
    sq = []
    for col in range(0, 33):
        for row in range(2):
            if (col + row) % 2 == 0:
                sq.append(rect(col * 12, row * 12, 12, 12))
    top = {'h': 24, 'p': [P(rect(0, 0, W, 24), f='W'), P(J(*sq), f='O2')]}
    behind = {'size': 330, 'top': -10, 'o': 1, 'p': [P(rrect(14, 64, 272, 164, 46), s='O', w=6), P(rrect(24, 74, 252, 144, 38), s='Od', w=1.5),
              P(J(star(34, 40, 13, 5.5), star(266, 40, 13, 5.5), star(56, 22, 6, 2.5), star(244, 22, 6, 2.5)), f='A')]}
    div = {'p': [P('M30 14H100M140 14H210', s='A', w=2), P(star(120, 14, 10, 4.2), f='P'), P(J(circle(108, 14, 2), circle(132, 14, 2)), f='A')]}
    return top, div, None, behind

# ---------------------------------------------------------------- pub
def pub():
    top = {'h': 14, 'p': [P('M0 3H390M0 9H390', s='O', w=1.2)]}
    corner = {'p': [P('M4 4H40A4 4 0 0 1 40 12H12V40A4 4 0 0 1 4 40Z', f='O'), P(J(circle(9, 9, 2)), f='Od')]}
    div = {'p': [P('M24 11H104M136 11H216M24 17H104M136 17H216', s='O', w=1), P(poly([(120, 6), (128, 14), (120, 22), (112, 14)]), f='O')]}
    return top, div, corner, None

# ---------------------------------------------------------------- pizzeria
def pizzeria():
    cx, cy = 195, 132
    bricks_a, bricks_b = [], []
    for i in range(13):
        a1 = 180 + i * 180 / 13 + 1
        a2 = 180 + (i + 1) * 180 / 13 - 1
        (bricks_a if i % 2 == 0 else bricks_b).append(sector(cx, cy, 84, 112, a1, a2))
    mouth = f'M{cx - 82} {cy}A82 82 0 0 1 {cx + 82} {cy}Z'
    flames_o = J(flame(195, 132, 56, 26), flame(160, 132, 36, 18), flame(230, 132, 38, 18))
    flames_y = J(flame(195, 132, 32, 14), flame(162, 132, 20, 9), flame(228, 132, 21, 9))
    side = J(rect(0, 120, 83, 12), rect(307, 120, 83, 12))
    top = {'h': 132, 'p': [P(J(*bricks_a), f='P'), P(J(*bricks_b), f='Pd'), P(mouth, f='O2'), P(flames_o, f='X'), P(flames_y, f='Y'), P(side, f='Pd')]}
    div = {'p': [P('M30 14H98M142 14H210', s='G', w=1.4), P(J(leaf(114, 14, 18, 6, -160), leaf(126, 14, 18, 6, -20)), f='G'), P(circle(120, 15, 6), f='P')]}
    return top, div, None, None

# ---------------------------------------------------------------- ice cream drip
def icecream():
    rnd = random.Random(3)
    pts = 'M0 0H390V30'
    x = 390
    drips = [(360, 14, 22), (322, 18, 34), (282, 12, 16), (240, 20, 42), (196, 14, 24), (156, 18, 30), (112, 12, 18), (72, 20, 38), (30, 14, 22)]
    d = 'M0 0H390V28'
    for (dx, w, l) in drips:
        r = w / 2
        d += f'L{n(dx + r)} 28V{n(28 + l)}A{n(r)} {n(r)} 0 0 1 {n(dx - r)} {n(28 + l)}V28'
    d += 'L0 28Z'
    spr = {k: [] for k in ('W', 'O', 'O2', 'A')}
    keys = list(spr.keys())
    for i in range(46):
        sx, sy = rnd.uniform(6, 384), rnd.uniform(5, 23)
        spr[keys[i % 4]].append(rrect(sx, sy, 9, 3, 1.5).replace('M', 'M', 1))
    # rotate sprinkles by using ellipses instead (simple & round-ended)
    spr = {k: [] for k in keys}
    for i in range(46):
        sx, sy = rnd.uniform(6, 384), rnd.uniform(5, 23)
        spr[keys[i % 4]].append(ellipse(sx, sy, 4.5, 1.6, rnd.uniform(0, 180)))
    top = {'h': 76, 'p': [P(d, f='P')] + [P(J(*spr[k]), f=k) for k in keys]}
    cone = 'M112 12L120 27L128 12Z'
    div = {'p': [P('M40 14H100M140 14H200', s='P', w=1.6, o=0.5), P(cone, f='X'), P('M114 15L124 15M116 19L122 19', s='S', w=0.8), P(circle(120, 10, 7), f='P'),
                 P(J(ellipse(70, 8, 4, 1.4, 30), ellipse(170, 20, 4, 1.4, -30)), f='A'), P(J(ellipse(84, 20, 4, 1.4, -40), ellipse(156, 8, 4, 1.4, 40)), f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- café kraft
def cafe():
    ring1 = J(circle(326, 46, 34), circle(326, 46, 29.5))
    ring2 = J(circle(276, 74, 18), circle(276, 74, 15))
    steam = 'M44 70C38 60 50 54 44 44C38 34 50 28 44 18M58 70C52 60 64 54 58 44C52 34 64 28 58 18'
    cup = 'M30 74H74V84A12 12 0 0 1 62 96H42A12 12 0 0 1 30 84ZM74 78A7 7 0 0 1 74 92'
    top = {'h': 96, 'p': [P(ring1, f='X', o=0.22, r='evenodd'), P(ring2, f='X', o=0.16, r='evenodd'), P(steam, s='P', w=2, o=0.6), P(cup, s='P', w=2.2)]}
    def bean(x, y, a):
        return ellipse(x, y, 8, 5.5, a)
    div = {'p': [P('M30 14H96M144 14H210', s='P', w=1.4, o=0.6), P(J(bean(110, 14, 25), bean(130, 14, -25)), f='P'),
                 P('M104 11Q110 14 116 17M136 11Q130 14 124 17', s='S', w=1.2)]}
    return top, div, None, None

# ---------------------------------------------------------------- bakery wheat
def bakery():
    edge = [rect(0, 0, W, 8)] + [circle(x, 8, 8) for x in range(8, 400, 16)]
    stalks = 'M168 94L222 22M222 94L168 22'
    grains = []
    for (x0, y0, x1, y1) in ((168, 94, 222, 22), (222, 94, 168, 22)):
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
        for k in range(6):
            t = 0.5 + k * 0.09
            gx, gy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            grains.append(leaf(gx, gy, 13, 3.6, ang - 32)); grains.append(leaf(gx, gy, 13, 3.6, ang + 32))
        grains.append(leaf(x0 + (x1 - x0) * 0.98, y0 + (y1 - y0) * 0.98, 12, 3.4, ang))
    bow = J(poly([(195, 58), (182, 50), (182, 66)]), poly([(195, 58), (208, 50), (208, 66)]), circle(195, 58, 3.5))
    top = {'h': 96, 'p': [P(J(*edge), f='P'), P(stalks, s='O', w=2), P(J(*grains), f='O'), P(bow, f='A')]}
    g = []
    for k in range(5):
        x = 100 + k * 9
        g.append(leaf(x, 14, 11, 3.2, -35)); g.append(leaf(x, 14, 11, 3.2, 35))
    g.append(leaf(146, 14, 11, 3.2, 0))
    div = {'p': [P('M40 14H150', s='O', w=1.6), P(J(*g), f='O')]}
    return top, div, None, None

# ---------------------------------------------------------------- art deco
def deco():
    rays = []
    for i in range(13):
        if i % 2:
            continue
        a1, a2 = 180 + i * 180 / 13, 180 + (i + 1) * 180 / 13
        rays.append(sector(195, 110, 30, 104, a1, a2))
    arcs = 'M147 110A48 48 0 0 1 243 110M129 110A66 66 0 0 1 261 110'
    steps = 'M20 100H120M40 90H120M60 80H120M270 100H370M270 90H350M270 80H330'
    top = {'h': 110, 'p': [P(J(*rays), f='O', o=0.85), P(arcs, s='O', w=1.6), P('M171 110A24 24 0 0 1 219 110Z', f='O'), P(steps, s='O', w=1.4)]}
    corner = {'p': [P('M4 56V4H56M10 50V10H50M16 34V16H34', s='O', w=1.4)]}
    div = {'p': [P('M40 14H100M140 14H200M56 9H100M140 9H184M56 19H100M140 19H184', s='O', w=1), P(poly([(120, 4), (130, 14), (120, 24), (110, 14)]), f='O'), P(poly([(120, 9), (125, 14), (120, 19), (115, 14)]), f='S')]}
    return top, div, corner, None

# ---------------------------------------------------------------- smokehouse
def smokehouse():
    rope = J(*[ellipse(x, 9, 6.5, 3.2, 35) for x in range(-4, 396, 8)])
    stars = J(star(60, 40, 12, 5), star(195, 38, 14, 5.8), star(330, 40, 12, 5))
    top = {'h': 56, 'p': [P(rope, f='X', s='K', w=0.6), P(stars, f='A'), P('M80 40H170M220 40H310', s='A', w=1.2, o=0.6)]}
    behind = {'size': 300, 'top': -16, 'o': 0.22, 'p': [P(circle(150, 150, 124), s='P', w=5), P(circle(150, 150, 112), s='P', w=1.6),
              P(J(*[star(150 + 118 * math.cos(math.radians(a)), 150 + 118 * math.sin(math.radians(a)), 6, 2.5) for a in range(-90, 270, 45)]), f='P')]}
    div = {'p': [P(J(*[ellipse(x, 14, 5, 2.4, 35) for x in range(36, 104, 6)], *[ellipse(x, 14, 5, 2.4, 35) for x in range(140, 208, 6)]), f='X'), P(star(120, 14, 10, 4.2), f='A')]}
    return top, div, None, behind

# ---------------------------------------------------------------- bubble tea
def bubbletea():
    k = 2 * math.pi / 90
    surface = poly([(0, 0), (390, 0)] + [(x, 52 + 6 * math.sin(k * x)) for x in range(390, -4, -4)])
    rnd = random.Random(11)
    pearls = J(*[circle(rnd.uniform(8, 382), rnd.uniform(16, 44), rnd.uniform(4, 7)) for _ in range(26)])
    hi = J(*[circle(rnd.uniform(8, 382), rnd.uniform(14, 44), 1.4) for _ in range(20)])
    bubbles = J(*[circle(rnd.uniform(10, 380), rnd.uniform(62, 92), rnd.uniform(3, 7)) for _ in range(14)])
    top = {'h': 96, 'p': [P(surface, f='O'), P(pearls, f='O2'), P(hi, f='W', o=0.6), P(bubbles, s='P', w=1.6, o=0.55)]}
    div = {'p': [P('M40 14H96M144 14H200', s='P', w=1.6, o=0.5), P(J(circle(104, 14, 6), circle(120, 14, 6), circle(136, 14, 6)), f='O2')]}
    return top, div, None, None

ORNAMENTS = {
    'trattoria': trattoria, 'azulejo': azulejo, 'papel': papel, 'washi': washi, 'lantern': lantern, 'meander': meander,
    'toran': toran, 'zellige': zellige, 'iznik': iznik, 'awning': awning, 'doily': doily, 'bierhalle': bierhalle,
    'wycinanki': wycinanki, 'kente': kente, 'temple': temple, 'bojagi': bojagi, 'lotus': lotus, 'copa': copa,
    'andean': andean, 'island': island, 'flamenco': flamenco, 'diner': diner, 'pub': pub, 'pizzeria': pizzeria,
    'icecream': icecream, 'cafe': cafe, 'bakery': bakery, 'deco': deco, 'smokehouse': smokehouse, 'bubbletea': bubbletea,
}
