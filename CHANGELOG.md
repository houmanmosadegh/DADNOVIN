# Changelog

Format: [Keep a Changelog](https://keepachangelog.com) — dates ISO.

## [Unreleased] — Production v5 + ساماندهی مخزن

### Added
- پنل کاربر کامل: داشبورد، ثبت/لیست/جزئیات مشاوره، اعلان‌ها، پروفایل، بازاریابی.
- کارت بازاریابی دانلودی PNG/PDF + QR با error-correction و فونت فارسی embed.
- فیش‌های تسویه: مدل `payouts`، آپلود امن (magic bytes + Pillow re-encode)،
  تخصیص خودکار به کمیسیون‌های approved، نمای بازاریاب.
- بانک بازاریاب: اعتبارسنجی Luhn + MOD-97، رمزنگاری AES-256-GCM، mask در خروجی،
  هولد ۲۴h تسویه بعد از تغییر بانک، endpoint reveal با audit.
- لینک‌های کانالی `?s=` با whitelist + آمار per-channel + کوکی `dn_src`.
- چرخش کد ارجاع: کد جدید CSPRNG + check digit؛ کدهای قبلی در `retired_ref_codes`.
- ادیتور مقالات TipTap 3 + sanitize سمت سرور (nh3) + اسنپ‌شات نسخه + read-time.
- لوگوی پویا از CMS در هدر/فوتر/auth/پنل‌ها/favicon.
- `docs/` کامل: architecture, database (ERD), api, deployment, referral-and-commission.
- `Makefile`، `docker-compose.dev.yml`، `scripts/backup.sh`، `scripts/restore.sh`.
- CHECK constraintها در DB (مهاجرت 0012) + `cli seed-dev` (دادهٔ دموی fake).
- CI در `.github/workflows/ci.yml` + قالب‌های PR/Issue + Dependabot + CODEOWNERS.

### Changed
- مبالغ از ریال به **تومان** (مهاجرت 0011، ÷۱۰ با داده‌ی واقعی تست شد).
- کمیسیون فقط درصدی — موتور قواعد (cap/holdback/tier/بازه‌ی زمانی) حذف شد.
- TipTap 2.x → 3.32.2 (رفع ۳۲ آسیب‌پذیری moderate).
- FastAPI 0.124.4 → 0.162.0، starlette → 1.10.0، pillow → 13.0.0،
  cryptography → 50.0.0، python-multipart → 0.0.31، pydantic-settings → 2.14.2
  (رفع کامل یافته‌های pip-audit — خروجی نهایی صفر آسیب‌پذیری).
- `ruff format` روی کل بک‌اند + Prettier روی هر دو فرانت (با `.prettierrc.json`
  هماهنگ با استایل هر پکیج — frontend: single-quote/no-semi، panel: double/semi).
- مهاجرت‌های 0010/0011 idempotent شدند؛ زنجیره روی PostgreSQL تازه تست شد.
- برچسب پاسخ AI «پاسخ خودکار سیستم» + حذف JSON خام از دانش و timeline.

### Fixed
- تکرار auto-reply و ردیف دوبل در تایم‌لاین ادمین.
- N+1 در لیست ارجاع‌های بازاریاب (تجمیع کل جدول receipts بدون فیلتر).
- کدهای قدیمی ۶کاراکتری بدون check-digit resolve نمی‌شدند.
- `.gitignore` فقط ریشهٔ `storage/` را می‌گرفت — `backend/storage/` هم اضافه شد.

### Removed
- `commission_engine` (سرویس قواعد)، تب قواعد در ادمین، فیلدهای cap/holdback.
- `main/tasks/` خالی، تابع مرده‌ی `ticket_number()`، وابستگی‌های بلااستفاده‌ی
  panel (`zod`، `react-hook-form`، `@hookform/resolvers`).
- فایل‌های agent/dev از tracking: `SKILLS_USED.md`، `skills-lock.json`،
  `frontend/.claude/`، اسکریپت‌های QA دستی، `frontend/docs/audit.md`.
