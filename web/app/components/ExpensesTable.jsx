cat > ~/truck-dashboard/web/app/components/ExpensesTable.jsx <<'EOF'
export default function ExpensesTable({ items = [], onDelete }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f9fafb" }}>
            {["Date","Category","Description","Amount",""].map(h=>(
              <th key={h} style={{ textAlign:"left", padding:8, borderBottom:"1px solid #e5e7eb", fontSize:12, color:"#6b7280" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(r=>(
            <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
              <td style={{ padding:8 }}>{r.expense_date}</td>
              <td style={{ padding:8 }}>{r.category}</td>
              <td style={{ padding:8 }}>{r.description}</td>
              <td style={{ padding:8, fontWeight:600 }}>${Number(r.amount).toFixed(2)}</td>
              <td style={{ padding:8 }}>
                <button onClick={()=>onDelete(r.id)} style={{ border:"1px solid #ef4444", color:"#ef4444", background:"transparent", borderRadius:6, padding:"4px 8px" }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {items.length===0 && (
            <tr><td colSpan={5} style={{ padding:12, color:"#6b7280" }}>No expenses yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
EOF
