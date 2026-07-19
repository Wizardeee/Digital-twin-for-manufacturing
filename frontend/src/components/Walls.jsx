import { useMemo } from "react";
import * as THREE from "three";

const WALL_HEIGHT = 3.0;
const WALL_THICKNESS = 0.15;
const DOOR_HEIGHT = 2.2;
const DOOR_WIDTH = 1.0;

function WallSegment({ x1, z1, x2, z2, height = WALL_HEIGHT, color = "#e2e8f0" }) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;

  return (
    <group position={[cx, height / 2, cz]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[length, height, WALL_THICKNESS]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function RoomLabel({ x, z, text, width, depth }) {
  return null; // Labels rendered in 2D overlay
}

export default function Walls({ floorPlanData, wallHeight = WALL_HEIGHT }) {
  const { walls = [], rooms = [] } = floorPlanData || {};

  const wallElements = useMemo(() => {
    return walls.map((wall, i) => (
      <WallSegment
        key={`wall-${i}`}
        x1={wall.x1}
        z1={wall.z1}
        x2={wall.x2}
        z2={wall.z2}
        height={wallHeight}
      />
    ));
  }, [walls, wallHeight]);

  const roomFloorElements = useMemo(() => {
    return rooms
      .filter((r) => r.area > 2) // Only show rooms larger than 2 sq meters
      .map((room, i) => {
        const w = room.x2 - room.x1;
        const d = room.z2 - room.z1;
        const cx = (room.x1 + room.x2) / 2;
        const cz = (room.z1 + room.z2) / 2;

        return (
          <group key={`room-${i}`}>
            {/* Room floor (slightly raised) */}
            <mesh
              position={[cx, -0.79, cz]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial
                color="#1a1a2e"
                roughness={0.9}
                transparent
                opacity={0.5}
              />
            </mesh>
          </group>
        );
      });
  }, [rooms]);

  return (
    <group>
      {wallElements}
      {roomFloorElements}
    </group>
  );
}

export { WALL_HEIGHT, WALL_THICKNESS, DOOR_HEIGHT, DOOR_WIDTH };
