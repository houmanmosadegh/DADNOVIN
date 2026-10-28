"""Keyword retrieval over approved knowledge sources.

PostgreSQL full-text could replace this later; a scored ILIKE pass over a
small, curated corpus is accurate enough and keeps SQLite tests working.
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.ai import AIKnowledgeSource

_WORD_RE = re.compile(r"[\wآ-ی]+", re.UNICODE)
_STOPWORDS = {
    "از", "به", "در", "و", "با", "که", "این", "آن", "را", "برای", "است",
    "من", "شما", "ما", "یا", "اگر", "یک", "های", "می", "چه", "چطور",
}


def _terms(query: str) -> list[str]:
    words = [w for w in _WORD_RE.findall(query) if len(w) > 2]
    return [w for w in words if w not in _STOPWORDS][:12]


async def search_knowledge(
    db: AsyncSession, query: str, *, limit: int = 6
) -> list[AIKnowledgeSource]:
    rows = list(
        (
            await db.execute(
                select(AIKnowledgeSource).where(
                    AIKnowledgeSource.is_active.is_(True)
                )
            )
        ).scalars()
    )
    if not rows:
        return []
    terms = _terms(query)
    scored: list[tuple[float, AIKnowledgeSource]] = []
    for row in rows:
        hay = f"{row.title}\n{row.body}"
        score = 0.0
        for t in terms:
            score += hay.count(t) * 2
            if t in row.title:
                score += 4
        # whole-phrase bonus
        if query.strip() and query.strip() in hay:
            score += 10
        if score:
            scored.append((score, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    if scored:
        return [r for _, r in scored[:limit]]
    # nothing matched — return a small core set so the assistant can still
    # answer "who are you / how do I contact you" style questions
    core = [r for r in rows if r.source_type in ("brand", "contact", "page")]
    return (core or rows)[:limit]
