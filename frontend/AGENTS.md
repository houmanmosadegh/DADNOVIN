# Dadnovin — Frontend

Vite + React 19 + TypeScript SPA for «گروه حقوقی دادنوین» (DADNOVIN LEGAL GROUP). Persian, RTL-first.

## Commands

- `npm run dev` — dev server
- `npm run build` — typecheck + client build + SSR bundle + static prerender of every route into `dist/` (SEO: crawlers get full HTML)
- `npm test` — vitest (jsdom) unit tests
- `npm run typecheck` — types only

## Conventions

- All public copy lives in `src/content/lawyers.fa.js` — never hardcode brand/service/lawyer strings in components.
- `privateNotDisplayed` fields in the data file are internal-only; they must never be rendered, serialized into markup, sent to analytics, or put in JSON-LD.
- Routes: `/`, `/about`, `/services` (+ `#<service-slug>` anchors), `/consultation`, `/contact`. Add real pages before linking — no dead links. Register new routes in `AppRoutes`, `seo` map, `sitemap.xml` and `scripts/prerender.mjs`.
- Design tokens in `src/styles/tokens.css` (`#0C1120` deep-navy bg, `#151E36`/`#121A30` surfaces, `#222B40` graphite, champagne `#D7B56D` / amber `#FFCB65` gold). Gold is for accents only — numbers, active states, hairlines; never flood the page. Card/panel surfaces are a single clean navy gradient (`ink-2 → ink-0` + faint sheen/gold glow) — no marble veins, streak lines, or noise textures; keep section backgrounds flat so the page reads as one surface.
- Homepage uses the "chapter" system: each section gets a `ChapterHead` (۰۱…۰۵) and a stable `id` (`about`, `approach`, `services`, `team`, `consult`). All content is permanently visible — no accordions/FAQ patterns.
- Sections: `ledger` rows (about + animated `CountUp` stats), `service-card` 3×2 grid with pointer-tracked glow (services), `lawyer` media/text rows (alternating flip), `timeline` nodes (consultation page).
- `/about` page: hero head + gold-ruled `about-hero__motto` tagline, `page__body` paragraphs, then `.members-grid` → two `ResumeCard` (`components/ResumeCard.tsx` + `.css`, `.rcard.*`) — marble resume cards with kicker/name/Latin-name/degree/bio, 3-cell `.rcard__stats` strip, two-column expertise bullets, education, and per-card consultation CTA + tel/email lines. Then the `.trust` row + closing CTA with direct member phone links. Member `resume`/`contact` data lives inside each `lawyers[]` entry; `portrait: null` renders the branded emblem placeholder (no fake photos — drop the real file into `public/images/` and set the path). Pointer glow helper is `utils/pointerGlow.ts` (`--gx/--gy` vars) — reuse it for new cards.
- Hero is full-bleed cinematic: the `intro-hall-*` Lady-Justice hall photo covers the section (`.hero__bg`), with directional ink scrims keeping the right-side copy readable and the bottom edge melting into the page. Portrait crop (`intro-hall-portrait-*`) on ≤56rem, copy anchored at the bottom.
- `StatueParticles` (three.js/WebGL, code-split) drives the statue dust effects. Services (`/`, `.sg__statue`): photo-hole reveal — canvas UNDER the alpha image, `--hx0…/--hr4` radial mask holes on the img. Hero (`/`, `HERO_MODEL`, 236k pts, `hero-statue-points.bin`): overlay mode — canvas ABOVE photo+scrim, dust alpha gated by blob strength, silhouette-gated by `hero-statue-sil.png` (regenerate from the .bin via PIL if the model changes), JS-resolved `box()` cover-fits the photographed statue, `wavePeriod` repeats the top→bottom reveal, `sway` adds slow yaw rotation. Model sources (HTML demos) live in `src/assets/models/` — never ship them in `public/`.
- There is no scroll-scrubbed intro — the hero itself is the cinematic opening (one-time mount animation only; never scroll-linked motion). Hall master: `src/assets/intro-hall.png` → shipped variants `public/images/intro-hall-*`.
- CSS is colocated per component (`Header.css`, `Footer.css`, `ConsultationForm.css`) plus `src/sections/home.css` and `src/pages/pages.css`. Use logical properties (`inset-inline-*`) — the page is RTL.
- Icons: `lucide-react` for UI icons. `<SectionDivider>` takes no props — every divider renders the same `symbol-column-*` 3D mark on one shared axis (lines run along the plinth); never use logo/brand artwork in dividers, and never place a divider immediately before the footer. Service-card symbols come from `services[].symbol` → `/images/symbol-<name>-{384,640}.webp`.
- Header: single CTA instance inside `.site-nav` (CSS places it). Always dark glass (`.site-header__bg`, ~0.82 alpha → 0.96 when `.is-scrolled`) — over the intro and the site. `backdrop-filter` must stay on `.site-header__bg` — never on `.site-header` itself (it would become a containing block for the fixed drawer/backdrop). Scroll progress + sliding nav marker write styles directly to DOM (no re-render).
- Smooth scrolling: `SmoothScroll` mounts a shared Lenis instance (components/SmoothScroll.tsx, `getLenis()`); `ScrollManager` routes hash/restore jumps through it. Disabled under reduced-motion. Keep the Lenis reset rules in `global.css`.
- Motion: `Reveal` with `variant` prop (`up|x-start|x-end|clip|line|fade`), one-shot scroll reveals; `prefers-reduced-motion` respected everywhere. No animation libraries — CSS transitions/keyframes only.
- ConsultationForm has NO backend — it validates and produces a copyable request summary. Never fake a "sent" state.
- SEO: per-page meta via `useSeo(page, path)` + `seo` map in the data file; static JSON-LD in `index.html`; prerender script injects app HTML + per-route meta.
- `public/images/` ships only optimized, referenced assets (webp + png fallback for alpha art, jpg for photos; explicit w/h). Masters live in `src/assets/` (`intro-hall.png`, `picture-update.png`, `main-background-update.png`, `dadnovin-logo.png`, `dadnovingroup.png`, `symbols/`) — never copy them back into `public/`; generate variants with PIL instead. `picture-*` are transparent cutouts (white-keyed + alpha cleanup); `*-portrait-*.webp` are opaque studio composites on a lighter slate backdrop (bg removed via numpy/scipy + un-blend, then composited over a radial slate gradient — chest-up square crops).
- Fonts: `@fontsource-variable/vazirmatn` (body, fa) + `@fontsource/markazi-text` (display headings — formal naskh) + `@fontsource/cormorant-garamond` (latin wordmark), self-hosted, `font-display: swap`. `--font-fa` / `--font-display` / `--font-en` tokens in `tokens.css`; headings only ship weight 700 (Markazi has no 800 — never set headings above 700).
