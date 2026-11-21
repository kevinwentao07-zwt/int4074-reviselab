"""Render the 30-second ReviseLab film. Requires Python, Pillow, NumPy and FFmpeg.

Run python3 render.py from any directory. Use --stills DIR to inspect the
composition without encoding. UI artwork uses the companion .aia's assets and
Designer copy, with sample essay text and data.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
from functools import lru_cache
from io import BytesIO
import json
from math import ceil, cos, floor, hypot, pi, radians, sin
from pathlib import Path
import subprocess
import tempfile
import wave
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent / "ReviseLab_v15.aia"
W, H, FPS, DURATION = 1920, 1080, 60, 30
NAVY, INK, SLATE = "#1E3A8A", "#101A31", "#505D74"
CLOUD, ICE, GOLD = "#F4F6FA", "#E8EEFB", "#FCD34D"
WHITE, BLUE = "#FFFFFF", "#416BD5"
BEFORE = "On the other hand, smartphones are useful because they help students."
AFTER = "In science class, students can film an experiment and replay it to spot what they missed."
DRAFT = (
    "Some schools ban smartphones because pupils may get distracted by them. "
    + BEFORE
    + " I think phones should be allowed when teachers give a clear purpose for their use."
)
DRAFT_LINES = [
    "Should schools ban smartphones?",
    "Some schools ban smartphones because",
    "pupils may get distracted by them.",
    "On the other hand, smartphones are",
    "useful because they help students.",
    "I think phones should be allowed when",
    "teachers give a clear purpose for their use.",
]

with ZipFile(PROJECT) as archive:
    LOGO = Image.open(BytesIO(archive.read("assets/logo_splash.png"))).convert("RGBA")
    SCREENS = {}
    for item in archive.namelist():
        if item.endswith(".scm"):
            contents = archive.read(item).decode().split("$JSON\n", 1)[1].split("\n|#", 1)[0]
            properties = json.loads(contents)["Properties"]
            pending = [properties]
            lookup = SCREENS.setdefault(Path(item).stem, {})
            while pending:
                component = pending.pop()
                lookup[component["$Name"]] = component
                pending.extend(component.get("$Components", []))


def label(screen, component):
    return SCREENS[screen][component]["Text"]


@lru_cache(maxsize=None)
def font(size, face):
    paths = {
        "display": "/System/Library/Fonts/Avenir Next.ttc",
        "bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "body": "/System/Library/Fonts/Supplemental/Arial.ttf",
        "hand": "/System/Library/Fonts/Noteworthy.ttc",
    }
    portable = {
        "display": "DejaVuSans-Bold.ttf",
        "bold": "DejaVuSans-Bold.ttf",
        "body": "DejaVuSans.ttf",
        "hand": "DejaVuSerif-Italic.ttf",
    }
    selected = paths[face] if Path(paths[face]).is_file() else portable[face]
    return ImageFont.truetype(selected, size)


def text(draw, x, y, value, size, color=INK, face="body", anchor="lt"):
    draw.text((x, y), value, font=font(size, face), fill=color, anchor=anchor)


def paragraph(draw, value, x, y, max_width, size, color=INK, face="body",
              line_height=None):
    line_height = line_height or round(size * 1.27)
    typeface = font(size, face)
    for block in value.split("\n"):
        line = ""
        for word in block.split():
            proposed = (line + " " + word).strip()
            if line and draw.textlength(proposed, font=typeface) > max_width:
                text(draw, x, y, line, size, color, face)
                y += line_height
                line = word
            else:
                line = proposed
        text(draw, x, y, line, size, color, face)
        y += line_height
    return y


def box(draw, x, y, width, height, fill, radius=14, outline=None, stroke=1):
    draw.rounded_rectangle((x, y, x + width, y + height), radius, fill=fill,
                           outline=outline, width=stroke)


def button(draw, value, x, y, width, height=47, fill=NAVY, color=WHITE,
           size=17):
    box(draw, x, y, width, height, fill, 10)
    text(draw, x + width / 2, y + height / 2, value, size, color, "bold", "mm")


def rule(draw, x, y, width, amount, color=GOLD):
    if amount > 0:
        box(draw, x, y, width * amount, 7, color, 4)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def reveal(t, delay=0, span=0.6):
    return ease((t - delay) / span)


@lru_cache(maxsize=None)
def backdrop(style):
    yy, xx = np.ogrid[:H, :W]
    rng = np.random.default_rng(51)
    grain = rng.normal(0, .55, size=(H, W))
    palette = {
        "night": ((9, 17, 46), (25, 38, 95), 1450, 470),
        "blue": ((20, 43, 116), (20, 48, 100), 1410, 436),
        "paper": ((249, 249, 248), (-15, -8, 4), 1430, 550),
        "score": ((240, 245, 255), (-14, -13, -5), 364, 550),
        "practice": ((251, 250, 245), (-13, -7, 2), 519, 429),
    }
    base, lift, cx, cy = palette[style]
    halo = np.exp(-1.65 * (((xx - cx) / 1190) ** 2 + ((yy - cy) / 820) ** 2))
    return Image.fromarray(np.stack([
        np.clip(base[i] + lift[i] * halo + grain, 0, 255).astype(np.uint8)
        for i in range(3)
    ], axis=2))


def over(canvas, layer, x, y, alpha=1):
    if alpha <= 0:
        return
    if alpha < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: round(v * alpha)))
    canvas.paste(layer, (round(x), round(y)), layer)


@lru_cache(maxsize=1)
def paper():
    ww, hh = 710, 850
    rng = np.random.default_rng(11)
    grain = rng.normal(0, 1.2, (hh, ww))
    yy, xx = np.ogrid[:hh, :ww]
    light = 6 * (1 - xx / ww) - 14 * (yy / hh)
    im = Image.fromarray(np.stack([
        np.clip(base + grain + light, 0, 255).astype(np.uint8)
        for base in (248, 246, 240)
    ], axis=2)).convert("RGBA")
    d = ImageDraw.Draw(im)
    for y in range(94, hh, 58):
        d.line((0, y, ww, y), fill="#CCD1D3", width=1)
    d.line((53, 0, 53, hh), fill="#D4B9BA", width=2)
    for i, line in enumerate(DRAFT_LINES):
        text(d, 79 + (i % 3) * 4, 56 + i * 58, line, 38 if i == 0 else 31,
             "#30446B", "hand")
    return im


PW, PH = 478, 846
UIX, UIY = 14, 14
IW, IH = PW - 2 * UIX, PH - 2 * UIY


def ui_shell(screen, subtitle=None, action=None):
    im = Image.new("RGBA", (IW, IH), CLOUD)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, IW, 93), fill=WHITE)
    text(d, 24, 14, "9:41", 13, INK, "bold")
    for i in range(4):
        box(d, IW - 66 + i * 5, 25 - (i + 1) * 3, 3, (i + 1) * 3, INK, 1)
    box(d, IW - 40, 16, 19, 10, WHITE, 3, INK)
    box(d, IW - 38, 18, 14, 6, INK, 2)
    d.line((0, 93, IW, 93), fill="#DAE2F0", width=1)
    text(d, 20, 55, "←", 22, NAVY, "bold")
    text(d, 59, 45, SCREENS[screen][screen]["Title"], 23, INK, "bold")
    if subtitle:
        text(d, 59, 74, subtitle, 14, SLATE)
    if action:
        button(d, action, IW - 124, 45, 112, 34, size=12)
    return im, d


def chip(d, title, x, y, w, fill=ICE, color=NAVY):
    button(d, title, x, y, w, 34, fill, color, 14)


def card(d, title, body, y, height, fill=WHITE, size=19):
    box(d, 18, y, 414, height, fill, 12)
    text(d, 34, y + 17, title, 13, NAVY, "bold")
    paragraph(d, body, 34, y + 44, 382, size, line_height=size + 6)


@lru_cache(maxsize=None)
def screen(key):
    kind = key.split("-")[0]
    if kind == "topic":
        im, d = ui_shell("Topic")
        chip(d, label("Topic", "BtnTask1"), 18, 114, 198)
        chip(d, label("Topic", "BtnTask2"), 232, 114, 198, NAVY, WHITE)
        card(d, "QUESTION", label("Topic", "LblPrompt2"), 172, 154, size=21)
        button(d, label("Topic", "BtnPlan"), 18, 347, 414)
    elif kind == "tutor":
        im, d = ui_shell("Tutor", label("Tutor", "LblStep"), "Start writing")
        for j, (name, width) in enumerate(zip(("Question type ✓", "Ideas", "Position", "Outline"),
                                               (132, 72, 84, 79))):
            left = (16, 155, 234, 325)[j]
            chip(d, name, left, 111, width, NAVY if j == 1 else ICE, WHITE if j == 1 else NAVY)
        box(d, 18, 168, 314, 100, WHITE, 13)
        paragraph(d, label("Tutor", "LblTutor1"), 35, 186, 278, 19)
        box(d, 124, 283, 306, 64, NAVY, 13)
        paragraph(d, label("Tutor", "LblStudent1"), 143, 305, 275, 18, WHITE)
        box(d, 18, 362, 398, 117, WHITE, 13)
        paragraph(d, label("Tutor", "LblTutor2"), 37, 381, 361, 20, face="bold")
        card(d, label("Tutor", "LblHintTitle"), label("Tutor", "LblHintText"),
             498, 78, "#FEF3C7", 15)
        box(d, 18, 638, 414, 56, WHITE, 10)
        text(d, 34, 657, "Your idea…", 18, SLATE)
        button(d, "Send", 345, 646, 78, 39)
        button(d, label("Tutor", "BtnHint"), 18, 708, 197, fill="#FEF3C7", color=INK)
        button(d, label("Tutor", "BtnNext"), 231, 708, 201, fill=ICE, color=NAVY)
    elif kind == "write":
        im, d = ui_shell("Write", label("Write", "LblStep"), "My plan")
        chip(d, "Photo", 18, 114, 202, NAVY, WHITE)
        chip(d, "Type", 230, 114, 202)
        button(d, label("Write", "BtnCamera"), 18, 167, 202, fill=ICE, color=NAVY)
        button(d, label("Write", "PickGallery"), 230, 167, 202, fill=ICE, color=NAVY)
        if key == "write-photo":
            thumb = paper().copy()
            thumb.thumbnail((326, 358))
            over(im, thumb, (IW - thumb.width) / 2, 234)
            text(d, IW / 2, 632, "Handwriting or printed text", 17, SLATE, anchor="mt")
        else:
            box(d, 18, 234, 414, 55, WHITE, 12)
            text(d, 34, 253, "Page 1", 17, NAVY, "bold")
            text(d, 416, 253, "✓", 19, NAVY, "bold", "rt")
            card(d, label("Write", "Lbl3"), DRAFT, 311, 244, size=21)
            button(d, label("Write", "BtnEstimate"), 18, 585, 414, 52)
    elif kind == "score":
        im, d = ui_shell("Score", label("Score", "LblStep"))
        box(d, 18, 114, 414, 131, WHITE, 12)
        button(d, label("Score", "BtnBand"), 35, 135, 92, 89, size=39)
        text(d, 147, 149, label("Score", "Lbl1"), 20, INK, "bold")
        text(d, 147, 180, label("Score", "Lbl2"), 17, SLATE)
        text(d, 147, 208, label("Score", "Lbl3"), 15, SLATE)
        box(d, 18, 265, 414, 266, WHITE, 12)
        for j, (criterion, score) in enumerate(zip(
            ("LblCrit1", "Lbl7", "Lbl9", "Lbl11"), ("Lbl6", "Lbl8", "Lbl10", "Lbl12")
        )):
            line = label("Score", criterion)
            value = label("Score", score)
            y = 289 + 61 * j
            text(d, 36, y, line, 17, INK, "bold")
            text(d, 410, y, value, 18, NAVY, "bold", "rt")
            box(d, 35, y + 27, 375, 7, ICE, 4)
            box(d, 35, y + 27, 375 * float(value) / 9, 7, NAVY, 4)
        card(d, label("Score", "Lbl13"), label("Score", "LblIssue1"), 553, 86, "#FEF3C7", 21)
        button(d, label("Score", "BtnWork"), 18, 658, 414, 53)
    elif kind == "feedback":
        im, d = ui_shell("Feedback", label("Feedback", "LblStep"))
        if key == "feedback-revise":
            card(d, "BEFORE", BEFORE, 114, 128, size=21)
            card(d, label("Feedback", "LblRevHintTitle"), label("Feedback", "LblRevHintText"),
                 259, 111, "#FEF3C7")
            card(d, label("Feedback", "Lbl5"), AFTER, 387, 153, size=21)
            button(d, label("Feedback", "BtnCheck"), 18, 560, 414, 53)
        else:
            card(d, "BEFORE", BEFORE, 114, 121, size=20)
            card(d, "AFTER    ✓ EXAMPLE ADDED", AFTER, 251, 155, size=21)
            box(d, 18, 424, 414, 118, ICE, 12)
            text(d, 35, 442, label("Feedback", "LblRescoredCap"), 13, NAVY, "bold")
            text(d, 35, 471, "Task Response", 18, INK, "bold")
            text(d, 411, 471, label("Feedback", "Lbl8"), 19, NAVY, "bold", "rt")
            text(d, 35, 508, "Overall estimate", 17, SLATE)
            text(d, 411, 508, label("Feedback", "Lbl10"), 17, SLATE, anchor="rt")
            card(d, label("Feedback", "Lbl11"), label("Feedback", "LblChanged"), 560, 81)
            button(d, label("Feedback", "BtnPractise"), 18, 658, 414, 53)
    elif kind == "practice":
        im, d = ui_shell("Practice", label("Practice", "LblStep"))
        card(d, label("Practice", "Lbl2"), label("Practice", "LblSkill"), 114, 106, ICE,
             23)
        card(d, label("Practice", "LblQCap"), label("Practice", "LblQuestion"), 236, 158,
             size=21)
        card(d, "YOUR PARAGRAPH", label("Practice", "LblQNote"), 410, 126, size=19)
        button(d, "Submit", 18, 554, 414, 53)
    else:
        im, d = ui_shell("Progress")
        box(d, 18, 114, 414, 307, WHITE, 12)
        text(d, 35, 136, label("Progress", "Lbl1"), 23, INK, "bold")
        text(d, 413, 146, "Latest essays", 14, SLATE, anchor="rt")
        for band in (5, 5.5, 6, 6.5, 7):
            cy = 348 - (band - 5) * 80
            text(d, 37, cy, f"{band:.1f}", 14, SLATE, anchor="lm")
            d.line((77, cy, 398, cy), fill="#DFE6F2", width=2)
        points = [(96, 308), (186, 268), (276, 268), (366, 268)]
        d.line(points, fill=NAVY, width=4, joint="curve")
        for j, (cx, cy) in enumerate(points):
            d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=NAVY)
            text(d, cx, 377, f"{j + 1}", 14, SLATE, anchor="mt")
        card(d, label("Progress", "Lbl4"), label("Progress", "Lbl5"), 441, 100)
        card(d, "NEXT FOCUS", label("Progress", "Lbl8"), 556, 95)
        button(d, label("Progress", "BtnMyEssays"), 18, 669, 414, 52)
    d.rounded_rectangle((170, IH - 17, IW - 170, IH - 11), radius=3, fill="#626E7D")
    return im


@lru_cache(maxsize=None)
def phone_art(key):
    margin = 62
    art = Image.new("RGBA", (PW + margin * 2, PH + margin * 2))
    shadow = Image.new("RGBA", art.size)
    box(ImageDraw.Draw(shadow), margin + 6, margin + 14, PW, PH, (10, 23, 52, 108), 54)
    art.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(23)))
    d = ImageDraw.Draw(art)
    box(d, margin, margin, PW, PH, "#192338", 52, "#485770", 3)
    box(d, margin + 6, margin + 6, PW - 12, PH - 12, "#080D16", 46)
    mask = Image.new("L", (IW, IH))
    box(ImageDraw.Draw(mask), 0, 0, IW - 1, IH - 1, 255, 38)
    art.paste(screen(key), (margin + UIX, margin + UIY), mask)
    return art


def mix(a, b, amount):
    return a + (b - a) * amount


def settle(t, delay=0, span=.35, overshoot=0):
    a = max(0.0, min(1.0, (t - delay) / span))
    return 1 + (a - 1) ** 3 + overshoot * a * (a - 1) ** 2


def float_layer(canvas, layer, cx, cy, scale=1, angle=0, alpha=1):
    if alpha <= 0:
        return
    if scale != 1:
        layer = layer.resize(tuple(max(1, round(n * scale)) for n in layer.size),
                             Image.Resampling.LANCZOS)
    if abs(angle) > .06:
        layer = layer.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    over(canvas, layer, cx - layer.width / 2, cy - layer.height / 2, alpha)


def plane(canvas, art, cx, cy, size=1, yaw=0, pitch=0, roll=0, alpha=1):
    """Project a flat asset into the stage's 3D camera with a perspective warp."""
    if alpha <= 0:
        return
    aw, ah = art.size
    rz, ry, rx = (radians(degrees) for degrees in (roll, yaw, pitch))
    focal = 1510
    quad = []
    for u, v in ((0, 0), (aw, 0), (aw, ah), (0, ah)):
        lx, ly = (u - aw / 2) * size, (v - ah / 2) * size
        x, z = cos(ry) * lx, -sin(ry) * lx
        y, z = cos(rx) * ly - sin(rx) * z, sin(rx) * ly + cos(rx) * z
        depth = focal / (focal + z)
        quad.append((cx + (cos(rz) * x - sin(rz) * y) * depth,
                     cy + (sin(rz) * x + cos(rz) * y) * depth))
    left = max(0, floor(min(x for x, _ in quad)))
    top = max(0, floor(min(y for _, y in quad)))
    right = min(W, ceil(max(x for x, _ in quad)))
    bottom = min(H, ceil(max(y for _, y in quad)))
    if right <= left or bottom <= top:
        return

    # Pillow maps each destination sample back into the source texture.
    matrix, target = [], []
    for (x, y), (u, v) in zip(quad, ((0, 0), (aw, 0), (aw, ah), (0, ah))):
        x, y = x - left, y - top
        matrix.extend(((x, y, 1, 0, 0, 0, -u * x, -u * y),
                       (0, 0, 0, x, y, 1, -v * x, -v * y)))
        target.extend((u, v))
    coefficients = np.linalg.solve(matrix, target)
    warped = art.transform((right - left, bottom - top), Image.Transform.PERSPECTIVE,
                           coefficients, Image.Resampling.BICUBIC)
    over(canvas, warped, left, top, alpha)


@lru_cache(maxsize=32)
def matte(width, height, radius, fill, shadow):
    margin = 47
    im = Image.new("RGBA", (width + 2 * margin, height + 2 * margin))
    if shadow:
        shade = Image.new("RGBA", im.size)
        box(ImageDraw.Draw(shade), margin, margin + 13, width, height,
            (7, 19, 42, shadow), radius)
        im.alpha_composite(shade.filter(ImageFilter.GaussianBlur(20)))
    box(ImageDraw.Draw(im), margin, margin, width, height, fill, radius)
    return im


def floating_card(canvas, painter, x, y, width, height, fill=WHITE, alpha=1, *,
                  angle=0, shadow=75, radius=25):
    if alpha <= 0:
        return
    art = matte(width, height, radius, fill, shadow).copy()
    painter(ImageDraw.Draw(art), 47, 47)
    float_layer(canvas, art, x + width / 2, y + height / 2, angle=angle, alpha=alpha)


def device(canvas, key, x, y, size, yaw=0, pitch=0, roll=0, alpha=1):
    plane(canvas, phone_art(key), x, y, size, yaw, pitch, roll, alpha)


@lru_cache(maxsize=96)
def title_line(value, size, fill, face):
    typeface = font(size, face)
    width = ceil(typeface.getlength(value)) + 16
    im = Image.new("RGBA", (width, ceil(size * 1.26)))
    text(ImageDraw.Draw(im), 4, 3, value, size, fill, face)
    return im


def animated_text(canvas, x, y, value, size, fill, t, delay=0, span=.31, *,
                  face="display", align="left", travel=34):
    a = settle(t, delay, span)
    if a <= 0:
        return
    im = title_line(value, size, fill, face)
    shift = round(travel * (1 - a))
    tip = max(1, im.height - shift)
    left = x - 4 if align == "left" else x - im.width / 2
    over(canvas, im.crop((0, 0, im.width, tip)), left, y + shift, min(1, a * 1.52))


def words(canvas, x, y, value, size, fill, t, delay=0):
    """Reveal a linked phrase word by word on the same baseline."""
    for j, word in enumerate(value.split()):
        animated_text(canvas, x, y, word, size, fill, t, delay + .064 * j, travel=47)
        x += font(size, "display").getlength(word + " ")


def eyebrow(canvas, value, x, y, t, dark=False, delay=0):
    animated_text(canvas, x, y, value, 23, "#D4E2FF" if dark else NAVY,
                  t, delay, face="bold", travel=18)


def note(canvas, dark=False, sample=None):
    value = "Illustrative app preview"
    if sample:
        value += "  ·  " + sample
    text(ImageDraw.Draw(canvas), 106, 1023, value, 21, "#D4DEFB" if dark else SLATE)


def halo(canvas, x, y, radius, color, alpha):
    if alpha <= 0:
        return
    im = Image.new("RGBA", (radius * 2 + 8, radius * 2 + 8))
    ImageDraw.Draw(im).ellipse((4, 4, radius * 2 + 4, radius * 2 + 4),
                              outline=color, width=3)
    over(canvas, im, x - radius - 4, y - radius - 4, alpha)


def tap(canvas, x, y, t, at, ink=GOLD):
    p = (t - at) / .31
    if 0 <= p <= 1:
        halo(canvas, x, y, round(13 + 45 * settle(p, span=1)), ink, (1 - p) ** 1.15)


def segment(draw, points, amount, fill, width):
    """Draw a round-ended path up to the given fraction of its length."""
    if amount <= 0:
        return
    lengths = [hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(points, points[1:])]
    remaining = min(1, amount) * sum(lengths)
    edge = [points[0]]
    for (x, y), (next_x, next_y), length in zip(points, points[1:], lengths):
        ratio = min(1, remaining / length)
        edge.append((mix(x, next_x, ratio), mix(y, next_y, ratio)))
        remaining -= length
        if remaining <= 0:
            break
    draw.line(edge, fill=fill, width=width, joint="curve")
    radius = width / 2
    for x, y in (edge[0], edge[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def mini_label(draw, x, y, title, fill=WHITE, ink=NAVY):
    width = ceil(font(21, "bold").getlength(title)) + 54
    box(draw, x, y, width, 49, fill, 24)
    text(draw, x + 27, y + 12, title, 21, ink, "bold")


@lru_cache(maxsize=8)
def paper_back(col):
    im = Image.new("RGBA", (710, 850))
    box(ImageDraw.Draw(im), 0, 0, 709, 849, col, 7)
    return im


def page_macro(canvas, t):
    p = reveal(t, 0, .79)
    art = paper().copy()
    rule(ImageDraw.Draw(art), 85, 325, 430, reveal(t, .017, .48))
    plane(canvas, art, 1030 - 170 * p, 748 - 107 * p, 2.76 - .46 * p,
          -12 + 8 * p, 19 - 10 * p, -9 + 3 * p)


def draft(canvas, t):
    enter = settle(t, -.06, .68)
    flip = reveal(t, 1.78, .59)
    drift = reveal(t, .30, 2.1)
    cx, cy = 1365 - 64 * (1 - enter) + 157 * flip, 537 + 58 * (1 - enter) + 12 * drift
    plane(canvas, paper_back("#879BDC"), cx + 9 - 47 * enter, cy + 7, .90,
          yaw=7 + 30 * flip, pitch=-4, roll=9 + 12 * flip)
    plane(canvas, paper_back("#BAC9F2"), cx - 18, cy - 5, .91, yaw=9 + 28 * flip,
          pitch=5, roll=-11 - 6 * flip)
    art = paper().copy()
    rule(ImageDraw.Draw(art), 85, 325, 430, 1)
    plane(canvas, art, cx, cy, .94 + .26 * (1 - enter) - .15 * flip,
          yaw=-8 + 52 * flip, pitch=9 - 4 * drift, roll=-6 + 5 * flip)
    eyebrow(canvas, "IELTS WRITING", 110, 296, t, True)
    words(canvas, 102, 354, "Start with", 134, WHITE, t, .11)
    words(canvas, 102, 478, "a draft.", 134, WHITE, t, .30)
    rule(ImageDraw.Draw(canvas), 112, 672, 166, reveal(t, .41, .40))


def choose_topic(canvas, t):
    arrive = settle(t, -.035, .50, 1.2)
    drift = reveal(t, .40, .93)
    cx, cy = 1320 + 138 * (1 - arrive) + 17 * drift, 550 + 63 * (1 - arrive)
    device(canvas, "topic", cx, cy, 1.00 + .08 * drift, -31 * (1 - arrive), 5 * (1 - arrive),
           -7 * (1 - arrive))
    eyebrow(canvas, "PLAN WITH AI", 110, 254, t, True)
    words(canvas, 102, 307, "Find your", 134, WHITE, t, .05)
    words(canvas, 102, 435, "angle.", 134, WHITE, t, .15)
    for j, title in enumerate((label("Topic", "BtnTask1"), label("Topic", "BtnTask2"))):
        a = settle(t, .29 + j * .16, .31)
        if a:
            fill, ink = ("#EAF0FF", NAVY) if j == 0 else (GOLD, INK)
            mini_label(ImageDraw.Draw(canvas), 112 + j * 266 + 38 * (1 - a),
                       655 + 34 * (1 - a), title, fill, ink)
    tap(canvas, cx + 3, cy - 36, t, 1.29)
    note(canvas, True)


def tutor_focus(canvas, t):
    arrive = settle(t, -.03, .61)
    drift = reveal(t, .65, 1.6)
    device(canvas, "tutor", 1432 + 74 * arrive, 595 - 37 * arrive - 12 * drift,
           1.17 - .14 * arrive, -7 + 3 * drift, 2, 4 - 2 * drift)
    eyebrow(canvas, "AI TUTOR", 108, 202, t, True)
    words(canvas, 100, 253, "Think it through.", 107, WHITE, t, .10)
    group = (
        ("Who is affected if schools ban phones?", 117, 447, 649, 103, WHITE, INK, .20),
        (label("Tutor", "LblStudent1"), 491, 568, 483, 90, "#CFDDFF", INK, .51),
        ("Give one example.", 173, 683, 522, 105, GOLD, INK, .80),
    )
    for line, x, y, w, h, fill, ink, delay in group:
        a = settle(t, delay, .31, .62)
        if not a:
            continue
        close = reveal(t, 2.04, .35)
        def write(d, x0, y0):
            text(d, x0 + 29, y0 + h * .51, line, 29 if delay < .7 else 39,
                 ink, "bold", "lm")
        floating_card(canvas, write, x + 140 * (1 - a) - close * (47 + delay * 72),
                      y + 33 * (1 - a), w, h, fill, min(a, 1) - close * .23,
                      angle=3 * (1 - a), shadow=116)
    note(canvas, True)


def viewfinder(draw, x, y, w, h, radius, color):
    for dx, dy, sx, sy in ((0, 0, 1, 1), (w, 0, -1, 1),
                           (0, h, 1, -1), (w, h, -1, -1)):
        px, py = x + dx, y + dy
        draw.line((px, py + sy * radius, px, py, px + sx * radius, py),
                  fill=color, width=5, joint="curve")


def capture(canvas, t):
    a = settle(t, -.025, .47)
    move = reveal(t, .88, 1.10)
    cx, cy = 1429 - 78 * a - 44 * move, 578 + 48 * (1 - a)
    device(canvas, "write-photo", cx, cy, 1.07 + .13 * move, 17 * (1 - a) - 9 * move,
           5 * move, 5 * (1 - a))
    px, py = 558 + 77 * (1 - a), 637 + 67 * (1 - a)
    plane(canvas, paper_back("#DCE6F8"), px - 15, py + 14, .612, yaw=10, roll=4)
    art = paper().copy()
    rule(ImageDraw.Draw(art), 85, 325, 430, 1)
    plane(canvas, art, px, py, .64 + .08 * move, yaw=-8 + 8 * move, pitch=5 - 5 * move,
          roll=-8 + 8 * move)
    words(canvas, 105, 112, "Paper to text.", 115, INK, t, .10)
    d = ImageDraw.Draw(canvas)
    if t >= .42:
        scan = reveal(t, .66, 1.10)
        viewfinder(d, 286, 342, 545, 568, 37 * settle(t, .42, .24), BLUE)
        handoff = reveal(t, 1.72, .28)
        y = mix(351 + scan * 553, 562, handoff)
        x = mix(295, 145, handoff)
        width = mix(525, 599, handoff)
        d.rectangle((x, y - 5, x + width, y + 7), fill="#FFF2BA")
        rule(d, x, y, width, 1)
        if .35 < scan < 1:
            tap(canvas, cx, cy - 70, t, 1.62, ink=BLUE)
    note(canvas)


def typed(canvas, t):
    p = settle(t, -.03, .47, .95)
    depart = reveal(t, 1.59, .41)
    device(canvas, "write-text", 1293 + 103 * p + 19 * depart, 586 - 36 * p + 15 * depart,
           1.27 - .14 * p, -11 + 6 * p - 14 * depart, 5 * (1 - p), -3 * p)
    eyebrow(canvas, "TEXT WE READ", 111, 291, t, delay=.05)
    shape = 53 * (1 - p)

    def paint(draw, xx, yy):
        text(draw, xx + 36, yy + 32, "Editable draft", 27, NAVY, "bold")
        excerpt = ("…smartphones are useful", "because they help students.")
        for j, line in enumerate(excerpt):
            text(draw, xx + 36, yy + 93 + 59 * j, line, 40, INK, "display")
    floating_card(canvas, paint, 110 + 130 * (1 - p) + 31 * depart, 357 + shape,
                  774, 274, alpha=min(1, p), angle=-4 + 4 * p, shadow=85)
    rule(ImageDraw.Draw(canvas), 145 + 31 * depart, 562, 599, 1)
    tap(canvas, 1409, 774, t, 1.57, ink=BLUE)
    note(canvas)


def band_focus(canvas, t):
    a = settle(t, -.033, .49, .77)
    shift = reveal(t, .58, .61)
    # Frame the upper portion of the result page like a camera push-in.
    device(canvas, "score", 1408 + 92 * shift, 848 + 151 * (1 - a), 1.94 - .29 * shift,
           -17 + 12 * a, 3 - 8 * a, 4 - 6 * a)
    eyebrow(canvas, "AI BAND ESTIMATE", 112, 227, t, True)
    animated_text(canvas, 98, 316, label("Score", "BtnBand"), 316, WHITE, t,
                  .04, .39, travel=104)
    rule(ImageDraw.Draw(canvas), 124, 696, 281, reveal(t, .32, .31))
    animated_text(canvas, 120, 742, label("Score", "Lbl2"), 40, "#E2EAFF", t,
                  .27, .26, face="body", travel=18)
    note(canvas, True, "Sample AI band estimate")


def rubric(canvas, t):
    p = settle(t, -.028, .47)
    shift = reveal(t, .53, 2.10)
    device(canvas, "score", 428 - 109 * (1 - p) + 14 * shift, 558 - 39 * (1 - p),
           .97 + .08 * p, 13 * (1 - p) + 1.4 * shift, 1, -8 * (1 - p))
    words(canvas, 783, 120, "See what needs work.", 85, INK, t, .03)

    def paint(d, xx, yy):
        lines = (("LblCrit1", "Lbl6"), ("Lbl7", "Lbl8"),
                 ("Lbl9", "Lbl10"), ("Lbl11", "Lbl12"))
        for j, (criterion, number) in enumerate(lines):
            row = yy + 23 + j * 124
            score = label("Score", number)
            a = reveal(t, .23 + j * .16, .44)
            text(d, xx + 34, row, label("Score", criterion), 31, INK, "bold")
            text(d, xx + 897, row, score, 32, NAVY, "bold", "rt")
            box(d, xx + 34, row + 57, 862, 12, ICE, 6)
            if a:
                box(d, xx + 34, row + 57, 862 * a * float(score) / 9, 12,
                    "#DDA524" if j == 0 else NAVY, 6)
    a = settle(t, .13, .42, .54)
    floating_card(canvas, paint, 788 + 105 * (1 - a), 286 + 80 * (1 - a),
                  938, 510, alpha=a, shadow=65, angle=-2.5 * (1 - a))
    hint = settle(t, 1.05, .34, 1.24)
    if hint:
        mini_label(ImageDraw.Draw(canvas), 793 + 135 * (1 - hint),
                   839 + 27 * (1 - hint), label("Score", "LblIssue1"), GOLD, INK)
    tap(canvas, 442, 815, t, 2.51, ink=BLUE)
    note(canvas, sample="Sample AI band estimate")


def before_revision(canvas, t):
    a = settle(t, -.017, .48)
    lean = reveal(t, 1.6, .78)
    device(canvas, "feedback-revise", 1477 + 151 * (1 - a) + 24 * lean, 550 + 33 * (1 - a),
           .99 + .03 * lean, -19 * (1 - a) - 4 * lean, 2 + 2 * lean, 4 * (1 - a))
    eyebrow(canvas, "GUIDED REVISION", 112, 209, t, True)
    words(canvas, 101, 260, "Get specific.", 120, WHITE, t, .06)
    eyebrow(canvas, "BEFORE", 113, 474, t, True, .30)
    for j, line in enumerate(("Smartphones are useful", "because they help students.")):
        animated_text(canvas, 104, 525 + j * 78, line, 63,
                      "#CBDAFF", t, .38 + j * .08, travel=25)
    weight = reveal(t, .63, .45)
    advance = reveal(t, 1.95, .45)
    rule(ImageDraw.Draw(canvas), 112, 688, mix(818, 978, advance), weight)
    tap(canvas, 1492, 720, t, 1.98)
    note(canvas, True)


def after_revision(canvas, t):
    confirmed = reveal(t, 1.65, .47)
    glide = reveal(t, .18, 3.73)
    cx, cy = 1501 - 36 * confirmed - 16 * glide, 550 - 9 * glide
    device(canvas, "feedback-result", cx, cy, 1.02 + .07 * confirmed,
           -4 - 8 * confirmed + 6 * glide, 4 - 2 * glide, 4 * confirmed)
    if t < 1.87:
        device(canvas, "feedback-revise", cx, cy, 1.02 + .07 * confirmed,
               -4 - 8 * confirmed + 6 * glide, 4 - 2 * glide, 4 * confirmed, 1 - confirmed)
    eyebrow(canvas, "GUIDED REVISION", 112, 209, t + 1, True)
    words(canvas, 101, 260, "Get specific.", 120, WHITE, t + 1)
    eyebrow(canvas, "AFTER", 113, 426, t, True, .03)
    example_lines = ("In science class, students can", "film an experiment and replay it",
                     "to spot what they missed.")
    d = ImageDraw.Draw(canvas)
    for j, line in enumerate(example_lines):
        animated_text(canvas, 103, 478 + 76 * j, line, 61, GOLD if j == 1 else WHITE,
                      t, .045 + j * .11, travel=31)
    rule(d, 112, mix(688, 620, reveal(t, 0, .39)), 978, 1)
    check = settle(t, 1.87, .38, 1.11)
    if check:
        def paint(draw, xx, yy):
            segment(draw, [(xx + 23, yy + 33), (xx + 33, yy + 43),
                           (xx + 51, yy + 23)], reveal(t, 2.00, .23), NAVY, 5)
            text(draw, xx + 67, yy + 18, "Example added", 28, INK, "bold")
        floating_card(canvas, paint, 113 + 104 * (1 - check), 776 + 32 * (1 - check),
                      312, 67, GOLD, check, radius=28, shadow=34)
    note(canvas, True, "Sample revision")


def new_prompt(canvas, t):
    a = settle(t, -.033, .47, .74)
    move = reveal(t, .53, 1.53)
    cx, cy = 462 - 129 * (1 - a) - 14 * move, 540 + 47 * (1 - a)
    device(canvas, "practice", cx, cy, 1.01 + .06 * move, 22 * (1 - a) + 4 * move,
           3, -6 * (1 - a))
    eyebrow(canvas, "PRACTICE", 805, 207, t)
    words(canvas, 794, 260, "Practise the skill.", 101, INK, t, .08)
    a = settle(t, .38, .43, .78)
    if a:
        def paint(d, x0, y0):
            text(d, x0 + 31, y0 + 25, label("Practice", "Lbl2"), 19, NAVY, "bold")
            paragraph(d, label("Practice", "LblSkill"), x0 + 30, y0 + 70, 809, 39,
                      INK, "display", 48)
        floating_card(canvas, paint, 802 + 139 * (1 - a), 485 + 44 * (1 - a),
                      877, 186, WHITE, a, angle=-3 * (1 - a), shadow=55)
    animated_text(canvas, 807, 736, "Try it on a new prompt.", 35, SLATE, t, .73,
                  face="body")
    note(canvas)


MARK_CENTER = (W / 2, 349)


def progress(canvas, t):
    angle = reveal(t, .40, 2.15)
    a = settle(t, -.02, .44)
    device(canvas, "progress", 1408 + 91 * (1 - a), 548 + 49 * (1 - a),
           1.02 + .04 * angle, -20 * (1 - a) - 3.5 * angle, -2, 5 * (1 - a))
    words(canvas, 104, 136, "See your progress.", 100, INK, t, .03)
    chart = settle(t, .34, .41)
    if chart:
        def paint(d, xx, yy):
            text(d, xx + 33, yy + 29, "ESTIMATED BAND", 20, NAVY, "bold")
            for i, v in enumerate(("6.5", "6.0", "5.5", "5.0")):
                cy = yy + 100 + i * 56
                text(d, xx + 35, cy, v, 20, SLATE, anchor="lm")
                d.line((xx + 110, cy, xx + 751, cy), fill="#DCE6F7", width=2)
            points = [(xx + 120, yy + 212), (xx + 324, yy + 156),
                      (xx + 534, yy + 156), (xx + 743, yy + 156)]
            segment(d, points, reveal(t, .59, 1.02), NAVY, 7)
            outbound = reveal(t, 2.82, .38)
            for j, (px, py) in enumerate(points):
                a = settle(t, .60 + j * .27, .27, 1.2)
                r = (15 if j == 3 else 7) * a
                if j == 3:
                    r *= 1 - outbound
                if r > 0:
                    d.ellipse((px - r, py - r, px + r, py + r),
                              fill=GOLD if j == 3 else NAVY)
        floating_card(canvas, paint, 113 + 113 * (1 - chart), 387 + 69 * (1 - chart),
                      795, 352, WHITE, chart, angle=3 * (1 - chart))
    into_icon = reveal(t, 2.81, .39)
    if into_icon:
        # The last point becomes the gold accent on the closing app mark.
        sx, sy = 113 + 743, 387 + 156
        ex, ey = MARK_CENTER
        px, py = mix(sx, ex, into_icon), mix(sy, ey, into_icon) - 80 * sin(pi * into_icon)
        r = mix(14, 36, into_icon)
        ImageDraw.Draw(canvas).ellipse((px - r, py - r, px + r, py + r), fill=GOLD)
    note(canvas, sample="Sample progress data")


def end_card(canvas, t):
    arrive = settle(t, -.025, .50, 1.03)
    x, y = MARK_CENTER
    shadow = matte(210, 210, 49, GOLD, 44)
    float_layer(canvas, shadow, x, y, mix(.34, 1, arrive), -16 * (1 - arrive))
    float_layer(canvas, LOGO, x, y, .686 * mix(.34, 1, arrive), -16 * (1 - arrive),
                reveal(t, 0, .13))
    animated_text(canvas, x, 505, "ReviseLab", 129, INK, t, .22, align="center",
                  travel=48)
    animated_text(canvas, x, 668, "Plan. Write. Revise. Improve.", 38, NAVY, t, .50,
                  face="body", align="center", travel=23)
    w = 135 * reveal(t, .55, .42)
    if w:
        rule(ImageDraw.Draw(canvas), (W - w) / 2, 729, w, 1)


BEAT = .4
SHOTS = (
    (0, "paper", page_macro),
    (2, "night", draft),
    (8, "blue", choose_topic),
    (12, "night", tutor_focus),
    (18, "paper", capture),
    (23, "score", typed),
    (28, "blue", band_focus),
    (31, "score", rubric),
    (38, "night", before_revision),
    (44, "blue", after_revision),
    (54, "practice", new_prompt),
    (60, "score", progress),
    (68, "paper", end_card),
)
CUT_FRAMES = tuple(round(beat * BEAT * FPS) for beat, _, _ in SHOTS)
# Short transitions continue the direction of the card, crop, or highlight.
WIPES = {18: ("side", 11), 28: ("button", 12), 38: ("band", 10), 54: ("side", 10)}


def shot_frame(index, elapsed):
    _, stage, shot = SHOTS[index]
    canvas = backdrop(stage).copy()
    shot(canvas, elapsed)
    return canvas


def frame_at(frame):
    index = bisect_right(CUT_FRAMES, frame) - 1
    elapsed = (frame - CUT_FRAMES[index]) / FPS
    canvas = shot_frame(index, elapsed)
    cut = WIPES.get(SHOTS[index][0])
    if cut and frame - CUT_FRAMES[index] < cut[1]:
        kind, frames = cut
        fraction = settle((frame - CUT_FRAMES[index] + 1) / frames, span=1)
        outgoing = shot_frame(index - 1,
                              (CUT_FRAMES[index] - 1 - CUT_FRAMES[index - 1]) / FPS)
        mask = Image.new("L", (W, H))
        d = ImageDraw.Draw(mask)
        if kind == "side":
            x = W * (1 - fraction)
            d.polygon(((x, 0), (W, 0), (W, H), (x - 215 * fraction, H)), fill=255)
        elif kind == "button":
            width, height = 2860 * fraction, 1810 * fraction
            box(d, 1409 - width, 774 - height, width * 2, height * 2, 255, 46)
        else:
            y = H * (1 - fraction)
            d.polygon(((0, y + 87 * (1 - fraction)), (W, y), (W, H), (0, H)), fill=255)
        canvas = Image.composite(canvas, outgoing, mask.filter(ImageFilter.GaussianBlur(3)))
    return canvas


RATE = 48000


def music(output):
    """Score the 150 BPM film with syncopated bass, plucks, and short edit accents."""
    audio = np.zeros((DURATION * RATE, 2), dtype=np.float32)
    rng = np.random.default_rng(30260)

    def add(at, signal, pan=0.0):
        start = round(at * RATE)
        end = min(len(audio), start + len(signal))
        if end > start:
            audio[start:end] += signal[:end - start, None] * (1 - pan, 1 + pan)

    def tone(at, midi, duration, gain, pan=0, voice="key"):
        t = np.arange(round(duration * RATE)) / RATE
        p = 2 * np.pi * (440 * 2 ** ((midi - 69) / 12)) * t
        if voice == "pad":
            wave_shape = .72 * np.sin(p) + .28 * np.sin(p * 1.003 + .4)
            env = np.minimum(t / .17, 1) * np.minimum((duration - t) / .43, 1)
        elif voice == "bass":
            wave_shape = np.sin(p) + .18 * np.sin(2 * p) + .08 * np.sin(3 * p)
            env = np.minimum(t / .011, 1) * np.exp(-t * 4.3)
        else:
            timbre = 1.05 * np.exp(-t * 8) * np.sin(2 * p)
            wave_shape = .83 * np.sin(p + timbre) + .17 * np.sin(p * 1.005)
            env = np.minimum(t / .007, 1) * np.exp(-t * 7.0)
        add(at, gain * wave_shape * env * np.minimum((duration - t) / .05, 1), pan)

    def hit(at, voice, gain, pan=0):
        duration = {"kick": .22, "snap": .11, "hat": .07, "edit": .11}[voice]
        t = np.arange(round(duration * RATE)) / RATE
        if voice == "kick":
            p = 2 * np.pi * (52 * t + 70 * (1 - np.exp(-33 * t)) / 33)
            wave_shape = np.sin(p) * np.exp(-t * 24)
        elif voice == "edit":
            wave_shape = (.64 * np.sin(2 * np.pi * 343 * t)
                          + .36 * np.sin(2 * np.pi * 671 * t)) * np.exp(-t * 39)
        else:
            n = rng.normal(0, 1, len(t))
            crisp = np.insert(np.diff(n), 0, 0) * .43
            if voice == "hat":
                wave_shape = crisp * np.exp(-t * 63)
            else:
                envelope = np.exp(-t * 37) + .63 * np.exp(-((t - .014) / .008) ** 2)
                wave_shape = crisp * envelope + .23 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 43)
        add(at, gain * wave_shape * np.minimum(t / .004, 1), pan)

    chords = ((48, 60, 64, 67, 71), (43, 59, 62, 67, 69),
              (45, 60, 64, 67, 69), (41, 57, 60, 65, 69))
    for bar in range(17):
        beat = bar * 4
        start = beat * BEAT
        chord = chords[bar % len(chords)]
        lean = 38 <= beat < 44
        for j, pitch in enumerate(chord[1:]):
            tone(start, pitch, 1.95, .017 if lean else .014, (j - 1.5) * .18, "pad")
        pattern = ((0, 2, 0), (1, 3, 12), (1.5, 4, 12), (2.5, 3, 12), (3, 2, 12))
        for j, (offset, idx, octave) in enumerate(pattern):
            if lean and j in (2, 4):
                continue
            pitch = chord[idx] + octave
            tone(start + offset * BEAT, pitch, .42, .049 if j == 0 else .043,
                 (-1) ** j * .20)
            if not lean and j in (1, 3):
                tone(start + (offset + .55) * BEAT, pitch, .26, .012, (-1) ** j * -.36)
        for j, offset in enumerate((0, 1.5, 2.5, 3.5)):
            pitch = chord[0] if j != 3 else chord[0] + 12
            tone(start + offset * BEAT, pitch, .34 if j == 0 else .21,
                 .075 if lean else .103, voice="bass")
        for offset in (0, 1.5, 2, 3):
            hit(start + offset * BEAT, "kick", .067 if lean else .108)
        for offset in (1, 3):
            hit(start + offset * BEAT, "snap", .039 if lean else .076, .08)
        for j, offset in enumerate((.5, 1.5, 2.5, 3.5)):
            hit(start + offset * BEAT, "hat", .034 if lean else .049, (-1) ** j * .25)

    accents = {beat: .077 for beat, _, _ in SHOTS[1:]}
    accents.update({12: .101, 23: .117, 31: .122, 44: .093, 54: .104, 68: .14})
    for beat, gain in accents.items():
        hit(beat * BEAT, "edit", gain, -.17)
    for beat in (16, 21, 25, 33.5, 35, 49, 63, 65):
        hit(beat * BEAT, "edit", .044, .23)
    for j, note in enumerate((48, 60, 64, 67, 72)):
        tone(27.2 + .024 * j, note, 2.71, .033, (j - 2) * .16, "pad")
    tone(27.39, 84, .83, .046, .19)
    tone(27.60, 79, .86, .034, -.19)
    timeline = np.arange(len(audio)) / RATE
    fade = np.minimum(timeline / .055, 1) * np.clip((DURATION - timeline) / .66, 0, 1)
    audio *= fade[:, None]
    audio = np.tanh(audio * 1.65)
    peak = np.max(np.abs(audio))
    sound = np.round(audio * (.74 / peak) * 32767).astype("<i2")
    with wave.open(str(output), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(sound.tobytes())


def render(output):
    with tempfile.TemporaryDirectory(prefix="reviselab-film-") as temp:
        track = Path(temp) / "score.wav"
        music(track)
        command = [
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(track),
            "-vf", "scale=out_color_matrix=bt709", "-c:v", "libx264", "-preset", "fast",
            "-crf", "17", "-pix_fmt", "yuv420p",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(output),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as ffmpeg:
            assert ffmpeg.stdin is not None
            for i in range(DURATION * FPS):
                ffmpeg.stdin.write(frame_at(i).tobytes())
                if i % (FPS * 5) == 0:
                    print(f"Rendered {i / FPS:g}s / {DURATION}s", flush=True)
            ffmpeg.stdin.close()
            if ffmpeg.wait():
                raise RuntimeError("FFmpeg did not finish encoding")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=HERE / "ReviseLab — Launch Film v3 — 30s.mp4")
    parser.add_argument("--stills", type=Path)
    args = parser.parse_args()
    if args.stills:
        args.stills.mkdir(parents=True, exist_ok=True)
        for t in (.3, .8, 1.7, 3.65, 4.32, 5.4, 6.5, 7.28, 8.55, 9.69, 11.76,
                  12.8, 14.4, 16.15, 17.61, 18.7, 20.45, 22.4, 23.6, 25.1, 26.8, 27.3, 29.2):
            frame_at(round(t * FPS)).save(args.stills / f"frame-{t:05.2f}.png")
    else:
        render(args.output)
