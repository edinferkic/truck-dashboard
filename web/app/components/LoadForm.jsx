cat > ~/truck-dashboard/web/app/components/LoadForm.jsx <<'EOF'
import { useState } from "react";

const init = {
  pickup_date: "",
  delivery_date: "",
  origin: "",
  destination: "",
  miles: "",
  gross_pay: "",
  broker_fee: 0,
  fuel_cost: 0,
  tolls: 0,
  maintenance_cost: 0,
  other_costs: 0,
  notes: "",
  status: "completed"
};

export default function LoadForm({ onCreate }) {
  const [form, setForm] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm(s => ({ ...s, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const payload = {
        ...form,
        miles: Number(form.miles || 0),
        gross_pay: Number(form.gross_pay || 0),
        broker_fee: Number(form.broker_fee || 0),
        fuel_cost: Number(form.fuel_cost || 0),
        tolls: Number(form.tolls || 0),
        maintenance_cost: Number(form.maintenance_cost || 0),
        other_costs: Number(form.other_costs || 0)
      };
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
        required={["pickup_date","delivery_date","origin","destination","miles","gross_pay"].includes(k)}
      />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ display:"grid", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:12 }}>
        {field("Pickup Date","pickup_date","date")}
        {field("Delivery Date","delivery_date","date")}
        {field("Origin","origin")}
        {field("Destination","destination")}
        {field("Miles","miles","number")}
        {field("Gross Pay","gross_pay","number")}
        {field("Broker Fee","broker_fee","number")}
        {field("Fuel Cost","fuel_cost","number")}
        {field("Tolls","tolls","number")}
        {field("Maintenance","maintenance_cost","number")}
        {field("Other Costs","other_costs","number")}
        {field("Notes","notes")}
      </div>
      <div>
        <button disabled={busy} type="submit" style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #111827", background:"#111827", color:"#fff" }}>
          {busy ? "Saving..." : "Create Load"}
        </button>
        {err && <span style={{ color:"#b91c1c", marginLeft:12 }}>{err}</span>}
      </div>
    </form>
  );
}
EOF