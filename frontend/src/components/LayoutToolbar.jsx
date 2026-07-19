export default function LayoutToolbar({
  layoutStatus,
  onPropose,
  onConfirm,
  onReset,
  selectedMachine,
  collisionCount,
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(15, 15, 35, 0.95)",
        borderRadius: 12,
        padding: "10px 16px",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(10px)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#94a3b8",
          padding: "0 8px",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          marginRight: 4,
        }}
      >
        Layout Editor
      </div>

      <StatusBadge status={layoutStatus} />

      {collisionCount > 0 && (
        <div
          style={{
            fontSize: 12,
            color: "#ef4444",
            background: "rgba(239, 68, 68, 0.15)",
            padding: "4px 10px",
            borderRadius: 6,
          }}
        >
          {collisionCount} collision{collisionCount > 1 ? "s" : ""}
        </div>
      )}

      {selectedMachine && (
        <div
          style={{
            fontSize: 12,
            color: "#60a5fa",
            background: "rgba(96, 165, 250, 0.15)",
            padding: "4px 10px",
            borderRadius: 6,
            maxWidth: 150,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedMachine.name}
        </div>
      )}

      <ToolbarButton
        label="Propose Layout"
        onClick={onPropose}
        disabled={layoutStatus === "confirmed"}
        color="#6366f1"
      />

      <ToolbarButton
        label="Reset"
        onClick={onReset}
        disabled={layoutStatus === "confirmed"}
        color="#64748b"
      />

      <ToolbarButton
        label="Confirm"
        onClick={onConfirm}
        disabled={layoutStatus !== "proposed" || collisionCount > 0}
        color="#22c55e"
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    none: { label: "No Layout", color: "#64748b" },
    proposed: { label: "Proposed", color: "#eab308" },
    confirmed: { label: "Confirmed", color: "#22c55e" },
  };

  const { label, color } = config[status] || config.none;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color,
        padding: "4px 10px",
        borderRadius: 6,
        background: `${color}20`,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      {label}
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, color }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "rgba(255,255,255,0.05)" : `${color}30`,
        border: `1px solid ${disabled ? "rgba(255,255,255,0.08)" : `${color}50`}`,
        borderRadius: 8,
        padding: "6px 14px",
        color: disabled ? "#475569" : color,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
