export default function FactoryHealth({ machines = [] }) {
  const total = machines.length;
  const running = machines.filter((m) => m.status === "Running").length;
  const idle = machines.filter((m) => m.status === "Idle").length;
  const offline = machines.filter((m) => m.status === "Offline").length;
  const alert = machines.filter((m) => m.status === "Alert" || m.temperature > 65).length;

  const healthScore = total > 0
    ? Math.round(machines.reduce((sum, m) => sum + (m.healthScore ?? 0), 0) / total)
    : 0;

  const segments = [
    { label: "Running", count: running, color: "#22c55e" },
    { label: "Idle", count: idle, color: "#eab308" },
    { label: "Alert", count: alert, color: "#ef4444" },
    { label: "Offline", count: offline, color: "#6b7280" },
  ];

  const barSegments = segments.filter((s) => s.count > 0);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: "#f1f5f9" }}>Factory Health</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#eab308" : "#ef4444",
            }}
          >
            {healthScore}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>/ 100</div>
        </div>
      </div>

      {/* Health Bar */}
      <div style={{ height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden", marginBottom: 16, display: "flex" }}>
        {barSegments.map((seg, i) => (
          <div
            key={seg.label}
            style={{
              width: `${(seg.count / total) * 100}%`,
              background: seg.color,
              transition: "width 0.3s ease",
              borderRight: i < barSegments.length - 1 ? "2px solid #0a0a1a" : "none",
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color }} />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{seg.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{seg.count}</span>
          </div>
        ))}
      </div>

      {/* Individual Machine Health */}
      <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Machine Health</div>
        {machines.map((m) => {
          const score = m.healthScore ?? 0;
          const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 100, fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.name}
              </div>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${score}%`,
                    background: color,
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ width: 32, fontSize: 11, color, textAlign: "right" }}>{score}</div>
            </div>
          );
        })}
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
