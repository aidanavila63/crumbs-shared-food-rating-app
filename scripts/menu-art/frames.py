# Full-page designs for build-your-own menus: a whole composition (frame lines, corner
# ornaments, a crest over the name, dividers, side or bottom illustrations) that stretches to any
# menu length. Lines are CSS (see "rules"), ornaments are SVG pieces mirrored into each corner.
# Colour keys: P = primary (frame and headings), A = accent, S = background, or fixed #hex.
import math, random
from ornaments import P, J, circle, ellipse, leaf, poly, star, rect, rrect, n

# ---------------------------------------------------------------- drawing helpers
def bez(p0, p1, p2, p3, k=24):
    out = []
    for i in range(k + 1):
        t = i / k
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out

def spiral(cx, cy, r0, r1, a0, turns, cw=True, k=40):
    out = []
    for i in range(k + 1):
        u = i / k
        a = math.radians(a0 + (1 if cw else -1) * 360 * turns * u)
        r = r0 + (r1 - r0) * u
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out

def taper(pts, w0=0.6, wm=3.2, w1=0.4):
    """Calligraphic stroke: thin → thick → thin along the points, as a filled shape."""
    left, right = [], []
    m = len(pts) - 1
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(m, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        u = i / m
        w = (w0 + (wm - w0) * math.sin(math.pi * min(1, u * 1.6)) if u < 0.6 else wm + (w1 - wm) * ((u - 0.6) / 0.4)) / 2
        left.append((x + nx * w, y + ny * w)); right.append((x - nx * w, y - ny * w))
    return poly(left + right[::-1])

def line(pts):
    return poly(pts, close=False)

def refl(pts):  # mirror over the corner diagonal (x <-> y)
    return [(y, x) for x, y in pts]

def mirror_x(pts, cx):
    return [(2 * cx - x, y) for x, y in pts]

def leaf_outline(bx, by, length, width, ang, veins=4):
    a = math.radians(ang)
    tx, ty = bx + length * math.cos(a), by + length * math.sin(a)
    px, py = -math.sin(a), math.cos(a)
    mx, my = bx + length * 0.45 * math.cos(a), by + length * 0.45 * math.sin(a)
    c1 = (mx + px * width, my + py * width); c2 = (mx - px * width, my - py * width)
    d = f'M{n(bx)} {n(by)}Q{n(c1[0])} {n(c1[1])} {n(tx)} {n(ty)}Q{n(c2[0])} {n(c2[1])} {n(bx)} {n(by)}Z'
    d += f'M{n(bx)} {n(by)}L{n(tx)} {n(ty)}'
    for k in range(1, veins + 1):
        t = k / (veins + 1)
        cx, cy = bx + (tx - bx) * t, by + (ty - by) * t
        span = width * 0.75 * math.sin(math.pi * t)
        for s in (1, -1):
            ex = cx + (px * s) * span + math.cos(a) * length * 0.09
            ey = cy + (py * s) * span + math.sin(a) * length * 0.09
            d += f'M{n(cx)} {n(cy)}L{n(ex)} {n(ey)}'
    return d

def piece(view, paths, size=None):
    d = {'v': view, 'p': paths}
    if size: d['size'] = size
    return d

def rules(*rs):
    """Each rule: off (px in from the page edge), w (px), style (solid/double/dotted/dashed), gap (px kept clear at
    each corner; negative = lines run past each other), mid (px gap in the middle of top and bottom), box (one
    rounded rectangle instead of four lines), radius, tilt (deg, for hand-drawn boxes)."""
    out = []
    for r in rs:
        d = {'off': 0, 'w': 1.5, 'style': 'solid', 'gap': 0, 'mid': 0, 'box': False, 'radius': 0, 'tilt': 0, 'key': 'P'}
        d.update(r)
        out.append(d)
    return out

# ---------------------------------------------------------------- 1 flourish corners
def flourish_corner():
    # top edge scroll, mirrored onto the left edge
    s1 = bez((16, 16), (40, 2), (78, 2), (102, 14)) + spiral(98, 24, 10, 2, -90 + 30, 1.25)[1:]
    s2 = bez((16, 16), (30, 26), (44, 22), (52, 12)) + spiral(56, 18, 6, 1.5, -150, 1.1)[1:]
    parts = [taper(s1, 0.5, 3.6, 0.4), taper(refl(s1), 0.5, 3.6, 0.4), taper(s2, 0.4, 2.4, 0.3), taper(refl(s2), 0.4, 2.4, 0.3)]
    leaves = [leaf(20, 20, 30, 8, 45), leaf(22, 22, 18, 5, 15), leaf(22, 22, 18, 5, 75)]
    dots = [circle(6, 6, 2.6), circle(116, 13, 1.8), circle(13, 116, 1.8), circle(46, 46, 2.2)]
    return piece(120, [P(J(*parts), f='P'), P(J(*leaves), f='P'), P(J(*dots), f='P')])

def flourish_crest():
    right = bez((120, 46), (138, 30), (170, 22), (196, 32)) + spiral(194, 42, 10, 2, -80, 1.2)[1:]
    small = bez((120, 46), (132, 54), (150, 56), (160, 48)) + spiral(158, 42, 6, 1.5, 30, 1.0, cw=False)[1:]
    parts = [taper(right, 0.5, 3.4, 0.4), taper(mirror_x(right, 120), 0.5, 3.4, 0.4), taper(small, 0.4, 2.2, 0.3), taper(mirror_x(small, 120), 0.4, 2.2, 0.3)]
    fleur = [leaf(120, 44, 30, 7, -90), leaf(118, 44, 20, 6, -130), leaf(122, 44, 20, 6, -50), poly([(120, 48), (126, 54), (120, 60), (114, 54)])]
    return piece('0 0 240 64', [P(J(*parts), f='P'), P(J(*fleur), f='P'), P(J(circle(84, 30, 2), circle(156, 30, 2)), f='P')])

def flourish_div():
    r = bez((128, 14), (150, 4), (176, 6), (186, 14)) + spiral(184, 20, 5, 1, -60, 1)[1:]
    return piece('0 0 240 28', [P(J(taper(r, 0.4, 2.2, 0.3), taper(mirror_x(r, 120), 0.4, 2.2, 0.3)), f='P'),
                                P(poly([(120, 7), (127, 14), (120, 21), (113, 14)]), f='A'), P('M20 14H100M140 14H220', s='P', w=0.8, o=0.6)])

# ---------------------------------------------------------------- 2 filigree crest (rules with diamond corners)
def filigree_corner():
    sq = J(rect(4, 4, 18, 18))
    sq2 = J(rect(9, 9, 8, 8))
    curl = taper(spiral(36, 13, 8, 1.5, 180, 1.2), 0.4, 1.8, 0.3)
    curl2 = taper(refl(spiral(36, 13, 8, 1.5, 180, 1.2)), 0.4, 1.8, 0.3)
    return piece(60, [P(sq, s='P', w=1.2), P(sq2, f='P'), P(J(curl, curl2), f='P')])

def filigree_crest():
    sc = []
    for s in (1, -1):
        a = bez((120, 70), (120 + 26 * s, 64), (120 + 30 * s, 40), (120 + 48 * s, 36)) + spiral(120 + 56 * s, 42, 9, 1.8, 200 if s > 0 else -20, 1.15, cw=(s > 0))[1:]
        b = bez((120 + 10 * s, 74), (120 + 50 * s, 78), (120 + 80 * s, 66), (120 + 92 * s, 52)) + spiral(120 + 86 * s, 46, 7, 1.5, 30 if s > 0 else 150, 1.1, cw=(s < 0))[1:]
        sc += [taper(a, 0.5, 3, 0.3), taper(b, 0.4, 2.4, 0.3)]
        sc.append(leaf(120 + 18 * s, 54, 18, 5, -90 - 40 * s))
    crown = [leaf(120, 64, 40, 8, -90), circle(120, 20, 3), leaf(120, 58, 22, 5, -125), leaf(120, 58, 22, 5, -55)]
    return piece('0 0 240 84', [P(J(*sc), f='P'), P(J(*crown), f='P'), P('M24 82H216', s='P', w=1)])

def filigree_div():
    return piece('0 0 240 28', [P('M24 14H104M136 14H216', s='P', w=1), P(poly([(120, 6), (128, 14), (120, 22), (112, 14)]), s='P', w=1.2), P(circle(120, 14, 2.2), f='P')])

# ---------------------------------------------------------------- 3 botanical line leaves (two corners)
def botanical_corner():
    stem = bez((0, 0), (40, 30), (70, 60), (96, 110))
    ls = [leaf_outline(24, 18, 120, 22, 18, 5), leaf_outline(46, 40, 150, 26, 40, 6), leaf_outline(66, 66, 110, 20, 72, 4), leaf_outline(80, 86, 70, 14, 100, 3)]
    return piece(220, [P(line(stem), s='P', w=1.2), P(J(*ls), s='P', w=1)])

def botanical_div():
    return piece('0 0 240 28', [P('M30 14H210', s='P', w=0.8, o=0.7), P(J(leaf_outline(120, 14, 22, 5, -150, 2), leaf_outline(120, 14, 22, 5, -30, 2)), s='P', w=0.9)])

# ---------------------------------------------------------------- 4 architect lines
def architect_corner():
    return piece(60, [P(J(circle(14, 14, 2.6), circle(22, 22, 2.6)), f='A')])

def architect_div():
    return piece('0 0 240 28', [P('M70 14H170', s='P', w=1), P(circle(120, 14, 3), f='A')])

# ---------------------------------------------------------------- 5 art nouveau arch (top strip + bottom corners)
def nouveau_top():
    l = bez((0, 78), (60, 70), (110, 14), (195, 10))
    whip = bez((10, 96), (70, 92), (90, 40), (150, 34)) + spiral(152, 44, 9, 2, -90, 1.2)[1:]
    lily = [leaf(195, 38, 34, 8, -90), leaf(193, 38, 28, 8, -125), leaf(197, 38, 28, 8, -55), circle(195, 42, 4)]
    parts = [taper(l, 0.6, 2.6, 1.2), taper(mirror_x(l, 195), 0.6, 2.6, 1.2), taper(whip, 0.5, 2.6, 0.4), taper(mirror_x(whip, 195), 0.5, 2.6, 0.4)]
    buds = [leaf(60, 72, 16, 5, -120), leaf(330, 72, 16, 5, -60), leaf(100, 46, 14, 4, -150), leaf(290, 46, 14, 4, -30)]
    return piece('0 0 390 100', [P(J(*parts), f='P'), P(J(*lily), f='A'), P(J(*buds), f='P')], size=100)

def nouveau_corner():
    s = bez((10, 110), (10, 60), (30, 30), (70, 22)) + spiral(76, 32, 10, 2, -100, 1.25)[1:]
    return piece(120, [P(J(taper(s, 0.5, 2.8, 0.4)), f='P'), P(J(leaf(16, 84, 22, 6, -40), leaf(26, 50, 18, 5, -20)), f='P')])

def nouveau_div():
    w = bez((60, 18), (90, 2), (110, 26), (120, 12))
    return piece('0 0 240 28', [P(J(taper(w, 0.4, 2, 0.4), taper(mirror_x(w, 120), 0.4, 2, 0.4)), f='P'), P(circle(120, 10, 3), f='A')])

# ---------------------------------------------------------------- 6 art deco frame
def deco_corner():
    steps = 'M4 76V4H76M12 64V12H64M20 50V20H50M28 38V28H38'
    fan = J(*[f'M4 4L{n(4 + 30 * math.cos(math.radians(a)))} {n(4 + 30 * math.sin(math.radians(a)))}' for a in range(10, 90, 16)])
    return piece(80, [P(steps, s='P', w=1.4), P(fan, s='A', w=1, o=0.8)])

def deco_crest():
    rays = J(*[f'M120 60L{n(120 + 54 * math.cos(math.radians(a)))} {n(60 - 54 * math.sin(math.radians(a)))}' for a in range(15, 170, 15)])
    return piece('0 0 240 64', [P(rays, s='P', w=1), P('M66 60A54 54 0 0 1 174 60M88 60A32 32 0 0 1 152 60', s='P', w=1.2), P('M96 60A24 24 0 0 1 144 60Z', f='A'), P('M10 60H230', s='P', w=1.2)])

def deco_div():
    return piece('0 0 240 28', [P('M30 14H100M140 14H210M50 9H100M140 9H190M50 19H100M140 19H190', s='P', w=0.9), P(poly([(120, 4), (130, 14), (120, 24), (110, 14)]), f='A')])

# ---------------------------------------------------------------- 7 laurel crest
def laurel_branch(cx, cy, r, a0, a1, side):
    out = []
    pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 2)]
    stem = line(pts)
    for i, a in enumerate(range(a0 + 6, a1 - 2, 12)):
        x, y = cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))
        tang = a + (90 if side > 0 else -90)
        out.append(leaf(x, y, 15, 4.5, tang - 32 * side))
        out.append(leaf(x, y, 15, 4.5, tang + 30 * side + (180 if False else 0)))
    return stem, out

def laurel_crest():
    s1, l1 = laurel_branch(120, 10, 92, 100, 170, -1)
    s2, l2 = laurel_branch(120, 10, 92, 10, 80, 1)
    return piece('0 0 240 110', [P(J(s1, s2), s='P', w=1.4), P(J(*l1, *l2), f='P'), P(J(circle(120, 104, 3)), f='A')])

def laurel_div():
    lv = [leaf(120 + s * (8 + k * 10), 14, 10, 3, (0 if s > 0 else 180) + (-30 if k % 2 else 30)) for s in (1, -1) for k in range(5)]
    return piece('0 0 240 28', [P('M64 14H176', s='P', w=1), P(J(*lv), f='P')])

# ---------------------------------------------------------------- 8 cartouche (concave corners, side brackets)
def cartouche_corner():
    return piece(60, [P('M0 24A24 24 0 0 0 24 0M0 32A32 32 0 0 0 32 0', s='P', w=1.4), P(circle(9, 9, 3), f='A')])

def cartouche_mid():
    s = bez((30, 14), (30, 4), (44, 4), (44, 12)) + spiral(40, 14, 4, 1, 0, 1)[1:]
    return piece('0 0 60 28', [P(rect(10, 0, 40, 28), f='S'), P(J(taper(s, 0.4, 2, 0.3), taper(mirror_x(s, 30), 0.4, 2, 0.3)), f='P'), P(poly([(30, 14), (34, 20), (30, 26), (26, 20)]), f='A')])

def cartouche_crest():
    shape = 'M70 50C70 26 92 14 120 14C148 14 170 26 170 50C170 60 160 64 150 60M70 50C70 60 80 64 90 60'
    return piece('0 0 240 70', [P(shape, s='P', w=1.4), P(J(circle(150, 56, 3), circle(90, 56, 3)), f='P'), P(poly([(120, 22), (126, 30), (120, 38), (114, 30)]), f='A')])

# ---------------------------------------------------------------- 9 citrus (illustrated, two corners)
def citrus_corner():
    branch = bez((0, 6), (40, 14), (70, 30), (110, 60))
    lvs = [leaf(30, 12, 34, 9, -20), leaf(52, 22, 36, 10, 60), leaf(76, 38, 30, 8, -10), leaf(92, 50, 28, 8, 80), leaf(18, 8, 24, 7, 70)]
    lemons = [ellipse(64, 52, 15, 11, 30), ellipse(104, 78, 13, 10, 50)]
    shine = [ellipse(60, 48, 4, 2, 30), ellipse(100, 74, 3.5, 1.8, 50)]
    blossom = J(*[leaf(30, 46, 7, 3, a) for a in range(0, 360, 72)])
    return piece(140, [P(line(branch), s='#6B4F2A', w=2.4), P(J(*lvs), f='#4F7A3A'), P(J(*lemons), f='#F2C94C'), P(J(*shine), f='#FFFFFF', o=0.7), P(blossom, f='#FFFFFF', s='#D9C9A0', w=0.5), P(circle(30, 46, 2), f='#E0A82E')])

def citrus_div():
    return piece('0 0 240 28', [P('M40 14H96M144 14H200', s='P', w=1), P(J(leaf(114, 14, 12, 4, -150), leaf(126, 14, 12, 4, -30)), f='#4F7A3A'), P(ellipse(120, 15, 6, 5), f='#F2C94C')])

# ---------------------------------------------------------------- 10 herb garden (bottom strip)
def herbs_bottom():
    rnd = random.Random(5)
    stems, needles, basil, thyme = [], [], [], []
    for x0, h, lean in ((40, 70, 8), (70, 54, -6), (320, 66, -8), (350, 50, 6)):
        pts = bez((x0, 110), (x0, 110 - h * 0.4), (x0 + lean, 110 - h * 0.8), (x0 + lean * 1.4, 110 - h))
        stems.append(line(pts))
        for i, (x, y) in enumerate(pts[3::2]):
            needles.append(leaf(x, y, 9, 1.6, -150)); needles.append(leaf(x, y, 9, 1.6, -30))
    for x, a in ((110, -110), (124, -80), (138, -60), (258, -120), (272, -95), (286, -70)):
        basil.append(leaf(x, 110, 30, 10, a))
    for x0 in (190, 200):
        thyme.append(line([(x0, 110), (x0 + 3, 80), (x0 + 6, 60)]))
        for k in range(8):
            y = 108 - k * 6
            needles.append(ellipse(x0 + 2 + k * 0.6 - 3, y, 2.4, 1.4, 30)); needles.append(ellipse(x0 + 2 + k * 0.6 + 3, y, 2.4, 1.4, -30))
    return piece('0 0 390 112', [P(J(*stems, *thyme), s='#4F6B3A', w=1.4), P(J(*needles), f='#5E7D4A'), P(J(*basil), f='#3F7A3A')], size=112)

def herbs_div():
    return piece('0 0 240 28', [P('M40 14H200', s='P', w=0.9, o=0.7), P(J(*[leaf(84 + k * 9, 14, 9, 1.8, -140 if k % 2 else -40) for k in range(9)]), f='#5E7D4A')])

# ---------------------------------------------------------------- 11 grapevine (top strip)
def grape_leaf(cx, cy, s, ang):
    pts = []
    for k in range(0, 361, 10):
        a = math.radians(k)
        r = s * (0.75 + 0.25 * math.cos(5 * a)) * (0.85 if 150 < k < 210 else 1)
        rr = math.radians(ang)
        x, y = r * math.cos(a), r * math.sin(a)
        pts.append((cx + x * math.cos(rr) - y * math.sin(rr), cy + x * math.sin(rr) + y * math.cos(rr)))
    return poly(pts)

def vine_top():
    vine = bez((-10, 20), (100, 50), (240, 0), (400, 34))
    lvs = [grape_leaf(70, 32, 18, 20), grape_leaf(200, 18, 15, -10), grape_leaf(300, 26, 17, 40)]
    grapes = []
    for (gx, gy) in ((120, 42), (350, 46)):
        for row in range(5):
            for c in range(5 - row):
                grapes.append(circle(gx + (c - (4 - row) / 2) * 7, gy + row * 6.5, 3.6))
    tendrils = J(*[line(spiral(x, y, 7, 1, 0, 1.4)) for x, y in ((160, 30), (260, 18))])
    return piece('0 0 390 84', [P(line(vine), s='#6B4F2A', w=2.2), P(tendrils, s='#6B4F2A', w=1), P(J(*lvs), f='#5E7D3A'), P(J(*grapes), f='#6B2D5B')], size=84)

def vine_div():
    return piece('0 0 240 28', [P('M40 14H200', s='P', w=0.9, o=0.7), P(J(*[circle(120 + (c - 1) * 6, 10 + r * 5, 2.8) for r in range(3) for c in range(3 - r)]), f='#6B2D5B')])

# ---------------------------------------------------------------- 12 wildflowers (bottom strip)
def wildflowers_bottom():
    rnd = random.Random(9)
    stems, daisies, centres, bells, grass = [], [], [], [], []
    for i in range(14):
        x = 14 + i * 27 + rnd.uniform(-6, 6)
        h = rnd.uniform(40, 92)
        top = (x + rnd.uniform(-8, 8), 120 - h)
        stems.append(line(bez((x, 120), (x, 120 - h * 0.4), (top[0], top[1] + h * 0.3), top)))
        if i % 3 == 0:
            daisies.append(J(*[leaf(top[0], top[1], 10, 3.2, a) for a in range(0, 360, 30)])); centres.append(circle(top[0], top[1], 3.2))
        elif i % 3 == 1:
            bells.append(J(ellipse(top[0], top[1] + 4, 4.5, 6), ellipse(top[0] + 7, top[1] + 12, 4, 5.5)))
        else:
            centres.append(J(*[circle(top[0] + dx, top[1] + dy, 2.2) for dx, dy in ((0, 0), (4, 5), (-4, 6), (0, 10))]))
    for i in range(30):
        x = rnd.uniform(0, 390)
        grass.append(leaf(x, 120, rnd.uniform(14, 26), 1.6, -90 + rnd.uniform(-25, 25)))
    return piece('0 0 390 122', [P(J(*stems), s='#5E7D4A', w=1.2), P(J(*grass), f='#6B8E4E'), P(J(*daisies), f='#FFFFFF', s='#C9C2B0', w=0.4), P(J(*bells), f='#8E6BBF'), P(J(*centres), f='#E0A82E')], size=122)

def wildflowers_div():
    return piece('0 0 240 28', [P('M40 16H200', s='P', w=0.9, o=0.7), P(J(*[leaf(120, 12, 8, 2.6, a) for a in range(0, 360, 45)]), f='#FFFFFF', s='#C9C2B0', w=0.4), P(circle(120, 12, 2.6), f='#E0A82E')])

# ---------------------------------------------------------------- 13 hand-drawn sketch
def sketch_corner():
    return piece(60, [P(star(20, 20, 9, 3.6), s='P', w=1.2), P(line(spiral(44, 14, 6, 1, 0, 1.6)), s='P', w=1.1), P(line([(10, 46), (24, 40), (18, 52)]), s='P', w=1.1)])

def sketch_div():
    w = poly([(x, 14 + 3 * math.sin(x / 6) + (0.6 if x % 3 else -0.4)) for x in range(60, 182, 3)], close=False)
    return piece('0 0 240 28', [P(w, s='P', w=1.6)])

# ---------------------------------------------------------------- 14 postage stamp
def stamp_corner():
    pm = J(circle(30, 30, 22), circle(30, 30, 16))
    waves = J(*[poly([(x, 24 + k * 6 + 2 * math.sin(x / 4)) for x in range(52, 110, 3)], close=False) for k in range(3)])
    return piece(110, [P(pm, s='P', w=1.2, o=0.7), P(waves, s='P', w=1.1, o=0.7), P(star(30, 30, 7, 3), f='A')])

def stamp_div():
    return piece('0 0 240 28', [P('M30 14H210', s='P', w=1.2, o=0.6), P(J(*[circle(x, 14, 1.4) for x in range(40, 204, 8)]), f='S')])

# ---------------------------------------------------------------- 15 ribbon (banner title)
def ribbon_corner():
    return piece(60, [P(J(circle(12, 12, 3), circle(24, 12, 1.8), circle(12, 24, 1.8)), f='A')])

def ribbon_div():
    return piece('0 0 240 28', [P('M40 14H96M144 14H200', s='P', w=1), P('M100 8H140L134 14L140 20H100L106 14Z', f='P')])

# ---------------------------------------------------------------- 16 bamboo (left side + ink circle)
def bamboo_side():
    rnd = random.Random(4)
    stalks, nodes, lvs = [], [], []
    for x, w in ((18, 9), (34, 7)):
        stalks.append(rect(x - w / 2, 0, w, 2400))
        for y in range(40, 2400, rnd.choice([90, 110, 130])):
            nodes.append(f'M{n(x - w / 2 - 1)} {y}H{n(x + w / 2 + 1)}')
    for y in range(80, 2400, 170):
        lvs.append(leaf(34, y, 38, 6, -20 + rnd.uniform(-15, 15))); lvs.append(leaf(34, y + 6, 30, 5, 20 + rnd.uniform(-15, 15)))
    return piece('0 0 70 2400', [P(J(*stalks), f='#5E7D4A'), P(J(*nodes), s='#3F5A2A', w=2), P(J(*lvs), f='#4F7A3A')], size=70)

def bamboo_corner():
    ring = []
    for k in range(0, 61):
        u = k / 60
        a = math.radians(-60 + u * 300)
        th = 2 + 9 * math.sin(math.pi * u)
        ring.append((70 + (42 + th / 2) * math.cos(a), 50 + (42 + th / 2) * math.sin(a)))
    inner = []
    for k in range(60, -1, -1):
        u = k / 60
        a = math.radians(-60 + u * 300)
        th = 2 + 9 * math.sin(math.pi * u)
        inner.append((70 + (42 - th / 2) * math.cos(a), 50 + (42 - th / 2) * math.sin(a)))
    return piece(120, [P(poly(ring + inner), f='P', o=0.85)])

def bamboo_div():
    return piece('0 0 240 28', [P(rrect(60, 11, 120, 6, 3), f='#5E7D4A'), P('M100 9V19M140 9V19', s='#3F5A2A', w=1.6)])

# ---------------------------------------------------------------- 17 geometric
def geometric_corner():
    return piece(140, [P(J(circle(96, 44, 34)), s='P', w=1.2), P('M20 10L130 120M0 60H140M70 0V140', s='P', w=0.8, o=0.6), P(circle(96, 44, 10), f='A')])

def geometric_div():
    return piece('0 0 240 28', [P('M40 14H110M130 14H200', s='P', w=1), P(J(circle(120, 14, 6)), s='A', w=1.4)])

# ---------------------------------------------------------------- the list
FRAMES = [
    dict(id='flourish', label='Flourish corners', note='Calligraphic scrolls in each corner, a crest over the name',
         rules=rules({'off': 14, 'w': 1.2, 'gap': 70}), corner=flourish_corner(), corners='all', csize=110, cin=6,
         crest=flourish_crest(), div=flourish_div(), pad=34, font='elegant', scheme=('#E9DFC9', '#2B2B2B', '#C8A96A')),
    dict(id='filigree', label='Filigree crest', note='Double rule, square corners, a big filigree crest',
         rules=rules({'off': 12, 'w': 1.2, 'gap': 18}, {'off': 17, 'w': 0.8, 'gap': 18}), corner=filigree_corner(), corners='all', csize=44, cin=6,
         crest=filigree_crest(), div=filigree_div(), pad=34, font='elegant', scheme=('#EDE6D6', '#2E2E2E', '#D9C9A3')),
    dict(id='botanical', label='Botanical line art', note='Large drawn leaves in two corners, thin double frame',
         rules=rules({'off': 14, 'w': 0.9, 'gap': -10}, {'off': 20, 'w': 0.9, 'gap': -10}), corner=botanical_corner(), corners='diag', csize=170, cin=-14,
         div=botanical_div(), pad=36, font='deco', scheme=('#E2D3B6', '#2F2D2B', '#CDB78F')),
    dict(id='architect', label='Fine lines', note='Crossing lines with small dots, very quiet',
         rules=rules({'off': 14, 'w': 1, 'gap': -12}, {'off': 22, 'w': 1, 'gap': -12}), corner=architect_corner(), corners='all', csize=36, cin=0,
         div=architect_div(), pad=34, font='modern', scheme=('#1F1F1F', '#F6F3EC', '#B5651D')),
    dict(id='nouveau', label='Art nouveau', note='Whiplash curves arch over the name, lily at the top',
         rules=rules({'off': 12, 'w': 1.2, 'gap': 0}), top=nouveau_top(), corner=nouveau_corner(), corners='bottom', csize=96, cin=4,
         div=nouveau_div(), pad=30, font='oldstyle', scheme=('#3E5C3A', '#F5EFE0', '#B5651D')),
    dict(id='decoframe', label='Deco frame', note='Stepped corners, a sunburst crest',
         rules=rules({'off': 10, 'w': 1.2, 'gap': 78}, {'off': 16, 'w': 0.6, 'gap': 78}), corner=deco_corner(), corners='all', csize=76, cin=6,
         crest=deco_crest(), div=deco_div(), pad=32, font='deco', scheme=('#D4AF37', '#14181F', '#E8D9A8')),
    dict(id='laurel', label='Laurel wreath', note='A laurel wreath around the name, rounded frame',
         rules=rules({'off': 12, 'w': 1.4, 'box': True, 'radius': 18}), crest=laurel_crest(), div=laurel_div(), pad=30, font='classic',
         scheme=('#3E5C3A', '#FAF6EC', '#9C7524')),
    dict(id='cartouche', label='Cartouche', note='Scooped corners, side brackets, an oval crest',
         rules=rules({'off': 14, 'w': 1.2, 'gap': 24, 'mid': 0}), corner=cartouche_corner(), corners='all', csize=56, cin=14, mids=cartouche_mid(),
         crest=cartouche_crest(), div=filigree_div(), pad=34, font='didone', scheme=('#7A1F3D', '#FBF4EE', '#9C7524')),
    dict(id='citrus', label='Lemon branch', note='Painted lemons and leaves in two corners',
         rules=rules({'off': 12, 'w': 1, 'gap': 0}), corner=citrus_corner(), corners='tl-br', csize=150, cin=0,
         div=citrus_div(), pad=30, font='oldstyle', scheme=('#2E5D7A', '#FFFCF3', '#B8860B')),
    dict(id='herbs', label='Herb garden', note='Rosemary, basil and thyme along the bottom',
         rules=rules({'off': 12, 'w': 1, 'gap': 0}), bottom=herbs_bottom(), div=herbs_div(), pad=30, font='hand',
         scheme=('#3F5A2A', '#F6F3E8', '#9C4A1F')),
    dict(id='vine', label='Grapevine', note='A vine with grapes along the top',
         rules=rules({'off': 12, 'w': 1, 'gap': 0}), top=vine_top(), div=vine_div(), pad=30, font='elegant',
         scheme=('#5A1F3A', '#FBF6EE', '#6B4F2A')),
    dict(id='wildflowers', label='Wildflowers', note='A meadow of daisies and bluebells along the bottom',
         rules=rules({'off': 12, 'w': 1, 'box': True, 'radius': 10}), bottom=wildflowers_bottom(), div=wildflowers_div(), pad=30, font='script',
         scheme=('#5B4A8A', '#FBF8F2', '#7A8C3A')),
    dict(id='sketch', label='Hand-drawn', note='Wobbly sketched frame and doodles',
         rules=rules({'off': 11, 'w': 1.6, 'box': True, 'radius': 6, 'tilt': 0.5}, {'off': 15, 'w': 1.1, 'box': True, 'radius': 4, 'tilt': -0.4}),
         corner=sketch_corner(), corners='all', csize=50, cin=12, div=sketch_div(), pad=34, font='hand', scheme=('#2B2B2B', '#FFFDF6', '#D6336C')),
    dict(id='stamp', label='Postage stamp', note='Perforated edge, a postmark in the corner',
         rules=rules({'off': 6, 'w': 4, 'style': 'dotted', 'box': True}, {'off': 16, 'w': 1.2, 'box': True}), corner=stamp_corner(), corners='tr', csize=110, cin=10,
         div=stamp_div(), pad=34, font='typewriter', scheme=('#1F4E79', '#FBF7EC', '#C0392B')),
    dict(id='ribbon', label='Ribbon banner', note='The name on a ribbon, dotted corners',
         rules=rules({'off': 12, 'w': 1.2, 'gap': 0}, {'off': 16, 'w': 0.6, 'gap': 0}), corner=ribbon_corner(), corners='all', csize=36, cin=8,
         div=ribbon_div(), pad=32, font='slab', title='banner', scheme=('#A3161C', '#FFF8EC', '#1F4E79')),
    dict(id='bamboo', label='Bamboo and ink', note='Bamboo up the left side, a brush circle',
         rules=rules(), side=bamboo_side(), corner=bamboo_corner(), corners='tr', csize=110, cin=0, div=bamboo_div(), pad=30, padLeft=78,
         font='mincho', scheme=('#1A1A1A', '#F5F0E6', '#B5462F')),
    dict(id='geometric', label='Geometric', note='A circle and crossing lines, modern',
         rules=rules({'off': 12, 'w': 1, 'gap': 0}), corner=geometric_corner(), corners='tr', csize=140, cin=0, div=geometric_div(), pad=32, font='modern',
         scheme=('#0F4C81', '#F2F5F8', '#E07A5F')),
]
