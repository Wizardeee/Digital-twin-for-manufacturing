export default function KPICard({ label, value, change, icon }) {
  const isPositive = change > 0;
  const changeColor = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        background: "rgba(15, 15, 35, 0.8)",
        borderRadius: 12,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.08)",
        flex: 1,
        minWidth: 200,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9" }}>{value}</div>
      {change !== undefined && (
        <div style={{ fontSize: 12, color: changeColor, marginTop: 4 }}>
          {isPositive ? "+" : ""}{change}% from yesterday
        </div>
      )}
    </div>
  );
}
