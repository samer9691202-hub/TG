FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
RUN mkdir -p /data/downloads
ENV DOWNLOAD_DIR=/data/downloads PORT=8765 PYTHONUNBUFFERED=1
EXPOSE 8765
CMD ["sh","-c","gunicorn --workers 1 --threads 4 --timeout 3600 --bind 0.0.0.0:${PORT} server:app"]
