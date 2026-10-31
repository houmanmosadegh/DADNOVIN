# استقرار (Deployment)

## پیش‌نیاز
- Docker 24+ و Compose v2
- دامنه + TLS (در لبه — load balancer یا یک server block جدا در nginx)
- `.env` از روی `.env.example` با مقادیر واقعی

## استقرار production

```bash
cp .env.example .env          # مقادیر را پر کنید (پایین جدول)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

روال استارت `api`: migration → roles (ایدم‌پوتنت) → `seed` فقط اگر
`SEED_ON_BOOT=true` → `bootstrap-admin` فقط اگر هر دو env ست شده → uvicorn.

### مقادیر اجباری `.env` در production

| متغیر | مقدار |
|---|---|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | `openssl rand -hex 32` — تصادفی قوی |
| `POSTGRES_PASSWORD` | رمز قوی واقعی |
| `COOKIE_SECURE` | `true` (HTTPS اجباری) |
| `CORS_ORIGINS` | `https://your-domain` — بدون `*` |
| `PUBLIC_BASE_URL` | `https://your-domain` — در لینک‌های ارجاع/QR استفاده می‌شود |
| `PAYOUT_ENC_KEY` | کلید مستقل برای رمزنگاری بانک (اختیاری — fallback: SECRET_KEY) |
| `HTTP_PORT` | `80` |
| `UVICORN_WORKERS` | `2`+ |
| `SEED_ON_BOOT` | `false` — محتوای اولیه را یک‌بار دستی بزنید |

ساخت اولین ادمین (هیچ رمز پیش‌فرضی در کد نیست):
```bash
docker compose exec api python -m main.cli bootstrap-admin \
  --username admin --password 'رمز-قوی-و-واقعی' --name "مدیر مجموعه"
```

پر کردن محتوای اولیهٔ CMS (یک‌بار): `docker compose exec api python -m main.cli seed`

## TLS

gateway پورت 8080 روی `HTTP_PORT` می‌سازد و HTTP سرو می‌کند. دو گزینه:
1. **توصیه‌شده:** TLS را در لبه (Cloudflare/LB/ریورس‌پراکسی بیرونی) ختم کنید و
   gateway را داخلی نگه دارید.
2. یک `server` بلاک HTTPS با گواهی واقعی در `infrastructure/nginx/` اضافه کنید.
   هرگز گواهی self-signed در ریپو نگذارید.

## امنیت production
- `EXPOSE_DOCS=false` در prod override — `/docs` و `openapi.json` بسته‌اند.
- `validate_production_settings()` در استارتاپ اجرا می‌شود: secret پیش‌فرض،
  کوکی ناامن یا CORS wildcard ⇒ **boot نمی‌شود**.
- دیتابیس هیچ پورت عمومی ندارد (`internal` network فقط).
- rate limit در حافظه‌ی هر worker است؛ با چند worker یا چند replica
  حد مؤثر ×N می‌شود — برای حد سخت‌گیرانه در لبه هم limit بگذارید.

## Backup / Restore
```bash
./scripts/backup.sh                 # pg_dump → ./backups/*.sql.gz
./scripts/restore.sh <dump.sql.gz>  # با تایید تعاملی + migrate به head
```
ولوم `media` (آپلودها) را هم در بک‌آپ لحاظ کنید:
`docker run --rm -v dadnovin_media:/m -v $PWD/backups:/b alpine tar czf /b/media-$(date +%F).tgz -C /m .`

## به‌روزرسانی
```bash
git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# migrationها هنگام استارت api اجرا می‌شوند؛ قبلش backup بگیرید
```

## Rollback
1. restore از backup، ۲. deploy تگ قبلی، ۳. `alembic downgrade <rev>` اگر لازم شد.
