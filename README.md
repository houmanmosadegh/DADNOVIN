# دادنوین — پلتفرم حقوقی تمام‌عیار

سامانه‌ی یکپارچه‌ی «گروه حقوقی دادنوین»: وب‌سایت عمومی فارسی/RTL با تجربه‌ی
سه‌بعدی و pre-render برای سئو، پنل کاربری مشتریان، پنل مدیریت مجزا، سیستم
بازاریابی با ارجاع و کمیسیون و تسویه‌ی فیش‌دار، CMS کامل برای محتوا، و
دستیار هوش مصنوعی اختیاری — روی یک API واحد FastAPI/PostgreSQL.

## امکانات

- **سایت عمومی** — لندینگ سینمایی three.js، صفحات درباره/خدمات/مشاوره/تماس/پیگیری/مقالات، prerender کامل، sitemap داینامیک، کارکرد آفلاین با fallback استاتیک.
- **پنل کاربر `/panel`** — ثبت و پیگیری مشاوره، اعلان‌ها، پروفایل، صفحه‌ی بازاریابی (لینک کانالی، QR، کارت دانلودی، اطلاعات بانکی، کمیسیون‌ها).
- **پنل ادمین `/admin`** — مدیریت درخواست‌ها، تیکت‌ها، مخاطبان، وکلا، صفحات، مقالات (ادیتور غنی + نسخه‌ها)، رسانه، تنظیمات (برند/لوگو/سئو/شبکه‌ها)، بازاریاب‌ها، ارجاع‌ها، کمیسیون‌ها و تسویه با فیش.
- **یک ورود برای همه** — ادمین، کارمند، مشتری و بازاریاب از یک فرم وارد می‌شوند؛ نقش‌ها مسیر را تعیین می‌کنند.
- **بازاریابی/ارجاع** — کد ارجاع غیرقابل‌تغییر `DN-XXXX-XXXX` با check digit، لینک کانالی `?s=`، رضایت‌محور (بدون رضایت: بدون نام/بدون کمیسیون)، کمیسیون فقط درصدی، دفتر append-only، تسویه با فیش بانکی و هولد ۲۴h.
- **امنیت** — نشست کوکی HttpOnly امضاشده (فقط هش در DB)، Argon2id، CSRF، rate limit، هدرهای امنیتی، آپلود با بررسی magic bytes، رمزنگاری AES-256-GCM بانک، audit log.

## استک

| لایه | فناوری |
|---|---|
| سایت عمومی + پنل کاربر | React 19 · Vite · TypeScript · three.js · prerender |
| پنل ادمین | React 19 · Vite · Tailwind v4 · TanStack Query · TipTap 3 |
| بک‌اند | FastAPI · SQLAlchemy async · Alembic · Pydantic v2 |
| دیتابیس | PostgreSQL 16 (تست‌ها روی SQLite) |
| لبه | Nginx gateway · Docker Compose |

## شروع سریع

```bash
cp .env.example .env              # SECRET_KEY و POSTGRES_PASSWORD را بگذارید
docker compose up -d --build      # کل استک: db + api + web + panel + gateway

# اولین ادمین (هیچ رمز پیش‌فرضی در کد نیست)
docker compose exec api python -m main.cli bootstrap-admin \
  --username admin --password 'یک-رمز-قوی-طولانی' --name 'مدیر مجموعه'
```

| مسیر | چیست |
|---|---|
| `http://localhost:8080/` | سایت عمومی |
| `http://localhost:8080/panel` | پنل کاربر (فرم ورود مشترک همه‌ی نقش‌ها) |
| `http://localhost:8080/admin/` | پنل مدیریت |
| `http://localhost:8080/api/v1` | API (docs در `/docs` فقط dev) |

روال استارت `api`: **migration → roles → `seed` اگر `SEED_ON_BOOT` →
`bootstrap-admin` اگر هر دو env ست شده → uvicorn.** دیتا در ولوم‌های
`pgdata` و `media` پایدار می‌ماند.

## متغیرهای محیطی

| متغیر | توضیح | پیش‌فرض |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | اتصال دیتابیس (داخلی — بدون پورت عمومی) | `dadnovin` / **اجباری** / `dadnovin` |
| `SECRET_KEY` | امضای نشست — `openssl rand -hex 32` | **اجباری در prod** |
| `ENVIRONMENT` | `development` / `production` | `development` |
| `COOKIE_SECURE` | فقط پشت HTTPS `true` کنید | `false` |
| `CORS_ORIGINS` | originهای مجاز API (جدا با `,`) | `http://localhost:8080` |
| `PUBLIC_BASE_URL` | origin مطلق سایت — در لینک ارجاع/QR | `http://localhost:8080` |
| `HTTP_PORT` | پورت gateway | `8080` |
| `PAYOUT_ENC_KEY` | کلید AES-256-GCM بانک (fallback: مشتق از SECRET_KEY) | خالی |
| `AI_ENABLED` / `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | دستیار AI — بدون کلید، حالت retrieval-only | `true` / خالی |
| `BOOTSTRAP_ADMIN_*` | ساخت خودکار ادمین ران اول (اختیاری — CLI ترجیح دارد) | خالی |
| `SEED_ON_BOOT` | سید محتوای اولیه در استارت | `false` |
| `UVICORN_WORKERS` | تعداد ورکر | `1` (prod: `2`) |
| `UVICORN_RELOAD` | `1` = hot-reload در dev override | — |

**prod فایل:** `ENVIRONMENT=production` + `COOKIE_SECURE=true` + SECRET_KEY واقعی
+ CORS غیر wildcard — سرور در غیر این صورت boot نمی‌شود.

## ساختار پوشه‌ها

```
├── frontend/          سایت عمومی + پنل کاربر  (src/, e2e/, AGENTS.md)
├── panel/             پنل ادمین — SPA جدا (base=/admin)
├── backend/
│   ├── main/          api/router · services · repositories · models · schemas
│   │                  security · ai · core (config/rate-limit) · seed·cli
│   ├── alembic/       زنجیره‌ی migration (0001→0012، idempotent)
│   ├── seed/          site_content.json (محتوای واقعی سایت)
│   └── tests/         ۱۰۱ تست pytest
├── infrastructure/nginx/   gateway/web/panel server blocks
├── scripts/           backup.sh · restore.sh
├── docs/              architecture · database(ERD) · api · deployment · referral
├── docker-compose.yml        استک پایه
├── docker-compose.dev.yml    اورراید توسعه (api reload + db :5433)
├── docker-compose.prod.yml   اورراید پروداکشن
└── Makefile           up/dev/prod · test · lint · migrate · seed* · backup/restore
```

## توسعه

```bash
make dev            # استک dev (api hot-reload، db روی localhost:5433)
make test           # بک‌اند + فرانت + پنل
make lint typecheck # ruff + prettier check + tsc
make format         # ruff format + prettier --write روی کل پروژه
make seed-dev       # داده‌ی دموی ساختگی — فقط توسعه (demo / Dev-Demo-1234)
```

| دستور | کار |
|---|---|
| `make migrate` | alembic upgrade head |
| `make roles` | سید نقش‌های RBAC (همیشه امن) |
| `make seed` | سید محتوای واقعی CMS (ایدم‌پوتنت) |
| `make seed-dev` | داده‌ی دموی fake — در prod رد می‌شود |
| `make bootstrap-admin U=.. P=..` | ساخت super_admin |
| `make backup` / `make restore FILE=..` | dump/restore دیتابیس |

تست‌ها: `cd backend && python -m pytest -q` (۱۰۱ تست) ·
`cd frontend && npm test` (۲۳ تست) · `frontend/e2e` سناریوهای Playwright
(به مرورگر محلی نیاز دارد).

## مستندات

- `docs/architecture.md` — نمودار معماری و تصمیم‌ها
- `docs/database.md` — ERD، کاتالوگ جدول‌ها، قواعد یکپارچگی، seed
- `docs/api.md` — سطح‌ها و مسیرهای API
- `docs/referral-and-commission.md` — منطق ارجاع/کمیسیون/تسویه + ملاحظات حقوقی
- `docs/deployment.md` — استقرار production، TLS، backup، rollback
- `CONTRIBUTING.md` — جریان کار تیمی و قوانین کد

## امنیت و محرمانگی

- نشست opaque + هش توکن در DB؛ انقضای idle و مطلق؛ CSRF؛ rate limit.
- هر عملیات حساس سرور-مستول است (مالکیت، نقش، ارجاع، کمیسیون، تسویه).
- داده‌ی بانکی رمزنگاری‌شده + mask؛ فیش‌ها هرگز عمومی سرو نمی‌شوند.
- داده‌ی خصوصی وکیل/موکل در خروجی عمومی، JSON-LD و API نمی‌آید.
- ریپو **خصوصی** — `LICENSE` = All Rights Reserved.

## محدودیت‌های شناخته‌شده

- rate limit در حافظه‌ی هر worker است (برای چند replica، در لبه limit بگذارید).
- E2E مرورگری نیاز به نصب Playwright دارد؛ در CI مرورگر دانلود می‌شود.
- `seed-dev` فقط برای توسعه است و در `ENVIRONMENT=production` رد می‌شود.
