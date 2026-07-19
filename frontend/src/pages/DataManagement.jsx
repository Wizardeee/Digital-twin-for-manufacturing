import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { machinesAPI, uploadAPI } from "../services/api";

const FACTORY_ID = "demo";

const FILE_TYPE_TAGS = {
  glb: { label: "3D Model", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)" },
  spec_sheet: { label: "Spec Sheet", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)" },
  floor_plan: { label: "Floor Plan", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)" },
  product_data: { label: "Product Data", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
  unknown: { label: "Other", color: "#6b7280", bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.3)" },
};

const STATUS_COLORS = {
  completed: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  processing: { bg: "rgba(234,179,8,0.15)", text: "#facc15", border: "rgba(234,179,8,0.3)" },
  failed: { bg: "rgba(239,68,68,0.15)", text: "#f87171", border: "rgba(239,68,68,0.3)" },
  pending: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" },
};

export default function DataManagement() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeTab, setActiveTab] = useState("files");
  const [fileFilter, setFileFilter] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [machinesData, filesData] = await Promise.all([
        machinesAPI.getAll(FACTORY_ID),
        uploadAPI.getFiles(FACTORY_ID),
      ]);
      setMachines(machinesData);
      setFiles(filesData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteMachine = async (machine) => {
    try {
      setDeletingId(machine.id);
      await machinesAPI.delete(FACTORY_ID, machine.id);
      setConfirmDelete(null);
      await fetchData();
      window.dispatchEvent(new CustomEvent("machines-changed"));
    } catch (err) {
      setError(`Failed to delete ${machine.name}: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteFile = async (file) => {
    try {
      setDeletingId(file.id);
      await uploadAPI.deleteFile(FACTORY_ID, file.id);
      setConfirmDelete(null);
      await fetchData();
      window.dispatchEvent(new CustomEvent("data-changed"));
      window.dispatchEvent(new CustomEvent("machines-changed"));
    } catch (err) {
      setError(`Failed to delete ${file.original_name}: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredFiles = fileFilter === "all"
    ? files
    : files.filter((f) => f.file_type === fileFilter);

  const fileTypeCounts = files.reduce((acc, f) => {
    acc[f.file_type] = (acc[f.file_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ padding: "56px 32px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#f1f5f9" }}>
            Data Management
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>
            View and manage uploaded files and machines
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            color: "#94a3b8",
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: 12, borderRadius: 8,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#fca5a5", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Total Files" value={files.length} color="#6366f1" />
        <SummaryCard label="3D Models" value={files.filter((f) => f.file_type === "glb").length} color="#8b5cf6" />
        <SummaryCard label="Spec Sheets" value={files.filter((f) => f.file_type === "spec_sheet").length} color="#3b82f6" />
        <SummaryCard label="Floor Plans" value={files.filter((f) => f.file_type === "floor_plan").length} color="#f59e0b" />
        <SummaryCard label="Machines" value={machines.length} color="#22c55e" />
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {[
          { id: "files", label: `Uploaded Files (${files.length})` },
          { id: "machines", label: `Machines (${machines.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === tab.id ? "#e2e8f0" : "#64748b",
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Files tab */}
      {activeTab === "files" && (
        <>
          {/* File type filter tags */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <FilterTag
              label="All"
              count={files.length}
              active={fileFilter === "all"}
              onClick={() => setFileFilter("all")}
              color="#94a3b8"
            />
            {Object.entries(FILE_TYPE_TAGS).map(([type, tag]) => (
              fileTypeCounts[type] > 0 && (
                <FilterTag
                  key={type}
                  label={tag.label}
                  count={fileTypeCounts[type]}
                  active={fileFilter === type}
                  onClick={() => setFileFilter(type)}
                  color={tag.color}
                />
              )
            ))}
          </div>

          <div style={{
            background: "rgba(15,15,35,0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={thStyle}>File Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Linked Machine</th>
                  <th style={thStyle}>Extraction</th>
                  <th style={thStyle}>Uploaded</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 14 }}>
                      {files.length === 0
                        ? "No files uploaded yet. Go to Upload page to get started."
                        : "No files match the selected filter."}
                    </td>
                  </tr>
                )}
                {filteredFiles.map((file) => {
                  const typeTag = FILE_TYPE_TAGS[file.file_type] || FILE_TYPE_TAGS.unknown;
                  const statusStyle = STATUS_COLORS[file.extraction_status] || STATUS_COLORS.pending;
                  const extraction = file.extraction_result;
                  const extractedFields = extraction?.fields
                    ? Object.keys(extraction.fields).length
                    : 0;

                  return (
                    <tr key={file.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={tdStyle}>
                        <div style={{ color: "#e2e8f0", fontWeight: 500, fontSize: 13, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.original_name}
                        </div>
                        <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>
                          {file.mime_type || "—"}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: typeTag.bg, color: typeTag.color, border: `1px solid ${typeTag.border}`,
                        }}>
                          {typeTag.label}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                          background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}`,
                        }}>
                          {file.extraction_status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {file.machine_name ? (
                          <span
                            onClick={() => navigate(`/machine/${file.linked_machine_id}`)}
                            style={{ color: "#60a5fa", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                          >
                            {file.machine_name}
                          </span>
                        ) : (
                          <span style={{ color: "#475569", fontSize: 13 }}>Unlinked</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>
                          {extraction?.error
                            ? <span style={{ color: "#f87171" }}>Error</span>
                            : extractedFields > 0
                              ? `${extractedFields} fields`
                              : "—"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {new Date(file.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {confirmDelete === file.id ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => handleDeleteFile(file)}
                              disabled={deletingId === file.id}
                              style={{ ...btnStyle, background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5" }}
                            >
                              {deletingId === file.id ? "..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{ ...btnStyle, background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(file.id)}
                            style={{ ...btnStyle, background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Machines tab */}
      {activeTab === "machines" && (
        <div style={{
          background: "rgba(15,15,35,0.8)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>3D Model</th>
                <th style={thStyle}>Dimensions (L×W×H)</th>
                <th style={thStyle}>Linked Files</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {machines.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 14 }}>
                    No machines found. Upload .glb files to get started.
                  </td>
                </tr>
              )}
              {machines.map((machine) => {
                const linkedFiles = files.filter((f) => f.linked_machine_id === machine.id);
                return (
                  <tr key={machine.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={tdStyle}>
                      <span
                        onClick={() => navigate(`/machine/${machine.id}`)}
                        style={{ color: "#60a5fa", fontWeight: 500, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                      >
                        {machine.name}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>{machine.type || "—"}</span>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={machine.status || "Idle"} />
                    </td>
                    <td style={tdStyle}>
                      {machine.glb_model_ref ? (
                        <span style={{ color: "#22c55e", fontSize: 13 }}>Yes</span>
                      ) : (
                        <span style={{ color: "#475569", fontSize: 13 }}>None</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>
                        {machine.footprint_length && machine.footprint_width && machine.footprint_height
                          ? `${machine.footprint_length}×${machine.footprint_width}×${machine.footprint_height}`
                          : "—"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>
                        {linkedFiles.length > 0 ? `${linkedFiles.length} file(s)` : "—"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {confirmDelete === machine.id ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleDeleteMachine(machine)}
                            disabled={deletingId === machine.id}
                            style={{ ...btnStyle, background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5" }}
                          >
                            {deletingId === machine.id ? "..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            style={{ ...btnStyle, background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(machine.id)}
                          style={{ ...btnStyle, background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, padding: "14px 18px",
      background: "rgba(15,15,35,0.8)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FilterTag({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "#64748b",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      <span style={{
        background: active ? `${color}33` : "rgba(255,255,255,0.06)",
        padding: "1px 7px",
        borderRadius: 10,
        fontSize: 11,
      }}>
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }) {
  const colors = {
    Running: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
    Idle: { bg: "rgba(234,179,8,0.15)", text: "#facc15", border: "rgba(234,179,8,0.3)" },
    Alert: { bg: "rgba(239,68,68,0.15)", text: "#f87171", border: "rgba(239,68,68,0.3)" },
    Offline: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" },
  };
  const c = colors[status] || colors.Idle;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {status}
    </span>
  );
}

const thStyle = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "12px 16px",
  fontSize: 14,
  verticalAlign: "middle",
};

const btnStyle = {
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid",
  fontSize: 12,
  cursor: "pointer",
  transition: "all 0.15s",
};
