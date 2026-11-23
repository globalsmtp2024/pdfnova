FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        qpdf \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-urd \
        tesseract-ocr-ara \
        fonts-dejavu-core \
        fonts-noto-core \
        fonts-noto \
        chromium \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app

COPY apps/api/pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install .

ENV U2NET_HOME=/opt/models/u2net \
    REMBG_HOME=/opt/models/u2net
RUN mkdir -p /opt/models/u2net \
    && python -c "from rembg import new_session; new_session('u2netp')" \
    && chmod -R a+rX /opt/models

COPY apps/api/app ./app
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./
COPY packages/shared/brand.json /app/brand.json

ENV BRAND_FILE=/app/brand.json \
    WORK_ROOT=/tmp/pdfnova/work \
    STORAGE_LOCAL_ROOT=/data/storage

RUN mkdir -p /tmp/pdfnova/work /data/storage && chown -R app:app /tmp/pdfnova /data

USER app

FROM base AS api
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=4).status == 200 else 1)"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers ${API_WORKERS:-2}"]

FROM base AS background
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "app.jobs.background"]

FROM base AS worker
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec arq app.jobs.worker.${WORKER_CLASS:-DefaultWorker}"]

FROM base AS office-worker
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
    && rm -rf /var/lib/apt/lists/*
USER app
ENV HOME=/tmp/pdfnova
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec arq app.jobs.worker.${WORKER_CLASS:-DefaultWorker}"]
