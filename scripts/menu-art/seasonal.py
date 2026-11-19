# Seasonal decorations laid over any table-menu style (390 x 44 strip under the header).
# Fixed colours per season (they sit on top of the restaurant's own look).
import math
from ornaments import P, J, circle, ellipse, leaf, poly, star, rect, flame

def heart(cx, cy, s):
    return (f'M{cx:.1f} {cy + s * 0.9:.1f}C{cx - s * 1.6:.1f} {cy - s * 0.1:.1f} {cx - s * 0.9:.1f} {cy - s * 1.3:.1f} {cx:.1f} {cy - s * 0.45:.1f}'
            f'C{cx + s * 0.9:.1f} {cy - s * 1.3:.1f} {cx + s * 1.6:.1f} {cy - s * 0.1:.1f} {cx:.1f} {cy + s * 0.9:.1f}Z')

def flake(cx, cy, r):
    return J(*[f'M{cx:.1f} {cy:.1f}L{cx + r * math.cos(math.radians(a)):.1f} {cy + r * math.sin(math.radians(a)):.1f}' for a in range(0, 360, 60)])

def christmas():
    leaves, berries, flakes = [], [], []
    for x in (30, 195, 360):
        leaves += [leaf(x, 22, 22, 7, 200), leaf(x, 22, 22, 7, -20), leaf(x, 22, 18, 6, -100)]
        berries += [circle(x - 4, 24, 4), circle(x + 4, 24, 4), circle(x, 17, 4)]
    for x in (80, 120, 155, 235, 270, 310):
        flakes.append(flake(x, 14 + (x % 3) * 8, 6))
    return {'h': 44, 'p': [P(J(*leaves), f='#2F6B3A'), P(J(*berries), f='#C0392B'), P(J(*flakes), s='#8FB8DE', w=1.6)]}

def halloween():
    body, stem, bats = [], [], []
    for x in (36, 354):
        body += [ellipse(x - 7, 26, 9, 12), ellipse(x + 7, 26, 9, 12), ellipse(x, 26, 9, 13)]
        stem.append(f'M{x} 14Q{x + 2} 8 {x + 6} 7')
    for x, y in ((120, 14), (195, 24), (270, 12)):
        bats.append(f'M{x} {y}Q{x - 6} {y - 6} {x - 14} {y - 2}Q{x - 10} {y + 1} {x - 9} {y + 5}Q{x - 5} {y + 1} {x} {y + 4}Q{x + 5} {y + 1} {x + 9} {y + 5}Q{x + 10} {y + 1} {x + 14} {y - 2}Q{x + 6} {y - 6} {x} {y}Z')
    return {'h': 44, 'p': [P(J(*body), f='#E8731A'), P(J(*stem), s='#4E6B2E', w=2.5), P(J(*bats), f='#2B2233')]}

def valentines():
    hs = [heart(x, 22 + 6 * math.sin(i), 6 + (i % 3) * 2) for i, x in enumerate(range(20, 390, 44))]
    return {'h': 44, 'p': [P(J(*hs[::2]), f='#D6336C'), P(J(*hs[1::2]), f='#F28AB2')]}

def lunar():
    body, gold, tas = [], [], []
    for x in (40, 350):
        body.append(ellipse(x, 22, 14, 12))
        gold += [rect(x - 6, 8, 12, 4), rect(x - 6, 32, 12, 4)]
        tas.append(f'M{x} 36V43M{x} 0V8')
    coins = J(*[circle(x, 22, 5) for x in range(110, 290, 30)])
    holes = J(*[rect(x - 1.6, 20.4, 3.2, 3.2) for x in range(110, 290, 30)])
    return {'h': 44, 'p': [P(J(*tas), s='#C99419', w=1.4), P(J(*body), f='#C8102E'), P(J(*gold), f='#C99419'), P(coins + holes, f='#E0B23A', r='evenodd')]}

def diwali():
    bowls, flames, dots = [], [], []
    for x in (40, 195, 350):
        bowls.append(f'M{x - 14} 30A14 9 0 0 0 {x + 14} 30Z')
        flames.append(flame(x, 29, 16, 6))
    for x in range(70, 330, 16):
        if abs(x - 195) > 20:
            dots.append(circle(x, 30, 2.2))
    return {'h': 44, 'p': [P(J(*bowls), f='#B5462F'), P(J(*flames), f='#F59F00'), P(J(*dots), f='#E05780')]}

def patio():
    line = 'M-5 6Q195 30 395 6'
    bulbs = []
    for x in range(20, 390, 34):
        y = 6 + 24 * (1 - ((x - 195) / 200) ** 2) * 0.5 + 3
        bulbs.append(ellipse(x, y + 7, 4.5, 6.5))
    return {'h': 44, 'p': [P(line, s='#3A3A3A', w=1.4), P(J(*bulbs), f='#F7C948')]}

SEASONAL = {'christmas': christmas, 'halloween': halloween, 'valentines': valentines, 'lunar': lunar, 'diwali': diwali, 'patio': patio}
