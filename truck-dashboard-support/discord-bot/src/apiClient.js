export class ApiClient {
  constructor(base) {
    this.base = base.replace(/\/+$/, "");
  }

  async _req(path, { method="GET", token, body } = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }

  login(email, password) {
    return this._req("/auth/login", { method: "POST", body: { email, password } });
  }

  createLoad(token, load) {
    return this._req("/loads", { method: "POST", token, body: load });
  }

  createExpense(token, exp) {
    return this._req("/expenses", { method: "POST", token, body: exp });
  }

  weeklyReport(token, from, to) {
    const q = new URLSearchParams({ from, to }).toString();
    return this._req(`/report/weekly?${q}`, { method: "GET", token });
  }
}
