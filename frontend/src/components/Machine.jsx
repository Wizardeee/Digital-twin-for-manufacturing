import { useRef, useState, useMemo, Component } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const _tempVec = new THREE.Vector3();

const STATUS_COLORS = {
  Running: "#22c55e",
  Idle: "#eab308",
  Alert: "#ef4444",
  Offline: "#6b7280",
};

function MachineFallback({ machine, isSelected, isDragging, hasCollision, onSelect, collisionMachines, allMachines }) {
  const group = useRef();
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (!group.current) return;
    const t = isDragging ? 1.02 : isSelected ? 1.01 : hovered ? 1.005 : 1;
    _tempVec.set(t, t, t);
    group.current.scale.lerp(_tempVec, 0.1);
  });

  const color = isDragging
    ? "#3b82f6"
    : isSelected
    ? "#60a5fa"
    : hovered
    ? "#818cf8"
    : STATUS_COLORS[machine.status] || "#f97316";

  const fp = machine.footprint || { length: 2, width: 2, height: 1.05 };
  const len = Math.max(fp.length, 0.5);
  const wid = Math.max(fp.width, 0.5);
  // Machine height: use actual height if set, otherwise default to 35% of wall height (1.05m for 3m walls)
  const WALL_HEIGHT = 3.0;
  const hgt = Math.max(fp.height || WALL_HEIGHT * 0.35, 0.3);

  const overlapBoxes = useMemo(() => {
    if (!hasCollision || !collisionMachines?.length || !allMachines) return [];
    const myX = machine.position[0];
    const myZ = machine.position[2];
    const myHalfW = wid / 2;
    const myHalfD = len / 2;
    const results = [];
    for (const cId of collisionMachines) {
      const other = allMachines.find((m) => m.id === cId);
      if (!other) continue;
      const ofp = other.footprint || { length: 2, width: 2 };
      const oWid = Math.max(ofp.width, 0.5);
      const oLen = Math.max(ofp.length, 0.5);
      const oX = other.position[0];
      const oZ = other.position[2];
      const oHalfW = oWid / 2;
      const oHalfD = oLen / 2;
      const overlapMinX = Math.max(myX - myHalfW, oX - oHalfW);
      const overlapMaxX = Math.min(myX + myHalfW, oX + oHalfW);
      const overlapMinZ = Math.max(myZ - myHalfD, oZ - oHalfD);
      const overlapMaxZ = Math.min(myZ + myHalfD, oZ + oHalfD);
      if (overlapMinX < overlapMaxX && overlapMinZ < overlapMaxZ) {
        const cx = (overlapMinX + overlapMaxX) / 2;
        const cz = (overlapMinZ + overlapMaxZ) / 2;
        const cw = overlapMaxX - overlapMinX;
        const cd = overlapMaxZ - overlapMinZ;
        results.push({ cx, cz, cw, cd });
      }
    }
    return results;
  }, [hasCollision, collisionMachines, allMachines, machine.position, wid, len]);

  return (
    <group
      ref={group}
      position={machine.position}
      rotation={machine.rotation || [0, 0, 0]}
    >
      <mesh position={[0, hgt / 2, 0]} onClick={(e) => { e.stopPropagation(); onSelect(machine); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}>
        <boxGeometry args={[wid, hgt, len]} />
        <meshStandardMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, hgt / 2, 0]}>
        <boxGeometry args={[wid + 0.02, hgt + 0.02, len + 0.02]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      {overlapBoxes.map((ov, i) => (
        <mesh key={i} position={[ov.cx - machine.position[0], hgt / 2, ov.cz - machine.position[2]]}>
          <boxGeometry args={[ov.cw, hgt + 0.1, ov.cd]} />
          <meshBasicMaterial color="#ff0000" transparent opacity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function MachineGLB({ machine, isSelected, isDragging, hasCollision, onSelect, collisionMachines, allMachines }) {
  const { scene } = useGLTF(machine.glbModel);
  const group = useRef();
  const [hovered, setHovered] = useState(false);

  const modelSize = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    return size;
  }, [scene]);

  const fp = machine.footprint || { length: 2, width: 2, height: 2 };

  const scaleVec = useMemo(() => {
    const sx = modelSize.x > 0 ? fp.length / modelSize.x : 1;
    const sy = modelSize.y > 0 ? fp.height / modelSize.y : 1;
    const sz = modelSize.z > 0 ? fp.width / modelSize.z : 1;
    return [sx, sy, sz];
  }, [modelSize, fp.width, fp.height, fp.length]);

  useFrame(() => {
    if (!group.current) return;
    const t = isDragging ? 1.02 : isSelected ? 1.01 : hovered ? 1.005 : 1;
    group.current.scale.set(scaleVec[0] * t, scaleVec[1] * t, scaleVec[2] * t);
  });

  const scaledHeight = scaleVec[1] * modelSize.y;

  return (
    <group
      ref={group}
      position={[machine.position[0], scaledHeight / 2, machine.position[2]]}
      rotation={machine.rotation || [0, 0, 0]}
      scale={scaleVec}
    >
      <primitive object={scene} onClick={(e) => { e.stopPropagation(); onSelect(machine); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }} />
    </group>
  );
}

class GLBErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function Machine({ machine, isSelected, isDragging, collisionMachines, onSelect, allMachines }) {
  const hasCollision = collisionMachines && collisionMachines.length > 0;

  const fallback = (
    <MachineFallback
      machine={machine}
      isSelected={isSelected}
      isDragging={isDragging}
      onSelect={onSelect}
      hasCollision={hasCollision}
      collisionMachines={collisionMachines}
      allMachines={allMachines}
    />
  );

  if (!machine.glbModel) return fallback;

  return (
    <GLBErrorBoundary fallback={fallback}>
      <MachineGLB
        machine={machine}
        isSelected={isSelected}
        isDragging={isDragging}
        onSelect={onSelect}
        hasCollision={hasCollision}
        collisionMachines={collisionMachines}
        allMachines={allMachines}
      />
    </GLBErrorBoundary>
  );
}

export default Machine;
