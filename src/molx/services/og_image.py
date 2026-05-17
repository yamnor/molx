from io import BytesIO
from textwrap import shorten

from PIL import Image, ImageDraw, ImageFont

from molx.config import STATIC_DIR

OG_IMAGE_SIZE = (1200, 630)
LOGO_PATH = STATIC_DIR / "favicon" / "android-chrome-192x192.png"
OG_COLORS = {
    "text": "#263238",
    "muted": "#8c969b",
    "surface": "#ffffff",
    "surface_soft": "#eef6f9",
    "border": "#d7e6eb",
    "accent": "#5898d4",
}


def load_font(size: int, bold: bool = False):
    names = [
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font,
    max_width: int,
    max_lines: int = 3,
) -> list[str]:
    if draw.textlength(text, font=font) <= max_width:
        return [text]

    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    fitted = lines[:max_lines]
    if len(lines) > max_lines and fitted:
        fitted[-1] = shorten(fitted[-1], width=max(8, len(fitted[-1]) - 3), placeholder="...")
    while fitted and draw.textlength(fitted[-1], font=font) > max_width:
        fitted[-1] = shorten(fitted[-1], width=max(8, len(fitted[-1]) - 3), placeholder="...")
    return fitted


def fit_title(draw: ImageDraw.ImageDraw, text: str, max_width: int) -> tuple[object, list[str], int]:
    for size in (66, 62, 58, 54, 50, 46):
        font = load_font(size, bold=True)
        lines = fit_text(draw, text, font, max_width, max_lines=3)
        if len(lines) <= 2 or size <= 50:
            line_gap = 12 if size >= 58 else 10
            return font, lines, line_gap
    font = load_font(46, bold=True)
    return font, fit_text(draw, text, font, max_width, max_lines=3), 10


def text_block_height(font, lines: list[str], line_gap: int) -> int:
    if not lines:
        return 0
    line_height = font.getbbox("Hg")[3] - font.getbbox("Hg")[1]
    return line_height * len(lines) + line_gap * (len(lines) - 1)


def paste_logo(image: Image.Image, position: tuple[int, int], size: int) -> None:
    if not LOGO_PATH.exists():
        return

    logo = Image.open(LOGO_PATH).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, size, size), radius=12, fill=255)
    image.paste(logo, position, mask)


def generate_og_image(key: str, url: str, format_name: str, title: str | None = None) -> bytes:
    image = Image.new("RGB", OG_IMAGE_SIZE, OG_COLORS["surface"])
    draw = ImageDraw.Draw(image)

    accent = OG_COLORS["accent"]
    text = OG_COLORS["text"]
    muted = OG_COLORS["muted"]
    surface = OG_COLORS["surface"]
    surface_soft = OG_COLORS["surface_soft"]
    border = OG_COLORS["border"]
    tagline = "Molecular structures, one link away"

    draw.rectangle((0, 0, 1200, 630), fill=surface)
    draw.rounded_rectangle((56, 56, 1144, 574), radius=32, fill=surface, outline=border, width=3)
    draw.rectangle((88, 524, 1112, 528), fill=surface_soft)
    draw.rectangle((88, 524, 332, 528), fill=accent)

    brand_font = load_font(30, bold=True)
    format_font = load_font(30)
    mono_font = load_font(30, bold=True)
    tagline_font = load_font(28)
    site_font = load_font(24)

    display_title = title or f"{format_name.upper()} molecular structure"
    title_font, title_lines, title_gap = fit_title(draw, display_title, 980)
    title_top = 182

    paste_logo(image, (104, 94), 48)
    draw.text((166, 100), "molx", fill=text, font=brand_font)

    badge = (890, 96, 1096, 150)
    draw.rounded_rectangle(badge, radius=14, fill=surface_soft, outline=border, width=2)
    key_box = draw.textbbox((0, 0), key, font=mono_font)
    key_width = key_box[2] - key_box[0]
    key_height = key_box[3] - key_box[1]
    key_x = badge[0] + ((badge[2] - badge[0]) - key_width) / 2
    key_y = badge[1] + ((badge[3] - badge[1]) - key_height) / 2 - key_box[1]
    draw.text((key_x, key_y), key, fill=accent, font=mono_font)

    y = title_top
    for line in title_lines:
        draw.text((104, y), line, fill=text, font=title_font)
        y += (title_font.getbbox("Hg")[3] - title_font.getbbox("Hg")[1]) + title_gap

    title_height = text_block_height(title_font, title_lines, title_gap)
    format_top = min(title_top + title_height + 28, 382)
    draw.text((104, format_top), f"{format_name.upper()} molecular structure", fill=muted, font=format_font)

    draw.text((104, 468), tagline, fill=muted, font=tagline_font)
    draw.text((976, 482), "molx.me", fill=muted, font=site_font)

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
