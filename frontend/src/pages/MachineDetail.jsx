import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { machinesAPI } from "../services/api";
import Sparkline from "../components/Sparkline";

export default function MachineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [machine, setMachine] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("24h");
  const mountedRef = useRef(false);

  const factoryId = "demo";

  const fetchMachine = useCallback(async () => {
    try {
      const data = await machinesAPI.getById(factoryId, id);
      setMachine(data);
    } catch (err) {
      console.error("Failed to fetch machine:", err);
    } finally {
      setLoading(false);
    }
  }, [id, factoryId]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await machinesAPI.getHistory(factoryId, id, { period });
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, [id, factoryId, period]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      async function load() {
        await fetchMachine();
        await fetchHistory();
      }
      load();
    }
  }, [fetchMachine, fetchHistory]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: "#64748b", fontSize: 14 }}>Loading machine data...</div>
      </div>
    );
  }

  if (!machine) {
    return (
      <div style={containerStyle}>
        <div style={{ color: "#64748b", fontSize: 14 }}>Machine not found</div>
        <button onClick={() => navigate("/")} style={backButtonStyle}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const readingsByMetric = {};
  if (history?.readings) {
    for (const reading of history.readings) {
      if (!readingsByMetric[reading.metric_type]) {
        readingsByMetric[reading.metric_type] = [];
      }
      readingsByMetric[reading.metric_type].push(parseFloat(reading.avg_value));
    }
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <button onClick={() => navigate("/")} style={backButtonStyle}>
            ← Dashboard
          </button>
          <h1 style={{ margin: "8px 0 4px 0", fontSize: 24, fontWeight: 600, color: "#f1f5f9" }}>
            {machine.name}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
            {machine.type?.toUpperCase()} · {machine.manufacturer}
          </p>
        </div>
        <StatusBadge status={machine.status} />
      </div>

      {/* Period Selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["1h", "6h", "24h", "7d", "30d"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: period === p ? "#6366f1" : "rgba(255,255,255,0.1)",
              background: period === p ? "rgba(99, 102, 241, 0.2)" : "rgba(255,255,255,0.04)",
              color: period === p ? "#a5b4fc" : "#94a3b8",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Metrics Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
        <MetricChart
          title="Temperature"
          data={readingsByMetric.temperature}
          unit="°C"
          color="#ef4444"
          warning={65}
          critical={80}
        />
        <MetricChart
          title="Efficiency"
          data={readingsByMetric.efficiency}
          unit="%"
          color="#22c55e"
          warning={75}
          critical={60}
          invertWarning
        />
        <MetricChart
          title="Power Consumption"
          data={readingsByMetric.power}
          unit=" kW"
          color="#6366f1"
        />
        <MetricChart
          title="Utilization"
          data={readingsByMetric.utilization}
          unit="%"
          color="#eab308"
          warning={50}
          critical={30}
          invertWarning
        />
      </div>

      {/* Alerts & Maintenance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Active Alerts</h3>
          {history?.alerts?.length > 0 ? (
            history.alerts.map((alert, i) => (
              <div key={i} style={alertRowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: alert.severity === "critical" ? "#ef4444" : "#eab308",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0" }}>{alert.message || alert.type}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {new Date(alert.triggered_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "#64748b", fontSize: 13, padding: 12 }}>No active alerts</div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Maintenance History</h3>
          {history?.maintenance?.length > 0 ? (
            history.maintenance.map((event, i) => (
              <div key={i} style={alertRowStyle}>
                <div style={{ fontSize: 13, color: "#e2e8f0" }}>{event.type}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {event.scheduled_date
                    ? `Scheduled: ${new Date(event.scheduled_date).toLocaleDateString()}`
                    : "No date set"}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "#64748b", fontSize: 13, padding: 12 }}>No maintenance events</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricChart({ title, data = [], unit, color, warning, critical, invertWarning }) {
  const currentValue = data.length > 0 ? data[data.length - 1] : null;
  const avgValue = data.length > 0 ? (data.reduce((a, b) => a + b, 0) / data.length).toFixed(1) : null;

  const hasWarning = warning && currentValue !== null
    ? invertWarning
      ? currentValue < warning
      : currentValue > warning
    : false;

  const hasCritical = critical && currentValue !== null
    ? invertWarning
      ? currentValue < critical
      : currentValue > critical
    : false;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>{title}</h3>
        {currentValue !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: hasCritical ? "#ef4444" : hasWarning ? "#eab308" : color,
            }}
          >
            {currentValue}{unit}
          </span>
        )}
      </div>
      <Sparkline
        data={data}
        color={hasCritical ? "#ef4444" : hasWarning ? "#eab308" : color}
        width={280}
        height={60}
      />
      {avgValue !== null && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
          Avg: {avgValue}{unit} · Samples: {data.length}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    Running: "#22c55e",
    Idle: "#eab308",
    Alert: "#ef4444",
    Offline: "#6b7280",
  };
  const color = colors[status] || "#64748b";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color,
        padding: "6px 14px",
        borderRadius: 8,
        background: `${color}20`,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {status}
    </div>
  );
}

const containerStyle = {
  minHeight: "100vh",
  background: "#0a0a1a",
  color: "#e2e8f0",
  padding: 32,
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  maxWidth: 1000,
};

const cardStyle = {
  background: "rgba(15, 15, 35, 0.8)",
  borderRadius: 12,
  padding: 20,
  border: "1px solid rgba(255,255,255,0.08)",
};

const cardTitleStyle = {
  margin: "0 0 12px 0",
  fontSize: 14,
  fontWeight: 500,
  color: "#94a3b8",
};

const alertRowStyle = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const backButtonStyle = {
  background: "none",
  border: "none",
  color: "#6366f1",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};
