"""QR codes + the branded marketer card.

QR: error-correction Q, ≥4-module quiet zone, own-domain URL only.
Card: the static brand template (`assets/cards/dadnovin-card-template.png`)
with a light rounded plaque + dark QR composited into the empty gold box.
Box geometry lives in `assets/cards/card-template.json`; composed cards are
cached under <storage>/cards keyed by URL + template mtime.
"""

import hashlib
import io
import json
from pathlib import Path

import arabic_reshaper
import segno
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models.account import MarketerProfile
from ..models.user import User

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_FONT_BODY = _ASSETS / "fonts" / "Estedad-Var.ttf"
_FONT_DISPLAY = _ASSETS / "fonts" / "Lalezar.ttf"
_CARDS_DIR = _ASSETS / "cards"
_CARD_CFG = json.loads((_CARDS_DIR / "card-template.json").read_text("utf-8"))
_TEMPLATE = _CARDS_DIR / _CARD_CFG["template"]

_INK = (41, 37, 36)  # warm near-black

_CACHE_VERSION = "v2"


def _font(size: int, display: bool = False, wght: int = 400) -> ImageFont.FreeTypeFont:
    path = _FONT_DISPLAY if display else _FONT_BODY
    f = ImageFont.truetype(str(path), size)
    try:
        f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def _fa(text: str) -> str:
    """Reshape + reorder a Persian line for PIL drawing."""
    if not text:
        return ""
    return get_display(arabic_reshaper.reshape(str(text)), base_dir="R")


def _center(draw, xy, text, font, fill, anchor="mm"):
    draw.text(xy, text, font=font, fill=fill, anchor=anchor)


def qr_image(url: str, scale: int = 12, border: int = 4) -> Image.Image:
    """segno → PIL image; EC level Q, generous quiet zone."""
    qr = segno.make(url, error="q")
    buf = io.BytesIO()
    qr.save(
        buf, kind="png", scale=scale, border=border, dark="#000000", light="#ffffff"
    )
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def qr_png(url: str, buf: io.BytesIO) -> None:
    img = qr_image(url)
    img.save(buf, "PNG", optimize=True)


def qr_pdf(url: str, buf: io.BytesIO) -> None:
    """Single-page PDF with the QR centred at print-friendly size."""
    page = Image.new("RGB", (1240, 1240), (255, 255, 255))
    qr = qr_image(url, scale=16)
    page.paste(qr, ((1240 - qr.width) // 2, (1240 - qr.height) // 2 - 60))
    d = ImageDraw.Draw(page)
    d.text(
        (620, 1240 - 160),
        _fa("گروه حقوقی دادنوین"),
        font=_font(44, display=True),
        fill=_INK,
        anchor="mm",
    )
    page.save(buf, "PDF", resolution=300.0)


def render_card(qr_url: str) -> Image.Image:
    """Brand template + light plaque + dark QR inside the empty gold box."""
    box = _CARD_CFG["qr_box"]
    pl = _CARD_CFG["plaque"]
    inset = box["inner_border_inset"]

    card = Image.open(_TEMPLATE).convert("RGB")

    # inner safe area = box minus its inner gold border
    ix, iy = box["x"] + inset, box["y"] + inset
    iw, ih = box["w"] - 2 * inset, box["h"] - 2 * inset

    # plaque sits inside the inner border with proportional padding
    pp = round(min(iw, ih) * pl["padding_ratio"])
    px0, py0 = ix + pp, iy + pp
    px1, py1 = ix + iw - pp, iy + ih - pp
    radius = round((px1 - px0) * pl["radius_ratio"])
    plaque = Image.new("RGBA", (px1 - px0, py1 - py0), (0, 0, 0, 0))
    ImageDraw.Draw(plaque).rounded_rectangle(
        (0, 0, plaque.width, plaque.height), radius=radius, fill=pl["fill"]
    )
    card.paste(plaque, (px0, py0), plaque)

    # QR fills the plaque minus its own padding — always ≥ configured size
    qp = round(plaque.width * pl["qr_padding_ratio"])
    target = plaque.width - 2 * qp
    qr = qr_image(
        qr_url,
        scale=max(1, round(target / 21)),
        border=_CARD_CFG["qr"]["quiet_zone_modules"],
    )
    if qr.width != target:
        qr = qr.resize((target, target), Image.LANCZOS)
    card.paste(qr, (px0 + qp, py0 + qp))
    return card


def _cache_dir() -> Path:
    d = Path(get_settings().storage_dir) / "cards"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_key(url: str) -> str:
    raw = f"{_CACHE_VERSION}|{url}|{_TEMPLATE.stat().st_mtime_ns}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


async def card_png(
    db: AsyncSession, prof: MarketerProfile, user: User, url: str, buf: io.BytesIO
) -> None:
    path = _cache_dir() / f"{_cache_key(url)}.png"
    if not path.exists():
        card = render_card(url)
        card.save(path, "PNG", optimize=True, dpi=(300, 300))
    buf.write(path.read_bytes())


async def card_pdf(
    db: AsyncSession, prof: MarketerProfile, user: User, url: str, buf: io.BytesIO
) -> None:
    path = _cache_dir() / f"{_cache_key(url)}.pdf"
    if not path.exists():
        card = render_card(url)
        card.save(path, "PDF", resolution=300.0)
    buf.write(path.read_bytes())
