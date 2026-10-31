# مشارکت در دادنوین

این مخزن **خصوصی** است؛ دسترسی فقط به اعضای تیم داده می‌شود.

## شاخه‌ها و جریان کار

- `main` — پایدار و قابل‌استقرار. فقط با **Pull Request** عوض می‌شود
  (review حداقل یک نفر + CI سبز). مستقیم push ممنوع.
- `feature/<topic>`، `fix/<topic>`، `chore/<topic>` — از روی `main` باز کنید.
- کامیت‌ها: [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:` `fix:` `refactor:` `chore:` `docs:` `test:` `build:` `ci:`)
  با scope در صورت نیاز: `feat(panel): …`

## اولین روز

```bash
git clone <repo> && cd DADNOVIN
cp .env.example .env
make dev          # یا: docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
make bootstrap-admin U=admin P='Dev-Strong-123'
make seed-dev     # داده‌ی دموی ساختگی (اختیاری)
```

سایت: http://localhost:8080 — پنل کاربر `/panel` — ادمین `/admin` — API `/api/v1`.

## قبل از PR

```bash
make lint typecheck test   # ruff + tsc + pytest/vitest — باید سبز باشند
```

- هر تغییر schema فقط از طریق `backend/alembic/versions/` جدید
  (idempotent — نصب تازه همان migration را اجرا می‌کند). هیچ تغییر دستی در DB ندهید.
- مبالغ همیشه `BIGINT` تومان؛ برچسب UI «تومان».
- منطق کسب‌وکار در `services/`، نه router. داده‌ی خصوصی وکیل/موکل در خروجی
  عمومی و JSON-LD نمی‌آید.
- کپی فارسی سایت در `frontend/src/content/lawyers.fa.js` نگه‌داری می‌شود —
  رشته‌ی برند/خدمت را داخل کامپوننت‌ها هاردکد نکنید.
- UI: اسکیل `anti-ai-ui` (در `.devin/skills/`) و `frontend/AGENTS.md` —
  توکن‌های طراحی موجود، آیکون lucide، بدون emoji، احترام به reduced-motion.
- `.env` و داده‌ی واقعی (کارت، شبا، تلفن مشتری) هرگز commit نمی‌شوند —
  CI gitleaks هم اجرا می‌کند ولی قبل از push خودتان بررسی کنید.

## انتشار

تگ `vX.Y.Z` روی `main` + به‌روزرسانی `CHANGELOG.md`. استقرار طبق
`docs/deployment.md`.
