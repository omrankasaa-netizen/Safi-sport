"""One-off script: generates on-brand 'photo coming soon' placeholder images
(dark card background + Kharbesh logo mark) used as temporary product photos
until real front/back garment photography is uploaded per color.
Run: python3 scripts/gen_placeholders.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1000, 1250
BG = (38, 32, 21)  # --brand-surface #262015
CAPTION_COLOR = (167, 158, 134)  # --muted #A79E86

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND_DIR = os.path.join(BASE, "src/assets/brand")
OUT_DIR = os.path.join(BASE, "public/assets/brand")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_PATH = os.path.join(BASE, "public/assets/fonts/Anton.ttf")


def make_placeholder(logo_name, max_logo_w, max_logo_h, caption, out_name):
    canvas = Image.new("RGB", (W, H), BG)
    logo = Image.open(os.path.join(BRAND_DIR, logo_name)).convert("RGBA")
    ratio = min(max_logo_w / logo.width, max_logo_h / logo.height)
    new_size = (max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio)))
    logo = logo.resize(new_size, Image.LANCZOS)

    # Vertically center the logo slightly above center to leave room for caption
    logo_y = (H - new_size[1]) // 2 - 40
    logo_x = (W - new_size[0]) // 2
    canvas.paste(logo, (logo_x, logo_y), logo)

    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype(FONT_PATH, 26)
    except Exception:
        font = ImageFont.load_default()

    # letter-spaced caption
    spaced = " ".join(list(caption.upper()))
    bbox = draw.textbbox((0, 0), spaced, font=font)
    tw = bbox[2] - bbox[0]
    tx = (W - tw) // 2
    ty = logo_y + new_size[1] + 70
    draw.text((tx, ty), spaced, font=font, fill=CAPTION_COLOR)

    canvas.save(os.path.join(OUT_DIR, out_name), quality=92)
    print("wrote", out_name)


make_placeholder(
    "kharbesh-chest-lockup-white.png", 320, 320,
    "Photos dropping soon", "placeholder-front.jpg",
)
make_placeholder(
    "kharbesh-stacked-lockup-white.png", 560, 560,
    "Photos dropping soon", "placeholder-back.jpg",
)
