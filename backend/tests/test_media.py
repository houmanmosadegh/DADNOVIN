"""Media: upload validation, signature sniffing, serving.
(Library list/delete endpoints were removed with the admin media page —
only upload + file-serving remain for portraits and attachments.)"""

import io

from PIL import Image


def _png_bytes(w=40, h=30) -> bytes:
    img = Image.new("RGB", (w, h), (200, 120, 40))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


async def test_upload_serve_cycle(admin_client, tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    from main.core.config import get_settings

    get_settings.cache_clear()

    resp = await admin_client.post(
        "/api/v1/admin/media",
        files={"file": ("photo.png", _png_bytes(), "image/png")},
    )
    assert resp.status_code == 201, resp.text
    asset = resp.json()
    assert asset["width"] == 40 and asset["height"] == 30

    serve = await admin_client.get(asset["url"])
    assert serve.status_code == 200
    assert serve.headers["content-type"] == "image/png"

    # library endpoints are gone — delete now 404s
    delete = await admin_client.delete(f"/api/v1/admin/media/{asset['id']}")
    assert delete.status_code == 404
    get_settings.cache_clear()  # restore default settings for later tests


async def test_rejects_fake_png(admin_client):
    resp = await admin_client.post(
        "/api/v1/admin/media",
        files={"file": ("evil.png", b"MZ\x90\x00 not an image", "image/png")},
    )
    assert resp.status_code == 415


async def test_rejects_executable(admin_client):
    resp = await admin_client.post(
        "/api/v1/admin/media",
        files={
            "file": (
                "run.exe",
                b"MZ\x90\x00\x03\x00\x00\x00",
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 415


async def test_media_requires_auth(client):
    resp = await client.post(
        "/api/v1/admin/media",
        files={"file": ("a.png", _png_bytes(), "image/png")},
    )
    assert resp.status_code == 401


async def test_traversal_in_filename_404(client):
    resp = await client.get("/api/v1/media/file/..%2F..%2Fetc%2Fpasswd")
    assert resp.status_code in (404, 422)
