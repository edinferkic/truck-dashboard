cat > ~/truck-dashboard/web/app/components/LoadsTable.jsx <<'EOF'
export default function LoadsTable({ items = [], onDelete }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f9fafb" }}>
            {["Pickup","Delivery","Route","Miles","Gross","Broker","Fuel","Tolls","Maint","Other","Net","Status",""].map(h=>(
              <th key={h} style={{ textAlign:"left", padding:8, borderBottom:"1px solid #e5e7eb", fontSize:12, color:"#6b7280" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(r=>(
            <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
              <td style={{ padding:8 }}>{r.pickup_date}</td>
              <td style={{ padding:8 }}>{r.delivery_date}</td>
              <td style={{ padding:8 }}>{r.origin} → {r.destination}</td>
              <td style={{ padding:8 }}>{r.miles}</td>
              <td style={{ padding:8 }}>${Number(r.gross_pay).toFixed(2)}</td>
              <td style={{ padding:8 }}>${Number(r.broker_fee).toFixed(2)}</td>
              <td style={{ padding:8 }}>${Number(r.fuel_cost).toFixed(2)}</td>
              <td style={{ padding:8 }}>${Number(r.tolls).toFixed(2)}</td>
              <td style={{ padding:8 }}>${Number(r.maintenance_cost).toFixed(2)}</td>
              <td style={{ padding:8 }}>${Number(r.other_costs).toFixed(2)}</td>
              <td style={{ padding:8, fontWeight:600 }}>${Number(r.net_profit).toFixed(2)}</td>
              <td style={{ padding:8 }}>{r.status}</td>
              <td style={{ padding:8 }}>
                <button onClick={()=>onDelete(r.id)} style={{ border:"1px solid #ef4444", color:"#ef4444", background:"transparent", borderRadius:6, padding:"4px 8px" }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {items.length===0 && (
            <tr><td colSpan={13} style={{ padding:12, color:"#6b7280" }}>No loads yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
EOF