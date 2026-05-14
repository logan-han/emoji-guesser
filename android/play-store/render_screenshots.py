"""Render the five Play Store phone screenshots at 1080x2400.

Mirrors the Compose UI in android/app/src/main/java/com/emojiguesser/ui. Keep in
sync when screen layouts change. Run with the project venv at
/tmp/.play-store-venv (pillow + pilmoji + emoji).

Output files:
  screenshots/01-lobby.png
  screenshots/02-waiting-room.png
  screenshots/03-describer.png
  screenshots/04-guesser.png
  screenshots/05-game-over.png
"""
from __future__ import annotations

import math
import os
import random
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont
from pilmoji import Pilmoji
from pilmoji.source import AppleEmojiSource

# Device profile defaults — overridden per-render via set_profile().
# Phone: Pixel 7 (1080x2400 @ density 2.625).
# 7" tablet: 1200x1920 @ density 2.0 (Nexus 7-class).
# 10" tablet: 1600x2560 @ density 2.0 (Pixel-tablet-class).
WIDTH, HEIGHT = 1080, 2400
DENSITY = 2.625

BASE_OUT = os.path.join(os.path.dirname(__file__), "screenshots")
OUT_DIR = BASE_OUT
FONT_DIR = "/tmp/play-store-fonts"


def set_profile(width: int, height: int, density: float, subdir: str = ""):
    global WIDTH, HEIGHT, DENSITY, OUT_DIR
    WIDTH, HEIGHT, DENSITY = width, height, density
    OUT_DIR = os.path.join(BASE_OUT, subdir) if subdir else BASE_OUT

# Theme colours mirror android/app/src/main/java/com/emojiguesser/ui/theme/Color.kt.
PAPER = (0xFB, 0xF6, 0xEC)
BG = (0xF4, 0xEC, 0xDF)
BG2 = (0xEB, 0xE1, 0xD0)
INK = (0x1D, 0x1A, 0x17)
INK_SOFT = (0x6E, 0x64, 0x5A)
INK_FAINT = (0xA8, 0x9F, 0x93)
HAIRLINE_A = 0x24
HAIRLINE_STRONG_A = 0x47

TOMATO = (0xC4, 0x4A, 0x2E)
GOLD = (0xD9, 0xA2, 0x27)
TEAL = (0x3F, 0x8A, 0x93)
PLUM = (0x7A, 0x3B, 0x7B)
SAGE = (0x7B, 0xA0, 0x71)


def dp(v: float) -> int:
    return round(v * DENSITY)


def sp(v: float) -> int:
    return round(v * DENSITY)


_fonts: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(family: str, size: int) -> ImageFont.FreeTypeFont:
    key = (family, size)
    if key not in _fonts:
        path = {
            "inter-r": f"{FONT_DIR}/extras/ttf/Inter-Regular.ttf",
            "inter-m": f"{FONT_DIR}/extras/ttf/Inter-Medium.ttf",
            "inter-sb": f"{FONT_DIR}/extras/ttf/Inter-SemiBold.ttf",
            "inter-b": f"{FONT_DIR}/extras/ttf/Inter-Bold.ttf",
            "serif-r": f"{FONT_DIR}/instrument-serif-main/fonts/ttf/InstrumentSerif-Regular.ttf",
            "serif-i": f"{FONT_DIR}/instrument-serif-main/fonts/ttf/InstrumentSerif-Italic.ttf",
            "mono-r": f"{FONT_DIR}/fonts/ttf/JetBrainsMono-Regular.ttf",
            "mono-m": f"{FONT_DIR}/fonts/ttf/JetBrainsMono-Medium.ttf",
        }[family]
        _fonts[key] = ImageFont.truetype(path, size)
    return _fonts[key]


@dataclass
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def right(self) -> int:
        return self.x + self.w

    @property
    def bottom(self) -> int:
        return self.y + self.h

    @property
    def cx(self) -> int:
        return self.x + self.w // 2

    @property
    def cy(self) -> int:
        return self.y + self.h // 2


def rounded_rect(draw, rect, radius, fill=None, outline=None, width=0):
    draw.rounded_rectangle(
        (rect.x, rect.y, rect.right, rect.bottom),
        radius=radius, fill=fill, outline=outline, width=width,
    )


def stamp_card(
    img,
    rect,
    *,
    fill=PAPER,
    border=INK,
    radius_dp=14,
    shadow_dp=3,
    border_dp=1.5,
    rotate_deg=0,
):
    radius = dp(radius_dp)
    offset = dp(shadow_dp)
    bw = max(2, round(dp(border_dp)))
    if rotate_deg == 0:
        d = ImageDraw.Draw(img)
        rounded_rect(d, Rect(rect.x + offset, rect.y + offset, rect.w, rect.h),
                     radius, fill=INK)
        rounded_rect(d, rect, radius, fill=fill)
        rounded_rect(d, rect, radius, outline=border, width=bw)
        return
    margin = dp(80)
    cw = rect.w + offset + margin * 2
    ch = rect.h + offset + margin * 2
    layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    lr = Rect(margin, margin, rect.w, rect.h)
    rounded_rect(ld, Rect(lr.x + offset, lr.y + offset, lr.w, lr.h),
                 radius, fill=INK)
    rounded_rect(ld, lr, radius, fill=fill)
    rounded_rect(ld, lr, radius, outline=border, width=bw)
    layer = layer.rotate(rotate_deg, resample=Image.BICUBIC, expand=True)
    px = rect.x + rect.w // 2 - layer.width // 2
    py = rect.y + rect.h // 2 - layer.height // 2
    img.alpha_composite(layer, dest=(px, py))


def stamp_button(
    img, rect, label,
    *, fill=INK, fg=PAPER,
    radius_dp=12, shadow_dp=3,
    font_size_sp=13, letter_spacing_sp=0.6,
    pressed=False, emoji=False,
):
    radius = dp(radius_dp)
    offset = 0 if pressed else dp(shadow_dp)
    d = ImageDraw.Draw(img)
    if offset:
        rounded_rect(d, Rect(rect.x + offset, rect.y + offset, rect.w, rect.h),
                     radius, fill=INK)
    rounded_rect(d, rect, radius, fill=fill)
    rounded_rect(d, rect, radius, outline=INK, width=max(2, round(dp(1.5))))
    f = font("inter-sb", sp(font_size_sp))
    text = label.upper() if not emoji else label
    if emoji:
        with Pilmoji(img, source=AppleEmojiSource) as pmoji:
            pmoji.text((rect.cx, rect.cy), text, fill=fg, font=f, anchor="mm",
                       emoji_scale_factor=1.0)
    else:
        draw_text_letter_spaced(img, text, (rect.cx, rect.cy), f, fg,
                                letter_spacing_sp, anchor="mm")


def measure(text, fnt):
    bbox = fnt.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_text_letter_spaced(img, text, xy, fnt, fill, letter_spacing_sp, anchor="lt"):
    spacing_px = sp(letter_spacing_sp)
    widths = [fnt.getlength(c) for c in text]
    total = sum(widths) + spacing_px * max(0, len(text) - 1)
    ascent, _ = fnt.getmetrics()
    if anchor[0] == "m":
        x = xy[0] - total / 2
    elif anchor[0] == "r":
        x = xy[0] - total
    else:
        x = xy[0]
    if anchor[1] == "m":
        y = xy[1] - ascent / 2
    elif anchor[1] == "b":
        y = xy[1] - ascent
    else:
        y = xy[1]
    d = ImageDraw.Draw(img)
    for ch, w in zip(text, widths):
        d.text((x, y), ch, fill=fill, font=fnt)
        x += w + spacing_px


def background_canvas():
    return Image.new("RGBA", (WIDTH, HEIGHT), (*BG, 255))


def draw_emoji(img, xy, emoji, size_sp, anchor="mm", scale=1.0):
    f = font("inter-r", sp(size_sp))
    with Pilmoji(img, source=AppleEmojiSource) as pmoji:
        pmoji.text(xy, emoji, font=f, anchor=anchor, emoji_scale_factor=scale)


# --- Brand mark -----------------------------------------------------------------
def draw_brand_mark(img, x, y):
    """🎯 in 48dp tile rotated -4°, then 'Emoji Guesser' display text."""
    tile_size = dp(48)
    margin = dp(20)
    layer = Image.new("RGBA", (tile_size + margin * 2, tile_size + margin * 2),
                      (0, 0, 0, 0))
    td = ImageDraw.Draw(layer)
    tile_rect = Rect(margin, margin, tile_size, tile_size)
    radius = dp(10)
    offset = dp(2)
    rounded_rect(td, Rect(tile_rect.x + offset, tile_rect.y + offset, tile_rect.w, tile_rect.h),
                 radius, fill=INK)
    rounded_rect(td, tile_rect, radius, fill=PAPER)
    rounded_rect(td, tile_rect, radius, outline=INK, width=max(2, round(dp(1.5))))
    # Emoji centred in tile. Use small font + scale ~0.7 so it fits.
    f_emoji = font("inter-r", sp(28))
    with Pilmoji(layer, source=AppleEmojiSource) as pmoji:
        pmoji.text((tile_rect.cx, tile_rect.cy), "🎯", font=f_emoji,
                   anchor="mm", emoji_scale_factor=0.95)
    rotated = layer.rotate(4, resample=Image.BICUBIC, expand=True)
    px = x - (rotated.width - tile_size) // 2
    py = y - (rotated.height - tile_size) // 2
    img.alpha_composite(rotated, dest=(px, py))

    # Title text right of the tile.
    tx = px + rotated.width - dp(4)
    ty = y + tile_size // 2
    f_serif = font("serif-r", sp(34))
    f_serif_it = font("serif-i", sp(34))
    emoji_part = "Emoji "
    guesser_part = "Guesser"
    ew = f_serif.getlength(emoji_part)
    d = ImageDraw.Draw(img)
    d.text((tx, ty), emoji_part, fill=INK, font=f_serif, anchor="lm")
    d.text((tx + ew, ty), guesser_part, fill=TOMATO, font=f_serif_it, anchor="lm")


def draw_connection_pill(img, x_right, y_center, label="Live"):
    pad_x, pad_y = dp(12), dp(6)
    fnt = font("inter-r", sp(13))
    text_w, text_h = measure(label, fnt)
    gap = dp(8)
    dot_size = dp(8)
    pill_w = pad_x * 2 + dot_size + gap + text_w
    pill_h = pad_y * 2 + max(dot_size, text_h)
    x = x_right - pill_w
    y = y_center - pill_h // 2
    d = ImageDraw.Draw(img)
    rect = Rect(x, y, pill_w, pill_h)
    rounded_rect(d, rect, pill_h // 2, fill=PAPER,
                 outline=(*INK, HAIRLINE_STRONG_A), width=max(1, round(dp(1))))
    d.ellipse((x + pad_x, y + (pill_h - dot_size) // 2,
               x + pad_x + dot_size, y + (pill_h + dot_size) // 2), fill=SAGE)
    d.text((x + pad_x + dot_size + gap, y + pill_h // 2), label,
           fill=INK_SOFT, font=fnt, anchor="lm")


def draw_status_bar(img):
    bar_h = dp(30)
    d = ImageDraw.Draw(img)
    fnt = font("inter-sb", sp(13))
    d.text((dp(24), bar_h // 2 + dp(8)), "9:41", fill=INK, font=fnt, anchor="lm")
    rx = WIDTH - dp(24)
    bw, bh = dp(22), dp(10)
    by = bar_h // 2 + dp(8) - bh // 2
    d.rounded_rectangle((rx - bw, by, rx, by + bh), radius=dp(2),
                        outline=INK, width=max(1, round(dp(1))))
    d.rounded_rectangle((rx - bw + dp(2), by + dp(2), rx - dp(3), by + bh - dp(2)),
                        radius=dp(1), fill=INK)
    wx = rx - bw - dp(10)
    for i in range(3):
        r = dp(3) + i * dp(2)
        d.arc((wx - r, by + bh // 2 - r + dp(2), wx + r, by + bh // 2 + r + dp(2)),
              start=225, end=315, fill=INK, width=max(1, round(dp(1.5))))
    sx = wx - dp(20)
    for i in range(4):
        bx = sx + i * dp(4)
        bh2 = dp(3) + i * dp(2)
        d.rectangle((bx, by + bh - bh2, bx + dp(3), by + bh), fill=INK)


# --- Header card used in game screens ------------------------------------------
def draw_round_header(img, x, y, w):
    rh = dp(72)
    r_rect = Rect(x, y, w, rh)
    stamp_card(img, r_rect)
    d = ImageDraw.Draw(img)
    d.text((r_rect.x + dp(16), r_rect.y + dp(14)),
           "Round 2 / 4", fill=INK, font=font("inter-sb", sp(14)), anchor="lt")
    d.text((r_rect.x + dp(16), r_rect.y + dp(14) + dp(22)),
           "Describer: Logan", fill=INK_SOFT, font=font("inter-r", sp(13)), anchor="lt")
    cx_close = r_rect.right - dp(20)
    cy_close = r_rect.cy
    cs = dp(7)
    d.line((cx_close - cs, cy_close - cs, cx_close + cs, cy_close + cs),
           fill=INK, width=max(2, dp(1.5)))
    d.line((cx_close - cs, cy_close + cs, cx_close + cs, cy_close - cs),
           fill=INK, width=max(2, dp(1.5)))
    return r_rect.bottom


# --- Scoreboard ----------------------------------------------------------------
def draw_scoreboard(img, x, y, w, players, current=None):
    d = ImageDraw.Draw(img)
    chip_w = dp(100)
    chip_h = dp(64)
    gap = dp(8)
    cx = x
    for name, score in players:
        is_cur = name == current
        bg = INK if is_cur else PAPER
        fg = PAPER if is_cur else INK
        rect = Rect(cx, y, chip_w, chip_h)
        rounded_rect(d, rect, dp(10), fill=bg, outline=INK, width=max(2, round(dp(1))))
        d.text((rect.cx, rect.y + dp(18)), name, fill=fg,
               font=font("inter-m", sp(13)), anchor="mm")
        d.text((rect.cx, rect.y + dp(44)), str(score), fill=fg,
               font=font("inter-sb", sp(18)), anchor="mm")
        cx += chip_w + gap


# --- Screen 1: Lobby ------------------------------------------------------------
def render_lobby():
    img = background_canvas()
    draw_status_bar(img)
    d = ImageDraw.Draw(img)

    pad_x = dp(20)
    # Centre content vertically on tall canvases (10" tablet). Phone/7" unchanged.
    slack_dp = (HEIGHT / DENSITY) - 800
    y = dp(64) + (dp(int(slack_dp // 2)) if slack_dp > 200 else 0)

    draw_brand_mark(img, pad_x, y)
    draw_connection_pill(img, WIDTH - pad_x, y + dp(24), "Live")

    y += dp(48 + 20)
    f_body = font("inter-r", sp(15))
    wrap_and_draw(img, "Describe words using only emojis. Friends race to guess. Win the round.",
                  (pad_x, y), WIDTH - pad_x * 2, f_body, INK_SOFT, line_height_sp=22)
    y += dp(60)

    name_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(112))
    stamp_card(img, name_rect)
    inner_x = name_rect.x + dp(16)
    inner_y = name_rect.y + dp(16)
    draw_text_letter_spaced(img, "YOUR NAME", (inner_x, inner_y),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8)
    tf_rect = Rect(inner_x, inner_y + dp(24), name_rect.w - dp(32), dp(54))
    rounded_rect(d, tf_rect, dp(10), fill=PAPER,
                 outline=(*INK, HAIRLINE_STRONG_A), width=max(2, round(dp(1.5))))
    d.text((tf_rect.x + dp(16), tf_rect.cy), "Logan",
           fill=INK, font=font("inter-r", sp(16)), anchor="lm")

    y = name_rect.bottom + dp(16)

    create_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(244))
    stamp_card(img, create_rect)
    cx = create_rect.x + dp(16)
    cy = create_rect.y + dp(16)
    d.text((cx, cy), "Create a game", fill=INK, font=font("inter-m", sp(16)), anchor="lt")
    cy += dp(36)
    d.text((cx, cy + dp(10)), "Public game", fill=INK,
           font=font("inter-r", sp(15)), anchor="lm")
    sw_w, sw_h = dp(52), dp(32)
    sw_x = create_rect.right - dp(16) - sw_w
    sw_y = cy + dp(10) - sw_h // 2
    sw_rect = Rect(sw_x, sw_y, sw_w, sw_h)
    rounded_rect(d, sw_rect, sw_h // 2, fill=BG2,
                 outline=(*INK, HAIRLINE_STRONG_A), width=max(2, round(dp(1.5))))
    thumb_r = (sw_h - dp(6)) // 2
    d.ellipse((sw_x + dp(3), sw_y + dp(3),
               sw_x + dp(3) + thumb_r * 2, sw_y + dp(3) + thumb_r * 2),
              fill=INK_SOFT)
    cy += dp(34)
    d.text((cx, cy + dp(6)), "Time limit: 120s", fill=INK_SOFT,
           font=font("inter-r", sp(13)), anchor="lm")
    cy += dp(20)
    slider_y = cy + dp(20)
    slider_rect = Rect(cx, slider_y - dp(2), create_rect.w - dp(32), dp(4))
    d.rounded_rectangle((slider_rect.x, slider_rect.y,
                         slider_rect.right, slider_rect.bottom),
                        radius=dp(2), fill=BG2)
    active_w = int(slider_rect.w * 0.36)
    d.rounded_rectangle((slider_rect.x, slider_rect.y,
                         slider_rect.x + active_w, slider_rect.bottom),
                        radius=dp(2), fill=INK)
    th_x = slider_rect.x + active_w
    th_r = dp(10)
    d.ellipse((th_x - th_r, slider_y - th_r,
               th_x + th_r, slider_y + th_r), fill=INK)
    cy += dp(38)
    btn_rect = Rect(cx, cy, create_rect.w - dp(32), dp(48))
    stamp_button(img, btn_rect, "Create game")

    y = create_rect.bottom + dp(16)

    join_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(220))
    stamp_card(img, join_rect)
    jx = join_rect.x + dp(16)
    jy = join_rect.y + dp(16)
    d.text((jx, jy), "Join a game", fill=INK,
           font=font("inter-m", sp(16)), anchor="lt")
    jy += dp(36)
    code_rect = Rect(jx, jy, join_rect.w - dp(32), dp(54))
    rounded_rect(d, code_rect, dp(10), fill=PAPER,
                 outline=(*INK, HAIRLINE_STRONG_A), width=max(2, round(dp(1.5))))
    draw_text_letter_spaced(img, "K4F2BX", (code_rect.x + dp(16), code_rect.cy),
                            font("mono-m", sp(18)), INK, 4, anchor="lm")
    jy += dp(64)
    stamp_button(img, Rect(jx, jy, join_rect.w - dp(32), dp(48)),
                 "Join game", fill=PAPER, fg=INK)
    jy += dp(64)
    d.text((join_rect.cx, jy), "Show 3 public games", fill=INK,
           font=font("inter-m", sp(13)), anchor="mm")

    return img


def wrap_and_draw(img, text, xy, max_w, fnt, fill, line_height_sp=22):
    d = ImageDraw.Draw(img)
    words = text.split()
    lines, cur = [], []
    for w in words:
        trial = " ".join(cur + [w])
        if fnt.getlength(trial) <= max_w:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    x, y = xy
    lh = sp(line_height_sp)
    for line in lines:
        d.text((x, y), line, fill=fill, font=fnt)
        y += lh


# --- Screen 2: Waiting room -----------------------------------------------------
def render_waiting_room():
    img = background_canvas()
    draw_status_bar(img)
    d = ImageDraw.Draw(img)

    pad_x = dp(20)
    y = dp(64)

    # Code card
    code_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(210))
    stamp_card(img, code_rect)
    cx = code_rect.cx
    cy = code_rect.y + dp(20)
    draw_text_letter_spaced(img, "GAME CODE", (cx, cy),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8, anchor="mt")
    cy += dp(32)
    draw_text_letter_spaced(img, "K4F2BX", (cx, cy + dp(36)),
                            font("mono-m", sp(40)), INK, 6, anchor="mm")
    cy += dp(76)
    btn_w, btn_h = dp(160), dp(44)
    btn_rect = Rect(cx - btn_w // 2, cy, btn_w, btn_h)
    stamp_button(img, btn_rect, "Copy code", fill=PAPER, fg=INK)

    y = code_rect.bottom + dp(16)

    # Players card — fills remaining vertical space minus time card + buttons.
    bottom_reserve = dp(96) + dp(16) + dp(48) + dp(20)  # time + gap + buttons + bottom pad
    players_h = HEIGHT - y - bottom_reserve - dp(16)
    players_rect = Rect(pad_x, y, WIDTH - pad_x * 2, players_h)
    stamp_card(img, players_rect)
    px = players_rect.x + dp(16)
    py = players_rect.y + dp(16)
    d.text((px, py), "Players (4)", fill=INK,
           font=font("inter-m", sp(16)), anchor="lt")
    py += dp(40)
    players = [("Logan", True), ("Mei", False), ("Daniel", False), ("Priya", False)]
    name_font_b = font("inter-sb", sp(15))
    name_font_r = font("inter-r", sp(15))
    for i, (name, owner) in enumerate(players):
        # Top-anchored row so crown image aligns with text top.
        row_top = py + dp(4)
        if owner:
            d.text((px, row_top), name, fill=INK, font=name_font_b, anchor="lt")
            tw = name_font_b.getlength(name)
            with Pilmoji(img, source=AppleEmojiSource) as pmoji:
                pmoji.text((int(px + tw + dp(6)), int(row_top - dp(2))),
                           "👑", font=font("inter-r", sp(16)), anchor="lt",
                           emoji_scale_factor=1.0)
        else:
            d.text((px, row_top), name, fill=INK, font=name_font_r, anchor="lt")
        py += dp(40)
        if i < len(players) - 1:
            d.line((px, py - dp(4), players_rect.right - dp(16), py - dp(4)),
                   fill=(*INK, HAIRLINE_A), width=1)

    y = players_rect.bottom + dp(16)

    # Time limit slider card
    time_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(96))
    stamp_card(img, time_rect)
    tx = time_rect.x + dp(16)
    ty = time_rect.y + dp(16)
    d.text((tx, ty + dp(8)), "Time limit: 120s", fill=INK_SOFT,
           font=font("inter-r", sp(13)), anchor="lm")
    ty += dp(40)
    slider_w = time_rect.w - dp(32)
    sd_rect = Rect(tx, ty, slider_w, dp(4))
    d.rounded_rectangle((sd_rect.x, sd_rect.y, sd_rect.right, sd_rect.bottom),
                        radius=dp(2), fill=BG2)
    active_w = int(slider_w * 0.36)
    d.rounded_rectangle((sd_rect.x, sd_rect.y, sd_rect.x + active_w, sd_rect.bottom),
                        radius=dp(2), fill=INK)
    th_r = dp(10)
    d.ellipse((sd_rect.x + active_w - th_r, sd_rect.cy - th_r,
               sd_rect.x + active_w + th_r, sd_rect.cy + th_r), fill=INK)

    y = time_rect.bottom + dp(16)
    half = (WIDTH - pad_x * 2 - dp(12)) // 2
    stamp_button(img, Rect(pad_x, y, half, dp(48)), "Leave", fill=PAPER, fg=INK)
    stamp_button(img, Rect(pad_x + half + dp(12), y, half, dp(48)), "Start game")

    return img


# --- Screen 3: Describer view ---------------------------------------------------
def render_describer():
    img = background_canvas()
    draw_status_bar(img)
    d = ImageDraw.Draw(img)

    pad_x = dp(16)
    y = dp(56)
    y = draw_round_header(img, pad_x, y, WIDTH - pad_x * 2) + dp(10)

    # Secret word card (Sage)
    sw_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(150))
    stamp_card(img, sw_rect, fill=SAGE)
    draw_text_letter_spaced(img, "YOUR WORD", (sw_rect.cx, sw_rect.y + dp(18)),
                            font("inter-sb", sp(11)), PAPER, 1.8, anchor="mt")
    draw_text_letter_spaced(img, "PINEAPPLE", (sw_rect.cx, sw_rect.cy + dp(2)),
                            font("serif-r", sp(34)), PAPER, 1, anchor="mm")
    d.text((sw_rect.cx, sw_rect.bottom - dp(22)),
           "Describe using only emojis", fill=PAPER,
           font=font("inter-r", sp(12)), anchor="mm")
    y = sw_rect.bottom + dp(10)

    # Emojis & guesses card (smaller so picker fits below)
    em_h = dp(200)
    em_rect = Rect(pad_x, y, WIDTH - pad_x * 2, em_h)
    stamp_card(img, em_rect)
    draw_text_letter_spaced(img, "EMOJIS", (em_rect.x + dp(16), em_rect.y + dp(16)),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8)
    strip_y = em_rect.y + dp(36)
    strip_h = dp(70)
    emojis = ["🍍", "🌴", "🟡", "👑"]
    f_emoji_big = font("inter-r", sp(28))
    ex = em_rect.x + dp(16)
    for e in emojis:
        with Pilmoji(img, source=AppleEmojiSource) as pmoji:
            pmoji.text((ex, strip_y + strip_h // 2), e, font=f_emoji_big,
                       anchor="lm", emoji_scale_factor=1.0)
        ex += dp(48)
    div_y = strip_y + strip_h + dp(4)
    d.line((em_rect.x + dp(16), div_y, em_rect.right - dp(16), div_y),
           fill=(*INK, HAIRLINE_A), width=1)
    draw_text_letter_spaced(img, "GUESSES", (em_rect.x + dp(16), div_y + dp(10)),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8)
    gy = div_y + dp(28)
    for who, g in [("Mei", "fruit?"), ("Daniel", "lemon")]:
        d.text((em_rect.x + dp(16), gy), f"{who}: {g}", fill=INK_SOFT,
               font=font("inter-r", sp(13)), anchor="lt")
        gy += dp(22)

    y = em_rect.bottom + dp(10)

    # Send emoji button
    btn_rect = Rect(pad_x, y, WIDTH - pad_x * 2, dp(46))
    stamp_button(img, btn_rect, "Hide emoji picker")
    y = btn_rect.bottom + dp(8)

    # Emoji picker. Stretches to fill remaining space on tall canvases.
    scoreboard_h_total = dp(64) + dp(20)
    pk_h_target = HEIGHT - y - scoreboard_h_total - dp(12)
    pk_h = max(dp(240), pk_h_target) if pk_h_target > dp(280) else dp(240)
    pk_rect = Rect(pad_x, y, WIDTH - pad_x * 2, pk_h)
    rounded_rect(d, pk_rect, dp(12), fill=PAPER,
                 outline=INK, width=max(2, round(dp(1.5))))
    # Tab row
    tab_h = dp(38)
    tabs = ["😀", "👋", "🐶", "🍔", "⚽", "🚗", "💡", "❤️", "🏳️"]
    tab_w = pk_rect.w // len(tabs)
    for i, tab in enumerate(tabs):
        tx = pk_rect.x + i * tab_w + tab_w // 2
        ty = pk_rect.y + tab_h // 2
        with Pilmoji(img, source=AppleEmojiSource) as pmoji:
            pmoji.text((tx, ty), tab, font=font("inter-r", sp(18)),
                       anchor="mm", emoji_scale_factor=1.0)
        if i == 0:
            d.line((pk_rect.x + i * tab_w + dp(8), pk_rect.y + tab_h - dp(3),
                    pk_rect.x + (i + 1) * tab_w - dp(8), pk_rect.y + tab_h - dp(3)),
                   fill=INK, width=max(2, dp(1.5)))
    # Grid: cell_h stays constant; row count grows with available height.
    grid_y = pk_rect.y + tab_h + dp(4)
    grid_h = pk_h - tab_h - dp(8)
    cols = 8
    grid_emojis_all = [
        "😀","😃","😄","😁","😅","😂","🤣","😊",
        "😇","🙂","😉","😌","😍","🥰","😘","😗",
        "😋","😛","😜","🤪","😝","🤑","🤗","🤭",
        "🤫","🤔","🤐","🤨","😐","😑","😶","😏",
        "😒","🙄","😬","🤥","😪","🤤","😴","😷",
        "🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴",
        "😵","🤯","🤠","🥳","😎","🤓","🧐","😕",
        "😟","🙁","☹️","😮","😯","😲","😳","🥺",
    ]
    cell_h_target = dp(48)
    max_rows = min(len(grid_emojis_all) // cols, max(5, grid_h // cell_h_target))
    grid_emojis = grid_emojis_all[:max_rows * cols]
    cell_w = (pk_rect.w - dp(16)) // cols
    cell_h = grid_h // max_rows
    for i, e in enumerate(grid_emojis):
        col = i % cols
        row = i // cols
        ex2 = pk_rect.x + dp(8) + col * cell_w + cell_w // 2
        ey2 = grid_y + row * cell_h + cell_h // 2
        with Pilmoji(img, source=AppleEmojiSource) as pmoji:
            pmoji.text((ex2, ey2), e, font=font("inter-r", sp(22)),
                       anchor="mm", emoji_scale_factor=1.0)

    y = pk_rect.bottom + dp(12)

    # Scoreboard
    draw_scoreboard(img, pad_x, y, WIDTH - pad_x * 2,
                    players=[("Logan", 8), ("Mei", 5), ("Daniel", 3), ("Priya", 1)],
                    current="Logan")

    return img


# --- Screen 4: Guesser view -----------------------------------------------------
def render_guesser():
    img = background_canvas()
    draw_status_bar(img)
    d = ImageDraw.Draw(img)

    pad_x = dp(16)
    y = dp(56)
    y = draw_round_header(img, pad_x, y, WIDTH - pad_x * 2) + dp(10)

    # Hint card (Teal)
    hint_h = dp(112)
    hint_rect = Rect(pad_x, y, WIDTH - pad_x * 2, hint_h)
    stamp_card(img, hint_rect, fill=TEAL)
    draw_text_letter_spaced(img, "HINT", (hint_rect.cx, hint_rect.y + dp(12)),
                            font("inter-sb", sp(11)), PAPER, 1.8, anchor="mt")
    hint = "P_NEAPPLE"
    tile_size = dp(34)
    gap = dp(6)
    total_w = len(hint) * tile_size + (len(hint) - 1) * gap
    tx = hint_rect.cx - total_w // 2
    ty = hint_rect.y + dp(46)
    for ch in hint:
        tile_rect = Rect(tx, ty, tile_size, tile_size)
        rounded_rect(d, tile_rect, dp(6), fill=PAPER,
                     outline=INK, width=max(2, round(dp(1.5))))
        if ch != '_':
            d.text((tile_rect.cx, tile_rect.cy + dp(1)),
                   ch.upper(), fill=INK,
                   font=font("mono-m", sp(18)), anchor="mm")
        tx += tile_size + gap

    y = hint_rect.bottom + dp(10)

    # Emojis & guesses card (taller — fills available)
    bottom_reserve = dp(56) + dp(12) + dp(70) + dp(20)  # input + gap + scoreboard + bottom
    em_h = HEIGHT - y - bottom_reserve - dp(10)
    em_rect = Rect(pad_x, y, WIDTH - pad_x * 2, em_h)
    stamp_card(img, em_rect)
    draw_text_letter_spaced(img, "EMOJIS", (em_rect.x + dp(16), em_rect.y + dp(16)),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8)
    strip_y = em_rect.y + dp(36)
    strip_h = dp(70)
    emojis = ["🍍", "🌴", "🟡", "👑", "🥤"]
    f_emoji_big = font("inter-r", sp(28))
    ex = em_rect.x + dp(16)
    for e in emojis:
        with Pilmoji(img, source=AppleEmojiSource) as pmoji:
            pmoji.text((ex, strip_y + strip_h // 2), e, font=f_emoji_big,
                       anchor="lm", emoji_scale_factor=1.0)
        ex += dp(48)
    div_y = strip_y + strip_h + dp(4)
    d.line((em_rect.x + dp(16), div_y, em_rect.right - dp(16), div_y),
           fill=(*INK, HAIRLINE_A), width=1)
    draw_text_letter_spaced(img, "GUESSES", (em_rect.x + dp(16), div_y + dp(10)),
                            font("inter-sb", sp(11)), INK_SOFT, 1.8)
    gy = div_y + dp(28)
    for who, g in [("Mei", "tropical?"), ("Daniel", "coconut"),
                    ("Priya", "mango"), ("Mei", "ananas?"),
                    ("You", "pine fruit")]:
        d.text((em_rect.x + dp(16), gy), f"{who}: {g}", fill=INK_SOFT,
               font=font("inter-r", sp(13)), anchor="lt")
        gy += dp(24)

    y = em_rect.bottom + dp(10)

    # Guess input + send
    in_h = dp(52)
    gap = dp(8)
    send_w = dp(72)
    in_rect = Rect(pad_x, y, WIDTH - pad_x * 2 - send_w - gap, in_h)
    rounded_rect(d, in_rect, dp(10), fill=PAPER,
                 outline=(*INK, HAIRLINE_STRONG_A), width=max(2, round(dp(1.5))))
    d.text((in_rect.x + dp(16), in_rect.cy), "pineapple",
           fill=INK, font=font("inter-r", sp(16)), anchor="lm")
    send_rect = Rect(in_rect.right + gap, y, send_w, in_h)
    # Use the proper "→" glyph from Inter rather than emoji.
    radius = dp(12)
    shadow_offset = dp(3)
    rounded_rect(d, Rect(send_rect.x + shadow_offset, send_rect.y + shadow_offset,
                          send_rect.w, send_rect.h), radius, fill=INK)
    rounded_rect(d, send_rect, radius, fill=INK)
    rounded_rect(d, send_rect, radius, outline=INK, width=max(2, round(dp(1.5))))
    d.text((send_rect.cx, send_rect.cy - dp(2)), "→",
           fill=PAPER, font=font("inter-b", sp(22)), anchor="mm")

    y = y + in_h + dp(12)

    draw_scoreboard(img, pad_x, y, WIDTH - pad_x * 2,
                    players=[("Mei", 7), ("Logan", 5), ("Priya", 3), ("Daniel", 2)],
                    current="Logan")

    return img


# --- Screen 5: Game over --------------------------------------------------------
def render_game_over():
    img = background_canvas()
    draw_status_bar(img)
    d = ImageDraw.Draw(img)

    pad_x = dp(20)
    y = dp(80)

    # Title
    draw_text_letter_spaced(img, "Game over", (WIDTH // 2, y),
                            font("serif-r", sp(48)), INK, 0, anchor="mt")
    y += dp(80)

    # Winner card (Gold, rotated -2°)
    win_rect = Rect(pad_x + dp(8), y, WIDTH - pad_x * 2 - dp(16), dp(260))
    stamp_card(img, win_rect, fill=GOLD, rotate_deg=2)
    # Compose card draws content un-rotated in our model — content placed before rotation.
    # Here we paint content after to keep it readable; place inside the un-rotated rect bounds.
    # Crown
    with Pilmoji(img, source=AppleEmojiSource) as pmoji:
        pmoji.text((win_rect.cx, win_rect.y + dp(50)), "👑",
                   font=font("inter-r", sp(56)), anchor="mt",
                   emoji_scale_factor=1.3)
    d.text((win_rect.cx, win_rect.y + dp(150)), "Mei", fill=INK,
           font=font("serif-r", sp(36)), anchor="mm")
    d.text((win_rect.cx, win_rect.y + dp(208)), "32 points", fill=INK,
           font=font("inter-m", sp(16)), anchor="mm")

    y = win_rect.bottom + dp(28)

    # Ranking
    bottom_reserve = dp(48) + dp(20)
    rank_h = HEIGHT - y - bottom_reserve - dp(16)
    rank_rect = Rect(pad_x, y, WIDTH - pad_x * 2, rank_h)
    stamp_card(img, rank_rect)
    rx = rank_rect.x + dp(20)
    rankings = [
        (1, "Mei", 32, GOLD),
        (2, "Logan", 24, INK_SOFT),
        (3, "Daniel", 18, TOMATO),
        (4, "Priya", 11, INK_SOFT),
    ]
    row_h = dp(60)
    # Centre rows vertically when card is much taller than needed (10" tablet).
    avail_h = rank_rect.h - dp(40)
    extra_h = max(0, avail_h - row_h * len(rankings))
    ry = rank_rect.y + dp(20) + (extra_h // 2 if extra_h > dp(200) else 0)
    for idx, name, score, colour in rankings:
        d.text((rx + dp(8), ry + dp(22)), f"{idx}.", fill=colour,
               font=font("inter-sb", sp(20)), anchor="lm")
        d.text((rx + dp(60), ry + dp(22)), name, fill=INK,
               font=font("inter-r", sp(18)), anchor="lm")
        d.text((rank_rect.right - dp(20), ry + dp(22)), str(score), fill=INK,
               font=font("inter-sb", sp(20)), anchor="rm")
        ry += row_h
        if idx < 4:
            d.line((rx, ry - dp(8), rank_rect.right - dp(20), ry - dp(8)),
                   fill=(*INK, HAIRLINE_A), width=1)

    y = rank_rect.bottom + dp(16)
    half = (WIDTH - pad_x * 2 - dp(12)) // 2
    stamp_button(img, Rect(pad_x, y, half, dp(48)), "Leave", fill=PAPER, fg=INK)
    stamp_button(img, Rect(pad_x + half + dp(12), y, half, dp(48)), "Play again")

    draw_confetti(img)

    return img


def draw_confetti(img):
    rng = random.Random(7)
    colours = [TOMATO, GOLD, TEAL, PLUM, SAGE]
    for _ in range(90):
        cx = rng.uniform(0, WIDTH)
        cy = rng.uniform(0, HEIGHT * 0.45)
        size = rng.uniform(dp(5), dp(11))
        c = rng.choice(colours)
        ang = rng.uniform(0, math.pi * 2)
        layer = Image.new("RGBA", (int(size * 2) + 4, int(size) + 4), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rectangle((2, 2, int(size * 2) + 1, int(size) + 1),
                     fill=(*c, 210))
        layer = layer.rotate(math.degrees(ang), resample=Image.BICUBIC, expand=True)
        img.alpha_composite(layer, dest=(int(cx - layer.width / 2),
                                          int(cy - layer.height / 2)))


# --- Entrypoint -----------------------------------------------------------------
def save(img, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(f"Wrote {path}")


PROFILES = [
    # (subdir, width, height, density)
    ("",          1080, 2400, 2.625),   # Phone (Pixel 7)
    ("tablet-7",  1200, 1920, 2.0),     # 7" tablet (1200x1920)
    ("tablet-10", 1600, 2560, 2.0),     # 10" tablet (1600x2560)
]


def main():
    for subdir, w, h, d in PROFILES:
        set_profile(w, h, d, subdir)
        label = subdir or "phone"
        print(f"--- Rendering {label} ({w}x{h} @ {d}x) ---")
        save(render_lobby(), "01-lobby.png")
        save(render_waiting_room(), "02-waiting-room.png")
        save(render_describer(), "03-describer.png")
        save(render_guesser(), "04-guesser.png")
        save(render_game_over(), "05-game-over.png")


if __name__ == "__main__":
    main()
