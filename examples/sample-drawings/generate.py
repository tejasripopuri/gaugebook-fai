#!/usr/bin/env python3
"""Generate 50 fictional sample drawings for testing Gaugebook uploads.

Each drawing is a made-up training part (plates, flanges, brackets, shafts, blocks)
with toleranced callouts. answer-key.csv lists every callout and the acceptance
limits an inspector should derive from it, so the app's proposals can be checked.

    python3 generate.py            # writes SMP-2001 ... SMP-2050 next to this script

Needs: reportlab, Pillow and pdftoppm (poppler-utils).
"""
import csv, json, math, os, random, subprocess, tempfile
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))
W, H = 792, 612  # landscape letter, points
INK = (0.1, 0.12, 0.14)


# ---------------------------------------------------------------- formatting
def fin(v, d=3):
    """Inch style: .500, 5.000"""
    s = f"{v:.{d}f}"
    return s[1:] if s.startswith("0.") else s

def fmm(v, d=1):
    return f"{v:.{d}f}"

class Units:
    def __init__(self, metric):
        self.metric = metric
        self.name = "MILLIMETERS" if metric else "INCHES"
        self.unit = "mm" if metric else "in"
    def n(self, v, d=None):
        return fmm(v, d if d is not None else 1) if self.metric else fin(v, d if d is not None else 3)
    def sym(self, v, t, d=None, td=None):
        """'5.000 ±.010'"""
        return f"{self.n(v, d)} ±{self.n(t, td if td is not None else d)}"
    def uni(self, v, plus, d=None):
        """'1.250 +.002/-.000'"""
        dd = d if d is not None else (2 if self.metric else 3)
        return f"{self.n(v, dd)} +{self.n(plus, dd)}/-{self.n(0, dd)}"


# ---------------------------------------------------------------- page drawing
class Sheet:
    def __init__(self, c, part, sheet, sheets):
        self.c, self.part, self.sheet, self.sheets = c, part, sheet, sheets

    def text(self, x, y, s, size=8.5, bold=False, anchor="l", rot=0):
        c = self.c
        c.saveState()
        c.setFillColorRGB(*INK)
        c.setFont("Sans-Bold" if bold else "Sans", size)
        c.translate(x, y)
        c.rotate(rot)
        w = pdfmetrics.stringWidth(s, "Sans-Bold" if bold else "Sans", size)
        dx = {"l": 0, "c": -w / 2, "r": -w}[anchor]
        c.drawString(dx, 0, s)
        c.restoreState()
        return w

    def frame(self):
        c, p = self.c, self.part
        c.setStrokeColorRGB(*INK)
        c.setLineWidth(1)
        c.rect(8, 8, W - 16, H - 16)
        c.line(8, H - 58, W - 8, H - 58)       # header
        c.line(8, 92, W - 8, 92)               # title block
        c.line(456, 92, 456, H - 8)            # right column
        self.text(20, H - 32, "Sample Manufacturing Co.", 14, True)
        self.text(20, H - 48, "INSPECTION TRAINING DRAWING", 7)
        self.text(470, H - 32, f"{p['number']}   /   REV {p['rev']}", 14, True)
        self.text(470, H - 48, f"DIMENSIONS IN {p['units'].name}", 7)
        self.text(20, 62, p["name"], 14, True)
        self.text(20, 44, "Fictional practice part for first article inspection.", 8)
        self.text(20, 24, "TRAINING ONLY", 7, True)
        self.text(470, 62, f"{p['number']}    |    REVISION {p['rev']}", 10, True)
        self.text(470, 44, "Third-angle projection   /   Do not scale drawing", 7.5)
        self.text(470, 24, f"Sheet {self.sheet} of {self.sheets}", 7.5)

    def lines(self, pts, closed=False, width=1.0, dash=None):
        c = self.c
        c.setLineWidth(width)
        c.setDash(*(dash or []))
        path = c.beginPath()
        path.moveTo(*pts[0])
        for pt in pts[1:]:
            path.lineTo(*pt)
        if closed:
            path.close()
        c.drawPath(path, stroke=1, fill=0)
        c.setDash()

    def circle(self, x, y, r, width=1.0, dash=None):
        self.c.setLineWidth(width)
        self.c.setDash(*(dash or []))
        self.c.circle(x, y, r)
        self.c.setDash()

    def centermark(self, x, y, r):
        e = r + 5
        self.lines([(x - e, y), (x + e, y)], width=0.4, dash=[4, 2])
        self.lines([(x, y - e), (x, y + e)], width=0.4, dash=[4, 2])

    def arrow(self, x, y, angle):
        a = math.radians(angle)
        c = self.c
        c.setFillColorRGB(*INK)
        p = c.beginPath()
        p.moveTo(x, y)
        for da in (-0.32, 0.32):
            p.lineTo(x - 7 * math.cos(a + da), y - 7 * math.sin(a + da))
        p.close()
        c.drawPath(p, stroke=0, fill=1)

    def hdim(self, x1, x2, y, ext_from, label):
        """Horizontal dimension at height y, extension lines from ext_from."""
        self.lines([(x1, ext_from), (x1, y + 4)], 0.4)
        self.lines([(x2, ext_from), (x2, y + 4)], 0.4)
        self.lines([(x1, y), (x2, y)], 0.5)
        self.arrow(x1, y, 180); self.arrow(x2, y, 0)
        self.text((x1 + x2) / 2, y + 4, label, 8.5, anchor="c")

    def vdim(self, y1, y2, x, ext_from, label):
        self.lines([(ext_from, y1), (x - 4, y1)], 0.4)
        self.lines([(ext_from, y2), (x - 4, y2)], 0.4)
        self.lines([(x, y1), (x, y2)], 0.5)
        self.arrow(x, y1, 270); self.arrow(x, y2, 90)
        self.text(x - 4, (y1 + y2) / 2, label, 8.5, anchor="c", rot=90)

    def leader(self, x, y, tx, ty, label):
        self.lines([(x, y), (tx, ty), (tx + (6 if tx >= x else -6), ty)], 0.5)
        self.arrow(x, y, math.degrees(math.atan2(y - ty, x - tx)))
        self.text(tx + (9 if tx >= x else -9), ty - 3, label, 8.5, anchor="l" if tx >= x else "r")

    def fcf(self, x, y, symbol, value):
        """Feature control frame box (geometric tolerance)."""
        self.c.setLineWidth(0.6)
        self.c.rect(x, y, 22, 14)
        self.c.rect(x + 22, y, 40, 14)
        self.text(x + 11, y + 3.5, symbol, 8, anchor="c")
        self.text(x + 26, y + 3.5, value, 8)

    def right_column(self, p, sections):
        y = H - 82
        for title, rows in sections:
            if not rows:
                continue
            self.text(470, y, title, 9, True)
            y -= 20
            for row in rows:
                self.text(470, y, row, 8)
                y -= 15
            y -= 14


# ---------------------------------------------------------------- part families
def tol(rng, u, kind="lin"):
    if u.metric:
        return {"lin": rng.choice([0.1, 0.2, 0.3]), "hole": rng.choice([0.05, 0.1]), "thk": rng.choice([0.05, 0.1])}[kind]
    return {"lin": rng.choice([0.005, 0.010, 0.015]), "hole": rng.choice([0.002, 0.003, 0.005]), "thk": rng.choice([0.003, 0.005])}[kind]

def rnd(rng, lo, hi, step):
    return round(rng.randrange(int(lo / step), int(hi / step) + 1) * step, 4)

def add(p, feature, text, count=1, view="", unit=None):
    """Record a callout and the acceptance limits it implies (for the answer key)."""
    import re
    u = p["units"]
    num = r"(\d+(?:\.\d*)?|\.\d+)"
    bounds = None
    m = re.search(num + r"\s*\+\s*" + num + r"\s*/\s*-\s*" + num, text)
    if m:
        bounds = [float(m[1]) - float(m[3]), float(m[1]) + float(m[2])]
    else:
        m = re.search(num + r"\s*°?\s*±\s*" + num, text)
        if m:
            bounds = [float(m[1]) - float(m[2]), float(m[1]) + float(m[2])]
    if bounds and "°" in text:
        unit = "°"
    p["callouts"].append({"feature": feature, "callout": text, "count": count, "view": view,
                          "lower": round(bounds[0], 4) if bounds else "", "upper": round(bounds[1], 4) if bounds else "",
                          "unit": (unit or u.unit) if bounds else "", "check": "measure" if bounds else "verify"})
    return text

def plate(s, p, rng):
    u = p["units"]
    L = rnd(rng, 4, 7, 0.5) if not u.metric else rnd(rng, 100, 180, 10)
    Wd = rnd(rng, 2.5, 4, 0.5) if not u.metric else rnd(rng, 60, 100, 10)
    T = rng.choice([0.25, 0.375, 0.5, 0.625]) if not u.metric else rng.choice([6, 8, 10, 12])
    sc = 330 / L
    x0, y0, w, h = 70, 330, L * sc, min(Wd * sc, 190)
    s.text(30, 535, "TOP VIEW", 8, True)
    s.lines([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], closed=True, width=1.2)
    s.hdim(x0, x0 + w, y0 + h + 22, y0 + h + 2, add(p, "Overall length", u.sym(L, tol(rng, u)), view="Top"))
    s.vdim(y0, y0 + h, x0 - 22, x0 - 2, add(p, "Overall width", u.sym(Wd, tol(rng, u)), view="Top"))
    n = rng.choice([2, 4, 6])
    hd = rng.choice([0.201, 0.257, 0.281, 0.343]) if not u.metric else rng.choice([5.5, 6.6, 9.0, 11.0])
    cols = n // 2
    holes = [(x0 + w * (i + 0.5) / cols if cols > 1 else x0 + w * 0.15 + (w * 0.7) * i, y0 + h * yy)
             for i in range(cols) for yy in (0.2, 0.8)] if n > 2 else [(x0 + w * 0.15, y0 + h / 2), (x0 + w * 0.85, y0 + h / 2)]
    if n == 2: pass
    elif cols == 2: holes = [(x0 + w * xx, y0 + h * yy) for xx in (0.12, 0.88) for yy in (0.2, 0.8)]
    else: holes = [(x0 + w * xx, y0 + h * yy) for xx in (0.12, 0.5, 0.88) for yy in (0.2, 0.8)]
    for hx, hy in holes:
        s.circle(hx, hy, 6); s.centermark(hx, hy, 6)
    hx, hy = holes[0]
    s.leader(hx + 4, hy + 4, hx + 40, hy + 34 if hy < y0 + h / 2 else hy - 34,
             add(p, "Mounting hole diameter", f"{n}X Ø{u.sym(hd, tol(rng, u, 'hole'))} THRU", n, "Top"))
    rows = []
    if rng.random() < 0.7:
        bd = rnd(rng, 0.75, 1.5, 0.125) if not u.metric else rnd(rng, 20, 40, 2)
        cx, cy = x0 + w / 2, y0 + h / 2
        s.circle(cx, cy, bd * sc / 2); s.centermark(cx, cy, bd * sc / 2)
        bore = add(p, "Bore diameter", f"Ø{u.uni(bd, 0.002 if not u.metric else 0.03)} THRU", view="Top")
        rows.append("B  " + bore)
        if rng.random() < 0.5:
            cb = bd + (0.375 if not u.metric else 10)
            s.circle(cx, cy, cb * sc / 2)
            dp = T / 4
            rows.append("    " + add(p, "Counterbore diameter", f"CBORE Ø{u.sym(cb, tol(rng, u, 'thk'))}", view="Top")
                        + " X " + add(p, "Counterbore depth", f"{u.sym(dp, tol(rng, u, 'thk'))} DP", view="Top"))
        s.text(cx + bd * sc / 2 + 6, cy - 3, "B", 8, True)
    if rng.random() < 0.5:
        r = 0.25 if not u.metric else 5
        s.text(x0 + w - 4, y0 + h + 6, add(p, "Corner radius", f"4X R{u.sym(r, tol(rng, u, 'thk'))}", 4, "Top"), 8, anchor="r")
    # front view
    s.text(30, 270, "FRONT VIEW", 8, True)
    th = max(14, T * sc)
    s.lines([(x0, 190), (x0 + w, 190), (x0 + w, 190 + th), (x0, 190 + th)], closed=True, width=1.2)
    for hx, _ in holes[::2]:
        s.lines([(hx - 6, 190), (hx - 6, 190 + th)], 0.4, [3, 2]); s.lines([(hx + 6, 190), (hx + 6, 190 + th)], 0.4, [3, 2])
    s.vdim(190, 190 + th, x0 - 22, x0 - 2, add(p, "Plate thickness", u.sym(T, tol(rng, u, "thk")), view="Front"))
    if rng.random() < 0.6:
        s.fcf(x0 + w / 2 - 30, 140, "⏥", u.n(0.003 if not u.metric else 0.05, 3 if not u.metric else 2))
        s.lines([(x0 + w / 2, 154), (x0 + w / 2 + 10, 190)], 0.5)
        add(p, "Flatness", f"FLATNESS {u.n(0.003 if not u.metric else 0.05, 3 if not u.metric else 2)}", view="Front")
    return [("FEATURE REQUIREMENTS", rows)]

def flange(s, p, rng):
    u = p["units"]
    od = rnd(rng, 4, 6, 0.5) if not u.metric else rnd(rng, 100, 160, 10)
    sc = 200 / od
    cx, cy, R = 230, 420, 100
    s.text(30, 535, "TOP VIEW", 8, True)
    s.circle(cx, cy, R, 1.2)
    s.hdim(cx - R, cx + R, cy + R + 18, cy, add(p, "Flange outside diameter", f"Ø{u.sym(od, tol(rng, u))}", view="Top"))
    bc = od * 0.75
    n = rng.choice([4, 6, 8])
    hd = rng.choice([0.281, 0.343, 0.406]) if not u.metric else rng.choice([6.6, 9.0, 11.0])
    s.circle(cx, cy, bc * sc / 2, 0.4, [6, 3])
    pts = []
    for i in range(n):
        a = math.radians(90 + 360 * i / n)
        hx, hy = cx + bc * sc / 2 * math.cos(a), cy + bc * sc / 2 * math.sin(a)
        s.circle(hx, hy, hd * sc / 2 + 2); pts.append((hx, hy))
    hx, hy = pts[0]
    s.leader(hx + 4, hy + 5, hx + 70, hy + 30,
             add(p, "Bolt hole diameter", f"{n}X Ø{u.sym(hd, tol(rng, u, 'hole'))} THRU", n, "Top"))
    bore = rnd(rng, 1.25, 2, 0.25) if not u.metric else rnd(rng, 30, 50, 5)
    s.circle(cx, cy, bore * sc / 2, 1.1); s.centermark(cx, cy, bore * sc / 2)
    rows = [f"H  {n}X holes equally spaced on Ø{u.n(bc)} BSC bolt circle",
            "B  " + add(p, "Center bore", f"Ø{u.uni(bore, 0.003 if not u.metric else 0.05)} THRU", view="Top")]
    s.text(cx + bore * sc / 2 + 4, cy + 4, "B", 8, True)
    s.text(30, 270, "FRONT VIEW", 8, True)
    t = rng.choice([0.5, 0.625, 0.75]) if not u.metric else rng.choice([12, 15, 20])
    hub_h = t * 0.8
    hub_d = bore * 1.6
    th, hh = max(16, t * sc), max(12, hub_h * sc)
    s.lines([(cx - R, 180), (cx + R, 180), (cx + R, 180 + th), (cx - R, 180 + th)], closed=True, width=1.2)
    s.lines([(cx - hub_d * sc / 2, 180 + th), (cx - hub_d * sc / 2, 180 + th + hh), (cx + hub_d * sc / 2, 180 + th + hh), (cx + hub_d * sc / 2, 180 + th)], width=1.2)
    s.vdim(180, 180 + th, cx - R - 22, cx - R - 2, add(p, "Flange thickness", u.sym(t, tol(rng, u, "thk")), view="Front"))
    s.vdim(180 + th, 180 + th + hh, cx + R + 26, cx + hub_d * sc / 2 + 2, add(p, "Hub height", u.sym(hub_h, tol(rng, u)), view="Front"))
    s.hdim(cx - hub_d * sc / 2, cx + hub_d * sc / 2, 180 + th + hh + 16, 180 + th + hh + 2, add(p, "Hub diameter", f"Ø{u.sym(hub_d, tol(rng, u))}", view="Front"))
    return [("FEATURE REQUIREMENTS", rows)]

def bracket(s, p, rng):
    u = p["units"]
    base = rnd(rng, 3, 5, 0.5) if not u.metric else rnd(rng, 80, 120, 10)
    height = base * rng.choice([0.6, 0.75, 0.9])
    t = rng.choice([0.188, 0.25, 0.313]) if not u.metric else rng.choice([5, 6, 8])
    sc = 260 / base
    x0, y0 = 90, 150
    bw, bh, tt = base * sc, height * sc, max(10, t * sc)
    s.text(30, 535, "FRONT VIEW", 8, True)
    s.lines([(x0, y0), (x0 + bw, y0), (x0 + bw, y0 + tt), (x0 + tt, y0 + tt), (x0 + tt, y0 + bh), (x0, y0 + bh)], closed=True, width=1.2)
    s.hdim(x0, x0 + bw, y0 - 30, y0 - 2, add(p, "Base length", u.sym(base, tol(rng, u)), view="Front"))
    s.vdim(y0, y0 + bh, x0 - 24, x0 - 2, add(p, "Upright height", u.sym(height, tol(rng, u)), view="Front"))
    s.vdim(y0, y0 + tt, x0 + bw + 26, x0 + bw + 2, add(p, "Base thickness", u.sym(t, tol(rng, u, "thk")), view="Front"))
    s.hdim(x0, x0 + tt, y0 + bh + 16, y0 + bh + 2, add(p, "Upright thickness", u.sym(t, tol(rng, u, "thk")), view="Front"))
    ang = add(p, "Bend angle", f"90° ±{rng.choice(['0.5', '1'])}°", view="Front")
    s.text(x0 + tt + 30, y0 + tt + 30, ang, 8.5)
    s.lines([(x0 + tt + 12, y0 + tt), (x0 + tt + 12, y0 + tt + 12), (x0 + tt, y0 + tt + 12)], 0.4)
    wd = rnd(rng, 1.5, 2.5, 0.25) if not u.metric else rnd(rng, 40, 60, 5)
    hd = rng.choice([0.257, 0.281]) if not u.metric else rng.choice([6.6, 9.0])
    s.text(30, 270 + 230, "", 1)
    rows = [add(p, "Bracket width", u.sym(wd, tol(rng, u)), view="Side"),
            add(p, "Base hole diameter", f"2X Ø{u.sym(hd, tol(rng, u, 'hole'))} THRU BASE", 2, "Top"),
            add(p, "Upright slot width", f"SLOT {u.sym(hd * 1.5, tol(rng, u, 'hole'))} WIDE", view="Side")]
    for i in range(2):
        hx = x0 + tt + (bw - tt) * (0.35 + 0.4 * i)
        s.lines([(hx - 5, y0), (hx - 5, y0 + tt)], 0.4, [3, 2]); s.lines([(hx + 5, y0), (hx + 5, y0 + tt)], 0.4, [3, 2])
    return [("FEATURE REQUIREMENTS", ["W  Width: " + rows[0], "H  " + rows[1], "S  " + rows[2]])]

def shaft(s, p, rng):
    u = p["units"]
    steps = rng.choice([2, 3, 4])
    total = rnd(rng, 5, 8, 0.5) if not u.metric else rnd(rng, 120, 200, 10)
    sc = 360 / total
    x, cy = 50, 380
    pool = [x * 0.125 for x in range(4, 13)] if not u.metric else list(range(12, 42, 4))
    diam = sorted(rng.sample(pool, steps), reverse=True)
    lens = [round(total / steps, 3 if not u.metric else 1)] * steps
    lens[-1] = round(total - sum(lens[:-1]), 3 if not u.metric else 1)
    s.text(30, 535, "SIDE VIEW", 8, True)
    s.lines([(x - 10, cy), (x + total * sc + 10, cy)], 0.4, [10, 3, 2, 3])
    xs = x
    for i, (d, l) in enumerate(zip(diam, lens)):
        r = d * sc / 2
        s.lines([(xs, cy - r), (xs + l * sc, cy - r), (xs + l * sc, cy + r), (xs, cy + r)], closed=True, width=1.2)
        s.text(xs + l * sc / 2, cy + r + 8 + (i % 2) * 14, add(p, f"Diameter {chr(65 + i)}", f"Ø{u.sym(d, tol(rng, u, 'hole'))}", view="Side"), 8.5, anchor="c")
        if i < steps - 1:
            s.hdim(xs, xs + l * sc, cy - 95 - i * 0, cy - r - 2, add(p, f"Length {chr(65 + i)}", u.sym(l, tol(rng, u)), view="Side"))
        xs += l * sc
    s.hdim(x, x + total * sc, cy - 130, cy - diam[0] * sc / 2 - 2, add(p, "Overall length", u.sym(total, tol(rng, u)), view="Side"))
    ch = 0.03 if not u.metric else 1
    rows = [add(p, "End chamfers", f"2X {u.n(ch, 2 if not u.metric else 1)} X 45° CHAM", 2, "Side")]
    if rng.random() < 0.6:
        kw = 0.188 if not u.metric else 5
        rows.append(add(p, "Keyway width", f"KEYWAY {u.uni(kw, 0.002 if not u.metric else 0.03)} WIDE", view="Side"))
    rows.append(add(p, "Runout", f"RUNOUT {u.n(0.002 if not u.metric else 0.05, 3 if not u.metric else 2)} TO DATUM A", view="Side"))
    return [("FEATURE REQUIREMENTS", rows)]

def block(s, p, rng):
    u = p["units"]
    L = rnd(rng, 3, 5, 0.5) if not u.metric else rnd(rng, 80, 120, 10)
    Wd = L * rng.choice([0.5, 0.6, 0.7])
    Ht = L * rng.choice([0.25, 0.35])
    sc = 300 / L
    x0, y0, w, h = 80, 330, L * sc, Wd * sc
    s.text(30, 535, "TOP VIEW", 8, True)
    s.lines([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], closed=True, width=1.2)
    s.hdim(x0, x0 + w, y0 + h + 22, y0 + h + 2, add(p, "Block length", u.sym(L, tol(rng, u)), view="Top"))
    s.vdim(y0, y0 + h, x0 - 22, x0 - 2, add(p, "Block width", u.sym(Wd, tol(rng, u)), view="Top"))
    sw = rng.choice([0.375, 0.5]) if not u.metric else rng.choice([10, 12])
    sy = y0 + h / 2
    s.lines([(x0 + w * 0.2, sy - sw * sc / 2), (x0 + w * 0.6, sy - sw * sc / 2)], 1)
    s.lines([(x0 + w * 0.2, sy + sw * sc / 2), (x0 + w * 0.6, sy + sw * sc / 2)], 1)
    s.leader(x0 + w * 0.4, sy + sw * sc / 2, x0 + w * 0.7, sy + 40, add(p, "Slot width", f"SLOT {u.sym(sw, tol(rng, u, 'hole'))} WIDE", view="Top"))
    for xx, yy in ((0.1, 0.15), (0.9, 0.15), (0.1, 0.85), (0.9, 0.85)):
        s.circle(x0 + w * xx, y0 + h * yy, 4); s.circle(x0 + w * xx, y0 + h * yy, 5.5, 0.4, [2, 1.5])
    tap = "1/4-20 UNC-2B" if not u.metric else "M6x1.0-6H"
    rows = [add(p, "Tapped holes", f"4X {tap} ▽{u.n(0.5 if not u.metric else 12, 2 if not u.metric else 0)}", 4, "Top")]
    pd = Ht / 3
    rows.append(add(p, "Pocket depth", f"POCKET {u.sym(pd, tol(rng, u, 'thk'))} DP", view="Top"))
    s.text(30, 270, "FRONT VIEW", 8, True)
    hh = Ht * sc
    s.lines([(x0, 150), (x0 + w, 150), (x0 + w, 150 + hh), (x0, 150 + hh)], closed=True, width=1.2)
    s.vdim(150, 150 + hh, x0 - 22, x0 - 2, add(p, "Block height", u.sym(Ht, tol(rng, u)), view="Front"))
    s.lines([(x0 + w * 0.2, 150 + hh - pd * sc), (x0 + w * 0.6, 150 + hh - pd * sc)], 0.6, [3, 2])
    return [("FEATURE REQUIREMENTS", rows)]

def side_sheet(s, p, rng):
    """Sheet 2: a side view with a few extra callouts."""
    u = p["units"]
    s.text(30, 535, "SIDE VIEW (SHEET 2)", 8, True)
    x0, y0, w, h = 120, 260, 240, 140
    s.lines([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], closed=True, width=1.2)
    s.lines([(x0, y0 + h - 12), (x0 + 12, y0 + h)], 1)
    s.leader(x0 + 6, y0 + h - 6, x0 + 60, y0 + h + 40, add(p, "Edge chamfer", f"{u.n(0.06 if not u.metric else 1.5, 2 if not u.metric else 1)} X 45° ±1° CHAM", view="Side"))
    hd = 0.166 if not u.metric else 4.2
    s.circle(x0 + w / 2, y0 + h / 2, 8); s.centermark(x0 + w / 2, y0 + h / 2, 8)
    s.leader(x0 + w / 2 + 6, y0 + h / 2 + 6, x0 + w + 40, y0 + h / 2 + 50,
             add(p, "Side hole diameter", f"Ø{u.sym(hd, 0.003 if not u.metric else 0.05, None, 3 if not u.metric else 2)} THRU", view="Side"))
    return [("SHEET 2 REQUIREMENTS", ["Side hole and edge chamfer shown on this sheet only."])]

FAMILIES = [("Mounting plate", plate), ("Bolted flange", flange), ("Angle bracket", bracket),
            ("Stepped shaft", shaft), ("Fixture block", block)]
MATERIALS = ["6061-T651 aluminum", "304 stainless steel", "1018 cold-rolled steel", "Delrin acetal", "7075-T6 aluminum"]
FINISHES = ["Clear anodize per MIL-PRF-8625, Type II, Class 1.", "Passivate per ASTM A967.", "Black oxide.", "None.", "Zinc plate, clear."]


def build(i):
    rng = random.Random(9000 + i)
    name, fn = FAMILIES[i % 5]
    metric = i % 3 == 2
    sheets = 2 if i % 6 == 5 and i < 30 else 1
    fmt = "pdf" if i < 30 else ("png" if i < 45 else "jpg")
    p = {"number": f"SMP-{2001 + i}", "rev": "ABC"[i % 3], "name": f"{name} {chr(65 + i % 26)}{i + 1}",
         "units": Units(metric), "callouts": [], "family": name, "sheets": sheets, "format": fmt}
    path = os.path.join(OUT, f"{p['number']}.pdf" if fmt == "pdf" else tempfile.mktemp(suffix=".pdf"))
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setTitle(f"{p['number']} Rev {p['rev']} - {p['name']} (fictional training drawing)")
    s = Sheet(c, p, 1, sheets)
    s.frame()
    sections = fn(s, p, rng)
    mat = MATERIALS[i % 5]
    notes = [f"1. Material: {mat}.", f"2. Finish: {FINISHES[i % 5]}",
             "3. Break sharp edges " + (".005-.015." if not metric else "0.1-0.4."),
             "4. Mark part number and revision per customer spec."]
    if any(cl["unit"] == "°" for cl in p["callouts"]):
        notes.append("5. Angular tolerance ±0.5° unless noted.")
    add(p, "Material", f"Material: {mat}")
    s.right_column(p, sections + [("INSPECTION NOTES", notes)])
    if sheets == 2:
        c.showPage()
        s2 = Sheet(c, p, 2, 2)
        s2.frame()
        s2.right_column(p, side_sheet(s2, p, rng))
    c.save()
    if fmt != "pdf":
        base = os.path.join(OUT, p["number"])
        subprocess.run(["pdftoppm", "-r", "150", "-png", "-singlefile", path, base], check=True)
        if fmt == "jpg":  # simulate a scanned print: slight skew, blur, paper tint
            im = Image.open(base + ".png").convert("L")
            im = im.rotate(rng.uniform(-0.8, 0.8), expand=True, fillcolor=255, resample=Image.BICUBIC)
            im = im.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: min(255, v * 0.92 + 14))
            im.convert("RGB").save(base + ".jpg", quality=82)
            os.remove(base + ".png")
        os.remove(path)
    return p


def main():
    rows, index = [], []
    for i in range(50):
        p = build(i)
        file = f"{p['number']}.{p['format']}"
        index.append({"file": file, "part": p["number"], "rev": p["rev"], "name": p["name"], "family": p["family"],
                      "units": p["units"].unit, "sheets": p["sheets"], "callouts": len(p["callouts"]),
                      "measured": sum(1 for c in p["callouts"] if c["check"] == "measure")})
        for c in p["callouts"]:
            rows.append({"file": file, "part": p["number"], **c})
    with open(os.path.join(OUT, "answer-key.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    with open(os.path.join(OUT, "drawings.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)
    print(f"Wrote {len(index)} drawings and {len(rows)} callouts.")


if __name__ == "__main__":
    main()
