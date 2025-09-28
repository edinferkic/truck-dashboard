// discord-bot/src/apiClient.js
// Lightweight API client used by the bot or tooling.
// Works in Node (undici) and in browsers.

let _fetch = globalThis.fetch;
let _FormData = globalThis.FormData;
let _File = globalThis.File;

try {
  if (!_fetch) {
    const { fetch: undiciFetch, FormData: UndiciFormData, File: UndiciFile } = await import('undici');
    _fetch = undiciFetch;
    _FormData = UndiciFormData;
    _File = UndiciFile;
  }
} catch {
  // ignore if running in browser (has fetch/FormData/File)
}

export class ApiClient {
  constructor(base) {
    this.base = String(base || '').replace(/\/+$/, '');
  }

  _url(path) {
    return `${this.base}${path}`;
  }

  async _req(path, { method = 'GET', token, body, form } = {}) {
    const headers = {};
    let payload;

    if (form instanceof (_FormData || Object)) {
      payload = form; // boundary set automatically
    } else if (body != null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await (_fetch)(this._url(path), { method, headers, body: payload });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    let data;
    try { data = ct.includes('application/json') ? JSON.parse(text || 'null') : text; } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  }

  // -------- Auth --------
  register(email, password) {
    return this._req('/auth/register', { method: 'POST', body: { email, password } });
  }
  login(email, password) {
    return this._req('/auth/login', { method: 'POST', body: { email, password } });
  }

  // -------- Health --------
  health() {
    return this._req('/healthz/ping', { method: 'GET' });
  }

  // -------- Loads --------
  createLoad(token, load) {
    return this._req('/loads', { method: 'POST', token, body: load });
  }
  // If your API supports PATCH/PUT for loads, add helpers here as needed.

  // -------- Expenses (kept from your original) --------
  createExpense(token, exp) {
    return this._req('/expenses', { method: 'POST', token, body: exp });
  }

  weeklyReport(token, from, to) {
    const q = new URLSearchParams({ from, to }).toString();
    return this._req(`/report/weekly?${q}`, { method: 'GET', token });
  }

  // -------- Documents --------
  listDocuments(token) {
    return this._req('/documents', { method: 'GET', token });
  }

  async uploadDocument(token, { doc_type = 'other', fileBuffer, filename, mimeType = 'application/octet-stream' }) {
    const fd = new (_FormData)();
    fd.set('doc_type', doc_type);

    if (fileBuffer && filename) {
      // Node path: create a File for multipart
      const content = fileBuffer instanceof Uint8Array ? fileBuffer : Buffer.from(fileBuffer);
      const file = new (_File)([content], filename, { type: mimeType });
      fd.append('files', file, filename);
    } else {
      throw new Error('uploadDocument requires fileBuffer and filename');
    }

    return this._req('/documents/upload', { method: 'POST', token, form: fd });
  }

  extractDocument(token, docId) {
    return this._req(`/documents/${docId}/extract`, { method: 'POST', token });
  }

  attachDocument(token, docId, load_id) {
    return this._req(`/documents/${docId}/attach`, { method: 'POST', token, body: { load_id } });
  }

  toLoadFromDocument(token, docId, overrides = {}) {
    // POST /documents/:id/to-load with optional overrides (e.g., delivery_date)
    return this._req(`/documents/${docId}/to-load`, { method: 'POST', token, body: overrides });
  }
}
