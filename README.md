# دادنوین — وب‌سایت + پنل مدیریت + بک‌اند

سامانهٔ کامل گروه حقوقی دادنوین: وب‌سایت عمومی (سینمایی/سه‌بعدی)، پنل مدیریت جداگانه، بک‌اند FastAPI با PostgreSQL، درخواست مشاوره، تیکت پشتیبانی و مشاور هوشمند مبتنی بر محتوای سایت.

```
dadnovin/
├── frontend/        سایت عمومی + پنل کاربر (/panel) — Vite + React 19 + TS + three.js (RTL, فارسی)
├── panel/           پنل مدیریت — Vite + React + TS + Tailwind (SPA جدا، base=/admin)
├── backend/         FastAPI + SQLAlchemy async + Alembic + PostgreSQL
│   ├── main/        app, api/router, models, schemas, security, ai, services
│   ├── alembic/     مایگریشن‌ها (0001–0005)
│   ├── seed/        site_content.json — محتوای استخراج‌شده از فرانت
│   └── tests/       ۴۹ تست pytest (SQLite + httpx)
├── infrastructure/nginx/   gateway.conf / web.conf / panel.conf
├── storage/         فایل‌های آپلودی (ولوم persistent)
├── docker-compose.yml        استک کامل: db + api + web + panel + gateway
├── docker-compose.prod.yml   اورراید پروداکشن
└── .env.example     متغیرهای محیطی
```

## شروع سریع (Docker)

```bash
cp .env.example .env          # SECRET_KEY و POSTGRES_PASSWORD را عوض کنید
docker compose up -d --build
```

بعد از بالا آمدن:

| مسیر | چیست |
|---|---|
| `http://localhost:8080/` | وب‌سایت عمومی |
| `http://localhost:8080/panel` | پنل کاربر — فرم ورود/ثبت‌نام مشترک همه (ادمین هم از همین‌جا وارد می‌شود و به /admin می‌رود) |
| `http://localhost:8080/admin/` | پنل مدیریت |
| `http://localhost:8080/api/v1/...` | API |
| `http://localhost:8080/docs` | OpenAPI (فقط development) |

> مایگریشن و سید هنگام استارت `api` خودکار اجرا می‌شوند (entrypoint). دیتا در ولوم‌های `pgdata` و `media` پایدار می‌ماند.

## ساخت اولین مدیر

```bash
docker compose exec api python -m main.cli bootstrap-admin \
  --username admin --password 'یک-رمز-قوی-طولانی' --name 'مدیر مجموعه' --email admin@example.com
```

یا قبل از `up` مقدار `BOOTSTRAP_ADMIN_USERNAME/PASSWORD` را در `.env` بگذارید (فقط ران اول).

## دستورهای عملیاتی

```bash
docker compose up -d --build                                   # استارت
docker compose exec api alembic upgrade head                   # مایگریشن دستی
docker compose exec api python -m main.cli seed                # سید مجدد (idempotent)
docker compose logs -f api                                     # لاگ بک‌اند
docker compose down                                            # توقف (دیتا می‌ماند)
docker compose down -v                                         # توقف + حذف ولوم‌ها ⚠️
cd backend && python -m pytest -q                              # تست‌های بک‌اند
cd frontend && npm test && npm run build                       # تست/بیلد سایت
cd panel && npm run build                                      # بیلد پنل
```

## توسعهٔ محلی (بدون داکر)

```bash
# بک‌اند روی :8000 — نیاز به postgres محلی یا docker compose up -d db
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]' && alembic upgrade head && python -m main.cli seed
uvicorn main.main:app --reload

cd frontend && npm i && npm run dev     # سایت روی :5173 (پروکسی /api → :8000)
cd panel && npm i && npm run dev        # پنل مدیریت روی :5174/admin/
```

## معماری امنیت

- رمزها با **Argon2id**؛ سشن‌ها opaque و فقط SHA-256 هش‌شان ذخیره می‌شود؛ کوکی HttpOnly + SameSite + انقضای idle/absolute
- همهٔ مسیرهای `/api/v1/admin/*` پشت احراز هویت + RBAC (`super_admin`, `admin`, `editor`, `support`)
- CSRF: هدر `X-Requested-With` یا Origin هم‌دامنه/مجاز؛ CORS محدود به لیست env
- Rate limit درون‌حافظه‌ای: عمومی ۱۲۰/دقیقه، لاگین ۸/دقیقه، فرم‌ها ۱۰/دقیقه، AI ۱۵/دقیقه
- آپلود: اعتبارسنجی امضای فایل (magic bytes)، محدودیت ۶MB/۴۰۰۰px، نام تصادفی، Pillow re-encode
- تیکت: `access_code` فقط به‌صورت هش Argon2 نگه داشته می‌شود — شماره+کد لازم برای پیگیری
- در پروداکشن `ENVIRONMENT=production` اجبار می‌کند: SECRET_KEY واقعی، `COOKIE_SECURE=true`، بدون CORS wildcard

## مشاور هوشمند (AI)

- `POST /api/v1/ai/chat` — دانش از `ai_knowledge_sources` + صفحات منتشرشده بازیابی می‌شود (PostgreSQL FTS)، سپس به provider ارسال می‌گردد
- بدون `AI_API_KEY` → پاسخ retrieval-only صادقانه (متن دانش + راهنمای تماس)، نه جعل
- provider سازگار با OpenAI chat-completions از طریق `AI_BASE_URL`/`AI_MODEL` قابل تعویض است
- محتوای بازیابی‌شده به‌عنوان untrusted input تزریق نمی‌شود به system prompt؛ خروجی با disclaimer حقوقی محدود می‌شود
- پنل: مدیریت منابع دانش، sync دستی، تاریخچه مکالمات

## حساب کاربری، ارجاع و کمیسیون

- `POST /api/v1/account-auth/register` — ثبت‌نام با نام+موبایل+رمز (+ کد معرف اختیاری)؛ ورود با موبایل همان موتور سشن امن قبلی است
- `GET /api/v1/account/*` — پنل کاربر: درخواست‌های من، پیام‌ها، اعلان‌ها، کیف پول، برداشت (مالکیت سرورساید — بدون IDOR)
- بازاریابی: کاربر `POST /account/marketer/apply` می‌زند، ادمین تأیید کند → نقش `marketer` + کد ارجاع تغییرناپذیر (`DN-XXXXXX`)
- کد ارجاع در `/?ref=` + فیلد فرم مشاوره/ثبت‌نام؛ کلیک و انتساب در `referral_clicks`/`referral_attributions` (یکتا، تغییرناپذیر)
- ضد تقلب: خودارجاعی (user_id یا تلفن یکسان) و «مشتری تکراری» رد می‌شود؛ IP/User-Agent ثبت می‌گردد
- حریم خصوصی: بازاریاب فقط نام ماسک‌شده + وضعیت کلی + مبلغ کمیسیون می‌بیند — هیچ محتوای پرونده‌ای
- کمیسیون فقط هنگام انتقال وضعیت به `accepted` ساخته می‌شود (idempotent به‌ازای درخواست)؛ قواعد fixed/percent + پله + override در `commission_rules` و از طریق API مدیریت می‌شود. صفحهٔ تأیید/رد درخواست‌های بازاریابی در پنل ادمین → «درخواست‌های بازاریابی» (فقط super_admin)
- کیف پول: دفتر کل append-only (`wallet_ledger`)، موجودی از `SUM(amount)`، کلید idempotency یکتا؛ برداشت با حداقل قابل تنظیم، شبا/کارت **Fernet-رمزنگاری‌شده** و ماسک‌شده در UI، تأیید ادمین با بررسی مجدد موجودی در یک تراکنش

### ملاحظات انطباق

> **هشدار:** پرداخت پورسانت بابت جذب موکل ممکن است با مقررات کانون وکلا و اخلاق حرفه‌ای تعارض داشته باشد. به همین دلیل `commission_enabled` **پیش‌فرض خاموش** است و قبل از فعال‌سازی باید با کانون/مشاور حقوقی هماهنگ شود. مبنای «درصد» فقط از مبلغ حق‌الوکالهٔ ثبت‌شدهٔ ادمین است — نه نتیجهٔ دعوا. هیچ متن UI وعدهٔ نتیجهٔ پرونده نمی‌دهد.

تنظیمات ارجاع/کمیسیون از طریق API (`/api/v1/admin/settings`): `commission_enabled` (پیش‌فرض خاموش — ملاحظهٔ انطباق با مقررات کانون وکلا)، `cookie_days`، `hold_days`، `min_payout`، `monthly_cap`، `reapply_days`. وقتی `commission_enabled` خاموش است، کیف پول/برداشت در پنل کاربر نمایش داده نمی‌شود و هیچ کمیسیونی ثبت نمی‌شود؛ آمار ارجاع همچنان ثبت می‌شود.

## ادیت محتوا از پنل

- **تنظیمات**: برند، شماره‌ها، ایمیل، آدرس، شبکه‌ها، SEO پیش‌فرض → فوری روی سایت (فرانت موقع لود `/api/v1/public/settings` را merge می‌کند؛ fallback = فایل استاتیک)
- **صفحات**: سکشن‌های هر صفحه (hero، لید، پاراگراف‌ها…) + revision history + بازگردانی
- **وکلا**: CRUD کامل، آپلود/جایگزینی عکس، ترتیب نمایش، نمایش/عدم نمایش عمومی
- **رسانه**: کتابخانهٔ تصاویر
- **درخواست‌ها/تیکت‌ها**: جدول، فیلتر وضعیت، جزئیات، ارجاع، یادداشت داخلی، پاسخ
- **کاربران/نقش‌ها**، **گزارش فعالیت (audit)**، **تنظیمات AI**

## پروداکشن

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

در `.env`: `ENVIRONMENT=production`، `SECRET_KEY` قوی، `COOKIE_SECURE=true` (پشت HTTPS)، `CORS_ORIGINS=https://domain.tld`، `HTTP_PORT=80`. TLS را در لبه (LB/Cloudflare/سرتیفیکیت واقعی روی gateway) تمامینیش کنید — `infrastructure/nginx/gateway.conf` را با بلاک `listen 443 ssl` + cert واقعی گسترش دهید. دیتابیس هیچ پورتی به بیرون expose نمی‌کند.

## نکات و محدودیت‌ها

- Rate limiter حافظه‌ای است؛ با `UVICORN_WORKERS>1` سهمیه بین پروسس‌ها تقسیم می‌شود — برای enforce دقیق multi-worker به Redis نیاز است
- سید idempotent است — محتوای ویرایش‌شدهٔ کاربر را بازنویسی نمی‌کند
- `privateNotDisplayed` در `lawyers.fa.js` هرگز به API/seed/خروجی راه ندارد
- پرِندر استاتیک (`frontend/dist`) کپی پیش‌فرض را شامل می‌شود؛ محتوای CMS سمت کلاینت و لحظه‌ای merge می‌شود — برای SEO متن‌های اصلی همچنان از build-time render می‌آیند
