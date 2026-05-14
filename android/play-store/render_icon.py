"""Render the Android launcher icon as a 512x512 PNG for the Play Store listing.

Mirrors android/app/src/main/res/drawable/ic_launcher_*.xml. Keep in sync with those
vectors when the launcher icon changes.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

OUTPUT = os.path.join(os.path.dirname(__file__), "icon-512.png")
SIZE = 512


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def diagonal_gradient(size, start, end):
    img = Image.new("RGB", (size, size), start)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = lerp(start, end, t)
    return img


def radial_overlay(size, centre, radius, colour, max_alpha):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    cx, cy = centre
    for y in range(size):
        dy = y - cy
        for x in range(size):
            dx = x - cx
            d = (dx * dx + dy * dy) ** 0.5
            if d >= radius:
                continue
            t = 1 - d / radius
            px[x, y] = (*colour, int(max_alpha * t))
    return img


def vertical_gradient_circle(size, centre, radius, top, bottom):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    cx, cy = centre
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy > radius * radius:
                continue
            t = max(0.0, min(1.0, (y - (cy - radius)) / (2 * radius)))
            px[x, y] = (*lerp(top, bottom, t), 255)
    return img


def ellipse_filled(size, centre, radii, colour, alpha=255):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = centre
    rx, ry = radii
    ImageDraw.Draw(img).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(*colour, alpha))
    return img


def main():
    s = SIZE
    # Map 108-unit viewport to 512 px
    u = s / 108

    # Background diagonal gradient (#7C3AED -> #2563EB)
    base = diagonal_gradient(s, (0x7C, 0x3A, 0xED), (0x25, 0x63, 0xEB)).convert("RGBA")

    # Radial glow behind the face
    glow = radial_overlay(s, (54 * u, 54 * u), 42 * u, (255, 255, 255), 0x33)
    base.alpha_composite(glow)

    # Drop shadow under face
    shadow = ellipse_filled(s, (54 * u, 57 * u), (30 * u, 30 * u), (0, 0, 0), 30)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=4))
    base.alpha_composite(shadow)

    # Yellow face with vertical gradient
    face = vertical_gradient_circle(
        s, (54 * u, 54 * u), 30 * u, (0xFF, 0xE3, 0x4D), (0xFF, 0xA8, 0x00)
    )
    base.alpha_composite(face)

    # Inner rim (darker ring)
    rim = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(rim)
    d.ellipse(
        (54 * u - 30 * u, 54 * u - 30 * u, 54 * u + 30 * u, 54 * u + 30 * u),
        outline=(0xC7, 0x77, 0x00, 46),
        width=int(2.5 * u),
    )
    base.alpha_composite(rim)

    # Top highlight
    hl = ellipse_filled(s, (54 * u, 38 * u), (19 * u, 11 * u), (255, 255, 255), 90)
    base.alpha_composite(hl)

    # Cheek blush
    base.alpha_composite(
        ellipse_filled(s, (34 * u, 60 * u), (3.5 * u, 2.2 * u), (0xFF, 0x6B, 0x9D), 115)
    )
    base.alpha_composite(
        ellipse_filled(s, (74 * u, 60 * u), (3.5 * u, 2.2 * u), (0xFF, 0x6B, 0x9D), 115)
    )

    # Eyes
    eye_colour = (0x2D, 0x18, 0x10)
    base.alpha_composite(ellipse_filled(s, (44 * u, 47 * u), (3 * u, 4.5 * u), eye_colour))
    base.alpha_composite(ellipse_filled(s, (64 * u, 47 * u), (3 * u, 4.5 * u), eye_colour))

    # Eye highlights
    base.alpha_composite(
        ellipse_filled(s, (45 * u, 45 * u), (0.9 * u, 1.2 * u), (255, 255, 255))
    )
    base.alpha_composite(
        ellipse_filled(s, (65 * u, 45 * u), (0.9 * u, 1.2 * u), (255, 255, 255))
    )

    # Smile rendered as overlapping discs along a quadratic Bezier
    smile = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(smile)
    r = 2.5 * u
    for i in range(400):
        t = i / 399
        x = ((1 - t) ** 2 * 41 + 2 * (1 - t) * t * 54 + t * t * 67) * u
        y = ((1 - t) ** 2 * 61 + 2 * (1 - t) * t * 76 + t * t * 61) * u
        sd.ellipse((x - r, y - r, x + r, y + r), fill=eye_colour)
    base.alpha_composite(smile)

    base.convert("RGB").save(OUTPUT, "PNG", optimize=True)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
