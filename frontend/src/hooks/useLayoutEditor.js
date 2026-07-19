import { useState, useCallback } from "react";
import { auth } from "../config/firebase";

const API_BASE = "/api/v1";
const FACTORY_ID_MAP = {
  demo: "550e8400-e29b-41d4-a716-446655440001",
};

function resolveFactoryId(id) {
  return FACTORY_ID_MAP[id] || id;
}

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  let token = null;
  if (auth.currentUser) {
    try { token = await auth.currentUser.getIdToken(); } catch { /* dev */ }
  }
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else headers["Authorization"] = "Bearer dev-token";
  const config = { ...options, headers };
  if (config.body && typeof config.body === "object") {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function getMachineBounds(machine) {
  const fp = machine.footprint || { length: 2, width: 2 };
  const cl = machine.clearance || { front: 0.5, back: 0.5, left: 0.5, right: 0.5 };
  const x = machine.position[0];
  const z = machine.position[2];
  const halfW = (cl.left + cl.right + fp.width) / 2;
  const halfD = (cl.front + cl.back + fp.length) / 2;
  return {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
}

function checkOverlap(a, b) {
  const boundsA = getMachineBounds(a);
  const boundsB = getMachineBounds(b);
  return (
    boundsA.minX < boundsB.maxX &&
    boundsA.maxX > boundsB.minX &&
    boundsA.minZ < boundsB.maxZ &&
    boundsA.maxZ > boundsB.minZ
  );
}

export function useLayoutEditor(factoryId) {
  const [layout, setLayout] = useState(null);
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [collisionMap, setCollisionMap] = useState({});
  const [layoutStatus, setLayoutStatus] = useState("none");

  const fetchMachines = useCallback(async (floorLevel) => {
    if (!factoryId) return;
    try {
      const resolvedId = resolveFactoryId(factoryId);
      const qs = floorLevel != null ? `?floor_level=${floorLevel}` : "";
      const data = await apiFetch(`/factory/${resolvedId}/machines${qs}`);

      const machineList = data
        .map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          position: [
            m.placement_x != null ? parseFloat(m.placement_x) : null,
            0,
            m.placement_z != null ? parseFloat(m.placement_z) : null,
          ],
          rotation: [0, m.placement_rotation_y != null ? parseFloat(m.placement_rotation_y) : 0, 0],
          footprint: {
            length: parseFloat(m.footprint_length) || 1,
            width: parseFloat(m.footprint_width) || 1,
            height: parseFloat(m.footprint_height) || 1,
          },
          clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 },
          glbModel: m.glb_model_ref ? `/uploads/${m.glb_model_ref}` : null,
          status: m.status || "Idle",
          manufacturer: m.manufacturer,
        }));

      const hasAnyPlacement = machineList.some((m) => m.position[0] !== null);
      if (!hasAnyPlacement) {
        machineList.forEach((m, i) => {
          m.position = [(i - (machineList.length - 1) / 2) * 3, 0, 0];
        });
      } else {
        machineList.forEach((m) => {
          if (m.position[0] === null) m.position[0] = 0;
          if (m.position[2] === null) m.position[2] = 0;
        });
      }

      setMachines(machineList);
    } catch {
      setMachines([]);
    }
  }, [factoryId]);

  const updateMachinePosition = useCallback((machineId, newPosition) => {
    setMachines((prev) => {
      const updated = prev.map((m) =>
        m.id === machineId ? { ...m, position: newPosition } : m
      );

      const moved = updated.find((m) => m.id === machineId);
      if (moved) {
        const collisions = updated.filter(
          (m) => m.id !== machineId && checkOverlap(moved, m)
        );

        setCollisionMap((prevMap) => {
          const newMap = { ...prevMap };
          for (const key of Object.keys(newMap)) {
            newMap[key] = newMap[key].filter((id) => id !== machineId);
          }
          newMap[machineId] = collisions.map((c) => c.id);
          for (const c of collisions) {
            if (!newMap[c.id]) newMap[c.id] = [];
            if (!newMap[c.id].includes(machineId)) {
              newMap[c.id] = [...newMap[c.id], machineId];
            }
          }
          return newMap;
        });
      }

      return updated;
    });
  }, []);

  const updateMachineDimensions = useCallback((machineId, newFootprint) => {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId ? { ...m, footprint: newFootprint } : m
      )
    );
  }, []);

  const handleDragStart = useCallback((machineId) => {
    setDraggingId(machineId);
  }, []);

  const handleDragEnd = useCallback((machineId) => {
    setDraggingId(null);
    setMachines((prev) => {
      const moved = prev.find((m) => m.id === machineId);
      if (moved && factoryId) {
        const resolvedId = resolveFactoryId(factoryId);
        apiFetch(`/factories/${resolvedId}/placements`, {
          method: "PUT",
          body: {
            placements: [{
              machineId: moved.id,
              x: moved.position[0],
              z: moved.position[2],
              rotationY: moved.rotation?.[1] || 0,
            }],
          },
        }).catch(() => {});
      }
      return prev;
    });
  }, [factoryId]);

  const proposeLayout = useCallback(async () => {
    if (!factoryId) return;
    try {
      const resolvedId = resolveFactoryId(factoryId);
      const data = await apiFetch(`/factory/${resolvedId}/layout/propose`, {
        method: "POST",
        body: { boundary: { minX: -15, maxX: 15, minZ: -15, maxZ: 15 } },
      });

      if (data.placements) {
        const layoutMachines = machines.map((m) => {
          const placement = data.placements.find((p) => p.machineId === m.id);
          if (placement) {
            return { ...m, position: [parseFloat(placement.x), 0, parseFloat(placement.z)] };
          }
          return m;
        });
        setMachines(layoutMachines);
        setLayout(data.layout);
        setLayoutStatus("proposed");
      }
    } catch {
      setLayoutStatus("none");
    }
  }, [factoryId, machines]);

  const confirmLayout = useCallback(async () => {
    setLayoutStatus("confirmed");
    setCollisionMap({});
  }, []);

  const resetPositions = useCallback(() => {
    setMachines((prev) => {
      const updated = prev.map((m, i) => ({ ...m, position: [(i - (prev.length - 1) / 2) * 3, 0, 0] }));
      if (factoryId) {
        const resolvedId = resolveFactoryId(factoryId);
        apiFetch(`/factories/${resolvedId}/placements`, {
          method: "PUT",
          body: {
            placements: updated.map((m) => ({
              machineId: m.id,
              x: m.position[0],
              z: m.position[2],
              rotationY: 0,
            })),
          },
        }).catch(() => {});
      }
      return updated;
    });
    setCollisionMap({});
    setLayoutStatus("none");
  }, [factoryId]);

  return {
    layout,
    machines,
    selectedMachine,
    setSelectedMachine,
    draggingId,
    collisionMap,
    layoutStatus,
    fetchMachines,
    updateMachinePosition,
    updateMachineDimensions,
    handleDragStart,
    handleDragEnd,
    proposeLayout,
    confirmLayout,
    resetPositions,
  };
}
