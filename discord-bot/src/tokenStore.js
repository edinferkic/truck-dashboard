// discord-bot/src/tokenStore.js
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStore() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(TOKENS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveStore(store) {
  await ensureDataDir();
  await fs.writeFile(TOKENS_FILE, JSON.stringify(store, null, 2));
}

export async function getToken(userId) {
  const store = await loadStore();
  return store[userId] || null;
}

export async function setToken(userId, token) {
  const store = await loadStore();
  store[userId] = token;
  await saveStore(store);
}

export async function deleteToken(userId) {
  const store = await loadStore();
  delete store[userId];
  await saveStore(store);
}
