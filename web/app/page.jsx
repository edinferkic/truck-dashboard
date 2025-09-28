// web/app/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import api, { readToken, writeToken } from "../lib/apiClient";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [loads, setLoads] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [report, setReport] = useState(null);
  const [health, setHealth] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    pickup_date: "2025-09-14",
    delivery_date: "2025-09-15",
    origin: "SLC, UT",
    destination: "Boise, ID",
    miles: 340,
    gross_pay: 1200,
    broker_fee: 120,
    fuel_cost: 250,
    tolls: 0,
    maintenance_cost: 0,
    other_costs: 15,
    notes: "Food",
    status: "completed",
  });

  // Load any saved token on mount (client-only), then mark mounted
  useEffect(() => {
    const t = readToken();
    if (t) setTokenInput(t);
    setMounted(true);
  }, []);

  // Enable actions only after mount + when we actually have a token string
  const authed = useMemo(
    () => mounted && Boolean((tokenInput || "").trim()),
    [mounted, tokenInput]
  );

  async function handleSaveToken() {
    try {
      const clean = (tokenInput || "").trim();
      writeToken(clean);
      // also save under a common key many UIs check
      localStorage.setItem("token", clean);
      setMsg("Token saved.");
      await refreshData();
    } catch (e) {
      setMsg(e?.message || "Failed saving token");
    }
  }

  async function testHealth() {
    try {
      const r = await api.health(); // returns JSON
      setHealth(`${r?.ok ? "OK" : "DOWN"} @ ${r?.now ?? r?.ts ?? ""}`);
    } catch {
      setHealth("DOWN");
    }
  }

  async function refreshData() {
    setMsg("");
    try {
      const [lRes, eRes] = await Promise.all([api.listLoads(), api.listExpenses()]);
      setLoads(Array.isArray(lRes) ? lRes : []);
      setExpenses(Array.isArray(eRes) ? eRes : []);
      setMsg("Synced.");
    } catch (err) {
      setMsg(err?.message || "Failed to load data");
      setLoads([]);
      setExpenses([]);
    }
  }

  async function createLoad(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api.createLoad(form);
      setMsg("Created load.");
      await refreshData();
    } catch (err) {
      setMsg(err?.message || "Failed to create load");
    }
  }

  async function getWeeklyReport() {
    setMsg("");
    const from = "2025-09-14";
    const to = "2025-09-20";
    try {
      const r = await api.reportWeekly(from, to);
      setReport(r);
    } catch (err) {
      setMsg(err?.message || "Failed to get report");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Trucking Load & Expense Dashboard</h1>
      <p style={{ color: "#666" }}>
        Paste your JWT (from <code>/auth/login</code>) once. It’s stored in <code>localStorage</code>.
      </p>

      {/* Token + controls */}
      <div style={{ display: "flex", gap: 8, margin: "12px 0", alignItems: "center" }}>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="Paste JWT here"
          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button onClick={handleSaveToken} style={btnStyle}>Save Token</button>
        <button onClick={refreshData} disabled={!authed} style={btnStyle}>Sync Data</button>
        <button onClick={testHealth} style={btnStyle}>Test Health</button>
      </div>

      <div style={{ color: "#666", marginBottom: 8 }}>
        API: <code>{api.base}</code> • Health: <b>{health || "unknown"}</b>
      </div>

      {msg && <div style={{ margin: "8px 0", color: "#b45309" }}>{msg}</div>}

      {/* KPIs */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
        <KPICard label="Loads (count)" value={Array.isArray(loads) ? loads.length : 0} />
        <KPICard label="Expenses (count)" value={Array.isArray(expenses) ? expenses.length : 0} />
        <KPICard
          label="Latest Weekly Net"
          value={report ? Number(report.weekly_net ?? 0).toFixed(2) : "-"}
        />
      </section>

      <div style={{ marginTop: 12 }}>
        <button onClick={getWeeklyReport} disabled={!authed} style={btnStyle}>
          Get Weekly Report (2025-09-14 → 2025-09-20)
        </button>
      </div>

      {report && (
        <div style={{ marginTop: 8, border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
          <div><b>From:</b> {report.from}</div>
          <div><b>To:</b> {report.to}</div>
          <div><b>Loads Net:</b> ${Number(report.loads_net ?? 0).toFixed(2)}</div>
          <div><b>Standalone Expenses:</b> ${Number(report.standalone_expenses ?? 0).toFixed(2)}</div>
          <div><b>Weekly Net:</b> ${Number(report.weekly_net ?? 0).toFixed(2)}</div>
        </div>
      )}

      {/* Create Load */}
      <h2 style={{ marginTop: 24 }}>Create Load</h2>
      <form onSubmit={createLoad} style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <Input label="Pickup Date" value={form.pickup_date} onChange={(v) => setForm((s) => ({ ...s, pickup_date: v }))} />
        <Input label="Delivery Date" value={form.delivery_date} onChange={(v) => setForm((s) => ({ ...s, delivery_date: v }))} />
        <Input label="Origin" value={form.origin} onChange={(v) => setForm((s) => ({ ...s, origin: v }))} />
        <Input label="Destination" value={form.destination} onChange={(v) => setForm((s) => ({ ...s, destination: v }))} />
        <Input label="Miles" type="number" value={form.miles} onChange={(v) => setForm((s) => ({ ...s, miles: Number(v) }))} />
        <Input label="Gross Pay" type="number" value={form.gross_pay} onChange={(v) => setForm((s) => ({ ...s, gross_pay: Number(v) }))} />
        <Input label="Broker Fee" type="number" value={form.broker_fee} onChange={(v) => setForm((s) => ({ ...s, broker_fee: Number(v) }))} />
        <Input label="Fuel Cost" type="number" value={form.fuel_cost} onChange={(v) => setForm((s) => ({ ...s, fuel_cost: Number(v) }))} />
        <Input label="Tolls" type="number" value={form.tolls} onChange={(v) => setForm((s) => ({ ...s, tolls: Number(v) }))} />
        <Input label="Maintenance" type="number" value={form.maintenance_cost} onChange={(v) => setForm((s) => ({ ...s, maintenance_cost: Number(v) }))} />
        <Input label="Other Costs" type="number" value={form.other_costs} onChange={(v) => setForm((s) => ({ ...s, other_costs: Number(v) }))} />
        <Input label="Notes" value={form.notes} onChange={(v) => setForm((s) => ({ ...s, notes: v }))} />
        <div />
        <button type="submit" disabled={!authed} style={{ ...btnStyle, gridColumn: "span 3" }}>
          Create
        </button>
      </form>

      {/* Tables */}
      <h2 style={{ marginTop: 24 }}>Recent Loads</h2>
      <Table
        columns={["pickup_date", "origin", "destination", "miles", "gross_pay", "net_profit", "status"]}
        rows={Array.isArray(loads) ? loads : []}
        empty="No loads yet."
      />

      <h2 style={{ marginTop: 24 }}>Recent Expenses</h2>
      <Table
        columns={["expense_date", "category", "description", "amount"]}
        rows={Array.isArray(expenses) ? expenses : []}
        empty="No expenses yet."
      />
    </main>
  );
}

function KPICard({ label, value }) {
  return (
    <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const btnStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#f9fafb",
  cursor: "pointer",
};

function Input({ label, value, onChange, type = "text" }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
      />
    </label>
  );
}

function Table({ columns, rows, empty }) {
  if (!rows || rows.length === 0) return <div style={{ color: "#777" }}>{empty}</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 700, width: "100%" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={thStyle}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c} style={tdStyle}>{formatCell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: 8, borderBottom: "1px solid #eee", background: "#fafafa" };
const tdStyle = { padding: 8, borderBottom: "1px solid #f3f4f6" };

function formatCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number(v).toLocaleString();
  return String(v);
}

