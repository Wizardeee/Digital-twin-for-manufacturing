import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { uploadAPI } from "../services/api";

export default function Upload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({
    floorPlan: null,
    machineSpecs: [],
    glbModels: [],
    productData: null,
  });
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = useCallback((category, fileList) => {
    if (category === "floorPlan" || category === "productData") {
      setFiles((prev) => ({ ...prev, [category]: fileList[0] || null }));
    } else {
      setFiles((prev) => ({ ...prev, [category]: Array.from(fileList) }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      if (files.floorPlan) formData.append("floorPlan", files.floorPlan);
      files.machineSpecs.forEach((f) => formData.append("machineSpecs", f));
      files.glbModels.forEach((f) => formData.append("glbModels", f));
      if (files.productData) formData.append("productData", files.productData);

      const res = await uploadAPI.uploadFiles("demo", formData);
      setResult(res);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const hasFiles = files.floorPlan || files.glbModels.length > 0 || files.machineSpecs.length > 0 || files.productData;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a1a", color: "#e2e8f0", padding: "56px 40px 40px", fontFamily: "'Inter', 'Segoe UI', sans-serif", maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600, color: "#f1f5f9" }}>Create Digital Twin</h1>
      <p style={{ margin: "0 0 32px 0", fontSize: 14, color: "#64748b" }}>
        Upload your factory data to generate a layout proposal
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 8, background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.3)", fontSize: 13 }}>
          <div style={{ color: "#4ade80", fontWeight: 600, marginBottom: 8 }}>Upload Complete</div>
          {result.results?.map((r, i) => (
            <div key={i} style={{ color: "#94a3b8", marginBottom: 4 }}>
              {r.filename}: {r.type} {r.message ? `— ${r.message}` : ""}
              {r.machine && <span style={{ color: "#a5b4fc" }}> → Created machine "{r.machine.name}"</span>}
              {r.note && <div style={{ color: "#818cf8", fontSize: 12, marginTop: 2 }}>{r.note}</div>}
            </div>
          ))}
          {result.message && <div style={{ color: "#94a3b8", marginTop: 8 }}>{result.message}</div>}
          <button onClick={() => navigate("/viewer")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(34, 197, 94, 0.4)", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", fontSize: 13, cursor: "pointer" }}>
            View in 3D Viewer →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <UploadSection title="Machine 3D Models" description=".glb files — each file becomes a machine in your factory" accept=".glb" multiple={true} files={files.glbModels} onChange={(e) => handleFileChange("glbModels", e.target.files)} />
        <UploadSection title="Floor Plan" description="PDF, DXF, or image (PNG/JPG) of your facility layout" accept=".pdf,.dxf,.png,.jpg,.jpeg" multiple={false} files={files.floorPlan} onChange={(e) => handleFileChange("floorPlan", e.target.files)} />
        <UploadSection title="Machine Specification Sheets" description="PDF, XLSX, or CSV with dimensions, power draw, clearance" accept=".pdf,.xlsx,.csv" multiple={true} files={files.machineSpecs} onChange={(e) => handleFileChange("machineSpecs", e.target.files)} />
        <UploadSection title="Product/Production Data" description="CSV or XLSX with process sequences, cycle times" accept=".csv,.xlsx" multiple={false} files={files.productData} onChange={(e) => handleFileChange("productData", e.target.files)} />

        <button
          type="submit"
          disabled={uploading || !hasFiles}
          style={{
            marginTop: 24, width: "100%", padding: "14px 24px", background: "#6366f1", border: "none", borderRadius: 10,
            color: "white", fontSize: 16, fontWeight: 600,
            cursor: uploading || !hasFiles ? "not-allowed" : "pointer", opacity: uploading || !hasFiles ? 0.5 : 1,
          }}
        >
          {uploading ? "Uploading & Extracting..." : "Upload & Generate Layout"}
        </button>
      </form>
    </div>
  );
}

function UploadSection({ title, description, accept, multiple, files, onChange }) {
  const fileCount = files ? (Array.isArray(files) ? files.length : 1) : 0;
  return (
    <div style={{ marginBottom: 24, padding: 24, borderRadius: 12, background: "rgba(15, 15, 35, 0.8)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <h3 style={{ margin: "0 0 4px 0", fontSize: 16, color: "#f1f5f9" }}>{title}</h3>
      <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#64748b" }}>{description}</p>
      <label style={{ display: "block", padding: 32, border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 8, textAlign: "center", cursor: "pointer", color: "#94a3b8", fontSize: 14 }}>
        {fileCount > 0 ? (
          <span style={{ color: "#22c55e" }}>{fileCount} file{fileCount > 1 ? "s" : ""} selected</span>
        ) : (
          <span>Click to select file{multiple ? "s" : ""}</span>
        )}
        <input type="file" accept={accept} multiple={multiple} onChange={onChange} style={{ display: "none" }} />
      </label>
    </div>
  );
}
