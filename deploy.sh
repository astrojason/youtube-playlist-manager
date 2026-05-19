#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER="astrojason"
REMOTE_HOST="astroserver"
CONTAINER="youtube-playlist-manager"
IMAGE="youtube-playlist-manager:latest"
TAR="youtube-playlist-manager.tar"

echo "==> Building image (linux/amd64)..."
docker build --platform linux/amd64 -t "$IMAGE" .

echo "==> Saving image to $TAR..."
docker save -o "$TAR" "$IMAGE"

echo "==> Uploading image and .env to $REMOTE_HOST..."
scp "$TAR" .env "$REMOTE_USER@$REMOTE_HOST:/tmp/"

echo "==> Cleaning up local tar..."
rm "$TAR"

echo "==> Deploying on $REMOTE_HOST..."
ssh "$REMOTE_USER@$REMOTE_HOST" bash <<'REMOTE'
set -euo pipefail
docker stop youtube-playlist-manager 2>/dev/null || true
docker rm -f youtube-playlist-manager 2>/dev/null || true
docker load -i /tmp/youtube-playlist-manager.tar
mv /tmp/.env ~/youtube-playlist-manager.env
docker run -d \
  --name youtube-playlist-manager \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ~/youtube-playlist-manager.env \
  -e DATA_DIR=/app/data \
  -v youtube-data:/app/data \
  youtube-playlist-manager:latest
rm /tmp/youtube-playlist-manager.tar
REMOTE

echo "==> Done. App running at http://$REMOTE_HOST:3000"
