cat > ~/truck-dashboard/web/app/components/KPICard.jsx <<'EOF'
export default function KPICard({ label, value }) {
  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 16,
      flex: "1 1 0",
      boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
    }}>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}
EOF