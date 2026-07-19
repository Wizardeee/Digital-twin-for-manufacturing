export default function ProductionOverview({ machines = [] }) {
  const getMetric = (m, type) => {
    const reading = m.readings?.find((r) => r.metric_type === type);
    return reading ? parseFloat(reading.value) || 0 : (m[type] || 0);
  };
  const totalPower = machines.reduce((sum, m) => sum + getMetric(m, "power"), 0);
  const avgEfficiency = machines.length > 0
    ? Math.round(machines.reduce((sum, m) => sum + getMetric(m, "efficiency"), 0) / machines.length)
    : 0;
  const avgTemp = machines.length > 0
    ? Math.round(machines.reduce((sum, m) => sum + getMetric(m, "temperature"), 0) / machines.length)
    : 0;
  const avgUtilization = machines.length > 0
    ? Math.round(machines.reduce((sum, m) => sum + getMetric(m, "utilization"), 0) / machines.length)
    : 0;

  // Simulated production metrics
  const productionCount = Math.round(avgUtilization * 12.5);
  const targetCount = 1500;
  const productionRate = Math.round((productionCount / targetCount) * 100);

  const metrics = [
    { label: "Total Power", value: `${totalPower.toFixed(1)} kW`, color: "#6366f1", icon: "⚡" },
    { label: "Avg Efficiency", value: `${avgEfficiency}%`, color: "#22c55e", icon: "📈" },
    { label: "Avg Temperature", value: `${avgTemp}°C`, color: "#ef4444", icon: "🌡️" },
    { label: "Avg Utilization", value: `${avgUtilization}%`, color: "#eab308", icon: "📊" },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: "#f1f5f9" }}>Production Overview</h3>

      {/* Production Progress */}
      <div style={{ marginBottom: 20, padding: 16, background: "rgba(99, 102, 241, 0.08)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Daily Production</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#a5b4fc" }}>
            {productionCount.toLocaleString()} / {targetCount.toLocaleString()}
          </span>
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(productionRate, 100)}%`,
              background: productionRate >= 80 ? "#22c55e" : productionRate >= 50 ? "#eab308" : "#ef4444",
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
          {productionRate}% of target
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              padding: "12px 14px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>{m.label}</span>
              <span style={{ fontSize: 14 }}>{m.icon}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Process Flow Indicator */}
      <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Process Flow</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {machines.map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: m.status === "Running" ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${m.status === "Running" ? "rgba(34, 197, 94, 0.3)" : "rgba(255,255,255,0.08)"}`,
                  fontSize: 11,
                  color: m.status === "Running" ? "#4ade80" : "#94a3b8",
                }}
              >
                {m.name}
              </div>
              {i < machines.length - 1 && (
                <div style={{ color: "#475569", margin: "0 4px", fontSize: 12 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: "rgba(15, 15, 35, 0.8)",
  borderRadius: 12,
  padding: 20,
  border: "1px solid rgba(255,255,255,0.08)",
};
