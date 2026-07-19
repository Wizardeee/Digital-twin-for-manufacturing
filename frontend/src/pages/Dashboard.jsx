import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import KPICard from "../components/KPICard";
import AlertFeed from "../components/AlertFeed";
import TrendChart from "../components/TrendChart";
import FactoryHealth from "../components/FactoryHealth";
import ProductionOverview from "../components/ProductionOverview";
import { simulationAPI, factoryAPI } from "../services/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastSimTime, setLastSimTime] = useState(null);
  const [simFlash, setSimFlash] = useState(false);
  const [simCount, setSimCount] = useState(0);
  const factoryId = "demo";
  const intervalRef = useRef(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await factoryAPI.getDashboard(factoryId);
      setDashboard(data);
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const onMachinesChanged = () => fetchDashboard();
    window.addEventListener("machines-changed", onMachinesChanged);
    return () => window.removeEventListener("machines-changed", onMachinesChanged);
  }, [fetchDashboard]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchDashboard, 3000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchDashboard]);

  const runSimulation = useCallback(async () => {
    try {
      setSimulating(true);
      await simulationAPI.run(factoryId);
      await fetchDashboard();
      setLastSimTime(new Date());
      setSimCount((c) => c + 1);
      setSimFlash(true);
      setTimeout(() => setSimFlash(false), 800);
    } catch (err) {
      console.error("Simulation failed:", err);
      setError("Simulation failed: " + err.message);
    } finally {
      setSimulating(false);
    }
  }, [factoryId, fetchDashboard]);

  const machines = dashboard?.machines || [];
  const alerts = dashboard?.alerts || [];
  const products = dashboard?.products || [];

  const getMetric = (m, type) => parseFloat(m.readings?.find((r) => r.metric_type === type)?.value) || 0;

  const getField = (obj) => {
    if (!obj) return "—";
    if (typeof obj === "string" || typeof obj === "number") return obj;
    if (obj.value != null) return obj.value;
    return "—";
  };

  const efficiencyData = machines.map((m) => ({
    label: m.name,
    value: getMetric(m, "efficiency"),
  }));
  const temperatureData = machines.map((m) => ({
    label: m.name,
    value: getMetric(m, "temperature"),
  }));
  const powerData = machines.map((m) => ({
    label: m.name,
    value: getMetric(m, "power"),
  }));
  const utilizationData = machines.map((m) => ({
    label: m.name,
    value: getMetric(m, "utilization"),
  }));

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: "0 0 4px 0", fontSize: 24, fontWeight: 600, color: "#f1f5f9" }}>Factory Dashboard</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
            Real-time overview of your manufacturing floor
            {lastSimTime && (
              <span style={{ marginLeft: 12, color: "#6366f1" }}>
                Sim #{simCount} at {lastSimTime.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid",
              borderColor: autoRefresh ? "#22c55e" : "rgba(255,255,255,0.1)",
              background: autoRefresh ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.04)",
              color: autoRefresh ? "#4ade80" : "#94a3b8", fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: autoRefresh ? "#22c55e" : "#64748b", animation: autoRefresh ? "pulse 1.5s infinite" : "none" }} />
            {autoRefresh ? "Live" : "Auto-refresh"}
          </button>
          <button
            onClick={runSimulation}
            disabled={simulating}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid",
              borderColor: simFlash ? "#22c55e" : "rgba(99, 102, 241, 0.4)",
              background: simulating ? "rgba(99, 102, 241, 0.2)" : simFlash ? "rgba(34, 197, 94, 0.2)" : "rgba(99, 102, 241, 0.15)",
              color: simFlash ? "#4ade80" : "#a5b4fc", fontSize: 13, fontWeight: 500,
              cursor: simulating ? "not-allowed" : "pointer", transition: "all 0.3s ease",
            }}
          >
            {simulating ? "Simulating..." : simFlash ? "Done!" : "Run Simulation"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 14, padding: 40, textAlign: "center" }}>Loading dashboard data...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <KPICard label="OEE" value={`${dashboard?.avgEfficiency || 0}%`} icon="📈" />
            <KPICard label="Active Machines" value={dashboard?.activeMachines || 0} subtitle={`${dashboard?.totalMachines || 0} total`} icon="🏭" />
            <KPICard label="Active Alerts" value={dashboard?.alertCount || 0} icon="⚠️" />
            <KPICard label="Production Rate" value={`${Math.round((dashboard?.activeMachines || 0) / Math.max(dashboard?.totalMachines || 1, 1) * 100)}%`} icon="⚡" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 300 }}><FactoryHealth machines={machines} /></div>
            <div style={{ flex: 1, minWidth: 300 }}><ProductionOverview machines={machines} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            <TrendChart title="Efficiency" data={efficiencyData} color="#22c55e" />
            <TrendChart title="Temperature" data={temperatureData} color="#ef4444" />
            <TrendChart title="Power" data={powerData} color="#6366f1" />
            <TrendChart title="Utilization" data={utilizationData} color="#eab308" />
          </div>

          {products.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: "#f1f5f9" }}>Products</h3>
                <span style={{ fontSize: 12, color: "#64748b" }}>{products.length} products</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={thStyle}>Product ID</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Category</th>
                      <th style={thStyle}>Machines</th>
                      <th style={thStyle}>Capacity</th>
                      <th style={thStyle}>Lead Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={tdStyle}>{getField(p.productId)}</td>
                        <td style={tdStyle}>{getField(p.productName)}</td>
                        <td style={tdStyle}>{getField(p.category)}</td>
                        <td style={tdStyle}>{getField(p.machinesUsed)}</td>
                        <td style={tdStyle}>{getField(p.capacity)}</td>
                        <td style={tdStyle}>{getField(p.leadTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 300 }}><AlertFeed alerts={alerts} /></div>
            <div style={{ flex: 1, minWidth: 320 }}>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: "#f1f5f9" }}>Machines</h3>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {machines.filter((m) => m.status === "Running").length}/{machines.length} active
                  </span>
                </div>
                {machines.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>
                    No machines found. Upload machine data to get started.
                  </div>
                ) : (
                  machines.map((m) => {
                    const eff = getMetric(m, "efficiency");
                    const temp = getMetric(m, "temperature");
                    return (
                      <div key={m.id} onClick={() => navigate(`/machine/${m.id}`)} style={machineRowStyle}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{m.type?.toUpperCase()} {m.manufacturer ? `· ${m.manufacturer}` : ""}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div style={{ fontSize: 13, color: temp > 65 ? "#ef4444" : "#94a3b8" }}>{Math.round(temp)}°C</div>
                          <div style={{ fontSize: 13, color: eff < 75 ? "#eab308" : "#22c55e" }}>{Math.round(eff)}%</div>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: m.status === "Running" ? "#22c55e" : m.status === "Idle" ? "#eab308" : "#6b7280", boxShadow: m.status === "Running" ? "0 0 6px #22c55e" : "none" }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

const containerStyle = { minHeight: "100vh", background: "#0a0a1a", color: "#e2e8f0", padding: "56px 24px 24px", fontFamily: "'Inter', 'Segoe UI', sans-serif" };
const cardStyle = { background: "rgba(15, 15, 35, 0.8)", borderRadius: 12, padding: 20, border: "1px solid rgba(255,255,255,0.08)" };
const machineRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" };
const thStyle = { textAlign: "left", padding: "8px 12px", color: "#94a3b8", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 };
const tdStyle = { padding: "8px 12px", color: "#e2e8f0" };
