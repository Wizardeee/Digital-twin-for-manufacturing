import { useState, useEffect } from "react";
import Sparkline from "./Sparkline";

const STATUS_COLORS = {
  Running: "#22c55e",
  Idle: "#eab308",
  Alert: "#ef4444",
  Offline: "#6b7280",
};

const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "5px 8px",
  color: "#e2e8f0",
  fontSize: 12,
  width: "100%",
  outline: "none",
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
};

const labelStyle = {
  fontSize: 11,
  color: "#64748b",
  marginBottom: 3,
  display: "block",
};

export default function MachinePanel({ machine, onClose, onUpdateDimensions, onUpdateSpecs, onDelete }) {
  const [localFootprint, setLocalFootprint] = useState(null);
  const [powerRating, setPowerRating] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [machineType, setMachineType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (machine?.footprint) {
      setLocalFootprint({ ...machine.footprint });
    }
    setPowerRating(machine?.powerDrawRating != null ? String(machine.powerDrawRating) : "");
    setInstallDate(machine?.installDate || "");
    setMachineType(machine?.type || "");
    setManufacturer(machine?.manufacturer || "");
  }, [machine?.id]);

  const handleDimensionChange = (key, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0.1) return;
    const updated = { ...localFootprint, [key]: num };
    setLocalFootprint(updated);
    if (onUpdateDimensions) onUpdateDimensions(updated);
  };

  const handleSpecSave = () => {
    if (onUpdateSpecs) {
      onUpdateSpecs(machine.id, {
        power_draw_rating: powerRating ? parseFloat(powerRating) : null,
        install_date: installDate || null,
        type: machineType || null,
        manufacturer: manufacturer || null,
      });
    }
  };

  if (!machine) {
    return (
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 320,
          background: "rgba(15, 15, 35, 0.95)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(10px)",
          textAlign: "center",
          color: "#64748b",
          fontSize: 13,
        }}
      >
        Click a machine to view details
      </div>
    );
  }

  const color = STATUS_COLORS[machine.status] || "#f97316";
  const hasRealPower = machine.powerDrawRating != null;
  const sourceLabel = hasRealPower ? "Calculated from specs" : "Estimated (no specs provided)";

  const tempSparkline = generateSparklineData(machine.temperature, 10, 5);
  const effSparkline = generateSparklineData(machine.efficiency, 10, 3);
  const powerSparkline = generateSparklineData(machine.power, 10, 0.3);

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        width: 340,
        background: "rgba(15, 15, 35, 0.95)",
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: "#e2e8f0",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(10px)",
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{machine.name}</h2>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {machine.type?.toUpperCase()} {machine.manufacturer ? `· ${machine.manufacturer}` : ""}
          </div>
          <div style={{ fontSize: 10, color: "#6366f1", marginTop: 2 }}>{sourceLabel}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={machine.status} color={color} />
          {onDelete && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => { onDelete(machine); setConfirmDelete(false); }}
                  style={{
                    padding: "3px 8px", borderRadius: 6,
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.15)",
                    color: "#fca5a5", fontSize: 10, cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: "3px 8px", borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    color: "#94a3b8", fontSize: 10, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.2)",
                  background: "transparent",
                  color: "#ef4444",
                  fontSize: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Delete machine"
              >
                🗑
              </button>
            )
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                width: 24, height: 24, borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Key Metrics with Sparklines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <MetricRow
          label="Temperature"
          value={`${machine.temperature ?? "--"}°C`}
          sparkline={tempSparkline}
          color="#ef4444"
          warning={machine.temperature > 65}
          critical={machine.temperature > 80}
        />
        <MetricRow
          label="Efficiency"
          value={`${machine.efficiency ?? "--"}%`}
          sparkline={effSparkline}
          color="#22c55e"
          warning={machine.efficiency < 75}
          critical={machine.efficiency < 60}
        />
        <MetricRow
          label="Power Draw"
          value={`${machine.power ?? "--"} kW`}
          sparkline={powerSparkline}
          color="#6366f1"
        />
      </div>

      {/* Health Score */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Health Score</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: getHealthColor(machine.healthScore) }}>
            {machine.healthScore ?? "--"}%
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${machine.healthScore ?? 0}%`,
              background: getHealthColor(machine.healthScore),
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <StatCard label="Utilization" value={`${machine.utilization ?? "--"}%`} />
        <StatCard label="Runtime" value={formatRuntime(machine.runtime)} />
      </div>

      {/* Machine Specs — editable */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Machine Specifications</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <input
              style={inputStyle}
              value={machineType}
              onChange={(e) => setMachineType(e.target.value)}
              placeholder="e.g. robot, cnc, conveyor"
            />
          </div>
          <div>
            <label style={labelStyle}>Manufacturer</label>
            <input
              style={inputStyle}
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. KUKA, FANUC, Siemens"
            />
          </div>
          <div>
            <label style={labelStyle}>Power Rating (kW)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="0.1"
              value={powerRating}
              onChange={(e) => setPowerRating(e.target.value)}
              placeholder="e.g. 3.5"
            />
            <div style={{ fontSize: 10, color: "#6366f1", marginTop: 2 }}>
              {hasRealPower ? "Using rated power for calculations" : "Not set — using estimated defaults"}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Install Date</label>
            <input
              style={inputStyle}
              type="date"
              value={installDate}
              onChange={(e) => setInstallDate(e.target.value)}
            />
            <div style={{ fontSize: 10, color: installDate ? "#22c55e" : "#64748b", marginTop: 2 }}>
              {installDate ? `Age-based degradation active` : "Not set — no age factor applied"}
            </div>
          </div>
          <button
            onClick={handleSpecSave}
            style={{
              background: "#6366f1",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            Save Specs
          </button>
        </div>
      </div>

      {/* Dimensions */}
      {localFootprint && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Dimensions (m)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DimensionSlider
              label="Length"
              value={localFootprint.length}
              onChange={(v) => handleDimensionChange("length", v)}
              min={0.1}
              max={10}
              step={0.05}
            />
            <DimensionSlider
              label="Width"
              value={localFootprint.width}
              onChange={(v) => handleDimensionChange("width", v)}
              min={0.1}
              max={10}
              step={0.05}
            />
            <DimensionSlider
              label="Height"
              value={localFootprint.height}
              onChange={(v) => handleDimensionChange("height", v)}
              min={0.1}
              max={10}
              step={0.05}
            />
          </div>
        </div>
      )}

      {/* Alerts */}
      {machine.alerts && machine.alerts.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 500, marginBottom: 8 }}>
            Active Alerts ({machine.alerts.length})
          </div>
          {machine.alerts.slice(0, 3).map((alert, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "#fca5a5",
                padding: "6px 8px",
                background: "rgba(239, 68, 68, 0.1)",
                borderRadius: 6,
                marginBottom: 4,
              }}
            >
              {alert.message || alert.type}
            </div>
          ))}
        </div>
      )}

      {/* AI Recommendation */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>AI Analysis</div>
        <div
          style={{
            fontSize: 12,
            color: "#cbd5e1",
            lineHeight: 1.5,
            background: "rgba(99, 102, 241, 0.08)",
            padding: "10px 12px",
            borderRadius: 8,
            borderLeft: "3px solid #6366f1",
          }}
        >
          {generateAIInsight(machine)}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        color,
        padding: "4px 10px",
        borderRadius: 6,
        background: `${color}20`,
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      {status}
    </div>
  );
}

function MetricRow({ label, value, sparkline, color, warning, critical }) {
  const bgColor = critical
    ? "rgba(239, 68, 68, 0.12)"
    : warning
    ? "rgba(234, 179, 8, 0.1)"
    : "rgba(255,255,255,0.04)";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        background: bgColor,
        borderRadius: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: critical ? "#ef4444" : warning ? "#eab308" : "#e2e8f0" }}>
          {value}
        </div>
      </div>
      <Sparkline data={sparkline} color={color} width={70} height={24} />
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function DimensionSlider({ label, value, onChange, min, max, step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 50, fontSize: 11, color: "#94a3b8" }}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          height: 4,
          appearance: "none",
          background: "rgba(99, 102, 241, 0.3)",
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 52,
          fontSize: 11,
          color: "#e2e8f0",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          padding: "3px 4px",
          textAlign: "right",
          outline: "none",
        }}
      />
    </div>
  );
}

function getHealthColor(score) {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

function formatRuntime(minutes) {
  if (!minutes) return "--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function generateSparklineData(currentValue, points, variance) {
  if (currentValue === null || currentValue === undefined) return [];
  const data = [];
  for (let i = 0; i < points; i++) {
    const noise = (Math.random() - 0.5) * variance * 2;
    data.push(Math.max(0, currentValue + noise));
  }
  return data;
}

function generateAIInsight(machine) {
  const insights = [];

  if (!machine.powerDrawRating) {
    insights.push("No power rating specified — values are estimated. Enter specs for accurate calculations.");
  }
  if (!machine.installDate) {
    insights.push("No install date set — age-based degradation not applied.");
  }

  if (machine.temperature > 65) {
    insights.push(`Running ${Math.round(machine.temperature - 45)}°C above optimal. Check cooling system.`);
  }
  if (machine.efficiency < 80) {
    insights.push(`Efficiency at ${machine.efficiency}%, below target. Review operating parameters.`);
  }
  if (machine.healthScore < 70) {
    insights.push(`Health score declining. Consider scheduling maintenance.`);
  }
  if (machine.utilization < 50) {
    insights.push(`Low utilization at ${machine.utilization}%. Machine may be underutilized.`);
  }

  if (insights.length === 0) {
    return "All metrics within normal ranges. Machine operating optimally.";
  }

  return insights.join(" ");
}
