FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_RUNTIME_DIR=/app/runtime \
    PACKAGES_DIR=/app/runtime/packages \
    SETTINGS_FILE=/app/runtime/settings.yaml \
    PACKAGE_OVERRIDES_FILE=/app/runtime/package-overrides.yaml \
    REFRESH_METADATA_FILE=/app/runtime/package-refresh-metadata.yaml \
    DATABASE_URL=sqlite:////app/runtime/data/lle.db \
    PORT=8000

WORKDIR /app/backend

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid 10001 --create-home --home-dir /home/app app

COPY backend /app/backend
COPY packages /app/packages

RUN python -m pip install --upgrade pip \
    && python -m pip install /app/backend \
    && mkdir -p /app/runtime \
    && chown -R 10001:10001 /app

USER 10001:10001

EXPOSE 8000

CMD ["sh", "-c", "mkdir -p \"$APP_RUNTIME_DIR/data\" \"$PACKAGES_DIR\" && if [ ! -f \"$SETTINGS_FILE\" ]; then cp /app/backend/settings.yaml \"$SETTINGS_FILE\"; fi && if [ ! -f \"$PACKAGE_OVERRIDES_FILE\" ]; then cp /app/backend/package-overrides.yaml \"$PACKAGE_OVERRIDES_FILE\"; fi && if [ ! -f \"$REFRESH_METADATA_FILE\" ]; then cp /app/backend/package-refresh-metadata.yaml \"$REFRESH_METADATA_FILE\"; fi && if [ -z \"$(ls -A \"$PACKAGES_DIR\" 2>/dev/null)\" ]; then cp -R /app/packages/. \"$PACKAGES_DIR\"/; fi && exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\""]
