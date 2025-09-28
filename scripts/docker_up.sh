#!/usr/bin/env bash
set -euo pipefail
if command -v docker compose >/dev/null 2>&1; then
  docker compose up -d
else
  docker-compose up -d
fi
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
set -euo pipefail
docker compose up -d
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
