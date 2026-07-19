import { useRef, useEffect, useCallback, useState } from "react";

const STATUS_COLORS = {
  Running: "#22c55e",
  Idle: "#eab308",
  Alert: "#ef4444",
  Offline: "#6b7280",
};

export default function Layout2D({
  machines,
  selectedMachine,
  onSelectMachine,
  onMoveMachine,
  collisionMap,
  floorPlanUrl,
  factoryWidth = 20,
  factoryDepth = 15,
}) {
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const dragOffset = useRef({ x: 0, z: 0 });
  const [floorImg, setFloorImg] = useState(null);

  const boundary = {
    minX: -factoryWidth / 2,
    maxX: factoryWidth / 2,
    minZ: -factoryDepth / 2,
    maxZ: factoryDepth / 2,
  };

  const padding = 40;
  const canvasW = (boundary.maxX - boundary.minX) * 20 + padding * 2;
  const canvasH = (boundary.maxZ - boundary.minZ) * 20 + padding * 2;
  const scale = Math.min(
    (canvasW - padding * 2) / factoryWidth,
    (canvasH - padding * 2) / factoryDepth
  );

  const toCanvas = useCallback(
    (x, z) => ({
      cx: (x - boundary.minX) * scale + padding,
      cy: (z - boundary.minZ) * scale + padding,
    }),
    [boundary, scale]
  );

  const fromCanvas = useCallback(
    (cx, cy) => ({
      x: (cx - padding) / scale + boundary.minX,
      z: (cy - padding) / scale + boundary.minZ,
    }),
    [boundary, scale]
  );

  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      cx: (e.clientX - rect.left) * scaleX,
      cy: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // Load floor plan image
  useEffect(() => {
    if (!floorPlanUrl) { setFloorImg(null); return; }
    const img = new Image();
    img.onload = () => setFloorImg(img);
    img.onerror = () => setFloorImg(null);
    img.src = floorPlanUrl;
  }, [floorPlanUrl]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Background
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Floor plan image
    if (floorImg) {
      const bTL = toCanvas(boundary.minX, boundary.minZ);
      const bBR = toCanvas(boundary.maxX, boundary.maxZ);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(floorImg, bTL.cx, bTL.cy, bBR.cx - bTL.cx, bBR.cy - bTL.cy);
      ctx.globalAlpha = 1;
    }

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = boundary.minX; x <= boundary.maxX; x++) {
      const { cx } = toCanvas(x, 0);
      ctx.beginPath();
      ctx.moveTo(cx, padding);
      ctx.lineTo(cx, canvasH - padding);
      ctx.stroke();
    }
    for (let z = boundary.minZ; z <= boundary.maxZ; z++) {
      const { cy } = toCanvas(0, z);
      ctx.beginPath();
      ctx.moveTo(padding, cy);
      ctx.lineTo(canvasW - padding, cy);
      ctx.stroke();
    }

    // Boundary
    const bTL = toCanvas(boundary.minX, boundary.minZ);
    const bBR = toCanvas(boundary.maxX, boundary.maxZ);
    ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(bTL.cx, bTL.cy, bBR.cx - bTL.cx, bBR.cy - bTL.cy);
    ctx.setLineDash([]);

    // Dimension labels
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${factoryWidth}m`, canvasW / 2, bTL.cy - 6);
    ctx.save();
    ctx.translate(bTL.cx - 8, canvasH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${factoryDepth}m`, 0, 0);
    ctx.restore();

    // Machines
    for (const machine of machines) {
      const pos = toCanvas(machine.position[0], machine.position[2]);
      const fp = machine.footprint || { length: 2, width: 2 };
      const w = fp.width * scale;
      const h = fp.length * scale;
      const isSelected = selectedMachine?.id === machine.id;
      const hasCollision = collisionMap[machine.id]?.length > 0;

      if (hasCollision) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
        ctx.fillRect(pos.cx - w / 2 - 4, pos.cy - h / 2 - 4, w + 8, h + 8);
      }

      const color = hasCollision
        ? "#ef4444"
        : STATUS_COLORS[machine.status] || "#f97316";
      ctx.fillStyle = `${color}40`;
      ctx.strokeStyle = isSelected ? "#60a5fa" : color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.fillRect(pos.cx - w / 2, pos.cy - h / 2, w, h);
      ctx.strokeRect(pos.cx - w / 2, pos.cy - h / 2, w, h);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(machine.name, pos.cx, pos.cy + 3);
    }
  }, [machines, selectedMachine, collisionMap, boundary, floorImg, canvasW, canvasH, scale, factoryWidth, factoryDepth, toCanvas]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragging.current) return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const world = fromCanvas(coords.cx, coords.cy);

      const newX = Math.round((world.x - dragOffset.current.x) * 10) / 10;
      const newZ = Math.round((world.z - dragOffset.current.z) * 10) / 10;

      onMoveMachine(dragging.current, [newX, 0, newZ]);
    };

    const handleMouseUp = () => {
      dragging.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [fromCanvas, getCanvasCoords, onMoveMachine]);

  const handleMouseDown = useCallback(
    (e) => {
      e.stopPropagation();
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const world = fromCanvas(coords.cx, coords.cy);

      for (const machine of machines) {
        const fp = machine.footprint || { length: 2, width: 2 };
        const dx = Math.abs(world.x - machine.position[0]);
        const dz = Math.abs(world.z - machine.position[2]);
        if (dx < fp.width / 2 + 0.3 && dz < fp.length / 2 + 0.3) {
          dragging.current = machine.id;
          dragOffset.current = {
            x: world.x - machine.position[0],
            z: world.z - machine.position[2],
          };
          onSelectMachine(machine);
          return;
        }
      }
      onSelectMachine(null);
    },
    [machines, fromCanvas, getCanvasCoords, onSelectMachine]
  );

  return (
    <div
      style={{
        background: "rgba(15, 15, 35, 0.95)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          fontSize: 13,
          color: "#94a3b8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>2D Layout View</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {factoryWidth}m × {factoryDepth}m · Drag machines to reposition
        </span>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        style={{
          display: "block",
          width: "100%",
          cursor: "crosshair",
        }}
      />
    </div>
  );
}
