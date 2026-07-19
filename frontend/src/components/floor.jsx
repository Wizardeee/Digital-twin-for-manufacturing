import { useState, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

function loadTexture(url, onDone, onFail) {
  const isSvg = url.toLowerCase().endsWith(".svg");

  if (isSvg) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      onDone(tex);
    };
    img.onerror = onFail;
    img.src = url;
  } else {
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      onDone(tex);
    }, undefined, onFail);
  }
}

function Floor({ floorPlanUrl, widthMeters = 20, depthMeters = 15 }) {
  const { gl } = useThree();
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!floorPlanUrl) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    loadTexture(
      floorPlanUrl,
      (tex) => { if (!cancelled) setTexture(tex); },
      () => { if (!cancelled) setTexture(null); }
    );

    return () => { cancelled = true; };
  }, [floorPlanUrl, gl]);

  const w = Math.max(widthMeters, 1);
  const d = Math.max(depthMeters, 1);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]}>
      <planeGeometry args={[w, d]} />
      {texture ? (
        <meshStandardMaterial map={texture} color="#ffffff" transparent opacity={0.85} />
      ) : (
        <meshStandardMaterial color="#1e1e3a" />
      )}
    </mesh>
  );
}

export default Floor;
