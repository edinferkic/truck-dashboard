#!/usr/bin/env bash
set -euo pipefail
API="${API_BASE:-http://localhost:4000}"

read -p "Email: " EMAIL
read -s -p "Password: " PASSWORD
echo

JWT=$(curl -s -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$API/auth/login" | jq -r .token)

if [ -z "$JWT" ] || [ "$JWT" = "null" ]; then
  echo "Failed to get token"
  exit 1
fi

export JWT
echo "JWT set (starts with ${JWT:0:8}…). Use it in this shell."
