"""Generates the app icons and splash from Trippy's route-glyph logo.

    uv run --project backend python tools/make_icons.py

Outputs into mobile/assets/: icon.png, android-icon-{foreground,background,monochrome}.png,
splash-icon.png, favicon.png. The glyph is drawn on the logo's 64-unit grid (see Logo.tsx).
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK, BG, SUN = (17, 17, 16), (247, 247, 245), (232, 178, 106)
OUT = Path(__file__).resolve().parents[1] / "mobile" / "assets"
SS = 4  # supersampling for smooth edges


def bezier(t, p0, p1, p2, p3):
    u = 1 - t
    return tuple(u**3 * a + 3 * u**2 * t * b + 3 * u * t**2 * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3, strict=True))


def dots_along_curve(spacing=8.3):
    """Evenly spaced points along the route curve (the logo's dotted path), in 64-unit coordinates."""
    pts = [bezier(i / 400, (18, 45), (21, 26), (36, 17), (46, 19)) for i in range(401)]
    out, acc, last = [pts[0]], 0.0, pts[0]
    for p in pts[1:]:
        acc += ((p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2) ** 0.5
        last = p
        if acc >= spacing:
            out.append(p)
            acc = 0.0
    return out


def glyph(draw: ImageDraw.ImageDraw, box: float, ox: float, oy: float, fg, ring):
    """Draw the route glyph into a square of side `box` at (ox, oy)."""
    k = box / 64
    xy = lambda x, y: (ox + x * k, oy + y * k)  # noqa: E731
    for x, y in dots_along_curve():
        cx, cy = xy(x, y)
        draw.ellipse((cx - 2 * k, cy - 2 * k, cx + 2 * k, cy + 2 * k), fill=fg)
    cx, cy = xy(18, 45)
    draw.ellipse((cx - 5 * k, cy - 5 * k, cx + 5 * k, cy + 5 * k), fill=fg)
    cx, cy = xy(46, 19)
    draw.ellipse((cx - 8.5 * k, cy - 8.5 * k, cx + 8.5 * k, cy + 8.5 * k), fill=ring)
    draw.ellipse((cx - 4.5 * k, cy - 4.5 * k, cx + 4.5 * k, cy + 4.5 * k), fill=(0, 0, 0, 0) if len(ring) == 4 else None)


def render(size, bg, fg, ring, glyph_scale, rounded=False, hole=None):
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        if rounded:
            d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 18 / 64), fill=bg)
        else:
            d.rectangle((0, 0, big, big), fill=bg)
    box = big * glyph_scale
    k = box / 64
    # The drawing isn't centred in the logo's 64-unit box (its bounds are x 13–54.5, y 10.5–50), so centre the bounds.
    ox, oy = big / 2 - 33.75 * k, big / 2 - 30.25 * k
    glyph(d, box, ox, oy, fg, ring)
    # punch the destination ring's centre back to the background so it reads as a ring, not a disc
    if hole is not None:
        cx, cy = ox + 46 * k, oy + 19 * k
        d.ellipse((cx - 4.5 * k, cy - 4.5 * k, cx + 4.5 * k, cy + 4.5 * k), fill=hole)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Store icon: ink tile, light glyph, sun ring (full bleed — the OS applies its own mask).
    icon = render(1024, INK + (255,), BG + (255,), SUN + (255,), 0.86, hole=INK + (255,))
    icon.convert("RGB").save(OUT / "icon.png")

    # Adaptive icon: glyph kept inside the 66% safe zone, on a flat ink background layer.
    render(1024, None, BG + (255,), SUN + (255,), 0.68, hole=(0, 0, 0, 0)).save(OUT / "android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), INK + (255,)).save(OUT / "android-icon-background.png")
    # Monochrome (themed icons): a single colour; the system tints it.
    render(1024, None, (255, 255, 255, 255), (255, 255, 255, 255), 0.68, hole=(0, 0, 0, 0)).save(OUT / "android-icon-monochrome.png")

    # Splash: the logo tile on a transparent canvas (the splash plugin supplies the background colour).
    render(512, INK + (255,), BG + (255,), SUN + (255,), 0.74, rounded=True, hole=INK + (255,)).save(OUT / "splash-icon.png")
    render(96, INK + (255,), BG + (255,), SUN + (255,), 0.74, rounded=True, hole=INK + (255,)).save(OUT / "favicon.png")
    for f in sorted(OUT.glob("*.png")):
        print(f"{f.name:34} {Image.open(f).size}")


if __name__ == "__main__":
    main()
