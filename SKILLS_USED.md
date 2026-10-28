# Skills Used — DADNOVIN Full-Stack Build

Skills discovered via the local skills registry (`npx skills`/`find-skills`), inspected, installed into `.agents/skills/`, and applied during implementation.

## Installed & applied

| Skill | Source | How it was used |
|---|---|---|
| **fastapi** | `fastapi/fastapi` (official FastAPI org) | Router structure (`APIRouter` + `include_router` prefixes), `Annotated[..., Depends()]` DI style, typed `response_model`s, one HTTP op per function, Pydantic v2 schemas without `...` required-defaults, no `RootModel`. Applied across `backend/main/api/router/**`, `schemas/`, `dependencies/`. Re-invoked during Stage 1 to keep the new unified inbox/requests/contacts routers consistent. |
| **docker-compose-patterns** | `docker/skills` (official Docker org) | `docker-compose.yml`: pinned image tags (no `latest`), Postgres healthcheck + `depends_on: condition: service_healthy`, named volumes `pgdata`/`media`, `restart: unless-stopped`, env-based config, internal-only DB network. Same patterns in `docker-compose.prod.yml` override. Re-invoked during Stage 1 for health-check/restart guidance while verifying the live stack. |

## Built-in / repo skills consulted

| Skill | Role |
|---|---|
| **find-skills** | Used at session start to locate the two skills above. |
| **frontend-design** | Consulted for panel visual direction (navy/gold tokens, restrained accent usage). |
| **web-design-guidelines** | Consulted for accessibility checklist used in panel UI work. |

## Repo guidance files (treated as project rules, not installed skills)

- `frontend/AGENTS.md` — visual/copy/RTL/SEO conventions of the public site; drove the non-destructive `content/remote.ts` merge approach (static file remains source of truth, CMS merges at runtime with fallback).

## Notes

- No skill installation scripts were executed blindly — each `SKILL.md` was read first; both skills are documentation-style guidance packs.
- No other community skills were installed; unverifiable skills were not invented or claimed.
