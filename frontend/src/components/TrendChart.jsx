export default function TrendChart({ title, data = [], color = "#6366f1" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const height = 60;
  const points = data
    .map((d, i) => `${(i / (data.length - 1 || 1)) * width},${height - (d.value / max) * height}`)
    .join(" ");

  return (
    <div
      style={{
        background: "rgba(15, 15, 35, 0.8)",
        borderRadius: 12,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.08)",
        flex: 1,
        minWidth: 250,
      }}
    >
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 80 }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />
      </svg>
    </div>
  );
}
