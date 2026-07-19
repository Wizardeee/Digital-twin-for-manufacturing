export default function Sparkline({ data = [], color = "#6366f1", width = 80, height = 30 }) {
  if (data.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#475569",
        }}
      >
        No data
      </div>
    );
  }

  const values = data.map((d) => (typeof d === "number" ? d : d.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const lastValue = values[values.length - 1];
  const trend = values.length > 1 ? lastValue - values[values.length - 2] : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle
          cx={(values.length - 1) / (values.length - 1) * width}
          cy={height - ((lastValue - min) / range) * (height - 4) - 2}
          r="2.5"
          fill={color}
        />
      </svg>
      <span
        style={{
          fontSize: 10,
          color: trend > 0 ? "#22c55e" : trend < 0 ? "#ef4444" : "#64748b",
        }}
      >
        {trend > 0 ? "+" : ""}{trend.toFixed(1)}
      </span>
    </div>
  );
}
