# syntax=docker/dockerfile:1
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app

COPY pyproject.toml ./
COPY main ./main
RUN pip install .

COPY alembic ./alembic
COPY alembic.ini ./
COPY seed ./seed
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/storage \
    && chown -R app:app /app

USER app
EXPOSE 8000

ENTRYPOINT ["entrypoint.sh"]
