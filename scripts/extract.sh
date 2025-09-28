#!/usr/bin/env bash
set -euo pipefail
: "${TOKEN:?Set TOKEN}"
DOC_ID="${1:?usage: scripts/extract.sh <doc_id>}"
curl -sS -X POST "http://localhost:4000/documents/$DOC_ID/extract" \
  -H "Authorization: Bearer $TOKEN" | jq .
