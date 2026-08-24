#!/usr/bin/env bash
set -e

APP_DIR="UDIAgent/"
IMAGE_NAME="udi-agent"
CONTAINER_NAME="udi-agent"
BRANCH="main"

cd "$APP_DIR"

echo "Pulling latest code..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

GIT_SHA=$(git rev-parse --short HEAD)
echo "Building image $IMAGE_NAME:$GIT_SHA ..."
docker build -t "$IMAGE_NAME:$GIT_SHA" -t "$IMAGE_NAME:latest" .

echo "Stopping existing container (if any)..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 80:80 \
  --env-file .env \
  --restart unless-stopped \
  "$IMAGE_NAME:$GIT_SHA"

echo "Waiting for container to be running..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not found")
  if [ "$STATUS" = "running" ]; then
    echo "Container is running."
    break
  fi
  echo "  ($i/30) Status: $STATUS — retrying in 2s..."
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "Container did not start in time." >&2
    exit 1
  fi
done

echo "Deployment complete. Running container:"
docker ps --filter "name=$CONTAINER_NAME"