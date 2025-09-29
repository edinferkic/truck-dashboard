# Truck Dashboard

Monorepo: Node/Express API (`server`), Next.js web (`web`), Discord bot (`discord-bot`), Postgres (Docker).

## Quickstart
1. Copy `.env.example` to `.env` and fill values.
2. Start Postgres (Docker) and API.
3. Start web app.
4. (Optional) start Discord bot.

## Scripts
# server
cd server && npm i && npm run dev   # runs on :4000

# web
cd web && npm i && npm run dev      # runs on :3000

## Docs
- Uploads saved to `server/uploads`.
- OCR via Tesseract/Poppler if available.
- Weekly gross resets Tue 00:00 (last 7 days).
