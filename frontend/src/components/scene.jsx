import { useRef, useEffect, useCallback, Suspense, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import Floor from "./floor";
import Machine from "./Machine";
import Lights from "./lights";
import Walls from "./Walls";
import { OrbitControls, FirstPersonControls, Grid } from "@react-three/drei";
import * as THREE from "three";

const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersectPoint = new THREE.Vector3();
const _mouse = new THREE.Vector2();
const DRAG_THRESHOLD = 4;

function KeyForward() {
  const { camera } = useThree();
  const keys = useRef({});
  const speed = 12;

  useEffect(() => {
    const down = (e) => { keys.current[e.code] = true; };
    const up = (e) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(dir);
    right.crossVectors(dir, camera.up).normalize();
    dir.y = 0;
    dir.normalize();

    const boost = k.ShiftLeft || k.ShiftRight ? 2.5 : 1;
    const s = speed * boost * delta;

    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(dir, s);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(dir, -s);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -s);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, s);
    if (k.Space) camera.position.y += s;
    if (k.KeyC || k.ControlLeft) camera.position.y -= s;
  });

  return null;
}

export default function Scene({
  machines,
  selectedMachine,
  draggingId,
  collisionMap,
  onSelectMachine,
  onDragStart,
  onDragEnd,
  onDragMove,
  floorPlanUrl,
  factoryId,
  factoryWidth = 20,
  factoryDepth = 15,
  activeFloor = 1,
}) {
  const { camera, gl, scene } = useThree();
  const [flyMode, setFlyMode] = useState(false);
  const [floorPlanData, setFloorPlanData] = useState(null);
  const controlsRef = useRef();
  const dragRef = useRef(null);
  const machinesRef = useRef(machines);
  machinesRef.current = machines;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onSelectMachineRef = useRef(onSelectMachine);
  onSelectMachineRef.current = onSelectMachine;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        setFlyMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Fetch floor plan wall/room data
  useEffect(() => {
    if (!factoryId) return;
    fetch(`/api/v1/factories/${factoryId}/floor-plan-data`)
      .then((r) => r.json())
      .then(setFloorPlanData)
      .catch(() => {});
  }, [factoryId]);

  const getGroundPoint = useCallback(
    (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      _mouse.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      _raycaster.setFromCamera(_mouse, camera);
      _raycaster.ray.intersectPlane(_groundPlane, _intersectPoint);
      return _intersectPoint.clone();
    },
    [camera, gl]
  );

  useEffect(() => {
    const domElement = gl.domElement;

    const findMachineAtPointer = (e) => {
      const rect = domElement.getBoundingClientRect();
      _mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      _raycaster.setFromCamera(_mouse, cameraRef.current);

      const meshes = [];
      sceneRef.current.traverse((obj) => {
        if (obj.isMesh) meshes.push(obj);
      });

      if (meshes.length === 0) return null;

      const intersects = _raycaster.intersectObjects(meshes, false);
      if (intersects.length === 0) return null;

      const hitPoint = intersects[0].point;
      for (const m of machinesRef.current) {
        const [mx, , mz] = m.position;
        const dist = Math.sqrt((hitPoint.x - mx) ** 2 + (hitPoint.z - mz) ** 2);
        const fp = m.footprint || { length: 2, width: 2 };
        const maxDim = Math.max(fp.width, fp.length) / 2 + 0.5;
        if (dist < maxDim) return m.id;
      }
      return null;
    };

    const handlePointerDown = (e) => {
      if (e.button !== 0) return;
      const machineId = findMachineAtPointer(e);

      if (!machineId) {
        onSelectMachineRef.current(null);
        return;
      }

      e.stopImmediatePropagation();
      e.preventDefault();

      dragRef.current = {
        id: machineId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      };
    };

    const handlePointerMove = (e) => {
      if (!dragRef.current) return;

      if (!dragRef.current.moved) {
        const dx = e.clientX - dragRef.current.startClientX;
        const dy = e.clientY - dragRef.current.startClientY;
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        dragRef.current.moved = true;
        onDragStartRef.current(dragRef.current.id);
        if (controlsRef.current) controlsRef.current.enabled = false;
      }

      const point = getGroundPoint(e.clientX, e.clientY);
      onDragMoveRef.current(dragRef.current.id, [point.x, 0, point.z]);
    };

    const handlePointerUp = () => {
      if (!dragRef.current) return;
      const { id, moved } = dragRef.current;
      dragRef.current = null;

      if (!moved) {
        const machine = machinesRef.current.find((m) => m.id === id);
        if (machine) onSelectMachineRef.current(machine);
      } else {
        onDragEndRef.current(id);
      }
      if (controlsRef.current) controlsRef.current.enabled = true;
    };

    domElement.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      domElement.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [gl, getGroundPoint]);

  const gridExtent = Math.max(factoryWidth, factoryDepth) + 10;

  return (
    <>
      <Lights />
      <Grid
        args={[gridExtent, gridExtent]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#333355"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#444466"
        fadeDistance={gridExtent + 10}
        fadeStrength={1}
        infiniteGrid
      />
      <Floor floorPlanUrl={floorPlanUrl} widthMeters={factoryWidth} depthMeters={factoryDepth} />
      <Walls floorPlanData={floorPlanData} />
      {machines.map((machine) => (
        <Suspense key={machine.id} fallback={null}>
          <Machine
            machine={machine}
            isSelected={selectedMachine?.id === machine.id}
            isDragging={draggingId === machine.id}
            collisionMachines={collisionMap[machine.id] || []}
            onSelect={onSelectMachine}
            allMachines={machines}
          />
        </Suspense>
      ))}

      {flyMode ? (
        <>
          <FirstPersonControls
            makeDefault
            lookSpeed={0.5}
            movementSpeed={0}
            enabled
          />
          <KeyForward />
        </>
      ) : (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2}
          maxDistance={Math.max(factoryWidth, factoryDepth) * 2}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 0, 0]}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
        />
      )}
    </>
  );
}
