cat > ~/truck-dashboard/web/app/components/ExpenseForm.jsx <<'EOF'
import { useState } from "react";

const init = {
  expense_date: "",
  category: "",
  description: "",
  amount: ""
};

export default function ExpenseForm({ onCreate }) {
  const [form, setForm] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm(s => ({ ...s, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const payload = { ...form, amount: Number(form.amount || 0) };
      await onCreate(payload);
      setForm(init);
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  }

  const field = (label, k, type="text") => (
    <label style={{ display:"grid", gap:4 }}>
      <span style={{ fontSize:12, color:"#374151" }}>{label}</span>
      <input
        type={type}
        value={form[k]}
        onChange={e=>set(k, e.target.value)}
        style={{ padding:8, border:"1px solid #e5e7eb", borderRadius:8 }}
        required={["expense_date","category","amount"].includes(k)}
      />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ display:"grid", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:12 }}>
        {field("Expense Date","expense_date","date")}
        {field("Category","category")}
        {field("Description","description")}
        {field("Amount","amount","number")}
      </div>
      <div>
        <button disabled={busy} type="submit" style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #111827", background:"#111827", color:"#fff" }}>
          {busy ? "Saving..." : "Create Expense"}
        </button>
        {err && <span style={{ color:"#b91c1c", marginLeft:12 }}>{err}</span>}
      </div>
    </form>
  );
}
EOF