import { Canvas } from "@react-three/fiber";
import { useState, useEffect, useCallback, Suspense } from "react";
import Scene from "../components/scene";
import MachinePanel from "../components/MachinePanel";
import AIAssistant from "../components/AIAssistant";
import Layout2D from "../components/Layout2D";
import { useLayoutEditor } from "../hooks/useLayoutEditor";
import { machinesAPI, factoryAPI, simulationAPI, floorsAPI } from "../services/api";

const FACTORY_ID = "demo";

export default function FactoryViewer() {
  const [show2D, setShow2D] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [floors, setFloors] = useState([]);
  const [activeFloorNum, setActiveFloorNum] = useState(1);
  const [factoryWidth, setFactoryWidth] = useState(20);
  const [factoryDepth, setFactoryDepth] = useState(15);
  const [simStatus, setSimStatus] = useState(null);
  const [addingFloor, setAddingFloor] = useState(false);
  const factoryId = FACTORY_ID;

  const {
    machines,
    selectedMachine,
    setSelectedMachine,
    draggingId,
    collisionMap,
    fetchMachines,
    updateMachinePosition,
    updateMachineDimensions,
    handleDragStart,
    handleDragEnd,
  } = useLayoutEditor(factoryId);

  const fetchFloors = useCallback(async () => {
    try {
      const data = await floorsAPI.getAll(factoryId);
      setFloors(data);
    } catch (err) {
      console.error("[FactoryViewer] failed to load floors:", err);
    }
  }, [factoryId]);

  useEffect(() => {
    fetchMachines(activeFloorNum);
    fetchFloors();
    factoryAPI.getById(factoryId).then((factory) => {
      if (factory?.width_meters) setFactoryWidth(parseFloat(factory.width_meters));
      if (factory?.depth_meters) setFactoryDepth(parseFloat(factory.depth_meters));
    }).catch(() => {});

    const pollSim = setInterval(() => {
      simulationAPI.getStatus(factoryId).then(setSimStatus).catch(() => {});
    }, 5000);

    const onMachinesChanged = () => { fetchMachines(activeFloorNum); fetchFloors(); };
    window.addEventListener("machines-changed", onMachinesChanged);
    window.addEventListener("data-changed", onMachinesChanged);
    window.addEventListener("floors-changed", fetchFloors);

    return () => {
      clearInterval(pollSim);
      window.removeEventListener("machines-changed", onMachinesChanged);
      window.removeEventListener("data-changed", onMachinesChanged);
      window.removeEventListener("floors-changed", fetchFloors);
    };
  }, [fetchMachines, fetchFloors, factoryId, activeFloorNum]);

  const handleSelectMachine = useCallback(
    (machine) => setSelectedMachine(machine),
    [setSelectedMachine]
  );

  const handleMoveMachine = useCallback(
    (machineId, position) => updateMachinePosition(machineId, position),
    [updateMachinePosition]
  );

  const handleAddFloor = async () => {
    setAddingFloor(true);
    try {
      const newFloor = await floorsAPI.create(factoryId, {});
      setFloors((prev) => [...prev, newFloor].sort((a, b) => a.floor_number - b.floor_number));
      setActiveFloorNum(newFloor.floor_number);
      window.dispatchEvent(new CustomEvent("floors-changed"));
    } catch (err) {
      console.error("Failed to add floor:", err);
    }
    setAddingFloor(false);
  };

  const handleDeleteFloor = async (floor) => {
    if (!confirm(`Delete "${floor.name || `Floor ${floor.floor_number}`}"? Machines on this floor will be moved to Floor 1.`)) return;
    try {
      await floorsAPI.delete(factoryId, floor.id);
      if (activeFloorNum === floor.floor_number) {
        setActiveFloorNum(1);
      }
      fetchFloors();
      fetchMachines(activeFloorNum === floor.floor_number ? 1 : activeFloorNum);
      window.dispatchEvent(new CustomEvent("floors-changed"));
    } catch (err) {
      console.error("Failed to delete floor:", err);
    }
  };

  // Get the active floor's plan URL
  const activeFloor = floors.find((f) => f.floor_number === activeFloorNum);
  const floorPlanUrl = activeFloor?.floor_plan_ref ? `/uploads/${activeFloor.floor_plan_ref}` : null;

  const hasMachines = machines.length > 0;
  const hasFloorPlan = !!floorPlanUrl;
  const showViewer = hasMachines || hasFloorPlan;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#0a0a1a" }}>
      {showViewer ? (
        <Canvas camera={{ position: [0, 20, 15], fov: 50 }} style={{ width: "100%", height: "100%" }}>
          <color attach="background" args={["#0a0a1a"]} />
          <Suspense fallback={null}>
            <Scene
              machines={machines}
              selectedMachine={selectedMachine}
              draggingId={draggingId}
              collisionMap={collisionMap}
              onSelectMachine={handleSelectMachine}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragMove={handleMoveMachine}
              floorPlanUrl={floorPlanUrl}
              factoryId={factoryId}
              factoryWidth={factoryWidth}
              factoryDepth={factoryDepth}
              activeFloor={activeFloorNum}
            />
          </Suspense>
        </Canvas>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#64748b",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 48 }}>&#128230;</div>
          <div style={{ fontSize: 18, color: "#94a3b8" }}>No floor plan or machines uploaded yet</div>
          <div style={{ fontSize: 14 }}>
            Upload floor plans and .glb files on the{" "}
            <a href="/upload" style={{ color: "#6366f1" }}>Upload page</a>{" "}
            to see your factory here
          </div>
        </div>
      )}

      {/* Simulation status */}
      {hasMachines && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 16,
            background: "rgba(30, 30, 50, 0.85)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11,
            color: "#22c55e",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 50,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              animation: "pulse 2s infinite",
            }}
          />
          Simulation running
          {simStatus?.machines?.length > 0 && (
            <span style={{ color: "#64748b", marginLeft: 4 }}>
              | {simStatus.machines.length} machine{simStatus.machines.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* 2D/3D toggle */}
      {hasMachines && (
        <button
          onClick={() => setShow2D(!show2D)}
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: "rgba(30, 30, 50, 0.85)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: 8,
            padding: "6px 14px",
            color: show2D ? "#e2e8f0" : "#94a3b8",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {show2D ? "3D View" : "2D View"}
        </button>
      )}

      {/* Floor selector */}
      {hasMachines && (
        <div style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 4,
          background: "rgba(30, 30, 50, 0.85)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: 8,
          padding: 4,
          alignItems: "center",
        }}>
          {floors.map((floor) => (
            <div
              key={floor.floor_number}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                background: activeFloorNum === floor.floor_number ? "rgba(99, 102, 241, 0.3)" : "transparent",
                border: activeFloorNum === floor.floor_number ? "1px solid rgba(99, 102, 241, 0.5)" : "1px solid transparent",
                borderRadius: 6,
                padding: "2px 4px 2px 8px",
              }}
            >
              <button
                onClick={() => setActiveFloorNum(floor.floor_number)}
                title={`${floor.name}${floor.floor_plan_ref ? ' (has floor plan)' : ' (blank)'}`}
                style={{
                  background: "transparent",
                  border: "none",
                  color: activeFloorNum === floor.floor_number ? "#a5b4fc" : "#64748b",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                {floor.name || `F${floor.floor_number}`}
                {floor.floor_plan_ref && (
                  <span style={{ fontSize: 8, color: "#22c55e", marginLeft: 4 }}>&#9679;</span>
                )}
              </button>
              {floors.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFloor(floor); }}
                  title={`Delete ${floor.name || `Floor ${floor.floor_number}`}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ef4444",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                    opacity: 0.5,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleAddFloor}
            disabled={addingFloor}
            style={{
              background: "transparent",
              border: "1px dashed rgba(148, 163, 184, 0.3)",
              color: "#64748b",
              fontSize: 11,
              cursor: addingFloor ? "wait" : "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              marginLeft: 4,
            }}
            title="Add new floor"
          >
            + Add Floor
          </button>
        </div>
      )}

      {/* Machine info panel (right side) */}
      {hasMachines && selectedMachine && (
        <MachinePanel
          machine={selectedMachine}
          onClose={() => setSelectedMachine(null)}
          onUpdateDimensions={(footprint) => {
            if (selectedMachine) {
              updateMachineDimensions(selectedMachine.id, footprint);
              machinesAPI.updateFootprint(factoryId, selectedMachine.id, footprint);
            }
          }}
          onUpdateSpecs={(machineId, specs) => {
            machinesAPI.updateSpecs(factoryId, machineId, specs);
          }}
          onDelete={async (machine) => {
            await machinesAPI.delete(factoryId, machine.id);
            setSelectedMachine(null);
            window.dispatchEvent(new CustomEvent("machines-changed"));
          }}
        />
      )}

      {/* AI Assistant button + chatbox */}
      {hasMachines && (
        <>
          <button
            onClick={() => setShowAI(!showAI)}
            style={{
              position: "absolute",
              top: 56,
              right: 16,
              background: showAI ? "rgba(148, 163, 184, 0.2)" : "rgba(30, 30, 50, 0.85)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: 8,
              padding: "6px 14px",
              color: "#94a3b8",
              fontSize: 12,
              cursor: "pointer",
              zIndex: 50,
            }}
          >
            AI Assistant
          </button>
          {showAI && (
            <div
              style={{
                position: "absolute",
                top: 96,
                right: 16,
                width: 340,
                maxHeight: "calc(100vh - 130px)",
                zIndex: 50,
              }}
            >
              <AIAssistant factoryId={factoryId} />
            </div>
          )}
        </>
      )}

      {/* 2D Layout panel */}
      {show2D && hasMachines && (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 16,
            width: 360,
            maxHeight: "calc(100vh - 80px)",
            background: "rgba(15, 15, 35, 0.95)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: 16,
            overflow: "auto",
            zIndex: 40,
          }}
        >
          <Layout2D
            machines={machines}
            selectedMachine={selectedMachine}
            onSelectMachine={handleSelectMachine}
            onMoveMachine={handleMoveMachine}
            collisionMap={collisionMap}
            floorPlanUrl={floorPlanUrl}
            factoryWidth={factoryWidth}
            factoryDepth={factoryDepth}
          />
        </div>
      )}

      {/* Controls hint */}
      {hasMachines && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            background: "rgba(30, 30, 50, 0.75)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          <div><b style={{ color: "#94a3b8" }}>Click</b> machine — Select</div>
          <div><b style={{ color: "#94a3b8" }}>Drag</b> machine — Move</div>
          <div><b style={{ color: "#94a3b8" }}>Right drag</b> — Orbit</div>
          <div><b style={{ color: "#94a3b8" }}>Scroll</b> — Zoom</div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4, paddingTop: 4 }}>
            <div><b style={{ color: "#6366f1" }}>Tab</b> — Toggle fly-through</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
