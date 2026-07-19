import { useState, useEffect } from "react";
import { factoryAPI } from "../services/api";

const FACTORY_ID = "demo";

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#e2e8f0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
};

const labelStyle = {
  fontSize: 13,
  color: "#94a3b8",
  marginBottom: 4,
  display: "block",
};

const cardStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const btnStyle = {
  background: "#6366f1",
  border: "none",
  borderRadius: 8,
  padding: "8px 20px",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
};

export default function Settings() {
  const [factory, setFactory] = useState(null);
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [factoryName, setFactoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    factoryAPI.getById(FACTORY_ID).then((f) => {
      setFactory(f);
      setWidth(String(f.width_meters || 20));
      setDepth(String(f.depth_meters || 15));
      setFactoryName(f.name || "");
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const w = parseFloat(width) || 20;
      const d = parseFloat(depth) || 15;
      const updated = await factoryAPI.update(FACTORY_ID, {
        widthMeters: w,
        depthMeters: d,
        name: factoryName || undefined,
      });
      setFactory(updated);
      setWidth(String(updated.width_meters || w));
      setDepth(String(updated.depth_meters || d));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save factory settings:", err);
    }
    setSaving(false);
  };

  const w = parseFloat(width) || 20;
  const d = parseFloat(depth) || 15;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a1a",
        color: "#e2e8f0",
        padding: "56px 40px 40px",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        maxWidth: 600,
      }}
    >
      <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600, color: "#f1f5f9" }}>
        Settings
      </h1>
      <p style={{ margin: "0 0 32px 0", fontSize: 14, color: "#64748b" }}>
        Configure your factory dimensions and layout parameters
      </p>

      {/* Factory Name */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 500, color: "#e2e8f0" }}>
          Factory Info
        </h3>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Factory Name</label>
          <input
            style={inputStyle}
            value={factoryName}
            onChange={(e) => setFactoryName(e.target.value)}
            placeholder="e.g. Main Production Hall"
          />
        </div>
      </div>

      {/* Factory Dimensions */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px 0", fontSize: 16, fontWeight: 500, color: "#e2e8f0" }}>
          Factory Dimensions
        </h3>
        <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#64748b" }}>
          Defines the real-world floor size for accurate simulation
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Width (meters)</label>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="0.5"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Depth (meters)</label>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="0.5"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            />
          </div>
        </div>
        <div style={{
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.15)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#818cf8",
          marginBottom: 8,
        }}>
          Floor area: {w}m &times; {d}m = {(w * d).toFixed(1)} m&sup2;
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          style={{ ...btnStyle, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: "#22c55e" }}>Saved</span>
        )}
      </div>
    </div>
  );
}
