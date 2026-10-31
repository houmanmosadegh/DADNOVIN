"""QR codes + the downloadable silver marketer card.

QR: error-correction Q, ≥4-module quiet zone, own-domain URL only.
Card: matte silver ~300 DPI PNG/PDF with the office logo, white QR tile,
ref code and the marketer's name — Persian text reshaped + BiDi-ordered.
"""

import io
from pathlib import Path

import arabic_reshaper
import segno
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models.account import MarketerProfile
from ..models.content import SiteSetting
from ..models.media import MediaAsset
from ..models.user import User

_ASSETS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_FONT_BODY = _ASSETS / "Estedad-Var.ttf"
_FONT_DISPLAY = _ASSETS / "Lalezar.ttf"

# ~300dpi business card (20×12.5cm ≈ 2362×1476 px)
CARD_W, CARD_H = 2362, 1476

_INK = (41, 37, 36)  # warm near-black
_MUTED = (94, 87, 79)
_GOLD = (122, 90, 28)  # deep bronze — legible on silver
_TILE = (255, 255, 255)


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


async def _brand_logo(db: AsyncSession) -> Image.Image | None:
    row = await db.get(SiteSetting, "brand")
    file_id = (row.value or {}).get("logoFileId") if row else None
    if not file_id:
        return None
    asset = await db.get(MediaAsset, file_id)
    if asset is None:
        return None
    from .media import media_path

    path = media_path(asset)
    if not path.exists():
        return None
    try:
        return Image.open(path).convert("RGBA")
    except Exception:
        return None


def _metal_base(w: int, h: int) -> Image.Image:
    """Matte silver — a soft vertical gradient + hairline edge, no glow."""
    base = Image.new("RGB", (w, h))
    top, bottom = (236, 237, 240), (198, 201, 207)
    for y in range(h):
        t = y / (h - 1)
        base.paste(
            tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)),
            (0, y, w, y + 1),
        )
    d = ImageDraw.Draw(base)
    d.rectangle((26, 26, w - 26, h - 26), outline=(168, 172, 179), width=3)
    d.rectangle((34, 34, w - 34, h - 34), outline=(215, 217, 222), width=2)
    return base


def render_card(
    logo: Image.Image | None,
    marketer_name: str,
    ref_code: str,
    site_url: str,
    qr_url: str,
) -> Image.Image:
    """Compose the card — all drawing in LTR space (x grows rightward)."""
    card = _metal_base(CARD_W, CARD_H)
    d = ImageDraw.Draw(card)

    # white QR tile, right side of the card (visual centre for the eye)
    qr = qr_image(qr_url, scale=14, border=4)
    tile = 78  # padding around the QR inside the tile
    tw, th = qr.width + 2 * tile, qr.height + 2 * tile
    tx, ty = CARD_W - tw - 140, (CARD_H - th) // 2
    d.rounded_rectangle((tx, ty, tx + tw, ty + th), radius=36, fill=_TILE)
    card.paste(qr, (tx + tile, ty + tile))

    # left column — logo/wordmark, name, code, url
    lx = 170
    cy = CARD_H // 2
    if logo is not None:
        lh = 340
        lr = lh / logo.height
        lg = logo.resize((int(logo.width * lr), lh), Image.LANCZOS)
        card.paste(lg, (lx, cy - lh - 40), lg)
    else:
        d.text((lx, cy - 330), _fa("دادنوین"), font=_font(150, display=True), fill=_INK)

    d.text(
        (lx, cy - 90),
        _fa(marketer_name or "بازاریاب همکار"),
        font=_font(76, wght=700),
        fill=_INK,
    )
    d.text((lx, cy + 30), _fa("کد معرف"), font=_font(52), fill=_MUTED)
    # ref code in latin — LTR box
    code_f = _font(96, wght=700)
    d.text((lx, cy + 150), ref_code, font=code_f, fill=_GOLD)
    d.text(
        (lx, CARD_H - 220),
        site_url.replace("https://", "").replace("http://", ""),
        font=_font(56),
        fill=_MUTED,
    )
    d.text(
        (lx, CARD_H - 320),
        _fa("گروه حقوقی دادنوین"),
        font=_font(48, display=True),
        fill=_MUTED,
    )
    return card


async def card_png(
    db: AsyncSession, prof: MarketerProfile, user: User, url: str, buf: io.BytesIO
) -> None:
    logo = await _brand_logo(db)
    site = get_settings().public_base_url
    card = render_card(logo, user.full_name or user.username, prof.ref_code, site, url)
    card.save(buf, "PNG", optimize=True, dpi=(300, 300))


async def card_pdf(
    db: AsyncSession, prof: MarketerProfile, user: User, url: str, buf: io.BytesIO
) -> None:
    logo = await _brand_logo(db)
    site = get_settings().public_base_url
    card = render_card(logo, user.full_name or user.username, prof.ref_code, site, url)
    card.save(buf, "PDF", resolution=300.0)
