FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MOLX_DB_PATH=/data/main.db
ENV MAX_STRUCTURE_BYTES=2097152

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src
RUN pip install --no-cache-dir .

RUN mkdir -p /data \
  && useradd --uid 10001 --home-dir /app --shell /usr/sbin/nologin molx \
  && chown -R molx:molx /app /data

USER molx

EXPOSE 8000

CMD ["uvicorn", "molx.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
