// web/lib/apiClient.js
const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("truck_token") ||
    ""
  ).trim();
}

export function readToken() {
  return getToken();
}

export function writeToken(tok) {
  const clean = (tok || "").trim();
  ["token", "jwt", "truck_token"].forEach((k) => localStorage.setItem(k, clean));
  return clean;
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  base,
  health: () => request("/health"),

  // Loads
  listLoads: () => request("/loads"),
  createLoad: (payload) => request("/loads", { method: "POST", body: payload }),

  // Expenses
  listExpenses: () => request("/expenses"),
  createExpense: (payload) =>
    request("/expenses", { method: "POST", body: payload }),

  // Reports
  reportWeekly: (from, to) =>
    request("/report/weekly", { method: "POST", body: { from, to } }),
};

export default api;
