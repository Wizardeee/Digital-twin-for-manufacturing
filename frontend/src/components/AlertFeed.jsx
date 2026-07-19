export default function AlertFeed({ alerts = [] }) {
  const severityColor = {
    critical: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
  };

  return (
    <div
      style={{
        background: "rgba(15, 15, 35, 0.8)",
        borderRadius: 12,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: "#f1f5f9" }}>Alerts</h3>
      {alerts.length === 0 && (
        <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>
          No alerts
        </div>
      )}
      {alerts.map((alert, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: i < alerts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: severityColor[alert.severity] || "#64748b",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#e2e8f0" }}>{alert.message}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {alert.machine_name || alert.machine || "Unknown"} · {alert.triggered_at || alert.time || ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
